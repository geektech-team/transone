import { RequestError, type RequestErrorCode } from '../errors';
import { buildURL, mergeHeaders } from '../helpers';
import type {
  HeaderValue,
  RequestAdapter,
  RequestConfig,
  RequestResponse,
} from '../types';
import { getMiniProgramApi } from './platform';

/**
 * 小程序差异层：微信 / 阿里 / 字节的请求 API 语义一致（wx.request /
 * my.request / tt.request），仅字段名与回调形状不同。与 CLI 的 MpDialect
 * 同思路，把差异收敛为参数化方言，避免三个适配器重复实现。
 */
export interface MiniProgramDialect {
  /** 目标端标识 */
  platform: 'weixin' | 'alipay' | 'bytedance';
  /** 全局对象名：wx / my / tt */
  globalName: 'wx' | 'my' | 'tt';
  /** 请求参数中请求头字段名：微信/字节 header，阿里 headers */
  headerField: 'header' | 'headers';
  /** 成功回调中状态码字段：微信/字节 statusCode，阿里 status */
  statusField: 'statusCode' | 'status';
  /** 成功回调中响应头字段名：微信/字节 header，阿里 headers */
  responseHeaderField: 'header' | 'headers';
}

export const WEIXIN_DIALECT: MiniProgramDialect = {
  platform: 'weixin',
  globalName: 'wx',
  headerField: 'header',
  statusField: 'statusCode',
  responseHeaderField: 'header',
};

export const ALIPAY_DIALECT: MiniProgramDialect = {
  platform: 'alipay',
  globalName: 'my',
  headerField: 'headers',
  statusField: 'status',
  responseHeaderField: 'headers',
};

export const BYTEDANCE_DIALECT: MiniProgramDialect = {
  platform: 'bytedance',
  globalName: 'tt',
  headerField: 'header',
  statusField: 'statusCode',
  responseHeaderField: 'header',
};

/**
 * 小程序端适配器（策略）：wx.request / my.request / tt.request 的统一封装。
 *
 * - 超时：手动 timer + 底层任务 abort，三端行为一致；成功/失败回调都会清理 timer
 * - 取消：config.signal 触发时 abort 底层任务
 * - 失败归一化：按平台 errMsg 关键字归类 TIMEOUT / ABORTED / NETWORK_ERROR
 */
export class MiniProgramAdapter implements RequestAdapter {
  public readonly platform: 'weixin' | 'alipay' | 'bytedance';

  public constructor(private readonly dialect: MiniProgramDialect) {
    this.platform = dialect.platform;
  }

  public request<T>(config: RequestConfig<T>): Promise<RequestResponse<T>> {
    const api = getMiniProgramApi(this.dialect.globalName);
    if (!api || typeof api.request !== 'function') {
      return Promise.reject(
        new RequestError({
          code: 'UNSUPPORTED_PLATFORM',
          message: `${this.dialect.globalName}.request is not available in current environment`,
          config,
        })
      );
    }
    // 守卫后收窄为函数；Promise 执行器闭包内无法复用前面的窄化
    const requestFn = api.request;

    return new Promise<RequestResponse<T>>((resolve, reject) => {
      let timedOut = false;
      let settled = false;
      let task: { abort?: () => void } | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;

      // 保证成功/失败/超时只结算一次，并清理超时 timer
      const settle = (fn: () => void): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        fn();
      };

      const options: Record<string, unknown> = {
        url: buildURL(config.baseURL, config.url, config.params),
        method: config.method ?? 'GET',
        data: config.data,
        [this.dialect.headerField]: normalizeHeaders(config.headers),
        dataType: config.dataType ?? 'json',
        ...(config.responseType !== undefined
          ? { responseType: config.responseType }
          : {}),
        ...(config.timeout !== undefined && config.timeout > 0
          ? { timeout: config.timeout }
          : {}),
        success: (res: Record<string, unknown>) => {
          settle(() => {
            const rawStatus = res[this.dialect.statusField];
            const statusCode = Number(rawStatus ?? res.statusCode ?? 0);
            const responseHeaders = normalizeResponseHeaders(
              res[this.dialect.responseHeaderField]
            );
            resolve({
              data: res.data as T,
              statusCode,
              headers: responseHeaders,
              config,
              ...(Array.isArray(res.cookies)
                ? { cookies: res.cookies as string[] }
                : {}),
              ...(typeof res.errMsg === 'string' ? { errMsg: res.errMsg } : {}),
            });
          });
        },
        fail: (err: Record<string, unknown>) => {
          settle(() => {
            const errMsg = extractFailMessage(err);
            reject(
              new RequestError({
                code: timedOut ? 'TIMEOUT' : classifyMpError(errMsg),
                message: errMsg || 'Network request failed',
                config,
                cause: err,
              })
            );
          });
        },
      };

      if (config.timeout !== undefined && config.timeout > 0) {
        timer = setTimeout(() => {
          timedOut = true;
          task?.abort?.();
        }, config.timeout);
      }

      task = requestFn(options) ?? undefined;

      if (config.signal) {
        if (config.signal.aborted) {
          task?.abort?.();
        } else {
          config.signal.addEventListener(
            'abort',
            () => {
              task?.abort?.();
            },
            { once: true }
          );
        }
      }
    });
  }
}

function normalizeHeaders(
  headers: Record<string, HeaderValue> | undefined
): Record<string, string> {
  return mergeHeaders(headers);
}

function normalizeResponseHeaders(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  const result: Record<string, string> = {};
  Object.keys(value as Record<string, unknown>).forEach((key) => {
    const item = (value as Record<string, unknown>)[key];
    if (item !== undefined && item !== null) {
      result[key] = String(item);
    }
  });
  return result;
}

function extractFailMessage(err: Record<string, unknown>): string {
  if (typeof err.errMsg === 'string') {
    return err.errMsg;
  }
  if (typeof err.errorMessage === 'string') {
    return err.errorMessage;
  }
  if (typeof err.error === 'string') {
    return err.error;
  }
  return '';
}

/** 按平台 errMsg 关键字归类错误码 */
function classifyMpError(errMsg: string): RequestErrorCode {
  if (!errMsg) {
    return 'UNKNOWN';
  }
  if (/timeout/i.test(errMsg)) {
    return 'TIMEOUT';
  }
  if (/abort/i.test(errMsg)) {
    return 'ABORTED';
  }
  return 'NETWORK_ERROR';
}
