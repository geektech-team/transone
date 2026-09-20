/**
 * 饼图 / 环形图：扇区绘制、百分比标签、图例。
 * 无笛卡尔坐标轴，全部几何在绘图区内按极坐标计算。
 */

import type { ICanvas2D } from '../core/canvas';
import { ChartBase } from '../core/chart';
import type { LayoutResult } from '../core/layout';
import type { LegendItem } from '../core/legend';
import { applyFont } from '../core/text';
import type { PieChartOption } from '../types';

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

      // 扇区标签：名称 + 百分比，画在扇区角平分线上
      if (option.showLabel !== false) {
        const midAngle = angle + sweep / 2;
        const labelRadius = (outerRadius + (innerRadius > 0 ? innerRadius : 0)) / 2 * 0.85;
        const labelX = centerX + Math.cos(midAngle) * labelRadius;
        const labelY = centerY + Math.sin(midAngle) * labelRadius;
        const percent = total > 0 ? Math.round((d.value / total) * 100) : 0;

        applyFont(ctx, option.labelFontSize ?? 10);
        ctx.fillStyle = option.labelColor ?? '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${d.name} ${percent}%`, labelX, labelY);
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
