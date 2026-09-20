import { describe, expect, test } from 'bun:test';
import {
  CategoryScale,
  LinearScale,
  niceTicks,
} from '../lib/core/scale';

describe('niceTicks', () => {
  test('规整 0..100 到 5 段', () => {
    const result = niceTicks(0, 100, 5);
    expect(result.min).toBe(0);
    expect(result.max).toBe(100);
    expect(result.step).toBe(20);
    expect(result.ticks).toEqual([0, 20, 40, 60, 80, 100]);
  });

  test('非常量数据自动撑开', () => {
    const result = niceTicks(10, 10);
    expect(result.max).toBeGreaterThan(result.min);
    expect(result.ticks.length).toBeGreaterThan(1);
  });

  test('小数域使用合适步进', () => {
    const result = niceTicks(0.3, 0.9, 3);
    expect(result.step).toBeGreaterThan(0);
    // 刻度覆盖 [0.3, 0.9]
    expect(result.min).toBeLessThanOrEqual(0.3);
    expect(result.max).toBeGreaterThanOrEqual(0.9);
  });

  test('负值域正确', () => {
    const result = niceTicks(-50, 50, 4);
    expect(result.min).toBe(-50);
    expect(result.max).toBe(50);
    // span 100 / 4 = 25 → nice 步进取 50（25 落在 (2,5] 区间 → 5 × 10）
    expect(result.step).toBe(50);
    expect(result.ticks).toEqual([-50, 0, 50]);
  });

  test('非有限数抛错', () => {
    expect(() => niceTicks(NaN, 10)).toThrow();
  });
});

describe('LinearScale', () => {
  test('数值映射到像素范围（正向）', () => {
    const scale = new LinearScale(0, 100, 0, 100);
    expect(scale.scale(0)).toBe(0);
    expect(scale.scale(50)).toBe(50);
    expect(scale.scale(100)).toBe(100);
  });

  test('反向范围自然反转（大值在上方）', () => {
    const scale = new LinearScale(0, 100, 200, 0);
    expect(scale.scale(0)).toBe(200);
    expect(scale.scale(100)).toBe(0);
  });

  test('显式 min/max 生成等距刻度', () => {
    const scale = new LinearScale(0, 100, 0, 100, {
      min: -20,
      max: 80,
      splitCount: 5,
    });
    expect(scale.min).toBe(-20);
    expect(scale.max).toBe(80);
    expect(scale.ticks).toEqual([-20, 0, 20, 40, 60, 80]);
  });

  test('自动 nice 覆盖数据范围', () => {
    const scale = new LinearScale(3, 97, 0, 100, { splitCount: 5 });
    expect(scale.min).toBeLessThanOrEqual(3);
    expect(scale.max).toBeGreaterThanOrEqual(97);
    expect(scale.ticks[0]).toBe(scale.min);
    expect(scale.ticks[scale.ticks.length - 1]).toBe(scale.max);
  });
});

describe('CategoryScale', () => {
  test('带宽均分', () => {
    const scale = new CategoryScale(['A', 'B', 'C', 'D'], 100, 300);
    expect(scale.bandWidth).toBe(50);
    expect(scale.center(0)).toBe(125);
    expect(scale.center(1)).toBe(175);
    expect(scale.bandStart(1)).toBe(150);
  });

  test('内宽受 gap 比例影响', () => {
    const scale = new CategoryScale(['A', 'B'], 0, 100, 0.25);
    expect(scale.innerWidth()).toBe(37.5);
  });

  test('空类目安全', () => {
    const scale = new CategoryScale([], 0, 100);
    expect(scale.bandWidth).toBe(100);
  });
});
