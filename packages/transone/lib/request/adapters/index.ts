import { RequestError } from '../errors';
import type {
  DetectedPlatform,
  RequestAdapter,
  RequestAdapterResolver,
  RequestConfig,
  RequestPlatform,
} from '../types';
import { FetchAdapter } from './fetch';
import {
  ALIPAY_DIALECT,
  BYTEDANCE_DIALECT,
  MiniProgramAdapter,
  WEIXIN_DIALECT,
} from './mp';
import { detectPlatform } from './platform';

export { detectPlatform } from './platform';
export type { MiniProgramRequestApi } from './platform';
export type { MiniProgramDialect } from './mp';

/** 各端适配器注册表：'auto' 不在此列，由运行时探测决定 */
export const adapters: Record<
  Exclude<RequestPlatform, 'auto'>,
  RequestAdapter
> = {
  web: new FetchAdapter(),
  weixin: new MiniProgramAdapter(WEIXIN_DIALECT),
  alipay: new MiniProgramAdapter(ALIPAY_DIALECT),
  bytedance: new MiniProgramAdapter(BYTEDANCE_DIALECT),
};

/** 按目标端创建适配器；不支持的端抛 UNSUPPORTED_PLATFORM */
export function createAdapter(
  platform: Exclude<RequestPlatform, 'auto'>
): RequestAdapter {
  const adapter = adapters[platform];
  if (!adapter) {
    throw new RequestError({
      code: 'UNSUPPORTED_PLATFORM',
      message: `Unsupported request platform: ${String(platform)}`,
      config: { url: '' },
    });
  }
  return adapter;
}

/**
 * 解析请求应使用的适配器（优先级从高到低）：
 * 1. 请求级 config.platform（显式指定非 auto 时）
 * 2. 实例级自定义 adapter（对象或解析函数）
 * 3. 实例级默认 platform；仍为 auto 时运行时探测
 */
export async function resolveAdapter(
  config: RequestConfig,
  instanceAdapter?: RequestAdapter | RequestAdapterResolver,
  instancePlatform?: RequestPlatform
): Promise<RequestAdapter> {
  if (config.platform !== undefined && config.platform !== 'auto') {
    return createAdapter(config.platform);
  }
  if (instanceAdapter !== undefined) {
    return typeof instanceAdapter === 'function'
      ? await instanceAdapter(config)
      : instanceAdapter;
  }
  if (instancePlatform !== undefined && instancePlatform !== 'auto') {
    return createAdapter(instancePlatform);
  }
  const detected: DetectedPlatform = detectPlatform();
  if (detected === 'unknown') {
    throw new RequestError({
      code: 'UNSUPPORTED_PLATFORM',
      message:
        'No supported request platform detected (web fetch / wx.request / my.request / tt.request)',
      config,
    });
  }
  return createAdapter(detected);
}
