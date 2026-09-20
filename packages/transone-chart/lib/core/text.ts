/**
 * 文字辅助：统一的 font 字符串拼接与文本测量。
 * 所有测量都走 ICanvas2D.measureText，保证跨端一致。
 */

import type { ICanvas2D } from './canvas';
import { DEFAULT_FONT_FAMILY } from '../types';

export interface TextStyle {
  fontSize?: number;
  family?: string;
}

/** 构造 canvas font 字符串（小程序与 Web 语义一致）。 */
export function toFont(size: number, family = DEFAULT_FONT_FAMILY): string {
  return `${size}px ${family}`;
}

/** 设置当前文字样式并返回 font 字符串。 */
export function applyFont(
  ctx: ICanvas2D,
  size: number,
  family = DEFAULT_FONT_FAMILY
): string {
  const font = toFont(size, family);
  ctx.font = font;
  return font;
}

/** 测量文本宽度（自动设置 font）。 */
export function measureWidth(
  ctx: ICanvas2D,
  text: string,
  fontSize: number,
  family = DEFAULT_FONT_FAMILY
): number {
  applyFont(ctx, fontSize, family);
  return ctx.measureText(text).width;
}

/**
 * 截断文本到指定像素宽度（超宽加省略号）。
 * 用于类目轴标签过长时避免溢出绘图区。
 */
export function truncate(
  ctx: ICanvas2D,
  text: string,
  maxWidth: number,
  fontSize: number,
  family = DEFAULT_FONT_FAMILY
): string {
  if (maxWidth <= 0 || measureWidth(ctx, text, fontSize, family) <= maxWidth) {
    return text;
  }
  const ellipsis = '…';
  let lo = 0;
  let hi = text.length;
  let result = text;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = text.slice(0, mid) + ellipsis;
    if (measureWidth(ctx, candidate, fontSize, family) <= maxWidth) {
      result = candidate;
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}
