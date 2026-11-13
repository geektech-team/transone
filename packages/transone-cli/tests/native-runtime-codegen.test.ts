import { describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NativeRuntime } from '../src/app/runtime';
import { nativeRuntimeSource, nativeString } from '../src/app/runtime-codegen';
import type {
  NativeExpression,
  NativeInstruction,
  NativeMethod,
  NativeScreen,
} from '../src/app/types';

const literal = (value: number): NativeExpression => ({
  kind: 'literal',
  value,
});
const local = (name: string): NativeExpression => ({ kind: 'local', name });
export const runtimeScreen: NativeScreen = {
  name: 'RuntimeFixture',
  state: [
    { key: 'count', value: 1 },
    { key: 'draft', value: 0 },
  ],
  root: { kind: 'container', children: [] },
  program: {
    instances: [
      {
        id: 'parent',
        props: {},
        emitters: {},
        watchers: [],
        methods: {
          bump: {
            params: [],
            body: [
              {
                kind: 'assign',
                key: 'count',
                value: {
                  kind: 'binary',
                  operator: '+',
                  left: { kind: 'state', key: 'count' },
                  right: literal(1),
                },
              },
            ],
          },
          receive: {
            params: ['value'],
            body: [{ kind: 'assign', key: 'count', value: local('value') }],
          },
        },
      },
      {
        id: 'child',
        parent: 'parent',
        props: { value: { kind: 'state', key: 'count' } },
        emitters: { change: { instance: 'parent', method: 'receive' } },
        watchers: [{ key: 'value', method: 'watch', immediate: true }],
        methods: {
          send: {
            params: ['value'],
            emit: 'change',
            body: [
              { kind: 'assign', key: 'draft', value: local('value') },
              { kind: 'return', value: local('value') },
            ],
          },
          update: {
            params: ['value'],
            body: [
              {
                kind: 'set-props',
                instance: 'child',
                values: { value: local('value') },
              },
            ],
          },
          watch: {
            params: ['next', 'old'],
            body: [
              {
                kind: 'if',
                condition: {
                  kind: 'binary',
                  operator: '===',
                  left: local('next'),
                  right: literal(13),
                },
                then: [
                  {
                    kind: 'throw',
                    message: { kind: 'literal', value: 'watch failed' },
                  },
                ],
                otherwise: [],
              },
              {
                kind: 'assign',
                key: 'draft',
                value: {
                  kind: 'binary',
                  operator: '+',
                  left: local('next'),
                  right: {
                    kind: 'binary',
                    operator: '??',
                    left: local('old'),
                    right: literal(0),
                  },
                },
              },
            ],
          },
        },
      },
    ],
  },
};
function execute(screen = runtimeScreen) {
  const source = nativeRuntimeSource(screen, 'ark');
  const javascript = new Bun.Transpiler({ loader: 'ts' }).transformSync(source);
  return new Function(javascript + '\nreturn {TnRuntime,TnValue};')() as {
    TnRuntime: new () => any;
    TnValue: {
      num(value: number): any;
      str(value: string): any;
      undefined: any;
    };
  };
}

describe('generated native component runtime', () => {
  it.skipIf(!existsSync('/usr/bin/swift'))(
    'executes Swift produced by the shared IR generator',
    async () => {
      const root = mkdtempSync(join(tmpdir(), 'transone-native-shared-swift-'));
      try {
        const file = join(root, 'main.swift');
        writeFileSync(
          file,
          nativeRuntimeSource(runtimeScreen, 'swift') +
            `
let runtime = TnRuntime()
try runtime.mount()
print(runtime.string(runtime.getState("draft")))
_ = try runtime.invoke("parent", "bump", [])
print(runtime.string(runtime.getState("draft")))
print(runtime.string(try runtime.invoke("child", "send", [TnValue.num(7)])))
print(runtime.string(runtime.getState("draft")))
do { _ = try runtime.invoke("child", "update", [TnValue.num(13)]) } catch { print("watch failed") }
_ = try runtime.invoke("child", "update", [TnValue.num(14)])
print(runtime.string(runtime.getState("draft")))
try runtime.unmount()
`
        );
        const child = Bun.spawn({
          cmd: [
            '/usr/bin/swift',
            '-module-cache-path',
            join(root, 'cache'),
            file,
          ],
          stdout: 'pipe',
          stderr: 'pipe',
        });
        const timer = setTimeout(() => child.kill(), 50_000);
        try {
          const [code, stdout, stderr] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
          ]);
          expect({
            code,
            errors: stderr
              .split('\n')
              .filter((line) => line.includes('error:')),
          }).toEqual({ code: 0, errors: [] });
          expect(stdout.trim().split('\n')).toEqual([
            '1',
            '3',
            '7',
            '9',
            'watch failed',
            '27',
          ]);
        } finally {
          clearTimeout(timer);
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    60_000
  );
  it('executes the shipped Ark runtime for payloads, props snapshots and recovery', () => {
    const { TnRuntime, TnValue } = execute();
    const runtime = new TnRuntime();
    runtime.mount();
    expect(runtime.string(runtime.getState('draft'))).toBe('1');
    runtime.invoke('parent', 'bump', []);
    expect(runtime.string(runtime.getState('draft'))).toBe('3');
    expect(
      runtime.string(runtime.invoke('child', 'send', [TnValue.num(7)]))
    ).toBe('7');
    expect(runtime.string(runtime.getState('count'))).toBe('7');
    expect(runtime.string(runtime.getState('draft'))).toBe('9');
    runtime.invoke('child', 'update', [TnValue.num(9)]);
    expect(runtime.string(runtime.getState('draft'))).toBe('16');
    runtime.invoke('parent', 'bump', []);
    expect(runtime.string(runtime.prop('child', 'value'))).toBe('8');
    expect(runtime.string(runtime.getState('draft'))).toBe('17');
    expect(() => runtime.invoke('child', 'update', [TnValue.num(13)])).toThrow(
      'watch failed'
    );
    runtime.invoke('child', 'update', [TnValue.num(14)]);
    expect(runtime.string(runtime.getState('draft'))).toBe('27');
    const old = runtime.action(() => runtime.invoke('parent', 'bump', []));
    runtime.unmount();
    runtime.mount();
    old();
    expect(runtime.string(runtime.getState('count'))).toBe('8');
  });

  it('preserves lazy expressions, signed zero, undefined and string coercion', () => {
    const { TnRuntime, TnValue } = execute();
    const runtime = new TnRuntime();
    let reads = 0;
    expect(
      runtime.logical(
        '??',
        () => TnValue.num(0),
        () => {
          reads++;
          return TnValue.num(1);
        }
      ).number
    ).toBe(0);
    expect(
      runtime.logical(
        '&&',
        () => TnValue.num(0),
        () => {
          reads++;
          return TnValue.num(1);
        }
      ).number
    ).toBe(0);
    expect(reads).toBe(0);
    expect(runtime.same(TnValue.num(0), TnValue.num(-0))).toBe(false);
    expect(runtime.same(TnValue.num(NaN), TnValue.num(NaN))).toBe(true);
    expect(
      runtime.string(runtime.binary('+', TnValue.str('a'), TnValue.num(1)))
    ).toBe('a1');
    expect(runtime.string(TnValue.undefined)).toBe('undefined');
  });

  it('keeps parent state props staged until the outer action ends', () => {
    const screen = structuredClone(runtimeScreen);
    screen.state.push({ key: 'trace', value: '' });
    const [parent, child] = screen.program!.instances;
    child.watchers[0].immediate = false;
    child.methods.watch = {
      params: ['next', 'old'],
      body: [
        {
          kind: 'assign',
          key: 'trace',
          value: {
            kind: 'binary',
            operator: '+',
            left: { kind: 'state', key: 'trace' },
            right: { kind: 'literal', value: 'watch;' },
          },
        },
      ],
    };
    parent.methods.staged = {
      params: [],
      body: [
        { kind: 'assign', key: 'count', value: literal(2) },
        {
          kind: 'set-props',
          instance: 'parent',
          values: { unrelated: literal(1) },
        },
        {
          kind: 'assign',
          key: 'trace',
          value: {
            kind: 'binary',
            operator: '+',
            left: { kind: 'state', key: 'trace' },
            right: { kind: 'literal', value: 'after;' },
          },
        },
      ],
    };
    const { TnRuntime } = execute(screen);
    const runtime = new TnRuntime();
    runtime.mount();
    runtime.invoke('parent', 'staged', []);
    expect(runtime.string(runtime.getState('trace'))).toBe('after;watch;');
  });

  it('publishes manual props before a staged parent update replaces the override', () => {
    const screen = structuredClone(runtimeScreen);
    screen.state.push({ key: 'trace', value: '' });
    const [parent, child] = screen.program!.instances;
    child.watchers[0].immediate = false;
    child.methods.watch = {
      params: ['next', 'old'],
      body: [
        {
          kind: 'assign',
          key: 'trace',
          value: {
            kind: 'binary',
            operator: '+',
            left: { kind: 'state', key: 'trace' },
            right: {
              kind: 'binary',
              operator: '+',
              left: { kind: 'unary', operator: 'String', value: local('next') },
              right: {
                kind: 'binary',
                operator: '+',
                left: { kind: 'literal', value: ':' },
                right: {
                  kind: 'binary',
                  operator: '+',
                  left: {
                    kind: 'unary',
                    operator: 'String',
                    value: local('old'),
                  },
                  right: { kind: 'literal', value: ';' },
                },
              },
            },
          },
        },
      ],
    };
    parent.methods.staged = {
      params: [],
      body: [
        { kind: 'assign', key: 'count', value: literal(2) },
        {
          kind: 'expression',
          value: {
            kind: 'call',
            instance: 'child',
            method: 'update',
            args: [literal(9)],
          },
        },
      ],
    };
    const { TnRuntime } = execute(screen);
    const runtime = new TnRuntime();
    runtime.mount();
    runtime.invoke('parent', 'staged', []);
    expect(runtime.string(runtime.getState('trace'))).toBe('9:1;2:9;');
    expect(runtime.string(runtime.prop('child', 'value'))).toBe('2');
  });

  it('keeps committed props stable through a watcher batch that changes parent state', () => {
    const screen = structuredClone(runtimeScreen);
    screen.state.push({ key: 'trace', value: '' });
    const child = screen.program!.instances[1];
    const text = (value: string): NativeExpression => ({
      kind: 'literal',
      value,
    });
    const join = (...parts: NativeExpression[]): NativeExpression =>
      parts.reduce((left, right) => ({
        kind: 'binary',
        operator: '+',
        left,
        right,
      }));
    const append = (value: NativeExpression): NativeInstruction => ({
      kind: 'assign',
      key: 'trace',
      value: join({ kind: 'state', key: 'trace' }, value),
    });
    const next: NativeExpression = {
      kind: 'unary',
      operator: 'String',
      value: local('next'),
    };
    child.watchers = [
      { key: 'value', method: 'first', immediate: false },
      { key: 'value', method: 'second', immediate: false },
    ];
    child.methods.first = {
      params: ['next'],
      body: [
        append(join(text('a'), next, text(';'))),
        {
          kind: 'if',
          condition: {
            kind: 'binary',
            operator: '===',
            left: local('next'),
            right: literal(3),
          },
          then: [
            {
              kind: 'expression',
              value: {
                kind: 'call',
                instance: 'parent',
                method: 'receive',
                args: [literal(4)],
              },
            },
          ],
          otherwise: [],
        },
      ],
    };
    child.methods.second = {
      params: ['next'],
      body: [
        append(
          join(
            text('b'),
            next,
            text(':'),
            {
              kind: 'unary',
              operator: 'String',
              value: { kind: 'prop', instance: 'child', key: 'value' },
            },
            text(';')
          )
        ),
      ],
    };
    const { TnRuntime, TnValue } = execute(screen);
    const runtime = new TnRuntime();
    runtime.mount();
    runtime.invoke('parent', 'receive', [TnValue.num(3)]);
    expect(runtime.string(runtime.getState('trace'))).toBe('a3;b3:3;a4;b4:4;');
  });

  it('drains a pending sibling synchronously without reordering the other siblings', () => {
    const screen = structuredClone(runtimeScreen);
    screen.state.push({ key: 'trace', value: '' });
    const [parent, child] = screen.program!.instances;
    const append = (label: string): NativeInstruction => ({
      kind: 'assign',
      key: 'trace',
      value: {
        kind: 'binary',
        operator: '+',
        left: {
          kind: 'binary',
          operator: '+',
          left: { kind: 'state', key: 'trace' },
          right: { kind: 'literal', value: label },
        },
        right: local('next'),
      },
    });
    const watch = (method: string) => ({
      key: 'value',
      method,
      immediate: false,
    });
    const update = (instance: string, value: number): NativeInstruction => ({
      kind: 'set-props',
      instance,
      values: { value: literal(value) },
    });
    child.watchers = [watch('first'), watch('second')];
    child.methods = {
      first: {
        params: ['next'],
        body: [
          append('A'),
          {
            kind: 'if',
            condition: {
              kind: 'binary',
              operator: '===',
              left: local('next'),
              right: literal(2),
            },
            then: [update(child.id, 3), update('C', 4)],
            otherwise: [],
          },
        ],
      },
      second: { params: ['next'], body: [append('a')] },
    };
    for (const id of ['B', 'C', 'D'])
      screen.program!.instances.push({
        ...child,
        id,
        watchers: [watch('watch')],
        methods: { watch: { params: ['next'], body: [append(id)] } },
      });

    const expected = 'A2C2C4a2A3a3B2D2';
    const oracle = new NativeRuntime(screen);
    oracle.mount();
    oracle.invoke(parent.id, 'bump');
    expect(oracle.state.trace).toBe(expected);

    const { TnRuntime } = execute(screen);
    const generated = new TnRuntime();
    generated.mount();
    generated.invoke(parent.id, 'bump', []);
    expect(generated.string(generated.getState('trace'))).toBe(expected);
  });

  it('suppresses a failure from an action invalidated during a host callback', () => {
    const screen = structuredClone(runtimeScreen);
    screen.program!.instances[0].methods.fail = {
      params: [],
      body: [
        { kind: 'assign', key: 'count', value: literal(2) },
        {
          kind: 'throw',
          message: { kind: 'literal', value: 'old generation failure' },
        },
      ],
    };
    const { TnRuntime } = execute(screen);
    const runtime = new TnRuntime();
    runtime.mount();
    let recycle = true;
    runtime.changed = () => {
      if (recycle) {
        recycle = false;
        runtime.unmount();
        runtime.mount();
      }
    };
    expect(() => runtime.invoke('parent', 'fail', [])).not.toThrow();
    expect(runtime.string(runtime.getState('count'))).toBe('2');
  });

  it('keeps cleanup permissions inside lifecycle hooks when notifying the native host of unmount', () => {
    const screen = structuredClone(runtimeScreen);
    const parent = screen.program!.instances[0];
    parent.beforeUnmount = 'cleanup';
    parent.methods.cleanup = {
      params: [],
      body: [{ kind: 'assign', key: 'draft', value: literal(5) }],
    };
    const { TnRuntime } = execute(screen);
    const runtime = new TnRuntime();
    runtime.mount();
    let invalidations = 0;
    runtime.changed = () => {
      if (++invalidations === 2) runtime.invoke('parent', 'bump', []);
    };

    runtime.unmount();
    expect(invalidations).toBe(2);
    expect(runtime.string(runtime.getState('draft'))).toBe('5');
    expect(runtime.string(runtime.getState('count'))).toBe('1');
    runtime.mount();
    expect(runtime.string(runtime.prop('child', 'value'))).toBe('1');
  });

  it('mounts and cleans up sibling component subtrees in source order', () => {
    const screen: NativeScreen = {
      name: 'Siblings',
      state: [{ key: 'trace', value: '' }],
      root: { kind: 'container', children: [] },
      program: { instances: [] },
    };
    const instances = screen.program!.instances;
    for (const id of ['P', 'A', 'B']) {
      const methods: Record<string, NativeMethod> = {};
      for (const [method, label] of [
        ['before', 'b'],
        ['mounted', 'm'],
        ['watch', 'i'],
        ['beforeUnmount', 'u'],
        ['unmounted', 'd'],
      ])
        methods[method] = {
          params: [],
          body: [
            {
              kind: 'assign',
              key: 'trace',
              value: {
                kind: 'binary',
                operator: '+',
                left: { kind: 'state', key: 'trace' },
                right: { kind: 'literal', value: id + label },
              },
            },
          ],
        };
      instances.push({
        id,
        ...(id === 'P' ? {} : { parent: 'P' }),
        props: { value: literal(1) },
        emitters: {},
        methods,
        watchers:
          id === 'P'
            ? []
            : [{ key: 'value', method: 'watch', immediate: true }],
        beforeMount: 'before',
        onMounted: 'mounted',
        beforeUnmount: 'beforeUnmount',
        onUnmounted: 'unmounted',
      });
    }
    const { TnRuntime } = execute(screen);
    const runtime = new TnRuntime();
    runtime.mount();
    expect(runtime.string(runtime.getState('trace'))).toBe('PbAbAiAmBbBiBmPm');
    runtime.unmount();
    expect(runtime.string(runtime.getState('trace'))).toBe(
      'PbAbAiAmBbBiBmPmPuAuAdBuBdPd'
    );
  });

  it('escapes Swift control characters without rewriting literal escape text', () => {
    expect(nativeString('\b\f', 'swift')).toBe('"\\u{8}\\u{c}"');
    expect(nativeString('\\u0000', 'swift')).toBe('"\\\\u0000"');
  });

  it('emits all three runtime implementations and escapes source literals', () => {
    for (const language of ['swift', 'kotlin', 'ark'] as const) {
      const source = nativeRuntimeSource(runtimeScreen, language);
      expect(source).toContain('TnRuntime');
      expect(source).toContain('watch');
      expect(source).toContain('generation');
      expect(source).toContain('watch failed');
    }
    expect(nativeString('$value', 'kotlin')).toBe('"\\$value"');
  });
});
