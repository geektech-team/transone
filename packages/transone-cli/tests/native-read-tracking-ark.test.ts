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
import { resolveConfig } from '../src/config';
import { nativeRuntimeSource } from '../src/app/runtime-codegen';
import type { NativeScreen } from '../src/app/types';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
async function analyze(source: string): Promise<NativeScreen> {
  const root = mkdtempSync(join(tmpdir(), 'transone-read-tracking-ark-'));
  roots.push(root);
  mkdirSync(join(root, 'node_modules'));
  mkdirSync(join(root, 'src'));
  symlinkSync(
    resolve(import.meta.dir, '../../transone'),
    join(root, 'node_modules/transone'),
    'dir'
  );
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        moduleResolution: 'Bundler',
        module: 'ESNext',
        paths: {
          transone: [resolve(import.meta.dir, '../../transone/lib/index.ts')],
        },
      },
    })
  );
  writeFileSync(join(root, 'src/main.ts'), source);
  return analyzeNativeScreen(
    join(root, 'src/main.ts'),
    await resolveConfig({ root, target: 'app-harmony' })
  );
}
function execute(screen: NativeScreen) {
  const code = new Bun.Transpiler({ loader: 'ts' }).transformSync(
    nativeRuntimeSource(screen, 'ark')
  );
  return new Function(code + '\nreturn {TnRuntime,TnValue};')();
}
const prelude = `import {BaseComponent,Emit,WatchProps,h,createApp,createComponent} from 'transone';`;

it.each([
  [
    'A to B to A references',
    '{data:{n:1}}',
    'String(this.state.data.n)',
    'const original=this.state.data;this.state.data={n:2};this.state.data=original;',
    '{ok:true}',
    1,
  ],
  [
    'nested A to B to A references',
    '{data:{nested:{n:1}}}',
    'String(this.state.data.nested.n)',
    'const original=this.state.data.nested;this.state.data.nested={n:2};this.state.data.nested=original;',
    '{ok:true}',
    1,
  ],
  [
    'array numeric writes invalidating length',
    '{data:[1]}',
    'String(this.state.data.length)',
    'this.state.data[0]=2;',
    '{ok:true}',
    1,
  ],
  [
    'object spread ignoring an unobserved added key',
    '{data:{n:1}}',
    "''",
    'this.state.data.extra=2;',
    '{...this.state.data}',
    0,
  ],
  [
    'array spread ignoring an ordinary property',
    '{data:[1]}',
    "''",
    'this.state.data.extra=2;',
    '[...this.state.data]',
    0,
  ],
  [
    'array spread ignoring a hole filled with undefined',
    '{data:[,1]}',
    "''",
    'this.state.data[0]=undefined;',
    '[...this.state.data]',
    0,
  ],
  [
    'String(array) reading joined array indices',
    '{data:{items:[1]}}',
    'String(this.state.data.items)',
    'this.state.data.items[0]++;',
    '{ok:true}',
    1,
  ],
  [
    'object spread of an array ignoring a new index',
    '{data:[1]}',
    "''",
    'this.state.data[1]=2;',
    '{...this.state.data}',
    0,
  ],
  [
    'object spread of an array reading an existing index',
    '{data:[1]}',
    "''",
    'this.state.data[0]=2;',
    '{...this.state.data}',
    1,
  ],
  [
    'array spread reading a new index through length',
    '{data:[1]}',
    "''",
    'this.state.data[1]=2;',
    '[...this.state.data]',
    1,
  ],
  [
    'length truncation leaving index-only subscribers clean',
    '{data:[1,2]}',
    'String(this.state.data[1])',
    'this.state.data.length=1;',
    '{ok:true}',
    0,
  ],
  [
    'noncanonical numeric array keys invalidating length',
    '{data:[1]}',
    'String(this.state.data.length)',
    "this.state.data['01']=2;",
    '{ok:true}',
    1,
  ],
  [
    'String(array) reading nested arrays',
    '{data:{items:[[1]]}}',
    'String(this.state.data.items)',
    'this.state.data.items[0][0]++;',
    '{ok:true}',
    1,
  ],
  [
    'object spread recording an intermediate scalar write',
    '{data:{n:1}}',
    "''",
    'this.state.data.n=2;this.state.data.n=1;',
    '{...this.state.data}',
    1,
  ],
  [
    'direct object props staying staged when an unread length truncates their index',
    '{data:[{n:1},{n:2}]}',
    "''",
    'this.state.data.length=1;',
    'this.state.data[1]',
    0,
  ],
  [
    'Number(array) reading valueOf before joining its items',
    '{data:[1]}',
    'String(Number(this.state.data))',
    'this.state.data.valueOf=1;',
    '{ok:true}',
    1,
  ],
  [
    'array arithmetic reading valueOf before joining its items',
    '{data:[1]}',
    "String(this.state.data+'')",
    'this.state.data.valueOf=1;',
    '{ok:true}',
    1,
  ],
] as const)(
  'matches Core commits for %s',
  async (_label, initial, text, mutation, prop, expected) => {
    const screen = await analyze(`${prelude}
      class Child extends BaseComponent {
        initState(){return {watches:0};}initStyles(){}
        @WatchProps('value') changed(){this.state.watches++;}
        render(){return h('view',{},[]);}
      }
      class App extends BaseComponent {
        initState(){return ${initial};}initStyles(){}
        @Emit('none') mutate(){${mutation}}
        @Emit('none') noop(){}
        render(){return h('view',{},[h('text',{},[${text}]),createComponent({component:Child,props:{value:${prop}}})]);}
      }createApp({root:App}).mount();`);
    const [app, child] = screen.program!.instances;
    const watches = screen.state.find((value) =>
      value.key.endsWith('_watches')
    )!.key;
    const { TnRuntime } = execute(screen);
    const runtime = new TnRuntime();
    runtime.mount();
    const initialValue = runtime.prop(child.id, 'value');
    runtime.invoke(app.id, 'noop', []);
    expect(runtime.same(runtime.prop(child.id, 'value'), initialValue)).toBe(
      true
    );
    runtime.invoke(app.id, 'mutate', []);
    expect(runtime.getState(watches).number).toBe(expected);
    expect(runtime.same(runtime.prop(child.id, 'value'), initialValue)).toBe(
      expected === 0
    );
    const committedValue = runtime.prop(child.id, 'value');
    runtime.invoke(app.id, 'noop', []);
    expect(runtime.same(runtime.prop(child.id, 'value'), committedValue)).toBe(
      true
    );
    expect(runtime.getState(watches).number).toBe(expected);
  }
);

it('commits props from a fresh mount entered through an older action', async () => {
  const screen = await analyze(`${prelude}
    class Child extends BaseComponent {
      initState(){return {trace:''};}initStyles(){}
      @WatchProps('value') changed(next){this.state.trace+=next.n+';';}
      render(){return h('view',{},[]);}
    }
    class App extends BaseComponent {
      initState(){return {data:{n:1}};}initStyles(){}
      onMounted(){this.state.data={n:this.state.data.n+1};}
      @Emit('none') replace(){this.state.data={n:10};}
      @Emit('none') noop(){}
      render(){return h('view',{},[createComponent({component:Child,props:{value:this.state.data}})]);}
    }createApp({root:App}).mount();`);
  const [app, child] = screen.program!.instances;
  const trace = screen.state.find((value) => value.key.endsWith('_trace'))!.key;
  const data = screen.state.find((value) => value.key.endsWith('_data'))!.key;
  const { TnRuntime, TnValue } = execute(screen);
  const runtime = new TnRuntime();
  runtime.mount();
  let replaceMount = true;
  runtime.changed = () => {
    if (!replaceMount) return;
    replaceMount = false;
    runtime.unmount();
    runtime.mount();
  };
  runtime.invoke(app.id, 'replace', []);
  expect(runtime.member(runtime.getState(data), TnValue.str('n')).number).toBe(
    11
  );
  expect(
    runtime.same(runtime.prop(child.id, 'value'), runtime.getState(data))
  ).toBe(true);
  expect(runtime.getState(trace).text).toBe('2;11;');
  runtime.invoke(app.id, 'noop', []);
  expect(runtime.getState(trace).text).toBe('2;11;');
});

it('allocates fresh render literals on remount while keeping the first mount seed', async () => {
  const screen = await analyze(`${prelude}
    class Child extends BaseComponent {
      initState(){return {alias:this.props.value};}initStyles(){}
      @WatchProps('value',{immediate:true}) changed(){}
      render(){return h('view',{},[]);}
    }
    class App extends BaseComponent {
      initState(){return {count:0};}initStyles(){}
      @Emit('none') noop(){}
      render(){return h('view',{},[createComponent({component:Child,props:{value:{ok:true}}})]);}
    }createApp({root:App}).mount();`);
  const [app, child] = screen.program!.instances;
  const alias = screen.state.find((value) => value.key.endsWith('_alias'))!.key;
  const { TnRuntime } = execute(screen);
  const runtime = new TnRuntime();
  const seeded = runtime.prop(child.id, 'value');
  expect(runtime.same(runtime.getState(alias), seeded)).toBe(true);
  runtime.mount();
  expect(runtime.same(runtime.prop(child.id, 'value'), seeded)).toBe(true);
  runtime.unmount();
  runtime.mount();
  const remounted = runtime.prop(child.id, 'value');
  expect(runtime.same(remounted, seeded)).toBe(false);
  runtime.invoke(app.id, 'noop', []);
  expect(runtime.same(runtime.prop(child.id, 'value'), remounted)).toBe(true);
});

it('restores read capture after a conversion throws and recovers the next commit', async () => {
  const screen = await analyze(`${prelude}
    class Child extends BaseComponent {
      initState(){return {watches:0};}initStyles(){}
      @WatchProps('value') changed(){this.state.watches++;}
      render(){return h('view',{},[]);}
    }
    class App extends BaseComponent {
      initState(){return {data:[1]};}initStyles(){}
      @Emit('none') fail(){this.state.data={toString:1};}
      @Emit('none') recover(){this.state.data=[2];}
      @Emit('none') noop(){}
      render(){return h('view',{},[h('text',{},[String(this.state.data)]),createComponent({component:Child,props:{value:{ok:true}}})]);}
    }createApp({root:App}).mount();`);
  const [app, child] = screen.program!.instances;
  const watches = screen.state.find((value) =>
    value.key.endsWith('_watches')
  )!.key;
  const { TnRuntime } = execute(screen);
  const runtime = new TnRuntime();
  runtime.mount();
  const original = runtime.prop(child.id, 'value');
  expect(() => runtime.invoke(app.id, 'fail', [])).toThrow(
    'Cannot convert object to primitive value'
  );
  expect(runtime.readCapture).toBeUndefined();
  expect(runtime.same(runtime.prop(child.id, 'value'), original)).toBe(true);
  runtime.invoke(app.id, 'recover', []);
  const recovered = runtime.prop(child.id, 'value');
  expect(runtime.same(recovered, original)).toBe(false);
  expect(runtime.getState(watches).number).toBe(1);
  runtime.invoke(app.id, 'noop', []);
  expect(runtime.same(runtime.prop(child.id, 'value'), recovered)).toBe(true);
  expect(runtime.getState(watches).number).toBe(1);
});

it('tracks mutations through shared aliases across consecutive commits without cloning payloads', async () => {
  const screen = await analyze(`${prelude}
    class Child extends BaseComponent {
      initState(){return {watches:0,next:undefined,previous:undefined};}initStyles(){}
      @WatchProps('value') changed(next,previous){this.state.next=next;this.state.previous=previous;this.state.watches++;}
      render(){return h('view',{},[]);}
    }
    class App extends BaseComponent {
      initState(){const shared=[1];return {data:[shared,shared],alias:shared};}initStyles(){}
      @Emit('none') mutate(){this.state.alias[0]++;}
      @Emit('none') noop(){}
      render(){return h('view',{},[h('text',{},[String(this.state.data)]),createComponent({component:Child,props:{value:{items:this.state.data}}})]);}
    }createApp({root:App}).mount();`);
  const [app, child] = screen.program!.instances;
  const key = (suffix: string) =>
    screen.state.find((value) => value.key.endsWith(`_${suffix}`))!.key;
  const { TnRuntime, TnValue } = execute(screen);
  const runtime = new TnRuntime();
  runtime.mount();
  const data = runtime.getState(key('data'));
  expect(
    runtime.same(
      runtime.member(data, TnValue.num(0)),
      runtime.member(data, TnValue.num(1))
    )
  ).toBe(true);
  for (let count = 1; count <= 2; count++) {
    const previous = runtime.prop(child.id, 'value');
    runtime.invoke(app.id, 'mutate', []);
    const next = runtime.prop(child.id, 'value');
    expect(runtime.getState(key('watches')).number).toBe(count);
    expect(runtime.same(runtime.getState(key('previous')), previous)).toBe(
      true
    );
    expect(runtime.same(runtime.getState(key('next')), next)).toBe(true);
    expect(runtime.same(next, previous)).toBe(false);
    expect(runtime.same(runtime.member(next, TnValue.str('items')), data)).toBe(
      true
    );
    expect(
      runtime.same(
        runtime.member(previous, TnValue.str('items')),
        runtime.member(next, TnValue.str('items'))
      )
    ).toBe(true);
    runtime.invoke(app.id, 'noop', []);
    expect(runtime.getState(key('watches')).number).toBe(count);
    expect(runtime.same(runtime.prop(child.id, 'value'), next)).toBe(true);
  }
});
