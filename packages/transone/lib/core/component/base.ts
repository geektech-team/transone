import { CleanupErrors } from '../cleanup';
import { registerMethodDecoratorHost } from './method-decorator-runtime';
import {
  prepareComponentMethodDecorators,
  initializeComponentPropWatchers,
  notifyComponentPropWatchers,
} from './method-decorators';
import { StyleManager } from '../../style/StyleManager';
import {
  ReactiveEffect,
  ReactiveSystem,
  effect,
  reactive,
  reactiveScheduler,
  stop,
} from '../reactive';
import {
  ComponentInstance,
  RenderRuntimeContext,
  RendererContext,
} from '../renderer';
import { TemplateEngine } from '../template';
import { toChildren } from '../vnode';
import type { VNode } from '../vnode';

export type ComponentProps = object;

export type ComponentState = object;

export type ComponentEventListener = (...args: unknown[]) => void;

type CallbackScope = { active: boolean; disposers?: Set<() => void> };
type GuardedResult<Result> =
  | (Result extends PromiseLike<infer Value>
      ? Promise<Awaited<Value> | undefined>
      : Result)
  | undefined;
type BoundarySnapshot = { boundary: Component; scope?: CallbackScope };
type CallbackFailures = { propagated: Set<unknown> };

// Follow only the current call stack or a returned guarded Promise. Keeping
// provenance off the error itself lets independent calls reuse the same error.
let callbackInvocation: CallbackFailures | null = null;
const callbackResults = new WeakMap<object, CallbackFailures>();

/** Capture a foreign thenable's getter once, as Promise resolution does. */
function getPromiseObserver(
  value: unknown
):
  | ((
      fulfilled: (value: unknown) => unknown,
      rejected: (error: unknown) => unknown
    ) => Promise<unknown>)
  | undefined {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  )
    return;
  const then = (value as { then?: unknown }).then;
  if (typeof then !== 'function') return;
  return (fulfilled, rejected) => {
    // Keep ordinary native Promise reactions in their existing microtask turn.
    if (
      value instanceof Promise &&
      then === Promise.prototype.then &&
      value.constructor === Promise
    ) {
      try {
        return then.call(value, fulfilled, rejected);
      } catch (error) {
        return Promise.reject(error).then(fulfilled, rejected);
      }
    }
    return Promise.resolve({
      then(
        resolve: (value: unknown) => void,
        reject: (error: unknown) => void
      ) {
        then.call(value, resolve, reject);
      },
    }).then(fulfilled, rejected);
  };
}

export type InjectionKey<T> = (string | symbol) & {
  readonly __injectionType?: T;
};

export interface InjectionResult<T> {
  found: boolean;
  value: T | undefined;
}

export type ComponentConstructor<
  TProps extends ComponentProps = ComponentProps,
  TState extends ComponentState = ComponentState,
> = new (props?: TProps) => Component<TProps, TState>;

/** A logical component reference may be abstract and resolved by the application bundle. */
export type ComponentReference<
  TProps extends ComponentProps = ComponentProps,
  TState extends ComponentState = ComponentState,
> = abstract new (props?: TProps) => Component<TProps, TState>;

export type AnyComponentReference = abstract new (
  props?: never
) => Component<ComponentProps, ComponentState>;

export type AnyComponentConstructor = new (
  props?: never
) => Component<ComponentProps, ComponentState>;

export abstract class Component<
  TProps extends ComponentProps = ComponentProps,
  TState extends ComponentState = ComponentState,
> implements ComponentInstance {
  private vnode: VNode | null = null;
  protected el: Node | null = null;
  private readonly renderer = new RendererContext();
  private readonly templateEngine: TemplateEngine;
  private readonly childComponents = new Set<ComponentInstance>();
  private readonly eventListeners: Record<
    string,
    Map<ComponentEventListener, symbol>
  > = Object.create(null);
  private readonly providers = new Map<string | symbol, unknown>();
  private readonly updateEffect: ReactiveEffect;
  private appContext: unknown = null;
  private disposed = false;
  private unmounting = false;
  private mountAttempt: { cancelled: boolean } | null = null;
  private mountGeneration = 0;
  private callbackScope: CallbackScope = { active: true };
  private stateInitializationScope: CallbackScope | null = null;
  private statePropsContext: { current: TProps } | null = null;
  private readonly disposers = new Set<() => void>();
  private parentComponent: ComponentInstance | null = null;
  private elementChangeListener:
    ((previousElement: Node, nextElement: Node) => void) | null = null;

  protected styleManager: StyleManager;
  declare public state: TState;
  public mounted = false;

  constructor(protected props: TProps = {} as TProps) {
    const initialProps = props;
    this.styleManager = new StyleManager();
    this.templateEngine = new TemplateEngine({});

    // Do not dispatch overridable hooks from the base constructor: derived
    // fields (including arrow-function hooks) have not been initialized yet.
    // Keep state an own, enumerable, writable property after its first access,
    // including compatibility with existing state assignments/field overrides.
    const assignState = (state: TState): void => {
      Object.defineProperty(this, 'state', {
        value: state,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      this.templateEngine.state = state;
    };
    let initializing = false;
    let failure: { error: unknown } | undefined;
    Object.defineProperty(this, 'state', {
      enumerable: true,
      configurable: true,
      set: assignState,
      get: () => {
        if (failure) throw failure.error;
        if (initializing) {
          throw new Error('Cannot read state while initState() is running');
        }
        initializing = true;
        const initializationScope: CallbackScope = {
          active: true,
          disposers: new Set(),
        };
        this.stateInitializationScope = initializationScope;
        const propsContext = { current: this.props };
        this.statePropsContext = propsContext;
        try {
          // Preserve constructor props for lazy state initialization while
          // rendering and lifecycle hooks keep reading subsequent prop updates.
          this.props = initialProps;
          const state = ReactiveSystem.getInstance().runWithEffect(
            null,
            () => reactive(this.initState() ?? {}) as TState
          );
          assignState(state);
          return state;
        } catch (error) {
          initializationScope.active = false;
          const errors = new CleanupErrors();
          errors.add(error);
          for (const dispose of initializationScope.disposers ?? [])
            errors.attempt(dispose);
          // Repeated reads must not repeat partially completed initialization.
          try {
            errors.throwIfAny(
              'Component state initialization and cleanup failed'
            );
          } catch (initializationError) {
            failure = { error: initializationError };
            throw initializationError;
          }
          throw error;
        } finally {
          initializationScope.disposers = undefined;
          this.props = propsContext.current;
          this.statePropsContext = null;
          this.stateInitializationScope = null;
          initializing = false;
        }
      },
    });

    this.updateEffect = effect(
      () => {
        // 依赖在 render 期间按需收集（细粒度）：只对 render 实际访问的
        // state 属性建立依赖，未访问的属性变化不会触发重渲染
        if (this.mounted) {
          const scope = this.callbackScope;
          const boundaries = this.captureErrorBoundaries();
          const parentInvocation = callbackInvocation;
          const failures: CallbackFailures = { propagated: new Set() };
          callbackInvocation = failures;
          try {
            this.update();
          } catch (error) {
            if (this.isCallbackScopeCurrent(scope)) {
              try {
                if (failures.propagated.has(error)) throw error;
                this.handleCallbackError(error, boundaries);
              } catch (propagated) {
                parentInvocation?.propagated.add(propagated);
                throw propagated;
              }
            }
          } finally {
            callbackInvocation = parentInvocation;
          }
        }
      },
      {
        throwOnError: true,
        // 通过调度器合并同一批同步状态变更，避免逐次重渲染
        scheduler: (updateEffect) => {
          reactiveScheduler.enqueue(updateEffect);
        },
      }
    );
    this.#initializeMethodDecorators();
  }

  // Keep constructor-owned initialization private and non-overridable.
  // Bundled static-style analysis can retain its conservative rule against
  // constructors passing this to arbitrary external functions.
  #initializeMethodDecorators(): void {
    registerMethodDecoratorHost(this, {
      emit: (eventName, ...args) => this.emit(eventName, ...args),
      captureScope: () => {
        const scope = this.callbackScope;
        const initialization = this.stateInitializationScope;
        const isCurrent = () =>
          this.isCallbackScopeCurrent(scope) &&
          (!initialization || initialization.active);
        const invoke = this.createGuardedCallback((callback: () => unknown) =>
          callback()
        );
        return {
          key: initialization ?? scope,
          mountKey: scope,
          isCurrent,
          invoke,
          onDispose: (cleanup) => {
            if (!isCurrent()) {
              cleanup();
              return () => {};
            }
            // An entry may have been retained before initState began. Work
            // scheduled through it during initialization still belongs to that
            // attempt and must be released immediately if initialization fails.
            const registrationInitialization =
              this.stateInitializationScope ?? initialization;
            let finished = false;
            let unregister = () => {};
            const dispose = () => {
              if (finished) return;
              finished = true;
              unregister();
              registrationInitialization?.disposers?.delete(dispose);
              cleanup();
            };
            unregister = this.onDispose(dispose);
            if (!finished) registrationInitialization?.disposers?.add(dispose);
            return () => {
              finished = true;
              unregister();
              registrationInitialization?.disposers?.delete(dispose);
            };
          },
          observe: (result) => {
            getPromiseObserver(result)?.(
              () => {},
              (error) => {
                console.error('组件异步回调错误:', error);
              }
            );
          },
        };
      },
    });
    prepareComponentMethodDecorators(this);
  }

  // Keep framework mount bookkeeping behind a private entry. Bundled style
  // analysis must not mistake it for a call exposing this to user code.
  #initializePropWatchers(): void {
    initializeComponentPropWatchers(this, this.props);
  }

  protected abstract initState(): TState;
  protected abstract initStyles(): void;
  protected abstract render(): VNode;

  public mount(container: HTMLElement): void {
    if (!container || !(container instanceof HTMLElement)) {
      throw new Error('Invalid container element');
    }

    try {
      container.appendChild(this.mountToNode());
    } catch (error) {
      const errors = new CleanupErrors();
      errors.add(error);
      errors.attempt(() => this.unmount());
      console.error('组件渲染错误:', error);
      errors.throwIfAny('Component mount and cleanup failed');
    }
  }

  public mountToNode(): Node {
    if (this.mountAttempt) {
      if (this.mounted && this.el && !this.mountAttempt.cancelled)
        return this.el;
      throw new Error('Cannot mount a component while it is initializing');
    }
    if (this.mounted && this.el) {
      return this.el;
    }

    if (this.unmounting) {
      throw new Error('Cannot mount a component during teardown');
    }

    const attempt = { cancelled: false };
    if (!this.callbackScope.active) this.callbackScope = { active: true };
    const boundaries = this.captureErrorBoundaries();
    this.mountGeneration++;
    this.mountAttempt = attempt;
    const parentInvocation = callbackInvocation;
    const failures: CallbackFailures = { propagated: new Set() };
    callbackInvocation = failures;
    const assertActive = (): void => {
      if (attempt.cancelled)
        throw new Error('Component initialization was cancelled by unmount()');
    };
    try {
      if (this.disposed) {
        this.disposed = false;
        this.updateEffect.active = true;
      }
      ReactiveSystem.getInstance().runWithEffect(null, () => {
        this.templateEngine.state = this.state;
        assertActive();
        this.invokeLifecycle(() => this.initStyles());
        assertActive();
        this.invokeLifecycle(() => this.beforeMount());
        assertActive();
      });
      // Render under the component's own effect, including descendant initialization.
      this.el = ReactiveSystem.getInstance().runWithEffect(
        this.updateEffect,
        () => {
          const vnode = this.render();
          assertActive();
          this.vnode = vnode;
          return this.renderer.mount(this.vnode, this.createRenderContext());
        }
      );
      assertActive();
      this.mounted = true;
      ReactiveSystem.getInstance().runWithEffect(null, () =>
        this.#initializePropWatchers()
      );
      assertActive();
      ReactiveSystem.getInstance().runWithEffect(null, () =>
        this.invokeLifecycle(() => this.onMounted())
      );
      assertActive();
      return this.el;
    } catch (error) {
      // Resolve the boundary while the parent chain is still intact, then release
      // all resources created by this failed initialization/mount attempt.
      const errors = new CleanupErrors();
      if (failures.propagated.has(error)) errors.add(error);
      else this.collectCallbackError(error, boundaries, errors);
      this.mountAttempt = null;
      errors.attempt(() => this.unmount());
      try {
        errors.throwIfAny('Component mount and cleanup failed');
      } catch (propagated) {
        parentInvocation?.propagated.add(propagated);
        throw propagated;
      }
      return document.createComment('error-boundary');
    } finally {
      callbackInvocation = parentInvocation;
      this.mountAttempt = null;
    }
  }

  public update(): void {
    if (this.unmounting || this.disposed || !this.el || !this.vnode) {
      return;
    }

    const generation = this.mountGeneration;
    const isCurrent = (): boolean =>
      generation === this.mountGeneration &&
      this.mounted &&
      !this.disposed &&
      !this.unmounting;
    this.invokeLifecycle(() => this.beforeUpdate());
    if (!isCurrent()) return;
    const currentVNode = this.vnode;
    const currentElement = this.el;
    // 与 mountToNode 同理：render 期间的响应式访问只收集到自身 effect。
    const result = ReactiveSystem.getInstance().runWithEffect(
      this.updateEffect,
      () => {
        const newVNode = this.render();
        if (!isCurrent()) return;
        const nextElement = this.renderer.patch(
          currentVNode,
          newVNode,
          currentElement,
          this.createRenderContext()
        );
        return { vnode: newVNode, element: nextElement };
      }
    );
    if (!result || !isCurrent()) return;
    this.vnode = result.vnode;
    this.el = result.element;
    if (currentElement !== this.el) {
      this.elementChangeListener?.(currentElement, this.el);
    }
    if (!isCurrent()) return;
    this.invokeLifecycle(() => this.onUpdated());
    if (!isCurrent()) return;
    this.invokeLifecycle(() => this.onPropsChange());
  }

  /**
   * Teardown order: beforeUnmount, descendants, FIFO disposers, framework
   * bindings/styles/effect, DOM and references, then onUnmounted. Every stage
   * runs even after failures; repeated/reentrant calls do nothing.
   */
  public unmount(): void {
    // A renderer may still be constructing descendants. Finish the current
    // synchronous phase before releasing its complete resource graph.
    if (this.mountAttempt) {
      this.mountAttempt.cancelled = true;
      return;
    }
    if (this.disposed || this.unmounting) return;
    this.callbackScope.active = false;
    this.mountGeneration++;
    this.unmounting = true;
    this.disposed = true;
    const wasMounted = this.mounted;
    const errors = new CleanupErrors();

    if (wasMounted)
      errors.attempt(() => this.invokeCleanup(() => this.beforeUnmount()));
    if (this.vnode && this.el) {
      errors.attempt(() =>
        this.renderer.unmount(this.vnode!, this.el!, this.createRenderContext())
      );
    }
    // Also release partially registered descendants that never returned a DOM node.
    for (const child of Array.from(this.childComponents)) {
      errors.attempt(() => child.unmount());
      errors.attempt(() => child.setParentComponent?.(null));
    }
    this.childComponents.clear();
    for (const cleanup of Array.from(this.disposers)) {
      if (this.disposers.delete(cleanup)) errors.attempt(cleanup);
    }
    for (const eventName of Object.keys(this.eventListeners)) {
      this.eventListeners[eventName].clear();
      delete this.eventListeners[eventName];
    }
    this.providers.clear();
    this.parentComponent = null;
    this.elementChangeListener = null;
    this.appContext = null;
    errors.attempt(() => this.templateEngine.clearBindings());
    errors.attempt(() => this.styleManager.destroy());
    errors.attempt(() => stop(this.updateEffect));
    errors.attempt(() => this.el?.parentNode?.removeChild(this.el));
    this.el = null;
    this.vnode = null;
    this.mounted = false;
    if (wasMounted)
      errors.attempt(() => this.invokeCleanup(() => this.onUnmounted()));
    this.unmounting = false;
    errors.throwIfAny('Component teardown failed');
  }

  /**
   * Register instance-owned resources (timers, subscriptions, cancellation).
   * Callbacks run once, in registration order, after descendants. The returned
   * function unregisters without running the callback. Registrations during or
   * after teardown run immediately; a later mount starts a fresh resource scope.
   * An immediate callback's error is thrown to its caller.
   */
  protected onDispose(cleanup: () => void): () => void {
    if (this.disposed || this.unmounting) {
      this.invokeCleanup(cleanup);
      return () => {};
    }
    // A distinct wrapper allows the same callback to own multiple resources.
    const dispose = () => this.invokeCleanup(cleanup);
    this.disposers.add(dispose);
    return () => {
      this.disposers.delete(dispose);
    };
  }

  /** Bind a continuation to the current resource scope. Bind the state commit
   * after an await/Promise, rather than an async body that has already started. */
  protected guardCallback<Args extends unknown[], Result, This = unknown>(
    callback: (this: This, ...args: Args) => Result
  ): (this: This, ...args: Args) => GuardedResult<Result> {
    return this.createGuardedCallback(callback);
  }

  private createGuardedCallback<Args extends unknown[], Result, This = unknown>(
    callback: (this: This, ...args: Args) => Result
  ): (this: This, ...args: Args) => GuardedResult<Result> {
    if (typeof callback !== 'function')
      throw new TypeError('guardCallback requires a function');
    const component = this;
    const scope = this.callbackScope;
    const initialization = this.stateInitializationScope;
    const current = (): boolean =>
      component.isCallbackScopeCurrent(scope) &&
      (!initialization || initialization.active);
    return function (this: This, ...args: Args): GuardedResult<Result> {
      if (!current()) return undefined as GuardedResult<Result>;
      const boundaries = component.captureErrorBoundaries();
      const parentInvocation = callbackInvocation;
      const failures: CallbackFailures = { propagated: new Set() };
      callbackInvocation = failures;
      try {
        const result = callback.apply(this, args);
        const observe = getPromiseObserver(result);
        if (observe) {
          const sourceFailures = callbackResults.get(result as object);
          const pending = observe(
            (value) => (current() ? value : undefined),
            (error) => {
              if (current()) {
                try {
                  if (
                    failures.propagated.has(error) ||
                    sourceFailures?.propagated.has(error)
                  )
                    throw error;
                  component.handleCallbackError(error, boundaries);
                } catch (propagated) {
                  failures.propagated.add(propagated);
                  parentInvocation?.propagated.add(propagated);
                  throw propagated;
                }
              }
            }
          );
          callbackResults.set(pending, failures);
          return pending as GuardedResult<Result>;
        }
        return (current() ? result : undefined) as GuardedResult<Result>;
      } catch (error) {
        if (current()) {
          try {
            if (failures.propagated.has(error)) throw error;
            component.handleCallbackError(error, boundaries);
          } catch (propagated) {
            parentInvocation?.propagated.add(propagated);
            throw propagated;
          }
        }
        return undefined as GuardedResult<Result>;
      } finally {
        callbackInvocation = parentInvocation;
      }
    };
  }

  private isCallbackScopeCurrent(scope: CallbackScope): boolean {
    return (
      scope === this.callbackScope &&
      scope.active &&
      !this.disposed &&
      !this.unmounting &&
      !this.mountAttempt?.cancelled
    );
  }

  private invokeCleanup(callback: () => unknown): void {
    const result = callback();
    getPromiseObserver(result)?.(
      () => {},
      (error) => {
        console.error('组件异步清理错误:', error);
      }
    );
  }

  private handleCallbackError(
    error: unknown,
    boundaries: BoundarySnapshot[]
  ): void {
    const errors = new CleanupErrors();
    this.collectCallbackError(error, boundaries, errors);
    errors.throwIfAny('Component callback and error boundary failed');
  }

  private collectCallbackError(
    error: unknown,
    boundaries: BoundarySnapshot[],
    errors: CleanupErrors
  ): void {
    try {
      if (this.dispatchError(error, boundaries)) return;
    } catch (boundaryError) {
      if (!Object.is(boundaryError, error)) errors.add(boundaryError);
    }
    errors.add(error);
  }

  /** Synchronous lifecycle failures keep the existing mount/update behavior.
   * Promise failures are observed without making mounting asynchronous. */
  private invokeLifecycle(callback: () => unknown): void {
    const scope = this.callbackScope;
    const boundaries = this.captureErrorBoundaries();
    const parentInvocation = callbackInvocation;
    const failures: CallbackFailures = { propagated: new Set() };
    let result: unknown;
    let observe: ReturnType<typeof getPromiseObserver>;
    callbackInvocation = failures;
    try {
      result = callback();
      observe = getPromiseObserver(result);
    } catch (error) {
      if (failures.propagated.has(error))
        parentInvocation?.propagated.add(error);
      throw error;
    } finally {
      callbackInvocation = parentInvocation;
    }
    if (!observe) return;
    const sourceFailures = callbackResults.get(result as object);
    void observe(
      () => {},
      (error) => {
        if (!this.isCallbackScopeCurrent(scope)) return;
        const errors = new CleanupErrors();
        if (
          failures.propagated.has(error) ||
          sourceFailures?.propagated.has(error)
        )
          errors.add(error);
        else this.collectCallbackError(error, boundaries, errors);
        if (this.isCallbackScopeCurrent(scope)) {
          errors.attempt(() => {
            const element = this.el;
            const listener = this.elementChangeListener;
            if (element?.parentNode && listener) {
              const placeholder = document.createComment('error-boundary');
              element.parentNode.replaceChild(placeholder, element);
              listener(element, placeholder);
            }
          });
          if (this.isCallbackScopeCurrent(scope))
            errors.attempt(() => this.unmount());
        }
        errors.throwIfAny(
          'Component asynchronous lifecycle and cleanup failed'
        );
      }
    ).catch((error) => {
      console.error('组件异步回调错误:', error);
    });
  }

  public setProps(props: Partial<TProps>): void {
    const previous = this.statePropsContext?.current ?? this.props;
    this.props = {
      ...previous,
      ...props,
    };
    if (this.statePropsContext) this.statePropsContext.current = this.props;

    if (this.mounted) {
      // 与 state 更新走同一调度器：同一批多次 setProps 合并为一次更新
      reactiveScheduler.enqueue(this.updateEffect);
      ReactiveSystem.getInstance().runWithEffect(null, () =>
        notifyComponentPropWatchers(this, this.props, previous)
      );
    }
  }

  public setState(state: Partial<TState>): void {
    Object.assign(this.state, state);
  }

  public setAppContext(context: unknown): void {
    this.appContext = context;
    this.childComponents.forEach((child) => {
      child.setAppContext?.(context);
    });
  }

  public setParentComponent(parent: ComponentInstance | null): void {
    this.parentComponent = parent;
  }

  public getParentComponent(): ComponentInstance | null {
    return this.parentComponent;
  }

  public setElementChangeListener(
    listener: (previousElement: Node, nextElement: Node) => void
  ): void {
    this.elementChangeListener = listener;
  }

  public provide<T>(key: InjectionKey<T>, value: T): void {
    this.providers.set(key, value);
  }

  public inject<T>(key: InjectionKey<T>): T | undefined;
  public inject<T>(key: InjectionKey<T>, fallback: T): T;
  public inject<T>(key: InjectionKey<T>, fallback?: T): T | undefined {
    const result = this.resolveInjection(key);
    return result.found ? result.value : fallback;
  }

  public resolveInjection<T>(key: InjectionKey<T>): InjectionResult<T> {
    if (this.providers.has(key)) {
      return { found: true, value: this.providers.get(key) as T | undefined };
    }

    if (this.parentComponent?.resolveInjection) {
      return this.parentComponent.resolveInjection(key);
    }

    return this.resolveAppInjection(key);
  }

  public getElement(): Node | null {
    return this.el;
  }

  protected beforeMount(): void {}

  protected onMounted(): void {}

  protected beforeUpdate(): void {}

  protected onUpdated(): void {}
  /** props 更新钩子：Web 端在每次更新（setProps/setState）后调用；小程序端由 observers 在 properties 变化时触发。 */
  protected onPropsChange(): void {}

  protected beforeUnmount(): void {}

  protected onUnmounted(): void {}

  /**
   * 错误边界钩子：后代组件渲染或更新抛错时被调用。
   * 返回 false 表示错误已被处理并停止继续向上传播；
   * 返回 true 或 undefined 时错误继续冒泡到更外层边界。
   */
  protected onErrorCaptured?(
    error: unknown,
    instance: ComponentInstance
  ): boolean | void;

  /**
   * 沿组件父链寻找最近的错误边界。返回 true 表示错误已被边界处理。
   */
  private captureErrorBoundaries(): BoundarySnapshot[] {
    const boundaries: BoundarySnapshot[] = [];
    const seen = new Set<ComponentInstance>();
    let current: ComponentInstance | null = this.getParentComponent();
    while (current && !seen.has(current)) {
      seen.add(current);
      const boundary = current as unknown as Component;
      boundaries.push({ boundary, scope: boundary.callbackScope });
      current = current.getParentComponent?.() ?? null;
    }
    return boundaries;
  }

  private dispatchError(
    error: unknown,
    boundaries = this.captureErrorBoundaries()
  ): boolean {
    for (const { boundary, scope } of boundaries) {
      if (scope && !boundary.isCallbackScopeCurrent(scope)) continue;
      // 同类实例可访问 protected 生命周期钩子
      if (typeof boundary.onErrorCaptured === 'function') {
        const handled = boundary.onErrorCaptured(error, this);
        if (handled === false) {
          return true;
        }
      }
    }
    return false;
  }

  protected getContext(): unknown {
    return this.appContext;
  }

  protected get router() {
    return this.getRouterFrom(this.appContext) ?? this.getRouterFromGlobalApp();
  }

  protected emit(eventName: string, ...args: unknown[]): void {
    const listeners = this.eventListeners[eventName];
    if (!listeners?.size) return;
    const scope = this.callbackScope;
    if (listeners.size === 1) {
      if (this.isCallbackScopeCurrent(scope)) {
        const listener = listeners.keys().next().value!;
        listener(...args);
      }
      return;
    }
    // Reentrant rendering may replace subscriptions while an event is running.
    // Those new entries belong to the next event; removals still take effect now.
    for (const [listener, registration] of Array.from(listeners)) {
      if (!this.isCallbackScopeCurrent(scope)) return;
      if (listeners.get(listener) === registration) listener(...args);
    }
  }

  public on(eventName: string, listener: ComponentEventListener): () => void {
    if (!this.eventListeners[eventName]) {
      this.eventListeners[eventName] = new Map();
    }
    const listeners = this.eventListeners[eventName];
    const registration = listeners.get(listener) ?? Symbol();
    listeners.set(listener, registration);
    return () => {
      if (listeners.get(listener) === registration) listeners.delete(listener);
    };
  }

  public off(eventName: string, listener: ComponentEventListener): void {
    this.eventListeners[eventName]?.delete(listener);
  }

  private createRenderContext(): RenderRuntimeContext {
    const scope = this.callbackScope;
    const component = this;
    return {
      appContext: this.appContext,
      templateEngine: this.templateEngine,
      renderer: this.renderer,
      onElementChange: (previous, next) => {
        if (this.isCallbackScopeCurrent(scope) && this.el === previous) {
          this.el = next;
          this.elementChangeListener?.(previous, next);
        }
      },
      guardCallback: (callback) => {
        const guarded = this.createGuardedCallback(callback);
        return function (this: unknown, ...args) {
          if (!component.isCallbackScopeCurrent(scope)) return;
          const result = guarded.apply(this, args);
          getPromiseObserver(result)?.(
            () => {},
            (error) => {
              console.error('组件异步回调错误:', error);
            }
          );
          return result;
        };
      },
      slots: this.collectSlots(),
      registerChild: (component) => {
        this.childComponents.add(component);
        component.setParentComponent?.(this);
        component.setAppContext?.(this.appContext);
      },
      unregisterChild: (component) => {
        this.childComponents.delete(component);
        component.setParentComponent?.(null);
      },
    };
  }

  private collectSlots(): Record<string, Array<VNode | string>> {
    const slots: Record<string, Array<VNode | string>> = { default: [] };
    const children = toChildren(
      (this.props as { children?: Array<VNode | string> }).children
    );

    children.forEach((child) => {
      const slotName = this.getSlotName(child);
      if (!slots[slotName]) {
        slots[slotName] = [];
      }
      slots[slotName].push(this.normalizeSlotChild(child));
    });

    return slots;
  }

  private getSlotName(child: VNode | string): string {
    if (typeof child === 'string') {
      return 'default';
    }

    return 'slot' in child && typeof child.slot === 'string'
      ? child.slot
      : 'default';
  }

  private normalizeSlotChild(child: VNode | string): VNode | string {
    if (typeof child === 'string' || !('slot' in child)) {
      return child;
    }

    const clone = { ...child };
    delete clone.slot;
    return clone as VNode;
  }

  private getRouterFrom(value: unknown): unknown {
    if (!value || typeof value !== 'object' || !('router' in value)) {
      return undefined;
    }

    return (value as { router?: unknown }).router;
  }

  private getRouterFromGlobalApp(): unknown {
    const globalApp = (globalThis as { __APP__?: unknown }).__APP__;
    return this.getRouterFrom(globalApp);
  }

  private resolveAppInjection<T>(key: InjectionKey<T>): InjectionResult<T> {
    if (!this.appContext || typeof this.appContext !== 'object') {
      return { found: false, value: undefined };
    }

    const app = (
      this.appContext as {
        app?: {
          resolveInjection?: (
            injectionKey: InjectionKey<T>
          ) => InjectionResult<T>;
        };
      }
    ).app;

    return app?.resolveInjection?.(key) ?? { found: false, value: undefined };
  }
}
