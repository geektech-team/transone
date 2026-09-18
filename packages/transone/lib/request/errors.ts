import type { RequestConfig, RequestResponse } from './types';

/**
 * 统一请求错误码：
 * - NETWORK_ERROR：网络层失败（断网、DNS、连接被拒等）
 * - TIMEOUT：超时
 * - ABORTED：被 AbortSignal 取消
 * - BAD_REQUEST：配置非法（缺少 url、方法不支持等）
 * - UNSUPPORTED_PLATFORM：当前环境没有可用的请求 API，或指定了不支持的端
 * - UNKNOWN：无法归类的失败
 */
export type RequestErrorCode =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'BAD_REQUEST'
  | 'UNSUPPORTED_PLATFORM'
  | 'UNKNOWN';

export interface RequestErrorOptions {
  code: RequestErrorCode;
  message: string;
  /** 出错的请求配置 */
  config: RequestConfig;
  /** 出错时已拿到的响应（如响应处理阶段失败） */
  response?: RequestResponse;
  /** 底层原因（原生异常 / 平台 fail 对象等） */
  cause?: unknown;
}

/**
 * 统一请求错误：适配器与拦截器抛出的错误全部归一化为该类型，
 * 便于调用方按 code 分支处理（超时重试、取消忽略、网络提示等）。
 */
export class RequestError extends Error {
  readonly code: RequestErrorCode;
  readonly config: RequestConfig;
  readonly response?: RequestResponse;
  readonly cause?: unknown;

  public constructor(options: RequestErrorOptions) {
    super(options.message);
    this.name = 'RequestError';
    this.code = options.code;
    this.config = options.config;
    this.response = options.response;
    this.cause = options.cause;
  }
}

export function isRequestError(error: unknown): error is RequestError {
  return error instanceof RequestError;
}
