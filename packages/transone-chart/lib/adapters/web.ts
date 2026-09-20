/**
 * Web 适配器：HTMLCanvasElement → ChartRenderContext。
 *
 * - 把物理画布尺寸设为 逻辑尺寸 × DPR，保证高分屏清晰
 * - 上下文为标准 CanvasRenderingContext2D，天然满足 ICanvas2D 契约
 */

import type { ChartRenderContext } from '../types';
import type { ICanvas2D } from '../core/canvas';
import { detectPixelRatio, type ResolveCanvasOptions } from './types';

/**
 * 从 HTMLCanvasElement 解析渲染上下文。
 * 会就地修改 canvas.width / canvas.height 为物理像素尺寸。
 */
export function resolveWebCanvas(
  canvas: HTMLCanvasElement,
  options: ResolveCanvasOptions = {}
): ChartRenderContext {
  if (!canvas) {
    throw new Error('resolveWebCanvas: canvas element is required');
  }

  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) {
    throw new Error('resolveWebCanvas: 2d context is not available');
  }

  const dpr = options.dpr ?? detectPixelRatio();
  const width = options.width ?? (canvas.clientWidth || canvas.width);
  const height = options.height ?? (canvas.clientHeight || canvas.height);

  // 物理像素 = 逻辑像素 × DPR
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  // 标准 CanvasRenderingContext2D 已满足 ICanvas2D 全部成员
  const ctx = ctx2d as unknown as ICanvas2D;

  return { ctx, width, height, dpr, palette: options.palette };
}
