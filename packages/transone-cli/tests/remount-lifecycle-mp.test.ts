import { describe, expect, it } from 'bun:test';
import { MP_DIALECTS } from '../src/mp/dialect';
import { lifecycleEntries, runtimePreamble } from '../src/mp/props-runtime';
import type { CompiledUnit } from '../src/mp/types';

function fixture(target: string, initialized: boolean) {
  const dialect = MP_DIALECTS[target]!;
  const unit: CompiledUnit = {
    kind: 'component',
    name: 'card',
    template: '',
    style: '',
    globalStyle: '',
    data: '{count:0}',
    properties: {},
    methods: [],
    lifecycle: [
      {
        key: 'created',
        fn: `function(){this.sequence.push('before');this.setData({count:__transone_state(this).count+1});if(this.failBefore)throw failure;}`,
      },
      {
        key: 'attached',
        fn: `function(){this.sequence.push('mounted');if(this.patchOnMounted)this.setData({count:__transone_state(this).count+1});}`,
      },
      {
        key: 'detached',
        fn: `function(){this.sequence.push('unmounted');if(this.attachOnUnmount)this.attach();}`,
      },
    ],
    customEvents: [],
    propsReferenced: new Set(),
    usingComponents: {},
    inlineModules: [],
    initialization: initialized
      ? 'function(){this.initializations=(this.initializations||0)+1;return{count:0};}'
      : undefined,
  };
  const failure = new Error('before failed');
  const entries = lifecycleEntries(unit, dialect);
  const hooks = new Function(
    'failure',
    `${runtimePreamble(unit, dialect)};return {${entries.map(({ key, fn }) => `${JSON.stringify(key)}:${fn}`).join(',')}};`
  )(failure);
  const value: Record<string, any> = {
    data: { count: 0 },
    properties: {},
    props: {},
    sequence: [],
    nativeReady: false,
    reenter: false,
    patchOnMounted: false,
    failBefore: false,
    setData(patch: object) {
      if (!this.nativeReady) throw new Error('created cannot setData');
      Object.assign(this.data, structuredClone(patch));
      if (this.reenter) {
        this.attach();
        if (target === 'mp-alipay') hooks.didMount?.call(this);
      }
    },
  };
  const attach = () => {
    value.nativeReady = true;
    hooks[target === 'mp-alipay' ? 'onInit' : 'attached']?.call(value);
    if (target === 'mp-alipay') hooks.didMount?.call(value);
  };
  value.attach = attach;
  const detach = () =>
    hooks[target === 'mp-alipay' ? 'didUnmount' : 'detached']?.call(value);
  return { hooks, value, failure, attach, detach };
}

describe('mini program mount cycles', () => {
  for (const target of [
    'mp-weixin',
    'mp-bytedance',
    'mp-xiaohongshu',
    'mp-alipay',
  ])
    it(`${target} stops a mount detached by its initial native patch and reuses initialized state later`, () => {
      const { value, attach, detach } = fixture(target, true);
      const native = value.setData;
      let cancelled = false;
      value.setData = function (patch: object) {
        native.call(this, patch);
        if (!cancelled) {
          cancelled = true;
          detach();
        }
      };
      attach();
      expect(value.sequence).toEqual(['unmounted']);
      expect(value.data.count).toBe(0);
      expect(value.initializations).toBe(1);
      attach();
      expect(value.sequence).toEqual(['unmounted', 'before', 'mounted']);
      expect(value.data.count).toBe(1);
      expect(value.initializations).toBe(1);
    });
  for (const target of [
    'mp-weixin',
    'mp-bytedance',
    'mp-xiaohongshu',
    'mp-alipay',
  ])
    for (const initialized of [false, true]) {
      const label = `${target} ${initialized ? 'runtime fields' : 'static state'}`;
      it(`${label} does not reenter beforeMount or onMounted through native data updates`, () => {
        const { value, attach } = fixture(target, initialized);
        value.reenter = true;
        value.patchOnMounted = true;
        attach();
        expect(value.sequence).toEqual(['before', 'mounted']);
        expect(value.data.count).toBe(2);
        expect(value.initializations ?? 0).toBe(initialized ? 1 : 0);
      });
      it(`${label} preserves state through three detach/reattach cycles and ignores duplicate attach`, () => {
        const { value, hooks, attach, detach } = fixture(target, initialized);
        for (let cycle = 0; cycle < 3; cycle++) {
          attach();
          attach();
          expect(value.data.count).toBe(cycle + 1);
          detach();
          detach();
          if (target === 'mp-alipay') hooks.didMount?.call(value);
        }
        expect(value.sequence).toEqual([
          'before',
          'mounted',
          'unmounted',
          'before',
          'mounted',
          'unmounted',
          'before',
          'mounted',
          'unmounted',
        ]);
        expect(value.initializations ?? 0).toBe(initialized ? 1 : 0);
      });
      it(`${label} stops after a failed beforeMount and retries without resetting successful state`, () => {
        const { value, hooks, failure, attach } = fixture(target, initialized);
        value.failBefore = true;
        expect(attach).toThrow(failure);
        if (target === 'mp-alipay') hooks.didMount?.call(value);
        expect(value.sequence).toEqual(['before']);
        expect(value.data.count).toBe(1);
        value.failBefore = false;
        attach();
        expect(value.sequence).toEqual(['before', 'before', 'mounted']);
        expect(value.data.count).toBe(2);
        expect(value.initializations ?? 0).toBe(initialized ? 1 : 0);
      });
    }
  for (const target of ['mp-weixin', 'mp-bytedance', 'mp-xiaohongshu'])
    it(`${target} runs beforeMount only after native data becomes writable without runtime fields`, () => {
      const { hooks, value, attach } = fixture(target, false);
      hooks.created?.call(value);
      expect(value.sequence).toEqual([]);
      attach();
      expect(value.sequence).toEqual(['before', 'mounted']);
    });
  it('ignores an Alipay didMount after detach and blocks mounting during the unmount hook', () => {
    const { value, hooks, attach, detach } = fixture('mp-alipay', true);
    attach();
    value.attachOnUnmount = true;
    detach();
    hooks.didMount.call(value);
    expect(value.sequence).toEqual(['before', 'mounted', 'unmounted']);
    value.attachOnUnmount = false;
    attach();
    expect(value.sequence).toEqual([
      'before',
      'mounted',
      'unmounted',
      'before',
      'mounted',
    ]);
  });
});
