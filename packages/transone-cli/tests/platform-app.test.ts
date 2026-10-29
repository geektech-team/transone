import { afterEach, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from '../src/build';
import { analyzeNativeScreen } from '../src/app/analyze';
import { resolveConfig } from '../src/config';
import type { NativeNode } from '../src/app/types';
const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true }))
);
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'native-family-'));
  roots.push(root);
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'node_modules'));
  symlinkSync(
    resolve(import.meta.dir, '../../transone'),
    join(root, 'node_modules/transone'),
    'dir'
  );
  writeFileSync(
    join(root, 'src/main.ts'),
    `import {createApp} from 'transone'; import {App} from './App'; createApp({root: App});`
  );
  writeFileSync(
    join(root, 'src/Card.ts'),
    `import {BaseComponent,h} from 'transone';
    const STEP = 2; const INITIAL = 3;
    export class Card extends BaseComponent {
      initState(){return {count: INITIAL};} initStyles(){}
      increment(){this.state.count += STEP;}
      render(){return h('main', {}, [h('p', {}, ['shared', this.props.title, ' Count: {{count}}']),h('button', {}, ['+'], {click:()=>this.increment()})]);}
    }`
  );
  writeFileSync(
    join(root, 'src/Variants.ts'),
    `import {AppIos,AppAndroid,h} from 'transone'; import {Card} from './Card';
    const STEP = 99;
    @AppIos() export class IosCard extends Card {
      initState(){return {...super.initState(), extra: 1};}
      increment(){super.increment();}
      render(){return h('main', {}, [h('p', {}, ['ios', this.props.title, ' Count: {{count}}']),h('button', {}, ['+'], {click:()=>this.increment()})]);}
    }
    @AppAndroid() export class AndroidCard extends Card {render(){return h('main',{},[h('p',{},['android',this.props.title,' Count: {{count}}']),h('button',{},['+'],{click:()=>this.increment()})]);}}`
  );
  writeFileSync(
    join(root, 'src/App.ts'),
    `import {BaseComponent,AppIos,h,createComponent} from 'transone'; import {Card} from './Card';
    export class App extends BaseComponent {
      initState(){return {title: 'live'};} initStyles(){}
      rename(){this.state.title = 'changed';}
      render(){return h('main',{},[h('p',{},['root-shared']),createComponent({component:Card,props:{title:this.state.title}}),createComponent({component:Card,props:{title:'literal'}}),h('button',{},['rename'],{click:()=>this.rename()})]);}
    }
    @AppIos() export class IosApp extends App {render(){return h('main',{},[h('p',{},['root-ios']),createComponent({component:Card,props:{title:this.state.title}}),createComponent({component:Card,props:{title:'literal'}}),h('button',{},['rename'],{click:()=>this.rename()})]);}}`
  );
  return root;
}
function flatten(node: NativeNode): NativeNode[] {
  return [
    node,
    ...(node.kind === 'container' ? node.children.flatMap(flatten) : []),
  ];
}
it.each([
  ['app-ios', 'ios', 'root-ios'],
  ['app-android', 'android', 'root-app'],
  ['app-harmony', 'app-shared', 'root-app'],
] as const)(
  '%s compiles generic App fallbacks while preserving concrete overrides',
  async (target, marker, rootMarker) => {
    const root = fixture();
    writeFileSync(
      join(root, 'src/Generic.ts'),
      `
    import {App as CommonApp,h,createComponent} from 'transone';
    import {Card} from './Card'; import {App as Root} from './App';
    @CommonApp() export class GenericCard extends Card {
      render(){return h('main',{},[
        h('p',{},['app-shared',this.props.title,' Count: {{count}}']),
        h('button',{},['+'],{click:()=>this.increment()})
      ]);}
    }
    @CommonApp() export class GenericRoot extends Root {
      render(){return h('main',{},[h('p',{},['root-app']),
        createComponent({component:Card,props:{title:'generic title'}})
      ]);}
    }
  `
    );
    const config = await resolveConfig({ root, target });
    const screen = await analyzeNativeScreen(join(root, 'src/main.ts'), config);
    const nodes = flatten(screen.root);
    expect(
      JSON.stringify(nodes.filter((node) => node.kind === 'text'))
    ).toContain(marker);
    expect(
      JSON.stringify(nodes.filter((node) => node.kind === 'text'))
    ).toContain(rootMarker);
    const button = nodes.find((node) => node.kind === 'button');
    expect(button?.kind === 'button' && button.action).toMatchObject({
      kind: 'increment',
      by: 2,
    });
    const output = await build({ root, target });
    const sources = output.assetsBuilt
      .filter((file) => /\.(swift|kt|ets)$/.test(file))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(sources).toContain(marker);
    expect(sources).toContain(rootMarker);
  }
);

it.each([
  ['app-ios', 'ios', 'root-ios'],
  ['app-android', 'android', 'root-shared'],
  ['app-harmony', 'shared', 'root-shared'],
] as const)(
  'selects root/nested %s and scopes live native state independently',
  async (target, marker, rootMarker) => {
    const root = fixture();
    const config = await resolveConfig({ root, target });
    const screen = await analyzeNativeScreen(join(root, 'src/main.ts'), config);
    const nodes = flatten(screen.root);
    const texts = nodes.filter((n) => n.kind === 'text');
    expect(JSON.stringify(texts)).toContain(marker);
    expect(JSON.stringify(texts)).toContain(rootMarker);
    const buttons = nodes.filter((n) => n.kind === 'button');
    const [a, b, rename] = buttons.map((n) => n.action);
    if (
      a.kind === 'sequence' ||
      b.kind === 'sequence' ||
      rename.kind === 'sequence'
    )
      throw new Error('Expected single actions');
    expect(a.key).not.toBe(b.key);
    expect(a).toMatchObject({ kind: 'increment', by: 2 });
    const state = Object.fromEntries(screen.state.map((s) => [s.key, s.value]));
    function run(action: typeof a) {
      if (action.kind === 'increment')
        state[action.key] = Number(state[action.key]) + action.by;
      else if (action.kind === 'set-literal') state[action.key] = action.value;
    }
    run(a);
    expect(state[a.key]).toBe(5);
    expect(state[b.key]).toBe(3);
    run(rename);
    const bound = texts
      .flatMap((n) => n.parts)
      .filter((p) => p.kind === 'state' && p.key === rename.key);
    expect(bound.length).toBe(1);
    expect(bound[0].kind === 'state' && state[bound[0].key]).toBe('changed');
    const output = await build({ root, target });
    const source = output.assetsBuilt
      .filter((p) => /\.(swift|kt|ets)$/.test(p))
      .map((p) => readFileSync(p, 'utf8'))
      .join('\n');
    expect(source).toContain(marker);
    expect(source).toContain(rootMarker);
    expect(source).toContain(a.key);
    expect(source).toContain(b.key);
  }
);
it.each([
  ['dynamic', `createComponent({component: this.state.card})`, /静态组件/],
  [
    'slots',
    `createComponent({component: Card, slots: {default: []}})`,
    /slots/,
  ],
  ['cycle', `createComponent({component: App})`, /循环/],
  ['expression', `h('p', {}, [String(this.state.title)])`, /表达式/],
])(
  'rejects %s before replacing native output',
  async (_label, expression, error) => {
    const root = fixture();
    const result = await build({ root, target: 'app-ios' });
    const path = result.assetsBuilt.find((p) =>
      p.endsWith('ContentView.swift')
    )!;
    const before = readFileSync(path, 'utf8');
    writeFileSync(
      join(root, 'src/App.ts'),
      `import {BaseComponent,h,createComponent} from 'transone'; import {Card} from './Card'; export class App extends BaseComponent {initState(){return {title:'x'};}render(){return h('main',{},[${expression}]);}}`
    );
    await expect(build({ root, target: 'app-ios' })).rejects.toThrow(error);
    expect(readFileSync(path, 'utf8')).toBe(before);
  }
);

it.each(['app-ios', 'app-android', 'app-harmony'] as const)(
  'lowers super action sequences on %s with lexical owner constants',
  async (target) => {
    const root = fixture();
    writeFileSync(join(root, 'src/constants.ts'), 'export const STEP = 2;');
    const card = join(root, 'src/Card.ts');
    writeFileSync(
      card,
      readFileSync(card, 'utf8').replace(
        'const STEP = 2;',
        "import {STEP} from './constants';"
      )
    );
    const variants = join(root, 'src/Variants.ts');
    writeFileSync(
      variants,
      readFileSync(variants, 'utf8').replace(
        'increment(){super.increment();}',
        'increment(){super.increment();this.state.extra += 1;}'
      )
    );
    const app = join(root, 'src/App.ts');
    writeFileSync(
      app,
      readFileSync(app, 'utf8').replace(
        "import {Card} from './Card';",
        "import {IosCard as Card} from './Variants';"
      )
    );
    const config = await resolveConfig({ root, target });
    const screen = await analyzeNativeScreen(join(root, 'src/main.ts'), config);
    const buttons = flatten(screen.root).filter((n) => n.kind === 'button');
    {
      expect(buttons[0].action).toMatchObject({
        kind: 'sequence',
        actions: [
          { kind: 'increment', by: 2 },
          { kind: 'increment', by: 1 },
        ],
      });
      expect(buttons[1].action).toMatchObject({
        kind: 'sequence',
        actions: [
          { kind: 'increment', by: 2 },
          { kind: 'increment', by: 1 },
        ],
      });
    }
    const output = await build({ root, target });
    const source = output.assetsBuilt
      .filter((p) => /\.(swift|kt|ets)$/.test(p))
      .map((p) => readFileSync(p, 'utf8'))
      .join('\n');
    expect(source).toContain('+= 2');
    expect(source).not.toContain('+= 99');
    expect(source).toMatch(/c1_s0_count \+= 2; (?:this\.)?c1_s1_extra \+= 1/);
  }
);

it('resolves default/namespace/re-export/path references and object/positional component nodes', async () => {
  const root = fixture();
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { '@card': ['src/barrel.ts'] } },
    })
  );
  writeFileSync(
    join(root, 'src/barrel.ts'),
    "export {Card as default, Card as RenamedCard} from './Card';"
  );
  writeFileSync(
    join(root, 'src/App.ts'),
    `import {BaseComponent,h,createComponent} from 'transone'; import DefaultCard from '@card'; import * as Cards from '@card';
    export default class App extends BaseComponent {initStyles(){} render(){return {tag:'main',children:[{component:Cards.RenamedCard,props:{title:'object'}},createComponent(DefaultCard,{title:this.props.title})]};}}`
  );
  writeFileSync(
    join(root, 'src/main.ts'),
    `import {createApp as start} from 'transone';import App from './App';start({root:App,rootProps:{title:'root property'}});`
  );
  const output = await build({ root, target: 'app-ios' });
  const source = readFileSync(
    output.assetsBuilt.find((p) => p.endsWith('ContentView.swift'))!,
    'utf8'
  );
  expect(source).toContain('iosobject');
  expect(source).toContain('iosroot property');
  expect(source).toContain('c1_s0_count += 2');
  expect(source).toContain('c2_s0_count += 2');
});

it('preserves explicit native implementation references on another target', async () => {
  const root = fixture();
  writeFileSync(
    join(root, 'src/App.ts'),
    `import {BaseComponent,h,createComponent} from 'transone';import {IosCard} from './Variants';export class App extends BaseComponent{render(){return h('main',{},[createComponent({component:IosCard,props:{title:'explicit'}})]);}}`
  );
  const output = await build({ root, target: 'app-android' });
  const source = readFileSync(
    output.assetsBuilt.find((p) => p.endsWith('MainActivity.kt'))!,
    'utf8'
  );
  expect(source).toContain('iosexplicit');
  expect(source).not.toContain('androidexplicit');
});

it.each([
  [
    'initStyles',
    `initStyles(){this.addRule('p',{color:'red'});}`,
    /initStyles.*CSS/,
  ],
  [
    'action branch',
    `increment(){if(this.state.count > 0)this.state.count += 1;}`,
    /原生编译/,
  ],
  ['action recursion', `increment(){this.increment();}`, /方法调用循环/],
  ['async action', `async increment(){this.state.count += 1;}`, /同步无参数/],
])(
  'rejects unsupported %s before replacing output',
  async (_label, method, error) => {
    const root = fixture();
    const first = await build({ root, target: 'app-harmony' });
    const path = first.assetsBuilt.find((p) => p.endsWith('Index.ets'))!;
    const before = readFileSync(path, 'utf8');
    const card = join(root, 'src/Card.ts');
    const previous = readFileSync(card, 'utf8');
    writeFileSync(
      card,
      _label === 'initStyles'
        ? previous.replace('initStyles(){}', method)
        : previous.replace('increment(){this.state.count += STEP;}', method)
    );
    await expect(build({ root, target: 'app-harmony' })).rejects.toThrow(error);
    expect(readFileSync(path, 'utf8')).toBe(before);
  }
);

it.each([
  [
    'lifecycle',
    'async onMounted(){await fetch("https://example.test");}',
    /生命周期/,
  ],
  ['field', 'value = calculate();', /实例字段/],
  [
    'constructor',
    'constructor(props){super(props);this.state.count=99;}',
    /constructor/,
  ],
])(
  'rejects unsupported component %s before replacing output',
  async (_label, member, error) => {
    const root = fixture();
    const first = await build({ root, target: 'app-harmony' });
    const path = first.assetsBuilt.find((p) => p.endsWith('Index.ets'))!;
    const before = readFileSync(path, 'utf8');
    const card = join(root, 'src/Card.ts');
    writeFileSync(
      card,
      readFileSync(card, 'utf8').replace(
        'export class Card extends BaseComponent {',
        `export class Card extends BaseComponent { ${member}`
      )
    );
    await expect(build({ root, target: 'app-harmony' })).rejects.toThrow(error);
    expect(readFileSync(path, 'utf8')).toBe(before);
  }
);

it('accepts a directly exported explicit platform root without createApp', async () => {
  const root = fixture();
  writeFileSync(
    join(root, 'src/main.ts'),
    `import {BaseComponent,AppIos,h} from 'transone';@AppIos() export default class ExplicitRoot extends BaseComponent {render(){return h('main',{},[h('p',{},['direct explicit root'])]);}}`
  );
  const output = await build({ root, target: 'app-android' });
  const source = readFileSync(
    output.assetsBuilt.find((p) => p.endsWith('MainActivity.kt'))!,
    'utf8'
  );
  expect(source).toContain('direct explicit root');
});

it.each([
  [
    'spread options',
    `function options(){return {root:App};} createApp({root:App,...options()});`,
    /createApp.*展开/,
  ],
  [
    'conditional startup',
    `if(false){createApp({root:App});}`,
    /顶层.*createApp|createApp.*顶层/,
  ],
  [
    'function startup',
    `function start(){createApp({root:App});} start();`,
    /顶层.*createApp|createApp.*顶层/,
  ],
  [
    'router plugin',
    `const app=createApp({root:App});app.use(createRouter({routes:[]}));`,
    /原生.*路由.*插件/,
  ],
  [
    'aliased plugin receiver',
    `const app=createApp({root:App});const other=app;other.use(createRouter({routes:[]}));`,
    /原生.*路由.*插件/,
  ],
  [
    'chained router plugin',
    `createApp({root:App}).use(createRouter({routes:[]}));`,
    /原生.*路由.*插件/,
  ],
  [
    'dynamic metadata',
    `createApp({root:App,document:metadata()});`,
    /createApp.*静态字面量/,
  ],
  [
    'computed root option',
    `const key='root';createApp({root:App,[key]:App});`,
    /静态属性名/,
  ],
  ['duplicate root options', `createApp({root:App,root:App});`, /重复.*root/],
])(
  'rejects unsupported native startup %s and preserves old-output marker',
  async (_label, startup, error) => {
    const root = fixture();
    const first = await build({ root, target: 'app-ios' });
    const source = first.assetsBuilt.find((path) =>
      path.endsWith('ContentView.swift')
    )!;
    const before = readFileSync(source, 'utf8');
    const marker = join(first.outDir, 'preserved-marker');
    writeFileSync(marker, 'previous output marker');
    writeFileSync(
      join(root, 'src/main.ts'),
      `import {createApp} from 'transone';import {createRouter} from 'transone/router';import {App} from './App';${startup}`
    );
    await expect(build({ root, target: 'app-ios' })).rejects.toThrow(error);
    expect(readFileSync(marker, 'utf8')).toBe('previous output marker');
    expect(readFileSync(source, 'utf8')).toBe(before);
  }
);

it('rejects function-nested framework startup instead of using plain-class fallback', async () => {
  const root = fixture();
  const first = await build({ root, target: 'app-ios' });
  const marker = join(first.outDir, 'preserved-marker');
  writeFileSync(marker, 'previous');
  writeFileSync(
    join(root, 'src/main.ts'),
    `import {createApp} from 'transone';export class App{render(){return {tag:'main',children:[]};}}function start(){createApp({root:App});}`
  );
  await expect(build({ root, target: 'app-ios' })).rejects.toThrow(
    /顶层.*createApp|createApp.*顶层/
  );
  expect(readFileSync(marker, 'utf8')).toBe('previous');
});

it('keeps supported top-level mounting and ignores unrelated unused plugin helpers', async () => {
  const root = fixture();
  writeFileSync(
    join(root, 'src/main.ts'),
    `import {createApp} from 'transone';import {createRouter} from 'transone/router';import {App} from './App';
    function unused(){const router=createRouter({routes:[]}); const helper={use(value){return value}};helper.use(router);}
    const helper={use(value){return value}}; helper.use('ordinary');
    const app=createApp({root:App,document:{title:'static metadata'}});app.mount();`
  );
  const result = await build({ root, target: 'app-ios' });
  expect(
    readFileSync(
      result.assetsBuilt.find((path) => path.endsWith('ContentView.swift'))!,
      'utf8'
    )
  ).toContain('root-ios');
});

it('accepts direct top-level createApp mount chaining', async () => {
  const root = fixture();
  writeFileSync(
    join(root, 'src/main.ts'),
    `import {createApp} from 'transone';import {App} from './App';createApp({root:App}).mount();`
  );
  const result = await build({ root, target: 'app-ios' });
  expect(
    readFileSync(
      result.assetsBuilt.find((path) => path.endsWith('ContentView.swift'))!,
      'utf8'
    )
  ).toContain('root-ios');
});

for (const hook of [
  'beforeMount',
  'beforeUpdate',
  'beforeUnmount',
  'onPropsChange',
  'onErrorCaptured',
]) {
  it.each(['app-harmony', 'app-ios'] as const)(
    `rejects nonempty ${hook} on nested/inherited %s Card and preserves old output`,
    async (target) => {
      const root = fixture();
      const first = await build({ root, target });
      const output = first.assetsBuilt.find(
        (path) =>
          path.endsWith('ContentView.swift') || path.endsWith('Index.ets')
      )!;
      const before = readFileSync(output, 'utf8');
      const marker = join(first.outDir, 'preserved-marker');
      writeFileSync(marker, 'old lifecycle output');
      const card = join(root, 'src/Card.ts');
      writeFileSync(
        card,
        readFileSync(card, 'utf8').replace(
          'initStyles(){}',
          `initStyles(){}\n      ${hook}(){this.state.count = 99;}`
        )
      );
      await expect(build({ root, target })).rejects.toThrow(
        new RegExp(`Card\\.ts: \\d+:\\d+.*生命周期 ${hook}`)
      );
      expect(readFileSync(marker, 'utf8')).toBe('old lifecycle output');
      expect(readFileSync(output, 'utf8')).toBe(before);
    }
  );
}

it.each(['app-ios', 'app-android', 'app-harmony'] as const)(
  'accepts empty lifecycle hooks and unused business methods on %s',
  async (target) => {
    const root = fixture();
    const card = join(root, 'src/Card.ts');
    writeFileSync(
      card,
      readFileSync(card, 'utf8').replace(
        'initStyles(){}',
        `initStyles(){} beforeMount(){} onMounted(){} beforeUpdate(){} onUpdated(){} onPropsChange(){} beforeUnmount(){} onUnmounted(){} onErrorCaptured(){} unusedBusinessMethod(){return fetch('https://example.test');}`
      )
    );
    const result = await build({ root, target });
    expect(
      result.assetsBuilt.some((path) => /\.(swift|kt|ets)$/.test(path))
    ).toBe(true);
  }
);

it('accepts an empty selected override of a nonempty parent lifecycle hook', async () => {
  const root = fixture();
  const card = join(root, 'src/Card.ts');
  const variants = join(root, 'src/Variants.ts');
  writeFileSync(
    card,
    readFileSync(card, 'utf8').replace(
      'initStyles(){}',
      'initStyles(){} beforeMount(){this.state.count=99;}'
    )
  );
  writeFileSync(
    variants,
    readFileSync(variants, 'utf8').replace(
      'export class IosCard extends Card {',
      'export class IosCard extends Card { beforeMount(){}'
    )
  );
  const result = await build({ root, target: 'app-ios' });
  expect(
    readFileSync(
      result.assetsBuilt.find((path) => path.endsWith('ContentView.swift'))!,
      'utf8'
    )
  ).toContain('c1_s0_count: Int = 3');
});
