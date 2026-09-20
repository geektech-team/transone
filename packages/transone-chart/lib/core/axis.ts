/**
 * 坐标轴绘制：数值轴（默认纵向居左、横向图居底）与类目轴（默认横向居底、
 * 横向图居左）。网格线与刻度标签统一在这里绘制，数据系列只画在 plot 内。
 *
 * 位置计算全部基于布局结果与比例尺，与平台无关。
 */

import type { ICanvas2D } from './canvas';
import type { Box } from './layout';
import { CategoryScale, LinearScale } from './scale';
import { applyFont } from './text';
import {
  DEFAULT_AXIS_COLOR,
  DEFAULT_GRID_COLOR,
  DEFAULT_TEXT_COLOR,
} from '../types';

export interface ValueAxisDrawOptions {
  /** 绘图区。 */
  plot: Box;
  /** 数值比例尺：纵向图 range=[plot.bottom, plot.top]，横向图 range=[plot.left, plot.right]。 */
  scale: LinearScale;
  /** 刻度标签（长度需与 scale.ticks 一致）。 */
  labels: readonly string[];
  /** 横向图：数值轴位于底部。 */
  horizontal?: boolean;
  axisColor?: string;
  labelFontSize?: number;
  labelColor?: string;
  gridColor?: string;
  gridLineWidth?: number;
  gridLineDash?: readonly number[];
  showGrid?: boolean;
}

export interface CategoryAxisDrawOptions {
  plot: Box;
  scale: CategoryScale;
  labels: readonly string[];
  /** 横向图：类目轴位于左侧。 */
  horizontal?: boolean;
  axisColor?: string;
  labelFontSize?: number;
  labelColor?: string;
  gridColor?: string;
  gridLineWidth?: number;
  showGrid?: boolean;
}

export class AxisDrawer {
  public constructor(private readonly ctx: ICanvas2D) {}

  /** 绘制数值轴：网格横线（或纵向图时） + 刻度标签。 */
  public drawValueAxis(options: ValueAxisDrawOptions): void {
    const {
      plot,
      scale,
      labels,
      horizontal = false,
      labelFontSize = 11,
      labelColor = DEFAULT_TEXT_COLOR,
      gridColor = DEFAULT_GRID_COLOR,
      gridLineWidth = 1,
      gridLineDash,
      showGrid = true,
    } = options;

    const ticks = scale.ticks;
    const { ctx } = this;

    for (let i = 0; i < ticks.length; i += 1) {
      const pos = scale.scale(ticks[i]);
      const label = labels[i] ?? String(ticks[i]);

      if (showGrid) {
        ctx.save();
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = gridLineWidth;
        if (gridLineDash && gridLineDash.length > 0) {
          ctx.setLineDash(gridLineDash);
        }
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(plot.x, pos);
          ctx.lineTo(plot.x + plot.width, pos);
        } else {
          ctx.moveTo(plot.x, pos);
          ctx.lineTo(plot.x + plot.width, pos);
        }
        ctx.stroke();
        ctx.restore();
      }

      applyFont(ctx, labelFontSize);
      ctx.fillStyle = labelColor;
      ctx.textBaseline = 'middle';
      if (horizontal) {
        ctx.textAlign = 'center';
        ctx.fillText(label, pos, plot.y + plot.height + 8);
      } else {
        ctx.textAlign = 'right';
        ctx.fillText(label, plot.x - 8, pos);
      }
    }
  }

  /** 绘制类目轴：轴线 + 类目标签（可选竖网格）。 */
  public drawCategoryAxis(options: CategoryAxisDrawOptions): void {
    const {
      plot,
      scale,
      labels,
      horizontal = false,
      axisColor = DEFAULT_AXIS_COLOR,
      labelFontSize = 11,
      labelColor = DEFAULT_TEXT_COLOR,
      gridColor = DEFAULT_GRID_COLOR,
      gridLineWidth = 1,
      showGrid = false,
    } = options;

    const { ctx } = this;
    const count = labels.length;

    if (showGrid) {
      ctx.save();
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = gridLineWidth;
      ctx.beginPath();
      for (let i = 0; i < count; i += 1) {
        const pos = scale.center(i);
        if (horizontal) {
          ctx.moveTo(plot.x, pos);
          ctx.lineTo(plot.x + plot.width, pos);
        } else {
          ctx.moveTo(pos, plot.y);
          ctx.lineTo(pos, plot.y + plot.height);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    applyFont(ctx, labelFontSize);
    ctx.fillStyle = labelColor;
    ctx.textBaseline = 'middle';

    for (let i = 0; i < count; i += 1) {
      const pos = scale.center(i);
      if (horizontal) {
        ctx.textAlign = 'right';
        ctx.fillText(labels[i], plot.x - 8, pos);
      } else {
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], pos, plot.y + plot.height + 8);
      }
    }

    // 轴线
    ctx.save();
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (horizontal) {
      ctx.moveTo(plot.x, plot.y);
      ctx.lineTo(plot.x, plot.y + plot.height);
    } else {
      ctx.moveTo(plot.x, plot.y + plot.height);
      ctx.lineTo(plot.x + plot.width, plot.y + plot.height);
    }
    ctx.stroke();
    ctx.restore();
  }
}
