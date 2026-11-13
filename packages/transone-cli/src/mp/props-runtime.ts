import type { MpDialect } from './dialect';
import type { CompiledUnit, FunctionEntry } from './types';
import { componentEventPreamble } from './component-events';

interface RuntimeUnit extends CompiledUnit {
  initializationFields?: string[];
  propsInitialization?: boolean;
  rootProps?: string;
}

function needsCallbackScope(unit: CompiledUnit): boolean {
  return !!(
    unit.initialization ||
    unit.decoratedMethods?.length ||
    unit.nativeEmitterMethods?.length ||
    unit.guardedCallbacks ||
    unit.lifecycle.length ||
    unit.methods.some((entry) => entry.key === 'onPropsChange')
  );
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
  const packetDescriptor = Object.getOwnPropertyDescriptor(native, '__transone_props');
  if (packetDescriptor && !('value' in packetDescriptor)) throw new Error('props 不支持 getter/accessor');
  const packet = packetDescriptor && packetDescriptor.value;
  const supplied = packet !== null && typeof packet === 'object' && !Array.isArray(packet);
  const source = supplied ? packet : native;
  const props = {};
  for (const key of supplied ? Object.keys(source) : ${JSON.stringify(Object.keys(unit.properties).filter((key) => key !== '__transone_props'))}) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (!descriptor || !('value' in descriptor)) throw new Error('props 不支持 getter/accessor');
      Object.defineProperty(props, key, {value: descriptor.value, writable: true, enumerable: true, configurable: true});
    }
  }
  return props;`;
  const helpers =
    `function __transone_native_props(instance) {
  ${props}
}
function __transone_props(instance) {
  return Object.prototype.hasOwnProperty.call(instance, '__transone_props_override') ? instance.__transone_props_override : __transone_native_props(instance);
}
function __transone_state(instance) {
  return instance.__transone_state ?? instance.data;
}` +
    componentEventPreamble(unit, dialect) +
    (needsCallbackScope(unit)
      ? `
function __transone_callback_scope(instance) {
  let scope = instance.__transone_async_scope;
  if (!scope) {
    scope = {cancelled: !!instance.__transone_unmounting};
    Object.defineProperty(instance, '__transone_async_scope', {value: scope, writable: true, configurable: true});
  }
  return scope;
}
function __transone_guard_result(instance, result, scope, attempt, retainSync = false) {
  const current = () => instance.__transone_async_scope === scope && !scope.cancelled && (!attempt || (!attempt.cancelled && instance.__transone_initialization_attempt === attempt));
  const then = result !== null && (typeof result === 'object' || typeof result === 'function') ? result.then : undefined;
  if (typeof then === 'function') {
    const fulfilled = value => current() ? value : undefined;
    const rejected = error => {if (current()) throw error;};
    if (result instanceof Promise && then === Promise.prototype.then && result.constructor === Promise) {
      try { return then.call(result, fulfilled, rejected); }
      catch (error) { return Promise.reject(error).then(fulfilled, rejected); }
    }
    return Promise.resolve({then(resolve, reject) { return then.call(result, resolve, reject); }}).then(fulfilled, rejected);
  }
  return retainSync || current() ? result : undefined;
}
function __transone_guard_callback(instance, callback) {
  if (typeof callback !== 'function') throw new TypeError('guardCallback 需要函数参数');
  const scope = __transone_callback_scope(instance);
  const attempt = instance.__transone_initialization_attempt;
  const current = () => instance.__transone_async_scope === scope && !scope.cancelled && (!attempt || (!attempt.cancelled && instance.__transone_initialization_attempt === attempt));
  return function (...args) {
    if (!current()) return;
    try {
      const result = callback.apply(this, args);
      return __transone_guard_result(instance, result, scope, attempt);
    } catch (error) { if (current()) throw error; }
  };
}
function __transone_install_callbacks(instance) {
  if (typeof instance.setData !== 'function' || instance.setData === instance.__transone_callback_setData) return;
  const native = instance.setData;
  const wrapped = function (values, callback) {
    return native.call(this, values, typeof callback === 'function' ? __transone_guard_callback(this, callback) : callback);
  };
  instance.setData = wrapped;
  Object.defineProperty(instance, '__transone_callback_setData', {value: wrapped, writable: true, configurable: true});
}
function __transone_cancel_timer(scope, token) {
  token.active = false;
  token.args = undefined;
  scope.timers.delete(token);
  const handle = token.handle;
  token.handle = undefined;
  if (handle !== undefined) clearTimeout(handle);
}
function __transone_cancel_scope(scope) {
  scope.cancelled = true;
  if (!scope.timers) return;
  for (const token of [...scope.timers]) {
    try { __transone_cancel_timer(scope, token); }
    catch (error) { console.error(error); }
  }
}
function __transone_same_props(previous, next) {
  const keys = Object.keys(next);
  return Object.keys(previous).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(previous, key) && Object.is(previous[key], next[key]));
}
function __transone_sync_result(result) {
  const then = result !== null && (typeof result === 'object' || typeof result === 'function') ? result.then : undefined;
  if (typeof then === 'function') {
    // Even invalid JavaScript async bodies must not leave unhandled rejections.
    Promise.resolve({then(resolve, reject) { return then.call(result, resolve, reject); }}).catch(() => {});
    throw new TypeError('Emit/WatchProps 方法必须同步执行');
  }
  return result;
}
function __transone_watch_props(instance, next, immediate) {
  const phase = instance.__transone_mount_phase;
  const scope = instance.__transone_async_scope;
  const watch = scope && scope.propsWatch;
  const current = () => phase && phase.mounted && !phase.cancelled && !scope.cancelled && instance.__transone_mount_phase === phase && instance.__transone_async_scope === scope;
  if (!watch || !current()) return;
  const previous = watch.baseline;
  const snapshot = {...next};
  watch.baseline = snapshot;
  watch.queue.push({next:snapshot, previous, immediate});
  if (watch.busy) return;
  watch.busy = true;
  try {
    while (watch.queue.length && current()) {
      const batch = watch.queue.shift();
      for (const spec of ${JSON.stringify((unit.decoratedMethods ?? []).filter((spec) => spec.watchProps))}) {
        if (!current()) return;
        const key = spec.watchProps.key;
        const nextValue = Object.prototype.hasOwnProperty.call(batch.next, key) ? batch.next[key] : undefined;
        const previousValue = Object.prototype.hasOwnProperty.call(batch.previous, key) ? batch.previous[key] : undefined;
        if (batch.immediate ? !spec.watchProps.immediate : Object.is(nextValue, previousValue)) continue;
        instance[spec.key](nextValue, batch.immediate ? undefined : previousValue);
      }
    }
  } catch (error) {
    // The failed notification is consumed. A subsequent commit starts a fresh batch.
    watch.queue.length = 0;
    if (current()) throw error;
  } finally {
    watch.busy = false;
    if (!current()) watch.queue.length = 0;
  }
}
function __transone_start_props_watch(instance, phase) {
  const native = {...__transone_native_props(instance)};
  const packet = __transone_native_packet(instance);
  const previousNative = instance.__transone_native_props_snapshot;
  if (previousNative && (!__transone_same_props(previousNative, native) || packet !== instance.__transone_native_props_packet_snapshot)) __transone_merge_native_props(instance, native, previousNative);
  __transone_snapshot_native_props(instance, native, packet);
  phase.scope.propsWatch = {baseline:{...__transone_props(instance)}, queue:[], busy:false};
  if (${JSON.stringify(!!unit.decoratedMethods?.some((spec) => spec.watchProps))} || instance.__transone_uses_props_projection) __transone_publish_props(instance);
  __transone_watch_props(instance, __transone_props(instance), true);
}
function __transone_throw_props_errors(errors) {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    const failure = new Error('props 监听和原生更新失败');
    failure.name = 'AggregateError'; failure.errors = errors; throw failure;
  }
}
function __transone_native_packet(instance) {
  const container = instance.${getPropsContainer(dialect)} || {};
  const descriptor = Object.getOwnPropertyDescriptor(container, '__transone_props');
  if (descriptor && !('value' in descriptor)) throw new Error('props 不支持 getter/accessor');
  return descriptor && descriptor.value;
}
function __transone_snapshot_native_props(instance, native, packet = __transone_native_packet(instance)) {
  Object.defineProperty(instance, '__transone_native_props_snapshot', {value:native, writable:true, configurable:true});
  Object.defineProperty(instance, '__transone_native_props_packet_snapshot', {value:packet, writable:true, configurable:true});
}
function __transone_merge_native_props(instance, native, previousNative) {
  ${
    unit.kind === 'page'
      ? 'return native;'
      : `// Parent updates follow Core setProps: only supplied own keys overwrite.
  // The previous native snapshot supplies the logical baseline before the first
  // manual commit; after that the override contains all committed logical props.
  const previous = Object.prototype.hasOwnProperty.call(instance, '__transone_props_override') ? instance.__transone_props_override : previousNative;
  const next = {...previous, ...native};
  Object.defineProperty(instance, '__transone_props_override', {value:next, writable:true, configurable:true});
  return next;`
  }
}
function __transone_projection_feedback(instance) {
  if (instance.__transone_setting_props) return 'skip';
  const publication = instance.__transone_props_publication;
  if (!publication) return;
  const packet = __transone_native_packet(instance);
  const native = __transone_native_props(instance);
  // Matching feedback can skip a parent merge, but a failed write still needs
  // to publish the current logical props without notifying watchers again.
  const matchingFeedback = publication.failed ? 'retry' : 'skip';
  if (Object.keys(native).every(key => Object.prototype.hasOwnProperty.call(publication.next, key) && Object.is(native[key], publication.next[key]))) {
    // Native props now acknowledge the logical projection. Advance the feedback
    // baseline so a later return to the earlier native values is a real update.
    publication.previousNative = {...native};
    publication.previousPacket = packet;
    __transone_snapshot_native_props(instance, {...native}, packet);
    return matchingFeedback;
  }
  if (packet === publication.previousPacket && __transone_same_props(native, publication.previousNative)) return matchingFeedback;
  delete instance.__transone_props_publication;
  // Keep both baselines until the observer merges the incoming native patch.
  // Force the commit even when its values equal the older native snapshot
  // but differ from a newer manual logical commit.
  return 'commit';
}
function __transone_publish_props(instance) {
  if (typeof instance.setData !== 'function') return;
  Object.defineProperty(instance, '__transone_uses_props_projection', {value:true, configurable:true});
  instance.__transone_setting_props = (instance.__transone_setting_props || 0) + 1;
  try {
    const next = __transone_props(instance);
    const publication = {next:{...next}, previousNative:{...__transone_native_props(instance)}, previousPacket:__transone_native_packet(instance), failed:false};
    Object.defineProperty(instance, '__transone_props_publication', {value:publication, writable:true, configurable:true});
    try { instance.setData({__transone_render_props:next}); }
    catch (error) { publication.failed = true; throw error; }
  } finally { if (!--instance.__transone_setting_props) delete instance.__transone_setting_props; }
}
function __transone_observe_props(instance, continueObserver, force) {
  if (instance.__transone_setting_props) return;
  const native = {...__transone_native_props(instance)};
  const previous = instance.__transone_native_props_snapshot;
  if (!force && previous && __transone_same_props(previous, native)) return;
  const next = __transone_merge_native_props(instance, native, previous);
  __transone_snapshot_native_props(instance, native);
  const errors = [];
  try { __transone_watch_props(instance, next, false); }
  catch (error) { errors.push(error); }
  // Supplied native keys are authoritative. Refresh the data packet as well, because
  // native dialects differ in whether data or props win a template name lookup.
  if (${JSON.stringify(!!unit.decoratedMethods?.some((spec) => spec.watchProps))} || instance.__transone_uses_props_projection) {
    try { continueObserver(() => __transone_publish_props(instance)); }
    catch (error) { errors.push(error); }
  }
  continueObserver(() => __transone_throw_props_errors(errors));
}
function __transone_set_props(instance, patch) {
  const continueCommit = __transone_guard_callback(instance, callback => callback());
  if (!instance.__transone_native_props_snapshot) __transone_snapshot_native_props(instance, {...__transone_native_props(instance)});
  const next = {...__transone_props(instance), ...patch};
  ${unit.kind === 'page' ? "Object.defineProperty(instance, '__transone_page_props', {value:next, writable:true, configurable:true});" : "Object.defineProperty(instance, '__transone_props_override', {value:next, writable:true, configurable:true});"}
  const errors = [];
  try { __transone_watch_props(instance, next, false); }
  catch (error) { errors.push(error); }
  // A watcher may synchronously commit again. Publish the final logical props
  // even if notification failed, while this mount still owns the commit.
  try { continueCommit(() => __transone_publish_props(instance)); }
  catch (error) { errors.push(error); }
  continueCommit(() => __transone_throw_props_errors(errors));
}
function __transone_install_methods(instance) {
  let bindings;
  if (Object.prototype.hasOwnProperty.call(instance, '__transone_method_bindings')) bindings = instance.__transone_method_bindings;
  else {
    bindings = Object.create(null);
    Object.defineProperty(instance, '__transone_method_bindings', {value: bindings, configurable: true});
  }
  for (const spec of ${JSON.stringify(unit.decoratedMethods ?? [])}) {
    // Commit each installation separately. A later invalid native property can
    // be repaired before retry without rebinding an already installed method.
    if (Object.prototype.hasOwnProperty.call(bindings, spec.key)) continue;
    const implementation = instance[spec.key];
    if (typeof implementation !== 'function') throw new TypeError('装饰方法必须为函数: ' + spec.key);
    if (!spec.schedule && !spec.emit && !spec.watchProps) {
      Object.defineProperty(instance, spec.key, {value: implementation.bind(instance), writable: true, configurable: true, enumerable: true});
      bindings[spec.key] = true;
      continue;
    }
    const binding = {scope: undefined, attempt: undefined, callback: undefined};
    Object.defineProperty(instance, spec.key, {
      configurable: true,
      enumerable: true,
      get() {
        const scope = __transone_callback_scope(instance);
        const attempt = instance.__transone_initialization_attempt;
        if (binding.scope === scope && binding.attempt === attempt) return binding.callback;
        const current = () => instance.__transone_async_scope === scope && !scope.cancelled && (!attempt || (!attempt.cancelled && instance.__transone_initialization_attempt === attempt));
        if (spec.emit || spec.watchProps) {
          const callback = function (...args) {
            if (!current()) return;
            try {
              const result = implementation.apply(instance, args);
              __transone_sync_result(result);
              if (!current()) return;
              if (spec.emit) __transone_emit(instance, spec.emit.eventName, result === undefined ? args : [result]);
              return current() ? result : undefined;
            } catch (error) { if (current()) throw error; }
          };
          binding.scope = scope;
          binding.attempt = attempt;
          binding.callback = callback;
          return callback;
        }
        let pending;
        const callback = function (...args) {
          if (!current()) return;
          if (!scope.timers) scope.timers = new Set();
          const token = {active:true, args, handle:undefined};
          const previous = pending;
          pending = token;
          scope.timers.add(token);
          try {
            // Publish the replacement before invoking native cancellation; a
            // reentrant call then supersedes this token rather than its parent.
            if (spec.schedule.replace && previous) __transone_cancel_timer(scope, previous);
            if (!token.active || !current()) return;
            token.handle = setTimeout(() => {
              const arguments_ = token.args;
              token.active && scope.timers.delete(token);
              const active = token.active;
              token.active = false;
              token.args = undefined;
              token.handle = undefined;
              if (pending === token) pending = undefined;
              if (!active || !current()) return;
              try {
                const result = implementation.apply(instance, arguments_);
                const observed = __transone_guard_result(instance, result, scope, attempt);
                if (observed instanceof Promise) {
                  // JavaScript may return a Promise despite the checked void
                  // contract. Normalize thenables once before consuming failure.
                  observed.catch(error => { if (current()) console.error(error); });
                }
              } catch (error) {
                // Active failures keep native timer semantics. User work and
                // then getters may synchronously detach/reenter a newer mount.
                if (current()) throw error;
              }
            }, spec.schedule.milliseconds);
          } catch (error) {
            token.active = false;
            token.args = undefined;
            scope.timers.delete(token);
            if (pending === token) pending = undefined;
            throw error;
          }
        };
        binding.scope = scope;
        binding.attempt = attempt;
        binding.callback = callback;
        return callback;
      },
      set(value) {
        Object.defineProperty(instance, spec.key, {value, writable: true, configurable: true, enumerable: true});
      },
    });
    bindings[spec.key] = binding;
  }
  for (const key of ${JSON.stringify(unit.nativeEmitterMethods ?? [])}) {
    if (Object.prototype.hasOwnProperty.call(bindings, key)) continue;
    const implementation = instance[key];
    if (typeof implementation !== 'function') throw new TypeError('原生事件接收方法必须为函数: ' + key);
    const binding = {scope: undefined, attempt: undefined, callback: undefined};
    Object.defineProperty(instance, key, {
      configurable: true,
      enumerable: true,
      get() {
        const scope = __transone_callback_scope(instance);
        const attempt = instance.__transone_initialization_attempt;
        if (binding.scope !== scope || binding.attempt !== attempt) {
          // Capture the receiver's scope when the native host reads its handler.
          // An old native callback must never look up a new mount's guard.
          binding.callback = __transone_guard_callback(instance, implementation.bind(instance));
          binding.scope = scope;
          binding.attempt = attempt;
        }
        return binding.callback;
      },
    });
    bindings[key] = binding;
  }
}
function __transone_begin_mount(instance) {
  const previous = instance.__transone_mount_phase;
  if (instance.__transone_unmounting || (previous && (previous.busy || !previous.cancelled))) return;
  const previousScope = instance.__transone_async_scope;
  const scope = previousScope && !previousScope.cancelled ? previousScope : {cancelled:false};
  Object.defineProperty(instance, '__transone_async_scope', {value: scope, writable: true, configurable: true});
  const phase = {busy: true, ready: false, mounted: false, cancelled: false, detached: false, scope};
  Object.defineProperty(instance, '__transone_mount_phase', {value: phase, writable: true, configurable: true});
  try { __transone_install_methods(instance); }
  catch (error) { phase.cancelled = true; __transone_release_mount(instance, phase, false); throw error; }
  return phase;
}
function __transone_release_mount(instance, phase, complete) {
  // Cancellation invokes the native host. Keep the phase busy so even a
  // synchronous native cancellation callback cannot begin a replacement mount.
  try { if (phase.cancelled || !complete) __transone_cancel_scope(phase.scope); }
  finally { phase.busy = false; }
  if ((phase.cancelled || !complete) && !phase.detached && instance.__transone_mount_phase === phase) delete instance.__transone_mount_phase;
}
function __transone_detach_mount(instance, callback, args) {
  if (instance.__transone_unmounting) return;
  let phase = instance.__transone_mount_phase;
  if (phase && phase.detached) return;
  if (!phase) {
    phase = {busy: false, ready: false, mounted: false, cancelled: true, detached: false, scope:__transone_callback_scope(instance)};
    Object.defineProperty(instance, '__transone_mount_phase', {value: phase, writable: true, configurable: true});
  }
  phase.cancelled = true;
  phase.detached = true;
  Object.defineProperty(instance, '__transone_unmounting', {value: true, writable: true, configurable: true});
  try {
    __transone_cancel_scope(phase.scope);
    if (callback) return __transone_guard_result(instance, callback.apply(instance, args), phase.scope, instance.__transone_initialization_attempt, true);
  }
  finally { delete instance.__transone_unmounting; }
}
`
      : '');
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
function __transone_snapshot_data(value, snapshots, seen) {
  if (value === null || typeof value !== 'object' || seen.includes(value)) return;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return;
  seen.push(value);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  snapshots.push({value, descriptors});
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if ('value' in descriptor) __transone_snapshot_data(descriptor.value, snapshots, seen);
  }
}
function __transone_restore_keys(value, snapshots, errors) {
  for (const [key, descriptor] of snapshots) {
    try {
      if (descriptor) Object.defineProperty(value, key, descriptor);
      else if (!Reflect.deleteProperty(value, key)) throw new Error('初始化恢复无法删除属性 ' + String(key));
    } catch (error) { errors.push(error); }
  }
}
function __transone_restore_data(snapshots, errors) {
  for (let index = snapshots.length - 1; index >= 0; index--) {
    const {value, descriptors} = snapshots[index];
    const keys = Reflect.ownKeys(value);
    __transone_restore_keys(value, keys.filter(key => !Object.prototype.hasOwnProperty.call(descriptors, key)).map(key => [key, undefined]), errors);
    __transone_restore_keys(value, Reflect.ownKeys(descriptors).map(key => [key, descriptors[key]]), errors);
  }
}
function __transone_initialize_fields() {
  if (this.__transone_initializing) return false;
  if (this.__transone_fields_ready) return;
  const keys = [...new Set([...${JSON.stringify(unit.initializationKeys ?? metadata.initializationFields ?? [])}, 'data', 'setData', '__transone_initial_props', '__transone_state', '__transone_fields_ready', '__transone_initializing', '__transone_page_props', '__transone_initialization_attempt'])];
  const ownSnapshot = keys.map(key => [key, Object.getOwnPropertyDescriptor(this, key)]);
  const dataDescriptor = Object.getOwnPropertyDescriptor(this, 'data');
  const dataSnapshot = [];
  if (dataDescriptor && 'value' in dataDescriptor) __transone_snapshot_data(dataDescriptor.value, dataSnapshot, []);
  Object.defineProperty(this, '__transone_initializing', {value: true, writable: true, configurable: true});
  const attempt = {cancelled:false};
  try {
    Object.defineProperty(this, '__transone_initialization_attempt', {value: attempt, writable: true, configurable: true});
    const originalSetData = this.setData;
    Object.defineProperty(this, '__transone_initial_props', {
      value: {...__transone_props(this)}, writable: true, configurable: true
    });
    const initial = (${unit.initialization}).call(this);
    __transone_validate_state(initial, true, []);
    ${unit.initializationWritesState ? "if (__transone_contains_object(this.__transone_initial_props, initial, [])) throw new Error('props/state 共享可变根，请展开复制 props 后返回 state');" : ''}
    Object.defineProperty(this, '__transone_state', {value: initial, writable: true, configurable: true});
    this.setData = function (values, callback) {
      if (this.__transone_setting_props && Object.prototype.hasOwnProperty.call(values, '__transone_render_props')) {
        const statePatch = {...values};
        delete statePatch.__transone_render_props;
        __transone_patch_state(this.__transone_state, statePatch);
      } else __transone_patch_state(this.__transone_state, values);
      const fields = {};
      for (const key of ${JSON.stringify(metadata.initializationFields ?? [])}) {
        const value = __transone_field_data(this[key], []);
        if (value !== undefined) Object.defineProperty(fields, key, {value, writable: true, enumerable: true, configurable: true});
      }
      return originalSetData.call(this, {...values, __transone_initial_fields: fields${unit.kind === 'page' ? ', __transone_props: this.__transone_page_props' : ''}}, typeof callback === 'function' ? __transone_guard_callback(this, callback) : callback);
    };
    this.setData(initial);
    Object.defineProperty(this, '__transone_fields_ready', {value: true, writable: true, configurable: true});
    const previous = ownSnapshot.find(([key]) => key === '__transone_initializing');
    if (previous[1]) Object.defineProperty(this, '__transone_initializing', previous[1]);
    else if (!Reflect.deleteProperty(this, '__transone_initializing')) throw new Error('初始化恢复无法删除初始化标记');
  } catch (error) {
    attempt.cancelled = true;
    const cleanupErrors = [];
    try { __transone_restore_data(dataSnapshot, cleanupErrors); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
    try { __transone_restore_keys(this, ownSnapshot, cleanupErrors); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
    // Host bookkeeping is outside this transaction. Preserve the original
    // error even if a native non-configurable property prevents full cleanup.
    if (cleanupErrors.length && error !== null && (typeof error === 'object' || typeof error === 'function')) {
      try { Object.defineProperty(error, 'cleanupErrors', {value: cleanupErrors, configurable: true}); } catch (_) {}
    }
    throw error;
  }
}
`
  );
}

/** Initialize only after the platform has installed the parent's real props. */
export function lifecycleEntries(
  unit: CompiledUnit,
  dialect: MpDialect
): FunctionEntry[] {
  const entries = [...unit.lifecycle];
  const guardedResult =
    '__transone_guard_result(this, result, phase.scope, this.__transone_initialization_attempt)';
  if (unit.kind === 'page') {
    if (!needsCallbackScope(unit)) return entries;
    const load = entries.find((entry) => entry.key === 'onLoad');
    const ready = entries.find((entry) => entry.key === 'onReady');
    const unload = entries.find((entry) => entry.key === 'onUnload');
    const initialize = unit.initialization
      ? 'if (__transone_initialize_fields.call(this) === false || phase.cancelled) return;'
      : '__transone_install_callbacks(this);';
    return [
      ...entries.filter(
        (entry) => !['onLoad', 'onReady', 'onUnload'].includes(entry.key)
      ),
      {
        key: 'onLoad',
        fn: `function (...args) {
          const phase = __transone_begin_mount(this); if (!phase) return;
          try { ${initialize} const result = ${load ? `(${load.fn}).apply(this, args)` : 'undefined'}; phase.ready = !phase.cancelled; return ${guardedResult}; }
          catch (error) { phase.cancelled = true; throw error; }
          finally { __transone_release_mount(this, phase, phase.ready); }
        }`,
      },
      {
        key: 'onReady',
        fn: `function (...args) {
        const phase=this.__transone_mount_phase;
        if(!phase || phase.busy || !phase.ready || phase.cancelled || phase.mounted || this.__transone_unmounting)return;
        phase.busy=true;
        try { phase.mounted = true; __transone_start_props_watch(this, phase); if (phase.cancelled) return; const result=${ready ? `(${ready.fn}).apply(this,args)` : 'undefined'};phase.mounted=!phase.cancelled;return ${guardedResult}; }
        catch(error){phase.cancelled=true;throw error;}
        finally{__transone_release_mount(this,phase,phase.mounted);}
      }`,
      },
      {
        key: 'onUnload',
        fn: `function(...args){return __transone_detach_mount(this,${unload ? `(${unload.fn})` : 'undefined'},args);}`,
      },
    ];
  }
  if (!needsCallbackScope(unit)) return [];
  const before = entries.find((entry) => entry.key === 'created');
  const mounted = entries.find((entry) => entry.key === 'attached');
  const removed = entries.find((entry) => entry.key === 'detached');
  const remaining = entries.filter(
    (entry) => !['created', 'attached', 'detached'].includes(entry.key)
  );
  const initialize = unit.initialization
    ? 'if (__transone_initialize_fields.call(this) === false || phase.cancelled) return;'
    : '__transone_install_callbacks(this);';
  const beforeResult = before
    ? `(${before.fn}).apply(this, args)`
    : 'undefined';
  const mountedResult = mounted
    ? `(${mounted.fn}).apply(this, args)`
    : 'undefined';
  const detach: FunctionEntry = {
    key: dialect.id === 'mp-alipay' ? 'didUnmount' : 'detached',
    fn: `function (...args) { return __transone_detach_mount(this, ${removed ? `(${removed.fn})` : 'undefined'}, args); }`,
  };
  if (dialect.id === 'mp-alipay') {
    return [
      ...remaining,
      {
        key: 'onInit',
        fn: `function (...args) {
          const phase = __transone_begin_mount(this); if (!phase) return;
          try { ${initialize} const result = ${beforeResult}; phase.ready = !phase.cancelled; return ${guardedResult}; }
          catch (error) { phase.cancelled = true; throw error; }
          finally { __transone_release_mount(this, phase, phase.ready); }
        }`,
      },
      ...(mounted ||
      unit.nativeEmitterMethods?.length ||
      unit.propsUpdates ||
      unit.decoratedMethods?.some((spec) => spec.watchProps)
        ? [
            {
              key: 'didMount',
              fn: `function (...args) {
                const phase = this.__transone_mount_phase;
                if (!phase || phase.busy || !phase.ready || phase.cancelled || phase.mounted || this.__transone_unmounting) return;
                phase.busy = true;
                try { phase.mounted = true; __transone_start_props_watch(this, phase); if (phase.cancelled) return; const result = ${mountedResult}; phase.mounted = !phase.cancelled; return ${guardedResult}; }
                catch (error) { phase.cancelled = true; throw error; }
                finally { __transone_release_mount(this, phase, phase.mounted); }
              }`,
            },
          ]
        : []),
      detach,
    ];
  }
  return [
    ...remaining,
    {
      key: 'attached',
      fn: `function (...args) {
        const phase = __transone_begin_mount(this); if (!phase) return;
        try {
          ${initialize} __transone_guard_result(this, ${beforeResult}, phase.scope, this.__transone_initialization_attempt); if (phase.cancelled) return;
          phase.ready = true; phase.mounted = true; __transone_start_props_watch(this, phase); if (phase.cancelled) return; const result = ${mountedResult}; phase.mounted = !phase.cancelled; return ${guardedResult};
        } catch (error) { phase.cancelled = true; throw error; }
        finally { __transone_release_mount(this, phase, phase.mounted); }
      }`,
    },
    detach,
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
  const inactive =
    'if (this.__transone_unmounting || this.__transone_async_scope?.cancelled || this.__transone_mount_phase?.cancelled) return; ';
  // Alipay also calls didUpdate after setData. Compare props rather than
  // treating every native render as a props update (which can recurse).
  const changed =
    dialect.id === 'mp-alipay'
      ? `
  if (!__transone_projection) {
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
  }
  `
      : '';
  return (
    "const __transone_projection = __transone_projection_feedback(this); if (__transone_projection === 'skip') return; " +
    inactive +
    guard +
    changed +
    // Capture once before watchers run: either their events or native setData
    // can synchronously replace this mount before the observer's tail resumes.
    `const __transone_continue_observer = __transone_guard_callback(this, callback => callback());
    if (__transone_projection === 'retry') return __transone_continue_observer(() => __transone_publish_props(this));
    __transone_observe_props(this, __transone_continue_observer, __transone_projection === 'commit');
    return __transone_continue_observer(() => { if (typeof this.onPropsChange === 'function') return this.onPropsChange(); });`
  );
}
