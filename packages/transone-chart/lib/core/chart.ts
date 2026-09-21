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
import type { Box } from './layout';
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
  type TooltipOption,
  type TooltipParams,
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

  /** 最近一次 render 的绘图区，供 hitTestSeries 使用。 */
  protected plot: Box | null = null;

  /** 当前悬浮命中的 tooltip 参数（由 setHover 触发 render 后绘制）。 */
  protected hover: TooltipParams | null = null;

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
    this.plot = layout.plot;
    this.drawTitle(layout);
    this.drawLegend(layout);

    if (this.hasCartesianAxis()) {
      this.cartesian = this.buildCartesianScales(layout);
      this.drawCartesianAxis(layout);
    } else {
      this.cartesian = null;
    }

    this.drawSeries(ctx, layout, this.option);

    // tooltip 浮层最后绘制，保证在最上层
    if (this.hover) {
      this.drawTooltip(this.hover);
    }

    ctx.restore();
    return this;
  }

  /* —— 悬浮交互（tooltip）—— */

  /**
   * 命中测试并显示 tooltip。坐标为逻辑像素（CSS px），由事件层换算后传入。
   * 未命中任何数据 / tooltip 关闭时不显示。调用后自动重绘。
   */
  public setHover(x: number, y: number): this {
    if (this.option.tooltip?.show === false) {
      this.hover = null;
    } else {
      this.hover = this.hitTestSeries(x, y);
    }
    return this.render();
  }

  /** 清除悬浮状态并重绘。 */
  public clearHover(): this {
    this.hover = null;
    return this.render();
  }

  /** 子类实现：命中检测——返回 null 表示该位置无数据。 */
  protected abstract hitTestSeries(x: number, y: number): TooltipParams | null;

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

  /* —— tooltip 浮层绘制 —— */

  protected getTooltipOption(): TooltipOption | undefined {
    return (this.option as { tooltip?: TooltipOption }).tooltip;
  }

  /** 默认 tooltip 文本：首行标题 + 每行一个数据项。 */
  protected defaultTooltipLines(params: TooltipParams): string[] {
    const lines: string[] = [params.name];
    for (const item of params.items) {
      lines.push(`${item.name}: ${item.value}`);
    }
    return lines;
  }

  /** 在 canvas 上绘制 tooltip 浮层：跟随触发点，边缘自动翻转。 */
  protected drawTooltip(params: TooltipParams): void {
    const option = this.getTooltipOption();
    if (option?.show === false) {
      return;
    }
    const formatter = option?.formatter;
    const raw = formatter ? formatter(params) : this.defaultTooltipLines(params);
    const lines = Array.isArray(raw) ? raw : [raw];
    if (lines.length === 0) {
      return;
    }

    const { ctx } = this;
    const fontSize = 12;
    const padX = 10;
    const padY = 8;
    const lineH = 18;
    const dotR = 4;
    const dotGap = 6;

    applyFont(ctx, fontSize);
    let maxW = 0;
    for (const line of lines) {
      maxW = Math.max(maxW, measureWidth(ctx, line, fontSize));
    }
    const boxW = maxW + padX * 2 + dotR * 2 + dotGap;
    const boxH = lines.length * lineH + padY * 2;

    // 优先将 tooltip 定位在绘图区外，避免遮挡数据元素
    const plot = this.plot;
    let bx: number;
    let by: number;

    if (plot && this.isHorizontal()) {
      // 横向图：tooltip 定位在绘图区右侧
      bx = plot.x + plot.width + 8;
      by = params.y - boxH / 2;
      // 右侧空间不足时，定位到左侧
      if (bx + boxW > this.width - 4) {
        bx = plot.x - boxW - 8;
      }
    } else if (plot) {
      // 纵向图：tooltip 定位在触发点右侧，避免与绘图区重叠
      bx = params.x + 14;
      by = params.y - boxH / 2;
      // 右侧空间不足时，定位到左侧
      if (bx + boxW > this.width - 4) {
        bx = params.x - boxW - 14;
      }
    } else {
      // 无绘图区信息（饼图/雷达图）：跟随触发点
      bx = params.x + 14;
      by = params.y - boxH / 2;
      if (bx + boxW > this.width - 4) {
        bx = params.x - boxW - 14;
      }
    }

    bx = Math.max(4, bx);
    by = Math.max(4, Math.min(by, this.height - boxH - 4));

    ctx.save();
    // 背景
    ctx.fillStyle = 'rgba(50, 50, 51, 0.92)';
    ctx.beginPath();
    this.roundRectPath(bx, by, boxW, boxH, 6);
    ctx.fill();

    // 文本行：数据行前画系列色小圆点
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    lines.forEach((line, i) => {
      const ty = by + padY + lineH * i + lineH / 2;
      const dotColor = i > 0 ? params.items[i - 1]?.color : undefined;
      if (dotColor) {
        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(bx + padX + dotR, ty, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffffff';
      const tx = bx + padX + (dotColor ? dotR * 2 + dotGap : 0);
      ctx.fillText(line, tx, ty);
    });
    ctx.restore();
  }

  /** 圆角矩形路径（当前路径），与平台无关。 */
  private roundRectPath(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    const ctx = this.ctx;
    const radius = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}
