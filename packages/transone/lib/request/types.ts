/**
 * request 模块公共类型：跨端（Web / 微信 / 阿里 / 字节小程序）统一请求模型。
 */

/** 支持的 HTTP 方法 */
export type HttpMethod =
  'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/**
 * 目标端。'auto' 表示运行时按环境自动探测（默认）。
 * 各端对应请求 API：Web fetch / 微信 wx.request / 阿里 my.request / 字节 tt.request。
 */
export type RequestPlatform =
  'auto' | 'web' | 'weixin' | 'alipay' | 'bytedance';

/** 运行时探测结果；探测不到任何受支持环境时为 'unknown' */
export type DetectedPlatform = Exclude<RequestPlatform, 'auto'> | 'unknown';

/** 响应数据解析方式：json 自动解析（失败回退原文），text 返回原始字符串 */
export type RequestDataType = 'json' | 'text';

/** 响应数据类型（小程序端 responseType 语义） */
export type RequestResponseType = 'text' | 'arraybuffer';

export type HeaderValue = string | number | boolean | undefined;

/**
 * 单次请求配置。
 * 未填写的字段回退到实例级默认值（RequestOptions）；实例级也没有的字段使用平台默认。
 */
export interface RequestConfig<T = unknown> {
  /** 请求地址；以协议（http:// / https:// 等）开头时忽略 baseURL */
  url: string;
  /** HTTP 方法，默认 GET */
  method?: HttpMethod | Lowercase<HttpMethod>;
  /** 基础地址，与 url 拼接；仅对相对地址生效 */
  baseURL?: string;
  /** 请求头，合并到实例级默认请求头之上（大小写不敏感，后者覆盖前者） */
  headers?: Record<string, HeaderValue>;
  /** URL query 参数，序列化追加到地址后 */
  params?: Record<string, unknown>;
  /** 请求体：普通对象 / 数组自动 JSON 序列化并设置 Content-Type */
  data?: T;
  /** 超时（毫秒）；0 / 缺省表示不超时 */
  timeout?: number;
  /** 响应解析方式，默认 json */
  dataType?: RequestDataType;
  /** 响应数据类型，默认 text */
  responseType?: RequestResponseType;
  /** 取消信号（AbortSignal）；小程序端通过 abort 底层请求任务实现 */
  signal?: AbortSignal;
  /** 本次请求的目标端覆盖；缺省继承实例级配置，默认 auto 自动探测 */
  platform?: RequestPlatform;
  /** Web 端：跨域请求携带凭证（等价 credentials: 'include'） */
  withCredentials?: boolean;
  /** Web 端：fetch credentials，显式设置时优先于 withCredentials */
  credentials?: RequestCredentials;
  /** 透传平台特有选项（如 wx.request 的 enableHttp2 / enableChunked 等） */
  [key: string]: unknown;
}

/**
 * 统一响应：各端原始响应（fetch Response / wx success 等）归一化后的形状。
 * HTTP 4xx/5xx 不视为异常（与小程序端 success 语义一致），由调用方按 statusCode 处理。
 */
export interface RequestResponse<T = unknown> {
  /** 响应体：dataType json 时已尝试 JSON.parse */
  data: T;
  /** HTTP 状态码 */
  statusCode: number;
  /** 状态文本（Web 端有，小程序端为空） */
  statusText?: string;
  /** 响应头（键名保持平台原始大小写） */
  headers: Record<string, string>;
  /** 请求最终使用的配置（含实例级默认值合并结果） */
  config: RequestConfig;
  /** 小程序端返回的 cookie（微信 / 字节） */
  cookies?: string[];
  /** 平台原始 errMsg（如有） */
  errMsg?: string;
}

/** 拦截器成功回调：可返回原值 / 新值 / Promise */
export type InterceptorFulfilled<T> = (value: T) => T | Promise<T>;

/** 拦截器失败回调：处理后可返回一个值恢复流程，或再次抛出 */
export type InterceptorRejected = (error: unknown) => unknown;

export interface InterceptorHandler<T> {
  onFulfilled?: InterceptorFulfilled<T>;
  onRejected?: InterceptorRejected;
}

/**
 * 平台适配器（策略）：每种目标端一个实现。
 * 统一输入 RequestConfig，输出归一化 RequestResponse；失败抛出 RequestError。
 */
export interface RequestAdapter {
  readonly platform: Exclude<RequestPlatform, 'auto'>;
  request<T>(config: RequestConfig<T>): Promise<RequestResponse<T>>;
}

/** 自定义适配器解析函数：根据请求配置返回适配器 */
export type RequestAdapterResolver = (
  config: RequestConfig
) => RequestAdapter | Promise<RequestAdapter>;

/**
 * 实例级默认配置：字段语义与 RequestConfig 一致，作为默认值合并到每次请求。
 */
export interface RequestOptions {
  baseURL?: string;
  headers?: Record<string, HeaderValue>;
  params?: Record<string, unknown>;
  timeout?: number;
  dataType?: RequestDataType;
  responseType?: RequestResponseType;
  /** 默认目标端，默认 auto（运行时探测） */
  platform?: RequestPlatform;
  /** 自定义适配器（对象或解析函数），优先级高于 platform */
  adapter?: RequestAdapter | RequestAdapterResolver;
}
