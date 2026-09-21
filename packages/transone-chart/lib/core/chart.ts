/**
 * ChartBase：所有图表的抽象基类，负责统一渲染管线。
 *
 * 渲染管线（render）：
 *   save → scale(dpr) → clear → 背景 → 布局计算
 *     → 标题 → 图例 → 笛卡尔坐标轴（折线/柱状）
 *     → drawSeries（子类策略） → restore
 *
 * 生命周期：setOption 增量更新 → render；resize 改逻辑尺寸 → render；
 * destroy 释放。所有坐标均为逻辑像素（CSS px），DPR 由管线统一缩放。
 */

import type { ICanvas2D } from './canvas';
import { AxisDrawer } from './axis';
import {
  computeLayout,
  type LayoutInput,
  type LayoutResult,
} from './layout';
import { LegendDrawer, type LegendItem } from './legend';
import { CategoryScale, LinearScale } from './scale';
import { applyFont, measureWidth } from './text';
import {
  DEFAULT_PALETTE,
  type CategoryAxisOption,
  type ChartOption,
  type ChartRenderContext,
  type LegendOption,
  type TitleOption,
  type ValueAxisOption,
} from '../types';

export interface CartesianScales {
  value: LinearScale;
  category: CategoryScale;
}

/**
 * 子类需要实现的钩子：
 * - drawSeries：绘制数据系列（核心策略）
 * - hasCartesianAxis：是否需要坐标轴（饼图/雷达返回 false）
 * - getValueDomain：数值轴数据域（有轴时）
 * - getCategoryLabels：类目轴标签（有轴时）
 * - isHorizontal：横向布局（横向柱状图）
 */
export abstract class ChartBase<T extends ChartOption> {
  protected readonly ctx: ICanvas2D;
  protected option: T;
  protected width: number;
  protected height: number;
  protected dpr: number;
  protected readonly palette: readonly string[];

  /** 每次 render 构建的笛卡尔比例尺，供 drawSeries 读取。 */
  protected cartesian: CartesianScales | null = null;

  private destroyed = false;

  public constructor(context: ChartRenderContext, option: T) {
    this.ctx = context.ctx;
    this.option = option;
    this.width = context.width;
    this.height = context.height;
    this.dpr = context.dpr;
    this.palette = context.palette ?? DEFAULT_PALETTE;
  }

  /* —— 生命周期 —— */

  public setOption(option: Partial<T>): this {
    this.option = { ...this.option, ...option };
    return this;
  }

  public resize(width: number, height: number, dpr?: number): this {
    this.width = Math.max(0, width);
    this.height = Math.max(0, height);
    // dpr 变化（如窗口跨屏移动）时同步更新，绘制管线按新 dpr 缩放
    if (dpr !== undefined && Number.isFinite(dpr) && dpr > 0) {
      this.dpr = dpr;
    }
    return this;
  }

  public render(): this {
    if (this.destroyed) {
      return this;
    }
    const { ctx, width, height, dpr } = this;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const background = this.getBackgroundColor();
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }

    const layout = this.computeLayout();
    this.drawTitle(layout);
    this.drawLegend(layout);

    if (this.hasCartesianAxis()) {
      this.cartesian = this.buildCartesianScales(layout);
      this.drawCartesianAxis(layout);
    } else {
      this.cartesian = null;
    }

    this.drawSeries(ctx, layout, this.option);

    ctx.restore();
    return this;
  }

  public destroy(): void {
    this.destroyed = true;
  }

  public isDestroyed(): boolean {
    return this.destroyed;
  }

  /* —— 子类策略钩子 —— */

  protected abstract drawSeries(
    ctx: ICanvas2D,
    layout: LayoutResult,
    option: T
  ): void;

  protected hasCartesianAxis(): boolean {
    return true;
  }

  protected getValueDomain(): { min: number; max: number } {
    return { min: 0, max: 1 };
  }

  protected getCategoryLabels(): readonly string[] {
    return [];
  }

  protected isHorizontal(): boolean {
    return false;
  }

  /* —— 可覆盖的配置来源 —— */

  protected getBackgroundColor(): string | undefined {
    return (this.option as { backgroundColor?: string }).backgroundColor;
  }

  protected getTitle(): TitleOption | undefined {
    return (this.option as { title?: TitleOption }).title;
  }

  protected getLegend(): LegendOption | undefined {
    const legend = (this.option as { legend?: LegendOption }).legend;
    if (legend) {
      return legend;
    }
    // 未显式配置图例但存在命名系列/扇区时，默认在顶部显示
    return this.getLegendItems().length > 0 ? { position: 'top' } : undefined;
  }

  protected getLegendItems(): LegendItem[] {
    return [];
  }

  protected getValueAxis(): ValueAxisOption | undefined {
    return (this.option as { yAxis?: ValueAxisOption }).yAxis;
  }

  protected getCategoryAxis(): CategoryAxisOption | undefined {
    return (this.option as { xAxis?: CategoryAxisOption }).xAxis;
  }

  /* —— 渲染管线内部 —— */

  protected computeLayout(): LayoutResult {
    const input = this.buildLayoutInput();
    const measure = (text: string): number =>
      measureWidth(this.ctx, text, 11);
    return computeLayout(input, measure);
  }

  protected buildLayoutInput(): LayoutInput {
    // 轴标签区需要知道刻度标签宽度，而刻度与布局无关（仅依赖数据域），
    // 因此用占位 range 预计算刻度 → 布局 → 最终 scale 两阶段完成。
    const horizontal = this.isHorizontal();
    const hasAxis = this.hasCartesianAxis();
    return {
      width: this.width,
      height: this.height,
      title: this.getTitle(),
      legend: this.getLegend(),
      legendItems: this.getLegendItems().map((item) => item.name),
      valueLabels: hasAxis && !horizontal ? this.computeValueLabels() : undefined,
      categoryLabels: hasAxis ? this.getCategoryLabels() : undefined,
      horizontal,
    };
  }

  /** 用占位 range 预计算数值刻度标签（仅用于测量，不参与最终映射）。 */
  protected computeValueLabels(): string[] {
    const domain = this.getValueDomain();
    const valueAxis = this.getValueAxis();
    const probe = new LinearScale(domain.min, domain.max, 0, 1, {
      min: valueAxis?.min,
      max: valueAxis?.max,
      splitCount: valueAxis?.splitCount,
    });
    return probe.ticks.map((tick) =>
      valueAxis?.format ? valueAxis.format(tick) : String(tick)
    );
  }

  protected drawTitle(layout: LayoutResult): void {
    const title = this.getTitle();
    if (!title?.text || !layout.titleBox) {
      return;
    }
    const { ctx } = this;
    applyFont(ctx, title.fontSize ?? 16);
    ctx.fillStyle = title.color ?? '#323233';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(title.text, this.width / 2, layout.titleBox.y);
  }

  protected drawLegend(layout: LayoutResult): void {
    const legend = this.getLegend();
    if (legend?.show === false || !layout.legendBox) {
      return;
    }
    const items = this.getLegendItems();
    if (items.length === 0) {
      return;
    }
    new LegendDrawer(this.ctx).draw({
      box: layout.legendBox,
      items,
      position: legend?.position ?? 'top',
      fontSize: legend?.fontSize,
      color: legend?.color,
      markerSize: legend?.markerSize,
      itemGap: legend?.itemGap,
    });
  }

  protected buildCartesianScales(layout: LayoutResult): CartesianScales {
    const { plot } = layout;
    const horizontal = this.isHorizontal();
    const domain = this.getValueDomain();
    const categories = this.getCategoryLabels();
    const valueAxis = this.getValueAxis();

    const value = new LinearScale(
      domain.min,
      domain.max,
      horizontal ? plot.x : plot.y + plot.height,
      horizontal ? plot.x + plot.width : plot.y,
      { min: valueAxis?.min, max: valueAxis?.max, splitCount: valueAxis?.splitCount }
    );

    const category = new CategoryScale(
      categories,
      horizontal ? plot.y : plot.x,
      horizontal ? plot.y + plot.height : plot.x + plot.width
    );

    return { value, category };
  }

  protected drawCartesianAxis(layout: LayoutResult): void {
    const scales = this.cartesian;
    if (!scales) {
      return;
    }
    const { ctx } = this;
    const { plot } = layout;
    const horizontal = this.isHorizontal();
    const valueAxis = this.getValueAxis();
    const categoryAxis = this.getCategoryAxis();
    const categories = this.getCategoryLabels();

    const drawer = new AxisDrawer(ctx);

    const valueLabels = scales.value.ticks.map((tick) =>
      valueAxis?.format ? valueAxis.format(tick) : String(tick)
    );

    drawer.drawValueAxis({
      plot,
      scale: scales.value,
      labels: valueLabels,
      horizontal,
      labelFontSize: valueAxis?.labelFontSize,
      labelColor: valueAxis?.labelColor,
      gridColor: valueAxis?.gridColor,
      gridLineWidth: valueAxis?.gridLineWidth,
      gridLineDash: valueAxis?.gridLineDash,
      showGrid: valueAxis?.showGrid ?? true,
    });

    drawer.drawCategoryAxis({
      plot,
      scale: scales.category,
      labels: categories,
      horizontal,
      labelFontSize: categoryAxis?.labelFontSize,
      labelColor: categoryAxis?.labelColor,
      gridColor: categoryAxis?.gridColor,
      gridLineWidth: categoryAxis?.gridLineWidth,
      showGrid: categoryAxis?.showGrid ?? false,
    });
  }

  /** 系列取色：显式 color 优先，否则按索引取色板。 */
  protected seriesColor(index: number, color?: string): string {
    return color ?? this.palette[index % this.palette.length];
  }
}
