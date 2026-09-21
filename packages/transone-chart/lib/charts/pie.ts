/**
 * 饼图 / 环形图：扇区绘制、百分比标签、图例。
 * 无笛卡尔坐标轴，全部几何在绘图区内按极坐标计算。
 */

import type { ICanvas2D } from '../core/canvas';
import { ChartBase } from '../core/chart';
import type { LayoutResult } from '../core/layout';
import type { LegendItem } from '../core/legend';
import { applyFont } from '../core/text';
import type { PieChartOption, TooltipParams } from '../types';

const TWO_PI = Math.PI * 2;

export class PieChart extends ChartBase<PieChartOption> {
  protected hasCartesianAxis(): boolean {
    return false;
  }

  protected getLegendItems(): LegendItem[] {
    return this.option.data.map((d, i) => ({
      name: d.name,
      color: d.color ?? this.seriesColor(i),
    }));
  }

  /** 命中检测：点落在某扇区（环形环带内）即显示该扇区名与数值占比。 */
  protected hitTestSeries(x: number, y: number): TooltipParams | null {
    const plot = this.plot;
    if (!plot) {
      return null;
    }
    const centerX = plot.x + plot.width / 2;
    const centerY = plot.y + plot.height / 2;
    const maxRadius = Math.min(plot.width, plot.height) / 2;
    const outerRadius = resolveRadius(this.option.radius ?? '60%', maxRadius);
    const innerRadius = resolveRadius(this.option.innerRadius ?? 0, maxRadius);
    const startAngle = this.option.startAngle ?? -Math.PI / 2;

    const dx = x - centerX;
    const dy = y - centerY;
    const dist = Math.hypot(dx, dy);
    if (dist < innerRadius || dist > outerRadius) {
      return null;
    }

    const data = this.option.data.filter((d) => d.value > 0);
    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (total <= 0) {
      return null;
    }

    // 命中角（canvas 系 y 向下，与绘制时角度递增方向一致）
    let a = Math.atan2(dy, dx);
    while (a < startAngle) {
      a += TWO_PI;
    }
    let cur = startAngle;
    for (let i = 0; i < data.length; i += 1) {
      const d = data[i]!;
      const sweep = (d.value / total) * TWO_PI;
      if (a >= cur && a <= cur + sweep) {
        const percent = Math.round((d.value / total) * 100);
        return {
          x,
          y,
          name: d.name,
          items: [
            {
              name: d.name,
              value: `${percent}%`,
              color: d.color ?? this.seriesColor(i),
            },
          ],
        };
      }
      cur += sweep;
    }
    return null;
  }

  protected drawSeries(
    ctx: ICanvas2D,
    layout: LayoutResult,
    option: PieChartOption
  ): void {
    const { plot } = layout;
    const centerX = plot.x + plot.width / 2;
    const centerY = plot.y + plot.height / 2;

    const maxRadius =
      Math.min(plot.width, plot.height) / 2;
    const outerRadius = resolveRadius(option.radius ?? '60%', maxRadius);
    const innerRadius = resolveRadius(option.innerRadius ?? 0, maxRadius);
    const startAngle = option.startAngle ?? -Math.PI / 2;

    const data = option.data.filter((d) => d.value > 0);
    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (total <= 0 || outerRadius <= 0) {
      return;
    }

    let angle = startAngle;

    data.forEach((d, index) => {
      const sweep = (d.value / total) * TWO_PI;
      const color = d.color ?? this.seriesColor(index);

      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      if (innerRadius > 0) {
        // 环形：外弧 → 内弧（反向）闭合
        ctx.arc(centerX, centerY, outerRadius, angle, angle + sweep);
        ctx.arc(
          centerX,
          centerY,
          innerRadius,
          angle + sweep,
          angle,
          true
        );
      } else {
        ctx.arc(centerX, centerY, outerRadius, angle, angle + sweep);
        ctx.lineTo(centerX, centerY);
      }
      ctx.closePath();
      ctx.fill();
      // 扇区间分隔线
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // 扇区标签：名称 + 百分比
      // - inside（默认）：画在扇区角平分线上（白字）
      // - outside：引线把文字引到扇区外（右半区左对齐、左半区右对齐，避免文字跨越中线）
      if (option.showLabel !== false) {
        const midAngle = angle + sweep / 2;
        const percent = total > 0 ? Math.round((d.value / total) * 100) : 0;
        const text = `${d.name} ${percent}%`;

        if (option.labelPosition === 'outside') {
          const lineLength = option.labelLineLength ?? 14;
          const gap = option.labelGap ?? 6;
          const dirX = Math.cos(midAngle);
          const dirY = Math.sin(midAngle);
          // 引线第一段：扇区边缘沿平分线向外
          const edgeX = centerX + dirX * outerRadius;
          const edgeY = centerY + dirY * outerRadius;
          const bendX = centerX + dirX * (outerRadius + lineLength);
          const bendY = centerY + dirY * (outerRadius + lineLength);
          // 第二段：水平延伸到文字锚点（右半向右、左半向左）
          const horizontal = dirX >= 0 ? 1 : -1;
          const textX = bendX + horizontal * gap;
          const textY = bendY;

          ctx.save();
          ctx.strokeStyle = option.labelLineColor ?? '#c0c4cc';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(edgeX, edgeY);
          ctx.lineTo(bendX, bendY);
          ctx.lineTo(textX, textY);
          ctx.stroke();
          ctx.restore();

          applyFont(ctx, option.labelFontSize ?? 10);
          ctx.fillStyle = option.labelColor ?? '#323233';
          ctx.textAlign = horizontal > 0 ? 'left' : 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, textX, textY);
        } else {
          const labelRadius =
            ((outerRadius + (innerRadius > 0 ? innerRadius : 0)) / 2) * 0.85;
          const labelX = centerX + Math.cos(midAngle) * labelRadius;
          const labelY = centerY + Math.sin(midAngle) * labelRadius;

          applyFont(ctx, option.labelFontSize ?? 10);
          ctx.fillStyle = option.labelColor ?? '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, labelX, labelY);
        }
      }

      angle += sweep;
    });
  }
}

/** 解析半径：数字为像素；'60%' 形式按最大半径百分比。 */
function resolveRadius(value: number | string, maxRadius: number): number {
  if (typeof value === 'number') {
    return Math.max(0, value);
  }
  const match = /^(\d+(?:\.\d+)?)%$/.exec(value);
  if (!match) {
    return maxRadius;
  }
  return (Number(match[1]) / 100) * maxRadius;
}
