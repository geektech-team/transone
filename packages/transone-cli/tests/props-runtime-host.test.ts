import { describe, expect, it } from 'bun:test';
import { MP_DIALECTS, type MpDialect } from '../src/mp/dialect';
import type { CompiledUnit, FunctionEntry } from '../src/mp/types';
import { generateComponentJs } from '../src/mp/jsgen';
import {
  getPropsContainer,
  lifecycleEntries,
  propertyObserverBody,
  runtimePreamble,
} from '../src/mp/props-runtime';

interface RuntimeUnit extends CompiledUnit {
  initializationKeys?: string[];
  initializationFields?: string[];
  propsInitialization?: boolean;
  rootProps?: string;
  initializationWritesState?: boolean;
}

function unit(overrides: Partial<RuntimeUnit> = {}): RuntimeUnit {
  return {
    kind: 'component',
    name: 'card',
    template: '',
    style: '',
    globalStyle: '',
    data: '{}',
    properties: { seed: 'Number', caption: 'String' },
    methods: [],
    lifecycle: [],
    customEvents: [],
    propsReferenced: new Set(),
    usingComponents: {},
    inlineModules: [],
    initialization: `function () {
      this.initializations = (this.initializations || 0) + 1;
      this.seedSnapshot = this.__transone_initial_props.seed ?? 8;
      this.caption = this.__transone_initial_props.caption ?? 'fallback';
      this.items = [{score: 1}];
      this.model = {count: this.seedSnapshot, rows: this.items};
      return this.model;
    }`,
    initializationFields: ['seedSnapshot', 'caption', 'model', 'items'],
    propsInitialization: true,
    ...overrides,
  };
}

function load(compiled: RuntimeUnit, dialect: MpDialect, failure?: Error) {
  const entries = lifecycleEntries(compiled, dialect);
  return new Function(
    'failure',
    `${runtimePreamble(compiled, dialect)}
    return {
      hooks: {${entries.map(({ key, fn }) => `${JSON.stringify(key)}: ${fn}`).join(',')}},
      observer: function (previousProps) { ${propertyObserverBody(compiled, dialect)} },
      props: __transone_props,
      state: __transone_state,
    };
  `
  )(failure) as {
    hooks: Record<string, (...args: unknown[]) => unknown>;
    observer: (
      this: Record<string, any>,
      previousProps?: Record<string, any>
    ) => void;
    props: (host: Record<string, any>) => Record<string, any>;
    state: (host: Record<string, any>) => Record<string, any>;
  };
}

// The host rejects created-time setData and copies data across its render bridge.
// This deliberately keeps native data distinct from the original initState object.
function host(
  runtime: ReturnType<typeof load>,
  props: Record<string, any> = {}
) {
  const value: Record<string, any> = {
    data: { nativeMarker: 'kept' },
    properties: {},
    props: {},
    calls: [],
    readyForData: false,
    onPropsChange() {
      this.observed = (this.observed || 0) + 1;
      this.lastProps = runtime.props(this);
    },
    setData(patch: Record<string, any>, callback?: () => void) {
      if (!this.readyForData) throw new Error('created cannot setData');
      this.calls.push(patch);
      for (const [path, next] of Object.entries(patch)) {
        const parts = path.split(/[.[\]]/).filter(Boolean);
        let cursor = this.data;
        for (let index = 0; index < parts.length - 1; index++) {
          const key = parts[index]!;
          cursor = cursor[key] ??= /^\d+$/.test(parts[index + 1]!) ? [] : {};
        }
        cursor[parts[parts.length - 1]!] = structuredClone(next);
      }
      runtime.observer.call(this, this.props);
      callback?.call(this);
    },
  };
  Object.assign(value, props);
  return value;
}

function setProps(
  value: Record<string, any>,
  container: 'properties' | 'props' | 'data',
  props: Record<string, any>
) {
  if (container === 'data') Object.assign(value.data, props);
  else value[container] = props;
}

function mount(
  runtime: ReturnType<typeof load>,
  value: Record<string, any>,
  dialect: MpDialect
) {
  value.readyForData = true;
  runtime.hooks[dialect.id === 'mp-alipay' ? 'onInit' : 'attached']?.call(
    value
  );
  if (dialect.id === 'mp-alipay') runtime.hooks.didMount?.call(value);
}

describe('mini program native props initialization runtime', () => {
  for (const target of [
    'mp-weixin',
    'mp-bytedance',
    'mp-xiaohongshu',
    'mp-alipay',
  ] as const) {
    const dialect = MP_DIALECTS[target]!;
    it(`${target} restores declared fields after initializer failure and retries with current props`, () => {
      const failure = new Error('field initialization failed');
      const runtime = load(
        unit({
          initializationKeys: ['captured', 'fresh'],
          initializationFields: ['captured'],
          initialization: `function(){
        this.attempts=(this.attempts||0)+1;
        Object.defineProperty(this,'captured',{value:{seed:this.__transone_initial_props.seed},writable:true,enumerable:true,configurable:true});
        Object.defineProperty(this,'fresh',{value:[this.__transone_initial_props.seed],writable:true,enumerable:true,configurable:true});
        if(this.failInitialization) throw failure;
        return {count:this.__transone_initial_props.seed};
      }`,
        }),
        dialect,
        failure
      );
      const value = host(runtime, { failInitialization: true });
      const previous = { seed: -1 };
      Object.defineProperty(value, 'captured', {
        value: previous,
        writable: false,
        enumerable: false,
        configurable: true,
      });
      const descriptor = Object.getOwnPropertyDescriptor(value, 'captured');
      let reads = 0;
      Object.defineProperty(value, 'unrelated', {
        get() {
          reads++;
          throw new Error('must not execute');
        },
        configurable: true,
      });
      const beforeSetData = Object.getOwnPropertyDescriptor(value, 'setData');
      setProps(value, getPropsContainer(dialect), {
        __transone_props: { seed: 2 },
      });
      expect(() => mount(runtime, value, dialect)).toThrow(failure);
      expect(Object.getOwnPropertyDescriptor(value, 'captured')).toEqual(
        descriptor
      );
      expect(Object.prototype.hasOwnProperty.call(value, 'fresh')).toBe(false);
      expect(Object.getOwnPropertyDescriptor(value, 'setData')).toEqual(
        beforeSetData
      );
      expect(value.__transone_fields_ready).toBeUndefined();
      expect(reads).toBe(0);
      value.failInitialization = false;
      setProps(value, getPropsContainer(dialect), {
        __transone_props: { seed: 7 },
      });
      mount(runtime, value, dialect);
      expect(runtime.state(value).count).toBe(7);
      expect(value.captured.seed).toBe(7);
      expect(value.fresh).toEqual([7]);
      expect(value.attempts).toBe(2);
      const wrapped = value.setData;
      mount(runtime, value, dialect);
      expect(value.setData).toBe(wrapped);
      expect(value.attempts).toBe(2);
    });

    it(`${target} restores native data and inherited setData after a partially applied initial patch`, () => {
      const failure = new Error('native initial patch failed');
      const runtime = load(
        unit({
          initializationKeys: ['captured'],
          initializationFields: ['captured'],
          initialization: `function(){
        Object.defineProperty(this,'captured',{value:this.__transone_initial_props.seed,writable:true,enumerable:true,configurable:true});
        return {count:this.captured};
      }`,
        }),
        dialect,
        failure
      );
      const value = host(runtime, { failNative: true });
      const originalNative = value.setData;
      let calls = 0;
      const prototype = {
        setData(
          this: Record<string, any>,
          patch: Record<string, any>,
          callback?: () => void
        ) {
          calls++;
          if (this.failNative) {
            this.data.nested.value = 99;
            this.data.rows.push('partial');
            this.data.added = 'partial';
            this.data.count = patch.count;
            throw failure;
          }
          return originalNative.call(this, patch, callback);
        },
      };
      Object.setPrototypeOf(value, prototype);
      delete value.setData;
      const nested = { value: 1 };
      const rows = ['kept'];
      Object.assign(value.data, { nested, alias: nested, rows });
      let getterReads = 0;
      Object.defineProperty(value.data, 'untouchedGetter', {
        get() {
          getterReads++;
          return 'untouched';
        },
        enumerable: true,
        configurable: true,
      });
      setProps(value, getPropsContainer(dialect), {
        __transone_props: { seed: 2 },
      });
      const data = value.data;
      expect(() => mount(runtime, value, dialect)).toThrow(failure);
      expect(value.data).toBe(data);
      expect(data.nested).toBe(nested);
      expect(data.alias).toBe(nested);
      expect(nested.value).toBe(1);
      expect(data.rows).toBe(rows);
      expect(rows).toEqual(['kept']);
      expect(Object.prototype.hasOwnProperty.call(data, 'added')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(data, 'count')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(value, 'captured')).toBe(
        false
      );
      expect(Object.prototype.hasOwnProperty.call(value, 'setData')).toBe(
        false
      );
      expect(value.setData).toBe(prototype.setData);
      expect(getterReads).toBe(0);
      value.failNative = false;
      setProps(value, getPropsContainer(dialect), {
        __transone_props: { seed: 6 },
      });
      mount(runtime, value, dialect);
      expect(runtime.state(value).count).toBe(6);
      value.setData({ count: 8 });
      expect(calls).toBe(3);
      expect(runtime.state(value).count).toBe(8);
      expect(getterReads).toBe(0);
    });

    it(`${target} skips lifecycle work reentered by the first native patch`, () => {
      const runtime = load(
        unit({
          lifecycle: [
            { key: 'created', fn: `function(){this.sequence.push('before');}` },
            {
              key: 'attached',
              fn: `function(){this.sequence.push('mounted');}`,
            },
          ],
        }),
        dialect
      );
      const value = host(runtime, { sequence: [] });
      const originalNative = value.setData;
      let reentered = false;
      value.setData = function (patch: Record<string, any>) {
        if (!reentered) {
          reentered = true;
          runtime.hooks[target === 'mp-alipay' ? 'onInit' : 'attached']!.call(
            this
          );
        }
        return originalNative.call(this, patch);
      };
      mount(runtime, value, dialect);
      expect(value.sequence).toEqual(['before', 'mounted']);
      expect(value.initializations).toBe(1);
    });
  }

  it('rejects native props accessors before evaluating them or defining fields', () => {
    const dialect = MP_DIALECTS['mp-weixin']!;
    const runtime = load(
      unit({
        initializationKeys: ['captured'],
        initializationFields: [],
        initialization: `function(){this.captured=this.__transone_initial_props.seed;return {count:this.captured};}`,
      }),
      dialect
    );
    let reads = 0;
    const packet = Object.defineProperty({}, 'seed', {
      enumerable: true,
      get() {
        reads++;
        return 3;
      },
    });
    const value = host(runtime, { properties: { __transone_props: packet } });
    expect(() => mount(runtime, value, dialect)).toThrow(
      /props.*getter|props.*accessor/
    );
    expect(reads).toBe(0);
    expect(value.captured).toBeUndefined();
    expect(value.calls).toEqual([]);
  });

  it('preserves the original error and continues cleanup when one field cannot be restored', () => {
    const dialect = MP_DIALECTS['mp-weixin']!;
    const failure = new Error('primary initialization error');
    const runtime = load(
      unit({
        initializationKeys: ['blocked', 'fresh'],
        initializationFields: [],
        initialization: `function(){Object.defineProperty(this,'blocked',{value:1,configurable:false});Object.defineProperty(this,'fresh',{value:2,configurable:true});throw failure;}`,
      }),
      dialect,
      failure
    );
    const value = host(runtime);
    let actual: unknown;
    try {
      mount(runtime, value, dialect);
    } catch (error) {
      actual = error;
    }
    expect(actual).toBe(failure);
    expect(
      (failure as Error & { cleanupErrors?: unknown[] }).cleanupErrors
    ).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(value, 'fresh')).toBe(false);
    expect(value.__transone_initial_props).toBeUndefined();
    expect(value.__transone_initializing).toBeUndefined();
  });

  it('restores the initialization guard if reading the native setData method throws', () => {
    const dialect = MP_DIALECTS['mp-weixin']!;
    const failure = new Error('native setData unavailable');
    const runtime = load(unit(), dialect);
    const value = host(runtime);
    Object.defineProperty(value, 'setData', {
      get() {
        throw failure;
      },
      configurable: true,
    });
    expect(() => mount(runtime, value, dialect)).toThrow(failure);
    expect(value.__transone_initializing).toBeUndefined();
  });

  it('rejects the internal props packet accessor without executing it', () => {
    const dialect = MP_DIALECTS['mp-weixin']!;
    const runtime = load(unit(), dialect);
    let reads = 0;
    const properties = Object.defineProperty({}, '__transone_props', {
      enumerable: true,
      get() {
        reads++;
        return { seed: 4 };
      },
    });
    const value = host(runtime, { properties });
    expect(() => mount(runtime, value, dialect)).toThrow(
      /props.*getter|props.*accessor/
    );
    expect(reads).toBe(0);
    expect(value.__transone_initializing).toBeUndefined();
  });

  it('does not run Alipay didMount while its first native data patch is initializing', () => {
    const dialect = MP_DIALECTS['mp-alipay']!;
    const runtime = load(
      unit({
        lifecycle: [
          { key: 'created', fn: `function(){this.sequence.push('before');}` },
          { key: 'attached', fn: `function(){this.sequence.push('mounted');}` },
        ],
      }),
      dialect
    );
    const value = host(runtime, { sequence: [] });
    const originalNative = value.setData;
    value.setData = function (patch: Record<string, any>) {
      runtime.hooks.didMount!.call(this);
      return originalNative.call(this, patch);
    };
    mount(runtime, value, dialect);
    expect(value.sequence).toEqual(['before', 'mounted']);
  });

  it('does not run a page onLoad reentered by its first native data patch', () => {
    const dialect = MP_DIALECTS['mp-weixin']!;
    const runtime = load(
      unit({
        kind: 'page',
        lifecycle: [
          {
            key: 'onLoad',
            fn: `function(query){this.sequence.push(query.id);return query.id;}`,
          },
        ],
      }),
      dialect
    );
    const value = host(runtime, { sequence: [], readyForData: true });
    const originalNative = value.setData;
    let reentered = false;
    value.setData = function (patch: Record<string, any>) {
      if (!reentered) {
        reentered = true;
        runtime.hooks.onLoad!.call(this, { id: 'inner' });
      }
      return originalNative.call(this, patch);
    };
    expect(runtime.hooks.onLoad!.call(value, { id: 'outer' })).toBe('outer');
    expect(value.sequence).toEqual(['outer']);
  });
  for (const [target, container] of [
    ['mp-weixin', 'properties'],
    ['mp-bytedance', 'properties'],
    ['mp-xiaohongshu', 'data'],
    ['mp-alipay', 'props'],
  ] as const) {
    const dialect = MP_DIALECTS[target]!;
    it(`${target} waits for real props and snapshots fields and state only once`, () => {
      const compiled = unit({
        lifecycle: [
          {
            key: 'created',
            fn: `function () { this.sequence.push('before'); this.setData({count: __transone_state(this).count + 1}); }`,
          },
          {
            key: 'attached',
            fn: `function () { this.sequence.push('mounted'); this.mountedCount = __transone_state(this).count; }`,
          },
        ],
      });
      const runtime = load(compiled, dialect);
      const value = host(runtime, { sequence: [] });
      setProps(value, container, { seed: '', caption: '' });
      runtime.hooks.created?.call(value);
      runtime.observer.call(value);
      expect(value.initializations).toBeUndefined();
      expect(value.calls).toEqual([]);

      setProps(value, container, {
        seed: 6,
        caption: 'parent',
        __transone_props: { seed: 6, caption: 'parent' },
      });
      mount(runtime, value, dialect);
      expect(getPropsContainer(dialect)).toBe(container);
      expect(value.seedSnapshot).toBe(6);
      expect(value.caption).toBe('parent');
      expect(runtime.state(value).count).toBe(7);
      expect(value.mountedCount).toBe(7);
      expect(value.sequence).toEqual(['before', 'mounted']);
      expect(value.initializations).toBe(1);
      expect(value.data.nativeMarker).toBe('kept');
      expect(runtime.props(value)).toEqual({ seed: 6, caption: 'parent' });

      const previousProps = { ...value[container] };
      setProps(value, container, {
        seed: 20,
        caption: 'later',
        __transone_props: { seed: 20, caption: 'later' },
      });
      runtime.observer.call(value, previousProps);
      expect(runtime.props(value)).toEqual({ seed: 20, caption: 'later' });
      expect(value.lastProps).toEqual({ seed: 20, caption: 'later' });
      expect(value.seedSnapshot).toBe(6);
      expect(runtime.state(value).count).toBe(7);
      expect(value.initializations).toBe(1);
    });

    it(`${target} respects empty prop packets instead of native defaults`, () => {
      const runtime = load(unit(), dialect);
      const value = host(runtime);
      setProps(value, container, {
        seed: '',
        caption: '',
        hidden: 'secret',
        __transone_props: {},
      });
      mount(runtime, value, dialect);
      expect(runtime.props(value)).toEqual({});
      expect(value.seedSnapshot).toBe(8);
      expect(value.caption).toBe('fallback');
      expect(runtime.state(value).count).toBe(8);
    });
  }

  it('filters legacy native bags but preserves every own enumerable packet key', () => {
    const dialect = MP_DIALECTS['mp-weixin']!;
    const runtime = load(unit(), dialect);
    const value = host(runtime, {
      properties: { seed: 0, caption: '', hidden: true },
    });
    expect(runtime.props(value)).toEqual({ seed: 0, caption: '' });
    const packet = Object.create({ inherited: 'excluded' });
    Object.defineProperties(packet, {
      seed: { value: 4, enumerable: true },
      extra: { value: { count: 7 }, enumerable: true },
      hidden: { value: true },
      __proto__: { value: { safe: true }, enumerable: true },
    });
    // Object-literal __proto__ has special syntax, so define its descriptor directly.
    Object.defineProperty(packet, '__proto__', {
      value: { safe: true },
      enumerable: true,
      configurable: true,
    });
    value.properties.__transone_props = packet;
    const actual = runtime.props(value);
    expect(Object.keys(actual)).toEqual(['seed', 'extra', '__proto__']);
    expect(actual.seed).toBe(4);
    expect(actual.extra).toBe(packet.extra);
    expect(Object.prototype.hasOwnProperty.call(actual, '__proto__')).toBe(
      true
    );
    expect(actual.__proto__).toEqual({ safe: true });
    expect(Object.getPrototypeOf(actual)).toBe(Object.prototype);
  });

  for (const invalid of [
    'null',
    'undefined',
    '[]',
    '2',
    'new Date()',
    'Object.create({ inherited: true })',
    '{nested: NaN}',
    '{nested: Infinity}',
    '{nested: undefined}',
    '{nested: function () {}}',
    '{nested: Symbol("value")}',
    '{nested: 1n}',
    '{nested: new Date()}',
    '(() => { const cycle = {}; cycle.self = cycle; return cycle; })()',
  ]) {
    it(`rejects invalid initial state before native setData: ${invalid}`, () => {
      const dialect = MP_DIALECTS['mp-weixin']!;
      const runtime = load(
        unit({
          initialization: `function () { return ${invalid}; }`,
          initializationFields: [],
        }),
        dialect
      );
      const value = host(runtime);
      expect(() => mount(runtime, value, dialect)).toThrow(
        /initState|state|JSON/
      );
      expect(value.calls).toEqual([]);
      expect(value.__transone_initializing).toBeUndefined();
      expect(value.__transone_fields_ready).toBeUndefined();
    });
  }

  it('rejects state accessors without invoking their getters and allows a valid retry', () => {
    const dialect = MP_DIALECTS['mp-weixin']!;
    const runtime = load(
      unit({
        initialization: 'function () { return this.pending; }',
        initializationFields: [],
      }),
      dialect
    );
    let reads = 0;
    const value = host(runtime, {
      pending: {
        nested: Object.defineProperty({}, 'value', {
          enumerable: true,
          get() {
            reads++;
            return 7;
          },
        }),
      },
    });
    expect(() => mount(runtime, value, dialect)).toThrow(
      /getter|accessor|JSON|state/
    );
    expect(reads).toBe(0);
    expect(value.calls).toEqual([]);
    value.pending = Object.assign(Object.create(null), {
      count: 3,
      values: [1, null, true, 'text'],
    });
    mount(runtime, value, dialect);
    expect(runtime.state(value)).toBe(value.pending);
    expect(value.data.count).toBe(3);
    expect(value.data.values).toEqual([1, null, true, 'text']);
  });

  for (const root of [
    'this.__transone_initial_props',
    'this.__transone_initial_props.settings',
    'this.__transone_initial_props.groups[0]',
  ]) {
    it(`rejects writing through a props object returned as the state root: ${root}`, () => {
      const dialect = MP_DIALECTS['mp-weixin']!;
      const runtime = load(
        unit({
          initialization: `function () { return ${root}; }`,
          initializationFields: [],
          initializationWritesState: true,
        }),
        dialect
      );
      const value = host(runtime, {
        properties: {
          __transone_props: {
            seed: 3,
            settings: { count: 3 },
            groups: [{ count: 4 }],
          },
        },
      });
      expect(() => mount(runtime, value, dialect)).toThrow(
        /props.*state|展开|copy|spread/
      );
      expect(value.calls).toEqual([]);
      expect(value.properties.__transone_props.settings.count).toBe(3);
      expect(value.__transone_fields_ready).toBeUndefined();
    });
  }

  it('allows a readonly props root and an explicitly copied mutable state root', () => {
    const dialect = MP_DIALECTS['mp-weixin']!;
    const readonly = load(
      unit({
        initialization: 'function () { return this.__transone_initial_props; }',
        initializationFields: [],
        initializationWritesState: false,
      }),
      dialect
    );
    const first = host(readonly, {
      properties: { __transone_props: { extra: 9 } },
    });
    mount(readonly, first, dialect);
    expect(readonly.state(first)).toBe(first.__transone_initial_props);
    expect(readonly.state(first).extra).toBe(9);

    const mutable = load(
      unit({
        initialization:
          'function () { return {...this.__transone_initial_props.settings}; }',
        initializationFields: [],
        initializationWritesState: true,
      }),
      dialect
    );
    const packet = { settings: { count: 4 } };
    const second = host(mutable, { properties: { __transone_props: packet } });
    mount(mutable, second, dialect);
    second.setData({ count: 12 });
    expect(mutable.state(second).count).toBe(12);
    expect(packet.settings.count).toBe(4);
  });

  it('keeps raw state aliases while native patches use dot and index paths', () => {
    const dialect = MP_DIALECTS['mp-xiaohongshu']!;
    const runtime = load(unit(), dialect);
    const value = host(runtime);
    setProps(value, 'data', {
      seed: 3,
      caption: 'native-prop',
      __transone_props: { seed: 3, caption: 'native-prop' },
    });
    mount(runtime, value, dialect);
    const raw = runtime.state(value);
    expect(raw).toBe(value.model);
    expect(raw.rows).toBe(value.items);
    expect(raw).not.toBe(value.data);
    let callbackThis: unknown;
    value.setData(
      { count: 11, 'rows[0].score': 9, 'newRows[0].value': 5 },
      function (this: unknown) {
        callbackThis = this;
      }
    );
    expect(raw).toEqual({
      count: 11,
      rows: [{ score: 9 }],
      newRows: [{ value: 5 }],
    });
    expect(value.items).toEqual([{ score: 9 }]);
    expect(callbackThis).toBe(value);
    expect(value.data.seed).toBe(3);
    expect(value.data.caption).toBe('native-prop');
    expect(value.data.__transone_initial_fields).toEqual({
      seedSnapshot: 3,
      caption: 'native-prop',
      model: raw,
      items: [{ score: 9 }],
    });
    value.setData({ 'rows.length': 0 });
    expect(raw.rows).toBe(value.items);
    expect(value.items).toEqual([]);
    expect(value.data.__transone_initial_fields.items).toEqual([]);
  });

  it('omits undefined template object entries while preserving raw instance fields', () => {
    const dialect = MP_DIALECTS['mp-weixin']!;
    const runtime = load(
      unit({
        initialization: `function(){this.missing=undefined;this.object={missing:undefined,count:1};return {count:0};}`,
        initializationFields: ['missing', 'object'],
      }),
      dialect
    );
    const value = host(runtime);
    mount(runtime, value, dialect);
    expect(Object.prototype.hasOwnProperty.call(value, 'missing')).toBe(true);
    expect(value.object).toEqual({ missing: undefined, count: 1 });
    expect(value.data.__transone_initial_fields).toEqual({
      object: { count: 1 },
    });
    expect(
      Object.prototype.hasOwnProperty.call(
        value.data.__transone_initial_fields,
        'missing'
      )
    ).toBe(false);
  });

  it('rejects undefined in a rendered array before submitting native data', () => {
    const dialect = MP_DIALECTS['mp-weixin']!;
    const runtime = load(
      unit({
        initialization: `function(){this.items=[undefined];return {count:0};}`,
        initializationFields: ['items'],
      }),
      dialect
    );
    const value = host(runtime);
    expect(() => mount(runtime, value, dialect)).toThrow(/数组|undefined/);
    expect(value.calls).toEqual([]);
  });

  it('does not reenter initialization through observers fired by its first native setData', () => {
    const dialect = MP_DIALECTS['mp-weixin']!;
    const runtime = load(unit(), dialect);
    const value = host(runtime, { properties: { seed: 2 } });
    mount(runtime, value, dialect);
    expect(value.initializations).toBe(1);
    expect(value.observed).toBeUndefined();
    value.setData({ count: 9 });
    expect(value.observed).toBe(1);
    expect(value.initializations).toBe(1);
  });

  it('gives each page fresh root props and state before onLoad', () => {
    const dialect = MP_DIALECTS['mp-weixin']!;
    const runtime = load(
      unit({
        kind: 'page',
        properties: {},
        rootProps: '{seed: 5, caption: "root"}',
        lifecycle: [
          {
            key: 'onLoad',
            fn: `function (query) { this.query = query; this.loaded = __transone_state(this).count; }`,
          },
        ],
      }),
      dialect
    );
    const first = host(runtime),
      second = host(runtime);
    first.readyForData = second.readyForData = true;
    runtime.hooks.onLoad!.call(first, { id: 'one' });
    runtime.hooks.onLoad!.call(second, { id: 'two' });
    expect(first.loaded).toBe(5);
    expect(first.query).toEqual({ id: 'one' });
    expect(runtime.props(first)).toEqual({ seed: 5, caption: 'root' });
    runtime.props(first).seed = 18;
    expect(runtime.props(second).seed).toBe(5);
    expect(runtime.state(first)).not.toBe(runtime.state(second));
  });

  it('preserves an initialization failure and permits a clean retry', () => {
    const dialect = MP_DIALECTS['mp-weixin']!;
    const failure = new Error('original initialization failure');
    const runtime = load(
      unit({
        initialization: `function () {
      if (!this.retry) { this.retry = true; throw failure; }
      return {count: this.__transone_initial_props.seed};
    }`,
      }),
      dialect,
      failure
    );
    const value = host(runtime, {
      properties: { seed: 2 },
      readyForData: true,
    });
    expect(() => runtime.hooks.attached!.call(value)).toThrow(failure);
    value.properties.seed = 4;
    runtime.hooks.attached!.call(value);
    expect(runtime.state(value).count).toBe(4);
  });

  it('maps Alipay lifecycles with and without initialization', () => {
    const lifecycle: FunctionEntry[] = [
      { key: 'created', fn: 'function () { this.started = true; }' },
      { key: 'attached', fn: 'function () { this.mounted = true; }' },
      { key: 'detached', fn: 'function () { this.removed = true; }' },
    ];
    const dialect = MP_DIALECTS['mp-alipay']!;
    const runtime = load(unit({ lifecycle }), dialect);
    const value = host(runtime);
    runtime.hooks.didUnmount!.call(value);
    expect(value.removed).toBe(true);
    const legacy = load(
      unit({ initialization: undefined, lifecycle }),
      dialect
    );
    expect(Object.keys(legacy.hooks)).toEqual([
      'onInit',
      'didMount',
      'didUnmount',
    ]);
    legacy.hooks.onInit!.call(value);
    legacy.hooks.didMount!.call(value);
    legacy.hooks.didUnmount!.call(value);
    expect(value.started).toBe(true);
    expect(value.mounted).toBe(true);
    expect(value.removed).toBe(true);
    const weixin = load(
      unit({ initialization: undefined, lifecycle }),
      MP_DIALECTS['mp-weixin']!
    );
    const plain = host(weixin);
    weixin.hooks.created?.call(plain);
    expect(plain.started).toBeUndefined();
    weixin.hooks.attached!.call(plain);
    expect(plain.started).toBe(true);
    expect(plain.mounted).toBe(true);
    weixin.hooks.detached!.call(plain);
    expect(plain.removed).toBe(true);
  });

  for (const initialized of [false, true])
    it(`Alipay notifies only changed props and permits setState in onPropsChange (${initialized ? 'initialized' : 'legacy'})`, () => {
      const dialect = MP_DIALECTS['mp-alipay']!;
      const compiled = unit({
        initialization: initialized ? unit().initialization : undefined,
        methods: [
          {
            key: 'onPropsChange',
            fn: 'function () { this.observed = (this.observed || 0) + 1; this.setData({count: this.observed}); }',
          },
        ],
      });
      let definition: Record<string, any> = {};
      new Function('Component', generateComponentJs(compiled, dialect))(
        (value: typeof definition) => (definition = value)
      );
      const value: Record<string, any> = {
        ...definition.methods,
        props: {
          seed: 3,
          caption: 'first',
          __transone_props: { seed: 3, caption: 'first' },
        },
        data: structuredClone(definition.data),
        setData(patch: Record<string, any>) {
          if ((this.observed || 0) > 3)
            throw new Error('recursive props notification');
          const previousData = { ...this.data };
          Object.assign(this.data, structuredClone(patch));
          definition.didUpdate.call(this, this.props, previousData);
        },
      };
      definition.onInit?.call(value);
      value.setData({ count: 8 });
      expect(value.observed).toBeUndefined();
      const previous = value.props;
      value.props = {
        seed: 5,
        caption: 'second',
        __transone_props: { seed: 5, caption: 'second' },
      };
      definition.didUpdate.call(value, previous, { ...value.data });
      expect(value.observed).toBe(1);
      expect(value.data.count).toBe(1);
      const identical = value.props;
      value.props = {
        ...identical,
        __transone_props: { ...identical.__transone_props },
      };
      definition.didUpdate.call(value, identical, { ...value.data });
      expect(value.observed).toBe(1);
      const beforeRemoval = value.props;
      value.props = {
        seed: 5,
        caption: 'second',
        __transone_props: { seed: 5 },
      };
      definition.didUpdate.call(value, beforeRemoval, { ...value.data });
      expect(value.observed).toBe(2);
    });
});
