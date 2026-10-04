import { afterEach, describe, expect, test } from 'bun:test';
import { TcChart } from '../lib/component';
import { FunnelChart } from '../lib/charts/funnel';
import { GaugeChart } from '../lib/charts/gauge';
import { ScatterChart } from '../lib/charts/scatter';
import type { ChartOption } from '../lib/types';
import type { ChartRenderContext } from '../lib/types';
import { MockCanvas } from './mock-canvas';

class ChartUpdateHarness extends TcChart {
  public applyOption(option?: ChartOption): void {
    if (option) this.setProps({ option });
    super.onUpdated();
    super.onPropsChange();
  }
  public applyPropsHook(option?: ChartOption): void {
    if (option) this.setProps({ option });
    super.onPropsChange();
  }
}

describe('TcChart 小程序生命周期', () => {
  const originalWx = Reflect.get(globalThis, 'wx');

  afterEach(() => {
    if (originalWx === undefined) {
      Reflect.deleteProperty(globalThis, 'wx');
    } else {
      Reflect.set(globalThis, 'wx', originalWx);
    }
  });

  test('小程序编译丢失类字段初始化时不访问 Web hoverHandlers', () => {
    Reflect.set(globalThis, 'wx', {});
    const chart = Object.create(TcChart.prototype) as {
      setupHoverEvents(): void;
    };

    expect(() => chart.setupHoverEvents()).not.toThrow();
  });

  test('切换图表类型重建策略并销毁旧实例，同类型数据更新复用实例', async () => {
    const canvas = new MockCanvas();
    const component = new ChartUpdateHarness({
      option: { type: 'line', xAxis: { labels: [] }, series: [] },
      resolve: () => ({ ctx: canvas, width: 400, height: 300, dpr: 1 }),
    });
    component.applyOption();
    await Promise.resolve();
    const line = component.getChart();
    component.applyOption({
      type: 'funnel',
      data: [{ name: '访问', value: 100 }],
    });
    await Promise.resolve();
    const funnel = component.getChart();
    expect(funnel).toBeInstanceOf(FunnelChart);
    expect(line?.isDestroyed()).toBe(true);
    component.applyOption({
      type: 'funnel',
      data: [{ name: '成交', value: 20 }],
    });
    expect(component.getChart()).toBe(funnel);
    expect(canvas.of('fillText').map((args) => args[0])).toContain('成交: 20');
    component.applyOption({ type: 'gauge', value: 70 });
    await Promise.resolve();
    expect(component.getChart()).toBeInstanceOf(GaugeChart);
    expect(funnel?.isDestroyed()).toBe(true);
    component.applyOption({ type: 'scatter', series: [] });
    await Promise.resolve();
    expect(component.getChart()).toBeInstanceOf(ScatterChart);
  });

  test('组件宿主填满父容器，为 Canvas 提供可解析尺寸', () => {
    const chart = new TcChart({
      option: { type: 'radar', indicators: [], series: [] },
    });
    const styles = (
      chart as unknown as {
        styleManager: { styles: Map<string, unknown> };
      }
    ).styleManager.styles;

    expect(styles.get('tc-chart-host')).toEqual({
      selector: ':host',
      properties: {
        display: 'block',
        height: '100%',
        width: '100%',
      },
    });
  });

  test('连续异步切换图种丢弃旧画布解析结果', async () => {
    const canvas = new MockCanvas();
    const pending: Array<(context: ChartRenderContext) => void> = [];
    const component = new ChartUpdateHarness({
      option: { type: 'line', xAxis: { labels: [] }, series: [] },
      resolve: () =>
        new Promise<ChartRenderContext>((resolve) => pending.push(resolve)),
    });
    component.applyOption();
    pending[0]({ ctx: canvas, width: 400, height: 300, dpr: 1 });
    await Promise.resolve();
    component.applyOption({ type: 'funnel', data: [] });
    component.applyOption({ type: 'scatter', series: [] });
    pending[2]({ ctx: canvas, width: 600, height: 300, dpr: 1 });
    await Promise.resolve();
    const latest = component.getChart();
    pending[1]({ ctx: canvas, width: 400, height: 300, dpr: 1 });
    await Promise.resolve();
    expect(component.getChart() === latest).toBe(true);
    expect(canvas.of('clearRect').map((args) => args[2])).toEqual([400, 600]);
  });

  test('小程序属性更新钩子创建并切换图表策略', async () => {
    const component = new ChartUpdateHarness({
      option: { type: 'funnel', data: [] },
      resolve: () => ({
        ctx: new MockCanvas(),
        width: 400,
        height: 300,
        dpr: 1,
      }),
    });
    component.applyPropsHook();
    await Promise.resolve();
    expect(component.getChart()).toBeInstanceOf(FunnelChart);
    component.applyPropsHook({ type: 'gauge', value: 50 });
    await Promise.resolve();
    expect(component.getChart()).toBeInstanceOf(GaugeChart);
  });
});
