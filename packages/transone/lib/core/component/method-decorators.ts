import type { Component } from './base';
import {
  getMethodDecoratorHost,
  type MethodResourceScope,
} from './method-decorator-runtime';

export interface WatchPropsOptions {
  immediate?: boolean;
}

export interface DelayOptions {
  replace?: boolean;
}

type Method = (this: never, ...args: never[]) => unknown;
type Schedule = { milliseconds: number; replace: boolean };
type MethodSpec = {
  bind: boolean;
  schedule?: Schedule;
  emit?: { eventName: string };
  watchProps?: { key: string; immediate: boolean };
  watchOrder?: number;
};
type ScheduleState = { pending?: TimerTask };
type TimerTask = {
  timer?: ReturnType<typeof setTimeout>;
  args?: unknown[];
  unregister?: () => void;
};

const specifications = new WeakMap<Method, Map<string | symbol, MethodSpec>>();
const installations = new WeakMap<object, Map<string | symbol, MethodSpec>>();
let nextWatchOrder = 0;
const reservedMethods = new Set([
  'initState',
  'initStyles',
  'render',
  'beforeMount',
  'onMounted',
  'beforeUpdate',
  'onUpdated',
  'onPropsChange',
  'beforeUnmount',
  'onUnmounted',
  'onErrorCaptured',
  'mount',
  'mountToNode',
  'unmount',
  'onLoad',
  'onReady',
  'onUnload',
  'onShow',
  'onHide',
  'onPullDownRefresh',
  'onReachBottom',
  'onShareAppMessage',
  'onPageScroll',
  'onResize',
  'created',
  'attached',
  'detached',
  'onInit',
  'didMount',
  'didUnmount',
  'didUpdate',
]);

function validateTarget(
  value: Method,
  context: Pick<
    ClassMethodDecoratorContext,
    'kind' | 'static' | 'private' | 'name'
  >
): void {
  if (
    typeof value !== 'function' ||
    context.kind !== 'method' ||
    context.static ||
    context.private ||
    (typeof context.name === 'string' && reservedMethods.has(context.name))
  ) {
    throw new TypeError(
      'Method decorators require an ordinary public instance method, excluding lifecycle/render/init hooks'
    );
  }
}

function isEffectiveMethod(
  instance: object,
  name: string | symbol,
  method: Method
): boolean {
  let prototype = Object.getPrototypeOf(instance);
  while (prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (descriptor) return descriptor.value === method;
    prototype = Object.getPrototypeOf(prototype);
  }
  return false;
}

function createScheduledEntry(
  instance: object,
  method: Method,
  schedule: Schedule,
  scope: MethodResourceScope,
  state: ScheduleState
): (...args: unknown[]) => void {
  const cancel = (task: TimerTask): void => {
    const timer = task.timer;
    task.timer = undefined;
    task.args = undefined;
    task.unregister?.();
    task.unregister = undefined;
    if (state.pending === task) state.pending = undefined;
    // Invalidate before entering a host API: even a throwing/reentrant timer
    // implementation cannot revive a replacement's arguments or disposer.
    if (timer !== undefined) clearTimeout(timer);
  };
  return (...args: unknown[]): void => {
    if (!scope.isCurrent()) return;
    const task: TimerTask = { args };
    const previous = state.pending;
    state.pending = task;
    try {
      // Publish first: cancellation may call this method again. That newer
      // call supersedes this token before it can allocate another timer.
      if (schedule.replace && previous) cancel(previous);
      if (!task.args || !scope.isCurrent()) {
        cancel(task);
        return;
      }
      task.timer = setTimeout(() => {
        const arguments_ = task.args;
        task.timer = undefined;
        task.args = undefined;
        task.unregister?.();
        task.unregister = undefined;
        if (state.pending === task) state.pending = undefined;
        if (!arguments_ || !scope.isCurrent()) return;
        // Guarding the body preserves error-boundary provenance. Synchronous
        // unhandled failures reach the timer host; Promise failures are observed.
        const result = scope.invoke(() =>
          method.apply(instance as never, arguments_ as never[])
        );
        scope.observe(result);
      }, schedule.milliseconds);
      task.unregister = scope.onDispose(() => cancel(task));
    } catch (error) {
      cancel(task);
      throw error;
    }
  };
}

function install(
  instance: object,
  name: string | symbol,
  method: Method,
  spec: MethodSpec
): void {
  // Base method initializers run on derived instances too. An override belongs
  // to the derived class, so never replace it with the ancestor method body.
  if (!isEffectiveMethod(instance, name, method)) return;
  let installed = installations.get(instance);
  if (!installed) installations.set(instance, (installed = new Map()));
  if (installed.get(name) === spec) return;
  const scoped = !!(spec.schedule || spec.emit || spec.watchProps);
  const host = scoped ? getMethodDecoratorHost(instance) : undefined;
  if (scoped && !host)
    throw new TypeError(
      'Scoped method decorators require a Component instance'
    );
  installed.set(name, spec);
  let bound: Method | undefined;
  let scheduleState: { key: object; state: ScheduleState } | undefined;
  let scheduled:
    { key: object; callback: (...args: unknown[]) => unknown } | undefined;
  Object.defineProperty(instance, name, {
    configurable: true,
    get() {
      if (!scoped) return (bound ??= method.bind(instance as never));
      const scope = host!.captureScope();
      // Initializer-specific entries need their own failure guard, while all
      // entries from one mount compete for the same latest scheduled task.
      if (!scheduleState || scheduleState.key !== scope.mountKey) {
        scheduleState = { key: scope.mountKey, state: {} };
      }
      if (!scheduled || scheduled.key !== scope.key) {
        scheduled = {
          key: scope.key,
          callback: spec.schedule
            ? createScheduledEntry(
                instance,
                method,
                spec.schedule,
                scope,
                scheduleState.state
              )
            : (...args: unknown[]) => {
                if (!scope.isCurrent()) return;
                let result: unknown;
                let completed = false;
                scope.invoke(() => {
                  result = method.apply(instance as never, args as never[]);
                  const then =
                    result !== null &&
                    (typeof result === 'object' || typeof result === 'function')
                      ? (result as { then?: unknown }).then
                      : undefined;
                  if (typeof then === 'function') {
                    // Observe an invalid JavaScript implementation without invoking
                    // its then getter a second time or leaving a rejected Promise.
                    Promise.resolve({
                      then(
                        resolve: (value: unknown) => void,
                        reject: (error: unknown) => void
                      ) {
                        return then.call(result, resolve, reject);
                      },
                    }).catch(() => {});
                    throw new TypeError(
                      'Emit and WatchProps require synchronous methods'
                    );
                  }
                  if (spec.emit && scope.isCurrent()) {
                    host!.emit(
                      spec.emit.eventName,
                      ...(result === undefined ? args : [result])
                    );
                  }
                  completed = true;
                });
                return completed && scope.isCurrent() ? result : undefined;
              },
        };
      }
      return scheduled.callback;
    },
    set(value: unknown) {
      // Ordinary method assignment opts out of decoration for this property,
      // while previously retained callbacks keep their original scope.
      Object.defineProperty(this, name, {
        value,
        writable: true,
        configurable: true,
      });
    },
  });
}

/** Prepare Component callbacks before derived native fields can retain them.
 * Standard decorator initializers remain the installation path for other classes. */
export function prepareComponentMethodDecorators(instance: object): void {
  const seen = new Set<string | symbol>();
  let prototype = Object.getPrototypeOf(instance);
  while (prototype) {
    for (const name of Reflect.ownKeys(prototype)) {
      if (seen.has(name)) continue;
      seen.add(name);
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name)!;
      if (typeof descriptor.value !== 'function') continue;
      const method = descriptor.value as Method;
      const spec = specifications.get(method)?.get(name);
      if (spec) install(instance, name, method, spec);
    }
    prototype = Object.getPrototypeOf(prototype);
  }
}

function register<This, Value extends (this: This, ...args: any[]) => unknown>(
  value: Value,
  context: ClassMethodDecoratorContext<This, Value>,
  schedule?: Schedule,
  extension?: Pick<MethodSpec, 'emit' | 'watchProps'>
): Value {
  const method = value as Method;
  validateTarget(method, context);
  let methods = specifications.get(method);
  if (!methods) specifications.set(method, (methods = new Map()));
  let spec = methods.get(context.name);
  if (!spec) methods.set(context.name, (spec = { bind: false }));
  if (extension || schedule) {
    if (
      (extension && (spec.schedule || spec.emit || spec.watchProps)) ||
      (schedule && (spec.emit || spec.watchProps))
    )
      throw new TypeError(
        'Emit, WatchProps and scheduling decorators cannot be combined'
      );
  }
  if (extension) {
    const kind = Object.prototype.toString.call(value);
    if (
      kind === '[object AsyncFunction]' ||
      kind === '[object GeneratorFunction]' ||
      kind === '[object AsyncGeneratorFunction]'
    )
      throw new TypeError(
        'Emit and WatchProps require synchronous ordinary methods'
      );
    Object.assign(spec, extension);
    if (extension.watchProps) spec.watchOrder = nextWatchOrder++;
  } else if (schedule) {
    if (spec.schedule)
      throw new TypeError(
        'A method cannot have duplicate scheduling decorators'
      );
    spec.schedule = schedule;
  } else {
    if (spec.bind)
      throw new TypeError('A method cannot have duplicate Bind decorators');
    spec.bind = true;
  }
  const specification = spec;
  context.addInitializer(function () {
    install(this as object, context.name, method, specification);
  });
  // Keeping the original method makes either composition order identical.
  return value;
}

type WatchCall = { name: string | symbol; next: unknown; previous: unknown };
type WatchQueue = {
  scope: MethodResourceScope;
  busy: boolean;
  batches: WatchCall[][];
};
const watchQueues = new WeakMap<object, WatchQueue>();

type PropWatcher = {
  name: string | symbol;
  watch: NonNullable<MethodSpec['watchProps']>;
  order: number;
};
function watchedMethods(instance: object): PropWatcher[] {
  const layers: PropWatcher[][] = [];
  const seen = new Set<string | symbol>();
  let prototype = Object.getPrototypeOf(instance);
  while (prototype) {
    const own: PropWatcher[] = [];
    for (const name of Reflect.ownKeys(prototype)) {
      if (seen.has(name)) continue;
      seen.add(name);
      const method = Object.getOwnPropertyDescriptor(prototype, name)
        ?.value as Method;
      const specification =
        typeof method === 'function'
          ? specifications.get(method)?.get(name)
          : undefined;
      if (specification?.watchProps)
        own.push({
          name,
          watch: specification.watchProps,
          order: specification.watchOrder!,
        });
    }
    // Integer-like property keys enumerate numerically, independently of the
    // method declaration order captured when standard decorators are applied.
    own.sort((left, right) => left.order - right.order);
    layers.unshift(own);
    prototype = Object.getPrototypeOf(prototype);
  }
  // Resolve overrides from the leaf first, then notify base-to-leaf while
  // preserving each class's declaration order, as native compilation does.
  return layers.flat();
}
function watchedProp(props: object, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(props, key)
    ? (props as Record<string, unknown>)[key]
    : undefined;
}
function flushWatchQueue(instance: object, queue: WatchQueue): void {
  if (queue.busy) return;
  queue.busy = true;
  try {
    while (queue.batches.length && queue.scope.isCurrent()) {
      const batch = queue.batches.shift()!;
      for (const call of batch) {
        if (!queue.scope.isCurrent() || watchQueues.get(instance) !== queue)
          return;
        const callback = (instance as Record<string | symbol, unknown>)[
          call.name
        ];
        if (typeof callback !== 'function')
          throw new TypeError('WatchProps method must be callable');
        callback.call(instance, call.next, call.previous);
      }
    }
  } finally {
    // A throwing callback consumes this batch; a later setProps starts with
    // the already committed props rather than replaying a partial notification.
    queue.batches.length = 0;
    queue.busy = false;
  }
}
/** Internal mount entry: no user code runs during constructor installation. */
export function initializeComponentPropWatchers(
  instance: object,
  props: object
): void {
  const methods = watchedMethods(instance);
  if (!methods.length) return;
  const scope = getMethodDecoratorHost(instance)!.captureScope();
  const queue: WatchQueue = { scope, busy: false, batches: [] };
  watchQueues.set(instance, queue);
  queue.batches.push(
    methods
      .filter(({ watch }) => watch.immediate)
      .map(({ name, watch }) => ({
        name,
        next: watchedProp(props, watch.key),
        previous: undefined,
      }))
  );
  flushWatchQueue(instance, queue);
}
/** Internal props commit entry: snapshot values before invoking user callbacks. */
export function notifyComponentPropWatchers(
  instance: object,
  next: object,
  previous: object
): void {
  const queue = watchQueues.get(instance);
  if (!queue || !queue.scope.isCurrent()) return;
  const batch = watchedMethods(instance).flatMap(({ name, watch }) => {
    const value = watchedProp(next, watch.key);
    const old = watchedProp(previous, watch.key);
    return Object.is(value, old) ? [] : [{ name, next: value, previous: old }];
  });
  if (!batch.length) return;
  queue.batches.push(batch);
  flushWatchQueue(instance, queue);
}

// JavaScript assimilates any callable `then`, including signatures that do not
// satisfy TypeScript's generic PromiseLike contract. Optional/unknown then
// properties can also contain one, so conservatively exclude those results.
type CallableThenResult<Result> = Result extends unknown
  ? 'then' extends keyof Result
    ? unknown extends Result['then']
      ? Result
      : Extract<Result['then'], Function> extends never
        ? never
        : Result
    : never
  : never;

/** Emit a synchronous method result, or its original arguments for undefined. */
export function Emit(eventName: string) {
  if (typeof eventName !== 'string' || !eventName.trim())
    throw new TypeError('Emit requires a nonempty event name');
  return function <
    This extends Component,
    Value extends (this: This, ...args: any[]) => unknown,
  >(
    value: Value &
      (unknown extends ReturnType<Value>
        ? never
        : CallableThenResult<ReturnType<Value>> extends never
          ? unknown
          : never),
    context: ClassMethodDecoratorContext<This, Value>
  ): Value {
    return register(value, context, undefined, { emit: { eventName } });
  };
}

/** Observe a top-level prop after its value changes on a mounted component. */
type WatchedProps<This> =
  This extends Component<infer Props, any> ? Props : never;
type WatchedValue<
  This,
  Key extends string,
> = Key extends keyof WatchedProps<This> ? WatchedProps<This>[Key] : never;
export function WatchProps<
  Key extends string,
  Immediate extends boolean = false,
>(key: Key, options?: { immediate?: Immediate }) {
  if (typeof key !== 'string' || !key.trim())
    throw new TypeError('WatchProps requires a nonempty prop key');
  if (
    options !== undefined &&
    (options === null ||
      typeof options !== 'object' ||
      Array.isArray(options) ||
      Reflect.ownKeys(options).some((name) => name !== 'immediate') ||
      (options.immediate !== undefined &&
        typeof options.immediate !== 'boolean'))
  )
    throw new TypeError('WatchProps only supports a boolean immediate option');
  return function <
    This extends Component,
    Value extends (this: This, ...args: any[]) => unknown,
  >(
    value: Value &
      (unknown extends ReturnType<Value>
        ? never
        : ReturnType<Value> extends void
          ? void extends ReturnType<Value>
            ? unknown
            : never
          : never) &
      (Key extends keyof WatchedProps<This> ? unknown : never) &
      (Value extends (
        this: This,
        next: WatchedValue<This, Key>,
        previous:
          WatchedValue<This, Key> | (true extends Immediate ? undefined : never)
      ) => unknown
        ? unknown
        : never),
    context: ClassMethodDecoratorContext<This, Value>
  ): Value {
    return register(value, context, undefined, {
      watchProps: { key, immediate: options?.immediate === true },
    });
  };
}

/** Bind an ordinary instance method lazily, preserving its return value. */
export function Bind() {
  return function <This, Value extends (this: This, ...args: any[]) => unknown>(
    value: Value,
    context: ClassMethodDecoratorContext<This, Value>
  ): Value {
    return register(value, context);
  };
}

function scheduledDecorator(milliseconds: number, replace: boolean) {
  if (
    typeof milliseconds !== 'number' ||
    !Number.isFinite(milliseconds) ||
    milliseconds < 0
  ) {
    throw new TypeError(
      'A scheduled method duration must be a finite number >= 0'
    );
  }
  return function <
    This extends Component,
    Value extends (this: This, ...args: any[]) => unknown,
  >(
    value: Value &
      (unknown extends ReturnType<Value>
        ? never
        : ReturnType<Value> extends void
          ? void extends ReturnType<Value>
            ? unknown
            : never
          : never),
    context: ClassMethodDecoratorContext<This, Value>
  ): Value {
    return register(value, context, { milliseconds, replace });
  };
}

/** Schedule each call in the current component resource scope. */
export function Delay(milliseconds: number, options?: DelayOptions) {
  if (
    options !== undefined &&
    (options === null ||
      typeof options !== 'object' ||
      Array.isArray(options) ||
      Reflect.ownKeys(options).some((key) => key !== 'replace') ||
      (options.replace !== undefined && typeof options.replace !== 'boolean'))
  )
    throw new TypeError('Delay only supports a boolean replace option');
  return scheduledDecorator(milliseconds, options?.replace === true);
}

/** Keep only the latest pending call in the current component resource scope. */
export function Debounce(milliseconds: number) {
  return scheduledDecorator(milliseconds, true);
}
