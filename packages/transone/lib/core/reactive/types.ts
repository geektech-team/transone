export interface ReactiveEffect<T = unknown> {
  (): T | undefined;
  deps: Set<ReactiveEffect>[];
  id: number;
  active: boolean;
  scheduler?: (effect: ReactiveEffect) => void;
}

export interface ReactiveEffectOptions {
  lazy?: boolean;
  scheduler?: (effect: ReactiveEffect) => void;
  throwOnError?: boolean;
}

export interface ComputedRef<T> {
  readonly value: T;
}

export const IS_REACTIVE = Symbol('is_reactive');
export const IS_READONLY = Symbol('is_readonly');
export const IS_REF = Symbol('is_ref');

export interface Ref<T = unknown> {
  value: T;
}

export const MUTATING_ARRAY_METHODS = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
] as const;

export function hasReactiveFlag(
  value: object,
  flag: typeof IS_REACTIVE | typeof IS_READONLY
): boolean {
  return Boolean(Reflect.get(value, flag));
}

export function isObject(value: unknown): value is object {
  return value !== null && typeof value === 'object';
}
