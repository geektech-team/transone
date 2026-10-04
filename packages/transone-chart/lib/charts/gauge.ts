/** 仪表盘：顺时针轨道、数值进度、刻度及指针，无笛卡尔坐标轴。 */

import type { ICanvas2D } from '../core/canvas';
import { ChartBase } from '../core/chart';
import type { Box, LayoutResult } from '../core/layout';
import type { LegendItem } from '../core/legend';
import { applyFont } from '../core/text';
import type {
  ChartRenderContext,
  GaugeChartOption,
  TooltipParams,
} from '../types';

const GaugeTwoPi = Math.PI * 2;

interface GaugeGeometry {
  centerX: number;
  centerY: number;
  radius: number;
  lineWidth: number;
  startAngle: number;
  endAngle: number;
  valueAngle: number;
  ratio: number;
  pointerLength: number;
  pointerWidth: number;
  hubRadius: number;
}

export class GaugeChart extends ChartBase<GaugeChartOption> {
  public constructor(context: ChartRenderContext, option: GaugeChartOption) {
    GaugeValidateOption(option);
    super(context, option);
  }

  public setOption(option: Partial<GaugeChartOption>): this {
    GaugeValidateOption({ ...this.option, ...option });
    return super.setOption(option);
  }

  public render(): this {
    if (!this.isDestroyed()) GaugeValidateOption(this.option);
    return super.render();
  }

  protected hasCartesianAxis(): boolean {
    return false;
  }

  protected getLegendItems(): LegendItem[] {
    return this.option.name
      ? [{ name: this.option.name, color: this.progressColor() }]
      : [];
  }

  protected drawSeries(
    ctx: ICanvas2D,
    layout: LayoutResult,
    option: GaugeChartOption
  ): void {
    const geometry = this.geometry(layout.plot, option);
    if (!geometry) return;
    const { centerX, centerY, radius, startAngle, endAngle, valueAngle } =
      geometry;

    ctx.save();
    ctx.lineWidth = geometry.lineWidth;
    ctx.lineCap = 'round';
    ctx.strokeStyle = option.trackColor ?? '#ebedf0';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.stroke();

    if (geometry.ratio > 0) {
      ctx.strokeStyle = this.progressColor();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, valueAngle);
      ctx.stroke();
    }

    this.drawTicks(ctx, geometry, option);

    if (option.showPointer !== false) {
      const dirX = Math.cos(valueAngle);
      const dirY = Math.sin(valueAngle);
      ctx.fillStyle = option.pointerColor ?? this.progressColor();
      ctx.beginPath();
      ctx.moveTo(
        centerX - dirY * geometry.pointerWidth,
        centerY + dirX * geometry.pointerWidth
      );
      ctx.lineTo(
        centerX + dirX * geometry.pointerLength,
        centerY + dirY * geometry.pointerLength
      );
      ctx.lineTo(
        centerX + dirY * geometry.pointerWidth,
        centerY - dirX * geometry.pointerWidth
      );
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(centerX, centerY, geometry.hubRadius, 0, GaugeTwoPi);
      ctx.fill();
    }

    if (option.showValue !== false) {
      applyFont(
        ctx,
        Math.min(GaugePositiveNumber(option.valueFontSize, 24), radius * 0.45)
      );
      ctx.fillStyle = option.valueColor ?? '#323233';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // 原始值用于展示；只有进度与指针使用钳制后的比例。
      ctx.fillText(
        String(option.value),
        centerX,
        centerY + radius * 0.42,
        radius * 1.6
      );
    }
    ctx.restore();
  }

  protected hitTestSeries(x: number, y: number): TooltipParams | null {
    const plot = this.plot;
    if (
      !plot ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < plot.x ||
      x > plot.x + plot.width ||
      y < plot.y ||
      y > plot.y + plot.height
    )
      return null;

    const geometry = this.geometry(plot, this.option);
    if (!geometry) return null;
    const dx = x - geometry.centerX;
    const dy = y - geometry.centerY;
    const distance = Math.hypot(dx, dy);
    const sweep = geometry.endAngle - geometry.startAngle;
    const angle = GaugeNormalizeAngle(Math.atan2(dy, dx) - geometry.startAngle);
    const onArc =
      Math.abs(distance - geometry.radius) <= geometry.lineWidth / 2 &&
      angle <= sweep + 1e-10;

    const centerRadius =
      this.option.showPointer !== false || this.option.showValue !== false
        ? Math.max(geometry.hubRadius, Math.min(12, geometry.radius * 0.2))
        : 0;
    const onCenter = centerRadius > 0 && distance <= centerRadius;

    let onPointer = false;
    if (this.option.showPointer !== false) {
      const dirX = Math.cos(geometry.valueAngle);
      const dirY = Math.sin(geometry.valueAngle);
      const along = dx * dirX + dy * dirY;
      const across = Math.abs(dx * dirY - dy * dirX);
      onPointer =
        along >= 0 &&
        along <= geometry.pointerLength &&
        across <= geometry.pointerWidth * (1 - along / geometry.pointerLength);
    }
    if (!onArc && !onCenter && !onPointer) return null;

    const name = this.option.name ?? '数值';
    return {
      x,
      y,
      name,
      items: [{ name, value: this.option.value, color: this.progressColor() }],
    };
  }

  private progressColor(): string {
    return this.option.progressColor ?? this.seriesColor(0);
  }

  private geometry(plot: Box, option: GaugeChartOption): GaugeGeometry | null {
    const halfSize = Math.min(plot.width, plot.height) / 2;
    if (!Number.isFinite(halfSize) || halfSize <= 0) return null;
    const lineWidth = Math.min(
      GaugePositiveNumber(option.lineWidth, 12),
      halfSize
    );
    const maxRadius = halfSize - lineWidth / 2;
    const requestedRadius =
      option.radius !== undefined && Number.isFinite(option.radius)
        ? Math.max(0, option.radius)
        : maxRadius;
    const radius = Math.min(requestedRadius, maxRadius);
    if (radius <= 0) return null;
    const min = option.min ?? 0;
    const max = option.max ?? 100;
    const ratio = Math.max(0, Math.min(1, (option.value - min) / (max - min)));
    const startAngle = option.startAngle ?? (3 * Math.PI) / 4;
    const endAngle = option.endAngle ?? (9 * Math.PI) / 4;
    return {
      centerX: plot.x + plot.width / 2,
      centerY: plot.y + plot.height / 2,
      radius,
      lineWidth: Math.min(lineWidth, radius),
      startAngle,
      endAngle,
      valueAngle: startAngle + ratio * (endAngle - startAngle),
      ratio,
      pointerLength: radius * 0.72,
      pointerWidth: Math.min(4, radius * 0.045),
      hubRadius: Math.min(5, radius * 0.07),
    };
  }

  private drawTicks(
    ctx: ICanvas2D,
    geometry: GaugeGeometry,
    option: GaugeChartOption
  ): void {
    const { centerX, centerY, radius, startAngle, endAngle } = geometry;
    const outer = Math.max(0, radius - geometry.lineWidth / 2 - 2);
    const inner = Math.max(0, outer - Math.min(8, radius * 0.12));
    if (outer <= 0) return;
    const splitCount = option.splitCount ?? 5;
    const labelFontSize = Math.min(
      GaugePositiveNumber(option.labelFontSize, 11),
      radius * 0.25
    );
    const labelRadius = Math.max(0, inner - labelFontSize - 4);
    const min = option.min ?? 0;
    const max = option.max ?? 100;

    ctx.strokeStyle = option.labelColor ?? '#969799';
    ctx.lineWidth = Math.min(1, radius * 0.1);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    for (let i = 0; i <= splitCount; i += 1) {
      const angle = startAngle + ((endAngle - startAngle) * i) / splitCount;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      ctx.moveTo(centerX + dirX * inner, centerY + dirY * inner);
      ctx.lineTo(centerX + dirX * outer, centerY + dirY * outer);
    }
    ctx.stroke();

    if (option.showLabel === false || radius < 24) return;
    applyFont(ctx, labelFontSize);
    ctx.fillStyle = option.labelColor ?? '#969799';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= splitCount; i += 1) {
      const angle = startAngle + ((endAngle - startAngle) * i) / splitCount;
      const value =
        i === splitCount ? max : min + (max - min) * (i / splitCount);
      const label = String(Number(value.toPrecision(15)));
      ctx.fillText(
        label,
        centerX + Math.cos(angle) * labelRadius,
        centerY + Math.sin(angle) * labelRadius,
        radius
      );
    }
  }
}

function GaugePositiveNumber(
  value: number | undefined,
  fallback: number
): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function GaugeNormalizeAngle(angle: number): number {
  return ((angle % GaugeTwoPi) + GaugeTwoPi) % GaugeTwoPi;
}

function GaugeValidateOption(option: GaugeChartOption): void {
  if (!Number.isFinite(option.value)) {
    throw new Error('GaugeChart: value must be finite');
  }
  const min = option.min ?? 0;
  const max = option.max ?? 100;
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    max <= min ||
    !Number.isFinite(max - min)
  ) {
    throw new Error(
      'GaugeChart: min and max must be finite with max > min and a finite range'
    );
  }
  const startAngle = option.startAngle ?? (3 * Math.PI) / 4;
  const endAngle = option.endAngle ?? (9 * Math.PI) / 4;
  const sweep = endAngle - startAngle;
  if (
    !Number.isFinite(startAngle) ||
    !Number.isFinite(endAngle) ||
    sweep <= 0 ||
    sweep > GaugeTwoPi
  ) {
    throw new Error(
      'GaugeChart: angles must be finite with 0 < endAngle - startAngle <= 2π'
    );
  }
  const splitCount = option.splitCount ?? 5;
  if (!Number.isInteger(splitCount) || splitCount < 1 || splitCount > 1000) {
    throw new Error(
      'GaugeChart: splitCount must be an integer between 1 and 1000'
    );
  }
}
