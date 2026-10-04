/**
 * 漏斗图：每个正值阶段的上边按最大值缩放，下边接续下一阶段宽度。
 * 阶段保留输入顺序，排序可选；零值保留标签和纵向位置，但不填充形状。
 */

import type { ICanvas2D } from '../core/canvas';
import { ChartBase } from '../core/chart';
import type { LayoutResult } from '../core/layout';
import type { LegendItem } from '../core/legend';
import { applyFont } from '../core/text';
import type { FunnelChartOption, FunnelDatum, TooltipParams } from '../types';

interface FunnelStage {
  datum: FunnelDatum;
  index: number;
  color: string;
}

interface FunnelGeometry {
  stage: FunnelStage;
  centerX: number;
  topY: number;
  height: number;
  topWidth: number;
  bottomWidth: number;
}

export class FunnelChart extends ChartBase<FunnelChartOption> {
  private geometries: FunnelGeometry[] = [];

  protected hasCartesianAxis(): boolean {
    return false;
  }

  protected getLegendItems(): LegendItem[] {
    return this.getStages().map((stage) => ({
      name: stage.datum.name,
      color: stage.color,
    }));
  }

  protected hitTestSeries(x: number, y: number): TooltipParams | null {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    for (const geometry of this.geometries) {
      const { stage, centerX, topY, height, topWidth, bottomWidth } = geometry;
      if (y < topY || y > topY + height) continue;
      const progress = (y - topY) / height;
      const width = topWidth + (bottomWidth - topWidth) * progress;
      if (width <= 0 || Math.abs(x - centerX) > width / 2) continue;

      return {
        x,
        y,
        name: stage.datum.name,
        items: [
          {
            name: stage.datum.name,
            value: stage.datum.value,
            color: stage.color,
          },
        ],
      };
    }
    return null;
  }

  protected drawSeries(
    ctx: ICanvas2D,
    layout: LayoutResult,
    option: FunnelChartOption
  ): void {
    // 每次渲染重新构建，避免 setOption / resize 后复用旧命中区域。
    this.geometries = [];
    const { plot } = layout;
    const stages = this.getStages();
    if (
      stages.length === 0 ||
      !Number.isFinite(plot.width) ||
      !Number.isFinite(plot.height) ||
      plot.width <= 0 ||
      plot.height <= 0
    ) {
      this.hover = null;
      return;
    }

    let maxValue = 0;
    for (const stage of stages)
      maxValue = Math.max(maxValue, stage.datum.value);

    const minWidth = Math.min(
      plot.width,
      FunnelNonNegative(option.minWidth, 0)
    );
    const gap =
      stages.length > 1
        ? Math.min(
            FunnelNonNegative(option.gap, 4),
            plot.height / (stages.length - 1)
          )
        : 0;
    const stageHeight = Math.max(
      0,
      (plot.height - gap * (stages.length - 1)) / stages.length
    );
    const widths = stages.map((stage) =>
      stage.datum.value > 0 && maxValue > 0
        ? Math.max(minWidth, (stage.datum.value / maxValue) * plot.width)
        : 0
    );
    const centerX = plot.x + plot.width / 2;

    ctx.save();
    applyFont(ctx, FunnelPositive(option.labelFontSize, 12));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    stages.forEach((stage, index) => {
      const topY = plot.y + index * (stageHeight + gap);
      const topWidth = widths[index]!;
      const bottomWidth = widths[index + 1] ?? minWidth;

      if (stage.datum.value > 0 && stageHeight > 0 && topWidth > 0) {
        const geometry: FunnelGeometry = {
          stage,
          centerX,
          topY,
          height: stageHeight,
          topWidth,
          bottomWidth,
        };
        this.geometries.push(geometry);
        ctx.fillStyle = stage.color;
        ctx.beginPath();
        ctx.moveTo(centerX - topWidth / 2, topY);
        ctx.lineTo(centerX + topWidth / 2, topY);
        ctx.lineTo(centerX + bottomWidth / 2, topY + stageHeight);
        ctx.lineTo(centerX - bottomWidth / 2, topY + stageHeight);
        ctx.closePath();
        ctx.fill();
      }

      if (option.showLabel !== false) {
        ctx.fillStyle =
          option.labelColor ?? (topWidth > 0 ? '#ffffff' : '#323233');
        ctx.fillText(
          `${stage.datum.name}: ${stage.datum.value}`,
          centerX,
          topY + stageHeight / 2,
          plot.width
        );
      }
    });
    ctx.restore();
  }

  /** 颜色先由原索引确定，再过滤与排序；不修改调用方的数据数组。 */
  private getStages(): FunnelStage[] {
    const stages: FunnelStage[] = [];
    this.option.data.forEach((datum, index) => {
      if (!Number.isFinite(datum.value) || datum.value < 0) return;
      stages.push({
        datum,
        index,
        color: this.seriesColor(index, datum.color),
      });
    });
    const sort = this.option.sort ?? 'none';
    if (sort === 'ascending' || sort === 'descending') {
      const direction = sort === 'ascending' ? 1 : -1;
      stages.sort(
        (a, b) =>
          direction * (a.datum.value - b.datum.value) || a.index - b.index
      );
    }
    return stages;
  }
}

function FunnelNonNegative(
  value: number | undefined,
  fallback: number
): number {
  return value !== undefined && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;
}

function FunnelPositive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}
