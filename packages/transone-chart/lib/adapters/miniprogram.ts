/**
 * 小程序适配器：微信 / 阿里 / 字节的 Canvas 2D 节点 → ChartRenderContext。
 *
 * 获取流程（各端一致，仅全局名不同）：
 *   canvas type="2d" → 节点 node → node.getContext('2d') → ICanvas2D
 *
 * 节点获取依赖 SelectorQuery，属于组件生命周期职责，由
 * getMiniProgramCanvasNode() 提供；本文件只负责「节点 → 上下文」，
 * 以及 DPR 探测（pixelRatio 从各端系统信息接口读取）。
 */

import type { ChartRenderContext } from '../types';
import type { ICanvas2D } from '../core/canvas';
import { detectPixelRatio, type ResolveCanvasOptions } from './types';

/** 小程序 Canvas 2D 节点（各端 node 的公共形状）。 */
export interface MiniProgramCanvasNode {
  getContext(type: '2d'): unknown;
  width: number;
  height: number;
}

export type MiniProgramGlobal = 'wx' | 'my' | 'tt';

/** 安全读取小程序全局（避免与官方类型定义冲突，模式同 transone request）。 */
export function getMiniProgramGlobal(
  name: MiniProgramGlobal
): Record<string, unknown> | null {
  const host = getHost();
  const api = host[name];
  return typeof api === 'object' && api !== null
    ? (api as Record<string, unknown>)
    : null;
}

/**
 * 通过 SelectorQuery 获取 Canvas 2D 节点（组件/页面内调用）。
 * 各端 API 形状一致：createSelectorQuery().in(instance).select(selector)
 *   .fields({ node: true, size: true }).exec(callback)
 */
export function getMiniProgramCanvasNode(options: {
  /** 端标识，缺省自动探测（wx → my → tt）。 */
  platform?: MiniProgramGlobal;
  /** 组件/页面实例（.in() 入参）。 */
  instance?: unknown;
  /** canvas 选择器，如 '#chart'。 */
  selector: string;
}): Promise<MiniProgramCanvasNode> {
  const platform =
    options.platform ?? detectMiniProgramGlobal() ?? 'wx';
  const api = getMiniProgramGlobal(platform);
  const queryFn = api?.createSelectorQuery;
  if (typeof queryFn !== 'function') {
    return Promise.reject(
      new Error(`getMiniProgramCanvasNode: ${platform}.createSelectorQuery is not available`)
    );
  }

  return new Promise((resolve, reject) => {
    let query = queryFn.call(api);
    if (options.instance && typeof query.in === 'function') {
      query = query.in(options.instance);
    }
    if (typeof query.select !== 'function') {
      reject(new Error(`${platform}.createSelectorQuery().select is not available`));
      return;
    }
    query
      .select(options.selector)
      .fields({ node: true, size: true })
      .exec((res: unknown) => {
        const first = Array.isArray(res) ? res[0] : undefined;
        const node = first?.node as MiniProgramCanvasNode | undefined;
        if (!node || typeof node.getContext !== 'function') {
          reject(
            new Error(
              `getMiniProgramCanvasNode: canvas node not found for "${options.selector}"`
            )
          );
          return;
        }
        resolve(node);
      });
  });
}

/** 探测当前小程序全局（wx → my → tt），均不存在返回 null。 */
export function detectMiniProgramGlobal(): MiniProgramGlobal | null {
  if (getMiniProgramGlobal('wx')) {
    return 'wx';
  }
  if (getMiniProgramGlobal('my')) {
    return 'my';
  }
  if (getMiniProgramGlobal('tt')) {
    return 'tt';
  }
  return null;
}

/** 读取各端设备像素比（wx.getSystemInfoSync / my.getSystemInfoSync / tt.getSystemInfoSync）。 */
export function detectMiniProgramPixelRatio(platform?: MiniProgramGlobal): number {
  const name = platform ?? detectMiniProgramGlobal() ?? 'wx';
  const api = getMiniProgramGlobal(name);
  const sync = api?.getSystemInfoSync;
  if (typeof sync === 'function') {
    try {
      const info = sync.call(api) as { pixelRatio?: number };
      if (typeof info.pixelRatio === 'number' && info.pixelRatio > 0) {
        return info.pixelRatio;
      }
    } catch {
      // 探测失败回退通用探测
    }
  }
  return detectPixelRatio();
}

/**
 * 从 Canvas 2D 节点解析渲染上下文。
 * 物理画布尺寸由节点自身管理（width/height 已在平台侧按像素比设置），
 * 此处只做归一化返回。
 */
export function resolveMiniProgramCanvas(
  node: MiniProgramCanvasNode,
  options: ResolveCanvasOptions = {}
): ChartRenderContext {
  const ctx2d = node.getContext('2d');
  if (!ctx2d) {
    throw new Error('resolveMiniProgramCanvas: 2d context is not available');
  }

  const dpr = options.dpr ?? detectMiniProgramPixelRatio();
  const width = options.width ?? node.width;
  const height = options.height ?? node.height;
  const ctx = ctx2d as unknown as ICanvas2D;

  return { ctx, width, height, dpr, palette: options.palette };
}

function getHost(): Record<string, unknown> {
  if (typeof globalThis !== 'undefined') {
    return globalThis as unknown as Record<string, unknown>;
  }
  return {};
}
