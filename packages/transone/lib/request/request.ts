import { resolveAdapter } from './adapters';
import { RequestError } from './errors';
import { mergeHeaders, normalizeMethod } from './helpers';
import { InterceptorManager } from './interceptors';
import type {
  RequestAdapter,
  RequestConfig,
  RequestOptions,
  RequestResponse,
} from './types';

type ChainStep = (value: unknown) => unknown;

/**
 * 统一请求客户端：跨端请求入口。
 *
 * 职责：
 * - 实例级默认值（baseURL / headers / timeout / platform 等）与单次配置合并
 * - 请求拦截器（注册顺序）→ 平台适配器 → 响应拦截器（后注册先执行）的链路编排
 * - 目标端解析：config.platform > 实例 adapter > 实例 platform > 运行时探测
 *
 * 用法：
 * ```ts
 * const http = createRequest({ baseURL: '/api', timeout: 10000 });
 * http.interceptors.request.use((config) => {
 *   config.headers.Authorization = `Bearer ${token}`;
 *   return config;
 * });
 * const res = await http.get<{ list: Item[] }>('/items');
 * ```
 */
export class Request {
  /** 请求 / 响应拦截器管理器 */
  public readonly interceptors: {
    request: InterceptorManager<RequestConfig>;
    response: InterceptorManager<RequestResponse>;
  } = {
    request: new InterceptorManager<RequestConfig>(),
    response: new InterceptorManager<RequestResponse>(),
  };

  private readonly instanceDefaults: RequestOptions;
  private readonly instanceAdapter?: RequestOptions['adapter'];
  private readonly instancePlatform?: RequestOptions['platform'];

  public constructor(options: RequestOptions = {}) {
    const {
      adapter: instanceAdapter,
      platform: instancePlatform,
      ...rest
    } = options;
    this.instanceAdapter = instanceAdapter;
    this.instancePlatform = instancePlatform;
    this.instanceDefaults = { ...rest };
  }

  /** 发起请求：合并配置 → 请求拦截器 → 适配器 → 响应拦截器 */
  public request<T = unknown>(
    config: RequestConfig<T>
  ): Promise<RequestResponse<T>> {
    let merged: RequestConfig<T>;
    try {
      merged = this.mergeConfig(config);
    } catch (error) {
      // 配置非法统一走 rejected promise，调用方用 .catch / try-await 即可处理
      return Promise.reject(error);
    }

    // 拦截器链：请求拦截器按注册顺序在最前，适配器居中进行实际请求，
    // 响应拦截器后注册的先执行（离调用方最近，最外层）。
    // 链以 (fulfilled, rejected) 成对消费；onRejected 捕获的是其之前链路的错误。
    const chain: Array<ChainStep | undefined> = [];
    this.interceptors.request.forEach((handler) => {
      chain.push(
        handler.onFulfilled as unknown as ChainStep,
        handler.onRejected as ChainStep | undefined
      );
    });
    chain.push(
      (value: unknown) => this.dispatch(value as RequestConfig<T>),
      undefined
    );
    const responseHandlers: Array<{
      onFulfilled?: ChainStep;
      onRejected?: ChainStep | undefined;
    }> = [];
    this.interceptors.response.forEach((handler) => {
      responseHandlers.push({
        onFulfilled: handler.onFulfilled as unknown as ChainStep,
        onRejected: handler.onRejected as ChainStep | undefined,
      });
    });
    for (let index = responseHandlers.length - 1; index >= 0; index -= 1) {
      const handler = responseHandlers[index];
      chain.push(handler.onFulfilled, handler.onRejected);
    }

    let promise: Promise<unknown> = Promise.resolve(merged);
    while (chain.length > 0) {
      const fulfilled = chain.shift();
      const rejected = chain.shift();
      promise = promise.then(
        fulfilled as ((value: unknown) => unknown) | undefined,
        rejected as ((reason: unknown) => unknown) | undefined
      );
    }
    return promise as Promise<RequestResponse<T>>;
  }

  public get<T = unknown>(
    url: string,
    config?: Omit<RequestConfig, 'url' | 'method'>
  ): Promise<RequestResponse<T>> {
    return this.request<T>({ ...config, url, method: 'GET' });
  }

  public delete<T = unknown>(
    url: string,
    config?: Omit<RequestConfig, 'url' | 'method'>
  ): Promise<RequestResponse<T>> {
    return this.request<T>({ ...config, url, method: 'DELETE' });
  }

  public head<T = unknown>(
    url: string,
    config?: Omit<RequestConfig, 'url' | 'method'>
  ): Promise<RequestResponse<T>> {
    return this.request<T>({ ...config, url, method: 'HEAD' });
  }

  public options<T = unknown>(
    url: string,
    config?: Omit<RequestConfig, 'url' | 'method'>
  ): Promise<RequestResponse<T>> {
    return this.request<T>({ ...config, url, method: 'OPTIONS' });
  }

  public post<T = unknown>(
    url: string,
    data?: T,
    config?: Omit<RequestConfig<T>, 'url' | 'method' | 'data'>
  ): Promise<RequestResponse<T>> {
    return this.request<T>({ ...config, url, method: 'POST', data });
  }

  public put<T = unknown>(
    url: string,
    data?: T,
    config?: Omit<RequestConfig<T>, 'url' | 'method' | 'data'>
  ): Promise<RequestResponse<T>> {
    return this.request<T>({ ...config, url, method: 'PUT', data });
  }

  public patch<T = unknown>(
    url: string,
    data?: T,
    config?: Omit<RequestConfig<T>, 'url' | 'method' | 'data'>
  ): Promise<RequestResponse<T>> {
    return this.request<T>({ ...config, url, method: 'PATCH', data });
  }

  private dispatch<T>(config: RequestConfig<T>): Promise<RequestResponse<T>> {
    return resolveAdapter(
      config,
      this.instanceAdapter,
      this.instancePlatform
    ).then((adapter: RequestAdapter) => adapter.request<T>(config));
  }

  /** 合并实例级默认值与单次配置，并校验 url / method */
  private mergeConfig<T>(config: RequestConfig<T>): RequestConfig<T> {
    if (!config || typeof config !== 'object') {
      throw new RequestError({
        code: 'BAD_REQUEST',
        message: 'Request config must be an object',
        config: config as RequestConfig,
      });
    }

    const merged: RequestConfig = {
      ...this.instanceDefaults,
      ...config,
      headers: mergeHeaders(this.instanceDefaults.headers, config.headers),
      params: { ...this.instanceDefaults.params, ...config.params },
    };

    if (typeof merged.url !== 'string' || merged.url.length === 0) {
      throw new RequestError({
        code: 'BAD_REQUEST',
        message: 'Request url is required',
        config: merged,
      });
    }

    try {
      merged.method = normalizeMethod(merged.method);
    } catch (cause) {
      throw new RequestError({
        code: 'BAD_REQUEST',
        message: (cause as Error).message,
        config: merged,
        cause,
      });
    }

    return merged as RequestConfig<T>;
  }
}
