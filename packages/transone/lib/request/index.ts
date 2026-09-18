import { Request } from './request';
import type { RequestOptions } from './types';

/** 创建独立请求实例；不传配置时等价于使用默认实例 */
export function createRequest(options: RequestOptions = {}): Request {
  return new Request(options);
}

/**
 * 全局默认请求实例：直接使用无需创建。
 * ```ts
 * import { request } from 'transone/request';
 * const res = await request.get('/api/items');
 * ```
 */
export const request: Request = new Request();

export { Request } from './request';
export { InterceptorManager } from './interceptors';
export { RequestError, isRequestError } from './errors';
export type { RequestErrorCode, RequestErrorOptions } from './errors';
export {
  adapters,
  createAdapter,
  detectPlatform,
  resolveAdapter,
} from './adapters';
export type { MiniProgramDialect, MiniProgramRequestApi } from './adapters';
export type {
  DetectedPlatform,
  HeaderValue,
  HttpMethod,
  InterceptorFulfilled,
  InterceptorHandler,
  InterceptorRejected,
  RequestAdapter,
  RequestAdapterResolver,
  RequestConfig,
  RequestDataType,
  RequestOptions,
  RequestPlatform,
  RequestResponse,
  RequestResponseType,
} from './types';
