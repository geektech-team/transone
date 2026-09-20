/**
 * 比例尺：把数据域（domain）映射到像素范围（range）。
 *
 * - LinearScale：数值 → 像素，自动 nice 刻度（0.5 / 1 / 2 / 5 步进）
 * - CategoryScale：类目索引 → 像素带（band），供柱状图计算柱宽
 *
 * 纯函数与轻量类实现，零平台依赖，便于单元测试。
 */

/** 数值域映射接口。 */
export interface LinearScaleOptions {
  /** 数据最小值（未指定则按数据自动 nice）。 */
  min?: number;
  /** 数据最大值（未指定则按数据自动 nice）。 */
  max?: number;
  /** 期望刻度分段数，默认 5。 */
  splitCount?: number;
}

export interface ScaleResult {
  /** 映射后的像素坐标（已夹取到 range 内）。 */
  scale(value: number): number;
  /** nice 后的实际最小值。 */
  min: number;
  /** nice 后的实际最大值。 */
  max: number;
  /** 刻度值数组（含 min/max）。 */
  ticks: number[];
}

/**
 * 计算 nice 刻度：把任意 [min, max] 数据范围规整为"美观"范围与刻度。
 * 步进从 1 / 2 / 5 × 10^n 中选择，保证刻度间距整齐。
 */
export function niceTicks(
  rawMin: number,
  rawMax: number,
  splitCount = 5
): { min: number; max: number; step: number; ticks: number[] } {
  let min = rawMin;
  let max = rawMax;

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error('niceTicks: domain must be finite numbers');
  }
  if (min === max) {
    // 常量数据：人为撑开一个单位区间，避免除以零
    const pad = Math.abs(min) > 1 ? Math.abs(min) * 0.1 : 1;
    min -= pad;
    max += pad;
  }
  if (min > max) {
    [min, max] = [max, min];
  }

  const span = max - min;
  const roughStep = span / Math.max(1, splitCount);
  const step = niceStep(roughStep);

  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 1e-9; v += step) {
    // 浮点误差收敛：四舍五入到 step 的小数位数
    ticks.push(roundToStep(v, step));
  }

  return { min: niceMin, max: niceMax, step, ticks };
}

function niceStep(rough: number): number {
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const fraction = rough / power;
  let niceFraction: number;
  if (fraction <= 1) {
    niceFraction = 1;
  } else if (fraction <= 2) {
    niceFraction = 2;
  } else if (fraction <= 5) {
    niceFraction = 5;
  } else {
    niceFraction = 10;
  }
  return niceFraction * power;
}

function roundToStep(value: number, step: number): number {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number(value.toFixed(decimals));
}

/** 线性比例尺：domain → [rangeStart, rangeEnd]，自动 nice。 */
export class LinearScale {
  public readonly min: number;
  public readonly max: number;
  public readonly ticks: number[];
  public readonly step: number;

  private readonly rangeStart: number;
  private readonly rangeEnd: number;

  public constructor(
    dataMin: number,
    dataMax: number,
    rangeStart: number,
    rangeEnd: number,
    options: LinearScaleOptions = {}
  ) {
    const { min: explicitMin, max: explicitMax, splitCount = 5 } = options;

    let min = explicitMin;
    let max = explicitMax;

    if (min === undefined || max === undefined) {
      const auto = niceTicks(dataMin, dataMax, splitCount);
      min = min ?? auto.min;
      max = max ?? auto.max;
      this.ticks = auto.ticks;
      this.step = auto.step;
    } else {
      this.step = (max - min) / Math.max(1, splitCount);
      this.ticks = [];
      for (let i = 0; i <= splitCount; i += 1) {
        this.ticks.push(min + i * this.step);
      }
    }

    this.min = min;
    this.max = max;
    this.rangeStart = rangeStart;
    this.rangeEnd = rangeEnd;
  }

  /** 数值 → 像素坐标（反向轴传 rangeEnd > rangeStart 即自然反转）。 */
  public scale(value: number): number {
    const ratio = (value - this.min) / (this.max - this.min);
    return this.rangeStart + ratio * (this.rangeEnd - this.rangeStart);
  }
}

/** 类目比例尺：N 个类目 → range 内均分带（band）。 */
export class CategoryScale {
  /** 每个类目带的像素宽度。 */
  public readonly bandWidth: number;
  /** 类目带之间的间距占比（0~1），默认 0.35。 */
  public readonly innerGapRatio: number;

  private readonly rangeStart: number;

  public constructor(
    public readonly categories: readonly unknown[],
    rangeStart: number,
    rangeEnd: number,
    innerGapRatio = 0.35
  ) {
    this.innerGapRatio = innerGapRatio;
    this.rangeStart = rangeStart;
    const count = Math.max(1, categories.length);
    this.bandWidth = (rangeEnd - rangeStart) / count;
  }

  /** 第 index 个类目的带起始（绝对像素坐标）。 */
  public bandStart(index: number): number {
    return this.rangeStart + this.bandWidth * index;
  }

  /** 第 index 个类目的带中心（绝对像素坐标）。 */
  public center(index: number): number {
    return this.bandStart(index) + this.bandWidth / 2;
  }

  /** 可用绘图宽度 = 带宽 × (1 - innerGapRatio)。 */
  public innerWidth(): number {
    return this.bandWidth * (1 - this.innerGapRatio);
  }

  /** 每组（多系列）子柱宽度：按系列数均分可用宽度，并预留 20% 间隙。 */
  public groupInnerWidth(groupCount: number): number {
    const usable = this.innerWidth();
    return usable / Math.max(1, groupCount) * 0.8;
  }
}
