import { afterEach, describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { build } from '../src/build';
import { startDevServer } from '../src/server';
import {
  createDomWindow,
  DOM_GLOBAL_KEYS,
  installDomGlobals,
} from '../../transone/lib/dom/index';

const roots: string[] = [];
const servers: Awaited<ReturnType<typeof startDevServer>>[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'transone-web-css-'));
  roots.push(root);
  mkdirSync(join(root, 'src'));
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        paths: {
          transone: [resolve(import.meta.dir, '../../transone/lib/index.ts')],
        },
      },
    })
  );
  writeFileSync(join(root, 'src', 'legacy.css'), '.legacy { color: green; }');
  writePage(root, 'red');
  return root;
}

function writePage(root: string, color: string): void {
  writeFileSync(
    join(root, 'src', 'main.ts'),
    `
    import './legacy.css';
    export const app = {
      renderHtmlDocument({ scripts = [] } = {}) {
        return '<html><head><style>body { color: ${color}; }</style>' +
          '<link rel="stylesheet" href="/custom.css">' +
          '<style media="print">body { color: black; }</style>' +
          '<style type="text/less">@color: red;</style></head><body>' +
          scripts.map(({ src }) => '<script type="module" src="' + src + '"></script>').join('') +
          '</body></html>';
      }
    };
  `
  );
}

function links(html: string): string[] {
  return [...html.matchAll(/<link\b[^>]*href="([^"]+)"[^>]*>/g)]
    .map((match) => match[1]!)
    .filter((href) => href !== '/custom.css');
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)));
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe('Web static stylesheets', () => {
  it('keeps document style nodes used by scripts and relative resources intact', async () => {
    const root = makeRoot();
    writeFileSync(
      join(root, 'src/main.ts'),
      `
      export const app = {
        renderHtmlDocument() {
          return '<html><head><style id="theme">body { color: red; }</style>' +
            '<style>.icon { background: url(./images/icon.png); }</style>' +
            '<style>.mask { clip-path: url(#clip); }</style>' +
            '<style>@import "./theme.css";</style></head><body></body></html>';
        }
      };
    `
    );
    const result = await build({ root });
    const html = readFileSync(join(result.outDir, 'index.html'), 'utf8');
    expect(html).toContain('<style id="theme">body { color: red; }</style>');
    expect(html).toContain(
      '<style>.icon { background: url(./images/icon.png); }</style>'
    );
    expect(html).toContain('<style>.mask { clip-path: url(#clip); }</style>');
    expect(html).toContain('<style>@import "./theme.css";</style>');
    expect(
      result.assetsBuilt.filter((path) => path.endsWith('.css'))
    ).toHaveLength(0);
  });

  it('externalizes document styles, preserves cascade positions and links imported CSS even for a custom renderer', async () => {
    const root = makeRoot();
    const result = await build({
      root,
      config: {
        pages: { '/guide/start': 'src/main.ts' },
        build: { directoryPages: true },
      },
    });
    const htmlFile = join(result.outDir, 'guide/start/index.html');
    const html = readFileSync(htmlFile, 'utf8');
    expect(html).not.toContain('<style>');
    expect(html).toContain('<style type="text/less">');
    const styles = links(html);
    expect(styles).toHaveLength(3);
    const files = styles.map((href) => resolve(dirname(htmlFile), href));
    files.forEach((file) => {
      expect(existsSync(file)).toBe(true);
      expect(result.assetsBuilt).toContain(file);
    });
    expect(
      files.map((file) => readFileSync(file, 'utf8')).join('\n')
    ).toContain('color: red');
    expect(html.indexOf(styles[1]!)).toBeLessThan(html.indexOf('/custom.css'));
    expect(html.indexOf(styles[2]!)).toBeGreaterThan(
      html.indexOf('/custom.css')
    );
    expect(html).toContain('media="print"');
    const repeated = await build({
      root,
      config: { build: { directoryPages: true } },
    });
    const newStyles = links(
      readFileSync(join(repeated.outDir, 'index.html'), 'utf8')
    );
    expect(newStyles.map((url) => url.split('/').pop())).toEqual(
      styles.map((url) => url.split('/').pop())
    );
  });

  it('serves document CSS as generation artifacts and cleans them up with the dev server', async () => {
    const root = makeRoot();
    const server = await startDevServer({
      root,
      port: 0,
      host: '127.0.0.1',
      watch: false,
    });
    servers.push(server);
    const base = `http://${server.hostname}:${server.port}`;
    const html = await (await fetch(base + '/')).text();
    expect(html).not.toContain('<style>');
    const styles = links(html);
    expect(styles).toHaveLength(3);
    for (const href of styles) {
      const response = await fetch(base + href);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/css');
    }
    expect(await (await fetch(base + styles[1])).text()).toBe(
      'body { color: red; }'
    );
    const file = join(root, 'dist/dev/h5', styles[1]!.replace(/^\/dev\//, ''));
    expect(existsSync(file)).toBe(true);
    writePage(root, 'blue');
    const nextHtml = await (await fetch(base + '/')).text();
    const nextStyles = links(nextHtml);
    expect(nextStyles[1]).not.toBe(styles[1]);
    expect(await (await fetch(base + nextStyles[1])).text()).toBe(
      'body { color: blue; }'
    );
    const fallback = await (await fetch(base + '/unknown/route')).text();
    expect(fallback).not.toContain('<style>');
    expect((await fetch(base + links(fallback)[1])).status).toBe(200);
    await server.stop(true);
    servers.splice(servers.indexOf(server), 1);
    expect(existsSync(file)).toBe(false);
  });

  it('loads static component CSS while retaining dynamic props styles', async () => {
    const root = makeRoot();
    writeFileSync(
      join(root, 'src/main.ts'),
      `
      import { Component, createApp, h } from 'transone';
      class Fixed extends Component {
        initState() { return {}; }
        initStyles() { this.styleManager.addStyle('fixed', { selector: '.fixed', properties: { color: 'purple' } }); }
        render() { return h('div', { className: 'fixed' }, ['fixed']); }
      }
      class Dynamic extends Component {
        initState() { return {}; }
        initStyles() { this.styleManager.addStyle('dynamic', { selector: '.dynamic', properties: { color: this.props.color } }); }
        render() { return h('div', { className: 'dynamic' }, ['dynamic']); }
      }
      class Root extends Component {
        initState() { return {}; }
        initStyles() {}
        render() { return h('main', {}, [{ component: Fixed }, { component: Dynamic, props: { color: 'orange' } }]); }
      }
      export const app = createApp({ root: Root, document: { styles: [{ selector: 'body', properties: { margin: 0 } }, { selector: '.fixed', properties: { color: 'blue' } }] } });
      app.mount();
    `
    );
    const result = await build({ root });
    const html = readFileSync(join(result.outDir, 'index.html'), 'utf8');
    const css = links(html)
      .map((href) => readFileSync(resolve(result.outDir, href), 'utf8'))
      .join('\n');
    expect(css).toContain('.fixed');
    expect(css).toContain('purple');
    expect(css).toContain('margin: 0');
    const orderedCss = links(html).map((href) =>
      readFileSync(resolve(result.outDir, href), 'utf8')
    );
    expect(orderedCss.findIndex((css) => css.includes('blue'))).toBeLessThan(
      orderedCss.findIndex((css) => css.includes('purple'))
    );
    const jsFile = result.assetsBuilt.find((path) => path.endsWith('.js'))!;
    const keys = [...DOM_GLOBAL_KEYS, '__APP__'];
    const descriptors = keys.map(
      (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
    );
    const window = createDomWindow();
    window.document.body.innerHTML = '<div id="app"></div>';
    try {
      installDomGlobals(window);
      await import(jsFile);
      const runtimeCss = [...window.document.head.querySelectorAll('style')]
        .map((node) => node.textContent)
        .join('\n');
      expect(runtimeCss).toContain('orange');
      expect(runtimeCss).not.toContain('purple');
    } finally {
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete (globalThis as Record<string, unknown>)[key];
      }
    }
  });

  it('retains runtime cascade for components that share a selector', async () => {
    const root = makeRoot();
    writeFileSync(
      join(root, 'src/main.ts'),
      `
      import { Component, createApp, h } from 'transone';
      class Fixed extends Component {
        initState() { return {}; }
        initStyles() { this.styleManager.addStyle('fixed', { selector: '.shared', properties: { color: 'red' } }); }
        render() { return h('div', { className: 'shared' }); }
      }
      class Dynamic extends Component {
        initState() { return {}; }
        initStyles() { this.styleManager.addStyle('dynamic', { selector: '.shared', properties: { color: this.props.color } }); }
        render() { return h('div', { className: 'shared' }); }
      }
      class Root extends Component {
        initState() { return {}; }
        initStyles() {}
        render() { return h('main', {}, [{ component: Dynamic, props: { color: 'purple' } }, { component: Fixed }]); }
      }
      export const app = createApp({ root: Root });
      app.mount();
    `
    );
    const result = await build({ root });
    expect(
      result.assetsBuilt.filter((file) => file.includes('components-'))
    ).toHaveLength(0);
    const keys = [...DOM_GLOBAL_KEYS, '__APP__'];
    const descriptors = keys.map(
      (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
    );
    const window = createDomWindow();
    window.document.body.innerHTML = '<div id="app"></div>';
    try {
      installDomGlobals(window);
      await import(result.assetsBuilt.find((path) => path.endsWith('.js'))!);
      const runtimeCss = [
        ...window.document.head.querySelectorAll('style'),
      ].map((node) => node.textContent);
      expect(runtimeCss).toHaveLength(2);
      expect(runtimeCss[0]).toContain('purple');
      expect(runtimeCss[1]).toContain('red');
    } finally {
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete (globalThis as Record<string, unknown>)[key];
      }
    }
  });

  it('retains inherited styles when a subclass in another module clears its manager', async () => {
    const root = makeRoot();
    writeFileSync(
      join(root, 'src/base.ts'),
      `
      import { Component, h } from 'transone';
      export class Base extends Component {
        initState() { return {}; }
        initStyles() { this.styleManager.addStyle('inherited', { selector: '.inherited', properties: { color: 'red' } }); }
        render() { return h('div'); }
      }
    `
    );
    writeFileSync(
      join(root, 'src/main.ts'),
      `
      import { Base } from './base';
      class Child extends Base {
        inspect() { return this.styleManager.styles.size; }
        clear() { this.styleManager.clearStyles(); }
      }
      export function exercise() {
        const component = new Child();
        const before = component.inspect();
        component.clear();
        return [before, component.inspect()];
      }
      export const app = {
        renderHtmlDocument({ scripts = [] } = {}) {
          return '<html><head></head><body>' + scripts.map(({ src }) =>
            '<script type="module" src="' + src + '"></script>'
          ).join('') + '</body></html>';
        }
      };
    `
    );
    const result = await build({ root });
    expect(
      result.assetsBuilt.filter((path) => /components-.*\.css$/.test(path))
    ).toHaveLength(0);
    const descriptors = DOM_GLOBAL_KEYS.map(
      (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
    );
    try {
      installDomGlobals(createDomWindow());
      const bundle = await import(
        result.assetsBuilt.find((path) => path.endsWith('.js'))!
      );
      expect(bundle.exercise()).toEqual([1, 0]);
    } finally {
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete (globalThis as Record<string, unknown>)[key];
      }
    }
  });
});
