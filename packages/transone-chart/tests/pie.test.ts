import { describe, expect, test } from 'bun:test';
import { PieChart } from '../lib/charts/pie';
import type { ChartRenderContext } from '../lib/types';
import { MockCanvas } from './mock-canvas';

function makeContext(canvas: MockCanvas): ChartRenderContext {
  return { ctx: canvas, width: 400, height: 300, dpr: 1 };
}

const TWO_PI = Math.PI * 2;

describe('PieChart', () => {
  test('饼图：每扇区一段外弧并闭合到圆心', () => {
    const canvas = new MockCanvas();
    const chart = new PieChart(makeContext(canvas), {
      type: 'pie',
      data: [
        { name: 'A', value: 50 },
        { name: 'B', value: 50 },
      ],
      legend: { show: false },
    });
    chart.render();

    const arcs = canvas.of('arc');
    expect(arcs.length).toBe(2);
    // 两扇区角度各占半圆
    const [a, b] = arcs as Array<[number, number, number, number, number]>;
    expect(a[4] - a[3]).toBeCloseTo(Math.PI);
    expect(b[4] - b[3]).toBeCloseTo(Math.PI);
    // 扇形连续：B 的起点 = A 的终点
    expect(b[3]).toBeCloseTo(a[4]);
  });

  test('扇区角度总和为 2π，且按值比例分配', () => {
    const canvas = new MockCanvas();
    const chart = new PieChart(makeContext(canvas), {
      type: 'pie',
      data: [
        { name: 'A', value: 1 },
        { name: 'B', value: 3 },
      ],
      legend: { show: false },
    });
    chart.render();

    const arcs = canvas.of('arc');
    const [a, b] = arcs as Array<[number, number, number, number, number]>;
    expect(a[4] - a[3]).toBeCloseTo(TWO_PI * 0.25);
    expect(b[4] - b[3]).toBeCloseTo(TWO_PI * 0.75);
  });

  test('环形图：每扇区外弧 + 内弧', () => {
    const canvas = new MockCanvas();
    const chart = new PieChart(makeContext(canvas), {
      type: 'pie',
      data: [
        { name: 'A', value: 50 },
        { name: 'B', value: 50 },
      ],
      innerRadius: 30,
      legend: { show: false },
    });
    chart.render();

    const arcs = canvas.of('arc');
    expect(arcs.length).toBe(4);
    // 内弧反向（counterclockwise = true），args 下标 5
    const innerArcs = arcs.filter(
      (args) => (args as unknown[])[5] === true
    );
    expect(innerArcs.length).toBe(2);
  });

  test('零值扇区被过滤', () => {
    const canvas = new MockCanvas();
    const chart = new PieChart(makeContext(canvas), {
      type: 'pie',
      data: [
        { name: 'A', value: 100 },
        { name: 'B', value: 0 },
      ],
      legend: { show: false },
    });
    chart.render();

    expect(canvas.of('arc').length).toBe(1);
  });

  test('默认绘制百分比标签', () => {
    const canvas = new MockCanvas();
    const chart = new PieChart(makeContext(canvas), {
      type: 'pie',
      data: [
        { name: 'A', value: 25 },
        { name: 'B', value: 75 },
      ],
      legend: { show: false },
    });
    chart.render();

    const labels = canvas
      .of('fillText')
      .map((args) => args[0] as string);
    expect(labels).toContain('A 25%');
    expect(labels).toContain('B 75%');
  });

  test('showLabel: false 关闭标签', () => {
    const canvas = new MockCanvas();
    const chart = new PieChart(makeContext(canvas), {
      type: 'pie',
      data: [{ name: 'A', value: 100 }],
      showLabel: false,
      legend: { show: false },
    });
    chart.render();

    const labels = canvas.of('fillText');
    expect(labels.length).toBe(0);
  });
});
