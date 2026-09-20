/**
 * 雷达图：多边形网格 + 指标轴 + 多系列区域/折线。
 * 指标刻度按各 indicator.max（缺省取所有系列该指标最大值）归一化。
 */

import type { ICanvas2D } from '../core/canvas';
import { ChartBase } from '../core/chart';
import type { LayoutResult } from '../core/layout';
import type { LegendItem } from '../core/legend';
import { applyFont } from '../core/text';
import type { RadarChartOption } from '../types';

interface PolarPoint {
  x: number;
  y: number;
}

export class RadarChart extends ChartBase<RadarChartOption> {
  protected hasCartesianAxis(): boolean {
    return false;
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
    option: RadarChartOption
  ): void {
    const { plot } = layout;
    const centerX = plot.x + plot.width / 2;
    const centerY = plot.y + plot.height / 2;
    const radius =
      option.radius ?? Math.min(plot.width, plot.height) / 2 * 0.6;
    const count = option.indicators.length;
    if (count === 0 || radius <= 0) {
      return;
    }

    const startAngle = option.startAngle ?? -Math.PI / 2;
    const step = TWO_PI / count;
    const splitCount = Math.max(1, option.splitCount ?? 5);
    const gridColor = option.gridColor ?? '#ebedf0';
    const gridLineWidth = option.gridLineWidth ?? 1;

    const vertexAngle = (index: number): number =>
      startAngle + index * step;

    const polarPoint = (angle: number, r: number): PolarPoint => ({
      x: centerX + Math.cos(angle) * r,
      y: centerY + Math.sin(angle) * r,
    });

    // 网格层：同心多边形
    for (let layer = 1; layer <= splitCount; layer += 1) {
      const r = (radius * layer) / splitCount;
      ctx.save();
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = gridLineWidth;
      ctx.beginPath();
      for (let i = 0; i < count; i += 1) {
        const p = polarPoint(vertexAngle(i), r);
        if (i === 0) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // 指标轴线
    ctx.save();
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = gridLineWidth;
    ctx.beginPath();
    for (let i = 0; i < count; i += 1) {
      const p = polarPoint(vertexAngle(i), radius);
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();

    // 指标标签（顶点外侧）
    const labelFontSize = option.labelFontSize ?? 11;
    applyFont(ctx, labelFontSize);
    ctx.fillStyle = option.labelColor ?? '#323233';
    for (let i = 0; i < count; i += 1) {
      const p = polarPoint(vertexAngle(i), radius + 12);
      ctx.textAlign = Math.abs(p.x - centerX) < 1 ? 'center' : p.x > centerX ? 'left' : 'right';
      ctx.textBaseline =
        Math.abs(p.y - centerY) < 1
          ? 'middle'
          : p.y > centerY
            ? 'top'
            : 'bottom';
      ctx.fillText(option.indicators[i].name, p.x, p.y);
    }

    // 系列区域 / 折线
    option.series.forEach((series, seriesIndex) => {
      const color = this.seriesColor(seriesIndex, series.color);
      const points: PolarPoint[] = option.indicators.map((indicator, i) => {
        const max =
          indicator.max ?? this.indicatorMax(option, i);
        const value = series.data[i] ?? 0;
        const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
        return polarPoint(vertexAngle(i), radius * ratio);
      });

      if (series.area !== false) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        this.tracePolygon(ctx, points);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = series.lineWidth ?? 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      this.tracePolygon(ctx, points);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    });
  }

  private indicatorMax(option: RadarChartOption, index: number): number {
    let max = 0;
    for (const series of option.series) {
      const v = series.data[index] ?? 0;
      if (v > max) {
        max = v;
      }
    }
    return max;
  }

  private tracePolygon(ctx: ICanvas2D, points: readonly PolarPoint[]): void {
    if (points.length === 0) {
      return;
    }
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y);
    }
  }
}

const TWO_PI = Math.PI * 2;
