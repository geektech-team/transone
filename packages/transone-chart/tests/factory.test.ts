import { describe, expect, test } from 'bun:test';
import { LineChart } from '../lib/charts/line';
import { BarChart } from '../lib/charts/bar';
import { PieChart } from '../lib/charts/pie';
import { RadarChart } from '../lib/charts/radar';
import { ChartBase } from '../lib/core/chart';
import {
  createChart,
  createMiniProgramChart,
  createWebChart,
} from '../lib/factory';
import { resolveMiniProgramCanvas } from '../lib/adapters/miniprogram';
import type { ChartRenderContext } from '../lib/types';
import { MockCanvas } from './mock-canvas';

function makeContext(canvas: MockCanvas): ChartRenderContext {
  return { ctx: canvas, width: 400, height: 300, dpr: 1 };
}

describe('createChart', () => {
  test('按 type 分发到对应图表类', () => {
    const canvas = new MockCanvas();
    expect(createChart(makeContext(canvas), { type: 'line', xAxis: { labels: [] }, series: [] })).toBeInstanceOf(LineChart);
    expect(createChart(makeContext(canvas), { type: 'bar', xAxis: { labels: [] }, series: [] })).toBeInstanceOf(BarChart);
    expect(createChart(makeContext(canvas), { type: 'pie', data: [] })).toBeInstanceOf(PieChart);
    expect(createChart(makeContext(canvas), { type: 'radar', indicators: [], series: [] })).toBeInstanceOf(RadarChart);
  });

  test('所有实例均为 ChartBase', () => {
    const canvas = new MockCanvas();
    for (const option of [
      { type: 'line', xAxis: { labels: [] }, series: [] },
      { type: 'bar', xAxis: { labels: [] }, series: [] },
      { type: 'pie', data: [] },
      { type: 'radar', indicators: [], series: [] },
    ] as const) {
      const chart = createChart(
        makeContext(canvas),
        option as never
      );
      expect(chart).toBeInstanceOf(ChartBase);
    }
  });

  test('非法 type 抛错', () => {
    const canvas = new MockCanvas();
    expect(() =>
      createChart(makeContext(canvas), {
        type: 'scatter',
      } as never)
    ).toThrow(/unsupported chart type/);
  });
});

describe('createWebChart', () => {
  test('从 HTMLCanvasElement 创建并渲染', () => {
    const ctx = new MockCanvas();
    const canvas = {
      clientWidth: 400,
      clientHeight: 300,
      width: 0,
      height: 0,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;

    const chart = createWebChart(canvas, {
      type: 'line',
      xAxis: { labels: ['A', 'B'] },
      series: [{ data: [1, 2] }],
    });

    expect(chart).toBeInstanceOf(LineChart);
    expect(() => chart.render()).not.toThrow();
    // 物理尺寸 = 逻辑 × dpr(1)
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(300);
    // 渲染管线已执行：clearRect + 折线绘制（moveTo 至少含折线起点）
    expect(ctx.of('clearRect').length).toBe(1);
    const moveTo = ctx.of('moveTo');
    expect(moveTo.length).toBeGreaterThanOrEqual(2);
    // 最后一条 moveTo 是折线起点
    expect((moveTo[moveTo.length - 1] as number[]).length).toBe(2);
  });
});

describe('createMiniProgramChart', () => {
  test('从 Canvas 2D 节点创建并渲染', () => {
    const ctx = new MockCanvas();
    const node = {
      width: 400,
      height: 300,
      getContext: () => ctx,
    };

    const chart = createMiniProgramChart(node, {
      type: 'pie',
      data: [{ name: 'A', value: 100 }],
      legend: { show: false },
    });

    expect(chart).toBeInstanceOf(PieChart);
    expect(() => chart.render()).not.toThrow();
    expect(ctx.of('arc').length).toBe(1);
  });
});

describe('resolveMiniProgramCanvas', () => {
  test('节点尺寸与像素比进入渲染上下文', () => {
    const ctx = new MockCanvas();
    const context = resolveMiniProgramCanvas(
      { width: 320, height: 200, getContext: () => ctx },
      { dpr: 2 }
    );
    expect(context.width).toBe(320);
    expect(context.height).toBe(200);
    expect(context.dpr).toBe(2);
    expect(context.ctx).toBe(ctx);
  });
});
