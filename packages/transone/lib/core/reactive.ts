import {
  ComputedRef,
  IS_REACTIVE,
  IS_REF,
  IS_READONLY,
  MUTATING_ARRAY_METHODS,
  Ref,
  ReactiveEffect,
  ReactiveEffectOptions,
  hasReactiveFlag,
  isObject,
} from './reactive/types';
import { ReactiveScheduler } from './reactive/scheduler';

export type {
  ComputedRef,
  Ref,
  ReactiveEffect,
  ReactiveEffectOptions,
} from './reactive/types';

let effectId = 0;

// 全局批处理调度器：组件渲染等场景通过它合并同一批同步状态变更
export const reactiveScheduler = new ReactiveScheduler();

/**
 * 等待当前批次的响应式 effect 全部执行完成（通常是组件重渲染）。
 * 修改 state 后需要立即读取 DOM 时使用：await nextTick()。
 */
export function nextTick(): Promise<void> {
  return reactiveScheduler.nextTick();
}

/**
 * 同步冲刷待执行的响应式 effect，立即完成组件重渲染。
 * 一般仅测试或需要同步读 DOM 的场景使用。
 */
export function flushSync(): void {
  reactiveScheduler.flush();
}

// 响应式系统
export class ReactiveSystem {
  private static instance: ReactiveSystem;
  private activeEffect: ReactiveEffect | null = null;
  private readonly effectStack: ReactiveEffect[] = [];
  private targetMap = new WeakMap<
    object,
    Map<string | symbol, Set<ReactiveEffect>>
  >();
  private reactiveMap = new WeakMap<object, object>();
  private readonlyMap = new WeakMap<object, object>();
  /** 反向映射：响应式代理 -> 原始对象，供 toRawValue 反查 */
  private proxyMap = new WeakMap<object, object>();

  private constructor() {}

  public static getInstance(): ReactiveSystem {
    if (!ReactiveSystem.instance) {
      ReactiveSystem.instance = new ReactiveSystem();
    }
    return ReactiveSystem.instance;
  }

  public reactive<T extends object>(target: T): T {
    // 检查输入参数
    if (!isObject(target)) {
      console.warn('reactive: target must be an object');
      return target;
    }

    // 如果传入的是已经是响应式对象，直接返回
    if (isReactive(target)) {
      return target;
    }

    // 如果目标已经有对应的响应式对象，返回已存在的代理
    if (this.reactiveMap.has(target)) {
      return this.reactiveMap.get(target) as T;
    }

    // 优化数组处理
    if (Array.isArray(target)) {
      return this.createReactiveArray(target);
    }

    // 普通对象处理
    const proxy = new Proxy(target, {
      get: (target, key: string | symbol) => {
        // 处理响应式标记的特殊属性
        if (key === IS_REACTIVE) {
          return true;
        }
        if (key === IS_READONLY) {
          return false;
        }

        // 收集依赖
        this.track(target, key);

        const value = Reflect.get(target, key);

        // 如果是对象，递归转换为响应式
        if (isObject(value) && !hasReactiveFlag(value, IS_READONLY)) {
          return this.reactive(value);
        }
        return value;
      },
      set: (target, key: string | symbol, value) => {
        // 检查是否是只读的
        if (hasReactiveFlag(target, IS_READONLY)) {
          console.warn(`Cannot set property ${String(key)} on readonly object`);
          return false;
        }

        const oldValue = Reflect.get(target, key);

        // 如果新值是对象，转换为响应式
        if (
          isObject(value) &&
          !hasReactiveFlag(value, IS_REACTIVE) &&
          !hasReactiveFlag(value, IS_READONLY)
        ) {
          value = this.reactive(value);
        }

        const result = Reflect.set(target, key, value);

        // 只有当值真正改变时才触发更新
        if (oldValue !== value) {
          this.trigger(target, key);
        }
        return result;
      },
      deleteProperty: (target, key: string | symbol) => {
        // 检查是否是只读的
        if (hasReactiveFlag(target, IS_READONLY)) {
          console.warn(
            `Cannot delete property ${String(key)} on readonly object`
          );
          return false;
        }

        const hadKey = key in target;
        const result = Reflect.deleteProperty(target, key);

        if (hadKey) {
          this.trigger(target, key);
        }
        return result;
      },
    });

    // 存储响应式对象的映射关系
    this.reactiveMap.set(target, proxy);
    this.proxyMap.set(proxy, target);
    return proxy;
  }

  /**
   * 将响应式代理反查为原始对象；非代理值原样返回。
   * 用于数组 includes/indexOf/lastIndexOf 的对比，让用户传入
   * 原始对象也能命中数组中的响应式元素。
   */
  private toRawValue(value: unknown): unknown {
    if (isObject(value) && this.proxyMap.has(value)) {
      return this.proxyMap.get(value);
    }
    return value;
  }

  /**
   * 创建响应式数组
   */
  private createReactiveArray<T extends unknown[]>(target: T): T {
    // 如果目标已经有对应的响应式对象，返回已存在的代理
    if (this.reactiveMap.has(target)) {
      return this.reactiveMap.get(target) as T;
    }

    const proxy = new Proxy(target, {
      get: (target, key: string | symbol) => {
        // 处理响应式标记的特殊属性
        if (key === IS_REACTIVE) {
          return true;
        }
        if (key === IS_READONLY) {
          return false;
        }

        // 收集依赖
        this.track(target, key);

        const value = Reflect.get(target, key);

        // 搜索类方法：数组元素是响应式代理，需把参数与元素都转回原始值
        // 后再对比，保证 includes(rawObject) / indexOf(rawObject) 能命中。
        if (
          typeof key === 'string' &&
          (key === 'includes' || key === 'indexOf' || key === 'lastIndexOf')
        ) {
          // 数组内容（长度与索引）变化会改变搜索方法的返回结果
          this.track(target, 'length');
          for (let i = 0; i < target.length; i++) {
            this.track(target, String(i));
          }
          const method = value as (...methodArgs: unknown[]) => unknown;
          return (...args: unknown[]) => {
            const result = method.apply(target, args);
            if (result === false || result === -1) {
              const rawElements = target.map((item) => this.toRawValue(item));
              const fallbackMethod = rawElements[key] as (
                ...methodArgs: unknown[]
              ) => unknown;
              return fallbackMethod.apply(
                rawElements,
                args.map((arg) => this.toRawValue(arg))
              );
            }
            return result;
          };
        }

        // 处理数组的变异方法
        if (
          typeof key === 'string' &&
          MUTATING_ARRAY_METHODS.includes(
            key as (typeof MUTATING_ARRAY_METHODS)[number]
          )
        ) {
          return (...args: unknown[]) => {
            // 执行原始方法
            const arrayMethod = value as (...methodArgs: unknown[]) => unknown;
            const result = arrayMethod.apply(target, args);
            // 触发数组更新
            this.trigger(target, 'length');
            this.trigger(target, key);
            return result;
          };
        }

        if (isObject(value) && !hasReactiveFlag(value, IS_READONLY)) {
          return this.reactive(value);
        }

        return value;
      },
      set: (target, key: string | symbol, value) => {
        // 检查是否是只读的
        if (hasReactiveFlag(target, IS_READONLY)) {
          console.warn(`Cannot set property ${String(key)} on readonly object`);
          return false;
        }

        const oldValue = Reflect.get(target, key);

        // 如果新值是对象，转换为响应式
        if (
          isObject(value) &&
          !hasReactiveFlag(value, IS_REACTIVE) &&
          !hasReactiveFlag(value, IS_READONLY)
        ) {
          value = this.reactive(value);
        }

        const result = Reflect.set(target, key, value);

        // 只有当值真正改变时才触发更新
        if (oldValue !== value) {
          this.trigger(target, key);
          // 对于数组索引的修改，同时触发length的更新
          if (typeof key === 'string' && !isNaN(Number(key))) {
            this.trigger(target, 'length');
          }
        }
        return result;
      },
      deleteProperty: (target, key: string | symbol) => {
        // 检查是否是只读的
        if (hasReactiveFlag(target, IS_READONLY)) {
          console.warn(
            `Cannot delete property ${String(key)} on readonly object`
          );
          return false;
        }

        const hadKey = key in target;
        const result = Reflect.deleteProperty(target, key);

        if (hadKey) {
          this.trigger(target, key);
          // 对于数组，同时触发length的更新
          this.trigger(target, 'length');
        }
        return result;
      },
    });

    // 存储响应式对象的映射关系
    this.reactiveMap.set(target, proxy);
    this.proxyMap.set(proxy, target);
    return proxy;
  }

  public readonly<T extends object>(target: T): Readonly<T> {
    // 检查输入参数
    if (!isObject(target)) {
      console.warn('readonly: target must be an object');
      return target;
    }

    // 如果传入的是已经是只读响应式对象，直接返回
    if (hasReactiveFlag(target, IS_READONLY)) {
      return target as Readonly<T>;
    }

    // 如果目标已经有对应的只读响应式对象，返回已存在的代理
    if (this.readonlyMap.has(target)) {
      return this.readonlyMap.get(target) as Readonly<T>;
    }

    const proxy = new Proxy(target, {
      get: (target, key: string | symbol) => {
        // 处理响应式标记的特殊属性
        if (key === IS_REACTIVE) {
          return false;
        }
        if (key === IS_READONLY) {
          return true;
        }

        const value = Reflect.get(target, key);
        // 如果是对象，递归转换为只读响应式
        if (isObject(value)) {
          return this.readonly(value);
        }
        return value;
      },
      set: () => {
        console.warn('Cannot set property on readonly object');
        return false;
      },
      deleteProperty: () => {
        console.warn('Cannot delete property on readonly object');
        return false;
      },
    });

    // 存储只读响应式对象的映射关系
    this.readonlyMap.set(target, proxy);
    return proxy as Readonly<T>;
  }

  public effect<T = unknown>(
    fn: () => T,
    options?: ReactiveEffectOptions
  ): ReactiveEffect<T> {
    const { lazy = false, scheduler, throwOnError = false } = options || {};

    const effectFn: ReactiveEffect<T> = () => {
      if (!effectFn.active) {
        return fn();
      }

      try {
        // 清除之前的依赖关系
        this.cleanup(effectFn);
        this.effectStack.push(effectFn);
        this.activeEffect = effectFn;
        return fn();
      } catch (error) {
        if (throwOnError) {
          throw error;
        }
        console.error('Effect error:', error);
        return undefined;
      } finally {
        this.effectStack.pop();
        this.activeEffect =
          this.effectStack[this.effectStack.length - 1] ?? null;
      }
    };

    effectFn.id = effectId++;
    effectFn.deps = [];
    effectFn.active = true;
    effectFn.scheduler = scheduler;

    // 如果不是懒加载，立即执行
    if (!lazy) {
      effectFn();
    }

    return effectFn;
  }

  /**
   * 在指定 effect 的上下文中运行 fn，使 fn 内的响应式访问被收集到该 effect，
   * 而不是当前外层 effect。组件渲染用它隔离依赖：子组件在父组件渲染期间
   * 执行自身 render 时，子 state 的访问不会污染父组件的 effect。
   */
  public runWithEffect<T>(effect: ReactiveEffect, fn: () => T): T {
    this.effectStack.push(effect);
    this.activeEffect = effect;
    try {
      return fn();
    } finally {
      this.effectStack.pop();
      this.activeEffect = this.effectStack[this.effectStack.length - 1] ?? null;
    }
  }

  public computed<T>(getter: () => T): ComputedRef<T> {
    let dirty = true;
    let value: T;
    const computedTarget = {};
    const trackComputedValue = (): void => {
      this.track(computedTarget, 'value');
    };

    const runner = this.effect(
      () => {
        value = getter();
        dirty = false;
      },
      {
        lazy: true,
        scheduler: () => {
          if (!dirty) {
            dirty = true;
            this.trigger(computedTarget, 'value');
          }
        },
      }
    );

    return {
      get value(): T {
        if (dirty) {
          runner();
        }
        trackComputedValue();
        return value as T;
      },
    };
  }

  private cleanup(effect: ReactiveEffect): void {
    // 清除effect的所有依赖
    effect.deps.forEach((dep) => {
      dep.delete(effect);
    });
    effect.deps.length = 0;
  }

  private track(target: object, key: string | symbol): void {
    if (!this.activeEffect || !this.activeEffect.active) return;

    let depsMap = this.targetMap.get(target);
    if (!depsMap) {
      depsMap = new Map();
      this.targetMap.set(target, depsMap);
    }

    let dep = depsMap.get(key);
    if (!dep) {
      dep = new Set();
      depsMap.set(key, dep);
    }

    if (!dep.has(this.activeEffect)) {
      dep.add(this.activeEffect);
      this.activeEffect.deps.push(dep);
    }
  }

  private trigger(target: object, key: string | symbol): void {
    const depsMap = this.targetMap.get(target);
    if (!depsMap) return;

    const dep = depsMap.get(key);
    if (!dep) return;

    // 创建依赖的副本进行遍历，避免在遍历过程中依赖发生变化
    const effects = new Set(dep);
    effects.forEach((effect) => {
      if (effect.active) {
        if (effect.scheduler) {
          effect.scheduler(effect);
        } else {
          effect();
        }
      }
    });
  }

  // 停止一个effect的执行
  public stop(effect: ReactiveEffect): void {
    if (effect.active) {
      this.cleanup(effect);
      effect.active = false;
    }
  }
}

// 导出响应式API
export function reactive<T extends object>(target: T): T {
  return ReactiveSystem.getInstance().reactive(target);
}

export function readonly<T extends object>(target: T): Readonly<T> {
  return ReactiveSystem.getInstance().readonly(target);
}

export function effect<T = unknown>(
  fn: () => T,
  options?: ReactiveEffectOptions
): ReactiveEffect<T> {
  return ReactiveSystem.getInstance().effect(fn, options);
}

export function computed<T>(getter: () => T): ComputedRef<T> {
  return ReactiveSystem.getInstance().computed(getter);
}

export function ref<T>(value: T): Ref<T> {
  const wrapper = { value };
  Object.defineProperty(wrapper, IS_REF, {
    configurable: false,
    enumerable: false,
    value: true,
  });

  return reactive(wrapper) as Ref<T>;
}

export function isRef(value: unknown): value is Ref<unknown> {
  return isObject(value) && Boolean(Reflect.get(value, IS_REF));
}

export function unref<T>(value: T | Ref<T>): T {
  return isRef(value) ? value.value : value;
}

export function stop(effect: ReactiveEffect): void {
  ReactiveSystem.getInstance().stop(effect);
}

export interface WatchSource<T> {
  value: T;
}

export type WatchCallback<T> = (
  value: T,
  oldValue: T | undefined,
  onCleanup: (cleanup: () => void) => void
) => void;

export interface WatchOptions {
  /** 建立后立即执行一次回调（此时 oldValue 为 undefined） */
  immediate?: boolean;
  /** 深度追踪 getter 返回值的嵌套属性变化 */
  deep?: boolean;
  /** 变化发生时同步回调（默认随调度器批处理，同一批变化只回调一次） */
  sync?: boolean;
}

/**
 * 深度遍历响应式值，在 effect 上下文中访问全部 key 以收集嵌套依赖。
 */
function traverseReactive(value: unknown, seen: Set<object>): void {
  if (!isObject(value) || seen.has(value)) {
    return;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item) => traverseReactive(item, seen));
    return;
  }

  Object.keys(value).forEach((key) => {
    traverseReactive((value as Record<string, unknown>)[key], seen);
  });
}

/**
 * 侦听响应式源（getter 或 ref）的变化并执行回调。
 * 返回一个用于停止侦听的函数。
 */
export function watch<T>(
  source: WatchSource<T> | (() => T),
  callback: WatchCallback<T>,
  options: WatchOptions = {}
): () => void {
  const system = ReactiveSystem.getInstance();
  const getter = isRef(source)
    ? (): T => (source as Ref<T>).value
    : (source as () => T);

  let oldValue: T | undefined;
  let cleanup: (() => void) | null = null;

  const run = (): void => {
    if (!job.active) {
      return;
    }
    cleanup?.();
    cleanup = null;
    // runner 为 lazy effect，active 时调用必然返回 getter 值
    const newValue = runner() as T;
    callback(newValue, oldValue, (fn) => {
      cleanup = fn;
    });
    oldValue = newValue;
  };

  const runner = effect(
    (): T => {
      const value = getter();
      if (options.deep && isObject(value)) {
        traverseReactive(value, new Set<object>());
      }
      return value;
    },
    {
      lazy: true,
      scheduler: () => {
        if (options.sync) {
          run();
        } else {
          reactiveScheduler.enqueue(job);
        }
      },
    }
  );

  // 批处理队列中的执行单元：调度器 flush 时通过它完成求值与回调
  const job = effect(
    () => {
      run();
    },
    { lazy: true }
  );

  if (options.immediate) {
    run();
  } else {
    oldValue = runner();
  }

  return () => {
    system.stop(runner);
    system.stop(job);
  };
}

// 工具函数：判断是否是响应式对象
export function isReactive(value: unknown): boolean {
  return isObject(value) && hasReactiveFlag(value, IS_REACTIVE);
}

// 工具函数：判断是否是只读响应式对象
export function isReadonly(value: unknown): boolean {
  return isObject(value) && hasReactiveFlag(value, IS_READONLY);
}
