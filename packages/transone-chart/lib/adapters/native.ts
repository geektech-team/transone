/**
 * 原生 App 适配器（占位 / 契约声明）。
 *
 * 未来 iOS / Android / 鸿蒙 原生端接入路径：
 * 1. 宿主提供原生 canvas 能力（Skia / ArkUI Canvas / WebView 桥），
 *    把原生绘制 API 实现为 ICanvas2D（见 core/canvas.ts 契约）
 * 2. 实现 resolveNativeCanvas()，返回 ChartRenderContext（含 DPR 与逻辑尺寸）
 * 3. 之后引擎与四种图表零改动运行
 *
 * 本文件当前不导出可运行实现，仅保留类型契约与接入文档，防止
 * 平台差异悄悄渗入引擎。
 */

import type { ChartRenderContext } from '../types';

/** 未来原生端需实现的最小宿主接口。 */
export interface NativeCanvasHost {
  /** 逻辑尺寸（CSS px）。 */
  width: number;
  height: number;
  /** 设备像素比。 */
  pixelRatio: number;
  /** 原生绘图上下文（宿主实现为 ICanvas2D 契约）。 */
  getContext(type: '2d'): unknown;
}

/**
 * 未来实现：原生 canvas 节点 → ChartRenderContext。
 * 当前未接入任何原生端，调用会明确报错，避免静默降级。
 */
export function resolveNativeCanvas(
  _host: NativeCanvasHost
): ChartRenderContext {
  throw new Error(
    'resolveNativeCanvas is not implemented yet. ' +
      'Native app support (iOS/Android/HarmonyOS) is planned for a future phase; ' +
      'implement ICanvas2D on the host side and fill in this resolver.'
  );
}
