import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'bun:test';
import { defineConfig, resolveConfig } from '../src/config';

const roots: string[] = [];
function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'transone-mp-config-'));
  roots.push(root);
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/main.ts'), 'export {};');
  writeFileSync(join(root, 'src/about.ts'), 'export {};');
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('inherits common fields and recursively overrides objects without mutating input', async () => {
  const root = makeRoot();
  const config = defineConfig({ mp: {
    navigationBarTitleText: 'Common', lengthUnit: 'rpx',
    pages: { '/': 'src/main.ts', '/about': 'src/about.ts' },
    window: { backgroundColor: '#fff', navigationBarTitleText: 'Common' },
    tabBar: { color: '#000', list: [{ pagePath: 'common' }] },
    appExtra: { permission: { location: { desc: 'Common', enabled: true } } },
    pageExtra: { '/about': { title: 'Common', enabled: true } },
    globalData: { nested: { shared: true, value: 1 } },
    'mp-weixin': {
      appId: 'wx123', navigationBarTitleText: 'Weixin', lengthUnit: undefined,
      pages: { '/about': 'src/main.ts' },
      window: { navigationBarTitleText: 'Weixin' },
      tabBar: { list: [] },
      appExtra: { permission: { location: { desc: 'Weixin' } } },
      pageExtra: { '/about': { enabled: false } },
      globalData: { nested: { value: 0 } },
    },
  } });
  const snapshot = structuredClone(config);
  const { mp } = await resolveConfig({ root, target: 'mp-weixin', config });
  expect(mp?.appId).toBe('wx123');
  expect(mp?.navigationBarTitleText).toBe('Weixin');
  expect(mp?.lengthUnit).toBe('rpx');
  expect(mp?.pages).toEqual({ '/': join(root, 'src/main.ts'), '/about': join(root, 'src/main.ts') });
  expect(mp?.window).toEqual({ backgroundColor: '#fff', navigationBarTitleText: 'Weixin' });
  expect(mp?.tabBar).toEqual({ color: '#000', list: [] });
  expect(mp?.appExtra).toEqual({ permission: { location: { desc: 'Weixin', enabled: true } } });
  expect(mp?.pageExtra).toEqual({ '/about': { title: 'Common', enabled: false } });
  expect(mp?.globalData).toEqual({ nested: { shared: true, value: 0 } });
  expect(config).toEqual(snapshot);
});

it('uses common configuration for a platform with no override and preserves CLI priority', async () => {
  const root = makeRoot();
  const { mp } = await resolveConfig({ root, target: 'mp-alipay', mpOutDir: 'cli-output', config: {
    mp: { navigationBarTitleText: 'Common', outDir: 'common-output', 'mp-weixin': { appId: 'wx123' } },
  } });
  expect(mp?.navigationBarTitleText).toBe('Common');
  expect(mp?.appId).toBe('touristappid');
  expect(mp?.outDir).toBe(join(root, 'cli-output'));
});

it.each([
  [{ lengthUnit: 'invalid', 'mp-weixin': {} }, "Config mp.lengthUnit must be 'px' or 'rpx'"],
  [{ window: [], 'mp-weixin': {} }, 'Config mp.window must be an object'],
  [{ 'mp-weixin': { appId: 123 } }, 'Config mp.mp-weixin.appId must be a string'],
])('validates common and platform fields in mixed configuration', async (mp, error) => {
  await expect(resolveConfig({ root: makeRoot(), config: { mp } as never })).rejects.toThrow(error);
});

it.each([
  { navigationBarTitleText: 'Legacy' },
  { 'mp-weixin': { navigationBarTitleText: 'Legacy' } },
])('preserves legacy flat and platform-only configurations', async (mp) => {
  const config = await resolveConfig({ root: makeRoot(), target: 'mp-weixin', config: { mp } });
  expect(config.mp?.navigationBarTitleText).toBe('Legacy');
});

it('inherits common output directory unless the platform overrides it', async () => {
  const root = makeRoot();
  const config = { mp: { outDir: 'common', 'mp-weixin': { outDir: 'weixin' } } };
  const weixin = await resolveConfig({ root, target: 'mp-weixin', config });
  const alipay = await resolveConfig({ root, target: 'mp-alipay', config });
  expect(weixin.mp?.outDir).toBe(join(root, 'weixin'));
  expect(alipay.mp?.outDir).toBe(join(root, 'common'));
});

it('resolves common and platform API hosts for mp and app', async () => {
  const root = makeRoot();
  const mp = await resolveConfig({ root, target: 'mp-weixin', config: {
    mp: { host: 'https://common.test', 'mp-weixin': { host: 'https://wx.test' } },
  } });
  expect(mp.mp?.host).toBe('https://wx.test');
  const app = await resolveConfig({ root, target: 'app-ios', config: {
    app: { host: 'https://common.test', 'app-ios': { host: 'https://ios.test' } },
  } });
  expect(app.app?.host).toBe('https://ios.test');
});

it.each(['mp', 'app'] as const)('rejects invalid %s API hosts', async (field) => {
  await expect(resolveConfig({ root: makeRoot(), config: {
    [field]: { host: 'ftp://example.com' },
  } })).rejects.toThrow(`Config ${field}.host must use http or https`);
});
