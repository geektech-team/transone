import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { build } from '../src/build';
import { parseCliArgs } from '../src/cli';
import { targetRegistry } from '../src/target/registry';
import { AppTarget } from '../src/target/app-target';
import { WebTarget } from '../src/target/web-target';
import { MpTarget } from '../src/target/mp-target';
import { TARGET_TYPES, isTargetType } from '../src/target/types';

const tempRoots: string[] = [];

function createTempProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'transone-test-'));
  const srcDir = join(root, 'src');
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(
    join(srcDir, 'main.ts'),
    `export class App {
      initState() { return { count: 0 }; }
      increment() { this.state.count += 1; }
      render() { return { tag: 'main', children: [
        { tag: 'button', listeners: { click: () => this.increment() }, children: ['+1'] }
      ] }; }
    }\n`
  );
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

  it('app-* 目标应解析为 AppTarget', () => {
    const target = targetRegistry.resolve('app-ios');
    expect(target).toBeInstanceOf(AppTarget);
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

  it('App 目标端构建应生成原生工程', async () => {
    const root = createTempProject();
    await expect(
      build({
        root,
        target: 'app-ios',
        config: { entry: 'src/main.ts' },
      })
    ).resolves.toMatchObject({
      outDir: expect.stringContaining('app-ios'),
      assetsBuilt: expect.arrayContaining([expect.stringContaining('ContentView.swift')]),
    });
  });
});
