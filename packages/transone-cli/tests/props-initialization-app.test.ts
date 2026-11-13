import { afterEach, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { analyzeNativeScreen } from '../src/app/analyze';
import type { NativeAction, NativeNode } from '../src/app/types';
import { resolveConfig } from '../src/config';

const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true }))
);

function fixture(source: string, props = '{}'): string {
  const root = mkdtempSync(join(tmpdir(), 'native-props-initialization-'));
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
    `import {createApp} from 'transone';import {App} from './App';createApp({root:App,rootProps:${props}});`
  );
  writeFileSync(join(root, 'src/App.ts'), source);
  return root;
}

function flatten(node: NativeNode): NativeNode[] {
  return [
    node,
    ...(node.kind === 'container' ? node.children.flatMap(flatten) : []),
  ];
}

it.each(['app-ios', 'app-android', 'app-harmony'] as const)(
  '%s preserves optional-chain short circuit for props fields and initial state',
  async (target) => {
    const root = fixture(
      `import {BaseComponent,h} from 'transone';export class App extends BaseComponent {seed=this.props.config?.nested.count??5;initState(){return{count:this.seed,original:this.props.config?.nested.count??7};}initStyles(){}render(){return h('main',{},[h('text',{},[this.seed,this.state.count])]);}}`
    );
    const config = await resolveConfig({ root, target });
    const screen = await analyzeNativeScreen(join(root, 'src/main.ts'), config);
    expect(screen.state.map((entry) => entry.value)).toEqual([5, 7]);
  }
);

it('rejects module lexical this instead of resolving it against component props', async () => {
  const root = fixture(
    `import {BaseComponent,h} from 'transone';const BROKEN=this.props.seed;export class App extends BaseComponent {initState(){return {count:BROKEN};}initStyles(){}render(){return h('main',{},[]);}}`,
    '{seed:3}'
  );
  const config = await resolveConfig({ root, target: 'app-ios' });
  await expect(
    analyzeNativeScreen(join(root, 'src/main.ts'), config)
  ).rejects.toThrow(/模块|this|常量/);
});

it.each(['app-ios', 'app-android', 'app-harmony'] as const)(
  '%s evaluates inherited fields and initial state from the same root props snapshot',
  async (target) => {
    const root = fixture(
      `import {BaseComponent,h} from 'transone';
      class Parent extends BaseComponent {
        seed=this.props.seed??2;earlier=this.seed;propsRoot=this.props;config=this.props.config;
        initState(){return {parent:this.seed};}initStyles(){}
      }
      export class App extends Parent {
        seed=this.earlier+1;
        initState(){return {...super.initState(),...this.props.counts,
          zero:this.props.zero??5,flag:this.props.flag??true,empty:this.props.empty??'fallback',
          nullable:this.props.nullable??'default',missing:this.props.missing??9,
          explicit:this.props.explicit??10,config:this.config.label,
          captured:this.propsRoot.seed,list:this.props.list[0],nested:this.props.config.nested.amount};}
        render(){return h('main',{},[h('text',{},[this.seed,this.earlier,this.propsRoot.seed,this.config.label])]);}
      }`,
      `{seed:4,counts:{parent:99},zero:0,flag:false,empty:'',nullable:null,explicit:undefined,
        config:{label:'config',nested:{amount:7}},list:['first',2]}`
    );
    const config = await resolveConfig({ root, target });
    const screen = await analyzeNativeScreen(join(root, 'src/main.ts'), config);
    expect(screen.state.map((entry) => entry.value)).toEqual([
      99,
      0,
      false,
      '',
      'default',
      9,
      10,
      'config',
      4,
      'first',
      7,
    ]);
    const text = flatten(screen.root).find((node) => node.kind === 'text');
    expect(text?.kind === 'text' && text.parts).toEqual([
      { kind: 'literal', value: '5' },
      { kind: 'literal', value: '4' },
      { kind: 'literal', value: '4' },
      { kind: 'literal', value: 'config' },
    ]);
  }
);

it('reads props in initState even when the component declares no fields', async () => {
  const root = fixture(
    `import {BaseComponent,h} from 'transone';export class App extends BaseComponent {
    initState(){return {count:(this.props.seed??2)+1,missing:this.props.absent??'default'};}initStyles(){}
    render(){return h('main',{},[]);}
  }`,
    '{seed:0}'
  );
  const config = await resolveConfig({ root, target: 'app-ios' });
  const screen = await analyzeNativeScreen(join(root, 'src/main.ts'), config);
  expect(screen.state.map((entry) => entry.value)).toEqual([1, 'default']);
});

it('supports returning scalar props as initial state without copying field aliases', async () => {
  const root = fixture(
    `import {BaseComponent,h} from 'transone';export class App extends BaseComponent {
    original=this.props;initState(){return this.props;}initStyles(){}
    render(){return h('main',{},[h('text',{},[this.original.count,this.state.count])]);}
  }`,
    '{count:3}'
  );
  const config = await resolveConfig({ root, target: 'app-ios' });
  const screen = await analyzeNativeScreen(join(root, 'src/main.ts'), config);
  expect(screen.state.map((entry) => entry.value)).toEqual([3]);
  const text = flatten(screen.root).find((node) => node.kind === 'text');
  expect(text?.kind === 'text' && text.parts).toEqual([
    { kind: 'state', key: screen.state[0].key },
    { kind: 'state', key: screen.state[0].key },
  ]);
});

it('rejects state writes when the original props object is also the state root', async () => {
  const root = fixture(
    `import {BaseComponent,h} from 'transone';export class App extends BaseComponent {
    initState(){return this.props;}initStyles(){}change(){this.state.count=4;}
    render(){return h('main',{},[h('text',{},[this.props.count]),h('button',{},['change'],{click:()=>this.change()})]);}
  }`,
    '{count:3}'
  );
  const config = await resolveConfig({ root, target: 'app-ios' });
  await expect(
    analyzeNativeScreen(join(root, 'src/main.ts'), config)
  ).rejects.toThrow(/props.*state.*根|props.*state.*共享/);
});

it('keeps fields and child state at their initial props while direct props remain live', async () => {
  const root =
    fixture(`import {BaseComponent,h,createComponent} from 'transone';
    class Child extends BaseComponent {
      captured=this.props.seed;rootSnapshot=this.props;configSnapshot=this.props.config;
      initState(){return {count:this.props.seed+1};}initStyles(){}
      render(){return h('main',{},[h('text',{},[this.captured,this.rootSnapshot.seed,this.configSnapshot.label,this.props.seed,this.state.count])]);}
    }
    export class App extends BaseComponent {
      initState(){return {seed:4};}initStyles(){}change(){this.state.seed=12;}
      render(){return h('main',{},[
        createComponent(Child,{seed:this.state.seed,config:{label:'first'}}),
        createComponent(Child,{seed:9,config:{label:'second'}}),
        h('button',{},['change'],{click:()=>this.change()})]);}
    }`);
  const config = await resolveConfig({ root, target: 'app-android' });
  const screen = await analyzeNativeScreen(join(root, 'src/main.ts'), config);
  expect(screen.state.map((entry) => entry.value)).toEqual([4, 5, 10]);
  const nodes = flatten(screen.root);
  const texts = nodes.filter((node) => node.kind === 'text');
  expect(texts[0].parts).toEqual([
    { kind: 'literal', value: '4' },
    { kind: 'literal', value: '4' },
    { kind: 'literal', value: 'first' },
    { kind: 'state', key: screen.state[0].key },
    { kind: 'state', key: screen.state[1].key },
  ]);
  expect(texts[1].parts.slice(0, 4)).toEqual([
    { kind: 'literal', value: '9' },
    { kind: 'literal', value: '9' },
    { kind: 'literal', value: 'second' },
    { kind: 'literal', value: '9' },
  ]);
  const button = nodes.find((node) => node.kind === 'button');
  const values = Object.fromEntries(
    screen.state.map((entry) => [entry.key, entry.value])
  );
  function run(action: NativeAction): void {
    if (action.kind === 'sequence') action.actions.forEach(run);
    else if (action.kind === 'increment')
      values[action.key] = Number(values[action.key]) + action.by;
    else if (action.kind === 'set-literal') values[action.key] = action.value;
    else throw new Error('This static fixture must not contain runtime actions');
  }
  if (!button || button.kind !== 'button')
    throw new Error('Missing change button');
  run(button.action);
  expect(Object.values(values)).toEqual([12, 5, 10]);
});

it.each([
  [
    'nested dynamic props',
    `render(){return h('main',{},[createComponent(Child,{config:{count:this.state.count}})]);}`,
  ],
  [
    'dynamic render props expression',
    `render(){return h('main',{},[createComponent(Child,{seed:this.state.count})]);}`,
  ],
  [
    'dynamic style props expression',
    `render(){return h('main',{},[createComponent(Child,{seed:this.state.count})]);}`,
  ],
  [
    'dynamic action props expression',
    `render(){return h('main',{},[createComponent(Child,{seed:this.state.count})]);}`,
  ],
  [
    'mixed field and dynamic props expression',
    `render(){return h('main',{},[createComponent(Child,{seed:this.state.count})]);}`,
  ],
] as const)(
  'rejects %s instead of freezing its initial value',
  async (kind, render) => {
    const consumer =
      kind === 'mixed field and dynamic props expression'
        ? `h('text',{},[this.captured+this.props.seed])`
        : kind === 'dynamic render props expression'
          ? `h('text',{},[this.props.seed+1])`
          : kind === 'dynamic style props expression'
            ? `h('text',{style:{fontSize:this.props.seed+1}},['text'])`
            : kind === 'dynamic action props expression'
              ? `h('button',{},['change'],{click:()=>this.change()})`
              : `h('text',{},['text'])`;
    const root =
      fixture(`import {BaseComponent,h,createComponent} from 'transone';
    class Child extends BaseComponent {captured=2;initState(){return {count:1};}initStyles(){}
      change(){this.state.count=this.props.seed+1;}
      render(){return h('main',{},[${consumer}]);}}
    export class App extends BaseComponent {initState(){return {count:3};}initStyles(){}${render}}
  `);
    const config = await resolveConfig({ root, target: 'app-ios' });
    await expect(
      analyzeNativeScreen(join(root, 'src/main.ts'), config)
    ).rejects.toThrow(/原生|初始化表达式|state|props/);
  }
);

it.each([
  ['getter', '{get seed(){throw new Error("business getter executed");}}'],
  ['function call', '{seed:calculate()}'],
] as const)(
  'rejects a props %s without executing business JavaScript',
  async (_kind, props) => {
    const root = fixture(
      `import {BaseComponent,h} from 'transone';export class App extends BaseComponent {
    initial=this.props.seed;initState(){return {count:1};}initStyles(){}render(){return h('main',{},[]);}
  }`,
      props
    );
    const config = await resolveConfig({ root, target: 'app-ios' });
    await expect(
      analyzeNativeScreen(join(root, 'src/main.ts'), config)
    ).rejects.toThrow(/静态|实例字段|初始化表达式|原生表达式/);
  }
);

it.each(['null', 'undefined', '{nested:1}', '[1]'])(
  'rejects props value %s when it reaches native scalar state',
  async (value) => {
    const root = fixture(
      `import {BaseComponent,h} from 'transone';export class App extends BaseComponent {
      initState(){return {count:this.props.value};}initStyles(){}render(){return h('main',{},[]);}
    }`,
      `{value:${value}}`
    );
    const config = await resolveConfig({ root, target: 'app-ios' });
    await expect(
      analyzeNativeScreen(join(root, 'src/main.ts'), config)
    ).rejects.toThrow(/原生.*值|原生表达式/);
  }
);
