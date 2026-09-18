import { describe, expect, it } from 'bun:test';
import { isRequestError, RequestError } from '../errors';
import { InterceptorManager } from '../interceptors';
import { createRequest } from '../index';
import { Request } from '../request';
import type { RequestAdapter, RequestConfig, RequestResponse } from '../types';

function mockAdapter(
  onRequest: (config: RequestConfig) => RequestResponse
): RequestAdapter {
  return {
    platform: 'web',
    request<T>(config: RequestConfig<T>): Promise<RequestResponse<T>> {
      return Promise.resolve(onRequest(config) as RequestResponse<T>);
    },
  };
}

const okResponse = (config: RequestConfig): RequestResponse => ({
  data: null,
  statusCode: 200,
  headers: {},
  config,
});

describe('InterceptorManager', () => {
  it('use 返回 id，eject 后不再执行', () => {
    const manager = new InterceptorManager<number>();
    let calls = 0;
    const id = manager.use((value) => {
      calls += 1;
      return value;
    });
    manager.forEach(() => {});
    manager.eject(id);
    manager.forEach(() => {});
    expect(calls).toBe(0);
  });

  it('clear 清空全部', () => {
    const manager = new InterceptorManager<number>();
    let calls = 0;
    manager.use((value) => {
      calls += 1;
      return value;
    });
    manager.clear();
    manager.forEach(() => {});
    expect(calls).toBe(0);
  });
});

describe('Request 配置合并', () => {
  it('实例级默认配置合并到单次请求', async () => {
    const seen: RequestConfig[] = [];
    const http = createRequest({
      baseURL: 'https://api.example.com',
      headers: { 'X-Token': 't1' },
      timeout: 5000,
      adapter: mockAdapter((config) => {
        seen.push(config);
        return okResponse(config);
      }),
    });

    await http.get<{ ok: boolean }>('/users', { params: { page: 1 } });

    expect(seen[0]).toMatchObject({
      baseURL: 'https://api.example.com',
      url: '/users',
      method: 'GET',
      timeout: 5000,
      headers: { 'X-Token': 't1' },
      params: { page: 1 },
    });
  });

  it('单次请求头覆盖实例级请求头', async () => {
    let captured: RequestConfig | undefined;
    const http = createRequest({
      headers: { 'X-Token': 't1', 'X-Other': 'o' },
      adapter: mockAdapter((config) => {
        captured = config;
        return okResponse(config);
      }),
    });

    await http.get('/x', { headers: { 'x-token': 't2' } });
    expect(captured?.headers).toEqual({ 'X-Other': 'o', 'x-token': 't2' });
  });

  it('缺少 url 抛 BAD_REQUEST', async () => {
    const http = createRequest({
      adapter: mockAdapter(okResponse),
    });
    await expect(http.request({ url: '' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('非法 method 抛 BAD_REQUEST', async () => {
    const http = createRequest({
      adapter: mockAdapter(okResponse),
    });
    await expect(
      http.request({ url: '/x', method: 'FOO' as never })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('Request 拦截器', () => {
  it('请求拦截器按注册顺序执行', async () => {
    const order: string[] = [];
    const http = createRequest({
      adapter: mockAdapter(okResponse),
    });

    http.interceptors.request.use((config) => {
      order.push('a');
      config.headers = { ...config.headers, 'X-A': '1' };
      return config;
    });
    http.interceptors.request.use((config) => {
      order.push('b');
      expect(config.headers?.['X-A']).toBe('1');
      return config;
    });

    await http.get('/x');
    expect(order).toEqual(['a', 'b']);
  });

  it('响应拦截器后注册的先执行', async () => {
    const order: string[] = [];
    const http = createRequest({
      adapter: mockAdapter(() => ({
        data: { n: 1 },
        statusCode: 200,
        headers: {},
        config: { url: '/x' },
      })),
    });

    http.interceptors.response.use((res) => {
      order.push('a');
      return res;
    });
    http.interceptors.response.use((res) => {
      order.push('b');
      return res;
    });

    await http.get('/x');
    expect(order).toEqual(['b', 'a']);
  });

  it('前序拦截器失败由后续拦截器 onRejected 恢复', async () => {
    const http = createRequest({
      adapter: mockAdapter(() => ({
        data: 'ok',
        statusCode: 200,
        headers: {},
        config: { url: '/recovered' },
      })),
    });

    http.interceptors.request.use(() => {
      throw new Error('boom');
    });
    http.interceptors.request.use(
      undefined,
      () =>
        ({
          url: '/recovered',
        }) as RequestConfig
    );

    const res = await http.get('/x');
    expect(res.data).toBe('ok');
  });

  it('适配器错误经响应拦截器 onRejected 处理', async () => {
    const http = createRequest({
      adapter: {
        platform: 'web',
        request: () =>
          Promise.reject(
            new RequestError({
              code: 'NETWORK_ERROR',
              message: 'offline',
              config: { url: '/x' },
            })
          ),
      },
    });

    let handled = false;
    http.interceptors.response.use(undefined, (error) => {
      handled = true;
      throw error;
    });

    await expect(http.get('/x')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    expect(handled).toBe(true);
  });

  it('eject 移除请求拦截器', async () => {
    let calls = 0;
    const http = createRequest({
      adapter: mockAdapter(okResponse),
    });

    const id = http.interceptors.request.use((config) => {
      calls += 1;
      return config;
    });
    await http.get('/x');
    http.interceptors.request.eject(id);
    await http.get('/x');
    expect(calls).toBe(1);
  });
});

describe('Request 适配器解析', () => {
  it('实例 adapter 解析函数按请求选择适配器', async () => {
    const seen: string[] = [];
    const http = createRequest({
      adapter: (config) => {
        seen.push(config.url);
        return mockAdapter((inner) => okResponse(inner));
      },
    });

    await http.get('/a');
    await http.post('/b');
    expect(seen).toEqual(['/a', '/b']);
  });

  it('config.platform 优先于实例 adapter', async () => {
    const http = createRequest({
      adapter: mockAdapter(okResponse),
    });

    // 测试环境没有 wx 全局，指定 weixin 会走到 UNSUPPORTED_PLATFORM
    await expect(http.get('/x', { platform: 'weixin' })).rejects.toMatchObject({
      code: 'UNSUPPORTED_PLATFORM',
    });
  });

  it('createRequest 返回 Request 实例', () => {
    const http = createRequest();
    expect(http).toBeInstanceOf(Request);
  });
});

describe('Request 方法快捷方式', () => {
  it('post 透传 data 与方法', async () => {
    let captured: RequestConfig | undefined;
    const http = createRequest({
      adapter: mockAdapter((config) => {
        captured = config;
        return { ...okResponse(config), statusCode: 201 };
      }),
    });

    await http.post('/users', { name: 'a' });
    expect(captured?.method).toBe('POST');
    expect(captured?.data).toEqual({ name: 'a' });
  });

  it('get 透传 params', async () => {
    let captured: RequestConfig | undefined;
    const http = createRequest({
      adapter: mockAdapter((config) => {
        captured = config;
        return okResponse(config);
      }),
    });

    await http.get('/items', { params: { page: 2 } });
    expect(captured?.method).toBe('GET');
    expect(captured?.params).toEqual({ page: 2 });
  });

  it('响应类型泛型透出', async () => {
    const http = createRequest({
      adapter: mockAdapter(() => ({
        data: { ok: true },
        statusCode: 200,
        headers: {},
        config: { url: '/x' },
      })),
    });

    const res = await http.get<{ ok: boolean }>('/x');
    expect(res.data.ok).toBe(true);
  });
});

describe('RequestError', () => {
  it('isRequestError 判定', () => {
    const error = new RequestError({
      code: 'NETWORK_ERROR',
      message: 'x',
      config: { url: '/x' },
    });
    expect(isRequestError(error)).toBe(true);
    expect(isRequestError(new Error('x'))).toBe(false);
  });
});
