/** 散点图：双数值轴，支持逐点名称、颜色和气泡大小。 */
import { AxisDrawer } from '../core/axis';
import type { ICanvas2D } from '../core/canvas';
import { ChartBase, type CartesianScales } from '../core/chart';
import type { LayoutResult } from '../core/layout';
import type { LegendItem } from '../core/legend';
import { CategoryScale, LinearScale } from '../core/scale';
import {
  DEFAULT_AXIS_COLOR,
  type ScatterChartOption,
  type TooltipParams,
} from '../types';

interface ScatterPoint {
  x: number;
  y: number;
  radius: number;
  value: readonly [number, number];
  name: string;
  seriesName: string;
  color: string;
}

export class ScatterChart extends ChartBase<ScatterChartOption> {
  private points: ScatterPoint[] = [];

  protected getLegendItems(): LegendItem[] {
    return this.option.series.flatMap((series, index) =>
      series.name
        ? [{ name: series.name, color: this.seriesColor(index, series.color) }]
        : []
    );
  }

  protected getCategoryLabels(): readonly string[] {
    const scale = this.makeScale('x', 0, 1);
    return scale.ticks.map(
      (tick) => this.option.xAxis?.format?.(tick) ?? String(tick)
    );
  }

  protected computeValueLabels(): string[] {
    const scale = this.makeScale('y', 0, 1);
    return scale.ticks.map(
      (tick) => this.option.yAxis?.format?.(tick) ?? String(tick)
    );
  }

  protected buildCartesianScales(layout: LayoutResult): CartesianScales {
    const { plot } = layout;
    return {
      value: this.makeScale('y', plot.y + plot.height, plot.y),
      xValue: this.makeScale('x', plot.x, plot.x + plot.width),
      category: new CategoryScale([], plot.x, plot.x + plot.width),
    };
  }

  protected drawCartesianAxis(layout: LayoutResult): void {
    const scales = this.cartesian;
    if (!scales?.xValue) return;
    const drawer = new AxisDrawer(this.ctx);
    for (const dimension of ['y', 'x'] as const) {
      const scale = dimension === 'x' ? scales.xValue : scales.value;
      const axis =
        (dimension === 'x' ? this.option.xAxis : this.option.yAxis) ?? {};
      drawer.drawValueAxis({
        plot: layout.plot,
        scale,
        horizontal: dimension === 'x',
        labels: scale.ticks.map((tick) => axis.format?.(tick) ?? String(tick)),
        labelFontSize: axis.labelFontSize,
        labelColor: axis.labelColor,
        gridColor: axis.gridColor,
        gridLineWidth: axis.gridLineWidth,
        gridLineDash: axis.gridLineDash,
        showGrid: axis.showGrid ?? true,
      });
    }
    const { plot } = layout;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = DEFAULT_AXIS_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plot.x, plot.y);
    ctx.lineTo(plot.x, plot.y + plot.height);
    ctx.lineTo(plot.x + plot.width, plot.y + plot.height);
    ctx.stroke();
    ctx.restore();
  }

  protected drawSeries(
    ctx: ICanvas2D,
    layout: LayoutResult,
    option: ScatterChartOption
  ): void {
    this.points = [];
    const scales = this.cartesian;
    const { plot } = layout;
    if (!scales?.xValue || plot.width <= 0 || plot.height <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.x, plot.y, plot.width, plot.height);
    ctx.clip();
    option.series.forEach((series, seriesIndex) => {
      series.data.forEach((datum) => {
        const item = 'value' in datum ? datum : undefined;
        const value = item ? item.value : (datum as readonly [number, number]);
        if (!Number.isFinite(value[0]) || !Number.isFinite(value[1])) return;
        if (
          value[0] < scales.xValue!.min ||
          value[0] > scales.xValue!.max ||
          value[1] < scales.value.min ||
          value[1] > scales.value.max
        )
          return;
        const diameter = item?.symbolSize ?? series.symbolSize ?? 8;
        if (!Number.isFinite(diameter) || diameter <= 0) return;
        const point: ScatterPoint = {
          x: scales.xValue!.scale(value[0]),
          y: scales.value.scale(value[1]),
          radius: diameter / 2,
          value,
          name: item?.name ?? series.name ?? `系列${seriesIndex + 1}`,
          seriesName: series.name ?? `系列${seriesIndex + 1}`,
          color: this.seriesColor(seriesIndex, item?.color ?? series.color),
        };
        this.points.push(point);
        ctx.fillStyle = point.color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    ctx.restore();
  }

  protected hitTestSeries(x: number, y: number): TooltipParams | null {
    const plot = this.plot;
    if (
      !plot ||
      x < plot.x ||
      x > plot.x + plot.width ||
      y < plot.y ||
      y > plot.y + plot.height
    )
      return null;
    let nearest: ScatterPoint | undefined;
    let distance = Infinity;
    for (const point of this.points ?? []) {
      const current = Math.hypot(point.x - x, point.y - y);
      if (current <= Math.max(point.radius, 6) && current < distance) {
        nearest = point;
        distance = current;
      }
    }
    return nearest
      ? {
          x,
          y,
          name: nearest.name,
          items: [
            {
              name: nearest.seriesName,
              value: `(${nearest.value[0]}, ${nearest.value[1]})`,
              color: nearest.color,
            },
          ],
        }
      : null;
  }

  private makeScale(
    dimension: 'x' | 'y',
    start: number,
    end: number
  ): LinearScale {
    const axis =
      (dimension === 'x' ? this.option.xAxis : this.option.yAxis) ?? {};
    if (
      (axis.min !== undefined && !Number.isFinite(axis.min)) ||
      (axis.max !== undefined && !Number.isFinite(axis.max)) ||
      (axis.min !== undefined &&
        axis.max !== undefined &&
        axis.min >= axis.max) ||
      (axis.splitCount !== undefined &&
        (!Number.isInteger(axis.splitCount) ||
          axis.splitCount < 1 ||
          axis.splitCount > 100))
    ) {
      throw new Error(
        `ScatterChart: invalid ${dimension}Axis range or splitCount (1..100)`
      );
    }
    let min = Infinity;
    let max = -Infinity;
    const index = dimension === 'x' ? 0 : 1;
    for (const series of this.option.series) {
      for (const datum of series.data) {
        const value = 'value' in datum ? datum.value : datum;
        if (!Number.isFinite(value[0]) || !Number.isFinite(value[1])) continue;
        min = Math.min(min, value[index]);
        max = Math.max(max, value[index]);
      }
    }
    if (!Number.isFinite(min)) {
      min = 0;
      max = 1;
    }
    if (axis.min !== undefined) {
      min = Math.min(min, axis.min);
      if (max <= axis.min)
        max = axis.min + Math.max(1, Math.abs(axis.min) * 0.1);
    }
    if (axis.max !== undefined) {
      max = Math.max(max, axis.max);
      if (min >= axis.max)
        min = axis.max - Math.max(1, Math.abs(axis.max) * 0.1);
    }
    if (!Number.isFinite(max - min))
      throw new Error(`ScatterChart: ${dimension}Axis range is too large`);
    return new LinearScale(min, max, start, end, axis);
  }
}
