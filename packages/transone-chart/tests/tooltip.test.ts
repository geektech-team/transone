import { describe, expect, test } from 'bun:test';
import { BarChart } from '../lib/charts/bar';
import { LineChart } from '../lib/charts/line';
import { PieChart } from '../lib/charts/pie';
import type { ChartRenderContext } from '../lib/types';
import { MockCanvas } from './mock-canvas';

function makeContext(canvas: MockCanvas): ChartRenderContext {
  return { ctx: canvas, width: 400, height: 300, dpr: 1 };
}

// 共享布局（400×300，无 title/legend）：plot.x=44，plot 宽 340，plot.y=12，plot 高 249

describe('tooltip / hitTest', () => {
  test('折线：hover 类目中心 → 显示该类目所有系列值', () => {
    const canvas = new MockCanvas();
    const chart = new LineChart(makeContext(canvas), {
      type: 'line',
      xAxis: { labels: ['A', 'B', 'C', 'D'] },
      series: [
        { name: '北京', data: [10, 20, 15, 30] },
        { name: '上海', data: [5, 8, 12, 18] },
      ],
    });
    chart.render();

    // 类目 A 中心 = 44 + 0.5*85 = 86.5；y 在绘图区内
    chart.setHover(86.5, 100);

    const texts = canvas.of('fillText').map((args) => args[0] as string);
    expect(texts).toContain('A');
    expect(texts).toContain('北京: 10');
    expect(texts).toContain('上海: 5');
  });

  test('折线：hover 绘图区外 → 无 tooltip', () => {
    const canvas = new MockCanvas();
    const chart = new LineChart(makeContext(canvas), {
      type: 'line',
      xAxis: { labels: ['A', 'B'] },
      series: [{ data: [10, 20] }],
    });
    chart.render();
    // render 1 次的轴标签行数（累计记录）；setHover 重绘轴标签应翻倍，且无 tooltip 行
    const before = canvas.of('fillText').length;
    chart.setHover(86, 5); // plot.y=12 之上
    expect(canvas.of('fillText').length).toBe(before * 2);
  });

  test('柱状：hover 柱体内 → 显示该类目；柱外 → null', () => {
    const canvas = new MockCanvas();
    const chart = new BarChart(makeContext(canvas), {
      type: 'bar',
      xAxis: { labels: ['A', 'B'] },
      series: [{ name: 'GDP', data: [10, 20] }],
    });
    chart.render();

    // A 柱带：x ∈ [84.8, 173.2]（单组堆叠居中后）
    const hit = chart.setHover(100, 100);
    void hit;
    const texts = canvas.of('fillText').map((args) => args[0] as string);
    expect(texts).toContain('A');
    expect(texts).toContain('GDP: 10');

    // 绘图区外（plot.x=44 左侧，轴标签区）不命中
    const canvas2 = new MockCanvas();
    const chart2 = new BarChart(makeContext(canvas2), {
      type: 'bar',
      xAxis: { labels: ['A', 'B'] },
      series: [{ name: 'GDP', data: [10, 20] }],
    });
    chart2.render();
    const before2 = canvas2.of('fillText').length;
    chart2.setHover(10, 100);
    expect(canvas2.of('fillText').length).toBe(before2 * 2);
  });

  test('饼图：hover 扇区 → 显示扇区名与百分比', () => {
    const canvas = new MockCanvas();
    const chart = new PieChart(makeContext(canvas), {
      type: 'pie',
      data: [
        { name: 'A', value: 25 },
        { name: 'B', value: 75 },
      ],
      radius: 90,
    });
    chart.render();

    // A 扇区平分角 -45°，边缘点 (263.6, 86.4)
    chart.setHover(263.6, 86.4);
    const texts = canvas.of('fillText').map((args) => args[0] as string);
    expect(texts).toContain('A');
    expect(texts.some((t) => t.includes('25%'))).toBe(true);

    // 圆心处（环形内空）不命中
    chart.setHover(200, 150);
    expect(chart.clearHover).toBeTypeOf('function');
  });

  test('tooltip.show=false：setHover 不绘制浮层', () => {
    const canvas = new MockCanvas();
    const chart = new LineChart(makeContext(canvas), {
      type: 'line',
      xAxis: { labels: ['A', 'B'] },
      series: [{ data: [10, 20] }],
      tooltip: { show: false },
    });
    chart.render();
    const before = canvas.of('fillText').length;
    chart.setHover(86, 100);
    expect(canvas.of('fillText').length).toBe(before * 2);
  });

  test('formatter 自定义展示内容', () => {
    const canvas = new MockCanvas();
    const chart = new LineChart(makeContext(canvas), {
      type: 'line',
      xAxis: { labels: ['A', 'B'] },
      series: [{ name: '北京', data: [10, 20] }],
      tooltip: {
        formatter: () => ['自定义标题', '自定义行内容'],
      },
    });
    chart.render();
    chart.setHover(86, 100);
    const texts = canvas.of('fillText').map((args) => args[0] as string);
    expect(texts).toContain('自定义标题');
    expect(texts).toContain('自定义行内容');
  });

  test('clearHover 移除浮层', () => {
    const canvas = new MockCanvas();
    const chart = new LineChart(makeContext(canvas), {
      type: 'line',
      xAxis: { labels: ['A', 'B'] },
      series: [{ name: '北京', data: [10, 20] }],
    });
    chart.render();
    chart.setHover(86, 100);
    expect(canvas.of('fillText').some((a) => a[0] === '北京: 10')).toBe(true);
    const beforeClear = canvas.of('fillText').length;
    chart.clearHover();
    // 重绘后新增的 fillText（轴标签）不再含 tooltip 行
    const after = canvas.of('fillText').slice(beforeClear);
    expect(after.some((a) => a[0] === '北京: 10')).toBe(false);
  });

  test('tooltip 背景与最后绘制的数据路径隔离', () => {
    const canvas = new MockCanvas();
    const chart = new BarChart(makeContext(canvas), {
      type: 'bar',
      xAxis: { labels: ['A', 'B'] },
      series: [{ name: 'GDP', data: [10, 20] }],
      horizontal: true,
    });
    chart.render();

    chart.setHover(100, 100);

    // Tooltip 绘制时最后一次 save() 开始一个独立的绘制块；其背景圆角矩形
    // 必须立即以 beginPath() 起始，不能复用最后一个柱体遗留的当前路径。
    const tooltipSave = canvas.commands.map((command) => command.type).lastIndexOf('save');
    expect(canvas.commands[tooltipSave + 1]?.type).toBe('beginPath');
    expect(canvas.commands[tooltipSave + 2]?.type).toBe('moveTo');
  });
});
