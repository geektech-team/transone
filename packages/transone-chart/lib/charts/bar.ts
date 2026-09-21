/**
 * 柱状图：纵向 / 横向，支持多系列分组与 stack 堆叠。
 *
 * 几何规则：
 * - 分组：同一类目内多个系列并排，子柱宽 = 类目带宽 × (1 - gap) / 系列数 × 0.8
 * - 堆叠：同名 stack 系列共用一根柱，后一个系列从前一个的顶端继续累加
 * - 数值轴强制包含 0（柱形高度必须从零线起算才有意义）
 */

import type { ICanvas2D } from '../core/canvas';
import { ChartBase } from '../core/chart';
import type { CategoryScale } from '../core/scale';
import type { LayoutResult } from '../core/layout';
import type { LegendItem } from '../core/legend';
import type { BarChartOption, BarSeries, TooltipParams } from '../types';

/** 柱体在类目带内的水平偏移与宽度（纵向）或垂直偏移与高度（横向）。 */
interface Slot {
  offset: number;
  size: number;
}

export class BarChart extends ChartBase<BarChartOption> {
  protected isHorizontal(): boolean {
    return this.option.horizontal ?? false;
  }

  protected getValueDomain(): { min: number; max: number } {
    const { series, yAxis } = this.option;
    let max = 0;
    let min = 0;

    // 堆叠：按 stack 组在类目上累加正负
    const stackGroups = groupStacks(series);
    const categoryCount = Math.max(
      0,
      ...series.map((s) => s.data.length)
    );

    for (let i = 0; i < categoryCount; i += 1) {
      for (const group of stackGroups) {
        let positive = 0;
        let negative = 0;
        for (const s of group) {
          const v = s.data[i] ?? 0;
          if (v >= 0) {
            positive += v;
          } else {
            negative += v;
          }
        }
        if (positive > max) {
          max = positive;
        }
        if (negative < min) {
          min = negative;
        }
      }
    }

    if (yAxis?.min !== undefined) {
      min = Math.min(min, yAxis.min);
    }
    if (yAxis?.max !== undefined) {
      max = Math.max(max, yAxis.max);
    }
    return { min, max };
  }

  protected getCategoryLabels(): readonly string[] {
    return this.option.xAxis.labels;
  }

  protected getLegendItems(): LegendItem[] {
    return this.option.series
      .filter((s) => s.name)
      .map((s, i) => ({
        name: s.name as string,
        color: this.seriesColor(i, s.color),
      }));
  }

  protected drawSeries(
    ctx: ICanvas2D,
    layout: LayoutResult,
    option: BarChartOption
  ): void {
    const scales = this.cartesian;
    if (!scales) {
      return;
    }
    void layout; // 柱体几何全部由比例尺绝对坐标决定，无需 plot 引用
    const { value, category } = scales;
    const horizontal = option.horizontal ?? false;

    const stackGroups = groupStacks(option.series);
    const categoryCount = option.xAxis.labels.length;
    const hoverIndex = this.getHoverCategoryIndex();

    for (let i = 0; i < categoryCount; i += 1) {
      // 每个类目带内：无堆叠时按系列分组并排；有堆叠时按 stack 组并排
      const groups = stackGroups;
      const seriesCount = groups.length;
      const explicitWidth = option.series
        .map((s) => s.barWidth)
        .find((w) => w !== undefined && w > 0);
      const slot = this.computeSlot(category, seriesCount, explicitWidth);
      const isHovered = hoverIndex === i;

      groups.forEach((group, groupIndex) => {
        const slotOffset = slot.offset + groupIndex * slot.size;
        let cursor = 0; // 堆叠游标（绝对值累加）

        group.forEach((series) => {
          const raw = series.data[i] ?? 0;
          const baseColor = this.seriesColor(
            option.series.indexOf(series),
            series.color
          );
          const color = isHovered ? lightenColor(baseColor, 0.25) : baseColor;

          if (horizontal) {
            const x0 = value.scale(0);
            const x1 = value.scale(cursor + raw);
            const base = Math.min(x0, x1);
            const width = Math.abs(x1 - x0);
            const y = category.bandStart(i) + slotOffset;
            this.drawBar(ctx, {
              x: base,
              y,
              width,
              height: slot.size,
              radius: series.borderRadius ?? 0,
              color,
              roundSide: raw >= 0 ? 'right' : 'left',
            });
          } else {
            const y0 = value.scale(cursor);
            const y1 = value.scale(cursor + raw);
            const top = Math.min(y0, y1);
            const height = Math.abs(y1 - y0);
            const x = category.bandStart(i) + slotOffset;
            this.drawBar(ctx, {
              x,
              y: top,
              width: slot.size,
              height,
              radius: series.borderRadius ?? 0,
              color,
              roundSide: raw >= 0 ? 'top' : 'bottom',
            });
          }

          cursor += raw;
        });
      });
    }
  }

  /** 命中检测：点落在某类目的柱体带内即显示该类目所有系列值。 */
  protected hitTestSeries(x: number, y: number): TooltipParams | null {
    const scales = this.cartesian;
    if (!scales) {
      return null;
    }
    const horizontal = this.option.horizontal ?? false;
    const labels = this.getCategoryLabels();

    // 命中整个类目带（含柱间间隙）：鼠标在类目带内即命中，避免间隙处 tooltip 消失
    for (let i = 0; i < labels.length; i += 1) {
      const start = scales.category.bandStart(i);
      const band = scales.category.bandWidth;
      const hit = horizontal
        ? y >= start && y <= start + band
        : x >= start && x <= start + band;
      if (!hit) {
        continue;
      }
      // 该类目下所有系列（堆叠时为各段值）
      const items = this.option.series.map((s, si) => ({
        name: s.name ?? `系列${si + 1}`,
        value: s.data[i] ?? 0,
        color: this.seriesColor(si, s.color),
      }));
      return { x, y, name: labels[i], items };
    }
    return null;
  }

  /** 从 hover 状态解析命中的类目索引，未命中返回 -1。 */
  private getHoverCategoryIndex(): number {
    const hover = this.hover;
    if (!hover) {
      return -1;
    }
    const labels = this.getCategoryLabels();
    return labels.indexOf(hover.name);
  }

  private computeSlot(
    category: CategoryScale,
    groupCount: number,
    explicitWidth?: number
  ): Slot {
    const band = category.bandWidth;
    const inner = category.innerWidth();
    if (explicitWidth !== undefined) {
      // 显式柱宽：整组在类目带内居中
      return {
        offset: (band - explicitWidth * groupCount) / 2,
        size: explicitWidth,
      };
    }
    const size = (inner / Math.max(1, groupCount)) * 0.8;
    // 柱区（size × groupCount）先在 inner 内居中，再随 inner 在类目带内居中，
    // 保证整组柱中心落在类目中心（与轴标签 center(i) 对齐）。
    const bandSide = (band - inner) / 2;
    const innerSide = (inner - size * groupCount) / 2;
    return { offset: bandSide + innerSide, size };
  }

  private drawBar(
    ctx: ICanvas2D,
    bar: {
      x: number;
      y: number;
      width: number;
      height: number;
      radius: number;
      color: string;
      roundSide: 'top' | 'bottom' | 'right' | 'left';
    }
  ): void {
    if (bar.width <= 0 || bar.height <= 0) {
      return;
    }
    ctx.save();
    ctx.fillStyle = bar.color;
    ctx.beginPath();
    roundRectPath(ctx, bar, bar.radius, bar.roundSide);
    ctx.fill();
    ctx.restore();
  }
}

/** 按 stack 分组：无 stack 的系列各自成组；同名 stack 合并为一组。 */
function groupStacks(series: readonly BarSeries[]): BarSeries[][] {
  const groups: BarSeries[][] = [];
  const stackMap = new Map<string, BarSeries[]>();

  for (const s of series) {
    if (s.stack) {
      let group = stackMap.get(s.stack);
      if (!group) {
        group = [];
        stackMap.set(s.stack, group);
        groups.push(group);
      }
      group.push(s);
    } else {
      groups.push([s]);
    }
  }
  return groups;
}

/**
 * 圆角柱体路径：仅 roundSide 指示的一侧（两个角）圆角。
 * - 纵向柱：'top' 顶部两角 / 'bottom' 底部两角
 * - 横向柱：'right' 右侧两角 / 'left' 左侧两角
 */
function roundRectPath(
  ctx: ICanvas2D,
  bar: { x: number; y: number; width: number; height: number },
  radius: number,
  roundSide: 'top' | 'bottom' | 'right' | 'left'
): void {
  const { x, y, width, height } = bar;
  const r = Math.min(radius, width / 2, height / 2);
  if (r <= 0) {
    ctx.rect(x, y, width, height);
    return;
  }

  const roundTopLeft = roundSide === 'top' || roundSide === 'left';
  const roundTopRight = roundSide === 'top' || roundSide === 'right';
  const roundBottomLeft = roundSide === 'bottom' || roundSide === 'left';
  const roundBottomRight = roundSide === 'bottom' || roundSide === 'right';

  ctx.moveTo(x + (roundTopLeft ? r : 0), y);
  ctx.lineTo(x + width - (roundTopRight ? r : 0), y);
  if (roundTopRight) {
    ctx.arcTo(x + width, y, x + width, y + r, r);
  } else {
    ctx.lineTo(x + width, y);
  }

  ctx.lineTo(x + width, y + height - (roundBottomRight ? r : 0));
  if (roundBottomRight) {
    ctx.arcTo(x + width, y + height, x + width - r, y + height, r);
  } else {
    ctx.lineTo(x + width, y + height);
  }

  ctx.lineTo(x + (roundBottomLeft ? r : 0), y + height);
  if (roundBottomLeft) {
    ctx.arcTo(x, y + height, x, y + height - r, r);
  } else {
    ctx.lineTo(x, y + height);
  }

  ctx.lineTo(x, y + (roundTopLeft ? r : 0));
  if (roundTopLeft) {
    ctx.arcTo(x, y, x + r, y, r);
  } else {
    ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** 将颜色向白色方向混合 amount（0~1），支持 #rrggbb 与 rgba()。 */
function lightenColor(color: string, amount: number): string {
  const a = Math.max(0, Math.min(1, amount));

  // #rrggbb / #rgb
  const hex = color.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let r: number;
    let g: number;
    let b: number;
    const h = hex[1];
    if (h.length === 3) {
      r = parseInt(h[0] + h[0], 16);
      g = parseInt(h[1] + h[1], 16);
      b = parseInt(h[2] + h[2], 16);
    } else {
      r = parseInt(h.slice(0, 2), 16);
      g = parseInt(h.slice(2, 4), 16);
      b = parseInt(h.slice(4, 6), 16);
    }
    r = Math.round(r + (255 - r) * a);
    g = Math.round(g + (255 - g) * a);
    b = Math.round(b + (255 - b) * a);
    return `rgb(${r}, ${g}, ${b})`;
  }

  // rgba(r, g, b, a?) / rgb(r, g, b)
  const rgba = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgba) {
    const r = Math.round(parseInt(rgba[1]) + (255 - parseInt(rgba[1])) * a);
    const g = Math.round(parseInt(rgba[2]) + (255 - parseInt(rgba[2])) * a);
    const b = Math.round(parseInt(rgba[3]) + (255 - parseInt(rgba[3])) * a);
    return `rgb(${r}, ${g}, ${b})`;
  }

  return color;
}
