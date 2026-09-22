import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { resolveConfig } from '../src/config';
import { build } from '../src/build';

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'transone-cli-app-'));
  roots.push(root);
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'main.ts'), 'export const app = {};\n');
  return root;
}

afterEach(() => {
  for (const root of roots) {
    rmSync(root, { recursive: true, force: true });
  }
  roots.length = 0;
});

describe('app configuration', () => {
  it('resolves native app defaults for iOS', async () => {
    const root = makeRoot();
    const config = await resolveConfig({ root, target: 'app-ios' });

    expect(config.app).toEqual({
      appName: 'TransOne',
      bundleId: 'com.transone.app',
      outDir: join(root, 'dist', 'build', 'app-ios'),
      minPlatformVersion: '16.0',
      publicDir: join(root, 'public'),
      pages: { '/': join(root, 'src', 'main.ts') },
    });
  });

  it('selects the active platform app override', async () => {
    const root = makeRoot();
    const config = await resolveConfig({
      root,
      target: 'app-android',
      config: {
        app: {
          'app-android': { appName: 'Android Counter' },
        },
      },
    });

    expect(config.app?.appName).toBe('Android Counter');
    expect(config.app?.outDir).toBe(join(root, 'dist', 'build', 'app-android'));
  });

  it('rejects mixed flat and platform app configuration', async () => {
    const root = makeRoot();
    await expect(
      resolveConfig({
        root,
        target: 'app-ios',
        config: { app: { appName: 'Counter', 'app-ios': {} } },
      })
    ).rejects.toThrow(/Config app cannot mix flat fields with platform keys/);
  });
});

describe('native app build', () => {
  it.each([
    ['app-ios', 'TransOneApp/ContentView.swift', '@State private var count: Int = 0'],
    ['app-android', 'app/src/main/AndroidManifest.xml', 'Counter'],
    ['app-harmony', 'entry/src/main/ets/pages/Index.ets', '@Entry'],
  ] as const)('generates a native %s project', async (target, file, marker) => {
    const root = makeRoot();
    writeFileSync(join(root, 'src', 'main.ts'), `
      export class App {
        initState() { return { count: 0 }; }
        increment() { this.state.count += 1; }
        render() { return { tag: 'main', children: [
          { tag: 'text', children: ['count: {{count}}'] },
          { tag: 'button', listeners: { click: () => this.increment() }, children: ['+1'] }
        ] }; }
      }
    `);
    const result = await build({ root, target, config: { app: { appName: 'Counter' } } });
    expect(readFileSync(join(result.outDir, file), 'utf8')).toContain(marker);
  });

  it('uses each platform native text interpolation syntax', async () => {
    const root = makeRoot();
    writeFileSync(join(root, 'src', 'main.ts'), `
      export class App { initState() { return { count: 0 }; }
        render() { return { tag: 'main', children: [
          { tag: 'text', children: ['count: {{count}}'] }
        ] }; }
      }
    `);
    const ios = await build({ root, target: 'app-ios' });
    const android = await build({ root, target: 'app-android' });
    const harmony = await build({ root, target: 'app-harmony' });
    expect(readFileSync(join(ios.outDir, 'TransOneApp/ContentView.swift'), 'utf8')).toContain('Text("count: \\(count)")');
    expect(readFileSync(join(android.outDir, 'app/src/main/java/com/transone/app/MainActivity.kt'), 'utf8')).toContain('Text("count: $count")');
    expect(readFileSync(join(harmony.outDir, 'entry/src/main/ets/pages/Index.ets'), 'utf8')).toContain('Text("count: " + this.count)');
  });

  it('emits an Xcode project with an application target and Swift source build phase', async () => {
    const root = makeRoot();
    writeFileSync(join(root, 'src', 'main.ts'), `
      export class App { render() { return { tag: 'main', children: [] }; } }
    `);
    const result = await build({ root, target: 'app-ios' });
    const project = readFileSync(
      join(result.outDir, 'TransOneApp.xcodeproj/project.pbxproj'),
      'utf8'
    );
    expect(project).toContain('isa = PBXProject;');
    expect(project).toContain('isa = PBXNativeTarget;');
    expect(project).toContain('isa = PBXSourcesBuildPhase;');
    expect(project).toContain('ContentView.swift in Sources');
    expect(project).toContain('PRODUCT_BUNDLE_IDENTIFIER = com.transone.app;');
  });

  it('rejects unsupported source before replacing existing output', async () => {
    const root = makeRoot();
    writeFileSync(join(root, 'src', 'main.ts'), `
      export class App {
        render() { return { tag: 'main', children: [
          { tag: 'text', children: ['ok'] }
        ] }; }
      }
    `);
    const first = await build({ root, target: 'app-ios' });
    const output = join(first.outDir, 'TransOneApp', 'ContentView.swift');
    const before = readFileSync(output, 'utf8');
    writeFileSync(join(root, 'src', 'main.ts'), `
      export class App { render() { return { tag: 'input' }; } }
    `);

    await expect(build({ root, target: 'app-ios' })).rejects.toThrow(
      /不支持的原生节点: input/
    );
    expect(readFileSync(output, 'utf8')).toBe(before);
  });
});
