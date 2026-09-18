import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { build } from '../src/build';
import { parseCliArgs } from '../src/cli';
import { targetRegistry } from '../src/target/registry';
import { PlaceholderTarget } from '../src/target/placeholder-target';
import { WebTarget } from '../src/target/web-target';
import { MpTarget } from '../src/target/mp-target';
import { TARGET_TYPES, isTargetType } from '../src/target/types';

const tempRoots: string[] = [];

function createTempProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'transone-test-'));
  const srcDir = join(root, 'src');
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(join(srcDir, 'main.ts'), 'export const app = {};\n');
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop() as string, { recursive: true, force: true });
  }
});

describe('Target 抽象', () => {
  it('注册表应包含全部目标端类型', () => {
    expect(TARGET_TYPES).toEqual([
      'web',
      'mp-weixin',
      'mp-alipay',
      'mp-bytedance',
      'app-ios',
      'app-android',
      'app-harmony',
    ]);
  });

  it('web 目标应解析为 WebTarget', () => {
    const target = targetRegistry.resolve('web');
    expect(target).toBeInstanceOf(WebTarget);
    expect(target.type).toBe('web');
  });

  it('三个小程序目标均应解析为 MpTarget（差异化 dialect）', () => {
    for (const type of ['mp-weixin', 'mp-alipay', 'mp-bytedance'] as const) {
      const target = targetRegistry.resolve(type);
      expect(target).toBeInstanceOf(MpTarget);
      expect(target.type).toBe(type);
    }
  });

  it('app-* 远期目标应解析为 PlaceholderTarget 并在构建时快速报错', () => {
    const target = targetRegistry.resolve('app-ios');
    expect(target).toBeInstanceOf(PlaceholderTarget);

    expect(
      target.build(
        {
          root: '/tmp',
          entry: '/tmp/src/main.ts',
          pages: { '/': '/tmp/src/main.ts' },
          target: 'app-ios',
          server: { host: '127.0.0.1', port: 1, proxy: {} },
          build: { outDir: '/tmp/dist', basePath: '', directoryPages: false },
        },
        {}
      )
    ).rejects.toThrow(/app-ios.*尚未实现.*远期/);
  });

  it('isTargetType 应校验合法与非法目标端', () => {
    expect(isTargetType('web')).toBe(true);
    expect(isTargetType('mp-bytedance')).toBe(true);
    expect(isTargetType('app-harmony')).toBe(true);
    expect(isTargetType('webx')).toBe(false);
    expect(isTargetType('')).toBe(false);
  });
});

describe('CLI --target 参数', () => {
  it('应解析 build --target mp-weixin', () => {
    const args = parseCliArgs(['build', '--target', 'mp-weixin']);
    expect(args.command).toBe('build');
    if (args.command === 'build') {
      expect(args.target).toBe('mp-weixin');
    }
  });

  it('应解析 build --target=web 的内联形式', () => {
    const args = parseCliArgs(['build', '--target=web']);
    if (args.command === 'build') {
      expect(args.target).toBe('web');
    }
  });

  it('不传 --target 时 build 默认为 web', () => {
    const args = parseCliArgs(['build']);
    if (args.command === 'build') {
      expect(args.target).toBeUndefined();
    }
  });

  it('未知目标端应报错', () => {
    expect(() => parseCliArgs(['build', '--target', 'webx'])).toThrow(
      /Unknown target: webx/
    );
  });

  it('远期 App 目标端构建应失败而非产出残缺工程', async () => {
    const root = createTempProject();
    await expect(
      build({
        root,
        target: 'app-ios',
        config: { entry: 'src/main.ts' },
      })
    ).rejects.toThrow(/app-ios.*尚未实现.*远期/);
  });
});
