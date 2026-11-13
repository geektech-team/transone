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
import { NativeRuntime } from '../src/app/runtime';
import { nativeRuntimeSource } from '../src/app/runtime-codegen';
import { resolveConfig } from '../src/config';
import { createDomWindow, installDomGlobals } from '../../transone/lib/dom';
import { flushSync } from '../../transone/lib';
import type { NativeExpression as E, NativeScreen } from '../src/app/types';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const cases = [
  [
    'direct object prop keeps its untriggered binding',
    '[{n:1},{n:2}]',
    'this.state.data[1]',
    'this.state.data[1]',
    'this.state.data.length=0;',
    0,
  ],
  [
    'object spread of array ignores added index',
    '[1]',
    "'text'",
    '{...this.state.data}',
    'this.state.data[1]=2;',
    0,
  ],
  [
    'array spread preserves dirty intermediate writes',
    '[1]',
    "'text'",
    '[...this.state.data]',
    'this.state.data[0]=2;this.state.data[0]=1;',
    1,
  ],
  [
    'computed object key conversion observes array input',
    '[1]',
    "'text'",
    '{[this.state.data]:true}',
    "this.state.data[0]='1';",
    1,
  ],
  [
    'numeric conversion with equal output observes input',
    '[1]',
    'Number(this.state.data)',
    'this.state.data',
    "this.state.data[0]='1';",
    1,
  ],
  [
    'addition converts nested arrays',
    '[[1]]',
    "this.state.data + ''",
    'this.state.data',
    'this.state.data[0][0]=2;',
    1,
  ],
  [
    'array truncation does not invalidate unread length',
    '[1,2]',
    'this.state.data[1]',
    'this.state.data',
    'this.state.data.length=0;',
    0,
  ],
  [
    'state A to B to A',
    '{n:1}',
    'this.state.data.n',
    'this.state.data',
    'const old=this.state.data;this.state.data={n:2};this.state.data=old;',
    1,
  ],
  [
    'shared nested A to B to A',
    '{entry:{n:1}}',
    'this.state.data.entry.n',
    'this.state.data',
    'const old=this.state.data.entry;this.state.data.entry={n:2};this.state.data.entry=old;',
    1,
  ],
  [
    'array index invalidates length',
    '[1]',
    'this.state.data.length',
    'this.state.data',
    'this.state.data[0]=2;',
    1,
  ],
  [
    'recursive array string conversion',
    '[[1]]',
    'String(this.state.data)',
    'this.state.data',
    'this.state.data[0][0]=2;',
    1,
  ],
  [
    'same converted string with changed input',
    '[1]',
    'String(this.state.data)',
    'this.state.data',
    "this.state.data[0]='1';",
    1,
  ],
  [
    'object spread ignores unobserved added keys',
    '{n:1}',
    "'text'",
    '{...this.state.data}',
    'this.state.data.extra=2;',
    0,
  ],
  [
    'array spread ignores ordinary properties',
    '[1]',
    "'text'",
    '[...this.state.data]',
    'this.state.data.extra=2;',
    0,
  ],
  [
    'array hole filled with undefined stays clean',
    '[,1]',
    "'text'",
    '[...this.state.data]',
    'this.state.data[0]=undefined;',
    0,
  ],
  [
    'object spread observes existing keys',
    '{n:1}',
    "'text'",
    '{...this.state.data}',
    'this.state.data.n=2;',
    1,
  ],
  [
    'direct reference stays shallow',
    '{n:1}',
    "'text'",
    'this.state.data',
    'this.state.data.n=2;',
    0,
  ],
  [
    'array conversion ignores nested object fields',
    '[{n:1}]',
    'String(this.state.data)',
    'this.state.data',
    'this.state.data[0].n=2;',
    0,
  ],
] as const;
it.each(cases)(
  'matches Core render subscriptions for %s',
  async (_name, initial, expression, data, mutate, expected) => {
    const root = mkdtempSync(join(tmpdir(), 'transone-read-tracking-'));
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
    const textExpression =
      expression === "'text'" ? expression : `String(${expression})`;
    const source = `import {BaseComponent,Emit,WatchProps,h,createComponent,createApp} from 'transone';
  class Child extends BaseComponent {initState(){return {watches:0};}initStyles(){}
    @WatchProps('value') changed(){this.state.watches++;}render(){return h('view',{},[]);}}
  class App extends BaseComponent {initState(){return {data:${initial}};}initStyles(){}
    @Emit('none') mutate(){${mutate}}
    render(){return h('view',{},[h('text',{},[${textExpression}]),createComponent({component:Child,props:{data:${data},value:{ok:true}}})]);}}
  createApp({root:App}).mount();`;
    const entry = join(root, 'src/main.ts');
    writeFileSync(entry, source);
    const screen = await analyzeNativeScreen(
      entry,
      await resolveConfig({ root, target: 'app-ios' })
    );
    const [parent, child] = screen.program!.instances;
    const oracle = new NativeRuntime(screen);
    oracle.mount();
    const first = oracle.props(child.id).value;
    const firstData = oracle.props(child.id).data;
    oracle.invoke(parent.id, 'mutate');
    expect(oracle.state[screen.state[1].key]).toBe(expected);
    expect(oracle.props(child.id).value === first).toBe(expected === 0);
    if (_name === 'direct object prop keeps its untriggered binding')
      expect(oracle.props(child.id).data).toBe(firstData);
    if (_name === 'direct reference stays shallow') {
      const prior = oracle.props(child.id).value;
      oracle.unmount();
      oracle.mount();
      expect(oracle.props(child.id).value).not.toBe(prior);
      expect(oracle.state[screen.state[1].key]).toBe(0);
    }
    const code = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      nativeRuntimeSource(screen, 'ark')
    );
    const { TnRuntime } = new Function(code + '\nreturn {TnRuntime};')();
    const generated = new TnRuntime();
    generated.mount();
    const seed = generated.prop(child.id, 'value');
    const seedData = generated.prop(child.id, 'data');
    generated.invoke(parent.id, 'mutate', []);
    expect(generated.getState(screen.state[1].key).number).toBe(expected);
    expect(generated.same(seed, generated.prop(child.id, 'value'))).toBe(
      expected === 0
    );
    if (_name === 'direct object prop keeps its untriggered binding')
      expect(generated.same(seedData, generated.prop(child.id, 'data'))).toBe(
        true
      );
    if (_name === 'direct reference stays shallow') {
      const prior = generated.prop(child.id, 'value');
      generated.unmount();
      generated.mount();
      expect(generated.same(prior, generated.prop(child.id, 'value'))).toBe(
        false
      );
      expect(generated.getState(screen.state[1].key).number).toBe(0);
    }
    const restore = installDomGlobals(
      createDomWindow({ url: 'http://localhost/' })
    );
    let app: any;
    try {
      const coreEntry = join(root, 'src/core.ts');
      writeFileSync(
        coreEntry,
        source
          .replace(
            "from 'transone'",
            `from '${resolve(import.meta.dir, '../../transone/lib/index.ts')}'`
          )
          .replace('createApp({root:App}).mount();', 'export {App};')
      );
      const { App } = await import(coreEntry);
      app = new App();
      app.mount(document.createElement('main'));
      flushSync();
      const coreChild = [...app.childComponents][0] as any;
      const value = coreChild.props.value;
      const dataBefore = coreChild.props.data;
      app.mutate();
      flushSync();
      expect(coreChild.state.watches).toBe(expected);
      if (_name === 'direct object prop keeps its untriggered binding')
        expect(coreChild.props.data).toBe(dataBefore);
      expect(coreChild.props.value === value).toBe(expected === 0);
      if (_name === 'direct reference stays shallow') {
        const prior = coreChild.props.value;
        app.unmount();
        app.mount(document.createElement('main'));
        flushSync();
        const fresh = [...app.childComponents][0] as any;
        expect(fresh.props.value).not.toBe(prior);
        expect(fresh.state.watches).toBe(0);
      }
    } finally {
      app?.unmount();
      flushSync();
      restore();
    }
  }
);

it.each(['object', 'array'] as const)(
  'commits fresh %s props before an interrupted old action returns',
  (kind) => {
    const literal = (value: string | number): E => ({ kind: 'literal', value });
    const state = (key: string): E => ({ kind: 'state', key });
    const box = (value: E): E & { kind: 'object' | 'array' } =>
      kind === 'object'
        ? { kind: 'object', entries: [{ key: literal('n'), value }] }
        : { kind: 'array', items: [{ value }] };
    const member = (value: E): E => ({
      kind: 'member',
      target: value,
      key: literal(kind === 'object' ? 'n' : 0),
    });
    const add = (left: E, right: E): E => ({
      kind: 'binary',
      operator: '+',
      left,
      right,
    });
    const fixture: NativeScreen = {
      name: 'Remount',
      state: [{ key: 'trace', value: '' }],
      root: { kind: 'container', children: [] },
      program: {
        values: [{ id: 'seed', value: box(literal(1)) }],
        initialState: { model: { kind: 'value-ref', id: 'seed' } },
        instances: [
          {
            id: 'root',
            props: {},
            emitters: {},
            watchers: [],
            renderDependencies: [state('model')],
            onMounted: 'mount',
            methods: {
              mount: {
                params: [],
                body: [
                  {
                    kind: 'assign',
                    key: 'model',
                    value: box(add(member(state('model')), literal(1))),
                  },
                ],
              },
              update: {
                params: [],
                body: [
                  { kind: 'assign', key: 'model', value: box(literal(10)) },
                ],
              },
              noop: { params: [], body: [] },
            },
          },
          {
            id: 'child',
            parent: 'root',
            props: { value: state('model') },
            emitters: {},
            watchers: [{ key: 'value', method: 'watch', immediate: false }],
            methods: {
              watch: {
                params: ['next', 'old'],
                body: [
                  {
                    kind: 'assign',
                    key: 'trace',
                    value: add(
                      state('trace'),
                      add(member({ kind: 'local', name: 'next' }), literal(';'))
                    ),
                  },
                ],
              },
            },
          },
        ],
      },
    };
    const runtime = new NativeRuntime(fixture);
    runtime.mount();
    const stale = runtime.callback('root', 'update');
    let backing = runtime.state.model,
      once = true;
    Object.defineProperty(runtime.state, 'model', {
      enumerable: true,
      configurable: true,
      get() {
        return backing;
      },
      set(value) {
        backing = value;
        if (once) {
          once = false;
          runtime.unmount();
          runtime.mount();
        }
      },
    });
    runtime.invoke('root', 'update');
    expect(runtime.props('child').value).toBe(runtime.state.model);
    expect(runtime.evaluate(member(state('model')))).toBe(11);
    expect(runtime.state.trace).toBe('2;11;');
    expect(stale()).toBeUndefined();
    runtime.invoke('root', 'noop');
    expect(runtime.state.trace).toBe('2;11;');
  }
);

it('retries a failed binding factory without marking the parent render clean', () => {
  const data: E = { kind: 'state', key: 'data' };
  const fixture: NativeScreen = {
    name: 'Retry',
    state: [],
    root: { kind: 'container', children: [] },
    program: {
      values: [
        {
          id: 'seed',
          value: {
            kind: 'array',
            items: [{ value: { kind: 'literal', value: 1 } }],
          },
        },
      ],
      initialState: { data: { kind: 'value-ref', id: 'seed' } },
      instances: [
        {
          id: 'parent',
          props: {},
          emitters: {},
          watchers: [],
          renderDependencies: [
            data,
            { kind: 'revision', value: data, mode: 'array' },
          ],
          methods: {
            bad: {
              params: [],
              body: [
                {
                  kind: 'assign',
                  key: 'data',
                  value: { kind: 'object', entries: [] },
                },
              ],
            },
            noop: { params: [], body: [] },
            good: {
              params: [],
              body: [
                {
                  kind: 'assign',
                  key: 'data',
                  value: {
                    kind: 'array',
                    items: [{ value: { kind: 'literal', value: 2 } }],
                  },
                },
              ],
            },
          },
        },
        {
          id: 'child',
          parent: 'parent',
          props: {
            value: {
              kind: 'memo',
              owner: 'parent',
              key: 'spread',
              value: { kind: 'array', items: [{ value: data, spread: true }] },
            },
          },
          methods: {},
          watchers: [],
          emitters: {},
        },
      ],
    },
  };
  const oracle = new NativeRuntime(fixture);
  oracle.mount();
  const original = oracle.props('child').value;
  expect(() => oracle.invoke('parent', 'bad')).toThrow();
  expect(() => oracle.invoke('parent', 'noop')).toThrow();
  expect(oracle.props('child').value).toBe(original);
  oracle.invoke('parent', 'good');
  expect(oracle.props('child').value).toEqual([2]);
  const code = new Bun.Transpiler({ loader: 'ts' }).transformSync(
    nativeRuntimeSource(fixture, 'ark')
  );
  const { TnRuntime, TnValue } = new Function(
    code + '\nreturn {TnRuntime,TnValue};'
  )();
  const generated = new TnRuntime();
  generated.mount();
  const seed = generated.prop('child', 'value');
  expect(() => generated.invoke('parent', 'bad', [])).toThrow();
  expect(() => generated.invoke('parent', 'noop', [])).toThrow();
  expect(generated.same(seed, generated.prop('child', 'value'))).toBe(true);
  generated.invoke('parent', 'good', []);
  expect(
    generated.member(generated.prop('child', 'value'), TnValue.num(0)).number
  ).toBe(2);
});
