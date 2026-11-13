import { describe, it, expect } from 'bun:test';
import { Component, WatchProps, h, flushSync } from '../../transone/lib/index';
import { compileUnit, finalizeComponentProperties } from '../src/mp/compile';
import { generateComponentJs } from '../src/mp/jsgen';
import { MP_DIALECTS } from '../src/mp/dialect';
import { getPropsContainer } from '../src/mp/props-runtime';
import { loadTypescript } from '../src/mp/ts-loader';
import type { CompileContext } from '../src/mp/types';
const targets = [
  'mp-weixin',
  'mp-alipay',
  'mp-bytedance',
  'mp-xiaohongshu',
] as const;
type Target = (typeof targets)[number];
const sourceText = `import {Component,h,Bind,WatchProps} from 'transone';
class Card extends Component<{provided?:number;local?:number;shared?:object}> {
 initState(){return {};} initStyles(){} render(){return h('view',{},[this.props.provided,this.props.local]);}
 @Bind() patch(patch:object):void {this.setProps(patch);}
 @Bind() read(){return this.props;}
 @Bind() capture(){return this.guardCallback((patch:object)=>this.setProps(patch));}
 @WatchProps('provided') provided(next:unknown,old:unknown):void{this.emit('provided',next,old);}
 @WatchProps('local') local(next:unknown,old:unknown):void{this.emit('local',next,old);}
}`;
async function load(target: Target, feedback: 'sync' | 'queued' = 'sync') {
  const ts = await loadTypescript();
  const source = ts.createSourceFile(
    '/test.ts',
    sourceText,
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
    dialect: MP_DIALECTS[target],
    warnings: [],
  };
  const unit = compileUnit(
    context,
    { filePath: source.fileName, source, declaration, className: 'Card' },
    { kind: 'component', name: 'card' }
  );
  finalizeComponentProperties(context);
  let def: any;
  new Function('Component', generateComponentJs(unit, MP_DIALECTS[target]!))(
    (d: any) => (def = d)
  );
  const events: any[] = [];
  const queue: any[] = [];
  let onEvent: ((name: string, args: any[]) => void) | undefined;
  let onBeforePublish: (() => void) | undefined;
  let onPublish: ((patch: any) => void) | undefined;
  const key = getPropsContainer(MP_DIALECTS[target]!);
  const value: any = {
    ...def.methods,
    data: structuredClone(def.data),
    properties: {},
    props: {},
    triggerEvent(name: string, payload: any) {
      events.push([name, ...payload.args]);
      onEvent?.(name, payload.args);
    },
    setData(patch: any) {
      const prev = this[key];
      if (
        Object.prototype.hasOwnProperty.call(patch, '__transone_render_props')
      )
        onBeforePublish?.();
      // Native setData updates the render data bag, not the incoming props bag.
      Object.assign(this.data, patch);
      onPublish?.(patch);
      if (feedback === 'sync') observe(prev);
      else if (feedback === 'queued') queue.push(() => observe(prev));
    },
  };
  const hooks = target === 'mp-alipay' ? def : def.lifetimes;
  const observe = (prev?: any) =>
    target === 'mp-alipay'
      ? def.didUpdate?.call(value, prev)
      : Object.values(def.observers ?? {}).forEach((cb: any) => cb.call(value));
  const parent = (props: Record<string, unknown>, notify = true) => {
    const previous = value[key];
    const callbacks = Object.fromEntries(
      Object.keys(def.props ?? {})
        .filter((k) => k.startsWith('onTransoneEvent'))
        .map((k) => [
          k,
          (...args: any[]) => {
            const name = k
              .slice('onTransoneEvent'.length)
              .split('_')
              .slice(1)
              .map((c) => String.fromCharCode(parseInt(c, 16)))
              .join('');
            events.push([name, ...args]);
            onEvent?.(name, args);
          },
        ])
    );
    const next = { ...props, ...callbacks, __transone_props: props };
    if (key === 'data') Object.assign(value.data, next);
    else value[key] = next;
    if (notify) observe(previous);
  };
  const mount = () => {
    hooks[target === 'mp-alipay' ? 'onInit' : 'attached']?.call(value);
    hooks.didMount?.call(value);
  };
  const detach = () =>
    hooks[target === 'mp-alipay' ? 'didUnmount' : 'detached']?.call(value);
  return {
    value,
    events,
    parent,
    mount,
    detach,
    observe,
    setOnEvent(cb: typeof onEvent) {
      onEvent = cb;
    },
    setOnBeforePublish(cb: typeof onBeforePublish) {
      onBeforePublish = cb;
    },
    setOnPublish(cb: typeof onPublish) {
      onPublish = cb;
    },
    flush() {
      let iterations = 0;
      while (queue.length) {
        if (++iterations > 100)
          throw new Error('props feedback did not settle');
        queue.shift()();
      }
    },
  };
}
class CoreCard extends Component<any, object> {
  protected initState() {
    return {};
  }
  protected initStyles() {}
  protected render() {
    return h('span', {}, [
      String(this.props.provided),
      String(this.props.local),
    ]);
  }
  read() {
    return this.props;
  }
  @WatchProps('provided') provided(next: any, old: any) {
    this.emit('provided', next, old);
  }
  @WatchProps('local') local(next: any, old: any) {
    this.emit('local', next, old);
  }
}
function core() {
  const value = new CoreCard({ provided: 1 });
  const events: any[] = [];
  value.on('provided', (...args: any[]) => events.push(['provided', ...args]));
  value.on('local', (...args: any[]) => events.push(['local', ...args]));
  value.mountToNode();
  return { value, events };
}
describe('mini-program partial props recovery', () => {
  it('Core reference shallow-merges parent partial patches', () => {
    const c = core();
    const shared = { x: 1 };
    c.value.setProps({ provided: 2, local: 9, shared });
    c.value.setProps({ provided: 1 });
    expect(c.value.read()).toEqual({ provided: 1, local: 9, shared });
    expect(c.value.read().shared).toBe(shared);
    c.value.setProps({ provided: 3 });
    expect(c.value.read()).toEqual({ provided: 3, local: 9, shared });
    c.value.unmount();
    flushSync();
  });

  it('Core reference retains locals through parent update while detached and remount', () => {
    const c = core();
    const shared = { x: 1 };
    c.value.setProps({ provided: 2, local: 9, shared });
    c.value.unmount();
    c.value.setProps({ provided: 3 });
    c.value.mountToNode();
    expect(c.value.read()).toEqual({ provided: 3, local: 9, shared });
    expect(c.value.read().shared).toBe(shared);
    c.value.unmount();
    flushSync();
  });
  it('Core reference retains locals and committed props after a watcher failure', () => {
    const c = core();
    const shared = { x: 1 };
    c.value.setProps({ provided: 2, local: 9, shared });
    c.value.on('provided', (next: any) => {
      if (next === 3) throw new Error('expected watch failure');
    });
    expect(() => c.value.setProps({ provided: 3 })).toThrow(
      'expected watch failure'
    );
    expect(c.value.read()).toEqual({ provided: 3, local: 9, shared });
    expect(c.value.read().shared).toBe(shared);
    c.value.unmount();
    flushSync();
  });
  for (const target of targets)
    for (const feedback of ['sync', 'queued'] as const) {
      it(`${target} ${feedback}: manual local keys survive parent partial patches`, async () => {
        const c = await load(target, feedback);
        const shared = { x: 1 };
        c.parent({ provided: 1 }, false);
        c.mount();
        c.flush();
        c.value.patch({ provided: 2, local: 9, shared });
        c.flush();
        expect(c.value.read()).toEqual({ provided: 2, local: 9, shared });
        c.parent({ provided: 1 });
        c.flush();
        const same = c.value.read();
        c.parent({ provided: 3 });
        c.flush();
        const changed = c.value.read();
        expect(same).toEqual({ provided: 1, local: 9, shared });
        expect(changed.shared).toBe(shared);
        expect(c.value.data.__transone_render_props).toEqual({
          provided: 3,
          local: 9,
          shared,
        });
      });
      it(`${target} ${feedback}: native partial props preserve previously supplied omitted keys`, async () => {
        const c = await load(target, feedback);
        const shared = { x: 1 };
        c.parent({ provided: 1, local: 9, shared }, false);
        c.mount();
        c.flush();
        c.parent({ provided: 3 });
        c.flush();
        expect(c.value.read()).toEqual({ provided: 3, local: 9, shared });
        expect(c.value.read().shared).toBe(shared);
        expect(c.value.data.__transone_render_props).toEqual({
          provided: 3,
          local: 9,
          shared,
        });
        expect(c.events).toEqual([['provided', 3, 1]]);
      });
      it(`${target} ${feedback}: partial acknowledgements settle without deleting local values or notifying again`, async () => {
        const c = await load(target, feedback);
        const shared = { x: 1 };
        c.parent({ provided: 1 }, false);
        c.mount();
        c.flush();
        c.value.patch({ provided: 2, local: 9, shared });
        c.flush();
        let publications = 0;
        c.setOnPublish(() => publications++);
        c.parent({ provided: 2 });
        c.flush();
        c.parent({ provided: 2 });
        c.flush();
        c.observe();
        c.flush();
        expect(c.value.read()).toEqual({ provided: 2, local: 9, shared });
        expect(c.value.read().shared).toBe(shared);
        expect(c.events).toEqual([
          ['provided', 2, 1],
          ['local', 9, undefined],
        ]);
        expect(publications).toBe(0);
        c.parent({ provided: 1 });
        c.flush();
        expect(c.value.read()).toEqual({ provided: 1, local: 9, shared });
        expect(c.events[c.events.length - 1]).toEqual(['provided', 1, 2]);
      });
      it(`${target} ${feedback}: explicit undefined and null override while absent keys and references survive`, async () => {
        const c = await load(target, feedback);
        const shared = { x: 1 };
        c.parent({ provided: 1 }, false);
        c.mount();
        c.flush();
        c.value.patch({ local: 9, shared });
        c.flush();
        c.parent({ provided: undefined });
        c.flush();
        expect(c.value.read()).toEqual({
          provided: undefined,
          local: 9,
          shared,
        });
        expect(
          Object.prototype.hasOwnProperty.call(c.value.read(), 'provided')
        ).toBe(true);
        c.parent({ provided: null, local: undefined });
        c.flush();
        expect(c.value.read()).toEqual({
          provided: null,
          local: undefined,
          shared,
        });
        expect(
          Object.prototype.hasOwnProperty.call(c.value.read(), 'local')
        ).toBe(true);
        expect(c.value.read().shared).toBe(shared);
        expect(c.value.data.__transone_render_props.shared).toBe(shared);
        c.parent({ local: null });
        c.flush();
        expect(c.value.read()).toEqual({ provided: null, local: null, shared });
      });
      it(`${target} ${feedback}: nested manual patches during parent notification publish the final merged props`, async () => {
        const c = await load(target, feedback);
        const shared = { x: 1 };
        c.parent({ provided: 1 }, false);
        c.mount();
        c.flush();
        c.value.patch({ local: 9, shared });
        c.flush();
        c.setOnEvent((name, args) => {
          if (name === 'provided' && args[0] === 3) {
            c.value.patch({ local: 10 });
            c.value.patch({ provided: 4 });
          }
        });
        c.parent({ provided: 3 });
        c.flush();
        expect(c.value.read()).toEqual({ provided: 4, local: 10, shared });
        expect(c.value.data.__transone_render_props).toEqual({
          provided: 4,
          local: 10,
          shared,
        });
        expect(c.events).toEqual([
          ['local', 9, undefined],
          ['provided', 3, 1],
          ['local', 10, 9],
          ['provided', 4, 3],
        ]);
      });
      it(`${target} ${feedback}: repeated watcher and publication failures keep committed props and recover`, async () => {
        const c = await load(target, feedback);
        const shared = { x: 1 };
        c.parent({ provided: 1 }, false);
        c.mount();
        c.flush();
        c.value.patch({ local: 9, shared });
        c.flush();
        const watchError = new Error('watch failed');
        const nativeError = new Error('native failed');
        c.setOnEvent((name) => {
          if (name === 'provided') throw watchError;
        });
        c.setOnPublish(() => {
          throw nativeError;
        });
        for (const provided of [2, 3]) {
          let failure: any;
          try {
            c.parent({ provided });
          } catch (error) {
            failure = error;
          }
          expect(failure).toMatchObject({
            name: 'AggregateError',
            errors: [watchError, nativeError],
          });
          expect(c.value.read()).toEqual({ provided, local: 9, shared });
          expect(c.value.data.__transone_render_props).toEqual({
            provided,
            local: 9,
            shared,
          });
        }
        c.setOnEvent(undefined);
        c.setOnPublish(undefined);
        c.parent({ provided: 4 });
        c.flush();
        expect(c.value.read()).toEqual({ provided: 4, local: 9, shared });
        expect(c.events[c.events.length - 1]).toEqual(['provided', 4, 3]);
      });
      it(`${target} ${feedback}: a matching parent packet retries failed rendering without notifying again`, async () => {
        const c = await load(target, feedback);
        const shared = { x: 1 };
        let legacyNotifications = 0;
        c.value.onPropsChange = () => legacyNotifications++;
        c.parent({ provided: 1 }, false);
        c.mount();
        c.flush();
        c.setOnBeforePublish(() => {
          throw new Error('native write failed');
        });
        expect(() => c.value.patch({ provided: 2, local: 9, shared })).toThrow(
          'native write failed'
        );
        expect(c.value.data.__transone_render_props).toEqual({ provided: 1 });
        expect(() => c.parent({ provided: 2 })).toThrow('native write failed');
        c.setOnBeforePublish(undefined);
        let publications = 0;
        c.setOnPublish(() => publications++);
        c.parent({ provided: 2 });
        c.flush();
        expect(c.value.data.__transone_render_props).toEqual({
          provided: 2,
          local: 9,
          shared,
        });
        expect(c.value.data.__transone_render_props.shared).toBe(shared);
        expect(c.events).toEqual([
          ['provided', 2, 1],
          ['local', 9, undefined],
        ]);
        expect(publications).toBe(1);
        expect(legacyNotifications).toBe(0);
      });
      it(`${target} ${feedback}: old feedback and a new parent packet retain their meaning after a failed write`, async () => {
        const c = await load(target, feedback);
        const shared = { x: 1 };
        const fail = () => {
          throw new Error('native write failed');
        };
        c.parent({ provided: 1 }, false);
        c.mount();
        c.flush();
        c.setOnBeforePublish(fail);
        expect(() => c.value.patch({ provided: 2, local: 9, shared })).toThrow(
          'native write failed'
        );
        c.setOnBeforePublish(undefined);
        c.observe();
        c.flush();
        expect(c.value.data.__transone_render_props).toEqual({
          provided: 2,
          local: 9,
          shared,
        });
        c.setOnBeforePublish(fail);
        expect(() => c.value.patch({ provided: 3 })).toThrow(
          'native write failed'
        );
        c.setOnBeforePublish(undefined);
        c.parent({ provided: 1 });
        c.flush();
        expect(c.value.data.__transone_render_props).toEqual({
          provided: 1,
          local: 9,
          shared,
        });
        expect(c.events).toEqual([
          ['provided', 2, 1],
          ['local', 9, undefined],
          ['provided', 3, 2],
          ['provided', 1, 3],
        ]);
      });
      it(`${target} ${feedback}: remount merges detached parent props and rejects retained callbacks`, async () => {
        const c = await load(target, feedback);
        const shared = { x: 1 };
        c.parent({ provided: 1 }, false);
        c.mount();
        c.value.patch({ provided: 2, local: 9, shared });
        const stale = c.value.capture();
        c.detach();
        c.parent({ provided: 3 });
        c.mount();
        stale({ provided: 99, local: 99 });
        c.flush();
        expect(c.value.read()).toEqual({ provided: 3, local: 9, shared });
        expect(c.value.data.__transone_render_props).toEqual({
          provided: 3,
          local: 9,
          shared,
        });
        expect(c.value.read().shared).toBe(shared);
        const current = c.value.capture();
        current({ provided: 4 });
        c.flush();
        expect(c.value.read()).toEqual({ provided: 4, local: 9, shared });
      });
      it(`${target} ${feedback}: remount commits a fresh parent packet equal to the older native values`, async () => {
        const c = await load(target, feedback);
        const shared = { x: 1 };
        c.parent({ provided: 1 }, false);
        c.mount();
        c.flush();
        c.value.patch({ provided: 2, local: 9, shared });
        c.flush();
        c.detach();
        c.parent({ provided: 1 });
        c.mount();
        c.flush();
        expect(c.value.read()).toEqual({ provided: 1, local: 9, shared });
        expect(c.value.data.__transone_render_props).toEqual({
          provided: 1,
          local: 9,
          shared,
        });
        expect(c.value.read().shared).toBe(shared);
      });
    }
  for (const target of targets) {
    it(`${target}: a failed write from an old mount leaves the replacement publication intact`, async () => {
      const c = await load(target, 'queued');
      c.parent({ provided: 1 }, false);
      c.mount();
      c.flush();
      c.setOnPublish((patch) => {
        if (patch.__transone_render_props?.provided !== 2) return;
        c.detach();
        c.parent({ provided: 3 }, false);
        c.mount();
        throw new Error('old native write failed');
      });
      expect(() => c.value.patch({ provided: 2, local: 9 })).not.toThrow();
      let publications = 0;
      c.setOnPublish(() => publications++);
      c.parent({ provided: 3 });
      c.flush();
      expect(c.value.data.__transone_render_props).toEqual({
        provided: 3,
        local: 9,
      });
      expect(c.events).toEqual([
        ['provided', 2, 1],
        ['local', 9, undefined],
      ]);
      expect(publications).toBe(0);
    });
    it(`${target}: nested and consecutive manual commits preserve partial props`, async () => {
      const c = await load(target);
      const shared = { x: 1 };
      c.parent({ provided: 1 }, false);
      c.mount();
      c.setOnEvent((name: string, args: any[]) => {
        if (name === 'provided' && args[0] === 2) c.value.patch({ local: 10 });
      });
      c.value.patch({ provided: 2, local: 9, shared });
      c.value.patch({ provided: 4 });
      expect(c.value.read()).toEqual({ provided: 4, local: 10, shared });
      expect(c.value.read().shared).toBe(shared);
      expect(c.value.data.__transone_render_props).toEqual({
        provided: 4,
        local: 10,
        shared,
      });
    });
    it(`${target}: fully acknowledged packet retains manual shared references`, async () => {
      const c = await load(target);
      const shared = { x: 1 };
      c.parent({ provided: 1 }, false);
      c.mount();
      c.value.patch({ provided: 2, local: 9, shared });
      c.parent({ provided: 2, local: 9, shared });
      expect(c.value.read().shared).toBe(shared);
      expect(c.events.filter((x: any) => x[0] === 'local')).toEqual([
        ['local', 9, undefined],
      ]);
    });
    it(`${target}: changed parent during detach retains unprovided local on remount`, async () => {
      const c = await load(target);
      const shared = { x: 1 };
      c.parent({ provided: 1 }, false);
      c.mount();
      c.value.patch({ provided: 2, local: 9, shared });
      c.detach();
      c.parent({ provided: 3 }, false);
      c.mount();
      expect(c.value.read()).toEqual({ provided: 3, local: 9, shared });
    });
    it(`${target}: watcher failure then parent patch retains local`, async () => {
      const c = await load(target);
      const shared = { x: 1 };
      c.parent({ provided: 1 }, false);
      c.mount();
      c.value.patch({ provided: 2, local: 9, shared });
      c.setOnEvent((name: string, args: any[]) => {
        if (name === 'provided' && args[0] === 3)
          throw new Error('expected watch failure');
      });
      expect(() => c.parent({ provided: 3 })).toThrow('expected watch failure');
      expect(c.value.read()).toEqual({ provided: 3, local: 9, shared });
    });
  }
});
