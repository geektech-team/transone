import { describe, expect, it } from 'bun:test';
import {
  buildURL,
  combineURLs,
  mergeHeaders,
  normalizeMethod,
  serializeBody,
  serializeParams,
} from '../helpers';

describe('normalizeMethod', () => {
  it('缺省默认 GET', () => {
    expect(normalizeMethod(undefined)).toBe('GET');
  });

  it('小写归一化为大写', () => {
    expect(normalizeMethod('post')).toBe('POST');
    expect(normalizeMethod('delete')).toBe('DELETE');
  });

  it('非法方法抛错', () => {
    expect(() => normalizeMethod('FOO')).toThrow(/Unsupported HTTP method/);
  });
});

describe('combineURLs', () => {
  it('拼接 baseURL 与相对路径，去除重复斜杠', () => {
    expect(combineURLs('https://a.com/api/', '/users')).toBe(
      'https://a.com/api/users'
    );
  });

  it('绝对地址忽略 baseURL', () => {
    expect(combineURLs('https://a.com', 'https://b.com/x')).toBe(
      'https://b.com/x'
    );
  });

  it('无 baseURL 时原样返回', () => {
    expect(combineURLs(undefined, '/x')).toBe('/x');
  });
});

describe('serializeParams', () => {
  it('null / undefined 跳过', () => {
    expect(serializeParams({ a: null, b: undefined, c: 1 })).toBe('c=1');
  });

  it('数组展开为重复键', () => {
    expect(serializeParams({ tag: ['a', 'b'] })).toBe('tag=a&tag=b');
  });

  it('Date 转 ISO 字符串', () => {
    expect(serializeParams({ d: new Date('2026-01-01T00:00:00Z') })).toBe(
      'd=2026-01-01T00%3A00%3A00.000Z'
    );
  });

  it('对象值 JSON 序列化', () => {
    expect(serializeParams({ filter: { a: 1 } })).toBe(
      'filter=%7B%22a%22%3A1%7D'
    );
  });
});

describe('buildURL', () => {
  it('拼接 baseURL + 相对路径 + 参数', () => {
    expect(buildURL('https://a.com/api', '/items', { page: 2 })).toBe(
      'https://a.com/api/items?page=2'
    );
  });

  it('已有 query 时用 & 连接', () => {
    expect(buildURL(undefined, '/x?a=1', { b: 2 })).toBe('/x?a=1&b=2');
  });

  it('无参数时不追加 ?', () => {
    expect(buildURL(undefined, '/x', undefined)).toBe('/x');
  });
});

describe('mergeHeaders', () => {
  it('后者覆盖前者（忽略大小写）', () => {
    const merged = mergeHeaders(
      { 'Content-Type': 'text/plain', 'X-A': '1' },
      { 'content-type': 'application/json' }
    );
    expect(merged).toEqual({ 'content-type': 'application/json', 'X-A': '1' });
  });

  it('undefined 值跳过', () => {
    expect(mergeHeaders({ A: undefined, B: 'b' })).toEqual({ B: 'b' });
  });

  it('数字 / 布尔值转字符串', () => {
    expect(mergeHeaders({ 'X-Num': 1, 'X-Bool': true })).toEqual({
      'X-Num': '1',
      'X-Bool': 'true',
    });
  });
});

describe('serializeBody', () => {
  it('GET / HEAD 无请求体', () => {
    expect(serializeBody({ a: 1 }, {}, 'GET')).toBeUndefined();
    expect(serializeBody({ a: 1 }, {}, 'HEAD')).toBeUndefined();
  });

  it('普通对象 JSON 序列化并自动设置 Content-Type', () => {
    const headers: Record<string, string> = {};
    const body = serializeBody({ name: 'x' }, headers, 'POST');
    expect(body).toBe('{"name":"x"}');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('已有 Content-Type 时不再覆盖', () => {
    const headers: Record<string, string> = { 'Content-Type': 'text/plain' };
    serializeBody({ name: 'x' }, headers, 'POST');
    expect(headers['Content-Type']).toBe('text/plain');
  });

  it('字符串原样透传', () => {
    expect(serializeBody('hello', {}, 'POST')).toBe('hello');
  });

  it('FormData 原样透传', () => {
    const formData = new FormData();
    expect(serializeBody(formData, {}, 'POST')).toBe(formData);
  });

  it('null / undefined 请求体返回 undefined', () => {
    expect(serializeBody(undefined, {}, 'POST')).toBeUndefined();
    expect(serializeBody(null, {}, 'POST')).toBeUndefined();
  });
});
