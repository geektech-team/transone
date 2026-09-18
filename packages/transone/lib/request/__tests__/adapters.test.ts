import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createAdapter } from '../adapters';
import { FetchAdapter } from '../adapters/fetch';
import { detectPlatform } from '../adapters/platform';
import { createRequest } from '../index';

type Host = Record<string, unknown>;

function setGlobal(key: string, value: unknown): void {
  (globalThis as Host)[key] = value;
}

function clearMpGlobals(): void {
  delete (globalThis as Host).wx;
  delete (globalThis as Host).my;
  delete (globalThis as Host).tt;
}

describe('detectPlatform', () => {
  beforeEach(clearMpGlobals);
  afterEach(clearMpGlobals);

  it('检测到微信', () => {
    setGlobal('wx', { request: () => ({}) });
    expect(detectPlatform()).toBe('weixin');
  });

  it('检测到阿里', () => {
    setGlobal('my', { request: () => ({}) });
    expect(detectPlatform()).toBe('alipay');
  });

  it('检测到字节', () => {
    setGlobal('tt', { request: () => ({}) });
    expect(detectPlatform()).toBe('bytedance');
  });

  it('同时存在时按 wx → my → tt 优先级', () => {
    setGlobal('tt', { request: () => ({}) });
    setGlobal('my', { request: () => ({}) });
    setGlobal('wx', { request: () => ({}) });
    expect(detectPlatform()).toBe('weixin');
  });

  it('全局存在但没有 request 函数不算可用，回退 web', () => {
    setGlobal('wx', {});
    expect(detectPlatform()).toBe('web');
  });

  it('无小程序全局时回退 web（Bun 提供 fetch）', () => {
    expect(detectPlatform()).toBe('web');
  });
});

describe('FetchAdapter', () => {
  const originalFetch = globalThis.fetch;

  function installFetch(impl: typeof fetch): void {
    (globalThis as { fetch: typeof fetch }).fetch = impl;
  }

  afterEach(() => {
    installFetch(originalFetch);
  });

  it('URL / 方法 / 请求体 / 请求头组装与响应归一化', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit = {};
    installFetch((input, init) => {
      capturedUrl = String(input);
      capturedInit = { ...init };
      return Promise.resolve(
        new Response('{"ok":true}', {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    const adapter = new FetchAdapter();
    const res = await adapter.request({
      url: '/items',
      baseURL: 'https://api.com',
      method: 'post',
      params: { page: 2 },
      data: { name: 'x' },
      headers: { 'X-A': '1' },
    });

    expect(capturedUrl).toBe('https://api.com/items?page=2');
    expect(capturedInit.method).toBe('POST');
    expect(capturedInit.body).toBe('{"name":"x"}');
    const capturedHeaders = capturedInit.headers as Record<string, string>;
    expect(capturedHeaders['Content-Type']).toBe('application/json');
    expect(capturedHeaders['X-A']).toBe('1');
    expect(res).toMatchObject({
      statusCode: 200,
      statusText: 'OK',
      data: { ok: true },
    });
  });

  it('dataType text 返回原文', async () => {
    installFetch(() =>
      Promise.resolve(new Response('plain text', { status: 200 }))
    );
    const res = await new FetchAdapter().request({
      url: '/x',
      dataType: 'text',
    });
    expect(res.data).toBe('plain text');
  });

  it('responseType arraybuffer 返回 ArrayBuffer', async () => {
    installFetch(() => Promise.resolve(new Response('abc', { status: 200 })));
    const res = await new FetchAdapter().request({
      url: '/x',
      responseType: 'arraybuffer',
    });
    expect(res.data).toBeInstanceOf(ArrayBuffer);
  });

  it('JSON 解析失败回退原文', async () => {
    installFetch(() =>
      Promise.resolve(
        new Response('not-json', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        })
      )
    );
    const res = await new FetchAdapter().request({ url: '/x' });
    expect(res.data).toBe('not-json');
  });

  it('超时归类 TIMEOUT', async () => {
    installFetch(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        })
    );

    const start = Date.now();
    await expect(
      new FetchAdapter().request({ url: '/x', timeout: 30 })
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(Date.now() - start).toBeGreaterThanOrEqual(25);
  });

  it('外部 signal 取消归类 ABORTED', async () => {
    installFetch(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        })
    );

    const controller = new AbortController();
    const promise = new FetchAdapter().request({
      url: '/x',
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 10);
    await expect(promise).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('网络错误归类 NETWORK_ERROR', async () => {
    installFetch(() => Promise.reject(new TypeError('fetch failed')));
    await expect(
      new FetchAdapter().request({ url: '/x' })
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});

describe('MiniProgramAdapter（微信）', () => {
  beforeEach(clearMpGlobals);
  afterEach(clearMpGlobals);

  it('通过 wx.request 发起请求并归一化响应', async () => {
    let captured: Record<string, unknown> = {};
    setGlobal('wx', {
      request: (options: Record<string, unknown>) => {
        captured = options;
        return { abort: () => {} };
      },
    });

    const promise = createAdapter('weixin').request({
      url: '/items',
      baseURL: 'https://api.com',
      params: { page: 1 },
      headers: { 'X-A': '1' },
    });

    expect(captured).toMatchObject({
      url: 'https://api.com/items?page=1',
      method: 'GET',
      dataType: 'json',
      header: { 'X-A': '1' },
    });

    (captured.success as (res: Record<string, unknown>) => void)({
      data: { list: [1] },
      statusCode: 200,
      header: { 'Content-Type': 'application/json' },
      cookies: ['a=1'],
    });

    const res = await promise;
    expect(res).toMatchObject({
      statusCode: 200,
      data: { list: [1] },
      headers: { 'Content-Type': 'application/json' },
      cookies: ['a=1'],
    });
  });

  it('fail 按 errMsg 归类错误码', async () => {
    let captured: Record<string, unknown> = {};
    setGlobal('wx', {
      request: (options: Record<string, unknown>) => {
        captured = options;
        return { abort: () => {} };
      },
    });

    const timeoutPromise = createAdapter('weixin').request({ url: '/x' });
    (captured.fail as (err: Record<string, unknown>) => void)({
      errMsg: 'request:fail timeout',
    });
    await expect(timeoutPromise).rejects.toMatchObject({ code: 'TIMEOUT' });

    const abortPromise = createAdapter('weixin').request({ url: '/x' });
    (captured.fail as (err: Record<string, unknown>) => void)({
      errMsg: 'request:fail abort',
    });
    await expect(abortPromise).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('超时 timer 触发 abort 并归类 TIMEOUT', async () => {
    let aborted = 0;
    let captured: Record<string, unknown> = {};
    setGlobal('wx', {
      request: (options: Record<string, unknown>) => {
        captured = options;
        return {
          abort: () => {
            aborted += 1;
          },
        };
      },
    });

    const promise = createAdapter('weixin').request({ url: '/x', timeout: 20 });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(aborted).toBe(1);

    (captured.fail as (err: Record<string, unknown>) => void)({
      errMsg: 'request:fail abort',
    });
    await expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('signal 取消时 abort 底层任务', async () => {
    let aborted = 0;
    let captured: Record<string, unknown> = {};
    setGlobal('wx', {
      request: (options: Record<string, unknown>) => {
        captured = options;
        return {
          abort: () => {
            aborted += 1;
          },
        };
      },
    });

    const controller = new AbortController();
    const promise = createAdapter('weixin').request({
      url: '/x',
      signal: controller.signal,
    });
    controller.abort();
    expect(aborted).toBe(1);

    (captured.fail as (err: Record<string, unknown>) => void)({
      errMsg: 'request:fail abort',
    });
    await expect(promise).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('目标环境缺少 wx 时抛 UNSUPPORTED_PLATFORM', async () => {
    clearMpGlobals();
    await expect(
      createAdapter('weixin').request({ url: '/x' })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_PLATFORM' });
  });
});

describe('MiniProgramAdapter（支付宝）', () => {
  beforeEach(clearMpGlobals);
  afterEach(clearMpGlobals);

  it('success 用 status / headers 归一化，fail 用 errorMessage', async () => {
    let captured: Record<string, unknown> = {};
    setGlobal('my', {
      request: (options: Record<string, unknown>) => {
        captured = options;
        return { abort: () => {} };
      },
    });

    const promise = createAdapter('alipay').request({ url: '/x' });
    expect(captured).toMatchObject({
      headers: {},
      dataType: 'json',
    });

    (captured.success as (res: Record<string, unknown>) => void)({
      data: 'ok',
      status: 200,
      headers: { 'X-B': '2' },
    });
    const res = await promise;
    expect(res).toMatchObject({
      statusCode: 200,
      data: 'ok',
      headers: { 'X-B': '2' },
    });

    const failPromise = createAdapter('alipay').request({ url: '/y' });
    (captured.fail as (err: Record<string, unknown>) => void)({
      error: 14,
      errorMessage: 'network error',
    });
    await expect(failPromise).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'network error',
    });
  });
});

describe('整链路（默认实例 + 微信环境）', () => {
  beforeEach(clearMpGlobals);
  afterEach(clearMpGlobals);

  it('request 默认实例在小程序环境自动走 wx.request', async () => {
    let captured: Record<string, unknown> = {};
    setGlobal('wx', {
      request: (options: Record<string, unknown>) => {
        captured = options;
        return { abort: () => {} };
      },
    });

    const promise = createRequest({
      baseURL: 'https://api.com',
      headers: { 'X-Token': 't1' },
    }).get('/items');

    // 适配器调用发生在拦截器链的微任务中，先冲刷微任务再断言
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(captured.url).toBe('https://api.com/items');
    expect(captured.header).toEqual({ 'X-Token': 't1' });

    (captured.success as (res: Record<string, unknown>) => void)({
      data: { list: [] },
      statusCode: 200,
      header: {},
    });
    const res = await promise;
    expect(res.data).toEqual({ list: [] });
  });
});
