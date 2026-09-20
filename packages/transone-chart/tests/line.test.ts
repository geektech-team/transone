import { describe, expect, test } from 'bun:test';
import { LineChart } from '../lib/charts/line';
import type { ChartRenderContext } from '../lib/types';
import { MockCanvas } from './mock-canvas';

function makeContext(canvas: MockCanvas): ChartRenderContext {
  return { ctx: canvas, width: 400, height: 300, dpr: 1 };
}

// 共享布局常量（400×300，无 title/legend）：
// 数值轴区 = 刻度标签最长 2 字符 × 6 + 16 = 28 → plot.x = 44，plot 宽 340
// plot.y = 12，plot 高 = 300 - 12 - 12 - (11+16) = 249 → 数值 range [261, 12]
// 类目带宽 = 340 / 4 = 85

describe('LineChart', () => {
  test('多数据点折线：moveTo 起点 + lineTo 后续点', () => {
    const canvas = new MockCanvas();
    const chart = new LineChart(makeContext(canvas), {
      type: 'line',
      xAxis: { labels: ['A', 'B', 'C', 'D'] },
      series: [{ data: [10, 20, 15, 30] }],
    });
    chart.render();

    // 绘制顺序：网格(5 条刻度线) + 类目轴线 → 折线 → 数据点
    // moveTo 总数 = 5(网格) + 1(轴线) + 1(折线) = 7
    // lineTo 总数 = 5(网格) + 1(轴线) + 3(折线) = 9
    const moveTo = canvas.of('moveTo');
    const lineTo = canvas.of('lineTo');

    expect(moveTo.length).toBe(7);
    expect(lineTo.length).toBe(9);

    const seriesMove = moveTo[moveTo.length - 1] as [number, number];
    const seriesLine = lineTo.slice(-3) as Array<[number, number]>;

    expect(seriesMove).toEqual([86.5, 261]);
    expect(seriesLine[0]).toEqual([171.5, 136.5]);
    expect(seriesLine[1]).toEqual([256.5, 198.75]);
    expect(seriesLine[2]).toEqual([341.5, 12]);
  });

  test('平滑模式使用 bezierCurveTo', () => {
    const canvas = new MockCanvas();
    const chart = new LineChart(makeContext(canvas), {
      type: 'line',
      xAxis: { labels: ['A', 'B', 'C', 'D'] },
      series: [{ data: [10, 20, 15, 30], smooth: true }],
    });
    chart.render();

    expect(canvas.of('bezierCurveTo').length).toBe(3);
    // 平滑时折线不再逐点 lineTo：lineTo 仅来自网格(5) + 轴线(1)
    expect(canvas.of('lineTo').length).toBe(6);
  });

  test('面积填充：绘制回基线再 fill', () => {
    const canvas = new MockCanvas();
    const chart = new LineChart(makeContext(canvas), {
      type: 'line',
      xAxis: { labels: ['A', 'B', 'C'] },
      series: [{ data: [10, 20, 30], area: true, showSymbol: false }],
    });
    chart.render();

    // fill 仅面积 1 次（关闭数据点标记避免符号 fill 干扰）
    expect(canvas.of('fill').length).toBe(1);
    // moveTo：网格(5) + 轴线(1) + 面积(1) + 折线(1) = 8
    expect(canvas.of('moveTo').length).toBe(8);
    expect(canvas.of('closePath').length).toBeGreaterThanOrEqual(1);
  });

  test('数据点标记：每点一个 arc', () => {
    const canvas = new MockCanvas();
    const chart = new LineChart(makeContext(canvas), {
      type: 'line',
      xAxis: { labels: ['A', 'B', 'C', 'D'] },
      series: [{ data: [10, 20, 15, 30] }],
    });
    chart.render();

    expect(canvas.of('arc').length).toBe(4);
  });

  test('showSymbol: false 时不绘制标记', () => {
    const canvas = new MockCanvas();
    const chart = new LineChart(makeContext(canvas), {
      type: 'line',
      xAxis: { labels: ['A', 'B'] },
      series: [{ data: [10, 20], showSymbol: false }],
    });
    chart.render();

    expect(canvas.of('arc').length).toBe(0);
  });

  test('多系列绘制独立的折线', () => {
    const canvas = new MockCanvas();
    const chart = new LineChart(makeContext(canvas), {
      type: 'line',
      xAxis: { labels: ['A', 'B', 'C'] },
      series: [
        { name: 'S1', data: [10, 20, 30] },
        { name: 'S2', data: [5, 15, 25] },
      ],
    });
    chart.render();

    // 两个系列：最后两条 moveTo 是各自的折线起点（域 5..30 → 6 刻度网格）
    const moveTo = canvas.of('moveTo');
    const seriesStarts = moveTo.slice(-2) as Array<[number, number]>;
    // S1 起点与 S2 起点 x 相同（同类目）、y 不同（数值不同）
    expect(seriesStarts[0][0]).toBe(seriesStarts[1][0]);
    expect(seriesStarts[0][1]).not.toBe(seriesStarts[1][1]);
    // 图例存在（top）且项数为 2
    expect(canvas.of('fillText').some((args) => args[0] === 'S1')).toBe(true);
    expect(canvas.of('fillText').some((args) => args[0] === 'S2')).toBe(true);
  });

  test('setOption 增量更新后重新渲染', () => {
    const canvas = new MockCanvas();
    const chart = new LineChart(makeContext(canvas), {
      type: 'line',
      xAxis: { labels: ['A', 'B'] },
      series: [{ data: [10, 20] }],
    });
    chart.render();
    canvas.clear();

    chart
      .setOption({ series: [{ data: [5, 15] }] })
      .render();

    // 新数据域 5..15 → 折线起点 y 与旧域(10..20)不同
    const moveTo = canvas.of('moveTo');
    const seriesMove = moveTo[moveTo.length - 1] as [number, number];
    expect(seriesMove[1]).not.toBe(261);
  });
});
