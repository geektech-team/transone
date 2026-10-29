import type { MpDialect } from './dialect';
import type { CompiledUnit, FunctionEntry } from './types';

interface RuntimeUnit extends CompiledUnit {
  initializationFields?: string[];
  propsInitialization?: boolean;
  rootProps?: string;
}

/** Native prop bags differ even though templates use the same binding syntax. */
export function getPropsContainer(
  dialect: MpDialect
): 'properties' | 'props' | 'data' {
  if (dialect.id === 'mp-alipay') return 'props';
  if (dialect.id === 'mp-xiaohongshu') return 'data';
  return 'properties';
}

/** Standalone helpers, emitted once in each generated Page/Component module. */
export function runtimePreamble(
  unit: CompiledUnit,
  dialect: MpDialect
): string {
  const metadata = unit as RuntimeUnit;
  const props =
    unit.kind === 'page'
      ? `if (!Object.prototype.hasOwnProperty.call(instance, '__transone_page_props')) {
    Object.defineProperty(instance, '__transone_page_props', {
      value: (${metadata.rootProps ?? '{}'}), writable: true, configurable: true
    });
  }
  return instance.__transone_page_props;`
      : `const native = instance.${getPropsContainer(dialect)} || {};
  const packet = native.__transone_props;
  const supplied = packet !== null && typeof packet === 'object' && !Array.isArray(packet);
  const source = supplied ? packet : native;
  const props = {};
  for (const key of supplied ? Object.keys(source) : ${JSON.stringify(Object.keys(unit.properties).filter((key) => key !== '__transone_props'))}) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      Object.defineProperty(props, key, {value: source[key], writable: true, enumerable: true, configurable: true});
    }
  }
  return props;`;
  const helpers = `function __transone_props(instance) {
  ${props}
}
function __transone_state(instance) {
  return instance.__transone_state ?? instance.data;
}`;
  if (!unit.initialization) return helpers + '\n';
  return (
    helpers +
    `
function __transone_patch_state(state, patch) {
  for (const path of Object.keys(patch)) {
    const parts = path.match(/[^.[\\]]+/g) || [];
    if (!parts.length) continue;
    let target = state;
    for (let index = 0; index < parts.length - 1; index++) {
      const key = parts[index];
      let next = Object.prototype.hasOwnProperty.call(target, key) ? target[key] : undefined;
      if (next === null || typeof next !== 'object') {
        next = /^\\d+$/.test(parts[index + 1]) ? [] : {};
        Object.defineProperty(target, key, {value: next, writable: true, enumerable: true, configurable: true});
      }
      target = next;
    }
    const key = parts[parts.length - 1];
    if (Object.prototype.hasOwnProperty.call(target, key)) target[key] = patch[path];
    else Object.defineProperty(target, key, {
      value: patch[path], writable: true, enumerable: true, configurable: true
    });
  }
}
function __transone_validate_state(value, root, ancestors) {
  if (!root && (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))) return;
  if (value === null || typeof value !== 'object' || (root && Array.isArray(value))) throw new Error('initState 必须返回 JSON 对象 state');
  const prototype = Object.getPrototypeOf(value);
  if ((!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) || ancestors.includes(value)) throw new Error('initState state 必须为无循环的 JSON 数据');
  ancestors.push(value);
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) throw new Error('initState state JSON 不支持 getter/accessor');
    if (typeof key === 'symbol') throw new Error('initState state JSON 不支持 Symbol');
    if (descriptor.enumerable) __transone_validate_state(descriptor.value, false, ancestors);
  }
  ancestors.pop();
}
function __transone_contains_object(container, target, seen) {
  if (container === target) return true;
  if (container === null || typeof container !== 'object' || seen.includes(container)) return false;
  seen.push(container);
  for (const key of Object.keys(container)) {
    const descriptor = Object.getOwnPropertyDescriptor(container, key);
    if (descriptor && 'value' in descriptor && __transone_contains_object(descriptor.value, target, seen)) return true;
  }
  return false;
}
function __transone_field_data(value, ancestors) {
  if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (typeof value !== 'object' || ancestors.includes(value) || (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) throw new Error('模板实例字段必须为 JSON 数据');
  ancestors.push(value);
  const result = Array.isArray(value) ? [] : {};
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor) || descriptor.value === undefined) throw new Error('模板实例字段数组不支持 undefined/getter');
      result.push(__transone_field_data(descriptor.value, ancestors));
    }
  } else for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) throw new Error('模板实例字段不支持 getter');
    const next = __transone_field_data(descriptor.value, ancestors);
    if (next !== undefined) Object.defineProperty(result, key, {value: next, writable: true, enumerable: true, configurable: true});
  }
  ancestors.pop();
  return result;
}
function __transone_initialize_fields() {
  if (this.__transone_fields_ready || this.__transone_initializing) return;
  Object.defineProperty(this, '__transone_initializing', {value: true, writable: true, configurable: true});
  const originalSetData = this.setData;
  let wrapped = false;
  try {
    Object.defineProperty(this, '__transone_initial_props', {
      value: {...__transone_props(this)}, writable: true, configurable: true
    });
    const initial = (${unit.initialization}).call(this);
    __transone_validate_state(initial, true, []);
    ${unit.initializationWritesState ? "if (__transone_contains_object(this.__transone_initial_props, initial, [])) throw new Error('props/state 共享可变根，请展开复制 props 后返回 state');" : ''}
    Object.defineProperty(this, '__transone_state', {value: initial, writable: true, configurable: true});
    this.setData = function (values, callback) {
      __transone_patch_state(this.__transone_state, values);
      const fields = {};
      for (const key of ${JSON.stringify(metadata.initializationFields ?? [])}) {
        const value = __transone_field_data(this[key], []);
        if (value !== undefined) Object.defineProperty(fields, key, {value, writable: true, enumerable: true, configurable: true});
      }
      return originalSetData.call(this, {...values, __transone_initial_fields: fields${unit.kind === 'page' ? ', __transone_props: this.__transone_page_props' : ''}}, callback);
    };
    wrapped = true;
    this.setData(initial);
    Object.defineProperty(this, '__transone_fields_ready', {value: true, writable: true, configurable: true});
  } catch (error) {
    if (wrapped) this.setData = originalSetData;
    delete this.__transone_state;
    delete this.__transone_initial_props;
    delete this.__transone_fields_ready;
    throw error;
  } finally {
    delete this.__transone_initializing;
  }
}
`
  );
}

function invoke(entry: FunctionEntry | undefined, returns = false): string {
  return entry
    ? `${returns ? 'return ' : ''}(${entry.fn}).apply(this, args);`
    : '';
}

/** Initialize only after the platform has installed the parent's real props. */
export function lifecycleEntries(
  unit: CompiledUnit,
  dialect: MpDialect
): FunctionEntry[] {
  if (!unit.initialization) {
    if (unit.kind !== 'component' || dialect.id !== 'mp-alipay')
      return [...unit.lifecycle];
    const hooks: Record<string, string> = {
      created: 'onInit',
      attached: 'didMount',
      detached: 'didUnmount',
    };
    return unit.lifecycle.map((entry) => ({
      ...entry,
      key: hooks[entry.key] ?? entry.key,
    }));
  }
  const entries = [...unit.lifecycle];
  if (unit.kind === 'page') {
    const load = entries.find((entry) => entry.key === 'onLoad');
    return [
      ...entries.filter((entry) => entry.key !== 'onLoad'),
      {
        key: 'onLoad',
        fn: `function (...args) { __transone_initialize_fields.call(this); ${invoke(load, true)} }`,
      },
    ];
  }
  const before = entries.find((entry) => entry.key === 'created');
  const mounted = entries.find((entry) => entry.key === 'attached');
  const remaining = entries.filter(
    (entry) => !['created', 'attached'].includes(entry.key)
  );
  if (dialect.id === 'mp-alipay') {
    return [
      ...remaining.map((entry) =>
        entry.key === 'detached' ? { ...entry, key: 'didUnmount' } : entry
      ),
      {
        key: 'onInit',
        fn: `function (...args) { __transone_initialize_fields.call(this); ${invoke(before, true)} }`,
      },
      ...(mounted ? [{ key: 'didMount', fn: mounted.fn }] : []),
    ];
  }
  return [
    ...remaining,
    {
      key: 'attached',
      fn: `function (...args) { __transone_initialize_fields.call(this); ${invoke(before)} ${invoke(mounted, true)} }`,
    },
  ];
}

/** Native observers can fire before attached and during initial setData. */
export function propertyObserverBody(
  unit: CompiledUnit,
  dialect: MpDialect
): string {
  const guard = unit.initialization
    ? 'if (!this.__transone_fields_ready || this.__transone_initializing) return; '
    : '';
  // Alipay also calls didUpdate after setData. Compare props rather than
  // treating every native render as a props update (which can recurse).
  const changed =
    dialect.id === 'mp-alipay'
      ? `
  const previous = previousProps || {};
  const current = this.props || {};
  const oldPacket = previous.__transone_props;
  const packet = current.__transone_props;
  const oldSupplied = oldPacket !== null && typeof oldPacket === 'object' && !Array.isArray(oldPacket);
  const supplied = packet !== null && typeof packet === 'object' && !Array.isArray(packet);
  const oldSource = oldSupplied ? oldPacket : previous;
  const source = supplied ? packet : current;
  const declared = ${JSON.stringify(Object.keys(unit.properties))};
  const oldKeys = oldSupplied ? Object.keys(oldSource) : declared.filter(key => Object.prototype.hasOwnProperty.call(oldSource, key));
  const keys = supplied ? Object.keys(source) : declared.filter(key => Object.prototype.hasOwnProperty.call(source, key));
  if (oldKeys.length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(oldSource, key) && Object.is(oldSource[key], source[key]))) return;
  `
      : '';
  return (
    guard +
    changed +
    "if (typeof this.onPropsChange === 'function') this.onPropsChange();"
  );
}
