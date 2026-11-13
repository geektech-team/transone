import { describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  nativeExpression,
  nativeRuntimeSource,
} from '../src/app/runtime-codegen';
import type { NativeExpression as Expr, NativeScreen } from '../src/app/types';

const number = (value: number): Expr => ({ kind: 'literal', value });
const text = (value: string): Expr => ({ kind: 'literal', value });
const ref = (id: string): Expr => ({ kind: 'value-ref', id });
const state = (key: string): Expr => ({ kind: 'state', key });
const local = (name: string): Expr => ({ kind: 'local', name });
const member = (target: Expr, key: string): Expr => ({
  kind: 'member',
  target,
  key: text(key),
});
const object = (values: Record<string, Expr>): Expr => ({
  kind: 'object',
  entries: Object.entries(values).map(([key, value]) => ({
    key: text(key),
    value,
  })),
});

export function complexScreen(): NativeScreen {
  return {
    name: 'Complex',
    state: [
      { key: 'model', value: 0 },
      { key: 'alias', value: 0 },
      { key: 'received', value: 0 },
      { key: 'seed', value: 0 },
      { key: 'changes', value: 0 },
      { key: 'views', value: 0 },
      { key: 'unused', value: 0 },
    ],
    root: { kind: 'container', children: [] },
    program: {
      values: [
        {
          id: 'nested',
          value: object({ n: number(1) }) as Extract<Expr, { kind: 'object' }>,
        },
        {
          id: 'model',
          value: object({
            nested: ref('nested'),
            items: {
              kind: 'array',
              items: [
                { value: ref('nested') },
                { value: { kind: 'undefined' } },
                { value: { kind: 'literal', value: null } },
              ],
            },
          }) as Extract<Expr, { kind: 'object' }>,
        },
        {
          id: 'view',
          value: object({ value: ref('model'), n: number(1) }) as Extract<
            Expr,
            { kind: 'object' }
          >,
        },
      ],
      initialState: {
        model: ref('model'),
        alias: ref('nested'),
        seed: ref('view'),
      },
      instances: [
        {
          id: 'parent',
          props: {},
          emitters: {},
          watchers: [],
          renderDependencies: [state('model'), member(state('alias'), 'n')],
          methods: {
            receive: {
              params: ['value'],
              body: [
                { kind: 'assign', key: 'received', value: local('value') },
              ],
            },
            unused: {
              params: [],
              body: [
                {
                  kind: 'assign',
                  key: 'unused',
                  value: {
                    kind: 'binary',
                    operator: '+',
                    left: state('unused'),
                    right: number(1),
                  },
                },
              ],
            },
            nested: {
              params: ['n'],
              body: [
                {
                  kind: 'set-member',
                  target: state('alias'),
                  key: text('n'),
                  value: local('n'),
                },
              ],
            },
            replace: {
              params: [],
              body: [
                {
                  kind: 'assign',
                  key: 'model',
                  value: {
                    kind: 'object',
                    entries: [
                      { spread: true, value: state('model') },
                      { key: text('extra'), value: number(2) },
                    ],
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
            model: state('model'),
            view: {
              kind: 'memo',
              owner: 'parent',
              key: 'view',
              initial: ref('view'),
              value: object({
                value: state('model'),
                n: member(state('alias'), 'n'),
              }),
            },
          },
          emitters: { change: { instance: 'parent', method: 'receive' } },
          watchers: [
            { key: 'model', method: 'changed', immediate: false },
            { key: 'view', method: 'viewChanged', immediate: false },
          ],
          methods: {
            changed: {
              params: ['next', 'old'],
              body: [
                {
                  kind: 'assign',
                  key: 'changes',
                  value: {
                    kind: 'binary',
                    operator: '+',
                    left: state('changes'),
                    right: number(1),
                  },
                },
              ],
            },
            viewChanged: {
              params: [],
              body: [
                {
                  kind: 'assign',
                  key: 'views',
                  value: {
                    kind: 'binary',
                    operator: '+',
                    left: state('views'),
                    right: number(1),
                  },
                },
              ],
            },
            send: {
              params: [],
              emit: 'change',
              body: [
                {
                  kind: 'return',
                  value: object({
                    value: state('model'),
                    items: {
                      kind: 'array',
                      items: [{ value: state('alias') }],
                    },
                  }),
                },
              ],
            },
            forward: { params: ['value'], emit: 'change', body: [] },
          },
        },
      ],
    },
  };
}
function execute(screen = complexScreen()): any {
  const code = new Bun.Transpiler({ loader: 'ts' }).transformSync(
    nativeRuntimeSource(screen, 'ark')
  );
  return new Function(code + '\nreturn {TnRuntime,TnValue,TnEntry,TnItem};')();
}

describe('generated complex native values', () => {
  it('emits unpaired UTF-16 data as units instead of an invalid Swift literal', () => {
    expect(nativeExpression(text('\ud83d'), 'swift')).toBe(
      'TnValue.utf16([55357])'
    );
    expect(nativeExpression(text('😀'), 'swift')).toContain('TnValue.str');
  });
  it.skipIf(!existsSync('/usr/bin/swift'))(
    'executes shared complex IR through real generated Swift',
    async () => {
      const root = mkdtempSync(
        join(tmpdir(), 'transone-complex-swift-codegen-')
      );
      try {
        const screen = complexScreen();
        screen.program!.values!.push({
          id: 'units',
          value: object({
            first: text('\ud83d'),
            last: text('\ude00'),
          }) as Extract<Expr, { kind: 'object' }>,
        });
        const file = join(root, 'main.swift');
        writeFileSync(
          file,
          nativeRuntimeSource(screen, 'swift') +
            `
let runtime = TnRuntime()
try runtime.mount()
print(runtime.same(try runtime.member(runtime.getState("model"), TnValue.str("nested")), runtime.getState("alias")))
print(runtime.same(runtime.prop("child", "view"), runtime.getState("seed")))
let payload = try runtime.invoke("child", "send", [])
print(runtime.same(payload, runtime.getState("received")))
_ = try runtime.invoke("parent", "nested", [TnValue.num(9)])
print(runtime.string(runtime.getState("changes")))
print(runtime.string(runtime.getState("views")))
_ = try runtime.invoke("parent", "replace", [])
print(runtime.string(runtime.getState("changes")))
print(runtime.string(runtime.getState("views")))
let units = runtime.reference("units")
let first = try runtime.member(units, TnValue.str("first"))
let last = try runtime.member(units, TnValue.str("last"))
print(runtime.same(first, last))
print(runtime.same(try runtime.binary("+", first, last), TnValue.str("😀")))
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
            'true',
            'true',
            'true',
            '0',
            '1',
            '1',
            '2',
            'false',
            'true',
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
  it('preserves initial aliases and isolates each runtime graph', () => {
    const { TnRuntime, TnValue } = execute();
    const a = new TnRuntime(),
      b = new TnRuntime();
    a.mount();
    b.mount();
    const nested = a.member(a.getState('model'), TnValue.str('nested'));
    expect(a.same(nested, a.getState('alias'))).toBe(true);
    expect(a.same(a.prop('child', 'view'), a.getState('seed'))).toBe(true);
    expect(a.same(a.getState('model'), b.getState('model'))).toBe(false);
    a.invoke('parent', 'nested', [TnValue.num(9)]);
    expect(a.member(nested, TnValue.str('n')).number).toBe(9);
    expect(b.member(b.getState('alias'), TnValue.str('n')).number).toBe(1);
    expect(a.getState('changes').number).toBe(0);
    expect(a.getState('views').number).toBe(1);
  });
  it('forwards the exact returned or original complex payload reference', () => {
    const { TnRuntime } = execute();
    const r = new TnRuntime();
    r.mount();
    const first = r.invoke('child', 'send', []),
      second = r.invoke('child', 'send', []);
    expect(r.same(first, second)).toBe(false);
    expect(r.same(second, r.getState('received'))).toBe(true);
    r.invoke('child', 'forward', [first]);
    expect(r.same(first, r.getState('received'))).toBe(true);
  });
  it('memoizes render allocations without making WatchProps deep', () => {
    const { TnRuntime } = execute();
    const r = new TnRuntime();
    r.mount();
    const first = r.prop('child', 'view');
    r.invoke('parent', 'unused', []);
    r.invoke('parent', 'unused', []);
    expect(r.same(first, r.prop('child', 'view'))).toBe(true);
    expect(r.getState('views').number).toBe(0);
    r.invoke('parent', 'replace', []);
    expect(r.getState('changes').number).toBe(1);
    expect(r.getState('views').number).toBe(1);
  });
  it('keeps holes, undefined and shallow spread aliases with JS coercion', () => {
    const { TnRuntime, TnValue, TnEntry, TnItem } = execute();
    const r = new TnRuntime();
    const nested = r.makeObject([
      new TnEntry(TnValue.str('n'), TnValue.num(1)),
    ]);
    const array = r.makeArray([
      new TnItem(TnValue.undefined, false, true),
      new TnItem(TnValue.undefined),
      new TnItem(nested),
    ]);
    const copy = r.makeArray([new TnItem(array, true)]);
    expect(r.member(array, TnValue.str('length')).number).toBe(3);
    expect(r.same(r.member(copy, TnValue.num(2)), nested)).toBe(true);
    expect(r.string(array)).toBe(',,[object Object]');
    expect(r.binary('+', r.makeArray([]), r.makeArray([])).text).toBe('');
    expect(r.unary('Number', r.makeArray([])).number).toBe(0);
    r.setMember(copy, TnValue.str('length'), TnValue.num(1));
    expect(r.member(copy, TnValue.str('length')).number).toBe(1);
    expect(() => r.member(TnValue.nullValue, TnValue.str('n'))).toThrow();
    expect(r.member(TnValue.nullValue, TnValue.str('n'), true).kind).toBe(
      'undefined'
    );
  });
});
