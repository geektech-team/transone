import { CleanupErrors } from '../cleanup';
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
  private readonly eventListeners: Record<string, Set<ComponentEventListener>> =
    {};
  private readonly providers = new Map<string | symbol, unknown>();
  private readonly updateEffect: ReactiveEffect;
  private appContext: unknown = null;
  private disposed = false;
  private unmounting = false;
  private readonly disposers = new Set<() => void>();
  private parentComponent: ComponentInstance | null = null;
  private elementChangeListener:
    ((previousElement: Node, nextElement: Node) => void) | null = null;

  protected styleManager: StyleManager;
  public state: TState;
  public mounted = false;

  constructor(protected props: TProps = {} as TProps) {
    this.styleManager = new StyleManager();
    this.state = reactive(this.initState() ?? {});
    this.templateEngine = new TemplateEngine(this.state);
    this.initStyles();

    this.updateEffect = effect(
      () => {
        // 依赖在 render 期间按需收集（细粒度）：只对 render 实际访问的
        // state 属性建立依赖，未访问的属性变化不会触发重渲染
        if (this.mounted) {
          try {
            this.update();
          } catch (error) {
            if (!this.dispatchError(error)) {
              throw error;
            }
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
    if (this.mounted && this.el) {
      return this.el;
    }

    if (this.unmounting) {
      throw new Error('Cannot mount a component during teardown');
    }

    try {
      if (this.disposed) {
        this.disposed = false;
        this.updateEffect.active = true;
        this.initStyles();
      }
      this.beforeMount();
      // Render under the component's own effect, including descendant initialization.
      this.el = ReactiveSystem.getInstance().runWithEffect(
        this.updateEffect,
        () => {
          this.vnode = this.render();
          return this.renderer.mount(this.vnode, this.createRenderContext());
        }
      );
      this.mounted = true;
      this.onMounted();
      return this.el;
    } catch (error) {
      // Resolve the boundary while the parent chain is still intact, then release
      // all resources created by this failed attempt (including constructor styles).
      const errors = new CleanupErrors();
      let handled = false;
      errors.attempt(() => {
        handled = this.dispatchError(error);
      });
      if (!handled) errors.add(error);
      errors.attempt(() => this.unmount());
      errors.throwIfAny('Component mount and cleanup failed');
      return document.createComment('error-boundary');
    }
  }

  public update(): void {
    if (this.unmounting || this.disposed || !this.el || !this.vnode) {
      return;
    }

    this.beforeUpdate();
    const currentVNode = this.vnode;
    const currentElement = this.el;
    // 与 mountToNode 同理：render 期间的响应式访问只收集到自身 effect。
    this.el = ReactiveSystem.getInstance().runWithEffect(
      this.updateEffect,
      () => {
        const newVNode = this.render();
        const nextElement = this.renderer.patch(
          currentVNode,
          newVNode,
          currentElement,
          this.createRenderContext()
        );
        this.vnode = newVNode;
        return nextElement;
      }
    );
    if (currentElement !== this.el) {
      this.elementChangeListener?.(currentElement, this.el);
    }
    this.onUpdated();
    this.onPropsChange();
  }

  /**
   * Teardown order: beforeUnmount, descendants, FIFO disposers, framework
   * bindings/styles/effect, DOM and references, then onUnmounted. Every stage
   * runs even after failures; repeated/reentrant calls do nothing.
   */
  public unmount(): void {
    if (this.disposed || this.unmounting) return;
    this.unmounting = true;
    this.disposed = true;
    const wasMounted = this.mounted;
    const errors = new CleanupErrors();

    if (wasMounted) errors.attempt(() => this.beforeUnmount());
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
    if (wasMounted) errors.attempt(() => this.onUnmounted());
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
      cleanup();
      return () => {};
    }
    // A distinct wrapper allows the same callback to own multiple resources.
    const dispose = () => cleanup();
    this.disposers.add(dispose);
    return () => {
      this.disposers.delete(dispose);
    };
  }

  public setProps(props: Partial<TProps>): void {
    this.props = {
      ...this.props,
      ...props,
    };

    if (this.mounted) {
      // 与 state 更新走同一调度器：同一批多次 setProps 合并为一次更新
      reactiveScheduler.enqueue(this.updateEffect);
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
  private dispatchError(error: unknown): boolean {
    let current: ComponentInstance | null = this.getParentComponent();
    while (current) {
      // 同类实例可访问 protected 生命周期钩子
      const boundary = current as unknown as Component;
      if (typeof boundary.onErrorCaptured === 'function') {
        const handled = boundary.onErrorCaptured(error, this);
        if (handled === false) {
          return true;
        }
      }
      current = current.getParentComponent?.() ?? null;
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
    this.eventListeners[eventName]?.forEach((listener) => {
      listener(...args);
    });
  }

  public on(eventName: string, listener: ComponentEventListener): () => void {
    if (!this.eventListeners[eventName]) {
      this.eventListeners[eventName] = new Set();
    }
    this.eventListeners[eventName].add(listener);

    return () => this.off(eventName, listener);
  }

  public off(eventName: string, listener: ComponentEventListener): void {
    this.eventListeners[eventName]?.delete(listener);
  }

  private createRenderContext(): RenderRuntimeContext {
    return {
      appContext: this.appContext,
      templateEngine: this.templateEngine,
      renderer: this.renderer,
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
