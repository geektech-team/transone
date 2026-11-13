import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { normalizePlatform } from 'transone/platform';
import { createComponentIndex } from '../src/components';
import { compileUnit, finalizeComponentProperties } from '../src/mp/compile';
import { MP_DIALECTS, type MpDialect } from '../src/mp/dialect';
import { generateComponentJs } from '../src/mp/jsgen';
import { getPropsContainer } from '../src/mp/props-runtime';
import { loadTypescript } from '../src/mp/ts-loader';
import type { CompiledUnit, CompileContext } from '../src/mp/types';

const targets = [
  'mp-weixin',
  'mp-alipay',
  'mp-bytedance',
  'mp-xiaohongshu',
] as const;
type Target = (typeof targets)[number];
interface Fixture {
  dialect: MpDialect;
  units: Map<string, CompiledUnit>;
}
const fixtures = new Map<Target, Fixture>();
let root: string;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'transone-native-receiver-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        paths: {
          transone: [resolve(import.meta.dir, '../../transone/lib/index.ts')],
          'transone/platform': [
            resolve(import.meta.dir, '../../transone/lib/platform/index.ts'),
          ],
        },
      },
    })
  );
  const sources: Record<string, string> = {
    Leaf: `import {Component,h,Bind,Emit,WatchProps} from 'transone';
      export class Leaf extends Component<{value:unknown}> {
        initState(){return {};}initStyles(){}render(){return h('view',{},this.props.value);}
        @Emit('leaf') send(value:unknown){return value;}
        @Bind() update(value:unknown):void{this.setProps({value});}
        @WatchProps('value') first(value:unknown):void{this.send(value);}
        @WatchProps('value') second(value:unknown):void{this.emit('afterWatch',value);}
      }`,
  };
  for (const plain of [false, true]) {
    const prefix = plain ? 'Plain' : '';
    for (const [name, child, event] of [
      ['Branch', 'Leaf', 'leaf'],
      ['Top', `${prefix}Branch`, 'branch'],
    ]) {
      const className = `${prefix}${name}`;
      sources[className] =
        `import {Component,createComponent,Emit} from 'transone';import {${child}} from './${child}';
        export class ${className} extends Component {
          initState(){return {};}initStyles(){}
          render(){return createComponent({component:${child},emitters:{${event}:this.forward}});}
          ${plain ? `forward(value:unknown):void{this.emit('${name.toLowerCase()}',value);}` : `@Emit('${name.toLowerCase()}') forward(value:unknown){return value;}`}
        }`;
    }
  }
  sources.main = `export {Top} from './Top';export {PlainTop} from './PlainTop';`;
  for (const [name, text] of Object.entries(sources))
    writeFileSync(join(root, 'src', `${name}.ts`), text);
  const ts = await loadTypescript();
  for (const target of targets) {
    const dialect = MP_DIALECTS[target]!;
    const index = createComponentIndex({
      root,
      entrypoints: [join(root, 'src/main.ts')],
      platform: normalizePlatform(target)!,
    });
    const context: CompileContext = {
      ts,
      index,
      root,
      files: new Map(),
      components: new Map(),
      compiling: new Set(),
      callSites: new Map(),
      lengthUnit: 'px',
      dialect,
      warnings: [],
    };
    for (const [className, name] of [
      ['Top', 'top'],
      ['PlainTop', 'plain-top'],
    ]) {
      const reference = index.findClass(
        join(root, 'src', `${className}.ts`),
        className!
      )!;
      compileUnit(
        context,
        { ...reference, reference },
        { kind: 'component', name: name! }
      );
    }
    finalizeComponentProperties(context);
    fixtures.set(target, { dialect, units: context.components });
  }
});
afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

function host(fixture: Fixture, name: string) {
  const unit = fixture.units.get(name)!;
  let definition: Record<string, any> = {};
  new Function('Component', generateComponentJs(unit, fixture.dialect))(
    (next: typeof definition) => (definition = next)
  );
  const alipay = fixture.dialect.id === 'mp-alipay';
  const received: unknown[][] = [];
  const routes = new Map<string, (...args: any[]) => unknown>();
  let onEvent: ((event: string, args: unknown[]) => void) | undefined;
  let onSetData: ((patch: Record<string, unknown>) => void) | undefined;
  const emit = (event: string, args: unknown[]) => {
    received.push([event, ...args]);
    onEvent?.(event, args);
  };
  const value: Record<string, any> = {
    ...definition.methods,
    data: structuredClone(definition.data),
    props: { ...definition.props },
    properties: {},
    setData(patch: Record<string, unknown>, callback?: () => void) {
      Object.assign(this.data, patch);
      onSetData?.(patch);
      callback?.();
    },
  };
  if (alipay) {
    for (const event of unit.customEvents) {
      const prop =
        'onTransoneEvent' +
        Array.from(
          event,
          (char) => '_' + char.charCodeAt(0).toString(16).padStart(4, '0')
        ).join('');
      value.props[prop] = (...args: unknown[]) => emit(event, args);
    }
  } else {
    value.triggerEvent = (event: string, detail: { args: unknown[] }) => {
      emit(event, detail.args);
      routes.get(event)?.({ detail });
    };
  }
  const hooks = alipay ? definition : definition.lifetimes;
  const mount = () => {
    hooks?.[alipay ? 'onInit' : 'attached']?.call(value);
    hooks?.didMount?.call(value);
  };
  const detach = () => hooks?.[alipay ? 'didUnmount' : 'detached']?.call(value);
  const setNativeProps = (props: Record<string, unknown>) => {
    const key = getPropsContainer(fixture.dialect);
    if (key === 'data') Object.assign(value.data, { __transone_props: props });
    else value[key] = { ...value[key], __transone_props: props };
  };
  return {
    value,
    unit,
    received,
    mount,
    detach,
    setNativeProps,
    setOnEvent: (callback?: typeof onEvent) => {
      onEvent = callback;
    },
    setOnSetData: (callback?: typeof onSetData) => {
      onSetData = callback;
    },
    setRoute: (event: string, callback?: (...args: any[]) => unknown) => {
      if (callback) routes.set(event, callback);
      else routes.delete(event);
    },
  };
}
type Host = ReturnType<typeof host>;

function connection(
  fixture: Fixture,
  child: Host,
  parent: Host,
  event: string
) {
  const alipay = fixture.dialect.id === 'mp-alipay';
  const pattern = alipay
    ? /\b(onTransoneEvent(?:_[0-9a-f]{4})+)="([^"]+)"/
    : new RegExp(`bind:${event}="([^"]+)"`);
  const match = parent.unit.template.match(pattern)!;
  const handler = match[alipay ? 2 : 1]!;
  const invoke = (callback: (...args: any[]) => unknown, args: unknown[]) =>
    alipay ? callback(...args) : callback({ detail: { args } });
  const replace = (callback?: (...args: any[]) => unknown) => {
    if (alipay) {
      if (callback) child.value.props[match[1]!] = callback;
      else delete child.value.props[match[1]!];
    } else child.setRoute(event, callback);
  };
  const fresh = () => {
    const callback = parent.value[handler].bind(parent.value);
    replace(callback);
    return callback;
  };
  fresh();
  return { handler, invoke, replace, fresh };
}
function tree(target: Target, plain = false) {
  const fixture = fixtures.get(target)!;
  const leaf = host(fixture, 'leaf');
  const branch = host(fixture, plain ? 'plain-branch' : 'branch');
  const top = host(fixture, plain ? 'plain-top' : 'top');
  leaf.setNativeProps({ value: null });
  for (const runtime of [top, branch, leaf]) runtime.mount();
  return {
    leaf,
    branch,
    top,
    left: connection(fixture, leaf, branch, 'leaf'),
    right: connection(fixture, branch, top, 'branch'),
  };
}

describe('generated native component receiver scopes', () => {
  for (const target of targets) {
    for (const plain of [false, true])
      it(`${target} invalidates retained ${plain ? 'plain' : 'decorated'} receivers on each mount`, () => {
        const { leaf, branch, top, left, right } = tree(target, plain);
        if (plain) {
          expect(branch.unit.initialization).toBeUndefined();
          expect(branch.unit.decoratedMethods ?? []).toEqual([]);
          expect(branch.unit.lifecycle).toEqual([]);
          expect(branch.value.__transone_mount_phase?.mounted).toBe(true);
        }
        const payload = { nested: [1, 2] };
        leaf.value.send(payload);
        expect(top.received[top.received.length - 1]?.[1]).toBe(payload);
        for (const [receiver, binding] of [
          [branch, left],
          [top, right],
        ] as const) {
          for (let attempt = 0; attempt < 2; attempt++) {
            const old = receiver.value[binding.handler];
            expect(receiver.value[binding.handler]).toBe(old);
            const callback = old.bind(receiver.value);
            const before = top.received.length;
            receiver.detach();
            binding.invoke(callback, [payload]);
            expect(top.received).toHaveLength(before);
            receiver.mount();
            binding.invoke(callback, [payload]);
            expect(top.received).toHaveLength(before);
            const current = receiver.value[binding.handler];
            expect(current).not.toBe(old);
            expect(receiver.value[binding.handler]).toBe(current);
            binding.fresh();
            leaf.value.send(payload);
            expect(top.received).toHaveLength(before + 1);
            expect(top.received[top.received.length - 1]?.[1]).toBe(payload);
          }
        }
      });

    it(`${target} uses callback replacements and survives repeated active failures`, () => {
      const { leaf, top, left } = tree(target);
      const payload = { nested: [3] };
      const replacement: unknown[] = [];
      left.replace((eventOrPayload: any) => {
        replacement.push(
          target === 'mp-alipay'
            ? eventOrPayload
            : eventOrPayload.detail.args[0]
        );
      });
      leaf.value.send(payload);
      left.replace();
      leaf.value.send(payload);
      expect(replacement).toEqual([payload]);
      expect(replacement[0]).toBe(payload);
      expect(top.received).toEqual([]);
      left.fresh();
      for (let failure = 0; failure < 2; failure++) {
        top.setOnEvent((event) => {
          if (event === 'top') throw new Error('active receiver failure');
        });
        expect(() => leaf.value.update({ failure })).toThrow(
          'active receiver failure'
        );
      }
      top.setOnEvent();
      leaf.value.update(payload);
      expect(top.received[top.received.length - 1]?.[1]).toBe(payload);
      expect(leaf.received[leaf.received.length - 1]).toEqual([
        'afterWatch',
        payload,
      ]);
    });

    it(`${target} discards failed setProps tails when publication remounts`, () => {
      const { leaf, top } = tree(target);
      const published: unknown[] = [];
      for (let failure = 0; failure < 2; failure++) {
        const oldValue = { failure };
        const freshValue = { mount: failure };
        top.setOnEvent((event) => {
          if (event === 'top') throw new Error('old watcher failure');
        });
        let remounted = false;
        leaf.setOnSetData((patch) => {
          if (
            !Object.prototype.hasOwnProperty.call(
              patch,
              '__transone_render_props'
            )
          )
            return;
          published.push(
            (patch.__transone_render_props as { value: unknown }).value
          );
          if (remounted) return;
          remounted = true;
          leaf.detach();
          leaf.setNativeProps({ value: freshValue });
          leaf.mount();
        });
        expect(() => leaf.value.update(oldValue)).not.toThrow();
        expect(remounted).toBe(true);
        expect(published[published.length - 1]).toBe(freshValue);
        top.setOnEvent();
        leaf.setOnSetData();
        const payload = { recovered: failure };
        leaf.value.update(payload);
        expect(top.received[top.received.length - 1]?.[1]).toBe(payload);
        expect(leaf.received[leaf.received.length - 1]).toEqual([
          'afterWatch',
          payload,
        ]);
      }
    });

    it(`${target} preserves same-scope failed commits and publication errors`, () => {
      const { leaf, top } = tree(target);
      const watcherError = new Error('watcher failed');
      const nativeError = new Error('native publication failed');
      const payload = { nested: [4] };
      top.setOnEvent((event) => {
        if (event === 'top') throw watcherError;
      });
      leaf.setOnSetData((patch) => {
        if (
          Object.prototype.hasOwnProperty.call(patch, '__transone_render_props')
        )
          throw nativeError;
      });
      let failure: any;
      try {
        leaf.value.update(payload);
      } catch (error) {
        failure = error;
      }
      expect(failure?.name).toBe('AggregateError');
      expect(failure?.errors).toEqual([watcherError, nativeError]);
      expect(leaf.value.data.__transone_render_props.value).toBe(payload);
      top.setOnEvent();
      leaf.setOnSetData();
      const fresh = { recovered: true };
      leaf.value.update(fresh);
      expect(top.received[top.received.length - 1]?.[1]).toBe(fresh);
      expect(leaf.received[leaf.received.length - 1]).toEqual([
        'afterWatch',
        fresh,
      ]);
    });
  }
});
