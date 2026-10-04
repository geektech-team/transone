import { describe, expect, test } from 'bun:test';
import { createChart } from '../lib/factory';
import type {
  ChartOption,
  ChartRenderContext,
  TooltipParams,
} from '../lib/types';
import { MockCanvas } from './mock-canvas';

function gaugeContext(
  canvas: MockCanvas,
  width = 400,
  height = 300
): ChartRenderContext {
  return { ctx: canvas, width, height, dpr: 1 };
}

function createGauge(
  canvas: MockCanvas,
  option: { value: number; [key: string]: unknown },
  width = 400,
  height = 300
) {
  return createChart(gaugeContext(canvas, width, height), {
    type: 'gauge',
    legend: { show: false },
    ...option,
  } as ChartOption);
}

function gaugeTexts(canvas: MockCanvas): string[] {
  return canvas.of('fillText').map((args) => args[0] as string);
}

describe('GaugeChart', () => {
  test('工厂创建仪表盘，默认顺时针轨道及进度按值域比例绘制', () => {
    const canvas = new MockCanvas();
    createGauge(canvas, {
      value: 50,
      radius: 100,
      showPointer: false,
    }).render();

    const arcs = canvas.of('arc') as Array<
      [number, number, number, number, number, boolean]
    >;
    expect(arcs).toHaveLength(2);
    expect(arcs[0].slice(0, 3)).toEqual([200, 150, 100]);
    expect(arcs[0][3]).toBeCloseTo((3 * Math.PI) / 4);
    expect(arcs[0][4]).toBeCloseTo((9 * Math.PI) / 4);
    expect(arcs[0][5]).toBe(false);
    expect(arcs[1][3]).toBeCloseTo((3 * Math.PI) / 4);
    expect(arcs[1][4]).toBeCloseTo((3 * Math.PI) / 2);
    expect(canvas.of('setLineDash')).toHaveLength(0);
  });

  test('负值域与自定义角度按 (value-min)/(max-min) 分配进度', () => {
    const canvas = new MockCanvas();
    createGauge(canvas, {
      value: 0,
      min: -50,
      max: 150,
      startAngle: Math.PI,
      endAngle: 2 * Math.PI,
      radius: 100,
      showPointer: false,
    }).render();

    const arcs = canvas.of('arc');
    expect(arcs[1][3]).toBeCloseTo(Math.PI);
    expect(arcs[1][4]).toBeCloseTo((5 * Math.PI) / 4);
    expect(gaugeTexts(canvas)).toContain('-50');
    expect(gaugeTexts(canvas)).toContain('150');
  });

  test('默认五段刻度包含值域端点，指针指向当前进度终点', () => {
    const canvas = new MockCanvas();
    createGauge(canvas, { value: 50, radius: 100 }).render();

    const texts = gaugeTexts(canvas);
    for (const label of ['0', '20', '40', '60', '80', '100']) {
      expect(texts).toContain(label);
    }
    expect(texts).toContain('50');
    const lines = canvas.of('lineTo') as Array<[number, number]>;
    expect(lines.some(([x, y]) => Math.abs(x - 200) < 0.001 && y < 100)).toBe(
      true
    );
    expect(canvas.of('fill').length).toBeGreaterThan(0);
  });

  test('极大有限值域的中间刻度不因乘法溢出显示 Infinity', () => {
    const canvas = new MockCanvas();
    createGauge(canvas, {
      value: 5e307,
      min: 0,
      max: 1e308,
      showPointer: false,
    }).render();

    const texts = gaugeTexts(canvas);
    expect(texts).toContain('8e+307');
    expect(texts).not.toContain('Infinity');
  });

  test('showLabel、showPointer、showValue 独立控制刻度文字、指针和值', () => {
    const canvas = new MockCanvas();
    const chart = createGauge(canvas, {
      value: 33,
      splitCount: 4,
      showLabel: false,
      showPointer: false,
    });
    chart.render();

    expect(gaugeTexts(canvas)).toEqual(['33']);
    expect(canvas.of('moveTo')).toHaveLength(5);
    expect(canvas.of('lineTo')).toHaveLength(5);
    expect(canvas.of('fill')).toHaveLength(0);

    canvas.clear();
    chart.setOption({ showValue: false } as Partial<ChartOption>).render();
    expect(gaugeTexts(canvas)).toEqual([]);
  });

  test.each([
    { value: -25, progressArcs: 0, endAngle: (3 * Math.PI) / 4 },
    { value: 125, progressArcs: 1, endAngle: (9 * Math.PI) / 4 },
  ])(
    '超限值 $value 仅钳制绘图并保留数值文字和 tooltip',
    ({ value, progressArcs, endAngle }) => {
      const canvas = new MockCanvas();
      let hit: TooltipParams | undefined;
      const chart = createGauge(canvas, {
        value,
        name: '速度',
        radius: 100,
        showPointer: false,
        tooltip: {
          formatter: (params: TooltipParams) => {
            hit = params;
            return ['命中'];
          },
        },
      });
      chart.render();

      const arcs = canvas.of('arc');
      expect(arcs).toHaveLength(1 + progressArcs);
      if (progressArcs) expect(arcs[1][4]).toBeCloseTo(endAngle);
      expect(gaugeTexts(canvas)).toContain(String(value));
      chart.setHover(200, 50);
      expect(hit?.name).toBe('速度');
      expect(hit?.items[0].name).toBe('速度');
      expect(hit?.items[0].value).toBe(value);
    }
  );

  test('轨道、中心和指针命中，底部缺口及绘图区外不命中', () => {
    const canvas = new MockCanvas();
    const hits: TooltipParams[] = [];
    const chart = createGauge(canvas, {
      value: 50,
      name: '速度',
      radius: 100,
      tooltip: {
        formatter: (params: TooltipParams) => {
          hits.push(params);
          return ['命中'];
        },
      },
    });
    chart.render();

    chart.setHover(200, 50);
    chart.setHover(200, 150);
    chart.setHover(200, 100);
    expect(hits).toHaveLength(3);
    chart.setHover(200, 250);
    chart.setHover(200, 220);
    chart.setHover(100, 100);
    chart.setHover(200, 5);
    expect(hits).toHaveLength(3);
    chart.clearHover();
    expect(hits).toHaveLength(3);
  });

  test('自定义弧跨过 2π 时正常命中且完整圆没有缺口', () => {
    const canvas = new MockCanvas();
    const hits: TooltipParams[] = [];
    const chart = createGauge(canvas, {
      value: 50,
      radius: 100,
      startAngle: (3 * Math.PI) / 2,
      endAngle: (5 * Math.PI) / 2,
      showPointer: false,
      tooltip: {
        formatter: (params: TooltipParams) => {
          hits.push(params);
          return ['命中'];
        },
      },
    });
    chart.render();
    chart.setHover(300, 150);
    chart.setHover(100, 150);
    expect(hits).toHaveLength(1);

    chart.clearHover();
    chart
      .setOption({
        startAngle: 0,
        endAngle: 2 * Math.PI,
      } as Partial<ChartOption>)
      .render();
    chart.setHover(100, 150);
    chart.setHover(200, 250);
    expect(hits).toHaveLength(3);
  });

  test('tooltip.show=false 不执行 formatter', () => {
    const canvas = new MockCanvas();
    let hits = 0;
    const chart = createGauge(canvas, {
      value: 50,
      radius: 100,
      tooltip: {
        show: false,
        formatter: () => {
          hits += 1;
          return ['命中'];
        },
      },
    });
    chart.render();
    chart.setHover(200, 50);
    expect(hits).toBe(0);
  });

  test('悬浮时更新数值刷新 tooltip，resize 移走轨道时清除旧命中', () => {
    const canvas = new MockCanvas();
    const values: Array<number | string> = [];
    const chart = createGauge(canvas, {
      value: 50,
      radius: 100,
      tooltip: {
        formatter: (params: TooltipParams) => {
          values.push(params.items[0].value);
          return ['命中'];
        },
      },
    });
    chart.render().setHover(200, 50);
    chart.setOption({ value: 51 } as Partial<ChartOption>).render();
    expect(values).toEqual([50, 51]);

    chart.resize(120, 80).render();
    expect(values).toEqual([50, 51]);
    chart.resize(0, 0).render();
    expect(values).toEqual([50, 51]);
  });

  test('无 name 时默认不占用图例，命名仪表盘可显示默认图例', () => {
    const canvas = new MockCanvas();
    createChart(gaugeContext(canvas), {
      type: 'gauge',
      value: 50,
      showLabel: false,
    } as ChartOption).render();
    expect(gaugeTexts(canvas)).toEqual(['50']);
    expect(canvas.of('rect')).toHaveLength(0);

    canvas.clear();
    createChart(gaugeContext(canvas), {
      type: 'gauge',
      value: 50,
      name: '速度',
      showLabel: false,
    } as ChartOption).render();
    expect(gaugeTexts(canvas)).toContain('速度');
    expect(canvas.of('rect')).toHaveLength(1);
  });

  test('自动半径和超大显式半径均保持轨道在容器内，resize 重新布局', () => {
    const canvas = new MockCanvas();
    const chart = createGauge(canvas, { value: 50, showPointer: false });
    chart.render();
    const initial = canvas.of('arc')[0] as number[];
    expect(initial[0]).toBe(200);
    expect(initial[1]).toBe(150);
    expect(initial[2]).toBeGreaterThan(0);
    expect(initial[2]).toBeLessThanOrEqual(138);

    canvas.clear();
    chart
      .setOption({ radius: 1000 } as Partial<ChartOption>)
      .resize(120, 80, 2)
      .render();
    const smaller = canvas.of('arc')[0] as number[];
    expect(smaller[0]).toBe(60);
    expect(smaller[1]).toBe(40);
    expect(smaller[2]).toBeGreaterThan(0);
    expect(smaller[2]).toBeLessThanOrEqual(28);
    expect(canvas.of('scale')).toEqual([[2, 2]]);
    for (const command of canvas.commands) {
      for (const arg of command.args) {
        if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
      }
    }
  });

  test('极小画布和没有绘图区时不生成越界或非有限几何', () => {
    for (const [width, height] of [
      [40, 40],
      [20, 20],
      [0, 0],
    ]) {
      const canvas = new MockCanvas();
      createGauge(canvas, { value: 50 }, width, height).render();
      for (const arc of canvas.of('arc') as number[][]) {
        const [x, y, radius] = arc;
        expect(radius).toBeGreaterThanOrEqual(0);
        expect(x - radius).toBeGreaterThanOrEqual(0);
        expect(y - radius).toBeGreaterThanOrEqual(0);
        expect(x + radius).toBeLessThanOrEqual(width);
        expect(y + radius).toBeLessThanOrEqual(height);
      }
      for (const command of canvas.commands) {
        for (const arg of command.args) {
          if (typeof arg === 'number') expect(Number.isFinite(arg)).toBe(true);
        }
      }
    }
  });

  test.each([
    { option: { value: Number.NaN }, error: /value.*finite/i },
    { option: { value: Number.POSITIVE_INFINITY }, error: /value.*finite/i },
    { option: { value: 50, min: 100, max: 100 }, error: /min.*max|range/i },
    { option: { value: 50, min: 100, max: 0 }, error: /min.*max|range/i },
    {
      option: { value: 50, min: Number.NEGATIVE_INFINITY },
      error: /min.*max|range/i,
    },
    { option: { value: 50, max: Number.NaN }, error: /min.*max|range/i },
    { option: { value: 50, startAngle: 1, endAngle: 1 }, error: /angle/i },
    { option: { value: 50, startAngle: 2, endAngle: 1 }, error: /angle/i },
    {
      option: { value: 50, startAngle: 0, endAngle: 3 * Math.PI },
      error: /angle/i,
    },
    { option: { value: 50, startAngle: Number.NaN }, error: /angle/i },
    {
      option: { value: 50, endAngle: Number.POSITIVE_INFINITY },
      error: /angle/i,
    },
  ])('拒绝非法配置 $option', ({ option, error }) => {
    expect(() => createGauge(new MockCanvas(), option).render()).toThrow(error);
  });

  test('setOption 拒绝非法更新并保留之前可渲染的值', () => {
    const canvas = new MockCanvas();
    const chart = createGauge(canvas, { value: 50 });
    expect(() =>
      chart.setOption({ value: Number.NaN } as Partial<ChartOption>).render()
    ).toThrow(/value.*finite/i);
    canvas.clear();
    chart.render();
    expect(gaugeTexts(canvas)).toContain('50');
    expect(gaugeTexts(canvas)).not.toContain('NaN');
  });

  test.each(
    [0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY, 1_000_000].map(
      (splitCount) => ({ splitCount })
    )
  )(
    'splitCount=$splitCount 在创建时拒绝，避免非法刻度和过长绘制循环',
    ({ splitCount }) => {
      expect(() =>
        createGauge(new MockCanvas(), { value: 50, splitCount })
      ).toThrow(/splitCount.*1.*1000/i);
    }
  );
});
