import { expect, it } from 'bun:test';
import { NativeRuntime, type NativeRuntimeValue } from '../src/app/runtime';
import type {
  NativeExpression as E,
  NativeInstruction as I,
  NativeProgram,
  NativeRuntimeInstance,
  NativeScreen,
} from '../src/app/types';

const literal = (value: string | number | boolean | null): E => ({
  kind: 'literal',
  value,
});
const state = (key: string): E => ({ kind: 'state', key });
const local = (name: string): E => ({ kind: 'local', name });
const ref = (id: string): E => ({ kind: 'value-ref', id });
const member = (target: E, key: string | number): E => ({
  kind: 'member',
  target,
  key: literal(key),
});
const object = (entries: Array<[string, E]>): E & { kind: 'object' } => ({
  kind: 'object',
  entries: entries.map(([key, value]) => ({ key: literal(key), value })),
});
const method = (body: I[], params: string[] = []) => ({ params, body });
const assign = (key: string, value: E): I => ({ kind: 'assign', key, value });
const set = (target: E, key: string | number, value: E): I => ({
  kind: 'set-member',
  target,
  key: literal(key),
  value,
});
const ret = (value: E): I => ({ kind: 'return', value });
function instance(
  id: string,
  patch: Partial<NativeRuntimeInstance> = {}
): NativeRuntimeInstance {
  return { id, props: {}, methods: {}, emitters: {}, watchers: [], ...patch };
}
function screen(program: NativeProgram): NativeScreen {
  return {
    name: 'Complex',
    state: [
      { key: 'count', value: 0 },
      { key: 'trace', value: '' },
    ],
    root: { kind: 'container', children: [] },
    program,
  };
}
function runtime(program: NativeProgram): NativeRuntime {
  const value = new NativeRuntime(screen(program));
  value.mount();
  return value;
}

it('allocates initial graphs with forward references, cycles, aliases, and runtime isolation', () => {
  const fixture = screen({
    instances: [instance('root')],
    values: [
      {
        id: 'outer',
        value: object([
          ['nested', ref('inner')],
          ['self', ref('outer')],
        ]),
      },
      { id: 'inner', value: object([['value', literal(1)]]) },
    ],
    initialState: {
      left: ref('outer'),
      right: ref('outer'),
      nested: ref('inner'),
    },
  });
  const first = new NativeRuntime(fixture);
  const second = new NativeRuntime(fixture);
  expect(first.state.left).toBe(first.state.right);
  expect((first.state.left as Record<string, NativeRuntimeValue>).self).toBe(
    first.state.left
  );
  expect((first.state.left as Record<string, NativeRuntimeValue>).nested).toBe(
    first.state.nested
  );
  expect(first.state.left).not.toBe(second.state.left);
  expect(first.state.nested).not.toBe(second.state.nested);
});

it('passes emit arguments and return values by reference across callbacks', () => {
  const root = instance('root', {
    methods: {
      receive: method(
        [
          set(local('value'), 'count', literal(8)),
          assign('received', local('value')),
        ],
        ['value']
      ),
    },
  });
  const child = instance('child', {
    parent: 'root',
    methods: {
      change: { ...method([ret(local('value'))], ['value']), emit: 'change' },
    },
    emitters: { change: { instance: 'root', method: 'receive' } },
  });
  const value = runtime({ instances: [root, child] });
  const payload = { count: 1 };
  expect(value.invoke('child', 'change', [payload])).toBe(payload);
  expect(value.state.received).toBe(payload);
  expect(payload.count).toBe(8);
});

it('watches only top level prop identity and retains the original old and new references', () => {
  const root = instance('root', {
    methods: {
      nested: method([set(state('value'), 'count', literal(2))]),
      replace: method([assign('value', object([['count', literal(3)]]))]),
    },
  });
  const child = instance('child', {
    parent: 'root',
    props: { value: state('value') },
    methods: {
      watch: method(
        [
          assign('next', local('next')),
          assign('previous', local('previous')),
          assign('count', {
            kind: 'binary',
            operator: '+',
            left: state('count'),
            right: literal(1),
          }),
        ],
        ['next', 'previous']
      ),
    },
    watchers: [{ key: 'value', method: 'watch', immediate: false }],
  });
  const value = runtime({
    instances: [root, child],
    values: [{ id: 'initial', value: object([['count', literal(1)]]) }],
    initialState: { value: ref('initial') },
  });
  const original = value.state.value;
  value.invoke('root', 'nested');
  expect(value.state.count).toBe(0);
  value.invoke('root', 'replace');
  expect(value.state.count).toBe(1);
  expect(value.state.previous).toBe(original);
  expect(value.state.next).toBe(value.state.value);
  expect(
    (value.state.previous as Record<string, NativeRuntimeValue>).count
  ).toBe(2);
});

it('creates fresh method literals while preserving their nested references and safe own keys', () => {
  const value = runtime({
    instances: [
      instance('root', {
        methods: {
          create: method([
            ret(
              object([
                ['nested', state('nested')],
                ['__proto__', object([['safe', literal(true)]])],
              ])
            ),
          ]),
        },
      }),
    ],
    values: [{ id: 'nested', value: object([['x', literal(1)]]) }],
    initialState: { nested: ref('nested') },
  });
  const first = value.invoke('root', 'create') as Record<
    string,
    NativeRuntimeValue
  >;
  const second = value.invoke('root', 'create') as Record<
    string,
    NativeRuntimeValue
  >;
  expect(first).not.toBe(second);
  expect(first.nested).toBe(second.nested);
  expect(Object.getPrototypeOf(first)).toBe(Object.prototype);
  expect(Object.prototype.hasOwnProperty.call(first, '__proto__')).toBe(true);
  expect(first.__proto__).toEqual({ safe: true });
});

it('copies object spreads shallowly in source order and omits holes and nullish sources', () => {
  const value = runtime({
    instances: [
      instance('root', {
        methods: {
          create: method([
            ret({
              kind: 'object',
              entries: [
                { key: literal('first'), value: literal(1) },
                { spread: true, value: { kind: 'undefined' } },
                { spread: true, value: literal(null) },
                {
                  spread: true,
                  value: {
                    kind: 'array',
                    items: [{ hole: true }, { value: state('shared') }],
                  },
                },
                { key: literal('first'), value: literal(2) },
                { key: literal('__proto__'), value: literal('own') },
              ],
            }),
          ]),
        },
      }),
    ],
    values: [{ id: 'shared', value: object([['x', literal(1)]]) }],
    initialState: { shared: ref('shared') },
  });
  const result = value.invoke('root', 'create') as Record<
    string,
    NativeRuntimeValue
  >;
  expect(Object.keys(result)).toEqual(['1', 'first', '__proto__']);
  expect(result.first).toBe(2);
  expect(result['1']).toBe(value.state.shared);
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
});

it('preserves array holes, materializes spread holes, and implements index and length writes', () => {
  const value = runtime({
    instances: [
      instance('root', {
        methods: {
          create: method([
            ret({
              kind: 'array',
              items: [{ hole: true }, { value: literal(2) }],
            }),
          ]),
          spread: method(
            [
              ret({
                kind: 'array',
                items: [{ spread: true, value: local('value') }],
              }),
            ],
            ['value']
          ),
          truncate: method(
            [
              set(local('value'), 'length', literal(1)),
              set(local('value'), 3, literal(9)),
              ret(local('value')),
            ],
            ['value']
          ),
        },
      }),
    ],
  });
  const sparse = value.invoke('root', 'create') as NativeRuntimeValue[];
  expect(sparse.length).toBe(2);
  expect(Object.prototype.hasOwnProperty.call(sparse, 0)).toBe(false);
  const copied = value.invoke('root', 'spread', [
    sparse,
  ]) as NativeRuntimeValue[];
  expect(copied).toEqual([undefined, 2]);
  expect(Object.prototype.hasOwnProperty.call(copied, 0)).toBe(true);
  expect(value.invoke('root', 'truncate', [sparse])).toBe(sparse);
  expect(sparse.length).toBe(4);
  expect(Object.prototype.hasOwnProperty.call(sparse, 1)).toBe(false);
  expect(sparse[3]).toBe(9);
  expect(
    value.evaluate(member(local('value'), 'length'), { value: sparse })
  ).toBe(4);
});

it('uses JavaScript complex value coercion and safe own member reads', () => {
  const value = runtime({ instances: [instance('root')] });
  const evaluate = (operator: string, left: E, right: E) =>
    value.evaluate({ kind: 'binary', operator, left, right });
  const array: E = {
    kind: 'array',
    items: [{ value: literal(1) }, { value: literal(2) }],
  };
  expect(evaluate('+', array, literal(3))).toBe('1,23');
  expect(evaluate('+', object([]), literal(1))).toBe('[object Object]1');
  expect(
    evaluate(
      '<',
      { kind: 'array', items: [{ value: literal(2) }] },
      literal('10')
    )
  ).toBe(false);
  expect(value.evaluate(member(object([]), 'constructor'))).toBeUndefined();
  expect(
    value.evaluate({
      kind: 'member',
      target: literal(null),
      key: literal('x'),
      optional: true,
    })
  ).toBeUndefined();
  expect(() => value.evaluate(member(literal(null), 'x'))).toThrow(TypeError);
});

it('does not execute accessors, functions, or custom instance coercion', () => {
  const value = runtime({
    instances: [
      instance('root', {
        methods: {
          read: method([ret(member(local('value'), 'x'))], ['value']),
          coerce: method(
            [ret({ kind: 'unary', operator: 'String', value: local('value') })],
            ['value']
          ),
        },
      }),
    ],
  });
  let calls = 0;
  const accessor = Object.defineProperty({}, 'x', {
    enumerable: true,
    get() {
      calls++;
      return 1;
    },
  });
  class Custom {
    toString() {
      calls++;
      return 'executed';
    }
  }
  expect(() => value.invoke('root', 'read', [accessor])).toThrow(TypeError);
  expect(() =>
    value.invoke('root', 'coerce', [
      new Custom() as unknown as NativeRuntimeValue,
    ])
  ).toThrow(TypeError);
  expect(() =>
    value.invoke('root', 'coerce', [
      {
        toString() {
          calls++;
          return 'executed';
        },
      } as unknown as NativeRuntimeValue,
    ])
  ).toThrow(TypeError);
  expect(calls).toBe(0);
});

it('memoizes render literals, preserves constructor aliases, and invalidates on relevant member writes', () => {
  const memo: E = {
    kind: 'memo',
    owner: 'root',
    key: 'props',
    initial: ref('initial'),
    value: object([['value', member(state('source'), 'count')]]),
  };
  const value = runtime({
    instances: [
      instance('root', {
        renderDependencies: [state('source'), member(state('source'), 'count')],
        methods: {
          noop: method([]),
          change: method([set(state('source'), 'count', literal(2))]),
          unchanged: method([set(state('source'), 'count', literal(2))]),
        },
      }),
      instance('child', { parent: 'root', props: { value: memo } }),
    ],
    values: [
      { id: 'source', value: object([['count', literal(1)]]) },
      { id: 'initial', value: object([['value', literal(1)]]) },
    ],
    initialState: { source: ref('source'), childInitial: ref('initial') },
  });
  expect(value.props('child').value).toBe(value.state.childInitial);
  value.invoke('root', 'noop');
  expect(value.props('child').value).toBe(value.state.childInitial);
  value.invoke('root', 'change');
  const changed = value.props('child').value;
  expect(changed).toEqual({ value: 2 });
  expect(changed).not.toBe(value.state.childInitial);
  value.invoke('root', 'unchanged');
  expect(value.props('child').value).toBe(changed);
});

it('invalidates owner memos on every manual setProps even when its scalar patch is unchanged', () => {
  const value = runtime({
    instances: [
      instance('root', {
        methods: {
          patch: method([
            {
              kind: 'set-props',
              instance: 'root',
              values: { value: literal(1) },
            },
          ]),
        },
      }),
      instance('child', {
        parent: 'root',
        props: {
          value: {
            kind: 'memo',
            owner: 'root',
            key: 'literal',
            value: object([['x', literal(1)]]),
          },
        },
      }),
    ],
  });
  const first = value.props('child').value;
  value.invoke('root', 'patch');
  const second = value.props('child').value;
  value.invoke('root', 'patch');
  expect(second).not.toBe(first);
  expect(value.props('child').value).not.toBe(second);
});

it('coerces assignment keys before evaluating the right hand side', () => {
  const value = runtime({
    instances: [
      instance('root', {
        methods: {
          change: method([
            {
              kind: 'set-member',
              target: state('target'),
              key: state('key'),
              value: {
                kind: 'call',
                instance: 'root',
                method: 'rhs',
                args: [],
              },
            },
          ]),
          rhs: method([
            set(state('key'), 0, literal('after')),
            ret(literal(1)),
          ]),
        },
      }),
    ],
    values: [
      { id: 'target', value: object([]) },
      {
        id: 'key',
        value: { kind: 'array', items: [{ value: literal('before') }] },
      },
    ],
    initialState: { target: ref('target'), key: ref('key') },
  });
  value.invoke('root', 'change');
  expect(value.state.target).toEqual({ before: 1 });
});

it('keeps reference snapshots stable across a reentrant props notification batch', () => {
  const value = runtime({
    instances: [
      instance('root', {
        methods: {
          replace: method([assign('value', local('value'))], ['value']),
        },
      }),
      instance('child', {
        parent: 'root',
        props: { value: state('value') },
        methods: {
          first: method(
            [
              set(local('previous'), 'seen', literal(true)),
              {
                kind: 'if',
                condition: {
                  kind: 'binary',
                  operator: '===',
                  left: member(local('next'), 'n'),
                  right: literal(2),
                },
                then: [
                  {
                    kind: 'set-props',
                    instance: 'child',
                    values: { value: object([['n', literal(3)]]) },
                  },
                ],
                otherwise: [],
              },
            ],
            ['next', 'previous']
          ),
          second: method(
            [
              assign('trace', {
                kind: 'binary',
                operator: '+',
                left: state('trace'),
                right: {
                  kind: 'binary',
                  operator: '+',
                  left: member(local('next'), 'n'),
                  right: literal(';'),
                },
              }),
              assign('lastPrevious', local('previous')),
            ],
            ['next', 'previous']
          ),
        },
        watchers: [
          { key: 'value', method: 'first', immediate: false },
          { key: 'value', method: 'second', immediate: false },
        ],
      }),
    ],
    values: [{ id: 'initial', value: object([['n', literal(1)]]) }],
    initialState: { value: ref('initial') },
  });
  const original = value.state.value as Record<string, NativeRuntimeValue>;
  const replacement = { n: 2 };
  value.invoke('root', 'replace', [replacement]);
  expect(original.seen).toBe(true);
  expect(value.state.trace).toBe('2;3;');
  expect(value.state.lastPrevious).toBe(replacement);
  expect((replacement as Record<string, NativeRuntimeValue>).seen).toBe(true);
});

it('snapshots spreads before subsequent entries mutate their source and coerces object keys before values', () => {
  const value = runtime({
    instances: [
      instance('root', {
        methods: {
          mutate: method([
            set(state('source'), 'x', literal(2)),
            set(state('key'), 0, literal('after')),
            ret(literal(3)),
          ]),
          create: method([
            ret({
              kind: 'object',
              entries: [
                { spread: true, value: state('source') },
                {
                  key: state('key'),
                  value: {
                    kind: 'call',
                    instance: 'root',
                    method: 'mutate',
                    args: [],
                  },
                },
              ],
            }),
          ]),
        },
      }),
    ],
    values: [
      { id: 'source', value: object([['x', literal(1)]]) },
      {
        id: 'key',
        value: { kind: 'array', items: [{ value: literal('before') }] },
      },
    ],
    initialState: { source: ref('source'), key: ref('key') },
  });
  expect(value.invoke('root', 'create')).toEqual({ x: 1, before: 3 });
  expect(value.state.source).toEqual({ x: 2 });
});

it('uses code points for array string spreads and UTF-16 own indices for object string spreads', () => {
  const value = runtime({ instances: [instance('root')] });
  expect(
    value.evaluate({
      kind: 'array',
      items: [{ spread: true, value: literal('😀a') }],
    })
  ).toEqual(['😀', 'a']);
  const spread = value.evaluate({
    kind: 'object',
    entries: [{ spread: true, value: literal('😀a') }],
  }) as Record<string, NativeRuntimeValue>;
  expect(Object.keys(spread)).toEqual(['0', '1', '2']);
  expect(spread['0']).toBe('\ud83d');
  expect(spread['1']).toBe('\ude00');
  expect(spread['2']).toBe('a');
  for (const source of [literal(null), { kind: 'undefined' } as E, object([])])
    expect(() =>
      value.evaluate({
        kind: 'array',
        items: [{ spread: true, value: source }],
      })
    ).toThrow(TypeError);
});

it('keeps memos for unobserved undefined keys and invalidates subscribed array length changes', () => {
  const source = state('source');
  const list = state('list');
  const value = runtime({
    instances: [
      instance('root', {
        renderDependencies: [
          source,
          list,
          { kind: 'revision', value: source },
          { kind: 'revision', value: list },
        ],
        methods: {
          noop: method([set(list, 'length', literal(1))]),
          add: method([set(source, 'newKey', { kind: 'undefined' })]),
          resize: method([set(list, 'length', literal(2))]),
        },
      }),
      instance('child', {
        parent: 'root',
        props: {
          value: {
            kind: 'memo',
            owner: 'root',
            key: 'view',
            value: object([['x', literal(1)]]),
          },
        },
      }),
    ],
    values: [
      { id: 'source', value: object([]) },
      { id: 'list', value: { kind: 'array', items: [{ hole: true }] } },
    ],
    initialState: { source: ref('source'), list: ref('list') },
  });
  const first = value.props('child').value;
  value.invoke('root', 'noop');
  expect(value.props('child').value).toBe(first);
  value.invoke('root', 'add');
  const second = value.props('child').value;
  expect(second).toBe(first);
  value.invoke('root', 'resize');
  expect(value.props('child').value).not.toBe(second);
});

it('invalidates a component memo after native bindings actually change its props bag', () => {
  const value = runtime({
    instances: [
      instance('root', {
        methods: {
          change: method([assign('count', literal(1))]),
          noop: method([]),
        },
      }),
      instance('middle', { parent: 'root', props: { count: state('count') } }),
      instance('leaf', {
        parent: 'middle',
        props: {
          value: {
            kind: 'memo',
            owner: 'middle',
            key: 'view',
            value: object([]),
          },
        },
      }),
    ],
  });
  const first = value.props('leaf').value;
  value.invoke('root', 'noop');
  expect(value.props('leaf').value).toBe(first);
  value.invoke('root', 'change');
  const second = value.props('leaf').value;
  expect(second).not.toBe(first);
  value.invoke('root', 'noop');
  expect(value.props('leaf').value).toBe(second);
});

it('keeps literal memo identity when a directly passed object reference mutates internally', () => {
  const source = state('source');
  const value = runtime({
    instances: [
      instance('root', {
        renderDependencies: [source],
        methods: {
          mutate: method([set(source, 'n', literal(2))]),
        },
      }),
      instance('child', {
        parent: 'root',
        props: {
          data: source,
          value: {
            kind: 'memo',
            owner: 'root',
            key: 'literal',
            value: object([['ok', literal(true)]]),
          },
        },
        methods: {
          changed: method([
            assign('count', {
              kind: 'binary',
              operator: '+',
              left: state('count'),
              right: literal(1),
            }),
          ]),
        },
        watchers: [{ key: 'value', method: 'changed', immediate: false }],
      }),
    ],
    values: [{ id: 'source', value: object([['n', literal(1)]]) }],
    initialState: { source: ref('source') },
  });
  const initial = value.props('child').value;
  value.invoke('root', 'mutate');
  expect(value.props('child').value).toBe(initial);
  expect(value.state.count).toBe(0);
  expect(
    (value.props('child').data as Record<string, NativeRuntimeValue>).n
  ).toBe(2);
});
