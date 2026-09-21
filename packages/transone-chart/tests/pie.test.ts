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

  test('labelPosition outside：标签画在扇区外（超出外半径）', () => {
    const canvas = new MockCanvas();
    const chart = new PieChart(makeContext(canvas), {
      type: 'pie',
      data: [
        { name: 'A', value: 25 },
        { name: 'B', value: 75 },
      ],
      radius: 100,
      labelPosition: 'outside',
      legend: { show: false },
    });
    chart.render();

    // 圆心 (200, 150)；第一个扇区平分角 -45°，文字 x 应明显超出 圆心+外半径 = 300
    const texts = canvas.of('fillText') as Array<[string, number, number]>;
    const labelA = texts.find((args) => args[0] === 'A 25%');
    expect(labelA).toBeDefined();
    const [x, y] = [labelA![1], labelA![2]];
    const dist = Math.hypot(x - 200, y - 150);
    expect(dist).toBeGreaterThan(100 + 14); // 外半径 + 引线长度
  });

  test('labelPosition outside：绘制两段式引线（边缘点 → 折点 → 文字）', () => {
    const canvas = new MockCanvas();
    const chart = new PieChart(makeContext(canvas), {
      type: 'pie',
      data: [
        { name: 'A', value: 25 },
        { name: 'B', value: 75 },
      ],
      radius: 80,
      labelPosition: 'outside',
      legend: { show: false },
    });
    chart.render();

    // A 扇区：25% → sweep π/2，midAngle = -π/2 + π/4 = -45°（右上方）
    // 边缘点 = 圆心 + 80·(cos-45°, sin-45°) = (256.6, 93.4)
    // 折点 = 圆心 + 94·(cos-45°, sin-45°) = (266.5, 83.5)
    // 文字点 = 折点向右 6px
    const moves = canvas.of('moveTo');
    const lines = canvas.of('lineTo');
    expect(moves.length).toBe(2); // A、B 各一条引线
    expect(lines.length).toBeGreaterThanOrEqual(4);

    // 第一条引线属于 A 扇区
    const start = moves[0] as [number, number];
    expect(start[0]).toBeCloseTo(200 + 80 * Math.cos(-Math.PI / 4), 0);
    expect(start[1]).toBeCloseTo(150 + 80 * Math.sin(-Math.PI / 4), 0);

    // 命令流：扇区闭合 lineTo(圆心) → 引线 moveTo → lineTo(折点) → lineTo(文字点)
    const bend = lines[1] as [number, number];
    const end = lines[2] as [number, number];
    expect(bend[0]).toBeCloseTo(200 + 94 * Math.cos(-Math.PI / 4), 0);
    expect(bend[1]).toBeCloseTo(150 + 94 * Math.sin(-Math.PI / 4), 0);
    expect(end[0]).toBeGreaterThan(bend[0]); // 右半区水平向右延伸
    expect(end[1]).toBeCloseTo(bend[1]);
  });
});
