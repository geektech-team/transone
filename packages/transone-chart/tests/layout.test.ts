import { describe, expect, test } from 'bun:test';
import { computeLayout } from '../lib/core/layout';

const measure = (text: string): number => text.length * 6;

describe('computeLayout', () => {
  test('无 title/legend：plot 扣基础内边距（无轴标签时不预留轴区）', () => {
    const layout = computeLayout(
      { width: 400, height: 300 },
      measure
    );
    expect(layout.plot.x).toBe(16);
    expect(layout.plot.y).toBe(12);
    expect(layout.plot.height).toBe(300 - 12 - 12);
    expect(layout.plot.width).toBe(400 - 16 - 16);
    expect(layout.titleBox).toBeNull();
    expect(layout.legendBox).toBeNull();
  });

  test('title 存在时顶部被占用', () => {
    const layout = computeLayout(
      {
        width: 400,
        height: 300,
        title: { text: '标题' },
      },
      measure
    );
    expect(layout.titleBox).not.toBeNull();
    expect(layout.titleBox?.height).toBe(16);
    // 16(title) + 16(padding) + 12(base top)
    expect(layout.plot.y).toBe(44);
  });

  test('legend top 在 title 之下追加', () => {
    const layout = computeLayout(
      {
        width: 400,
        height: 300,
        legend: { position: 'top' },
        legendItems: ['系列A', '系列B'],
      },
      measure
    );
    expect(layout.legendBox).not.toBeNull();
    // legend 高 = fontSize(12) + 12 + 4 = 28
    expect(layout.legendBox?.height).toBe(28);
    expect(layout.plot.y).toBe(12 + 28);
  });

  test('legend right 占右侧列宽', () => {
    const layout = computeLayout(
      {
        width: 400,
        height: 300,
        legend: { position: 'right' },
        legendItems: ['这是一个很长的系列名称'],
      },
      measure
    );
    expect(layout.legendBox).not.toBeNull();
    expect(layout.plot.width).toBeLessThan(400 - 16 - 16);
  });

  test('数值轴标签宽度影响左侧轴区', () => {
    const layout = computeLayout(
      {
        width: 400,
        height: 300,
        valueLabels: ['100', '1000', '100000'],
      },
      measure
    );
    // 最长 '100000' = 6字符 × 6 = 36 → 轴区 = 36 + 16 = 52
    expect(layout.plot.x).toBe(16 + 52);
  });

  test('horizontal：类目轴在左、数值轴在底', () => {
    const layout = computeLayout(
      {
        width: 400,
        height: 300,
        horizontal: true,
        categoryLabels: ['类别A', '类别B'],
        valueLabels: ['0', '50', '100'],
      },
      measure
    );
    // 类目轴占左侧：'类别A' = 3字符 × 6 = 18 → +16 = 34
    expect(layout.plot.x).toBe(16 + 34);
    // 数值轴占底部：11 + 16 = 27 → bottom = 12 + 27
    expect(layout.plot.height).toBe(300 - 12 - 12 - 27);
    // valueAxisBox 在绘图区下方（底部数值轴区）
    expect(layout.valueAxisBox.y).toBe(layout.plot.y + layout.plot.height);
    expect(layout.valueAxisBox.height).toBe(27);
    // categoryAxisBox 在绘图区左侧（类目轴区）
    expect(layout.categoryAxisBox.x).toBe(layout.plot.x - 34);
    expect(layout.categoryAxisBox.width).toBe(34);
  });

  test('legend 关闭时忽略图例项', () => {
    const layout = computeLayout(
      {
        width: 400,
        height: 300,
        legend: { show: false, position: 'top' },
        legendItems: ['X'],
      },
      measure
    );
    expect(layout.legendBox).toBeNull();
  });
});
