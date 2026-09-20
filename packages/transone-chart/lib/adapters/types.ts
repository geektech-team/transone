/**
 * 平台适配层：把各端 Canvas 2D 上下文解析为统一渲染上下文
 * （ICanvas2D + 逻辑尺寸 + DPR）。
 *
 * 适配器只负责三件事：
 * 1. 拿到上下文（HTMLCanvasElement / 小程序 canvas node / 未来原生 canvas）
 * 2. 计算设备像素比并设置物理画布尺寸
 * 3. 返回引擎需要的 ChartRenderContext
 *
 * 引擎代码永远不直接接触 DOM / wx / native API。
 */

import type { ChartRenderContext } from '../types';

export interface ResolveCanvasOptions {
  /** 逻辑宽度（CSS px）；缺省取节点实际尺寸。 */
  width?: number;
  /** 逻辑高度（CSS px）；缺省取节点实际尺寸。 */
  height?: number;
  /** 设备像素比；缺省自动探测。 */
  dpr?: number;
  /** 自定义色板。 */
  palette?: readonly string[];
}

export interface ResolvedCanvas {
  context: ChartRenderContext;
}

/** 通用探测设备像素比（web 与小程序可用 globalThis 访问）。 */
export function detectPixelRatio(): number {
  const host = getHost();
  if (typeof host.devicePixelRatio === 'number' && host.devicePixelRatio > 0) {
    return host.devicePixelRatio;
  }
  return 1;
}

function getHost(): Record<string, unknown> {
  if (typeof globalThis !== 'undefined') {
    return globalThis as unknown as Record<string, unknown>;
  }
  return {};
}
