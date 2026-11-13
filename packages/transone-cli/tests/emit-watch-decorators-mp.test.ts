import { describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from '../src/build';
import { compileUnit, finalizeComponentProperties } from '../src/mp/compile';
import { MP_DIALECTS } from '../src/mp/dialect';
import { generateComponentJs, generatePageJs } from '../src/mp/jsgen';
import { getPropsContainer } from '../src/mp/props-runtime';
import { loadTypescript } from '../src/mp/ts-loader';
import type { CompiledUnit, CompileContext, UnitKind } from '../src/mp/types';

const targets = [
  'mp-weixin',
  'mp-alipay',
  'mp-bytedance',
  'mp-xiaohongshu',
] as const;
type Target = (typeof targets)[number];

async function compile(
  text: string,
  target: Target = 'mp-weixin',
  kind: UnitKind = 'component'
) {
  const ts = await loadTypescript();
  const source = ts.createSourceFile(
    '/test.ts',
    text,
    ts.ScriptTarget.Latest,
    true
  );
  const declaration = source.statements.find(ts.isClassDeclaration)!;
  const context: CompileContext = {
    ts,
    root: '/',
    files: new Map(),
    components: new Map(),
    compiling: new Set(),
    callSites: new Map(),
    lengthUnit: 'px',
    dialect: MP_DIALECTS[target]!,
    warnings: [],
  };
  const unit = compileUnit(
    context,
    {
      filePath: source.fileName,
      source,
      declaration,
      className: declaration.name!.text,
    },
    { kind, name: 'card' }
  );
  finalizeComponentProperties(context);
  return unit;
}

function execute(
  unit: CompiledUnit,
  target: Target = 'mp-weixin',
  feedback?: 'sync' | 'queued' | 'both',
  generatedSource?: string
) {
  const dialect = MP_DIALECTS[target]!;
  let definition: Record<string, any> = {};
  new Function(
    'Component',
    'Page',
    generatedSource ??
      (unit.kind === 'page'
        ? generatePageJs(unit, dialect)
        : generateComponentJs(unit, dialect))
  )(
    (next: typeof definition) => (definition = next),
    (next: typeof definition) => (definition = next)
  );
  const calls: unknown[][] = [];
  const queuedObservers: Array<() => void> = [];
  const callbackProps =
    target === 'mp-alipay'
      ? Object.fromEntries(
          Object.keys(definition.props ?? {})
            .filter((key) => key.startsWith('onTransoneEvent'))
            .map((key) => {
              const name = key
                .slice('onTransoneEvent'.length)
                .split('_')
                .slice(1)
                .map((code) => String.fromCharCode(parseInt(code, 16)))
                .join('');
              return [
                key,
                (...args: unknown[]) => {
                  calls.push([name, ...args]);
                  onEvent?.(name, args);
                },
              ];
            })
        )
      : {};
  const value: Record<string, any> = {
    ...(unit.kind === 'page' ? definition : definition.methods),
    data: structuredClone(definition.data),
    properties: {},
    props: { ...callbackProps },
    setData(patch: Record<string, any>, callback?: () => void) {
      const container = getPropsContainer(dialect);
      const previous = this[container];
      Object.assign(this.data, patch);
      if (
        container === 'properties' &&
        Object.prototype.hasOwnProperty.call(patch, '__transone_props')
      )
        this.properties = {
          ...this.properties,
          __transone_props: patch.__transone_props,
        };
      if (feedback === 'sync' || feedback === 'both') observe(previous);
      if (feedback === 'queued' || feedback === 'both')
        queuedObservers.push(() => observe(previous));
      callback?.();
    },
  };
  if (target !== 'mp-alipay')
    value.triggerEvent = function (name: string, payload: { args: unknown[] }) {
      calls.push([name, ...payload.args]);
      onEvent?.(name, payload.args);
    };
  let onEvent: ((name: string, args: unknown[]) => void) | undefined;
  const hooks =
    unit.kind === 'page' || target === 'mp-alipay'
      ? definition
      : definition.lifetimes;
  const mount = () => {
    hooks[
      unit.kind === 'page'
        ? 'onLoad'
        : target === 'mp-alipay'
          ? 'onInit'
          : 'attached'
    ]?.call(value);
    hooks[unit.kind === 'page' ? 'onReady' : 'didMount']?.call(value);
  };
  const detach = () =>
    hooks[
      unit.kind === 'page'
        ? 'onUnload'
        : target === 'mp-alipay'
          ? 'didUnmount'
          : 'detached'
    ]?.call(value);
  const observe = (previous?: object) => {
    if (target === 'mp-alipay') definition.didUpdate?.call(value, previous);
    else
      Object.values(definition.observers ?? {}).forEach((callback) =>
        (callback as Function).call(value)
      );
  };
  const setNativeProps = (props: object, notify = true, packet = true) => {
    const key = getPropsContainer(dialect);
    const previous = value[key];
    const callbacks = Object.fromEntries(
      Object.keys(callbackProps).map((name) => [name, value.props[name]])
    );
    const next = packet
      ? { ...props, ...callbacks, __transone_props: props }
      : { ...props, ...callbacks };
    if (key === 'data') Object.assign(value.data, next);
    else value[key] = next;
    if (notify) observe(previous);
  };
  return {
    value,
    calls,
    definition,
    mount,
    detach,
    observe,
    setNativeProps,
    flushObservers: () => {
      while (queuedObservers.length) queuedObservers.shift()!();
    },
    setOnEvent: (callback: typeof onEvent) => {
      onEvent = callback;
    },
  };
}

const emitProgram = `import { Component, h, Bind, Emit } from 'transone';
class Card extends Component {
 initState(){return {count:0};} initStyles(){} render(){return h('view',{},this.state.count);}
 @Bind() @Emit('change') send(value:number){this.state.count++;return value*2;}
 @Emit('raw') raw(value:number, suffix:string):void {this.state.count += value;}
 @Emit('fail') fail():void {throw new Error('body failed');}
}`;
const watchProgram = `import { Component, h, Bind, WatchProps } from 'transone';
class Card extends Component<{value?:number; other?:number}> {
 initState(){return {count:0};} initStyles(){} render(){return h('view',{},this.state.count);}
 @WatchProps('value',{immediate:true}) first(value:number|undefined, old:number|undefined):void {this.emit('first',value,old);}
 @Bind() @WatchProps('value') second(value:number|undefined, old:number|undefined):void {this.emit('second',value,old);}
}`;
const projectionWatchProgram = `import {Component,h,Bind,WatchProps} from 'transone';
class Card extends Component<{value:unknown}> {
 initState(){return {};}initStyles(){}render(){return h('view',{},this.props.value);}
 @Bind() update(value:unknown):void{this.setProps({value});}
 @Bind() read(){return this.props.value;}
 @WatchProps('value',{immediate:true}) first(value:unknown,old:unknown):void{this.emit('first',value,old);}
 @WatchProps('value') second(value:unknown,old:unknown):void{this.emit('second',value,old);}
 onPropsChange(){this.emit('legacy');}
}`;

describe('mini-program Emit and WatchProps decorators', () => {
  for (const target of targets) {
    it(`${target} cancels an old observer tail across a three-component inherited event remount`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'transone-observer-remount-'));
      try {
        mkdirSync(join(root, 'src'));
        writeFileSync(
          join(root, 'transone.config.ts'),
          `export default {entry:'src/main.ts',outDir:'dist'};`
        );
        writeFileSync(
          join(root, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              paths: {
                transone: [
                  resolve(import.meta.dir, '../../transone/lib/index.ts'),
                ],
              },
            },
          })
        );
        writeFileSync(
          join(root, 'src/Leaf.ts'),
          `import {BaseComponent,h,Emit,WatchProps} from 'transone';
          class Base extends BaseComponent<{value:number}> {
            initState(){return {};}initStyles(){}
            @Emit('base') send(value:number){return value+1;}
            @WatchProps('value',{immediate:true}) first(value:number):void{this.send(value);}
          }
          class Middle extends Base {
            @Emit('middle') send(value:number){return super.send(value)+1;}
          }
          export class Leaf extends Middle {
            render(){return h('view',{},this.props.value);}
            @Emit('leaf') send(value:number){return super.send(value)+1;}
            @WatchProps('value') second(value:number):void{this.emit('second',value);}
            onPropsChange(){this.emit('legacy',this.props.value);}
          }`
        );
        for (const [name, child, event] of [
          ['Branch', 'Leaf', 'leaf'],
          ['Top', 'Branch', 'branch'],
        ])
          writeFileSync(
            join(root, `src/${name}.ts`),
            `import {Component,createComponent,Emit} from 'transone';import {${child}} from './${child}';
            export class ${name} extends Component<{value:number}> {
              initState(){return {};}initStyles(){}
              render(){return createComponent({component:${child},props:{value:this.props.value},emitters:{${event}:(value:number)=>this.forward(value)}});}
              @Emit('${name.toLowerCase()}') forward(value:number){return value;}
            }`
          );
        writeFileSync(
          join(root, 'src/main.ts'),
          `import {Component,createComponent,createApp} from 'transone';import {Top} from './Top';
          class App extends Component {initState(){return {};}initStyles(){}render(){return createComponent(Top,{value:1});}}
          createApp({root:App});`
        );
        const result = await build({ root, target });
        const load = (name: string) =>
          execute(
            { kind: 'component' } as CompiledUnit,
            target,
            undefined,
            readFileSync(
              join(result.outDir, `components/${name}/${name}.js`),
              'utf8'
            )
          );
        const leaf = load('leaf');
        const branch = load('branch');
        const top = load('top');
        const connect = (
          child: ReturnType<typeof execute>,
          parent: ReturnType<typeof execute>,
          name: string,
          event: string
        ) => {
          if (target === 'mp-alipay') {
            const template = readFileSync(
              join(result.outDir, `components/${name}/${name}.axml`),
              'utf8'
            );
            const [, prop, handler] = template.match(
              /\b(onTransoneEvent(?:_[0-9a-f]{4})+)="([^"]+)"/
            )!;
            const record = child.value.props[prop!];
            child.value.props[prop!] = (...args: unknown[]) => {
              record(...args);
              parent.value[handler!](...args);
            };
          } else
            child.setOnEvent((emitted, args) => {
              if (emitted === event)
                parent.value[`__transone_emitter_${event}_0`]({
                  detail: { args },
                });
            });
        };
        connect(leaf, branch, 'branch', 'leaf');
        connect(branch, top, 'top', 'branch');
        for (const runtime of [top, branch, leaf]) {
          runtime.setNativeProps({ value: 1 }, false);
          runtime.mount();
          runtime.calls.length = 0;
        }
        const published: unknown[] = [];
        const nativeSetData = leaf.value.setData;
        leaf.value.setData = function (patch: Record<string, unknown>) {
          if (
            Object.prototype.hasOwnProperty.call(
              patch,
              '__transone_render_props'
            )
          )
            published.push(patch.__transone_render_props);
          return nativeSetData.call(this, patch);
        };
        top.setOnEvent((name, args) => {
          if (name === 'top' && args[0] === 5) {
            leaf.detach();
            leaf.setNativeProps({ value: 3 }, false);
            leaf.mount();
          }
        });
        const oldSend = leaf.value.send;
        leaf.setNativeProps({ value: 2 });
        expect(leaf.calls).toEqual([
          ['leaf', 5],
          ['leaf', 6],
        ]);
        expect(published).toEqual([{ value: 3 }]);
        expect(oldSend(100)).toBeUndefined();
        leaf.setNativeProps({ value: 4 });
        expect(leaf.calls.slice(2)).toEqual([
          ['leaf', 7],
          ['second', 4],
          ['legacy', 4],
        ]);
        leaf.calls.length = 0;
        published.length = 0;
        leaf.value.setData = function (patch: Record<string, unknown>) {
          const result = nativeSetData.call(this, patch);
          if (
            Object.prototype.hasOwnProperty.call(
              patch,
              '__transone_render_props'
            )
          ) {
            published.push(patch.__transone_render_props);
            if (
              (patch.__transone_render_props as { value: number }).value === 5
            ) {
              leaf.detach();
              leaf.setNativeProps({ value: 6 }, false);
              leaf.mount();
            }
          }
          return result;
        };
        leaf.setNativeProps({ value: 5 });
        expect(leaf.calls).toEqual([
          ['leaf', 8],
          ['second', 5],
          ['leaf', 9],
        ]);
        expect(published).toEqual([{ value: 5 }, { value: 6 }]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it(`${target} still publishes native committed props and aggregates failures in the same observer scope`, async () => {
      const runtime = execute(await compile(watchProgram, target), target);
      runtime.setNativeProps({ value: 1 }, false);
      runtime.mount();
      runtime.calls.length = 0;
      const failure = new Error('watch failed');
      const publishFailure = new Error('native publication failed');
      runtime.setOnEvent(() => {
        throw failure;
      });
      const nativeSetData = runtime.value.setData;
      runtime.value.setData = function (patch: Record<string, unknown>) {
        nativeSetData.call(this, patch);
        if (
          Object.prototype.hasOwnProperty.call(patch, '__transone_render_props')
        )
          throw publishFailure;
      };
      let thrown: unknown;
      try {
        runtime.setNativeProps({ value: 2 });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toMatchObject({
        name: 'AggregateError',
        errors: [failure, publishFailure],
      });
      expect(runtime.value.data.__transone_render_props).toEqual({ value: 2 });
      runtime.setOnEvent(undefined);
      runtime.value.setData = nativeSetData;
      runtime.setNativeProps({ value: 3 });
      expect(runtime.calls).toEqual([
        ['first', 2, 1],
        ['first', 3, 2],
        ['second', 3, 2],
      ]);
      runtime.calls.length = 0;
      runtime.setOnEvent((name, args) => {
        if (name === 'first' && args[0] === 4) throw failure;
      });
      runtime.value.setData = function (patch: Record<string, unknown>) {
        const result = nativeSetData.call(this, patch);
        if (
          (patch.__transone_render_props as { value?: number } | undefined)
            ?.value === 4
        ) {
          runtime.detach();
          runtime.setNativeProps({ value: 5 }, false);
          runtime.mount();
        }
        return result;
      };
      expect(() => runtime.setNativeProps({ value: 4 })).not.toThrow();
      expect(runtime.calls).toEqual([
        ['first', 4, 3],
        ['first', 5, undefined],
      ]);
    });

    it(`${target} preserves inherited watches in source order and lets an override cancel base decorators`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'transone-emit-watch-inherit-'));
      try {
        mkdirSync(join(root, 'src'));
        writeFileSync(
          join(root, 'package.json'),
          JSON.stringify({
            name: 'emit-watch-fixture',
            private: true,
            type: 'module',
          })
        );
        writeFileSync(
          join(root, 'transone.config.ts'),
          `export default {entry:'src/main.ts',outDir:'dist'};`
        );
        writeFileSync(
          join(root, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              paths: {
                transone: [
                  resolve(import.meta.dir, '../../transone/lib/index.ts'),
                ],
              },
            },
          })
        );
        writeFileSync(
          join(root, 'src/Base.ts'),
          `import {BaseComponent,Emit,WatchProps} from 'transone';
          export class Base extends BaseComponent<{value?:number}> {
            initState(){return {};}initStyles(){}
            @Emit('base') send(value:number){return value;}
            @Emit('removed') plain(value:number){return value;}
            @WatchProps('value') overriddenFirst():void{this.emit('baseOverridden');}
            @WatchProps('value') baseFirst(value:number|undefined,old:number|undefined):void{this.emit('baseFirst',value,old);}
            @WatchProps('value') hidden():void{this.emit('hidden');}
          }`
        );
        writeFileSync(
          join(root, 'src/Card.ts'),
          `import {h,Bind,WatchProps} from 'transone';import {Base} from './Base';
          export class Card extends Base {
            render(){return h('view',{},this.props.value);}
            @Bind() plain(value:number){return super.plain(value)+1;}
            hidden():void{this.emit('overridden');}
            @WatchProps('value') childSecond(value:number|undefined,old:number|undefined):void{this.emit('childSecond',value,old);}
            @WatchProps('value') overriddenFirst():void{this.emit('leafOverride');}
          }`
        );
        writeFileSync(
          join(root, 'src/main.ts'),
          `import {Component,h,createComponent,createApp} from 'transone';import {Card} from './Card';
          class App extends Component {initState(){return {value:1};}initStyles(){}render(){return h('view',{},[createComponent(Card,{value:this.state.value})]);}}
          createApp({root:App});`
        );
        const result = await build({ root, target });
        const runtime = execute(
          { kind: 'component' } as CompiledUnit,
          target,
          undefined,
          readFileSync(join(result.outDir, 'components/card/card.js'), 'utf8')
        );
        runtime.setNativeProps({ value: 1 }, false);
        runtime.mount();
        runtime.setNativeProps({ value: 2 });
        expect(runtime.calls).toEqual([
          ['baseFirst', 2, 1],
          ['childSecond', 2, 1],
          ['leafOverride'],
        ]);
        expect(runtime.value.plain(3)).toBe(4);
        const send = runtime.value.send;
        expect(send(5)).toBe(5);
        expect(runtime.calls[runtime.calls.length - 1]).toEqual(['base', 5]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it(`${target} emits a returned payload or original arguments and preserves the result`, async () => {
      const unit = await compile(emitProgram, target);
      expect(unit.customEvents).toEqual(['change', 'raw', 'fail']);
      const runtime = execute(unit, target);
      runtime.mount();
      const send = runtime.value.send;
      expect(send(3)).toBe(6);
      expect(runtime.value.raw(2, 'ok')).toBeUndefined();
      expect(runtime.calls).toEqual([
        ['change', 6],
        ['raw', 2, 'ok'],
      ]);
      expect(runtime.value.data.count).toBe(3);
      expect(() => runtime.value.fail()).toThrow('body failed');
      expect(runtime.calls).toHaveLength(2);
      runtime.detach();
      runtime.mount();
      send(100);
      expect(runtime.value.data.count).toBe(3);
      expect(runtime.value.send(4)).toBe(8);
      expect(runtime.calls[runtime.calls.length - 1]).toEqual(['change', 8]);
    });

    it(`${target} invalidates an Emit entry retained by a failed state initializer`, async () => {
      const unit = await compile(emitProgram, target);
      unit.initialization = `function(){this.capture(this.send);if(this.failInitialization)throw new Error('state failed');return {count:0};}`;
      const runtime = execute(unit, target);
      const retained: Array<(value: number) => unknown> = [];
      runtime.value.capture = (callback: (value: number) => unknown) =>
        retained.push(callback);
      runtime.value.failInitialization = true;
      expect(runtime.mount).toThrow('state failed');
      runtime.value.failInitialization = false;
      runtime.mount();
      expect(retained[0]!(10)).toBeUndefined();
      expect(runtime.calls).toEqual([]);
      expect(runtime.value.send(2)).toBe(4);
      expect(runtime.value.data.count).toBe(1);
    });

    it(`${target} uses Object.is for scalar and reference props comparisons`, async () => {
      const runtime = execute(await compile(watchProgram, target), target);
      runtime.setNativeProps({ value: NaN }, false);
      runtime.mount();
      runtime.calls.length = 0;
      runtime.setNativeProps({ value: NaN });
      expect(runtime.calls).toEqual([]);
      runtime.setNativeProps({ value: 0 });
      runtime.setNativeProps({ value: -0 });
      expect(runtime.calls).toHaveLength(4);
      expect(Object.is(runtime.calls[2]![1], -0)).toBe(true);
      const value = { nested: 1 };
      runtime.setNativeProps({ value });
      runtime.calls.length = 0;
      value.nested = 2;
      runtime.setNativeProps({ value });
      expect(runtime.calls).toEqual([]);
      runtime.setNativeProps({ value: { nested: 2 } });
      expect(runtime.calls).toHaveLength(2);
    });

    it(`${target} accepts external native props after a manual commit without any new decorators or legacy hook`, async () => {
      const unit = await compile(
        `import {Component,h,Bind} from 'transone';class Card extends Component<{value?:number}>{
        initState(){return {};}initStyles(){}render(){return h('button',{onClick:this.update},this.props.value);}
        update(value:number):void{this.setProps({value});}
        @Bind() read(){return this.props.value;}
      }`,
        target
      );
      const runtime = execute(unit, target);
      runtime.setNativeProps({ value: 1 }, false);
      runtime.mount();
      runtime.value.update(2);
      runtime.setNativeProps({ value: 4 });
      expect(runtime.value.read()).toBe(4);
      const binding = unit.template.match(/{{([^}]+)}}/)![1]!;
      const values = {
        ...runtime.value.properties,
        ...runtime.value.props,
        ...runtime.value.data,
      };
      expect(
        new Function(...Object.keys(values), 'return (' + binding + ');')(
          ...Object.values(values)
        )
      ).toBe(4);
    });

    it(`${target} keeps internal props projections out of the raw initialized state`, async () => {
      const unit = await compile(
        `import {Component,h,Bind,WatchProps} from 'transone';class Card extends Component<{value?:number}>{
        seed=this.props.value;
        initState(){return {count:this.seed??0};}initStyles(){}render(){return h('view',{},this.state.count);}
        @Bind() update(value:number):void{this.setProps({value});}
        @Bind() keys(){return Object.keys(this.state);}
        @WatchProps('value') changed():void{}
      }`,
        target
      );
      const runtime = execute(unit, target);
      runtime.setNativeProps({ value: 1 }, false);
      runtime.mount();
      expect(runtime.value.keys()).toEqual(['count']);
      runtime.value.update(2);
      expect(runtime.value.keys()).toEqual(['count']);
      runtime.setNativeProps({ value: 3 });
      expect(runtime.value.keys()).toEqual(['count']);
    });

    it(`${target} suppresses the result when an event listener remounts the component`, async () => {
      const runtime = execute(await compile(emitProgram, target), target);
      runtime.mount();
      runtime.setOnEvent(() => {
        runtime.detach();
        runtime.mount();
      });
      expect(runtime.value.send(3)).toBeUndefined();
      expect(runtime.calls).toEqual([['change', 6]]);
    });

    it(`${target} watches only committed props after mounting with an independent baseline each mount`, async () => {
      const unit = await compile(watchProgram, target);
      expect(unit.properties.value).toBeDefined();
      const runtime = execute(unit, target);
      runtime.setNativeProps({ value: 1 });
      expect(runtime.calls).toEqual([]);
      runtime.mount();
      expect(runtime.calls).toEqual([['first', 1, undefined]]);
      runtime.observe();
      runtime.value.setData({ count: 8 });
      runtime.observe();
      expect(runtime.calls).toHaveLength(1);
      runtime.setNativeProps({ value: 2 });
      expect(runtime.calls.slice(1)).toEqual([
        ['first', 2, 1],
        ['second', 2, 1],
      ]);
      runtime.setNativeProps({ value: 2, other: 4 });
      expect(runtime.calls).toHaveLength(3);
      runtime.detach();
      runtime.setNativeProps({ value: 5 });
      expect(runtime.calls).toHaveLength(3);
      runtime.mount();
      expect(runtime.calls[runtime.calls.length - 1]).toEqual([
        'first',
        5,
        undefined,
      ]);
    });

    it(`${target} queues reentrant native changes so every watcher sees the original batch`, async () => {
      const runtime = execute(await compile(watchProgram, target), target);
      runtime.setNativeProps({ value: 1 }, false);
      runtime.mount();
      runtime.calls.length = 0;
      runtime.setOnEvent((name, args) => {
        if (name === 'first' && args[0] === 2)
          runtime.setNativeProps({ value: 3 });
      });
      runtime.setNativeProps({ value: 2 });
      expect(runtime.calls).toEqual([
        ['first', 2, 1],
        ['second', 2, 1],
        ['first', 3, 2],
        ['second', 3, 2],
      ]);
    });

    it(`${target} commits manual props before watchers and renders the latest packet until a native update`, async () => {
      const unit = await compile(
        `import { Component, h, Bind, WatchProps } from 'transone';
      class Card extends Component<{value?:number}> {
        initState(){return {count:0};} initStyles(){} render(){return h('view',{},this.props.value);}
        @Bind() update(value:number){this.setProps({value});return this.props.value;}
        @WatchProps('value') changed(value:number|undefined, old:number|undefined):void {this.emit('changed',value,old);}
      }`,
        target
      );
      const runtime = execute(unit, target);
      runtime.setNativeProps({ value: 1 }, false);
      runtime.mount();
      runtime.setOnEvent((name, args) => {
        if (name === 'changed' && args[0] === 2) runtime.value.update(3);
      });
      expect(runtime.value.update(2)).toBe(3);
      expect(runtime.calls).toEqual([
        ['changed', 2, 1],
        ['changed', 3, 2],
      ]);
      const binding = unit.template.match(/{{([^}]+)}}/)![1]!;
      const render = () => {
        const values = {
          ...runtime.value.properties,
          ...runtime.value.props,
          ...runtime.value.data,
        };
        return new Function(
          ...Object.keys(values),
          'return (' + binding + ');'
        )(...Object.values(values));
      };
      expect(render()).toBe(3);
      runtime.setNativeProps({ value: 4 });
      expect(render()).toBe(4);
      expect(runtime.value.update(5)).toBe(5);
      expect(runtime.calls.slice(-2)).toEqual([
        ['changed', 4, 3],
        ['changed', 5, 4],
      ]);
      expect(render()).toBe(5);
    });

    it(`${target} ignores sync and queued native feedback from manual props projection`, async () => {
      const unit = await compile(
        `import {Component,h,Bind,WatchProps} from 'transone';
      class Card extends Component<{value?:number}> {
        initState(){return {};}initStyles(){}render(){return h('view',{},this.props.value);}
        @Bind() update(value:number):void{this.setProps({value});}
        @WatchProps('value') changed(value:number|undefined,old:number|undefined):void{this.emit('changed',value,old);}
        onPropsChange(){this.emit('legacy');}
      }`,
        target
      );
      const runtime = execute(unit, target, 'both');
      runtime.setNativeProps({ value: 1 }, false);
      runtime.mount();
      runtime.flushObservers();
      runtime.calls.length = 0;
      runtime.value.update(2);
      runtime.flushObservers();
      expect(runtime.calls).toEqual([['changed', 2, 1]]);
      runtime.setNativeProps({ value: 1 });
      expect(runtime.calls).toEqual([
        ['changed', 2, 1],
        ['changed', 1, 2],
        ['legacy'],
      ]);
    });

    it(`${target} accepts native individual props after a manual commit without an input packet`, async () => {
      const unit = await compile(
        `import {Component,h,Bind,WatchProps} from 'transone';
        class Card extends Component<{value?:number}> {
          initState(){return {};}initStyles(){}render(){return h('view',{},this.props.value);}
          @Bind() update(value:number):void{this.setProps({value});}
          @WatchProps('value') changed(value:number|undefined,old:number|undefined):void{this.emit('changed',value,old);}
        }`,
        target
      );
      const runtime = execute(unit, target, 'both');
      const container = getPropsContainer(MP_DIALECTS[target]!);
      runtime.setNativeProps({ value: 1 }, false, false);
      runtime.mount();
      runtime.flushObservers();
      runtime.calls.length = 0;
      runtime.value.update(2);
      runtime.flushObservers();
      const previous = { ...runtime.value[container] };
      runtime.setNativeProps({ value: 3 }, false, false);
      runtime.observe(previous);
      runtime.flushObservers();
      expect(runtime.calls).toEqual([
        ['changed', 2, 1],
        ['changed', 3, 2],
      ]);
      const binding = unit.template.match(/{{([^}]+)}}/)![1]!;
      const values = {
        ...runtime.value.properties,
        ...runtime.value.props,
        ...runtime.value.data,
      };
      expect(
        new Function(...Object.keys(values), 'return (' + binding + ');')(
          ...Object.values(values)
        )
      ).toBe(3);
    });

    for (const packet of [false, true]) {
      const bridge = packet ? 'reused packet' : 'individual props';
      it(`${target} accepts a return to the previous reference after repeated projection acknowledgments through ${bridge}`, async () => {
        const runtime = execute(
          await compile(projectionWatchProgram, target),
          target,
          'both'
        );
        const shared = { count: 1 };
        const original = { nested: shared };
        const replacement = [shared, , undefined];
        const originalProps = { value: original };
        const replacementProps = { value: replacement };
        runtime.setNativeProps(originalProps, false, packet);
        runtime.mount();
        runtime.flushObservers();
        runtime.calls.length = 0;

        runtime.value.update(replacement);
        runtime.setNativeProps(replacementProps, true, packet);
        runtime.flushObservers();
        runtime.setNativeProps(replacementProps, true, packet);
        runtime.flushObservers();
        expect(runtime.calls.map((call) => call[0])).toEqual([
          'first',
          'second',
        ]);
        runtime.setNativeProps(originalProps, true, packet);
        runtime.flushObservers();

        expect(runtime.value.read()).toBe(original);
        expect(runtime.value.data.__transone_render_props.value).toBe(original);
        expect(runtime.calls.map((call) => call[0])).toEqual([
          'first',
          'second',
          'first',
          'second',
          'legacy',
        ]);
        for (const index of [0, 1]) {
          expect(runtime.calls[index]![1]).toBe(replacement);
          expect(runtime.calls[index]![2]).toBe(original);
        }
        for (const index of [2, 3]) {
          expect(runtime.calls[index]![1]).toBe(original);
          expect(runtime.calls[index]![2]).toBe(replacement);
        }
        expect(replacement[0]).toBe(original.nested);
        expect(1 in replacement).toBe(false);
      });

      it(`${target} refreshes an acknowledged projection before remounting through ${bridge}`, async () => {
        const runtime = execute(
          await compile(projectionWatchProgram, target),
          target,
          'both'
        );
        const original: unknown[] = [];
        const replacement = { nested: original };
        const originalProps = { value: original };
        runtime.setNativeProps(originalProps, false, packet);
        runtime.mount();
        runtime.flushObservers();
        runtime.value.update(replacement);
        runtime.setNativeProps({ value: replacement }, true, packet);
        runtime.detach();
        runtime.calls.length = 0;
        runtime.setNativeProps(originalProps, false, packet);
        runtime.mount();
        runtime.flushObservers();

        expect(runtime.value.read()).toBe(original);
        expect(runtime.value.data.__transone_render_props.value).toBe(original);
        expect(runtime.calls).toHaveLength(1);
        expect(runtime.calls[0]![0]).toBe('first');
        expect(runtime.calls[0]![1]).toBe(original);
        expect(runtime.calls[0]![2]).toBeUndefined();
      });
    }

    it(`${target} accepts scalar props after a projection acknowledgment`, async () => {
      const runtime = execute(
        await compile(projectionWatchProgram, target),
        target,
        'both'
      );
      runtime.setNativeProps({ value: 1 }, false, false);
      runtime.mount();
      runtime.flushObservers();
      runtime.calls.length = 0;
      runtime.value.update(2);
      runtime.setNativeProps({ value: 2 }, true, false);
      runtime.flushObservers();
      runtime.setNativeProps({ value: 1 }, true, false);
      runtime.flushObservers();
      expect(runtime.value.read()).toBe(1);
      expect(runtime.value.data.__transone_render_props.value).toBe(1);
      expect(runtime.calls).toEqual([
        ['first', 2, 1],
        ['second', 2, 1],
        ['first', 1, 2],
        ['second', 1, 2],
        ['legacy'],
      ]);
    });

    it(`${target} registers a literal __proto__ watcher key as an own native property`, async () => {
      const unit = await compile(
        watchProgram.split("'value'").join("'__proto__'"),
        target
      );
      const runtime = execute(unit, target);
      const declared =
        target === 'mp-alipay'
          ? runtime.definition.props
          : runtime.definition.properties;
      expect(Object.prototype.hasOwnProperty.call(declared, '__proto__')).toBe(
        true
      );
      runtime.setNativeProps(JSON.parse('{"__proto__":"safe"}'), false);
      runtime.mount();
      expect(runtime.calls).toEqual([['first', 'safe', undefined]]);
    });

    it(`${target} refreshes a retained render packet when native props change while detached`, async () => {
      const unit = await compile(
        `import {Component,h,Bind,WatchProps} from 'transone';class Card extends Component<{value?:number}>{
        initState(){return {};}initStyles(){}render(){return h('view',{},this.props.value);}
        @Bind() update(value:number):void{this.setProps({value});}
        @WatchProps('value',{immediate:true}) changed(value:number|undefined,old:number|undefined):void{this.emit('changed',value,old);}
      }`,
        target
      );
      const runtime = execute(unit, target);
      runtime.setNativeProps({ value: 1 }, false);
      runtime.mount();
      runtime.value.update(2);
      runtime.detach();
      runtime.calls.length = 0;
      runtime.setNativeProps({ value: 4 });
      runtime.mount();
      expect(runtime.calls).toEqual([['changed', 4, undefined]]);
      expect(runtime.value.data.__transone_render_props).toEqual({ value: 4 });
    });

    it(`${target} observes absent own prop values instead of Object.prototype members`, async () => {
      const unit = await compile(
        watchProgram.split("'value'").join("'toString'"),
        target
      );
      const runtime = execute(unit, target);
      runtime.setNativeProps({}, false);
      runtime.mount();
      expect(runtime.calls).toEqual([['first', undefined, undefined]]);
      runtime.setNativeProps({ toString: 'value' });
      expect(runtime.calls.slice(1)).toEqual([
        ['first', 'value', undefined],
        ['second', 'value', undefined],
      ]);
    });

    it(`${target} supports a manual props commit in an otherwise undecorated page`, async () => {
      const unit = await compile(
        `import {Component,h} from 'transone';class Page extends Component {
        initState(){return {};}initStyles(){}render(){return h('button',{onClick:this.update},this.props.value);}
        update():void{this.setProps({value:2});}
      }`,
        target,
        'page'
      );
      const runtime = execute(unit, target);
      runtime.mount();
      runtime.value.update();
      expect(runtime.value.data.__transone_render_props).toEqual({ value: 2 });
    });

    it(`${target} renders committed props even when a watcher throws and preserves both publication failures`, async () => {
      const unit = await compile(
        `import { Component, h, Bind, WatchProps } from 'transone';
      class Card extends Component<{value?:number}> {
        initState(){return {};} initStyles(){} render(){return h('view',{},this.props.value);}
        @Bind() update(value:number):void {this.setProps({value});}
        @WatchProps('value') changed(value:number|undefined):void {this.emit('changed',value);}
      }`,
        target
      );
      const runtime = execute(unit, target);
      runtime.setNativeProps({ value: 1 }, false);
      runtime.mount();
      const failure = new Error('watch failed');
      runtime.setOnEvent(() => {
        throw failure;
      });
      expect(() => runtime.value.update(2)).toThrow(failure);
      expect(runtime.value.data.__transone_render_props).toEqual({ value: 2 });
      const publishFailure = new Error('publish failed');
      runtime.value.setData = () => {
        throw publishFailure;
      };
      let combined: any;
      try {
        runtime.value.update(3);
      } catch (error) {
        combined = error;
      }
      expect(combined.errors).toEqual([failure, publishFailure]);
    });

    it(`${target} emits falsy and array results as one payload and rejects thenables with one then read`, async () => {
      const unit = await compile(
        emitProgram.replace(
          "@Emit('fail')",
          "@Emit('value') value(value:unknown){return value;} @Emit('fail')"
        ),
        target
      );
      const runtime = execute(unit, target);
      runtime.mount();
      for (const value of [false, null, [1, 2]])
        expect(runtime.value.value(value)).toBe(value);
      expect(runtime.calls).toEqual([
        ['value', false],
        ['value', null],
        ['value', [1, 2]],
      ]);
      let reads = 0;
      expect(() =>
        runtime.value.value({
          get then() {
            reads++;
            return (resolve: Function) => resolve(1);
          },
        })
      ).toThrow('同步');
      expect(reads).toBe(1);
      expect(runtime.calls).toHaveLength(3);
      expect(() =>
        runtime.value.value({
          get then() {
            runtime.detach();
            runtime.mount();
            throw new Error('stale then');
          },
        })
      ).not.toThrow();
      expect(runtime.calls).toHaveLength(3);
      await Promise.resolve();
    });

    it(`${target} supports page watchers and manual root props commits`, async () => {
      const unit = await compile(
        `import { Component,h,Bind,WatchProps } from 'transone';
      class Page extends Component<{value?:number}> {
        initState(){return {count:0};}initStyles(){}render(){return h('view',{},this.props.value);}
        @WatchProps('value',{immediate:true}) changed(value:number|undefined,old:number|undefined):void{this.setState({count:(value??0)+(old??0)});}
        @Bind() update(value:number):void {this.setProps({value});}
      }`,
        target,
        'page'
      );
      const runtime = execute(unit, target);
      runtime.value.__transone_page_props = { value: 1 };
      runtime.mount();
      expect(runtime.value.data.count).toBe(1);
      runtime.value.update(2);
      expect(runtime.value.data.count).toBe(3);
      expect(runtime.value.data.__transone_render_props).toEqual({ value: 2 });
      runtime.detach();
      runtime.value.update(4);
      expect(runtime.value.data.count).toBe(3);
      runtime.mount();
      expect(runtime.value.data.count).toBe(4);
    });

    it(`${target} establishes immediate watches before onMounted and stops an old batch on remount`, async () => {
      const unit = await compile(
        watchProgram.replace(
          "@WatchProps('value',{immediate:true})",
          "onMounted(){this.setProps({value:2});} @WatchProps('value',{immediate:true})"
        ),
        target
      );
      const runtime = execute(unit, target);
      runtime.setNativeProps({ value: 1 }, false);
      runtime.mount();
      expect(runtime.calls).toEqual([
        ['first', 1, undefined],
        ['first', 2, 1],
        ['second', 2, 1],
      ]);
      runtime.calls.length = 0;
      runtime.setOnEvent((name, args) => {
        if (name === 'first' && args[0] === 3) {
          runtime.detach();
          runtime.setNativeProps({ value: 4 }, false);
          runtime.mount();
        }
      });
      runtime.setNativeProps({ value: 3 });
      expect(runtime.calls).toEqual([
        ['first', 3, 2],
        ['first', 4, undefined],
        ['first', 2, 4],
        ['second', 2, 4],
      ]);
    });

    it(`${target} consumes a failed watcher batch and recovers on the next props change`, async () => {
      const runtime = execute(await compile(watchProgram, target), target);
      runtime.setNativeProps({ value: 1 }, false);
      runtime.mount();
      runtime.calls.length = 0;
      runtime.setOnEvent((name, args) => {
        if (name === 'first' && args[0] === 2)
          throw new Error('observer failed');
      });
      expect(() => runtime.setNativeProps({ value: 2 })).toThrow(
        'observer failed'
      );
      runtime.setOnEvent(undefined);
      runtime.setNativeProps({ value: 3 });
      expect(runtime.calls).toEqual([
        ['first', 2, 1],
        ['first', 3, 2],
        ['second', 3, 2],
      ]);
    });
  }
});
