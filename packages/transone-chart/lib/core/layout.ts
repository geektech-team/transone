/**
 * 图表布局计算：在给定画布尺寸内，按 title / legend / 坐标轴标签区
 * 逐层扣除，得到最终绘图区（plot）。
 *
 * 布局只依赖注入的文本测量函数，不接触 Canvas 上下文本身，
 * 保持纯逻辑可测。
 */

import type { LegendOption, TitleOption } from '../types';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutInput {
  width: number;
  height: number;
  title?: TitleOption;
  /** 图例配置（已解析 show/position）。 */
  legend?: LegendOption;
  /** 图例项名称列表（用于测量总宽度）。 */
  legendItems?: readonly string[];
  /** 数值轴刻度标签（测量最大宽度）。 */
  valueLabels?: readonly string[];
  /** 类目轴标签（测量最大宽度/高度）。 */
  categoryLabels?: readonly string[];
  /** 横向布局（横向柱状图）：类目轴占左侧、数值轴占底部。 */
  horizontal?: boolean;
  /** 基础内边距，默认 { top: 12, right: 16, bottom: 12, left: 16 }。 */
  basePadding?: Partial<Padding>;
}

export interface LayoutResult {
  /** 绘图区（含网格与数据系列）。 */
  plot: Box;
  /** 数值轴标签区（横轴图中在左侧，横向图中在底部）。 */
  valueAxisBox: Box;
  /** 类目轴标签区（横轴图中在底部，横向图中在左侧）。 */
  categoryAxisBox: Box;
  /** 标题占用区（若存在）。 */
  titleBox: Box | null;
  /** 图例占用区（若存在）。 */
  legendBox: Box | null;
  padding: Padding;
}

export type MeasureTextFn = (text: string) => number;

const DEFAULT_PADDING: Padding = { top: 12, right: 16, bottom: 12, left: 16 };
const TITLE_PADDING = 16;
const AXIS_LABEL_PADDING = 8;
const LEGEND_PADDING = 12;

/** 计算图例占用的行高（top/bottom 单行）或列宽（right 纵向）。 */
function measureLegend(
  input: LayoutInput,
  measure: MeasureTextFn
): { width: number; height: number } {
  const { legend } = input;
  const items = input.legendItems ?? [];
  const fontSize = legend?.fontSize ?? 12;
  const itemGap = legend?.itemGap ?? 16;
  const markerSize = legend?.markerSize ?? 12;

  if (legend?.position === 'right') {
    // 纵向：宽度 = 最宽项（色块 + 间距 + 文本），高度 = 项数 × 行高
    let maxWidth = 0;
    for (const item of items) {
      const w = markerSize + 6 + measure(item);
      if (w > maxWidth) {
        maxWidth = w;
      }
    }
    return {
      width: maxWidth + LEGEND_PADDING,
      height: Math.max(items.length * (fontSize + 8) + LEGEND_PADDING, 0),
    };
  }

  // 横向：单行居中，总宽 = 各项宽之和
  let totalWidth = 0;
  for (const item of items) {
    totalWidth += markerSize + 6 + measure(item) + itemGap;
  }
  if (totalWidth > 0) {
    totalWidth -= itemGap;
  }
  return { width: totalWidth, height: fontSize + LEGEND_PADDING + 4 };
}

/**
 * 计算完整布局。规则：
 * - title 固定顶部
 * - legend：top → title 之下；bottom → 底部；right → 最右侧
 * - 数值轴标签区与类目轴标签区按 horizontal 互换左右/底部
 */
export function computeLayout(
  input: LayoutInput,
  measure: MeasureTextFn
): LayoutResult {
  const padding: Padding = { ...DEFAULT_PADDING, ...input.basePadding };

  let top = padding.top;
  let bottom = padding.bottom;
  let left = padding.left;
  let right = padding.right;

  let titleBox: Box | null = null;
  if (input.title?.text) {
    const fontSize = input.title.fontSize ?? 16;
    titleBox = { x: 0, y: 0, width: input.width, height: fontSize };
    top += fontSize + (input.title.padding ?? TITLE_PADDING);
  }

  let legendBox: Box | null = null;
  const legend = input.legend;
  if (legend && legend.show !== false && (input.legendItems?.length ?? 0) > 0) {
    const size = measureLegend(input, measure);
    const position = legend.position ?? 'top';
    if (position === 'top') {
      legendBox = {
        x: 0,
        y: titleBox ? titleBox.height : 0,
        width: input.width,
        height: size.height,
      };
      top += size.height;
    } else if (position === 'bottom') {
      legendBox = {
        x: 0,
        y: input.height - size.height,
        width: input.width,
        height: size.height,
      };
      bottom += size.height;
    } else {
      legendBox = {
        x: input.width - size.width,
        y: top,
        width: size.width,
        height: Math.max(0, input.height - top - bottom),
      };
      right += size.width;
    }
  }

  // 坐标轴标签区
  const labelFontSize = 11;
  let valueAxisWidth = 0;
  let categoryAxisHeight = 0;
  let valueAxisHeight = 0;
  let categoryAxisWidth = 0;

  const valueLabels = input.valueLabels ?? [];
  const categoryLabels = input.categoryLabels ?? [];

  if (input.horizontal) {
    // 横向图：类目轴在左侧（列宽），数值轴在底部（行高）
    if (categoryLabels.length > 0) {
      for (const label of categoryLabels) {
        const w = measure(label);
        if (w > categoryAxisWidth) {
          categoryAxisWidth = w;
        }
      }
      categoryAxisWidth += AXIS_LABEL_PADDING * 2;
      left += categoryAxisWidth;
    }
    if (valueLabels.length > 0) {
      valueAxisHeight = labelFontSize + AXIS_LABEL_PADDING * 2;
      bottom += valueAxisHeight;
    }
  } else {
    if (valueLabels.length > 0) {
      for (const label of valueLabels) {
        const w = measure(label);
        if (w > valueAxisWidth) {
          valueAxisWidth = w;
        }
      }
      valueAxisWidth += AXIS_LABEL_PADDING * 2;
      left += valueAxisWidth;
    }
    if (categoryLabels.length > 0) {
      categoryAxisHeight = labelFontSize + AXIS_LABEL_PADDING * 2;
      bottom += categoryAxisHeight;
    }
  }

  const plotWidth = Math.max(0, input.width - left - right);
  const plotHeight = Math.max(0, input.height - top - bottom);

  const plot: Box = { x: left, y: top, width: plotWidth, height: plotHeight };

  const valueAxisBox: Box = input.horizontal
    ? { x: plot.x, y: plot.y + plot.height, width: plotWidth, height: valueAxisHeight }
    : { x: plot.x - valueAxisWidth, y: top, width: valueAxisWidth, height: plotHeight };

  const categoryAxisBox: Box = input.horizontal
    ? { x: plot.x - categoryAxisWidth, y: top, width: categoryAxisWidth, height: plotHeight }
    : { x: left, y: plot.y + plotHeight, width: plotWidth, height: categoryAxisHeight };

  return {
    plot,
    valueAxisBox,
    categoryAxisBox,
    titleBox,
    legendBox,
    padding,
  };
}
