import { afterEach, expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { createProject } from '../src/create';
import { build } from '../src/build';
import {
  createDomWindow,
  DOM_GLOBAL_KEYS,
  installDomGlobals,
} from '../../transone/lib/dom';

const roots: string[] = [];
function root(): string {
  const path = mkdtempSync(join(tmpdir(), 'transone-platform-create-'));
  roots.push(path);
  return path;
}
afterEach(() =>
  roots
    .splice(0)
    .forEach((path) => rmSync(path, { recursive: true, force: true }))
);

it('creates a component-family example with commands for each supported platform', () => {
  const directory = root();
  const result = createProject({ root: directory, name: 'family-example' });
  for (const file of [
    'src/AppComponent.ts',
    'src/components/card/CardComponent.ts',
    'src/components/card/CardWebComponent.ts',
    'src/components/card/CardMiniprogramComponent.ts',
    'src/components/card/CardAppComponent.ts',
    'src/components/card/CardMobileComponent.ts',
    'src/components/card/CardPcComponent.ts',
    'src/components/card/CardWeixinComponent.ts',
    'src/components/card/CardAlipayComponent.ts',
    'src/components/card/CardIosComponent.ts',
    'src/components/card/CardAndroidComponent.ts',
  ]) {
    expect(result.files).toContain(file);
    expect(existsSync(join(directory, file))).toBe(true);
  }
  const manifest = JSON.parse(
    readFileSync(join(directory, 'package.json'), 'utf8')
  );
  expect(manifest.dependencies.transone).toBe('^0.5.0');
  expect(manifest.devDependencies['transone-cli']).toBe('^0.8.0');
  expect(manifest.scripts['dev:mobile']).toBe(
    'transone dev --target web-mobile'
  );
  expect(manifest.scripts['build:pc']).toBe('transone build --target web-pc');
  expect(manifest.scripts['build:weixin']).toBe(
    'transone build --target miniprogram-weixin'
  );
  expect(manifest.scripts['build:ios']).toBe('transone build --target app-ios');
});

it('refuses the whole scaffold when a nested example file already exists', () => {
  const directory = root();
  const cardDirectory = join(directory, 'src/components/card');
  mkdirSync(cardDirectory, { recursive: true });
  const existing = join(cardDirectory, 'CardComponent.ts');
  writeFileSync(existing, 'user card');
  expect(() => createProject({ root: directory })).toThrow(
    /Refusing to overwrite/
  );
  expect(readFileSync(existing, 'utf8')).toBe('user card');
  expect(existsSync(join(directory, 'package.json'))).toBe(false);
  expect(existsSync(join(directory, 'src/main.ts'))).toBe(false);
});

function localPackages(directory: string): void {
  mkdirSync(join(directory, 'node_modules'));
  for (const name of ['transone', 'transone-cli']) {
    symlinkSync(
      resolve(import.meta.dir, '../..', name),
      join(directory, 'node_modules', name),
      'dir'
    );
  }
}

it('keeps platform JavaScript hashes stable until the selected implementation changes', async () => {
  const directory = root();
  createProject({ root: directory });
  localPackages(directory);
  const first = await build({ root: directory, target: 'web-mobile' });
  const entry = first.assetsBuilt.find((path) => path.endsWith('.js'))!;
  const repeated = await build({ root: directory, target: 'web-mobile' });
  const repeatedEntry = repeated.assetsBuilt.find((path) => path.endsWith('.js'))!;
  expect(basename(repeatedEntry)).toBe(basename(entry));
  const view = join(directory, 'src/components/card/CardMobileComponent.ts');
  writeFileSync(view, readFileSync(view, 'utf8').replace('Mobile Web Card', 'Mobile Web Card updated'));
  const changed = await build({ root: directory, target: 'web-mobile' });
  const changedEntry = changed.assetsBuilt.find((path) => path.endsWith('.js'))!;
  expect(basename(changedEntry)).not.toBe(basename(entry));
  expect(existsSync(entry)).toBe(false);
}, 20_000);

it.each([
  ['web', 'Web Card'],
  ['web-mobile', 'Mobile Web Card'],
  ['web-pc', 'PC Web Card'],
  ['miniprogram-weixin', 'Weixin Card'],
  ['miniprogram-alipay', 'Alipay Card'],
  ['miniprogram-bytedance', 'Miniprogram Card'],
  ['miniprogram-xiaohongshu', 'Miniprogram Card'],
  ['app-ios', 'iOS Card'],
  ['app-android', 'Android Card'],
  ['app-harmony', 'App Card'],
] as const)(
  'builds the generated %s application with its chosen Card view',
  async (target, marker) => {
    const directory = root();
    createProject({ root: directory });
    localPackages(directory);
    const result = await build({ root: directory, target });
    const files = result.assetsBuilt.filter((path) =>
      /\.(?:js|html|wxml|axml|ttml|xhsml|swift|kt|ets)$/.test(path)
    );
    const output = files.map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(output).toContain(marker);
    for (const other of [
      'Mobile Web Card',
      'PC Web Card',
      'Weixin Card',
      'Alipay Card',
      'iOS Card',
      'Android Card',
      'Miniprogram Card',
      'App Card',
    ]) {
      if (other !== marker) expect(output).not.toContain(other);
    }
    if (!target.startsWith('web')) return;
    const descriptors = [...DOM_GLOBAL_KEYS, '__APP__'].map(
      (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
    );
    try {
      const window = createDomWindow();
      window.document.body.innerHTML = '<div id="app"></div>';
      installDomGlobals(window);
      await import(result.assetsBuilt.find((path) => path.endsWith('.js'))!);
      expect(window.document.body.textContent).toContain(marker);
      expect(window.document.body.textContent).toContain('Count: 0');
      window.document
        .querySelector('button')!
        .dispatchEvent(new window.Event('click'));
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(window.document.body.textContent).toContain('Count: 1');
    } finally {
      (globalThis as { __APP__?: { unmount(): void } }).__APP__?.unmount();
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete (globalThis as Record<string, unknown>)[key];
      }
    }
  },
  20_000
);
