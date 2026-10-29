import { afterEach, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveConfig } from '../src/config';
import { parseCliArgs } from '../src/cli';
import { startDevServer } from '../src/server';

const roots: string[] = [];
it.each(['miniprogram', 'app'])(
  'requires a concrete build target instead of the %s component family',
  (family) => {
    expect(() => parseCliArgs(['build', '--target', family])).toThrow(
      /Unknown target/
    );
  }
);

function root(): string {
  const directory = mkdtempSync(join(tmpdir(), 'transone-platform-config-'));
  roots.push(directory);
  mkdirSync(join(directory, 'src'));
  writeFileSync(join(directory, 'src/main.ts'), 'export const app = {};');
  return directory;
}
afterEach(() =>
  roots
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true }))
);

it.each([
  ['web', 'web', 'web', 'dist/build/h5'],
  ['web-mobile', 'web', 'web-mobile', 'dist/build/web-mobile'],
  ['web-pc', 'web', 'web-pc', 'dist/build/web-pc'],
  [
    'miniprogram-weixin',
    'mp-weixin',
    'miniprogram-weixin',
    'dist/build/mp-weixin',
  ],
  [
    'miniprogram-alipay',
    'mp-alipay',
    'miniprogram-alipay',
    'dist/build/mp-alipay',
  ],
  [
    'miniprogram-bytedance',
    'mp-bytedance',
    'miniprogram-bytedance',
    'dist/build/mp-bytedance',
  ],
  [
    'miniprogram-xiaohongshu',
    'mp-xiaohongshu',
    'miniprogram-xiaohongshu',
    'dist/build/mp-xiaohongshu',
  ],
  ['app-ios', 'app-ios', 'app-ios', 'dist/build/app-ios'],
  ['app-android', 'app-android', 'app-android', 'dist/build/app-android'],
  ['app-harmony', 'app-harmony', 'app-harmony', 'dist/build/app-harmony'],
  ['mp-weixin', 'mp-weixin', 'miniprogram-weixin', 'dist/build/mp-weixin'],
  ['app-ios', 'app-ios', 'app-ios', 'dist/build/app-ios'],
] as const)(
  'normalizes %s without duplicating its backend',
  async (input, backend, platform, directory) => {
    const directoryRoot = root();
    const config = await resolveConfig({ root: directoryRoot, target: input });
    expect(config.target).toBe(backend);
    expect(String(config.platform)).toBe(platform);
    expect(config.mp?.outDir ?? config.app?.outDir ?? config.build.outDir).toBe(
      join(directoryRoot, directory)
    );
  }
);

it('uses the configured target and keeps command overrides and explicit output directories', async () => {
  const directory = root();
  writeFileSync(
    join(directory, 'transone.config.ts'),
    `export default { target: 'web-mobile', components: { include: ['src/**/*.ts'], exclude: ['src/ignored/**'] } };`
  );
  const configured = await resolveConfig({ root: directory });
  expect(String(configured.platform)).toBe('web-mobile');
  expect(configured.components).toEqual({
    include: ['src/**/*.ts'],
    exclude: ['src/ignored/**'],
  });
  const overridden = await resolveConfig({
    root: directory,
    target: 'web-pc',
    outDir: 'release/custom',
  });
  expect(String(overridden.platform)).toBe('web-pc');
  expect(overridden.build.outDir).toBe(join(directory, 'release/custom'));
});

it('uses canonical platform selection with legacy platform configuration keys', async () => {
  const directory = root();
  const config = await resolveConfig({
    root: directory,
    target: 'miniprogram-weixin',
    config: { mp: { appId: 'shared', 'mp-weixin': { appId: 'chosen' } } },
  });
  expect(config.mp?.appId).toBe('chosen');
  const app = await resolveConfig({
    root: directory,
    target: 'app-ios',
    config: { app: { 'app-ios': { appName: 'Chosen iOS' } } },
  });
  expect(app.app?.appName).toBe('Chosen iOS');
});

it('applies the explicit output override to canonical Mini Program targets', async () => {
  const directory = root();
  const config = await resolveConfig({
    root: directory,
    target: 'miniprogram-weixin',
    outDir: 'release/weixin',
  });
  expect(config.mp?.outDir).toBe(join(directory, 'release/weixin'));
});

it('parses platform targets for dev and build while rejecting non-Web development targets', () => {
  expect(parseCliArgs(['dev', '--target', 'web-mobile'])).toEqual({
    command: 'dev',
    target: 'web-mobile',
  });
  expect(parseCliArgs(['build', '--target=web-pc'])).toEqual({
    command: 'build',
    target: 'web-pc',
  });
  expect(parseCliArgs(['build', '--target', 'app-ios'])).toEqual({
    command: 'build',
    target: 'app-ios',
  });
  expect(() => parseCliArgs(['dev', '--target', 'miniprogram-weixin'])).toThrow(
    /Web|web/
  );
  expect(() => parseCliArgs(['dev', '--target', 'app-ios'])).toThrow(/Web|web/);
  expect(() => parseCliArgs(['build', '--target', 'web_tablet'])).toThrow(
    /Unknown target/
  );
});

it('rejects invalid configured target and component scan settings before a build', async () => {
  const directory = root();
  await expect(
    resolveConfig({
      root: directory,
      config: { target: 'web_tablet' as never },
    })
  ).rejects.toThrow(/target/);
  await expect(
    resolveConfig({
      root: directory,
      config: { components: { include: [42] as never } },
    })
  ).rejects.toThrow(/include/);
});

it('rejects a configured non-Web development target before loading or listening', async () => {
  const directory = root();
  await expect(
    startDevServer({ root: directory, config: { target: 'app-ios' } })
  ).rejects.toThrow(/Web targets/);
});
