import { afterEach, describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from '../src/build';

const roots: string[] = [];
const framework = resolve(import.meta.dir, '../../transone/lib/index.ts');
function project(files: Record<string, string>): string {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), 'transone-platform-mp-'))
  );
  roots.push(root);
  for (const [name, content] of Object.entries({
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        baseUrl: root,
        paths: { transone: [framework], '@/*': ['src/*'] },
      },
    }),
    'transone.config.ts': `export default { entry:'src/main.ts', mp:{pages:{'/':'src/main.ts'}} };`,
    ...files,
  })) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const dialects = [
  ['mp-weixin', 'MiniprogramWeixin', 'wxml', 'wxss'],
  ['mp-alipay', 'MiniprogramAlipay', 'axml', 'acss'],
  ['mp-bytedance', 'MiniprogramBytedance', 'ttml', 'ttss'],
  ['mp-xiaohongshu', 'MiniprogramXiaohongshu', 'xhsml', 'css'],
] as const;
function fixture(decorator: string) {
  return {
    'src/helper.ts': `const STEP=3; export function advance(n:number){return n+STEP;}`,
    'src/base.ts': `import {BaseComponent,h,createComponent} from 'transone'; import {advance} from './helper';
    const START=2; const COLOR='red';
    export class Card extends BaseComponent { initState(){return {count:START};} initStyles(){this.styleManager.addStyle('card',{selector:'.card',properties:{color:COLOR,padding:4}});} increment(){this.state.count=advance(this.state.count);} render(){return h('p',{},['base']);} }
    export class App extends BaseComponent { render(){return h('main',{},[createComponent({component:Card,props:{title:'hello'}})]);} }`,
    'src/variants.ts': `import {h,createComponent,${decorator},WebPc} from 'transone'; import {Card,App} from './base';
    const START=9; const COLOR='blue';
    @${decorator}() export class Chosen extends Card { initState(){return {...super.initState(), extra:START};} initStyles(){super.initStyles();this.styleManager.addStyle('card',{selector:'.card',properties:{color:COLOR}});} increment(){super.increment();this.state.count+=1;} render(){return h('button',{class:'card',onClick:()=>this.increment()},[this.props.title,this.state.count,'chosen']);} }
    @${decorator}() export class ChosenRoot extends App { render(){return h('main',{},['root-chosen',createComponent({component:Card,props:{title:'hello'}})]);} }
    @WebPc() export class Poison extends Card { static bad=window.WEB_ONLY_POISON(); render(){return h('div',{},['wrong-platform']);} }`,
    'src/main.ts': `import {createApp} from 'transone'; import {App} from './base'; export const app=createApp({root:App});`,
  };
}
function executeComponent(js: string) {
  let definition: any;
  new Function('Component', 'getApp', js)(
    (value: any) => (definition = value),
    () => ({})
  );
  return definition;
}
it.each(dialects)(
  '%s compiles generic mini program root and nested business behavior',
  async (target, _decorator, template, style) => {
    const root = project(fixture('Miniprogram'));
    const result = await build({ root, target });
    expect(
      readFileSync(join(result.outDir, `pages/index/index.${template}`), 'utf8')
    ).toContain('root-chosen');
    const child = join(result.outDir, 'components/card/card');
    expect(readFileSync(`${child}.${template}`, 'utf8')).toContain('chosen');
    expect(readFileSync(`${child}.${style}`, 'utf8')).toContain('blue');
    const js = readFileSync(`${child}.js`, 'utf8');
    expect(js).not.toContain('WEB_ONLY_POISON');
    const definition = executeComponent(js);
    const instance = {
      data: { ...definition.data },
      setData(values: Record<string, unknown>) {
        Object.assign(this.data, values);
      },
      ...definition.methods,
    };
    instance.increment();
    expect(instance.data).toEqual({ count: 6, extra: 9 });
  }
);

describe('platform mini program compilation', () => {
  for (const [target, decorator, template, style] of dialects)
    it(`${target} selects root and child with owner-aware inherited state styles and business calls`, async () => {
      const root = project(fixture(decorator));
      const result = await build({ root, target });
      expect(
        readFileSync(
          join(result.outDir, `pages/index/index.${template}`),
          'utf8'
        )
      ).toContain('root-chosen');
      const child = join(result.outDir, 'components/card/card');
      expect(readFileSync(`${child}.${template}`, 'utf8')).toContain('chosen');
      const css = readFileSync(`${child}.${style}`, 'utf8');
      expect(css).toContain('blue');
      expect(css).not.toContain('red');
      expect(css).not.toContain('padding');
      const js = readFileSync(`${child}.js`, 'utf8');
      expect(js).not.toContain('WEB_ONLY_POISON');
      expect(js).not.toContain('wrong-platform');
      const def = executeComponent(js);
      expect(def.data).toEqual({ count: 2, extra: 9 });
      const instance = {
        data: { ...def.data },
        setData(values: any) {
          Object.assign(this.data, values);
        },
        ...def.methods,
      };
      instance.increment();
      expect(instance.data.count).toBe(6);
    });
});

it('inherits render imports through default namespace re-export and paths and keeps explicit variants', async () => {
  const root = project({
    'src/helpers.ts': `const VALUE=7; export default function advance(n:number){return n+VALUE;} export function other(n:number){return n*2;}`,
    'src/card.ts': `import {BaseComponent,h} from 'transone'; import advance from './helpers'; import * as helpers from './helpers'; const VALUE=1;
    export default class Card extends BaseComponent { initState(){return {count:VALUE};} increment(){this.state.count=helpers.other(advance(this.state.count));} render(){return h('button',{onClick:()=>this.increment()},['base-card']);} }`,
    'src/barrel.ts': `export {default as Card} from './card';`,
    'src/app.ts': `import {BaseComponent,h,createComponent} from 'transone'; import * as cards from '@/barrel'; export default class App extends BaseComponent {render(){return h('main',{},[createComponent({component:cards.Card})]);}}`,
    'src/view.ts': `import {MiniprogramWeixin,Web,h} from 'transone'; import App from './app'; import Card from './card'; @MiniprogramWeixin() export class RootView extends App {} @Web() export class WebCard extends Card {render(){return h('p',{},['explicit-web']);}}`,
    'src/main.ts': `import {createApp} from 'transone'; import App from '@/app'; export const app=createApp({root:App});`,
  });
  let result = await build({ root, target: 'mp-weixin' });
  const template = readFileSync(
    join(result.outDir, 'components/card/card.wxml'),
    'utf8'
  );
  expect(template).toContain('base-card');
  const def = executeComponent(
    readFileSync(join(result.outDir, 'components/card/card.js'), 'utf8')
  );
  const instance = {
    data: { ...def.data },
    setData(v: any) {
      Object.assign(this.data, v);
    },
    ...def.methods,
  };
  instance.increment();
  expect(instance.data.count).toBe(16);
  writeFileSync(
    join(root, 'src/app.ts'),
    `import {BaseComponent,h,createComponent} from 'transone'; import {WebCard} from './view'; export default class App extends BaseComponent {render(){return h('main',{},[createComponent({component:WebCard})]);}}`
  );
  result = await build({ root, target: 'mp-weixin' });
  expect(
    readFileSync(
      join(result.outDir, 'components/web-card/web-card.wxml'),
      'utf8'
    )
  ).toContain('explicit-web');
}, 30_000);

it('disambiguates equal class names and retains logical tags after implementation rename', async () => {
  const root = project({
    'src/a.ts': `import {BaseComponent,h} from 'transone';export class Card extends BaseComponent {render(){return h('p',{},['A']);}}`,
    'src/b.ts': `import {BaseComponent,h} from 'transone';export class Card extends BaseComponent {render(){return h('p',{},['B']);}}`,
    'src/views.ts': `import {MiniprogramWeixin,h} from 'transone';import {Card} from './a';@MiniprogramWeixin() export class AView extends Card {render(){return h('p',{},['selected-A']);}}`,
    'src/main.ts': `import {BaseComponent,h,createApp,createComponent} from 'transone';import {Card as A} from './a';import {Card as B} from './b';class App extends BaseComponent {render(){return h('main',{},[createComponent({component:A}),createComponent({component:B})]);}}export const app=createApp({root:App});`,
  });
  const result = await build({ root, target: 'mp-weixin' });
  const original = readFileSync(
    join(result.outDir, 'pages/index/index.json'),
    'utf8'
  );
  const paths = Object.values(JSON.parse(original).usingComponents) as string[];
  expect(paths).toHaveLength(2);
  expect(paths[0]).not.toBe(paths[1]);
  expect(
    paths
      .map((path) => readFileSync(join(result.outDir, `${path}.wxml`), 'utf8'))
      .join('')
  ).toContain('selected-A');
  writeFileSync(
    join(root, 'src/views.ts'),
    readFileSync(join(root, 'src/views.ts'), 'utf8').replace(
      'AView',
      'RenamedView'
    )
  );
  await build({ root, target: 'mp-weixin' });
  expect(
    readFileSync(join(result.outDir, 'pages/index/index.json'), 'utf8')
  ).toBe(original);
}, 30_000);

it('rejects unsupported super before replacing a previous successful output', async () => {
  const root = project(fixture('MiniprogramWeixin'));
  const result = await build({ root, target: 'mp-weixin' });
  const before = readFileSync(
    join(result.outDir, 'components/card/card.js'),
    'utf8'
  );
  writeFileSync(
    join(root, 'src/variants.ts'),
    readFileSync(join(root, 'src/variants.ts'), 'utf8').replace(
      'super.increment();',
      'const fn=super.increment;fn();'
    )
  );
  await expect(build({ root, target: 'mp-weixin' })).rejects.toThrow('super');
  expect(
    readFileSync(join(result.outDir, 'components/card/card.js'), 'utf8')
  ).toBe(before);
});

it('links inherited request clients without pulling unused platform imports or executing them', async () => {
  const files = fixture('MiniprogramWeixin');
  files['src/base.ts'] = files['src/base.ts']
    .replace(
      "import {advance} from './helper';",
      `import {advance} from './helper';import {createRequest} from 'transone/request';const client=createRequest({baseURL:'https://parent.example'});`
    )
    .replace(
      'increment(){this.state.count=advance(this.state.count);}',
      `increment(){client.get('/counter');this.state.count=advance(this.state.count);}`
    );
  files['src/variants.ts'] =
    `import {poison} from './poison';\n` +
    files['src/variants.ts'].replace('window.WEB_ONLY_POISON()', 'poison()');
  const root = project({
    ...files,
    'src/poison.ts': `throw new Error('PLATFORM_DEP_EXECUTED');export function poison(){return 'POISON_MODULE';}`,
  });
  const result = await build({ root, target: 'mp-weixin' });
  const js = readFileSync(
    join(result.outDir, 'components/card/card.js'),
    'utf8'
  );
  expect(js).not.toContain('POISON_MODULE');
  expect(js).not.toContain('PLATFORM_DEP_EXECUTED');
  const calls: any[] = [];
  let def: any;
  new Function('Component', 'getApp', js)(
    (v: any) => (def = v),
    () => ({
      __transoneRequest: {
        createRequest: (options: any) => ({
          get: (path: string) => calls.push([options, path]),
        }),
      },
    })
  );
  const instance = {
    data: { ...def.data },
    setData(v: any) {
      Object.assign(this.data, v);
    },
    ...def.methods,
  };
  instance.increment();
  expect(calls).toEqual([[{ baseURL: 'https://parent.example' }, '/counter']]);
});

it('folds parent imported constants and local super state spreads with inherited lifecycle and appended styles', async () => {
  const root = project({
    'src/constants.ts': `const VALUE=4;export const INITIAL=VALUE;export const COLOR='purple';`,
    'src/base.ts': `import {BaseComponent,h} from 'transone';import {INITIAL,COLOR} from './constants';export class Card extends BaseComponent {initState(){return {count:INITIAL};}initStyles(){this.styleManager.addStyle('base',{selector:'.base',properties:{color:COLOR}});}onMounted(){this.state.count+=INITIAL;}render(){return h('p',{},[this.state.count]);}}`,
    'src/views.ts': `import {MiniprogramWeixin} from 'transone';import {Card} from './base';const INITIAL=10;@MiniprogramWeixin() export class View extends Card {initState(){const parent=super.initState();return {...parent,extra:INITIAL};}initStyles(){super.initStyles();this.styleManager.addStyle('extra',{selector:'.extra',properties:{padding:INITIAL}});}}`,
    'src/main.ts': `import {createApp} from 'transone';import {Card} from './base';export const app=createApp({root:Card});`,
  });
  const result = await build({ root, target: 'mp-weixin' });
  const css = readFileSync(
    join(result.outDir, 'pages/index/index.wxss'),
    'utf8'
  );
  expect(css).toContain('purple');
  expect(css).toContain('10px');
  let page: any;
  new Function(
    'Page',
    readFileSync(join(result.outDir, 'pages/index/index.js'), 'utf8')
  )((v: any) => (page = v));
  expect(page.data).toEqual({ count: 4, extra: 10 });
  page.setData = (v: any) => Object.assign(page.data, v);
  page.onReady();
  expect(page.data.count).toBe(8);
});

it('keeps object property names and shorthand values distinct from same-named module constants', async () => {
  const root = project({
    'src/main.ts': `import {BaseComponent,h,createApp} from 'transone';const count=3;const helper=(value:number)=>({count:value});class App extends BaseComponent {initState(){return {count:0};}tap(){const object={count};this.setState({count:helper(object.count).count});}render(){return h('button',{onClick:()=>this.tap()},['tap']);}}export const app=createApp({root:App});`,
  });
  const result = await build({ root, target: 'mp-weixin' });
  let page: any;
  new Function(
    'Page',
    readFileSync(join(result.outDir, 'pages/index/index.js'), 'utf8')
  )((value: any) => (page = value));
  page.setData = (value: any) => Object.assign(page.data, value);
  page.tap();
  expect(page.data.count).toBe(3);
});

it('links shorthand imported helper values while preserving local shadows', async () => {
  const root = project({
    'src/helper.ts': `export function advance(n:number){return n+2;}`,
    'src/main.ts': `import {BaseComponent,h,createApp} from 'transone';import {advance} from './helper';const helper=(n:number)=>n+100;class App extends BaseComponent {initState(){return {count:0};}tap(){const helper=(n:number)=>n+3;const callbacks={advance,helper};this.state.count=callbacks.advance(callbacks.helper(this.state.count));}render(){return h('button',{onClick:()=>this.tap()},['tap']);}}export const app=createApp({root:App});`,
  });
  const result = await build({ root, target: 'mp-weixin' });
  let page: any;
  new Function(
    'Page',
    readFileSync(join(result.outDir, 'pages/index/index.js'), 'utf8')
  )((value: any) => (page = value));
  page.setData = (value: any) => Object.assign(page.data, value);
  page.tap();
  expect(page.data.count).toBe(5);
});

function helperPage(helper: string): string {
  return project({
    'src/helper.ts': helper,
    'src/base.ts': `import {BaseComponent,h} from 'transone';import {advance} from './helper';export class Base extends BaseComponent {initState(){return {count:0};}tap(){this.state.count=advance(4);}render(){return h('button',{onClick:()=>this.tap()},['tap']);}}`,
    'src/view.ts': `import {MiniprogramWeixin} from 'transone';import {Base} from './base';@MiniprogramWeixin() export class View extends Base {}`,
    'src/main.ts': `import {createApp} from 'transone';import {Base} from './base';export const app=createApp({root:Base});`,
  });
}
async function generatedPage(root: string, app: unknown = {}): Promise<any> {
  const result = await build({ root, target: 'mp-weixin' });
  let page: any;
  new Function(
    'Page',
    'getApp',
    readFileSync(join(result.outDir, 'pages/index/index.js'), 'utf8')
  )(
    (value: any) => (page = value),
    () => app
  );
  page.setData = (value: any) => Object.assign(page.data, value);
  return page;
}
for (const declaration of ['let', 'var'])
  it(`preserves ${declaration} helper state across generated page calls`, async () => {
    const page = await generatedPage(
      helperPage(
        `${declaration} counter=0;export function advance(){return ++counter;}`
      )
    );
    page.tap();
    expect(page.data.count).toBe(1);
    page.tap();
    expect(page.data.count).toBe(2);
  });
it('preserves selected helper module initialization and dependency order', async () => {
  const root = helperPage(
    `import {seed} from './seed';const map=new Map<string,number>();map.set('start',seed());const unused=map.set('start',map.get('start')!+1);export function advance(){return map.get('start');}`
  );
  writeFileSync(
    join(root, 'src/seed.ts'),
    `let value=5;value+=1;export function seed(){return value;}`
  );
  const page = await generatedPage(root);
  page.tap();
  expect(page.data.count).toBe(7);
});
it('lowers request imports by value symbol while preserving parameter and local shadows', async () => {
  const root = helperPage(
    `import request,{createRequest as makeRequest} from 'transone/request';import * as api from 'transone/request';export function advance(request:number){const makeRequest=(n:number)=>n+1;const api={step:1};return makeRequest(request)+api.step;}`
  );
  const page = await generatedPage(root);
  page.tap();
  expect(page.data.count).toBe(6);
});
it('keeps base tags stable when a same-name decorated implementation is renamed and explicitly referenced', async () => {
  const root = project({
    'src/base.ts': `import {BaseComponent,h} from 'transone';export class Card extends BaseComponent {render(){return h('p',{},['base']);}}`,
    'src/view.ts': `import {MiniprogramWeixin,h} from 'transone';import {Card as BaseCard} from './base';@MiniprogramWeixin() export class Card extends BaseCard {render(){return h('p',{},['selected']);}}`,
    'src/main.ts': `import {BaseComponent,createApp,createComponent,h} from 'transone';import {Card} from './base';import {Card as Explicit} from './view';class App extends BaseComponent {render(){return h('main',{},[createComponent({component:Card}),createComponent({component:Explicit})]);}}export const app=createApp({root:App});`,
  });
  const result = await build({ root, target: 'mp-weixin' });
  let using = JSON.parse(
    readFileSync(join(result.outDir, 'pages/index/index.json'), 'utf8')
  ).usingComponents;
  expect(using.card).toBe('/components/card/card');
  expect(Object.keys(using)).toHaveLength(2);
  expect(Object.keys(using).filter((tag) => tag !== 'card')[0]).toMatch(
    /^card-[a-f0-9]+$/
  );
  writeFileSync(
    join(root, 'src/view.ts'),
    readFileSync(join(root, 'src/view.ts'), 'utf8').replace(
      'class Card',
      'class RenamedView'
    )
  );
  writeFileSync(
    join(root, 'src/main.ts'),
    readFileSync(join(root, 'src/main.ts'), 'utf8').replace(
      'Card as Explicit',
      'RenamedView as Explicit'
    )
  );
  await build({ root, target: 'mp-weixin' });
  using = JSON.parse(
    readFileSync(join(result.outDir, 'pages/index/index.json'), 'utf8')
  ).usingComponents;
  expect(using.card).toBe('/components/card/card');
});
it('preserves selected initialization co-located with components without selecting platform-only initializers', async () => {
  const root = helperPage(`export function advance(n:number){return n;}`);
  writeFileSync(
    join(root, 'src/base.ts'),
    `import {BaseComponent,h,WebPc} from 'transone';import {poison} from './poison';const platformOnly=poison();const map=new Map<string,number>();const initialized=map.set('start',6);map.set('start',map.get('start')!+1);function advance(){return map.get('start');}export class Base extends BaseComponent {initState(){return {count:0};}tap(){this.state.count=advance();}render(){return h('button',{onClick:()=>this.tap()},['tap']);}}@WebPc() export class Pc extends Base {static value=platformOnly;}`
  );
  writeFileSync(
    join(root, 'src/poison.ts'),
    `export function poison(){throw new Error('UNSELECTED_PLATFORM_INITIALIZER');}`
  );
  const page = await generatedPage(root);
  page.tap();
  expect(page.data.count).toBe(7);
  expect(
    readFileSync(
      join(root, 'dist/build/mp-weixin/pages/index/index.js'),
      'utf8'
    )
  ).not.toContain('UNSELECTED_PLATFORM_INITIALIZER');
});
it('retains default named and namespace request accesses alongside their shadows', async () => {
  const root = helperPage(
    `import request,{createRequest as makeRequest} from 'transone/request';import * as api from 'transone/request';const first=makeRequest({});const second=api.createRequest({});function send(){request.get('/default');first.get('/named');second.get('/namespace');}export function advance(request:number){send();const makeRequest=(n:number)=>n+1;return makeRequest(request);}`
  );
  const calls: string[] = [];
  const page = await generatedPage(root, {
    __transoneRequest: {
      default: { get: (path: string) => calls.push(path) },
      createRequest: () => ({ get: (path: string) => calls.push(path) }),
    },
  });
  page.tap();
  expect(page.data.count).toBe(5);
  expect(calls).toEqual(['/default', '/named', '/namespace']);
});
it('preserves selected import initialization order independently of helper call order', async () => {
  const root = helperPage(
    `import {left} from './left';import {right} from './right';import {log} from './shared';export function advance(){right();left();return log.join(',');}`
  );
  writeFileSync(join(root, 'src/shared.ts'), `export const log:string[]=[];`);
  writeFileSync(
    join(root, 'src/left.ts'),
    `import {log} from './shared';log.push('left');export function left(){}`
  );
  writeFileSync(
    join(root, 'src/right.ts'),
    `import {log} from './shared';log.push('right');export function right(){}`
  );
  const page = await generatedPage(root);
  page.tap();
  expect(page.data.count).toBe('left,right');
});
it('diagnoses unsupported selected helper initialization before replacing output', async () => {
  const root = helperPage(`export function advance(){return 7;}`);
  await generatedPage(root);
  const file = join(root, 'dist/build/mp-weixin/pages/index/index.js');
  const before = readFileSync(file, 'utf8');
  writeFileSync(
    join(root, 'src/helper.ts'),
    `import './initialize';export function advance(){return 7;}`
  );
  writeFileSync(
    join(root, 'src/initialize.ts'),
    `globalThis.unmodeledInitialization=true;`
  );
  await expect(build({ root, target: 'mp-weixin' })).rejects.toThrow(
    '副作用导入'
  );
  expect(readFileSync(file, 'utf8')).toBe(before);
});
it('does not select unused helper closures or their platform-only imports', async () => {
  const root = helperPage(
    `import {poison} from './poison';const unused=()=>poison();export function advance(){return 7;}`
  );
  writeFileSync(
    join(root, 'src/poison.ts'),
    `throw new Error('UNUSED_HELPER_CLOSURE_MODULE');export function poison(){}`
  );
  const page = await generatedPage(root);
  page.tap();
  expect(page.data.count).toBe(7);
  expect(
    readFileSync(
      join(root, 'dist/build/mp-weixin/pages/index/index.js'),
      'utf8'
    )
  ).not.toContain('UNUSED_HELPER_CLOSURE_MODULE');
});
it('preserves initialized const object identity read directly by inherited methods', async () => {
  const root = helperPage(`export function advance(n:number){return n;}`);
  writeFileSync(
    join(root, 'src/base.ts'),
    `import {BaseComponent,h} from 'transone';const values={count:0};values.count=7;export class Base extends BaseComponent {initState(){return {count:0};}tap(){this.state.count=values.count;}render(){return h('button',{onClick:()=>this.tap()},['tap']);}}`
  );
  const page = await generatedPage(root);
  page.tap();
  expect(page.data.count).toBe(7);
});

function installedComponent(
  entry: string,
  extra: Record<string, string> = {}
): string {
  return project({
    'node_modules/legacy-card/package.json': JSON.stringify({
      name: 'legacy-card',
      version: '1.0.0',
      type: 'module',
      types: './dist/index.d.ts',
      source: './lib/index.ts',
      exports: {
        '.': { types: './dist/index.d.ts', import: './dist/index.js' },
      },
    }),
    'node_modules/legacy-card/dist/index.d.ts': `import {BaseComponent} from 'transone';export declare class LegacyCard extends BaseComponent {protected initState():{count:number};protected initStyles():void;protected render():any;increment():void;}export default LegacyCard;`,
    'node_modules/legacy-card/dist/index.js': `throw new Error('DECLARATION_PACKAGE_RUNTIME_MUST_NOT_EXECUTE');`,
    'node_modules/legacy-card/lib/index.ts': `export {LegacyCard,LegacyCard as default} from './card';`,
    'node_modules/legacy-card/lib/helper.ts': `let step=1;step+=1;export function advance(n:number){return n+step;}`,
    'node_modules/legacy-card/lib/card.ts': `import {BaseComponent,h} from 'transone';import {advance} from './helper';const START=4;export class LegacyCard extends BaseComponent {initState(){return {count:START};}initStyles(){this.styleManager.addStyle('legacy',{selector:'.legacy',properties:{padding:START}});}increment(){this.state.count=advance(this.state.count);}render(){return h('button',{class:'legacy',onClick:()=>this.increment()},['legacy source body',this.state.count]);}}`,
    'src/main.ts': entry,
    ...extra,
  });
}
for (const [label, imports, component] of [
  ['named alias', `import {LegacyCard as Card} from 'legacy-card';`, 'Card'],
  ['default', `import Card from 'legacy-card';`, 'Card'],
  [
    'namespace',
    `import * as packageCards from 'legacy-card';`,
    'packageCards.LegacyCard',
  ],
  ['local barrel', `import {Card} from './barrel';`, 'Card'],
] as const)
  it(`compiles types-and-source installed ${label} components as roots and nested children`, async () => {
    const root = installedComponent(
      `import {createApp} from 'transone';${imports}export const app=createApp({root:${component}});`,
      { 'src/barrel.ts': `export {LegacyCard as Card} from 'legacy-card';` }
    );
    const page = await generatedPage(root);
    expect(page.data.count).toBe(4);
    page.increment();
    expect(page.data.count).toBe(6);
    const output = join(root, 'dist/build/mp-weixin');
    expect(
      readFileSync(join(output, 'pages/index/index.wxml'), 'utf8')
    ).toContain('legacy source body');
    expect(
      readFileSync(join(output, 'pages/index/index.wxss'), 'utf8')
    ).toContain('4px');
    writeFileSync(
      join(root, 'src/main.ts'),
      `import {BaseComponent,h,createApp,createComponent} from 'transone';${imports}class App extends BaseComponent {render(){return h('main',{},[createComponent({component:${component}})]);}}export const app=createApp({root:App});`
    );
    await build({ root, target: 'mp-weixin' });
    const using = JSON.parse(
      readFileSync(join(output, 'pages/index/index.json'), 'utf8')
    ).usingComponents;
    expect(using['legacy-card']).toBe('/components/legacy-card/legacy-card');
    const definition = executeComponent(
      readFileSync(
        join(output, 'components/legacy-card/legacy-card.js'),
        'utf8'
      )
    );
    const instance = {
      data: { ...definition.data },
      setData(value: any) {
        Object.assign(this.data, value);
      },
      ...definition.methods,
    };
    instance.increment();
    expect(instance.data.count).toBe(6);
  });
it('keeps actual selected implementations while hydrating installed declaration-only parent members', async () => {
  const root = installedComponent(
    `import {createApp} from 'transone';import {LegacyCard} from 'legacy-card';export const app=createApp({root:LegacyCard});`,
    {
      'src/view.ts': `import {MiniprogramWeixin,h} from 'transone';import {LegacyCard} from 'legacy-card';@MiniprogramWeixin() export class Selected extends LegacyCard {render(){return h('button',{onClick:()=>this.increment()},['selected real source']);}}`,
    }
  );
  const page = await generatedPage(root);
  expect(page.data.count).toBe(4);
  page.increment();
  expect(page.data.count).toBe(6);
  expect(
    readFileSync(
      join(root, 'dist/build/mp-weixin/pages/index/index.wxml'),
      'utf8'
    )
  ).toContain('selected real source');
});
it('keeps source-only installed components on the legacy path with real helper ownership', async () => {
  const root = installedComponent(
    `import {createApp} from 'transone';import {LegacyCard} from 'legacy-card';export const app=createApp({root:LegacyCard});`
  );
  writeFileSync(
    join(root, 'node_modules/legacy-card/package.json'),
    JSON.stringify({
      name: 'legacy-card',
      version: '1.0.0',
      source: './lib/index.ts',
    })
  );
  const page = await generatedPage(root);
  expect(page.data.count).toBe(4);
  page.increment();
  expect(page.data.count).toBe(6);
});
it('does not require declaration package source for a fully implemented selected view', async () => {
  const root = installedComponent(
    `import {createApp} from 'transone';import {LegacyCard} from 'legacy-card';export const app=createApp({root:LegacyCard});`,
    {
      'src/view.ts': `import {MiniprogramWeixin,h} from 'transone';import {LegacyCard} from 'legacy-card';@MiniprogramWeixin() export class Selected extends LegacyCard {initState(){return {count:9};}initStyles(){}increment(){this.state.count+=1;}render(){return h('button',{onClick:()=>this.increment()},['self-contained view']);}}`,
    }
  );
  const manifest = JSON.parse(
    readFileSync(join(root, 'node_modules/legacy-card/package.json'), 'utf8')
  );
  delete manifest.source;
  writeFileSync(
    join(root, 'node_modules/legacy-card/package.json'),
    JSON.stringify(manifest)
  );
  const page = await generatedPage(root);
  expect(page.data.count).toBe(9);
  page.increment();
  expect(page.data.count).toBe(10);
});
