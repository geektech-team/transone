/**
 * request 模块纯函数工具：URL 拼接、query 序列化、请求头合并、请求体序列化。
 * 不依赖任何平台全局，便于单测。
 */
import type { HeaderValue, HttpMethod } from './types';

const HTTP_METHODS: ReadonlySet<string> = new Set([
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'HEAD',
  'OPTIONS',
]);

/** 归一化 HTTP 方法为大写；缺省为 GET，非法方法抛错 */
export function normalizeMethod(method: string | undefined): HttpMethod {
  if (method === undefined) {
    return 'GET';
  }
  const normalized = method.toUpperCase();
  if (!HTTP_METHODS.has(normalized)) {
    throw new Error(`Unsupported HTTP method: ${method}`);
  }
  return normalized as HttpMethod;
}

const ABSOLUTE_URL_RE = /^[a-z][a-z\d+.-]*:\/\//i;

/** 是否为带协议的绝对地址（http:// / https:// 等） */
export function isAbsoluteURL(url: string): boolean {
  return ABSOLUTE_URL_RE.test(url);
}

/** 拼接 baseURL 与相对地址，去除重复斜杠；绝对地址直接返回 */
export function combineURLs(baseURL: string | undefined, url: string): string {
  if (!baseURL || isAbsoluteURL(url)) {
    return url;
  }
  return `${baseURL.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}

function formatParamValue(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * 序列化 query 参数：null / undefined 跳过，数组展开为重复键，
 * Date 转 ISO 字符串，对象 JSON 序列化。
 */
export function serializeParams(
  params: Record<string, unknown> | undefined
): string {
  if (!params) {
    return '';
  }
  const parts: string[] = [];
  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (value === undefined || value === null) {
      return;
    }
    const encodedKey = encodeURIComponent(key);
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item === undefined || item === null) {
          return;
        }
        parts.push(
          `${encodedKey}=${encodeURIComponent(formatParamValue(item))}`
        );
      });
      return;
    }
    parts.push(`${encodedKey}=${encodeURIComponent(formatParamValue(value))}`);
  });
  return parts.join('&');
}

/** 拼接完整请求地址：baseURL + url + query 参数 */
export function buildURL(
  baseURL: string | undefined,
  url: string,
  params: Record<string, unknown> | undefined
): string {
  const full = combineURLs(baseURL, url);
  const query = serializeParams(params);
  if (!query) {
    return full;
  }
  const separator = full.includes('?') ? '&' : '?';
  return `${full}${separator}${query}`;
}

function normalizeHeaderValue(value: HeaderValue): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return String(value);
}

/**
 * 大小写不敏感合并请求头：多个来源按顺序合并，后出现的同名头（忽略大小写）
 * 覆盖先前的，键名保留后出现来源的原始写法。
 */
export function mergeHeaders(
  ...sources: Array<Record<string, HeaderValue> | undefined>
): Record<string, string> {
  const merged: Record<string, string> = {};
  const lowerToKey = new Map<string, string>();

  sources.forEach((source) => {
    if (!source) {
      return;
    }
    Object.keys(source).forEach((key) => {
      const value = normalizeHeaderValue(source[key]);
      if (value === undefined) {
        return;
      }
      const lower = key.toLowerCase();
      const previous = lowerToKey.get(lower);
      if (previous !== undefined && previous !== key) {
        delete merged[previous];
      }
      lowerToKey.set(lower, key);
      merged[key] = value;
    });
  });

  return merged;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some(
    (key) => key.toLowerCase() === name.toLowerCase()
  );
}

/**
 * 序列化请求体（Web 端）：
 * - GET / HEAD 无请求体
 * - 字符串、FormData、Blob、ArrayBuffer / TypedArray 原样透传
 * - 普通对象 / 数组 JSON 序列化，并自动设置 Content-Type: application/json
 */
export function serializeBody(
  data: unknown,
  headers: Record<string, string>,
  method: HttpMethod
): BodyInit | undefined {
  if (method === 'GET' || method === 'HEAD') {
    return undefined;
  }
  if (data === undefined || data === null) {
    return undefined;
  }
  if (typeof data === 'string') {
    return data;
  }
  if (typeof FormData !== 'undefined' && data instanceof FormData) {
    return data;
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return data;
  }
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    return data as BodyInit;
  }
  if (!hasHeader(headers, 'Content-Type')) {
    headers['Content-Type'] = 'application/json';
  }
  return JSON.stringify(data);
}
