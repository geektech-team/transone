import { describe, expect, test } from 'bun:test';
import { BarChart } from '../lib/charts/bar';
import type { ChartRenderContext } from '../lib/types';
import { MockCanvas } from './mock-canvas';

function makeContext(canvas: MockCanvas): ChartRenderContext {
  return { ctx: canvas, width: 400, height: 300, dpr: 1 };
}

// 共享布局常量（400×300）：
// 数值域 0..20 → 刻度标签 2 字符 → 轴区 28 → plot.x = 44，plot 宽 340
// plot.y = 12，plot 高 = 249 → 数值 range [261, 12]
// 类目带宽 = 340 / 2 = 170

describe('BarChart', () => {
  test('分组柱状图：每类目每系列一根柱', () => {
    const canvas = new MockCanvas();
    const chart = new BarChart(makeContext(canvas), {
      type: 'bar',
      xAxis: { labels: ['A', 'B'] },
      series: [
        { data: [10, 20] },
        { data: [5, 8] },
      ],
    });
    chart.render();

    // 2 类目 × 2 系列 = 4 根柱
    const rects = canvas.of('rect');
    expect(rects.length).toBe(4);

    // 每类目 2 组：innerWidth = 170×0.65 = 110.5，size = 110.5/2×0.8 = 44.2
    // band 两侧留白 = (170 - 110.5)/2 = 29.75；组间 gap = (110.5 - 88.4)/2 = 11.05
    // 类目 A：组1 x = 44 + 29.75 + 11.05 = 84.8，组2 x = 129.0
    // 类目 B：组1 x = 44 + 170 + 40.8 = 254.8，组2 x = 299.0
    const xs = rects.map((r) => (r[0] as number).toFixed(2));
    expect(xs).toEqual(['84.80', '129.00', '254.80', '299.00']);

    // 整组柱中心落在类目中心（A 类：44 + 170/2 = 129；B 类：299），与轴标签对齐
    const centers = rects.map(
      (r) => (r[0] as number) + (r[2] as number) / 2
    );
    expect((centers[0]! + centers[1]!) / 2).toBeCloseTo(129, 0);
    expect((centers[2]! + centers[3]!) / 2).toBeCloseTo(299, 0);
  });

  test('柱体高度从零线起算', () => {
    const canvas = new MockCanvas();
    const chart = new BarChart(makeContext(canvas), {
      type: 'bar',
      xAxis: { labels: ['A'] },
      series: [{ data: [10] }],
    });
    chart.render();

    // 域 0..10 → scale(0)=261（零线/底部），scale(10)=12（顶部）
    const rects = canvas.of('rect');
    expect(rects.length).toBe(1);
    const [, y, width, height] = rects[0] as [number, number, number, number];
    expect(y).toBe(12);
    expect(height).toBe(249);
    // 单类目单系列：bandWidth = 340，size = 340×0.65×0.8 = 176.8
    expect(width).toBeCloseTo(176.8);
  });

  test('堆叠：同名 stack 共用一根柱，值累加', () => {
    const canvas = new MockCanvas();
    const chart = new BarChart(makeContext(canvas), {
      type: 'bar',
      xAxis: { labels: ['A'] },
      series: [
        { stack: 's', data: [10] },
        { stack: 's', data: [5] },
      ],
    });
    chart.render();

    // 1 个堆叠组 → 1 根柱，但两次填充（两个分段）
    const rects = canvas.of('rect');
    expect(rects.length).toBe(2);
    // 域 0..15 → scale(0)=261, scale(10)=95, scale(15)=12
    const [first, second] = rects as Array<[number, number, number, number]>;
    expect(first[1]).toBeCloseTo(95); // 第一段从 10 到 0
    expect(first[3]).toBeCloseTo(166);
    expect(second[1]).toBeCloseTo(12); // 第二段从 15 到 10
    expect(second[3]).toBeCloseTo(83);
  });

  test('横向柱状图：柱体沿 x 方向延伸', () => {
    const canvas = new MockCanvas();
    const chart = new BarChart(makeContext(canvas), {
      type: 'bar',
      horizontal: true,
      xAxis: { labels: ['A', 'B'] },
      series: [{ data: [10, 20] }],
    });
    chart.render();

    const rects = canvas.of('rect');
    expect(rects.length).toBe(2);
    const [first, second] = rects as Array<[number, number, number, number]>;
    // 柱体高 = 槽高，宽度 = 数值映射宽度
    expect(first[3]).toBeGreaterThan(0);
    expect(second[3]).toBeGreaterThan(0);
    // 值越大柱越宽
    expect(second[2]).toBeGreaterThan(first[2]);
  });

  test('负值柱从零线向下', () => {
    const canvas = new MockCanvas();
    const chart = new BarChart(makeContext(canvas), {
      type: 'bar',
      xAxis: { labels: ['A'] },
      series: [{ data: [-10] }],
    });
    chart.render();

    const rects = canvas.of('rect');
    expect(rects.length).toBe(1);
    const [, y, , height] = rects[0] as [number, number, number, number];
    // 域 -10..0：scale(-10)=261（底部），scale(0)=12（零线/顶部）
    expect(y).toBe(12);
    expect(height).toBe(249);
  });
});
