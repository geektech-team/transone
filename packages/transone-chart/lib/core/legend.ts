/**
 * 图例绘制：色块 + 文本。
 * - top / bottom：横向单行居中排布
 * - right：纵向排布
 */

import type { ICanvas2D } from './canvas';
import type { Box } from './layout';
import { applyFont, measureWidth } from './text';
import { DEFAULT_TEXT_COLOR } from '../types';

export interface LegendItem {
  name: string;
  color: string;
}

export interface LegendDrawOptions {
  box: Box;
  items: readonly LegendItem[];
  position?: 'top' | 'bottom' | 'right';
  fontSize?: number;
  color?: string;
  markerSize?: number;
  itemGap?: number;
}

export class LegendDrawer {
  public constructor(private readonly ctx: ICanvas2D) {}

  public draw(options: LegendDrawOptions): void {
    const {
      box,
      items,
      position = 'top',
      fontSize = 12,
      color = DEFAULT_TEXT_COLOR,
      markerSize = 12,
      itemGap = 16,
    } = options;

    if (items.length === 0) {
      return;
    }

    const { ctx } = this;
    applyFont(ctx, fontSize);

    if (position === 'right') {
      // 纵向：从顶部开始逐项排列
      let y = box.y + fontSize / 2 + 4;
      for (const item of items) {
        this.drawItem(item, box.x, y, fontSize, markerSize, color);
        y += fontSize + 8;
      }
      return;
    }

    // 横向：居中排布
    let totalWidth = 0;
    for (const item of items) {
      totalWidth += markerSize + 6 + measureWidth(ctx, item.name, fontSize) + itemGap;
    }
    totalWidth -= itemGap;

    let x = box.x + (box.width - totalWidth) / 2;
    const y = box.y + box.height / 2;

    for (const item of items) {
      this.drawItem(item, x, y, fontSize, markerSize, color);
      x += markerSize + 6 + measureWidth(ctx, item.name, fontSize) + itemGap;
    }
  }

  private drawItem(
    item: LegendItem,
    x: number,
    centerY: number,
    _fontSize: number,
    markerSize: number,
    color: string
  ): void {
    const { ctx } = this;
    // 色块
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.rect(x, centerY - markerSize / 2, markerSize, markerSize);
    ctx.fill();
    // 文本
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.name, x + markerSize + 6, centerY);
  }
}
