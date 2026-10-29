import { afterEach, describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { build } from '../src/build';
import { resolveConfig } from '../src/config';
import { renderProjectHtml } from '../src/project';
import { startDevServer } from '../src/server';
import {
  createDomWindow,
  installDomGlobals,
  DOM_GLOBAL_KEYS,
} from '../../transone/lib/dom';

const roots: string[] = [];
const servers: Awaited<ReturnType<typeof startDevServer>>[] = [];
async function browser(entry: string, renderDocument = false) {
  const keys = [...DOM_GLOBAL_KEYS, '__APP__'] as const;
  const previous = new Map(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  );
  const window = createDomWindow({ url: 'http://127.0.0.1/' });
  window.document.body.innerHTML = '<div id="app"></div>';
  try {
    installDomGlobals(window);
    const module = await import(entry);
    return renderDocument
      ? module.app.renderHtmlDocument({})
      : window.document.body.innerHTML;
  } finally {
    for (const key of keys) {
      const descriptor = previous.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  }
}
async function eventually<T>(
  read: () => Promise<T>,
  matches: (value: T) => boolean
): Promise<T> {
  const deadline = Date.now() + 20000;
  let last: T | undefined;
  do {
    const value = await read();
    last = value;
    if (matches(value)) return value;
    await Bun.sleep(100);
  } while (Date.now() < deadline);
  throw new Error(
    'Timed out waiting for platform rebuild: ' + String(last).slice(0, 400)
  );
}
const framework = resolve(import.meta.dir, '../../transone/lib/index.ts');
function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'transone-platform-web-'));
  roots.push(root);
  files['tsconfig.json'] = JSON.stringify({
    compilerOptions: {
      baseUrl: root,
      paths: {
        transone: [framework],
        'transone/platform': [resolve(dirname(framework), 'platform/index.ts')],
      },
    },
  });
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  return root;
}
const card = `import { Component, Div } from 'transone'; export class Card extends Component { initState(){return {}} initStyles(){} render(){return Div({children:['base-marker']})} }`;
const main = `import { createApp, createComponent } from 'transone'; import { Card } from './card'; const choose = () => Card; const options = {document:{body:createComponent(choose())}}; export const app = createApp(options);`;
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)));
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('Web platform execution', () => {
  it('prunes unselected generic mini program and App layers before executing Web modules', async () => {
    const root = project({
      'src/main.ts': `import {Component,Web,Miniprogram,App,Div,createApp,createComponent} from 'transone';
        import {poison} from './poison';
        export class Card extends Component {initState(){return {}} initStyles(){} render(){return Div({children:['base']})}}
        @Web() export class GenericWeb extends Card {
          initStyles(){this.styleManager.addStyle('family',{selector:'.generic-web',properties:{color:'#123456'}})}
          render(){return Div({className:'generic-web',children:['generic-web-marker']})}
        }
        @Miniprogram() export class GenericMini extends Card {static bad=poison;render(){return Div({children:['mini-marker']})}}
        @App() export class GenericApp extends Card {static bad=poison;render(){return Div({children:['app-marker']})}}
        export const app=createApp({document:{body:createComponent(Card)}});`,
      'src/poison.ts': `throw new Error('UNSELECTED-FAMILY-EXECUTED'); export const poison=1;`,
    });
    const result = await build({ root, target: 'web-pc' });
    expect(readFileSync(join(result.outDir, 'index.html'), 'utf8')).toContain(
      'generic-web-marker'
    );
    const js = result.assetsBuilt
      .filter((file) => file.endsWith('.js'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(js).not.toContain('UNSELECTED-FAMILY-EXECUTED');
    expect(js).not.toContain('mini-marker');
    expect(js).not.toContain('app-marker');
    const css = result.assetsBuilt
      .filter((file) => file.endsWith('.css'))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(css).toContain('#123456');
  }, 20_000);

  it('discovers unimported implementations and shares selection with isolated document execution', async () => {
    const root = project({
      'src/card.ts': card,
      'src/main.ts': main,
      'src/mobile.ts': `import {WebMobile,Div} from 'transone'; import {Card} from './card'; @WebMobile() export class Mobile extends Card { render(){return Div({children:['mobile-marker']})} }`,
      'src/pc.ts': `import {WebPc,Div} from 'transone'; import {Card} from './card'; @WebPc() export class Pc extends Card { static forbidden = (()=>{throw new Error('PC-EXECUTED')})(); render(){return Div({children:['pc-marker']})} }`,
    });
    const result = await build({ root, target: 'web-mobile' });
    expect(readFileSync(join(result.outDir, 'index.html'), 'utf8')).toContain(
      'mobile-marker'
    );
    const js = result.assetsBuilt
      .filter((path) => path.endsWith('.js'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    expect(js).toContain('mobile-marker');
    expect(js).not.toContain('PC-EXECUTED');
    expect(js).not.toContain('pc-marker');
  }, 20000);
  it('prunes same-file unselected classes and exclusive imports before module execution', async () => {
    const root = project({
      'src/main.ts': `import {Component,WebMobile,WebPc,Div,createApp,createComponent} from 'transone'; import {poison} from './poison';
      class Card extends Component {initState(){return {}} initStyles(){} render(){return Div({children:['base-marker']})}}
      @WebMobile() export class Mobile extends Card {render(){return Div({children:['mobile-marker']})}}
      @WebPc() export class Pc extends Card {static bad=poison; render(){return Div({children:['pc-marker']})}}
      export const app = createApp({document:{body:createComponent(Card)}});`,
      'src/poison.ts': `throw new Error('FORBIDDEN-DEPENDENCY'); export const poison = 1;`,
    });
    const result = await build({ root, target: 'web-mobile' });
    expect(readFileSync(join(result.outDir, 'index.html'), 'utf8')).toContain(
      'mobile-marker'
    );
    expect(
      result.assetsBuilt
        .filter((path) => path.endsWith('.js'))
        .map((path) => readFileSync(path, 'utf8'))
        .join('')
    ).not.toContain('FORBIDDEN-DEPENDENCY');
    expect(
      readdirSync(root).filter((name) => name.startsWith('.transone-ssr'))
    ).toEqual([]);
  }, 20000);
  it('renders concurrent targets without shared module bindings', async () => {
    const root = project({
      'src/card.ts': card,
      'src/main.ts': main,
      'src/mobile.ts': `import {WebMobile,Div} from 'transone'; import {Card} from './card'; @WebMobile() export class Mobile extends Card {render(){return Div({children:['mobile-marker']})}}`,
      'src/pc.ts': `import {WebPc,Div} from 'transone'; import {Card} from './card'; @WebPc() export class Pc extends Card {render(){return Div({children:['pc-marker']})}}`,
    });
    const configs = await Promise.all(
      ['web-mobile', 'web-pc'].map((target) =>
        resolveConfig({ root, target: target as 'web-mobile' | 'web-pc' })
      )
    );
    const html = await Promise.all(
      configs.map((config) => renderProjectHtml(config, {}))
    );
    expect(html[0]).toContain('mobile-marker');
    expect(html[0]).not.toContain('pc-marker');
    expect(html[1]).toContain('pc-marker');
    expect(html[1]).not.toContain('mobile-marker');
  }, 20000);
  it('preserves explicitly consumed other-platform implementations and ordinary constructors', async () => {
    const root = project({
      'src/card.ts': card,
      'src/mobile.ts': `import {WebMobile,Div} from 'transone'; import {Card} from './card'; @WebMobile() export class Mobile extends Card {render(){return Div({children:['mobile-marker']})}}`,
      'src/pc.ts': `import {WebPc,Div} from 'transone'; import {Card} from './card'; @WebPc() export class Pc extends Card {render(){return Div({children:['explicit-pc-marker']})}}`,
      'src/main.ts': `import {Component,Div,createApp,createComponent} from 'transone'; import {Card} from './card';import {Pc} from './pc';
        class Ordinary extends Component {initState(){return {}}initStyles(){}render(){return Div({children:['ordinary-marker']})}}
        const refs=[Card,Pc,Ordinary]; export const app=createApp({document:{body:refs.map(ref=>createComponent({component:ref}))}});`,
    });
    const result = await build({ root, target: 'web-mobile' });
    const html = readFileSync(join(result.outDir, 'index.html'), 'utf8');
    for (const marker of [
      'mobile-marker',
      'explicit-pc-marker',
      'ordinary-marker',
    ])
      expect(html).toContain(marker);
  }, 20000);
  it('binds entry-owned bases before app startup when an unimported implementation imports the entry', async () => {
    const root = project({
      'src/main.ts': `import {Component,Div,createApp,createComponent} from 'transone';
      export class Card extends Component {initState(){return {}}initStyles(){}render(){return Div({children:['base-marker']})}}
      const choose=()=>Card; export const app=createApp({document:{body:createComponent(choose())}});`,
      'src/mobile.ts': `import {WebMobile,Div} from 'transone'; import {Card} from './main'; @WebMobile() export class Mobile extends Card {render(){return Div({children:['entry-mobile-marker']})}}`,
    });
    const result = await build({ root, target: 'web-mobile' });
    expect(readFileSync(join(result.outDir, 'index.html'), 'utf8')).toContain(
      'entry-mobile-marker'
    );
  }, 20000);
  it('executes browser root, nested and route references after binding, including function and options values', async () => {
    const root = project({
      'src/card.ts': card,
      'src/root.ts': `import {Component,Div,createComponent} from 'transone';import {Card} from './card';
        export class Root extends Component {initState(){return {}}initStyles(){}render(){return Div({children:['base-root',createComponent(Card)]})}}`,
      'src/mobile.ts': `import {WebMobile,Div,createComponent,RouterView} from 'transone';import {Card} from './card';import {Root} from './root';
        @WebMobile() export class Mobile extends Card {render(){return Div({children:['mobile-child']})}}
        @WebMobile() export class MobileRoot extends Root {render(){return Div({children:['mobile-root',createComponent({component:Card}),createComponent(RouterView)]})}}`,
      'src/main.ts': `import {createApp,createRouter} from 'transone';import {Root} from './root';import {Card} from './card';
        const choose=()=>Root;const options={root:[choose()][0]};export const app=createApp(options);
        const router=createRouter({routes:[{path:'/',component:Card}]});app.use(router);app.mount();`,
    });
    const result = await build({ root, target: 'web-mobile' });
    const js = result.assetsBuilt.find((path) => path.endsWith('.js'))!;
    const html = await browser(js);
    expect(html).toContain('mobile-root');
    expect(html).toContain('mobile-child');
    expect(html).toContain('data-router-view');
    expect(html.match(/mobile-child/g)).toHaveLength(2);
    expect(html).not.toContain('base-root');
    expect(html).not.toContain('base-marker');
  }, 20000);
  it('keeps previous output when an entry-owned dependency has unsafe initialization ordering', async () => {
    const root = project({ 'src/main.ts': main, 'src/card.ts': card });
    const config = await resolveConfig({ root, target: 'web-mobile' });
    mkdirSync(config.build.outDir, { recursive: true });
    writeFileSync(join(config.build.outDir, 'keep.txt'), 'keep');
    writeFileSync(
      join(root, 'src/main.ts'),
      `import {Component,WebMobile,Div,createApp,createComponent} from 'transone'; console.log('APP-STARTED');
      class Card extends Component {initState(){return {}}initStyles(){}render(){return Div({children:['base']})}}
      @WebMobile() export class Mobile extends Card {} export const app=createApp({document:{body:createComponent(Card)}});`
    );
    await expect(build({ root, target: 'web-mobile' })).rejects.toThrow(
      'after application side effects'
    );
    expect(readFileSync(join(config.build.outDir, 'keep.txt'), 'utf8')).toBe(
      'keep'
    );
  }, 20000);
  it('reports actually consumed unmatched abstract references while allowing unused helpers', async () => {
    const root = project({
      'src/main.ts': `import {Component,Div,createApp,createComponent} from 'transone';abstract class Missing extends Component {initState(){return {}}initStyles(){}} export const app=createApp({document:{body:createComponent(Missing)}});`,
    });
    await expect(build({ root, target: 'web-mobile' })).rejects.toThrow(
      'Abstract'
    );
  }, 20000);
  it('reindexes added/deleted implementations and recovers from duplicates in a live dev session', async () => {
    const root = project({ 'src/main.ts': main, 'src/card.ts': card });
    const server = await startDevServer({
      root,
      target: 'web-mobile',
      watch: true,
      config: { server: { host: '127.0.0.1', port: 0 } },
    });
    servers.push(server);
    const url = `http://127.0.0.1:${server.port}/`;
    const first = await (await fetch(url)).text();
    expect(first).toContain('base-marker');

    const variant = `import {WebMobile,Div} from 'transone';import {Card} from './card';@WebMobile() export class Mobile extends Card {render(){return Div({children:['watch-mobile-marker']})}}`;
    writeFileSync(join(root, 'src/mobile.ts'), variant);
    const selectedHtml = await eventually(
      async () => await (await fetch(url)).text(),
      (html) => html.includes('watch-mobile-marker')
    );
    const previousAsset = selectedHtml.match(/src="([^"]+\.js)"/)![1]!;
    writeFileSync(
      join(root, 'src/duplicate.ts'),
      variant.replace(/class Mobile/g, 'class Duplicate')
    );
    await eventually(
      async () => await fetch(url),
      (response) => response.status === 500
    );
    expect((await fetch(new URL(previousAsset, url))).status).toBe(200);
    rmSync(join(root, 'src/duplicate.ts'));
    await eventually(
      async () => await (await fetch(url)).text(),
      (html) => html.includes('watch-mobile-marker')
    );
    rmSync(join(root, 'src/mobile.ts'));
    await eventually(
      async () => await (await fetch(url)).text(),
      (html) => html.includes('base-marker')
    );
    await server.stop(true);
    servers.splice(servers.indexOf(server), 1);
    expect(readdirSync(join(root, 'dist/dev/h5'))).toHaveLength(0);
  }, 45000);
  it('extracts selected same-file BaseComponent styles through the composed platform and CSS stages', async () => {
    const root = project({
      'src/main.ts': `import {BaseComponent,WebMobile,WebPc,Div,createApp,createComponent} from 'transone';
      class Card extends BaseComponent {initState(){return {}}initStyles(){}render(){return Div({props:{className:'selected-card'},children:['base-marker']})}}
      @WebMobile() export class Mobile extends Card {initStyles(){this.styleManager.addStyle('card',{selector:'.selected-card',properties:{color:'purple'}})}}
      @WebPc() export class Pc extends Card {initStyles(){this.styleManager.addStyle('card',{selector:'.forbidden-pc-style',properties:{color:'orange'}})}}
      export const app=createApp({document:{body:createComponent(Card)}});`,
    });
    const result = await build({ root, target: 'web-mobile' });
    const css = result.assetsBuilt
      .filter((path) => path.endsWith('.css'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    expect(css).toContain('.selected-card');
    expect(css).toContain('purple');
    expect(css).not.toContain('.forbidden-pc-style');
    const js = result.assetsBuilt
      .filter((path) => path.endsWith('.js'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    expect(js).not.toContain('purple');
    expect(js).not.toContain('.forbidden-pc-style');
  }, 20000);
  for (const [declaration, consumer] of [
    ['export default class Card', "import Card from './main';"],
    ['export class Card', "import * as Entry from './main';"],
    ['class Card', "import {PublicCard as Card} from './barrel';"],
  ]) {
    it(`resolves entry-owned export identity through ${consumer}`, async () => {
      const alias =
        declaration === 'class Card' ? 'export {Card as PublicCard};' : '';
      const root = project({
        'src/main.ts': `import {Component,Div,createApp,createComponent} from 'transone';${declaration} extends Component {initState(){return {}}initStyles(){}render(){return Div({children:['base-marker']})}} ${alias} export const app=createApp({document:{body:createComponent(Card)}});`,
        'src/barrel.ts': `export {PublicCard} from './main';`,
        'src/mobile.ts': `import {WebMobile,Div} from 'transone';${consumer}@WebMobile() export class Mobile extends ${consumer.includes('Entry') ? 'Entry.Card' : 'Card'} {render(){return Div({children:['identity-mobile-marker']})}}`,
      });
      const result = await build({ root, target: 'web-mobile' });
      expect(readFileSync(join(result.outDir, 'index.html'), 'utf8')).toContain(
        'identity-mobile-marker'
      );
    }, 20000);
  }
  it('cleans temporary document bundles after a selected initializer fails and restores DOM globals', async () => {
    const root = project({
      'src/card.ts': card,
      'src/main.ts': main,
      'src/mobile.ts': `import {WebMobile} from 'transone';import {Card} from './card';@WebMobile() export class Mobile extends Card {static fail=(()=>{throw new Error('SELECTED-INIT-FAILED')})()}`,
    });
    const config = await resolveConfig({ root, target: 'web-mobile' });
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    let failure: Error | undefined;
    try {
      await renderProjectHtml(config, {});
    } catch (error) {
      failure = error as Error;
    }
    expect(failure?.message).toContain('SELECTED-INIT-FAILED');
    const temporaryPath = failure?.stack?.match(
      /(?:\/private)?\/(?:var|tmp)[^\n ()]*transone-ssr-[^\n ()]*\/entry\.js/
    )?.[0];
    expect(temporaryPath).toBeDefined();
    expect(existsSync(dirname(temporaryPath!))).toBe(false);
    expect(Object.getOwnPropertyDescriptor(globalThis, 'document')).toEqual(
      descriptor
    );
    writeFileSync(
      join(root, 'src/mobile.ts'),
      `import {WebMobile,Div} from 'transone';import {Card} from './card';@WebMobile() export class Mobile extends Card {render(){return Div({children:['recovered-marker']})}}`
    );
    expect(await renderProjectHtml(config, {})).toContain('recovered-marker');
  }, 20000);
  it('does not eagerly load selected implementations for unused discovered families', async () => {
    const root = project({
      'src/card.ts': card,
      'src/main.ts': main,
      'src/mobile.ts': `import {WebMobile,Div} from 'transone';import {Card} from './card';@WebMobile() export class Mobile extends Card {render(){return Div({children:['used-mobile-marker']})}}`,
      'src/unused.ts': `import {Component,WebMobile,Div} from 'transone';class Unused extends Component {initState(){return {}}initStyles(){}render(){return Div({children:['unused-base-marker']})}} @WebMobile() export class UnusedMobile extends Unused {static poison=(()=>{throw new Error('UNUSED-SELECTED-EXECUTED')})();render(){return Div({children:['unused-mobile-marker']})}}`,
    });
    const result = await build({ root, target: 'web-mobile' });
    const html = readFileSync(join(result.outDir, 'index.html'), 'utf8');
    expect(html).toContain('used-mobile-marker');
    const js = result.assetsBuilt
      .filter((path) => path.endsWith('.js'))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    expect(js).not.toContain('UNUSED-SELECTED-EXECUTED');
    expect(js).not.toContain('unused-mobile-marker');
  }, 20000);

  it('binds an anonymous default business base by source identity', async () => {
    const root = project({
      'src/card.ts': card.replace('export class Card', 'export default class'),
      'src/main.ts': main.replace(
        "import { Card } from './card'",
        "import Card from './card'"
      ),
      'src/mobile.ts': `import {WebMobile,Div} from 'transone';import Card from './card';@WebMobile() export class Mobile extends Card {render(){return Div({children:['anonymous-mobile-marker']})}}`,
    });
    const result = await build({ root, target: 'web-mobile' });
    expect(readFileSync(join(result.outDir, 'index.html'), 'utf8')).toContain(
      'anonymous-mobile-marker'
    );
  }, 20000);
});

describe('Web review regressions', () => {
  async function verify(
    files: Record<string, string>,
    markers: string[],
    forbidden: string[] = []
  ) {
    const root = project(files);
    const result = await build({ root, target: 'web-mobile' });
    const html = readFileSync(join(result.outDir, 'index.html'), 'utf8');
    const js = result.assetsBuilt.find((path) => path.endsWith('.js'))!;
    const rendered = await browser(js, true);
    for (const marker of markers) {
      expect(html).toContain(marker);
      expect(rendered).toContain(marker);
    }
    const javascript = readFileSync(js, 'utf8');
    for (const marker of forbidden) expect(javascript).not.toContain(marker);
    return { html, rendered, javascript };
  }
  it('retains imported unknown decorators on selected implementations', async () => {
    const output = await verify(
      {
        'src/card.ts': card,
        'src/main.ts': main,
        'src/decorate.ts': `export function custom(){return (target:any)=>{target.prototype.marker='custom-marker';return target}}`,
        'src/mobile.ts': `import {WebMobile,Div} from 'transone';import {Card} from './card';import {custom} from './decorate';@custom() @WebMobile() export class Mobile extends Card {initStyles(){this.styleManager.addStyle('custom',{selector:'.custom-preserved',properties:{color:'plum'}})}render(){return Div({children:['mobile-marker',this.marker]})}}`,
      },
      ['mobile-marker', 'custom-marker']
    );
    expect(output.javascript).toContain('.custom-preserved');
    expect(output.javascript).toContain('plum');
  }, 20000);
  it('does not traverse an import used only by a removed implementation to bind another family', async () => {
    await verify(
      {
        'src/main.ts': `import {Component,WebMobile,WebPc,Div,createApp,createComponent} from 'transone';import {pcView} from './pc-only';
      class Card extends Component {initState(){return {}}initStyles(){}render(){return Div({children:['base']})}}
      @WebMobile() export class Mobile extends Card {render(){return Div({children:['mobile-marker']})}}
      @WebPc() export class Pc extends Card {render(){return pcView()}}
      export const app=createApp({document:{body:createComponent(Card)}});`,
        'src/pc-only.ts': `import {Component,Div,createComponent,WebMobile} from 'transone';export class Sidebar extends Component {initState(){return {}}initStyles(){}render(){return Div({children:['sidebar-base']})}}
        @WebMobile() export class MobileSidebar extends Sidebar {static bad=(()=>{throw new Error('PC-ONLY-EXECUTED')})();render(){return Div({children:['sidebar-mobile']})}}export const pcView=()=>createComponent(Sidebar);`,
      },
      ['mobile-marker'],
      ['PC-ONLY-EXECUTED', 'sidebar-mobile', 'sidebar-base']
    );
  }, 20000);
  it('preserves direct new of an explicitly referenced other-platform class', async () => {
    await verify(
      {
        'src/card.ts': card,
        'src/main.ts': `import {createApp,createComponent} from 'transone';import {Card} from './card';import {Pc} from './pc';const explicit=new Pc({});export const app=createApp({document:{body:[createComponent(Card),explicit.render()]}});`,
        'src/mobile.ts': `import {WebMobile,Div} from 'transone';import {Card} from './card';@WebMobile() export class Mobile extends Card {render(){return Div({children:['mobile-marker']})}}`,
        'src/pc.ts': `import {WebPc,Div} from 'transone';import {Card} from './card';@WebPc() export class Pc extends Card {render(){return Div({children:['explicit-pc-marker']})}}`,
      },
      ['mobile-marker', 'explicit-pc-marker']
    );
  }, 20000);
  it('shares nested destructured entry dependencies between selected definitions and app startup', async () => {
    await verify(
      {
        'src/main.ts': `import {Component,WebMobile,Div,createApp,createComponent} from 'transone';
      const {label,meta:{suffix},...rest}={label:'shared-value',meta:{suffix:'nested-marker'},extra:'rest-marker'};const [first,,...tail]=['array-marker','skip','tail-marker'];
      class Card extends Component {initState(){return {}}initStyles(){}render(){return Div({children:[label,suffix,rest.extra,first,tail[0]]})}}
      @WebMobile() export class Mobile extends Card {}export const app=createApp({document:{title:label+suffix+first,body:createComponent(Card)}});`,
      },
      [
        'shared-value',
        'nested-marker',
        'rest-marker',
        'array-marker',
        'tail-marker',
      ]
    );
  }, 20000);
  it('retains an explicitly consumed selected ancestor without rewriting its inheritance edge', async () => {
    await verify(
      {
        'src/main.ts': `import {Component,WebMobile,WebPc,Div,createApp,createComponent} from 'transone';
      class Card extends Component {initState(){return {}}initStyles(){}render(){return Div({children:['base']})}}
      @WebPc() export class Pc extends Card {render(){return Div({children:['ancestor-pc-marker']})}}
      @WebMobile() export class Mobile extends Pc {render(){return Div({children:['selected-mobile-marker',super.render()]})}}
      export const app=createApp({document:{body:[createComponent(Card),createComponent(Pc)]}});`,
      },
      ['selected-mobile-marker', 'ancestor-pc-marker']
    );
  }, 20000);
  it('keeps direct construction of a logical base without loading its selected implementation', async () => {
    await verify(
      {
        'src/card.ts': card,
        'src/main.ts': `import {createApp} from 'transone';import {Card} from './card';const direct=new Card({});export const app=createApp({document:{body:direct.render()}});`,
        'src/mobile.ts': `import {WebMobile} from 'transone';import {Card} from './card';@WebMobile() export class Mobile extends Card {static bad=(()=>{throw new Error('DO-NOT-DISPATCH-DIRECT-NEW')})()}`,
      },
      ['base-marker'],
      ['DO-NOT-DISPATCH-DIRECT-NEW']
    );
  }, 20000);
  it('diagnoses mutation of an entry dependency declared by destructuring', async () => {
    const root = project({
      'src/main.ts': `import {Component,WebMobile,Div,createApp,createComponent} from 'transone';let {label}={label:'initial'};
      class Card extends Component {initState(){return {}}initStyles(){}render(){return Div({children:[label]})}}@WebMobile() export class Mobile extends Card {}label='later';export const app=createApp({document:{body:createComponent(Card)}});`,
    });
    await expect(build({ root, target: 'web-mobile' })).rejects.toThrow(
      'Cannot mutate entry-owned component dependency label'
    );
  }, 20000);
});

describe('Web explicitly included external sources', () => {
  for (const missing of [false, true]) {
    it(`prunes sibling-library barrel variants before ${missing ? 'missing' : 'throwing'} PC dependencies resolve`, async () => {
      const top = project({
        'app/src/main.ts': `import {Component,Div,createApp,createComponent} from 'transone';import {Card} from '../../shared';import {readMarker} from 'compiled-card';
          class App extends Component {initState(){return {}}initStyles(){}render(){return Div({children:[readMarker(),createComponent(Card)]})}}
          export const app=createApp({root:App,document:{title:readMarker(),body:Div({children:[readMarker(),createComponent(Card)]})}});app.mount();`,
        'app/node_modules/compiled-card/package.json': JSON.stringify({
          name: 'compiled-card',
          type: 'module',
          exports: './index.js',
        }),
        'app/node_modules/compiled-card/index.js': `import {helper} from './helper.js';export const readMarker=()=>helper();`,
        'app/node_modules/compiled-card/helper.js': `export const helper=()=> 'compiled-package-marker';`,
        'shared/index.ts': `export {Card} from './base';export {Mobile} from './mobile';export {Pc} from './pc';`,
        'shared/base.ts': `import {Component,Div} from 'transone';export class Card extends Component {initState(){return {}}initStyles(){}render(){return Div({children:['external-base-marker']})}}`,
        'shared/mobile.ts': `import {WebMobile,Div} from 'transone';import {Card} from './base';@WebMobile() export class Mobile extends Card {render(){return Div({children:['external-mobile-marker']})}}`,
        'shared/pc.ts': `import {WebPc,Div} from 'transone';import {Card} from './base';import {poison} from './${missing ? 'pc-missing' : 'pc-dep'}';@WebPc() export class Pc extends Card {static value=poison;render(){return Div({children:['external-pc-marker']})}}`,
        ...(!missing
          ? {
              'shared/pc-dep.ts': `throw new Error('UNSELECTED_EXTERNAL_PC_EXECUTED');export const poison='external-poison-marker';`,
            }
          : {}),
      });
      const result = await build({
        root: join(top, 'app'),
        target: 'web-mobile',
        config: { components: { include: ['../shared/**/*.ts'] } },
      });
      const html = readFileSync(join(result.outDir, 'index.html'), 'utf8');
      const javascriptPath = result.assetsBuilt.find((path) =>
        path.endsWith('.js')
      )!;
      const javascript = readFileSync(javascriptPath, 'utf8');
      expect(html).toContain('external-mobile-marker');
      expect(html).toContain('compiled-package-marker');
      const mounted = await browser(javascriptPath);
      expect(mounted).toContain('external-mobile-marker');
      expect(mounted).toContain('compiled-package-marker');
      for (const marker of [
        'external-pc-marker',
        'external-poison-marker',
        'UNSELECTED_EXTERNAL_PC_EXECUTED',
        'pc-missing',
      ])
        expect(javascript).not.toContain(marker);
    }, 20000);
  }
  it('watches a sibling include when the selected variant is initially absent, then added, edited and deleted', async () => {
    const top = project({
      'app/src/main.ts': `import {createApp,createComponent} from 'transone';import {Card} from '../../shared';export const app=createApp({document:{body:createComponent(Card)}});`,
      'shared/index.ts': `export {Card} from './base';`,
      'shared/base.ts': `import {Component,Div} from 'transone';export class Card extends Component {initState(){return {}}initStyles(){}render(){return Div({children:['external-watch-base']})}}`,
    });
    const root = join(top, 'app');
    const server = await startDevServer({
      root,
      target: 'web-mobile',
      watch: true,
      config: {
        components: { include: ['../shared/**/*.ts'] },
        server: { host: '127.0.0.1', port: 0 },
      },
    });
    servers.push(server);
    const url = `http://127.0.0.1:${server.port}/`;
    const page = async () => {
      const response = await fetch(url);
      const html = await response.text();
      const source = html.match(/src="([^"]+\.js)"/)?.[1];
      return { html, source };
    };
    const first = await page();
    expect(first.html).toContain('external-watch-base');
    const variant = (marker: string) =>
      `import {WebMobile,Div} from 'transone';import {Card} from './base';@WebMobile() export class Mobile extends Card {render(){return Div({children:['${marker}']})}}`;
    writeFileSync(join(top, 'shared/mobile.ts'), variant('external-watch-one'));
    const added = await eventually(page, (result) =>
      result.html.includes('external-watch-one')
    );
    expect(added.source).not.toBe(first.source);
    expect(await (await fetch(new URL(added.source!, url))).text()).toContain(
      'external-watch-one'
    );
    writeFileSync(join(top, 'shared/mobile.ts'), variant('external-watch-two'));
    const edited = await eventually(
      page,
      (result) =>
        result.html.includes('external-watch-two') &&
        result.source !== added.source
    );
    expect(edited.source).not.toBe(added.source);
    const editedJs = await (await fetch(new URL(edited.source!, url))).text();
    expect(editedJs).toContain('external-watch-two');
    expect(editedJs).not.toContain('external-watch-one');
    rmSync(join(top, 'shared/mobile.ts'));
    const deleted = await eventually(
      page,
      (result) =>
        result.html.includes('external-watch-base') &&
        result.source !== edited.source
    );
    expect(deleted.source).not.toBe(edited.source);
    expect(
      await (await fetch(new URL(deleted.source!, url))).text()
    ).not.toContain('external-watch-two');
    await server.stop(true);
    servers.splice(servers.indexOf(server), 1);
    expect(readdirSync(join(root, 'dist/dev/h5'))).toHaveLength(0);
  }, 90000);
});
