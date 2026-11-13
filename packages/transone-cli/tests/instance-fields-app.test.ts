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
import { analyzeNativeScreen } from '../src/app/analyze';
import type { NativeAction, NativeNode } from '../src/app/types';
import { build } from '../src/build';
import { resolveConfig } from '../src/config';

const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true }))
);

function fixture(source?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'native-instance-fields-'));
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
    `import {createApp} from 'transone';import {App} from './App';createApp({root:App});`
  );
  writeFileSync(
    join(root, 'src/constants.ts'),
    `export const INITIAL=3;export const COLOR='purple';`
  );
  writeFileSync(
    join(root, 'src/Parent.ts'),
    `
    import {BaseComponent} from 'transone';import {INITIAL,COLOR} from './constants';
    export class Parent extends BaseComponent {
      seed=INITIAL;captured=this.seed;label='parent';cleared=9;
      theme={color:COLOR,fontSize:12};
      initStyles(){}
    }
  `
  );
  writeFileSync(
    join(root, 'src/Card.ts'),
    `
    import {h} from 'transone';import {Parent} from './Parent';
    const INITIAL=90;const COLOR='wrong-owner';
    export class Card extends Parent {
      declare label:string;
      seed=this.captured+4;cleared:number;fallback=this.cleared??8;
      step=this.seed-this.captured;tag='text';
      initState(){return {count:this.seed,captured:this.captured,fallback:this.fallback};}
      increment(){this.state.count+=this.step;this.state.captured=this.fallback;}
      render(){return h('main',{},[
        h(this.tag,{style:{color:this.theme.color,fontSize:this.theme.fontSize}},[this.label,this.seed,this.props.title,' Count: {{count}}']),
        h('button',{},['+'],{click:()=>this.increment()})
      ]);}
    }
  `
  );
  writeFileSync(
    join(root, 'src/App.ts'),
    source ??
      `
    import {BaseComponent,h,createComponent} from 'transone';import {Card} from './Card';
    export class App extends BaseComponent {
      initState(){return {title:'live'};}initStyles(){}
      rename(){this.state.title='changed';}
      render(){return h('main',{},[
        createComponent(Card,{title:this.state.title}),createComponent(Card,{title:'literal'}),
        h('button',{},['rename'],{click:()=>this.rename()})
      ]);}
    }
  `
  );
  return root;
}

function flatten(node: NativeNode): NativeNode[] {
  return [
    node,
    ...(node.kind === 'container' ? node.children.flatMap(flatten) : []),
  ];
}

it.each(['app-ios', 'app-android', 'app-harmony'] as const)(
  '%s initializes inherited fields in order and keeps native instances independent',
  async (target) => {
    const root = fixture();
    const config = await resolveConfig({ root, target });
    const screen = await analyzeNativeScreen(join(root, 'src/main.ts'), config);
    expect(screen.state.map((item) => item.value)).toEqual([
      'live',
      7,
      3,
      8,
      7,
      3,
      8,
    ]);
    const nodes = flatten(screen.root);
    const texts = nodes.filter((node) => node.kind === 'text');
    expect(texts.map((node) => node.style)).toEqual([
      { color: 'purple', fontSize: 12 },
      { color: 'purple', fontSize: 12 },
    ]);
    expect(texts[0].parts.slice(0, 2)).toEqual([
      { kind: 'literal', value: 'parent' },
      { kind: 'literal', value: '7' },
    ]);
    const buttons = nodes.filter((node) => node.kind === 'button');
    const [first, second, rename] = buttons.map((node) => node.action);
    expect(first).toMatchObject({
      kind: 'sequence',
      actions: [
        { kind: 'increment', by: 4 },
        { kind: 'set-literal', value: 8 },
      ],
    });
    const values = Object.fromEntries(
      screen.state.map((item) => [item.key, item.value])
    );
    function run(action: NativeAction): void {
      if (action.kind === 'sequence') action.actions.forEach(run);
      else if (action.kind === 'increment')
        values[action.key] = Number(values[action.key]) + action.by;
      else if (action.kind === 'set-literal') values[action.key] = action.value;
      else throw new Error('This static fixture must not contain runtime actions');
    }
    run(first);
    expect(Object.values(values)).toEqual(['live', 11, 8, 8, 7, 3, 8]);
    expect(first).not.toEqual(second);
    run(rename);
    expect(rename.kind).toBe('set-literal');
    if (rename.kind !== 'set-literal')
      throw new Error('Expected literal rename');
    expect(texts[0].parts).toContainEqual({ kind: 'state', key: rename.key });
    expect(texts[1].parts).toContainEqual({
      kind: 'literal',
      value: 'literal',
    });
    expect(values[rename.key]).toBe('changed');

    const result = await build({ root, target });
    const output = result.assetsBuilt
      .filter((path) => /\.(swift|kt|ets)$/.test(path))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n');
    expect(output).toContain('parent');
    expect(output).toContain('+= 4');
    for (const item of screen.state) expect(output).toContain(item.key);
    expect(output).not.toContain('wrong-owner');
  }
);

it.each([
  ['side effect', 'value=calculate();', /实例字段|调用|表达式/],
  ['early state', 'value=this.state.count;', /state|实例字段/],
  ['props function call', 'value=this.props.make();', /props|实例字段|表达式/],
  ['reserved state', 'state={count:1};', /state|保留|实例字段/],
  ['method shadow', 'render=1;', /render|方法|实例字段/],
] as const)(
  'rejects unsupported %s without evaluating JavaScript',
  async (_name, field, error) => {
    const root = fixture(`import {BaseComponent,h} from 'transone';
    function calculate(){throw new Error('must not execute');}
    export class App extends BaseComponent {
      ${field}
      initState(){return {count:1};}initStyles(){}
      render(){return h('main',{},[h('text',{},['ok'])]);}
    }`);
    const config = await resolveConfig({ root, target: 'app-ios' });
    await expect(
      analyzeNativeScreen(join(root, 'src/main.ts'), config)
    ).rejects.toThrow(error);
  }
);

it.each([
  ['undefined', 'value:number;', 'this.value'],
  ['object', 'value={nested:1};', 'this.value'],
  ['null', 'value=null;', 'this.value'],
  ['nonfinite', 'value=1/0;', 'this.value'],
] as const)(
  'rejects %s at a scalar native state boundary',
  async (_name, field, value) => {
    const root =
      fixture(`import {BaseComponent,h} from 'transone';export class App extends BaseComponent {
    ${field}initState(){return {count:${value}};}initStyles(){}
    render(){return h('main',{},[]);}
  }`);
    const config = await resolveConfig({ root, target: 'app-ios' });
    await expect(
      analyzeNativeScreen(join(root, 'src/main.ts'), config)
    ).rejects.toThrow(/原生表达式|原生.*值|有限|数字|实例字段/);
  }
);

it.each([
  'this.value=2;this.state.count=this.value;',
  'this.value.nested=2;this.state.count=this.value.nested;',
  'const alias=this.value;alias.nested=2;this.state.count=alias.nested;',
] as const)('rejects reachable field mutation: %s', async (action) => {
  const root =
    fixture(`import {BaseComponent,h} from 'transone';export class App extends BaseComponent {
    value={nested:1};initState(){return {count:1};}initStyles(){}
    change(){${action}}
    render(){return h('main',{},[h('button',{},['change'],{click:()=>this.change()})]);}
  }`);
  const config = await resolveConfig({ root, target: 'app-ios' });
  await expect(
    analyzeNativeScreen(join(root, 'src/main.ts'), config)
  ).rejects.toThrow(/原生编译|实例字段/);
});

it('supports a field object as the complete initial state', async () => {
  const root =
    fixture(`import {BaseComponent,h} from 'transone';export class App extends BaseComponent {
    defaults={count:3,enabled:true,title:'field state'};
    initState(){return this.defaults;}initStyles(){}
    render(){return h('main',{},[h('text',{},['{{title}}'])]);}
  }`);
  const config = await resolveConfig({ root, target: 'app-ios' });
  const screen = await analyzeNativeScreen(join(root, 'src/main.ts'), config);
  expect(screen.state.map((item) => item.value)).toEqual([
    3,
    true,
    'field state',
  ]);
  const texts = flatten(screen.root).filter((node) => node.kind === 'text');
  expect(texts[0].parts).toEqual([{ kind: 'state', key: screen.state[2].key }]);
});

it('supports field object state spreads with normal override order', async () => {
  const root = fixture(`import {BaseComponent,h} from 'transone';
    class ParentApp extends BaseComponent {
      initState(){return {count:1,title:'base'};}initStyles(){}
    }
    export class App extends ParentApp {
      defaults={count:4,enabled:true};
      initState(){return {...super.initState(),...this.defaults,count:8};}
      render(){return h('main',{},[h('text',{},['{{count}}'])]);}
    }
  `);
  const config = await resolveConfig({ root, target: 'app-android' });
  const screen = await analyzeNativeScreen(join(root, 'src/main.ts'), config);
  expect(screen.state.map((item) => item.value)).toEqual([8, 'base', true]);
});

it('supports a field object as an inline native style', async () => {
  const root =
    fixture(`import {BaseComponent,h} from 'transone';export class App extends BaseComponent {
    theme={color:'purple',fontSize:'12px',padding:8};
    initState(){return {};}initStyles(){}
    render(){return h('main',{style:this.theme},[h('text',{},['styled'])]);}
  }`);
  const config = await resolveConfig({ root, target: 'app-harmony' });
  const screen = await analyzeNativeScreen(join(root, 'src/main.ts'), config);
  expect(screen.root.style).toEqual({
    color: 'purple',
    fontSize: 12,
    padding: 8,
  });
});

it('keeps field aliases of the state root live in native text bindings', async () => {
  const root =
    fixture(`import {BaseComponent,h} from 'transone';export class App extends BaseComponent {
    defaults={count:1};alias=this.defaults;
    initState(){return this.defaults;}initStyles(){}
    tap(){this.state.count+=1;}
    render(){return h('main',{},[
      h('text',{},[this.defaults.count,this.alias.count,this.state.count]),
      h('button',{},['tap'],{click:()=>this.tap()})
    ]);}
  }`);
  const config = await resolveConfig({ root, target: 'app-ios' });
  const screen = await analyzeNativeScreen(join(root, 'src/main.ts'), config);
  const nodes = flatten(screen.root);
  const text = nodes.find((node) => node.kind === 'text');
  const button = nodes.find((node) => node.kind === 'button');
  const key = screen.state[0].key;
  expect(text?.kind === 'text' && text.parts).toEqual([
    { kind: 'state', key },
    { kind: 'state', key },
    { kind: 'state', key },
  ]);
  expect(button?.kind === 'button' && button.action).toEqual({
    kind: 'increment',
    key,
    by: 1,
  });
  const state = { [key]: 1 };
  if (
    button?.kind !== 'button' ||
    button.action.kind !== 'increment' ||
    text?.kind !== 'text'
  )
    throw new Error('Expected live count and increment');
  state[button.action.key] += button.action.by;
  expect(
    text.parts.map((part) =>
      part.kind === 'state' ? state[part.key] : part.value
    )
  ).toEqual([2, 2, 2]);
});

it.each([
  [
    'style',
    "h('main',{style:{fontSize:this.defaults.count}},[])",
    'this.state.count+=1;',
  ],
  [
    'action RHS',
    "h('main',{},[h('button',{},['tap'],{click:()=>this.tap()})])",
    'this.state.count+=this.defaults.count;',
  ],
] as const)(
  'rejects a live state root field alias in %s',
  async (_label, render, action) => {
    const root =
      fixture(`import {BaseComponent,h} from 'transone';export class App extends BaseComponent {
    defaults={count:1};initState(){return this.defaults;}initStyles(){}
    tap(){${action}}
    render(){return ${render};}
  }`);
    const config = await resolveConfig({ root, target: 'app-ios' });
    await expect(
      analyzeNativeScreen(join(root, 'src/main.ts'), config)
    ).rejects.toThrow(/state.*别名|别名.*state/);
  }
);

it('does not alias a parent state object after a child spreads it into a new root', async () => {
  const root = fixture(`import {BaseComponent,h} from 'transone';
    class ParentApp extends BaseComponent {
      defaults={count:1};initState(){return this.defaults;}initStyles(){}
    }
    export class App extends ParentApp {
      initState(){return {...super.initState()};}
      tap(){this.state.count+=this.defaults.count;}
      render(){return h('main',{},[
        h('text',{},[this.defaults.count,this.state.count]),
        h('button',{},['tap'],{click:()=>this.tap()})
      ]);}
    }
  `);
  const config = await resolveConfig({ root, target: 'app-ios' });
  const screen = await analyzeNativeScreen(join(root, 'src/main.ts'), config);
  const nodes = flatten(screen.root);
  const text = nodes.find((node) => node.kind === 'text');
  const button = nodes.find((node) => node.kind === 'button');
  expect(text?.kind === 'text' && text.parts).toEqual([
    { kind: 'literal', value: '1' },
    { kind: 'state', key: screen.state[0].key },
  ]);
  expect(button?.kind === 'button' && button.action).toEqual({
    kind: 'increment',
    key: screen.state[0].key,
    by: 1,
  });
});

it('keeps a nested field path to the returned state root live', async () => {
  const root =
    fixture(`import {BaseComponent,h} from 'transone';export class App extends BaseComponent {
    defaults={inner:{count:1}};
    initState(){return this.defaults.inner;}initStyles(){}
    render(){return h('main',{},[h('text',{},[this.defaults.inner.count])]);}
  }`);
  const config = await resolveConfig({ root, target: 'app-ios' });
  const screen = await analyzeNativeScreen(join(root, 'src/main.ts'), config);
  const text = flatten(screen.root).find((node) => node.kind === 'text');
  expect(text?.kind === 'text' && text.parts).toEqual([
    { kind: 'state', key: screen.state[0].key },
  ]);
});

it('rejects a shared module object as the native state root', async () => {
  const root =
    fixture(`import {BaseComponent,h} from 'transone';import {DEFAULTS} from './constants';
    export class App extends BaseComponent {
      defaults=DEFAULTS;initState(){return this.defaults;}initStyles(){}
      render(){return h('main',{},[h('text',{},[this.state.count])]);}
    }
  `);
  writeFileSync(
    join(root, 'src/constants.ts'),
    'export const DEFAULTS={count:1};'
  );
  const config = await resolveConfig({ root, target: 'app-ios' });
  await expect(
    analyzeNativeScreen(join(root, 'src/main.ts'), config)
  ).rejects.toThrow(/共享模块对象不能作为原生state根/);
});

it('copies primitive entries from a shared module object into independent native state', async () => {
  const root =
    fixture(`import {BaseComponent,h} from 'transone';import {DEFAULTS} from './constants';
    export class App extends BaseComponent {
      defaults=DEFAULTS;initState(){return {...this.defaults};}initStyles(){}
      tap(){this.state.count+=1;}
      render(){return h('main',{},[
        h('text',{},[this.defaults.count,this.state.count]),
        h('button',{},['tap'],{click:()=>this.tap()})
      ]);}
    }
  `);
  writeFileSync(
    join(root, 'src/constants.ts'),
    'export const DEFAULTS={count:1};'
  );
  const config = await resolveConfig({ root, target: 'app-ios' });
  const screen = await analyzeNativeScreen(join(root, 'src/main.ts'), config);
  const nodes = flatten(screen.root);
  const text = nodes.find((node) => node.kind === 'text');
  const button = nodes.find((node) => node.kind === 'button');
  expect(screen.state.map((item) => item.value)).toEqual([1]);
  expect(text?.kind === 'text' && text.parts).toEqual([
    { kind: 'literal', value: '1' },
    { kind: 'state', key: screen.state[0].key },
  ]);
  expect(button?.kind === 'button' && button.action).toEqual({
    kind: 'increment',
    key: screen.state[0].key,
    by: 1,
  });
});
