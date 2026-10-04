import { describe, expect, test } from 'bun:test';
import { createChart } from '../lib/factory';
import type {
  ChartOption,
  ChartRenderContext,
  FunnelChartOption,
  TooltipParams,
} from '../lib/types';
import { MockCanvas } from './mock-canvas';

type FunnelPoint = [number, number];

function funnelContext(
  canvas: MockCanvas,
  width = 400,
  height = 300
): ChartRenderContext {
  return {
    ctx: canvas,
    width,
    height,
    dpr: 1,
    palette: ['#ff0000', '#00ff00', '#0000ff', '#800080', '#ffa500'],
  };
}

function funnelChart(
  canvas: MockCanvas,
  option: Omit<FunnelChartOption, 'type'>,
  width = 400,
  height = 300
) {
  return createChart(funnelContext(canvas, width, height), {
    type: 'funnel',
    legend: { show: false },
    ...option,
  } as ChartOption);
}

function funnelPolygons(canvas: MockCanvas): FunnelPoint[][] {
  const polygons: FunnelPoint[][] = [];
  let points: FunnelPoint[] = [];
  for (const command of canvas.commands) {
    if (command.type === 'beginPath') points = [];
    if (command.type === 'moveTo' || command.type === 'lineTo') {
      points.push(command.args as FunnelPoint);
    }
    if (command.type === 'fill' && points.length === 4) polygons.push(points);
  }
  return polygons;
}

function funnelTexts(canvas: MockCanvas): string[] {
  return canvas.of('fillText').map((args) => args[0] as string);
}

describe('FunnelChart', () => {
  test('正值阶段按最大值缩放，上下边连接相邻阶段且默认保留输入顺序', () => {
    const canvas = new MockCanvas();
    const chart = funnelChart(canvas, {
      data: [
        { name: '访问', value: 100 },
        { name: '注册', value: 50 },
        { name: '成交', value: 25 },
      ],
      showLabel: false,
    });
    chart.render();

    const shapes = funnelPolygons(canvas);
    expect(shapes).toHaveLength(3);
    const first = shapes[0]!;
    const second = shapes[1]!;
    const last = shapes[2]!;
    expect(first[1]![0] - first[0]![0]).toBeCloseTo(368);
    expect(first[2]![0] - first[3]![0]).toBeCloseTo(184);
    expect(second[1]![0] - second[0]![0]).toBeCloseTo(184);
    expect(second[2]![0] - second[3]![0]).toBeCloseTo(92);
    expect(last[1]![0] - last[0]![0]).toBeCloseTo(92);
    expect(last[2]![0] - last[3]![0]).toBe(0);
    expect(second[0]![1] - first[3]![1]).toBeCloseTo(4);
    expect(last[3]![1]).toBeCloseTo(288);
    expect(canvas.of('lineTo')).toHaveLength(9);
  });

  test('默认标签显示原始数量并保留未排序阶段顺序', () => {
    const canvas = new MockCanvas();
    funnelChart(canvas, {
      data: [
        { name: '先', value: 25 },
        { name: '后', value: 100 },
      ],
    }).render();
    expect(funnelTexts(canvas)).toEqual(['先: 25', '后: 100']);
  });

  test('升序与降序排序不修改输入数组，重复值维持输入顺序', () => {
    const data = Object.freeze([
      Object.freeze({ name: 'B', value: 50 }),
      Object.freeze({ name: 'A', value: 100 }),
      Object.freeze({ name: 'C', value: 50 }),
    ]);
    const ascending = new MockCanvas();
    const descending = new MockCanvas();
    funnelChart(ascending, { data, sort: 'ascending' }).render();
    funnelChart(descending, { data, sort: 'descending' }).render();

    expect(funnelTexts(ascending)).toEqual(['B: 50', 'C: 50', 'A: 100']);
    expect(funnelTexts(descending)).toEqual(['A: 100', 'B: 50', 'C: 50']);
    expect(data.map((datum) => datum.name)).toEqual(['B', 'A', 'C']);
  });

  test('过滤与排序之后颜色仍对应原始索引，显式颜色优先', () => {
    const canvas = new MockCanvas();
    const hits: TooltipParams[] = [];
    const chart = funnelChart(canvas, {
      data: [
        { name: '坏值', value: -1 },
        { name: 'B', value: 20 },
        { name: 'A', value: 100, color: '#123456' },
        { name: 'C', value: 40 },
      ],
      sort: 'descending',
      showLabel: false,
      tooltip: {
        formatter: (params) => {
          hits.push(params);
          return [];
        },
      },
    });
    chart.render();
    chart.setHover(200, 40);
    chart.setHover(200, 140);
    chart.setHover(200, 230);

    expect(
      hits.map((hit) => [hit.name, hit.items[0]!.value, hit.items[0]!.color])
    ).toEqual([
      ['A', 100, '#123456'],
      ['C', 40, '#800080'],
      ['B', 20, '#00ff00'],
    ]);
  });

  test('命中梯形返回原始计数，梯形外与阶段间隙均不命中', () => {
    const canvas = new MockCanvas();
    const chart = funnelChart(canvas, {
      data: [
        { name: '访问', value: 100 },
        { name: '成交', value: 50 },
      ],
      showLabel: false,
    });
    chart.render();
    canvas.clear();
    chart.setHover(200, 80);
    expect(funnelTexts(canvas)).toEqual(['访问', '访问: 100']);

    canvas.clear();
    chart.setHover(40, 80); // 在首阶段包围盒内，但在斜边外。
    expect(funnelTexts(canvas)).toEqual([]);
    canvas.clear();
    chart.setHover(200, 150); // 首阶段 y=12..148，第二阶段 y=152..288。
    expect(funnelTexts(canvas)).toEqual([]);
    canvas.clear();
    chart.setHover(200, 220);
    expect(funnelTexts(canvas)).toEqual(['成交', '成交: 50']);
    canvas.clear();
    chart.setHover(200, 300);
    expect(funnelTexts(canvas)).toEqual([]);
  });

  test('零阶段保留标签和垂直位置，负数与非有限值被忽略', () => {
    const canvas = new MockCanvas();
    const chart = funnelChart(canvas, {
      data: [
        { name: 'A', value: 100 },
        { name: '负数', value: -1 },
        { name: '非数', value: Number.NaN },
        { name: '无限', value: Number.POSITIVE_INFINITY },
        { name: '零', value: 0 },
        { name: 'C', value: 50 },
      ],
    });
    chart.render();
    expect(funnelTexts(canvas)).toEqual(['A: 100', '零: 0', 'C: 50']);
    const shapes = funnelPolygons(canvas);
    expect(shapes).toHaveLength(2);
    expect(shapes[0]![2]![0] - shapes[0]![3]![0]).toBe(0);
    expect(shapes[1]![0]![1]).toBeCloseTo(198 + 2 / 3);

    canvas.clear();
    chart.setHover(200, 150);
    expect(funnelTexts(canvas)).toEqual(['A: 100', '零: 0', 'C: 50']);
  });

  test('空数据与全零数据不生成可命中的图形，全零仍显示标签', () => {
    const empty = new MockCanvas();
    const zeros = new MockCanvas();
    funnelChart(empty, { data: [] }).render().setHover(200, 150);
    funnelChart(zeros, {
      data: [
        { name: 'A', value: 0 },
        { name: 'B', value: 0 },
      ],
    })
      .render()
      .setHover(200, 150);
    expect(funnelPolygons(empty)).toEqual([]);
    expect(funnelTexts(empty)).toEqual([]);
    expect(funnelPolygons(zeros)).toEqual([]);
    expect(funnelTexts(zeros)).toEqual(['A: 0', 'B: 0', 'A: 0', 'B: 0']);
  });

  test('最小宽度钳制阶段与末阶段底边，且不会超出绘图区', () => {
    const canvas = new MockCanvas();
    funnelChart(canvas, {
      data: [
        { name: 'A', value: 100 },
        { name: 'B', value: 1 },
      ],
      minWidth: 40,
      showLabel: false,
    }).render();
    const shapes = funnelPolygons(canvas);
    expect(shapes[0]![2]![0] - shapes[0]![3]![0]).toBe(40);
    expect(shapes[1]![1]![0] - shapes[1]![0]![0]).toBe(40);
    expect(shapes[1]![2]![0] - shapes[1]![3]![0]).toBe(40);

    canvas.clear();
    funnelChart(canvas, {
      data: [{ name: 'A', value: 1 }],
      minWidth: 1000,
      showLabel: false,
    }).render();
    expect(funnelPolygons(canvas)[0]).toEqual([
      [16, 12],
      [384, 12],
      [384, 288],
      [16, 288],
    ]);
  });

  test('极大有限值、非法尺寸配置与微小容器不会产生非有限几何', () => {
    for (const [width, height] of [
      [400, 300],
      [20, 20],
      [0, 0],
    ]) {
      const canvas = new MockCanvas();
      funnelChart(
        canvas,
        {
          data: [
            { name: 'A', value: Number.MAX_VALUE },
            { name: 'B', value: 1 },
          ],
          gap: Number.POSITIVE_INFINITY,
          minWidth: Number.NaN,
        },
        width,
        height
      )
        .render()
        .setHover(10, 10);
      const coordinates = canvas.commands
        .flatMap((command) => command.args)
        .filter((value): value is number => typeof value === 'number');
      expect(coordinates.every(Number.isFinite)).toBe(true);
      if (width < 32) expect(funnelPolygons(canvas)).toEqual([]);
    }
  });

  test('setOption 后重绘更新数量与几何，清空数据清除旧命中区域', () => {
    const canvas = new MockCanvas();
    const chart = funnelChart(canvas, {
      data: [
        { name: 'A', value: 100 },
        { name: 'B', value: 50 },
      ],
      showLabel: false,
    });
    chart.render();
    chart
      .setOption({ data: [{ name: '更新', value: 7 }] } as Partial<ChartOption>)
      .render();
    canvas.clear();
    chart.setHover(60, 150); // 单阶段在此处已收窄。
    expect(funnelTexts(canvas)).toEqual([]);
    canvas.clear();
    chart.setHover(200, 150);
    expect(funnelTexts(canvas)).toEqual(['更新', '更新: 7']);
    chart
      .clearHover()
      .setOption({ data: [] } as Partial<ChartOption>)
      .render();
    canvas.clear();
    chart.setHover(200, 150);
    expect(funnelTexts(canvas)).toEqual([]);
  });

  test('resize 后重绘使用新几何命中，showLabel 与 tooltip 关闭配置有效', () => {
    const canvas = new MockCanvas();
    const chart = funnelChart(canvas, {
      data: [
        { name: 'A', value: 100 },
        { name: 'B', value: 50 },
      ],
      showLabel: false,
    });
    chart.render().resize(800, 400).render();
    canvas.clear();
    chart.setHover(600, 80);
    expect(funnelTexts(canvas)).toEqual(['A', 'A: 100']);
    chart
      .clearHover()
      .setOption({ tooltip: { show: false } })
      .render();
    canvas.clear();
    chart.setHover(400, 80);
    expect(funnelTexts(canvas)).toEqual([]);
  });

  test('重绘刷新当前悬浮的数据，resize 或清空数据后移除失效悬浮', () => {
    const canvas = new MockCanvas();
    const chart = funnelChart(canvas, {
      data: [{ name: '旧阶段', value: 100 }],
      showLabel: false,
    });
    chart.render().setHover(200, 80);
    canvas.clear();
    chart
      .setOption({
        data: [{ name: '新阶段', value: 7 }],
      } as Partial<ChartOption>)
      .render();
    expect(funnelTexts(canvas)).toEqual(['新阶段', '新阶段: 7']);

    canvas.clear();
    chart.resize(100, 300).render();
    expect(funnelTexts(canvas)).toEqual([]);
    chart.setHover(50, 80);
    canvas.clear();
    chart.setOption({ data: [] } as Partial<ChartOption>).render();
    expect(funnelTexts(canvas)).toEqual([]);
  });
});
