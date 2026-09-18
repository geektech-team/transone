import type { DetectedPlatform } from '../types';

type Host = Record<string, unknown>;

/** 各端安全访问全局对象：优先 globalThis（微信基础库 2.2.3+ 可用），兜底 self / global */
function getHost(): Host {
  if (typeof globalThis !== 'undefined') {
    return globalThis as unknown as Host;
  }
  if (typeof self !== 'undefined') {
    return self as unknown as Host;
  }
  if (typeof global !== 'undefined') {
    return global as unknown as Host;
  }
  return {};
}

/** 小程序请求全局的公共形状（wx.request / my.request / tt.request） */
export interface MiniProgramRequestApi {
  request?: (options: Record<string, unknown>) => { abort?: () => void };
}

/**
 * 读取小程序请求全局（wx / my / tt）。
 * 通过全局对象属性访问而非直接引用全局名，避免污染全局声明、
 * 也避免与用户安装的小程序官方类型（如 miniprogram-api-typings）冲突。
 */
export function getMiniProgramApi(
  name: 'wx' | 'my' | 'tt'
): MiniProgramRequestApi | null {
  const api = getHost()[name];
  return typeof api === 'object' && api !== null
    ? (api as MiniProgramRequestApi)
    : null;
}

/**
 * 运行时探测目标端：
 * 小程序全局优先（wx → my → tt），其次 Web fetch；均不可用返回 'unknown'。
 */
export function detectPlatform(): DetectedPlatform {
  if (hasRequestApi('wx')) {
    return 'weixin';
  }
  if (hasRequestApi('my')) {
    return 'alipay';
  }
  if (hasRequestApi('tt')) {
    return 'bytedance';
  }
  if (typeof fetch === 'function') {
    return 'web';
  }
  return 'unknown';
}

function hasRequestApi(name: 'wx' | 'my' | 'tt'): boolean {
  const api = getMiniProgramApi(name);
  return api !== null && typeof api.request === 'function';
}
