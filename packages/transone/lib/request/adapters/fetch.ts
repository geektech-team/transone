import { RequestError } from '../errors';
import {
  buildURL,
  mergeHeaders,
  normalizeMethod,
  serializeBody,
} from '../helpers';
import type { RequestAdapter, RequestConfig, RequestResponse } from '../types';

/**
 * Web 端适配器（策略）：基于 fetch。
 *
 * - 超时：AbortController + timer，超时归类 TIMEOUT
 * - 取消：config.signal 与超时共用同一个 AbortController，外部取消归类 ABORTED
 * - 响应体：arraybuffer 返回 ArrayBuffer；json（默认）尝试解析、失败回退原文；text 返回原文
 */
export class FetchAdapter implements RequestAdapter {
  public readonly platform = 'web' as const;

  public async request<T>(
    config: RequestConfig<T>
  ): Promise<RequestResponse<T>> {
    const method = normalizeMethod(config.method);
    const url = buildURL(config.baseURL, config.url, config.params);
    const headers = mergeHeaders(config.headers);
    const body = serializeBody(config.data, headers, method);
    const controller = new AbortController();
    let timedOut = false;
    let externalAborted = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (config.signal) {
      if (config.signal.aborted) {
        externalAborted = true;
        controller.abort();
      } else {
        config.signal.addEventListener(
          'abort',
          () => {
            externalAborted = true;
            controller.abort();
          },
          { once: true }
        );
      }
    }

    if (typeof config.timeout === 'number' && config.timeout > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, config.timeout);
    }

    const credentials: RequestCredentials =
      config.credentials ??
      (config.withCredentials === true ? 'include' : 'same-origin');

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
        credentials,
      });

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const data = await parseFetchData(response, config);
      return {
        data: data as T,
        statusCode: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        config,
      };
    } catch (error) {
      if (timedOut) {
        throw new RequestError({
          code: 'TIMEOUT',
          message: `Request timeout after ${String(config.timeout)}ms`,
          config,
          cause: error,
        });
      }
      if (externalAborted || controller.signal.aborted) {
        throw new RequestError({
          code: 'ABORTED',
          message: 'Request aborted',
          config,
          cause: error,
        });
      }
      throw new RequestError({
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : String(error),
        config,
        cause: error,
      });
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
}

async function parseFetchData(
  response: Response,
  config: RequestConfig
): Promise<unknown> {
  if (config.responseType === 'arraybuffer') {
    return response.arrayBuffer();
  }
  const text = await response.text();
  if (config.dataType === 'text' || !text) {
    return text;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
