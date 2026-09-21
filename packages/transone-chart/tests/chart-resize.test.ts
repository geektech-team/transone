import { describe, expect, test } from 'bun:test';
import { LineChart } from '../lib/charts/line';
import type { ChartRenderContext } from '../lib/types';
import { MockCanvas } from './mock-canvas';

function makeContext(canvas: MockCanvas): ChartRenderContext {
  return { ctx: canvas, width: 400, height: 300, dpr: 1 };
}

describe('ChartBase.resize', () => {
  test('更新逻辑尺寸并重绘使用新尺寸', () => {
    const canvas = new MockCanvas();
    const chart = new LineChart(makeContext(canvas), {
      type: 'line',
      xAxis: { labels: ['4月', '5月', '6月'] },
      series: [{ name: '北京', data: [10, 20, 30] }],
    });

    chart.render();
    canvas.clear();

    chart.resize(800, 400).render();
    // 新尺寸下的清屏与背景绘制
    const clears = canvas.of('clearRect');
    expect(clears[clears.length - 1]).toEqual([0, 0, 800, 400]);
    const scales = canvas.of('scale');
    expect(scales[scales.length - 1]).toEqual([1, 1]);
  });

  test('可选 dpr 参数同步更新绘制缩放', () => {
    const canvas = new MockCanvas();
    const chart = new LineChart(makeContext(canvas), {
      type: 'line',
      xAxis: { labels: ['4月', '5月', '6月'] },
      series: [{ name: '北京', data: [10, 20, 30] }],
    });

    chart.render();
    canvas.clear();

    chart.resize(400, 300, 2).render();
    const scales = canvas.of('scale');
    expect(scales[scales.length - 1]).toEqual([2, 2]);
  });

  test('非法尺寸 / dpr 被钳制，不破坏渲染', () => {
    const canvas = new MockCanvas();
    const chart = new LineChart(makeContext(canvas), {
      type: 'line',
      xAxis: { labels: ['4月', '5月', '6月'] },
      series: [{ name: '北京', data: [10, 20, 30] }],
    });

    chart.resize(-10, 0, Number.NaN).render();
    expect(chart.isDestroyed()).toBe(false);
    // 渲染管线仍按钳制后尺寸运行
    const clears = canvas.of('clearRect');
    expect(clears[clears.length - 1]![2]).toBeGreaterThanOrEqual(0);
  });
});
