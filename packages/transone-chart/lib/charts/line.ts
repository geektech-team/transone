/**
 * 折线图：多系列 / 平滑曲线 / 面积填充 / 数据点标记。
 * 类目 x 轴 + 数值 y 轴，复用 ChartBase 的笛卡尔管线。
 */

import type { ICanvas2D } from '../core/canvas';
import { ChartBase } from '../core/chart';
import type { LayoutResult } from '../core/layout';
import type { LegendItem } from '../core/legend';
import type { LineChartOption } from '../types';

interface Point {
  x: number;
  y: number;
}

export class LineChart extends ChartBase<LineChartOption> {
  protected getValueDomain(): { min: number; max: number } {
    const { series, yAxis, startFromZero = false } = this.option;
    let min = Infinity;
    let max = -Infinity;
    for (const s of series) {
      for (const value of s.data) {
        if (value < min) {
          min = value;
        }
        if (value > max) {
          max = value;
        }
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { min: 0, max: 1 };
    }
    if (startFromZero && min > 0) {
      min = 0;
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
    option: LineChartOption
  ): void {
    const scales = this.cartesian;
    if (!scales) {
      return;
    }
    const { plot } = layout;
    const { value, category } = scales;

    const pointsPerSeries: Point[][] = option.series.map((series) =>
      series.data.map((d, i) => ({
        x: category.center(i),
        y: value.scale(d),
      }))
    );

    option.series.forEach((series, index) => {
      const points = pointsPerSeries[index];
      if (points.length === 0) {
        return;
      }
      const color = this.seriesColor(index, series.color);
      const lineWidth = series.lineWidth ?? 2;

      // 面积填充（先画，保证在折线之下）
      if (series.area) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        this.tracePath(ctx, points, series.smooth ?? false);
        ctx.lineTo(points[points.length - 1].x, plot.y + plot.height);
        ctx.lineTo(points[0].x, plot.y + plot.height);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // 折线
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      this.tracePath(ctx, points, series.smooth ?? false);
      ctx.stroke();
      ctx.restore();

      // 数据点标记
      if (series.showSymbol !== false) {
        ctx.save();
        ctx.fillStyle = color;
        for (const p of points) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(2.5, lineWidth + 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    });
  }

  /** 折线路径：直线或 Catmull-Rom 平滑插值（三次贝塞尔）。 */
  private tracePath(ctx: ICanvas2D, points: readonly Point[], smooth: boolean): void {
    if (points.length === 0) {
      return;
    }
    ctx.moveTo(points[0].x, points[0].y);
    if (!smooth || points.length < 3) {
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      return;
    }

    for (let i = 0; i < points.length - 1; i += 1) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }
}
