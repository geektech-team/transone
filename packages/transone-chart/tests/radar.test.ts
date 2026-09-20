import { describe, expect, test } from 'bun:test';
import { RadarChart } from '../lib/charts/radar';
import type { ChartRenderContext } from '../lib/types';
import { MockCanvas } from './mock-canvas';

function makeContext(canvas: MockCanvas): ChartRenderContext {
  return { ctx: canvas, width: 400, height: 300, dpr: 1 };
}

describe('RadarChart', () => {
  test('4 指标：网格 5 层 + 4 条轴线 + 系列多边形', () => {
    const canvas = new MockCanvas();
    const chart = new RadarChart(makeContext(canvas), {
      type: 'radar',
      indicators: [
        { name: 'A' },
        { name: 'B' },
        { name: 'C' },
        { name: 'D' },
      ],
      series: [{ data: [1, 2, 3, 4] }],
    });
    chart.render();

    // stroke：5 层网格 + 1 次轴线（整条路径一次）+ 1 次系列描边 = 7
    expect(canvas.of('stroke').length).toBe(7);
    // fill：系列区域 1 次
    expect(canvas.of('fill').length).toBe(1);
    // 指标标签 4 个
    expect(canvas.of('fillText').length).toBe(4);
  });

  test('系列顶点按指标 max 归一化', () => {
    const canvas = new MockCanvas();
    const chart = new RadarChart(makeContext(canvas), {
      type: 'radar',
      indicators: [
        { name: 'A', max: 10 },
        { name: 'B', max: 10 },
        { name: 'C', max: 10 },
        { name: 'D', max: 10 },
      ],
      series: [{ data: [10, 5, 0, 10] }],
    });
    chart.render();

    // 无 title/legend → plot = [16, 12, 368, 276]，中心 (200, 150)
    // radius = min(368,276)/2 × 0.6 = 138 × 0.6 = 82.8
    // 起始角 -π/2，4 指标步进 π/2
    // 顶点：A(200, 67.2) B(282.8, 150) C(200, 232.8) D(117.2, 150)
    // moveTo：网格 5 层 + 轴线 4 条 + area 填充 1 + 折线 1 = 11
    // 最后一条 moveTo 是系列折线起点，最后 3 条 lineTo 是折线顶点
    const moveTo = canvas.of('moveTo');
    const lineTo = canvas.of('lineTo');

    expect(moveTo.length).toBe(11);
    const seriesStart = moveTo[moveTo.length - 1] as [number, number];
    expect(seriesStart[0]).toBeCloseTo(200);
    expect(seriesStart[1]).toBeCloseTo(67.2);

    // 数据 [10, 5, 0, 10] → 比例 [1, 0.5, 0, 1]
    // 顶点：A(200, 67.2), B(241.4, 150), C(200, 150)（0 值在中心）, D(117.2, 150)
    const seriesLineTo = lineTo.slice(-3) as Array<[number, number]>;
    expect(seriesLineTo[0][0]).toBeCloseTo(241.4);
    expect(seriesLineTo[0][1]).toBeCloseTo(150);
    expect(seriesLineTo[1][0]).toBeCloseTo(200);
    expect(seriesLineTo[1][1]).toBeCloseTo(150);
    expect(seriesLineTo[2][0]).toBeCloseTo(117.2);
    expect(seriesLineTo[2][1]).toBeCloseTo(150);
  });

  test('area: false 只描边不填充', () => {
    const canvas = new MockCanvas();
    const chart = new RadarChart(makeContext(canvas), {
      type: 'radar',
      indicators: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      series: [{ data: [1, 2, 3], area: false }],
    });
    chart.render();

    expect(canvas.of('fill').length).toBe(0);
  });
});
