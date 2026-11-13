import { describe, expect, it } from 'bun:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { MP_DIALECTS } from '../src/mp/dialect';
import {
  lifecycleEntries,
  propertyObserverBody,
  runtimePreamble,
} from '../src/mp/props-runtime';
import { compileUnit } from '../src/mp/compile';
import type { CompileContext, CompiledUnit } from '../src/mp/types';

const targets = [
  'mp-weixin',
  'mp-bytedance',
  'mp-xiaohongshu',
  'mp-alipay',
] as const;
function fixture(target: string, options: Partial<CompiledUnit> = {}) {
  const dialect = MP_DIALECTS[target]!;
  const failure = new Error('before failed');
  const unit: CompiledUnit = {
    kind: 'component',
    name: 'card',
    template: '',
    style: '',
    globalStyle: '',
    data: '{count:0}',
    properties: { seed: 'Number' },
    methods: [],
    customEvents: [],
    propsReferenced: new Set(),
    usingComponents: {},
    inlineModules: [],
    initialization: 'function(){return {count:0};}',
    initializationKeys: [],
    initializationFields: [],
    lifecycle: [
      {
        key: 'created',
        fn: `function(){if(this.failBefore){this.setData({count:1},function(){this.setData({count:99});});throw failure;}}`,
      },
      { key: 'attached', fn: 'function(){}' },
      { key: 'detached', fn: 'function(){}' },
    ],
    ...options,
  };
  const runtime = new Function(
    'failure',
    `${runtimePreamble(unit, dialect)};return {
    hooks:{${lifecycleEntries(unit, dialect)
      .map((e) => `${JSON.stringify(e.key)}:${e.fn}`)
      .join(',')}},
    guard:function(instance, callback){return __transone_guard_callback(instance,callback);},
    observer:function(previousProps){${propertyObserverBody(unit, dialect)}}
  };`
  )(failure);
  const host: Record<string, any> = {
    data: { count: 0 },
    properties: { seed: 1 },
    props: { seed: 1 },
    pending: [],
    failBefore: false,
    setData(patch: object, callback?: Function) {
      Object.assign(this.data, structuredClone(patch));
      if (callback) this.pending.push(callback);
      return 123;
    },
    onPropsChange() {
      this.setData({ count: 99 });
    },
  };
  const mount = () => {
    if (unit.kind === 'page') {
      runtime.hooks.onLoad?.call(host);
      runtime.hooks.onReady?.call(host);
    } else {
      runtime.hooks[target === 'mp-alipay' ? 'onInit' : 'attached']?.call(host);
      if (target === 'mp-alipay') runtime.hooks.didMount?.call(host);
    }
  };
  const unmount = () =>
    runtime.hooks[
      unit.kind === 'page'
        ? 'onUnload'
        : target === 'mp-alipay'
          ? 'didUnmount'
          : 'detached'
    ]?.call(host);
  return { unit, runtime, host, mount, unmount, failure };
}

describe('mini program async callback scopes', () => {
  it('reads a returned then getter once and preserves its receiver and asynchronous assimilation', async () => {
    const { runtime, host, mount } = fixture('mp-weixin');
    mount();
    let reads = 0;
    let called = false;
    let receiver: unknown;
    const thenable = {
      get then() {
        if (++reads > 1) throw new Error('then getter was read again');
        return function (this: unknown, resolve: (value: unknown) => void) {
          called = true;
          receiver = this;
          resolve(7);
        };
      },
    };
    const result = runtime.guard(host, () => thenable)();
    expect(reads).toBe(1);
    expect(called).toBe(false);
    await expect(result).resolves.toBe(7);
    expect(receiver).toBe(thenable);
  });
  it('keeps active then getter failures synchronous and ignores failures after getter reentry replaces the mount', () => {
    const { runtime, host, mount, unmount } = fixture('mp-weixin');
    mount();
    const failure = new Error('then getter failed');
    const active = runtime.guard(host, () => ({
      get then() {
        throw failure;
      },
    }));
    expect(active).toThrow(failure);
    expect(runtime.guard(host, () => 7)()).toBe(7);
    const old = runtime.guard(host, () => ({
      get then() {
        unmount();
        mount();
        throw failure;
      },
    }));
    expect(old()).toBeUndefined();
    expect(runtime.guard(host, () => 8)()).toBe(8);
  });
  it('does not add a thenable assimilation turn when observing an ordinary native Promise', async () => {
    const { runtime, host, mount } = fixture('mp-weixin');
    mount();
    const sequence: string[] = [];
    const result = runtime.guard(host, () => Promise.resolve(7))();
    void result.then(() => sequence.push('guarded'));
    void Promise.resolve().then(() => sequence.push('microtask'));
    await Promise.resolve();
    await Promise.resolve();
    expect(sequence).toEqual(['microtask', 'guarded']);
    await expect(result).resolves.toBe(7);
  });
  it('rejects an invalid borrowed native then asynchronously through thenable assimilation', async () => {
    const { runtime, host, mount } = fixture('mp-weixin');
    mount();
    let result: Promise<unknown> | undefined;
    expect(() => {
      result = runtime.guard(host, () => ({ then: Promise.prototype.then }))();
    }).not.toThrow();
    await expect(result).rejects.toBeInstanceOf(TypeError);
  });
  it('normalizes a Promise subclass whose species constructor returns a non-Promise', async () => {
    const { runtime, host, mount } = fixture('mp-weixin');
    mount();
    class SpecialPromise extends Promise<number> {}
    Object.defineProperty(SpecialPromise, Symbol.species, {
      value: function Species(
        executor: (resolve: () => void, reject: () => void) => void
      ) {
        executor(
          () => {},
          () => {}
        );
      },
    });
    const source = new SpecialPromise((resolve) => resolve(7));
    const result = runtime.guard(host, () => source)();
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe(7);
  });
  it('keeps native then errors from a Promise proxy in the returned rejection', async () => {
    const { runtime, host, mount } = fixture('mp-weixin');
    mount();
    const source = new Proxy(Promise.resolve(7), {});
    let result: Promise<unknown> | undefined;
    expect(() => {
      result = runtime.guard(host, () => source)();
    }).not.toThrow();
    await expect(result).rejects.toBeInstanceOf(TypeError);
  });
  it('preserves active and obsolete Promise results from another realm', async () => {
    const { runtime, host, mount, unmount } = fixture('mp-weixin');
    mount();
    const foreign: {
      promise: Promise<unknown>;
      reject: (error: unknown) => void;
    } = runInNewContext(`(() => {
      let reject;
      const promise = new Promise((_resolve, no) => {reject = no;});
      return {promise, reject};
    })()`);
    const result = runtime.guard(host, () => foreign.promise)();
    unmount();
    mount();
    foreign.reject(new Error('obsolete foreign Promise'));
    await expect(result).resolves.toBeUndefined();
    await expect(
      runtime.guard(host, () => runInNewContext('Promise.resolve(9)'))()
    ).resolves.toBe(9);
  });
  for (const target of targets) {
    it(`${target} discards a result when thenable assimilation reenters a new mount`, async () => {
      const { runtime, host, mount, unmount } = fixture(target);
      mount();
      const callback = runtime.guard(host, () => ({
        then(resolve: (value: unknown) => void) {
          unmount();
          mount();
          host.setData({ count: 5 });
          resolve(7);
        },
      }));
      await expect(callback()).resolves.toBeUndefined();
      expect(host.data.count).toBe(5);
      expect(runtime.guard(host, () => 8)()).toBe(8);
    });
    for (const obsolete of [false, true]) {
      for (const failed of [false, true]) {
        it(`${target} ${obsolete ? 'discards obsolete' : 'preserves active'} nested ${failed ? 'rejections' : 'values'} and honors the first thenable settlement`, async () => {
          const { runtime, host, mount, unmount } = fixture(target);
          mount();
          const failure = new Error('inner failed');
          let settle!: () => void;
          let started!: () => void;
          const assimilating = new Promise<void>((resolve) => {
            started = resolve;
          });
          const inner = new Promise<number>((resolve, reject) => {
            settle = () => (failed ? reject(failure) : resolve(7));
          });
          const callback = runtime.guard(
            host,
            runtime.guard(host, () => ({
              then(
                resolve: (value: unknown) => void,
                reject: (error: unknown) => void
              ) {
                resolve({
                  then(resolve: (value: unknown) => void) {
                    resolve(inner);
                    started();
                  },
                });
                reject(new Error('ignored second settlement'));
                throw new Error('ignored throw after settlement');
              },
            }))
          );
          const result = callback();
          await assimilating;
          if (obsolete) {
            unmount();
            mount();
          }
          settle();
          if (failed && !obsolete) await expect(result).rejects.toBe(failure);
          else await expect(result).resolves.toBe(obsolete ? undefined : 7);
          expect(runtime.guard(host, () => 8)()).toBe(8);
        });
      }
    }
    it(`${target} suppresses a timer callback across repeated mounts and preserves the current timer receiver`, async () => {
      const { runtime, host, mount, unmount } = fixture(target);
      mount();
      const callback = runtime.guard(host, () => host.setData({ count: 99 }));
      const expired = new Promise((resolve) => {
        setTimeout(() => resolve(callback()), 0);
      });
      for (let cycle = 0; cycle < 3; cycle++) {
        unmount();
        mount();
      }
      host.setData({ count: 5 });
      await expect(expired).resolves.toBeUndefined();
      expect(host.data.count).toBe(5);
      const receiver = { value: 7 };
      const current = runtime.guard(host, function (this: { value: number }) {
        host.setData({ count: this.value });
        return this.value;
      });
      const active = new Promise((resolve) => {
        setTimeout(() => resolve(current.call(receiver)), 0);
      });
      await expect(active).resolves.toBe(7);
      expect(host.data.count).toBe(7);
    });
    it(`${target} cancels request callbacks before cleanup and recovers after repeated cleanup failures`, () => {
      const { runtime, host, mount, unmount } = fixture(target, {
        lifecycle: [
          {
            key: 'detached',
            fn: 'function(){this.request.abort();this.retryMount();throw this.cleanupFailure;}',
          },
        ],
      });
      const failure = new Error('cleanup failed');
      const old: Function[] = [];
      host.retryMount = mount;
      host.cleanupFailure = failure;
      for (let cycle = 0; cycle < 3; cycle++) {
        mount();
        old.push(runtime.guard(host, () => host.setData({ count: 99 })));
        host.request = { abort: old[cycle] };
        host.setData({ count: cycle + 1 });
        expect(unmount).toThrow(failure);
        expect(host.data.count).toBe(cycle + 1);
      }
      mount();
      host.setData({ count: 7 });
      for (const callback of old) {
        expect(callback()).toBeUndefined();
        expect(runtime.guard(host, callback)()).toBeUndefined();
      }
      expect(host.data.count).toBe(7);
      expect(runtime.guard(host, () => 8)()).toBe(8);
    });
  }
  it('allows an already started async body to finish while its guarded commit is obsolete', async () => {
    const { runtime, host, mount, unmount } = fixture('mp-weixin');
    mount();
    let resume!: () => void;
    const pending = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const commit = runtime.guard(host, () => host.setData({ count: 99 }));
    let finished = false;
    const result = runtime.guard(host, async () => {
      await pending;
      finished = true;
      commit();
      return 7;
    })();
    unmount();
    mount();
    host.setData({ count: 5 });
    resume();
    await expect(result).resolves.toBeUndefined();
    expect(finished).toBe(true);
    expect(host.data.count).toBe(5);
  });
  it('consumes an observer Promise rejection after detach without notifying the new scope', async () => {
    const { runtime, host, mount, unmount } = fixture('mp-weixin');
    let reject!: (error: unknown) => void;
    host.onPropsChange = () =>
      new Promise((_resolve, rejecter) => {
        reject = rejecter;
      });
    mount();
    const result = runtime.observer.call(host, { seed: 0 });
    expect(result).toBeInstanceOf(Promise);
    unmount();
    host.onPropsChange = () => {};
    mount();
    host.setData({ count: 5 });
    reject(new Error('old observer failed'));
    await expect(result).resolves.toBeUndefined();
    expect(host.data.count).toBe(5);
  });
  it('preserves an active observer rejection before the first legacy mount', async () => {
    const { runtime, host } = fixture('mp-weixin', {
      initialization: undefined,
      lifecycle: [],
      methods: [{ key: 'onPropsChange', fn: 'function(){}' }],
    });
    let reject!: (error: unknown) => void;
    const failure = new Error('active observer failed');
    host.onPropsChange = () =>
      new Promise((_resolve, rejecter) => {
        reject = rejecter;
      });
    const result = runtime.observer.call(host, { seed: 0 });
    expect(result).toBeInstanceOf(Promise);
    reject(failure);
    await expect(result).rejects.toBe(failure);
  });
  it('preserves native cleanup hook synchronous results while consuming its obsolete Promise result', async () => {
    for (const page of [false, true]) {
      const { host, mount, unmount } = fixture('mp-weixin', {
        kind: page ? 'page' : 'component',
        lifecycle: [
          {
            key: page ? 'onUnload' : 'detached',
            fn: 'function(){return this.cleanupValue;}',
          },
        ],
      });
      host.cleanupValue = 'cleanup';
      mount();
      expect(unmount()).toBe('cleanup');
      host.cleanupValue = Promise.reject(new Error('obsolete cleanup'));
      mount();
      await expect(unmount()).resolves.toBeUndefined();
    }
  });
  it('discards a synchronous result when its callback replaces its own mount scope', () => {
    const { runtime, host, mount, unmount } = fixture('mp-weixin');
    mount();
    const callback = runtime.guard(host, () => {
      unmount();
      mount();
      return 7;
    });
    expect(callback()).toBeUndefined();
    expect(runtime.guard(host, () => 7)()).toBe(7);
  });
  for (const target of targets) {
    it(`${target} ignores old data completions after detach/reattach and preserves current completion arguments`, () => {
      const { host, mount, unmount } = fixture(target);
      mount();
      host.setData({ count: 1 }, function (this: Record<string, any>) {
        this.setData({ count: 99 });
      });
      const old = host.pending.shift();
      unmount();
      mount();
      host.setData({ count: 5 });
      old.call(host);
      expect(host.data.count).toBe(5);
      let receiver: unknown, argument: unknown;
      expect(
        host.setData({ count: 6 }, function (this: unknown, value: unknown) {
          receiver = this;
          argument = value;
          return 7;
        })
      ).toBe(123);
      expect(host.pending.shift().call(host, 'native')).toBe(7);
      expect(receiver).toBe(host);
      expect(argument).toBe('native');
    });
    it(`${target} rejects a completion retained by a failed mount`, () => {
      const { host, mount, failure } = fixture(target);
      host.failBefore = true;
      expect(mount).toThrow(failure);
      const old = host.pending.shift();
      host.failBefore = false;
      mount();
      host.setData({ count: 6 });
      old.call(host);
      expect(host.data.count).toBe(6);
    });
    it(`${target} ignores observers delivered while detached`, () => {
      const { runtime, host, mount, unmount } = fixture(target);
      mount();
      host.setData({ count: 5 });
      unmount();
      runtime.observer.call(host, { seed: 0 });
      mount();
      expect(host.data.count).toBe(5);
    });
    it(`${target} scopes explicit callbacks to one mount while keeping dynamic this and synchronous errors`, () => {
      const { runtime, host, mount, unmount } = fixture(target);
      mount();
      let callback: Function = () => {};
      expect(() => {
        callback = runtime.guard(
          host,
          function (this: { offset: number }, value: number) {
            host.setData({ count: value });
            return this.offset + value;
          }
        );
      }).not.toThrow();
      expect(callback.call({ offset: 2 }, 3)).toBe(5);
      expect(host.data.count).toBe(3);
      unmount();
      mount();
      host.setData({ count: 6 });
      expect(callback.call({ offset: 2 }, 99)).toBeUndefined();
      expect(host.data.count).toBe(6);
      const failure = new Error('active callback failed');
      const active = runtime.guard(host, () => {
        throw failure;
      });
      expect(active).toThrow(failure);
    });
  }
  it('ignores a late Promise rejection but preserves an active rejection', async () => {
    const { runtime, host, mount, unmount } = fixture('mp-weixin');
    mount();
    let reject!: (error: unknown) => void;
    const pending = new Promise((_resolve, rejecter) => {
      reject = rejecter;
    });
    let callback: Function = () => {};
    expect(() => {
      callback = runtime.guard(host, () => pending);
    }).not.toThrow();
    const result = callback();
    unmount();
    mount();
    reject(new Error('old callback failed'));
    expect(await result).toBeUndefined();
    const failure = new Error('active callback failed');
    await expect(
      runtime.guard(host, () => Promise.reject(failure))()
    ).rejects.toBe(failure);
  });
  it('invalidates callbacks retained by a failed first native patch before a clean retry', () => {
    const { runtime, host, mount, failure } = fixture('mp-weixin');
    const native = host.setData;
    let fail = true;
    let old: Function = () => {};
    host.setData = function (patch: object, callback?: Function) {
      if (fail) {
        fail = false;
        old = runtime.guard(this, () => this.setData({ count: 99 }));
        native.call(this, patch, callback);
        throw failure;
      }
      return native.call(this, patch, callback);
    };
    expect(mount).toThrow(failure);
    mount();
    host.setData({ count: 5 });
    old();
    expect(host.data.count).toBe(5);
  });
  it('invalidates a born callback when the unused host is detached before its first mount', () => {
    const { runtime, host, mount, unmount } = fixture('mp-weixin');
    const old = runtime.guard(host, () => host.setData({ count: 99 }));
    unmount();
    mount();
    host.setData({ count: 5 });
    old();
    expect(host.data.count).toBe(5);
  });
  it('guards native completions on a static component without user hooks', () => {
    const { host, mount, unmount } = fixture('mp-weixin', {
      initialization: undefined,
      lifecycle: [],
      guardedCallbacks: true,
    });
    mount();
    host.setData({ count: 1 }, () => host.setData({ count: 99 }));
    const old = host.pending.shift();
    unmount();
    mount();
    host.setData({ count: 5 });
    old();
    expect(host.data.count).toBe(5);
  });
  it('provides callback scope to a page onLoad/onUnload cycle', () => {
    const { runtime, host, mount, unmount } = fixture('mp-weixin', {
      kind: 'page',
      lifecycle: [
        { key: 'onLoad', fn: 'function(){}' },
        { key: 'onUnload', fn: 'function(){}' },
      ],
    });
    mount();
    let callback: Function = () => {};
    expect(() => {
      callback = runtime.guard(host, () => host.setData({ count: 99 }));
    }).not.toThrow();
    unmount();
    mount();
    host.setData({ count: 7 });
    callback();
    expect(host.data.count).toBe(7);
  });
  for (const target of targets) {
    it(`${target} consumes a lifecycle Promise rejection from a previous mount`, async () => {
      let reject!: (error: unknown) => void;
      const life = new Promise((_resolve, rejecter) => {
        reject = rejecter;
      });
      const { runtime, host, mount, unmount } = fixture(target, {
        lifecycle: [{ key: 'attached', fn: 'function(){return this.life;}' }],
      });
      host.life = life;
      let result: Promise<unknown>;
      if (target === 'mp-alipay') {
        runtime.hooks.onInit.call(host);
        result = runtime.hooks.didMount.call(host);
      } else result = runtime.hooks.attached.call(host);
      unmount();
      host.life = undefined;
      mount();
      reject(new Error('old lifecycle failed'));
      await expect(result).resolves.toBeUndefined();
    });
  }
  it('preserves the rejection returned by an active lifecycle', async () => {
    const failure = new Error('active lifecycle failed');
    const { runtime, host } = fixture('mp-weixin', {
      lifecycle: [{ key: 'attached', fn: 'function(){return this.life;}' }],
    });
    host.life = Promise.reject(failure);
    await expect(runtime.hooks.attached.call(host)).rejects.toBe(failure);
  });
  it('consumes old Alipay beforeMount and page onLoad lifecycle rejections', async () => {
    for (const page of [false, true]) {
      let reject!: (error: unknown) => void;
      const life = new Promise((_resolve, rejecter) => {
        reject = rejecter;
      });
      const { runtime, host, mount, unmount } = fixture('mp-alipay', {
        kind: page ? 'page' : 'component',
        lifecycle: [
          {
            key: page ? 'onLoad' : 'created',
            fn: 'function(){return this.life;}',
          },
        ],
      });
      host.life = life;
      const result = runtime.hooks[page ? 'onLoad' : 'onInit'].call(host);
      unmount();
      host.life = undefined;
      mount();
      reject(new Error('old load failed'));
      await expect(result).resolves.toBeUndefined();
    }
  });
  it('compiles guardCallback and creates a lifecycle scope for a static component without user hooks', () => {
    const source = ts.createSourceFile(
      'async-card.ts',
      `class Card{initState(){return{count:0};}initStyles(){}tap(callback?:()=>void){return this.guardCallback(callback??(()=>{}));}render(){return h('button',{onClick:()=>this.tap()},[this.state.count]);}}`,
      ts.ScriptTarget.Latest,
      true
    );
    const context: CompileContext = {
      ts,
      root: '/',
      files: new Map(),
      components: new Map(),
      compiling: new Set(),
      callSites: new Map(),
      lengthUnit: 'px',
      dialect: MP_DIALECTS['mp-weixin']!,
      warnings: [],
    };
    let unit!: CompiledUnit;
    expect(() => {
      unit = compileUnit(
        context,
        {
          filePath: 'async-card.ts',
          source,
          declaration: source.statements.find(ts.isClassDeclaration)!,
          className: 'Card',
        },
        { kind: 'component', name: 'card' }
      );
    }).not.toThrow();
    expect(unit.initialization).toBeUndefined();
    const { host, runtime, mount, unmount } = fixture('mp-weixin', unit);
    for (const method of unit.methods)
      host[method.key] = new Function(
        `${runtimePreamble(unit, context.dialect)};return (${method.fn});`
      )();
    let callback: Function = () => {};
    expect(() => {
      callback = host.tap(() => host.setData({ count: 99 }));
    }).not.toThrow();
    mount();
    callback();
    expect(host.data.count).toBe(99);
    unmount();
    mount();
    host.setData({ count: 7 });
    callback();
    expect(host.data.count).toBe(7);
    runtime.observer.call(host, { seed: 0 });
  });
});
