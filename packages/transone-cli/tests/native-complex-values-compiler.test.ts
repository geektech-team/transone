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
import { NativeRuntime, type NativeRuntimeValue } from '../src/app/runtime';
import { nativeRuntimeSource } from '../src/app/runtime-codegen';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
async function analyze(source: string) {
  const root = mkdtempSync(join(tmpdir(), 'transone-complex-compiler-'));
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
    await resolveConfig({ root, target: 'app-ios' })
  );
}
const prelude = `import {BaseComponent,Emit,WatchProps,h,createApp,createComponent} from 'transone';`;

it.each([
  ['reference', '{n:1}', 'this.state.data', 'this.state.data.n++', 0],
  ['object spread', '{n:1}', '{...this.state.data}', 'this.state.data.n++', 1],
  ['array spread', '[1]', '[...this.state.data]', 'this.state.data[0]++', 1],
] as const)(
  'matches Core shallow render tracking for %s dependencies',
  async (_kind, initial, prop, mutate, expected) => {
    const screen = await analyze(`${prelude}
      class Child extends BaseComponent {
        initState(){return {watches:0};}initStyles(){}
        @WatchProps('value') changed(){this.state.watches++;}
        render(){return h('view',{},[h('text',{},[this.props.data.n])]);}
      }
      class App extends BaseComponent {
        initState(){return {data:${initial}};}initStyles(){}
        @Emit('none') mutate(){${mutate};}
        render(){return h('view',{},[createComponent({component:Child,props:{data:${prop},value:{ok:true}}})]);}
      }createApp({root:App}).mount();`);
    const [app, child] = screen.program!.instances;
    const runtime = new NativeRuntime(screen);
    runtime.mount();
    const initialValue = runtime.props(child.id).value;
    runtime.invoke(app.id, 'mutate');
    expect(runtime.state[screen.state[1].key]).toBe(expected);
    expect(runtime.props(child.id).value === initialValue).toBe(expected === 0);
    const code = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      nativeRuntimeSource(screen, 'ark')
    );
    const { TnRuntime } = new Function(code + '\nreturn {TnRuntime};')();
    const generated = new TnRuntime();
    generated.mount();
    const generatedInitial = generated.prop(child.id, 'value');
    generated.invoke(app.id, 'mutate', []);
    expect(generated.getState(screen.state[1].key).number).toBe(expected);
    expect(
      generated.same(generated.prop(child.id, 'value'), generatedInitial)
    ).toBe(expected === 0);
    if (expected === 1)
      expect(app.renderDependencies).toContainEqual({
        kind: 'revision',
        mode: _kind === 'object spread' ? 'object' : 'array',
        value: { kind: 'state', key: screen.state[0].key },
      });
  }
);

it.each([
  ['conditional', 'null', `this.state.data ? this.state.data.n : 'empty'`],
  ['and', 'null', 'this.state.data && this.state.data.n'],
  ['or', '{n:1}', 'this.state.data || this.state.backup.n'],
  ['nullish', '{n:1}', 'this.state.data ?? this.state.backup.n'],
] as const)(
  'keeps %s render dependency reads behind their original guard',
  async (_kind, initial, expression) => {
    const screen = await analyze(`${prelude}
    class Child extends BaseComponent {
      initState(){return {watches:0};}initStyles(){}
      @WatchProps('value') changed(){this.state.watches++;}
      render(){return h('view',{},[]);}
    }
    class App extends BaseComponent {
      initState(){return {data:${initial},backup:null,count:0};}initStyles(){}
      @Emit('none') noop(){}
      @Emit('none') touch(){this.state.count++;}
      render(){return h('view',{},[h('text',{},[${expression},this.state.count]),createComponent({component:Child,props:{value:{ok:true}}})]);}
    }createApp({root:App}).mount();`);
    const [app, child] = screen.program!.instances;
    const runtime = new NativeRuntime(screen);
    runtime.mount();
    const initialProp = runtime.props(child.id).value;
    runtime.invoke(app.id, 'noop');
    expect(runtime.props(child.id).value).toBe(initialProp);
    runtime.invoke(app.id, 'touch');
    expect(runtime.state[screen.state[3].key]).toBe(1);
  }
);

it.each([
  ['===', true],
  ['!==', false],
  ['==', true],
  ['!=', false],
] as const)(
  'does not coerce object operands while initializing %s props',
  async (operator, expected) => {
    const screen = await analyze(`${prelude}
      class Child extends BaseComponent {
        initState(){return {watches:0};}initStyles(){}
        @WatchProps('value') changed(){this.state.watches++;}
        render(){return h('view',{},[]);}
      }
      class App extends BaseComponent {
        initState(){return {data:{toString:1}};}initStyles(){}
        render(){return h('view',{},[createComponent({component:Child,props:{value:this.state.data${operator}this.state.data}})]);}
      }createApp({root:App}).mount();`);
    const runtime = new NativeRuntime(screen);
    runtime.mount();
    expect(runtime.props(screen.program!.instances[1].id).value).toBe(expected);
  }
);

it('keeps own prototype-named data keys when seeding a spread render prop', async () => {
  const screen = await analyze(`${prelude}
    class Child extends BaseComponent {
      initState(){return {alias:this.props.value};}initStyles(){}
      @WatchProps('value') changed(){}
      render(){return h('view',{},[]);}
    }
    class App extends BaseComponent {
      initState(){return {data:{['__proto__']:{x:1}}};}initStyles(){}
      render(){return h('view',{},[createComponent({component:Child,props:{value:{...this.state.data}}})]);}
    }createApp({root:App}).mount();`);
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  const value = runtime.props(screen.program!.instances[1].id).value as Record<
    string,
    NativeRuntimeValue
  >;
  expect(Object.prototype.hasOwnProperty.call(value, '__proto__')).toBe(true);
  expect(value['__proto__']).toEqual({ x: 1 });
  expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  expect(runtime.state[screen.state[1].key]).toBe(value);
});

it('refreshes a literal render prop after parent setProps even without render reads', async () => {
  const screen = await analyze(`${prelude}
    class Child extends BaseComponent {
      initState(){return {watches:0};}initStyles(){}
      @WatchProps('value') changed(){this.state.watches++;}
      render(){return h('view',{},[]);}
    }
    class App extends BaseComponent {
      initState(){return {count:0};}initStyles(){}
      @Emit('none') change(){this.setProps({unused:1});}
      @Emit('none') noop(){}
      render(){return h('view',{},[createComponent({component:Child,props:{value:{ok:true}}})]);}
    }createApp({root:App}).mount();`);
  const [app, child] = screen.program!.instances;
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  const initial = runtime.props(child.id).value;
  runtime.invoke(app.id, 'noop');
  expect(runtime.props(child.id).value).toBe(initial);
  runtime.invoke(app.id, 'change');
  expect(runtime.props(child.id).value).not.toBe(initial);
  expect(runtime.state[screen.state[1].key]).toBe(1);
});

it('lowers nested fresh event payloads, spreads and member updates from real source', async () => {
  const screen = await analyze(`${prelude}
    class App extends BaseComponent {
      initState(){return {count:0};} initStyles(){}
      @Emit('change') send(value){const nested={value};const result={nested,list:[nested,undefined,...[2]],...{ok:true}}; result.nested.value+=1; result.list[0].value++; return result;}
      render(){return h('view',{},[]);}
    } createApp({root:App}).mount();`);
  const method = screen.program!.instances[0].methods.send;
  expect(method.body[0]).toMatchObject({
    kind: 'local',
    value: { kind: 'object' },
  });
  expect(method.body.some((node) => node.kind === 'set-member')).toBe(true);
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  const first = runtime.invoke(
    screen.program!.instances[0].id,
    'send',
    [1]
  ) as { nested: { value: number }; list: unknown[] };
  const second = runtime.invoke(screen.program!.instances[0].id, 'send', [1]);
  expect(first.list[0]).toBe(first.nested);
  expect(first.nested.value).toBe(3);
  expect(first.list[1]).toBeUndefined();
  expect(first).not.toBe(second);
});

it('keeps initial state and child props aliases in one pooled graph', async () => {
  const screen = await analyze(`${prelude}
    class Child extends BaseComponent {
      initState(){return {alias:this.props.value};} initStyles(){}
      @WatchProps('value') changed(next,previous){}
      render(){return h('view',{},[h('text',{},[this.props.value.items[0].n])]);}
    }
    class App extends BaseComponent {
      initState(){const nested={n:1};return {payload:{items:[nested,undefined],missing:undefined},alias:nested};} initStyles(){}
      render(){return h('view',{},[createComponent({component:Child,props:{value:this.state.payload}})]);}
    } createApp({root:App}).mount();`);
  expect(screen.program!.values).toBeDefined();
  const [app, child] = screen.program!.instances;
  expect(child.props.value).toEqual({
    kind: 'state',
    key: screen.state[0].key,
  });
  expect(screen.program!.initialState![screen.state[2].key]).toEqual(
    screen.program!.initialState![screen.state[0].key]
  );
  expect(child.renderDependencies).toContainEqual({
    kind: 'member',
    target: {
      kind: 'member',
      target: {
        kind: 'member',
        target: { kind: 'prop', instance: child.id, key: 'value' },
        key: { kind: 'literal', value: 'items' },
      },
      key: { kind: 'literal', value: 0 },
    },
    key: { kind: 'literal', value: 'n' },
  });
  expect(app.renderDependencies).toEqual([
    { kind: 'state', key: screen.state[0].key },
  ]);
  const first = new NativeRuntime(screen);
  const second = new NativeRuntime(screen);
  expect(first.state[screen.state[2].key]).toBe(
    first.state[screen.state[0].key]
  );
  expect(first.state[screen.state[0].key]).not.toBe(
    second.state[screen.state[0].key]
  );
});

it.each(['{items:[undefined,1]}', 'true ? {items:[undefined,1]} : null'])(
  'rerenders allocated props %s once when a sibling text dependency changes',
  async (value) => {
    const screen = await analyze(`${prelude}
    class Child extends BaseComponent {
      initState(){return {watches:0,alias:this.props.value};} initStyles(){}
      @WatchProps('value') changed(next,previous){this.state.watches+=1;}
      render(){return h('view',{},[]);}
    }
    class App extends BaseComponent {
      initState(){return {count:0};} initStyles(){}
      @Emit('none') noop(){}
      @Emit('none') bump(){this.state.count++;}
      render(){return h('view',{},[h('text',{},[this.state.count]),createComponent({component:Child,props:{value:${value}}})]);}
    } createApp({root:App}).mount();`);
    const [app, child] = screen.program!.instances;
    const runtime = new NativeRuntime(screen);
    runtime.mount();
    const initial = runtime.props(child.id).value;
    expect(runtime.state[screen.state[2].key]).toBe(initial);
    runtime.invoke(app.id, 'noop');
    expect(runtime.props(child.id).value).toBe(initial);
    expect(runtime.state[screen.state[1].key]).toBe(0);
    runtime.invoke(app.id, 'bump');
    expect(runtime.props(child.id).value).not.toBe(initial);
    expect(runtime.state[screen.state[1].key]).toBe(1);
    expect(runtime.state[screen.state[2].key]).toBe(initial);
  }
);

it('coerces a computed compound key before its right hand side mutates the key object', async () => {
  const screen = await analyze(`${prelude}
    class App extends BaseComponent {
      initState(){return {count:0};} initStyles(){}
      change(keys){keys[0]='y';return 2;}
      @Emit('change') send(){const keys=['x'];const value={x:1,y:10};value[keys]+=this.change(keys);return value;}
      render(){return h('view',{},[]);}
    } createApp({root:App}).mount();`);
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  expect(runtime.invoke(screen.program!.instances[0].id, 'send')).toEqual({
    x: 3,
    y: 10,
  });
});

it('retains sparse initial arrays, undefined fields and static computed data keys', async () => {
  const screen = await analyze(`${prelude}
    class App extends BaseComponent {
      initState(){const key='missing';return {payload:{[key]:undefined,list:[,undefined,2]}};} initStyles(){}
      @Emit('change') read(){return this.state.payload;}
      render(){return h('view',{},[]);}
    } createApp({root:App}).mount();`);
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  const payload = runtime.invoke(screen.program!.instances[0].id, 'read') as {
    missing: undefined;
    list: unknown[];
  };
  expect(Object.prototype.hasOwnProperty.call(payload, 'missing')).toBe(true);
  expect(Object.prototype.hasOwnProperty.call(payload.list, 0)).toBe(false);
  expect(Object.prototype.hasOwnProperty.call(payload.list, 1)).toBe(true);
  expect(payload.list.length).toBe(3);
});

it('retains safe shared module constant identities across repeated component plans', async () => {
  const screen = await analyze(`${prelude}
    const DEFAULTS={nested:{n:1}};
    class Child extends BaseComponent {
      defaults=DEFAULTS;
      initState(){return {payload:this.defaults};}initStyles(){}
      @Emit('change') read(){return this.state.payload;}
      render(){return h('view',{},[]);}
    }
    class App extends BaseComponent {
      initState(){return {count:0};}initStyles(){}
      render(){return h('view',{},[createComponent({component:Child}),createComponent({component:Child})]);}
    }createApp({root:App}).mount();`);
  expect(screen.program!.initialState![screen.state[1].key]).toEqual(
    screen.program!.initialState![screen.state[2].key]
  );
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  expect(runtime.invoke(screen.program!.instances[1].id, 'read')).toBe(
    runtime.invoke(screen.program!.instances[2].id, 'read')
  );
});

it.each([
  'new Date()',
  'new Map()',
  '()=>1',
  '{get value(){return 1;}}',
  '{method(){return 1;}}',
])(
  'rejects unsupported payload %s without executing business source',
  async (value) => {
    await expect(
      analyze(`${prelude}class App extends BaseComponent {
      initState(){return {count:0};}initStyles(){}
      @Emit('change') read(){return ${value};}
      render(){return h('view',{},[]);}
    }createApp({root:App}).mount();`)
    ).rejects.toThrow(/main\.ts:\s*\d+:\d+.*原生/);
  }
);

it('memoizes allocated render props against all render reads and seeds child aliases', async () => {
  const screen = await analyze(`${prelude}
    class Child extends BaseComponent {
      initState(){return {alias:this.props.value};} initStyles(){}
      @WatchProps('value') changed(next,previous){}
      render(){return h('view',{},[]);}
    }
    class App extends BaseComponent {
      initState(){return {count:0};} initStyles(){}
      render(){return h('view',{},[h('text',{},[this.state.count]),createComponent({component:Child,props:{value:{items:[this.state.count,undefined]}}})]);}
    } createApp({root:App}).mount();`);
  const [app, child] = screen.program!.instances;
  expect(child.props.value).toMatchObject({
    kind: 'memo',
    owner: app.id,
    value: { kind: 'object' },
    initial: { kind: 'value-ref' },
  });
  expect(child.props.value.kind).toBe('memo');
  if (child.props.value.kind !== 'memo')
    throw new Error('Expected a memoized prop');
  expect(screen.program!.initialState![screen.state[1].key]).toEqual(
    child.props.value.initial!
  );
  expect(app.renderDependencies).toContainEqual({
    kind: 'state',
    key: screen.state[0].key,
  });
});
