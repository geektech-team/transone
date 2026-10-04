import { describe, expect, test } from 'bun:test';
import { createChart } from '../lib/factory';
import type {
  ScatterChartOption,
  ScatterDatum,
  TooltipParams,
} from '../lib/types';
import { MockCanvas } from './mock-canvas';

function scatterFixture(extra: Partial<ScatterChartOption> = {}) {
  const canvas = new MockCanvas();
  const chart = createChart(
    { ctx: canvas, width: 400, height: 300, dpr: 1 },
    {
      type: 'scatter',
      legend: { show: false },
      xAxis: { min: 0, max: 10 },
      yAxis: { min: 0, max: 100 },
      series: [
        {
          name: '样本',
          data: [
            [0, 0],
            [5, 50],
            [10, 100],
          ],
        },
      ],
      ...extra,
    }
  );
  return { canvas, chart };
}

describe('ScatterChart', () => {
  test('渲染参数报错后恢复 Canvas 状态，修正配置后 DPR 不累乘', () => {
    class TransformCanvas extends MockCanvas {
      public factor = 1;
      public stack: number[] = [];
      public save(): void {
        super.save();
        this.stack.push(this.factor);
      }
      public restore(): void {
        super.restore();
        this.factor = this.stack.pop() ?? 1;
      }
      public scale(x: number, y: number): void {
        super.scale(x, y);
        this.factor *= x;
      }
    }
    const canvas = new TransformCanvas();
    const chart = createChart(
      { ctx: canvas, width: 400, height: 300, dpr: 2 },
      {
        type: 'scatter',
        series: [],
        xAxis: { min: 1, max: 1 },
      }
    );
    expect(() => chart.render()).toThrow(/ScatterChart/);
    expect(canvas.factor).toBe(1);
    expect(canvas.stack).toHaveLength(0);
    chart.setOption({ xAxis: { min: 0, max: 10 } }).render();
    expect(canvas.factor).toBe(1);
  });
  test('两个数值轴按真实数值间距映射点坐标', () => {
    const { canvas, chart } = scatterFixture();
    chart.render();
    expect(canvas.of('arc').map((args) => args.slice(0, 3))).toEqual([
      [50, 261, 4],
      [217, 136.5, 4],
      [384, 12, 4],
    ]);
  });

  test('点大小优先于系列大小，零大小点不绘制', () => {
    const { canvas, chart } = scatterFixture({
      series: [
        {
          symbolSize: 12,
          data: [
            [1, 10],
            { value: [5, 50], symbolSize: 20 },
            { value: [9, 90], symbolSize: 0 },
          ],
        },
      ],
    });
    chart.render();
    expect(canvas.of('arc').map((args) => args[2])).toEqual([6, 10]);
  });

  test('过滤坏点和显式数值范围外的点，保留负数和零值', () => {
    const { canvas, chart } = scatterFixture({
      xAxis: { min: -10, max: 10 },
      yAxis: { min: -100, max: 100 },
      series: [
        {
          data: [
            [-5, -50],
            [0, 0],
            [NaN, 1],
            [1, Infinity],
            [11, 1],
            [1, -101],
          ],
        },
      ],
    });
    chart.render();
    expect(canvas.of('arc')).toHaveLength(2);
    expect(
      canvas.commands
        .flatMap((c) => c.args)
        .filter((v) => typeof v === 'number')
        .every(Number.isFinite)
    ).toBe(true);
  });

  test('自动数据域容纳负值，空系列和常量坐标安全', () => {
    const samples: ScatterDatum[][] = [
      [],
      [[-3, -8]],
      [
        [2, 2],
        [2, 2],
      ],
    ];
    for (const data of samples) {
      const { canvas, chart } = scatterFixture({
        xAxis: undefined,
        yAxis: undefined,
        series: [{ data }],
      });
      expect(() => chart.render()).not.toThrow();
      expect(canvas.of('arc')).toHaveLength(data.length);
      expect(
        canvas.commands
          .flatMap((c) => c.args)
          .filter((v) => typeof v === 'number')
          .every(Number.isFinite)
      ).toBe(true);
    }
  });

  test('仅点附近触发 tooltip，并保留点名称与两个原始坐标', () => {
    const hits: unknown[] = [];
    const { chart } = scatterFixture({
      series: [{ name: '城市', data: [{ name: '杭州', value: [5, 50] }] }],
      tooltip: {
        formatter: (params: unknown) => {
          hits.push(params);
          return '命中';
        },
      },
    });
    chart.render().setHover(219, 138);
    expect(hits).toEqual([
      {
        x: 219,
        y: 138,
        name: '杭州',
        items: [{ name: '城市', value: '(5, 50)', color: '#1677ff' }],
      },
    ]);
    chart.setHover(230, 150);
    expect(hits).toHaveLength(1);
  });

  test('数据更新与 resize 后命中位置同步更新', () => {
    let hits = 0;
    const { chart, canvas } = scatterFixture({
      series: [{ data: [[5, 50]] }],
      tooltip: {
        formatter: () => {
          hits += 1;
          return '命中';
        },
      },
    });
    chart.render();
    chart.setOption({ series: [{ data: [[10, 100]] }] }).render();
    chart.setHover(217, 136.5);
    expect(hits).toBe(0);
    chart.resize(600, 300).render();
    const arcs = canvas.of('arc');
    expect(arcs[arcs.length - 1]?.slice(0, 2)).toEqual([584, 12]);
    chart.setHover(584, 12);
    expect(hits).toBe(1);
  });

  test('numeric x 轴格式化、竖向网格与绘图区内裁剪', () => {
    const { canvas, chart } = scatterFixture({
      xAxis: {
        min: 0,
        max: 10,
        splitCount: 2,
        format: (v: number) => `${v}元`,
      },
    });
    chart.render();
    expect(canvas.of('fillText').map((args) => args[0])).toContain('10元');
    expect(canvas.of('moveTo')).toContainEqual([217, 12]);
    expect(canvas.of('lineTo')).toContainEqual([217, 261]);
    expect(canvas.of('rect')).toContainEqual([50, 12, 334, 249]);
    expect(canvas.of('clip')).toHaveLength(1);
  });

  test('无效轴范围显式报错，避免生成非有限坐标', () => {
    for (const xAxis of [
      { min: 1, max: 1 },
      { min: 10, max: 0 },
      { min: NaN },
      { splitCount: 0 },
    ]) {
      const { chart } = scatterFixture({ xAxis });
      expect(() => chart.render()).toThrow(/ScatterChart/);
    }
  });

  test('悬浮时更新数据刷新 tooltip，清空数据移除旧 tooltip', () => {
    const values: string[] = [];
    const { chart } = scatterFixture({
      series: [{ data: [[5, 50]] }],
      tooltip: {
        formatter: (params: TooltipParams) => {
          values.push(String(params.items[0].value));
          return '命中';
        },
      },
    });
    chart.render().setHover(217, 136.5);
    chart.setOption({ series: [{ data: [[5, 51]] }] }).render();
    expect(values).toEqual(['(5, 50)', '(5, 51)']);
    chart.setOption({ series: [] }).render();
    expect(values).toHaveLength(2);
  });
});
