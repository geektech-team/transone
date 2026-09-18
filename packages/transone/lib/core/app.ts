import {
  Component,
  ComponentConstructor,
  ComponentProps,
  InjectionKey,
  InjectionResult,
} from './component';
import {
  renderHtmlDocument as renderDocumentShell,
  type HtmlDocumentBody,
  type HtmlDocumentOptions,
  type HtmlScript,
} from './document';
import { Div } from './vnode';
import type { Router } from '../router';

import { TemplateEngine } from './template';

const DEFAULT_ROOT_ELEMENT = '#app';

// 插件接口定义
export interface Plugin {
  install: (app: OneApp, ...args: unknown[]) => void;
  onMounted?: (app: OneApp) => void;
  onUpdated?: (app: OneApp) => void;
  onBeforeUnmount?: (app: OneApp) => void;
}

export type AppDocumentOptions = Partial<Omit<HtmlDocumentOptions, 'body'>> & {
  body?: HtmlDocumentBody;
};

export type AppDocumentRenderOptions = AppDocumentOptions;

// 泛型化AppOptions接口
export interface AppOptions<
  TState = Record<string, unknown>,
  TConfig = Record<string, unknown>,
  TRootProps extends ComponentProps = ComponentProps,
> {
  /** 根组件构造函数 */
  root?: ComponentConstructor<TRootProps>;
  /** 根组件 props */
  rootProps?: TRootProps;
  /** 应用挂载点，默认 #app */
  rootElement?: string | Element;
  /** 全局状态 */
  state?: TState;
  /** 全局配置 */
  config?: TConfig;
  /** HTML 文档壳配置，用于 dev/build 生成入口页面 */
  document?: AppDocumentOptions;
}

// 泛型化AppContext接口
export interface AppContext<TConfig = Record<string, unknown>> {
  app: OneApp;
  version: string;
  config: TConfig;
  router?: Router;
}

// 泛型化OneApp类
export class OneApp<
  TState extends object = Record<string, unknown>,
  TConfig extends object = Record<string, unknown>,
  TRootProps extends ComponentProps = ComponentProps,
> {
  private container: HTMLElement | null = null;
  private rootInstance: Component | null = null;
  private mounted: boolean = false;
  private templateEngine: TemplateEngine | null = null;
  private readonly appContext: AppContext<TConfig>;
  private readonly providers = new Map<string | symbol, unknown>();
  private plugins: Array<{ plugin: Plugin; args: unknown[] }> = [];
  private unmountedCallback?: () => void;
  public router?: Router;

  constructor(private options: AppOptions<TState, TConfig, TRootProps> = {}) {
    this.appContext = {
      app: this as unknown as OneApp,
      version: '0.1.1',
      config: options.config || ({} as TConfig),
    };
  }

  private handleError(error: Error): void {
    console.error('应用错误:', error);
    // 渲染错误UI
    this.renderErrorUI(error);
    // 不立即卸载应用，而是显示错误信息
  }

  /**
   * 渲染错误UI
   */
  private renderErrorUI(error: Error): void {
    if (!this.container) {
      return;
    }

    this.container.innerHTML = `
      <div style="padding: 20px; background-color: #ffebee; color: #c62828; font-family: Arial, sans-serif;">
        <h3>应用错误</h3>
        <p>${error.message}</p>
        <pre style="background-color: #fff; padding: 10px; border-radius: 4px; overflow: auto;">${error.stack}</pre>
      </div>
    `;
  }

  /**
   * 使用插件
   */
  public use(plugin: Plugin, ...args: unknown[]): this {
    if (typeof plugin.install !== 'function') {
      throw new Error('插件必须提供 install 方法');
    }
    plugin.install(this as unknown as OneApp, ...args);
    this.plugins.push({ plugin, args });
    return this;
  }

  /**
   * 挂载应用
   */
  public mount(): void {
    if (this.mounted) {
      console.warn('应用已经处于运行状态');
      return;
    }

    const mountContainer = this.resolveMountContainer();
    if (!mountContainer) {
      return;
    }

    try {
      this.container = mountContainer;

      // 添加全局应用实例
      (globalThis as { __APP__?: unknown }).__APP__ = this;

      // 只有在有根组件时才创建实例
      if (this.options.root) {
        this.rootInstance = new this.options.root(this.options.rootProps);

        // 设置应用上下文
        if ('setAppContext' in this.rootInstance) {
          this.rootInstance.setAppContext(this.appContext);
        }

        // 如果有全局状态，传递给组件
        if (this.options.state && 'setState' in this.rootInstance) {
          this.rootInstance.setState(this.options.state);
        }

        this.rootInstance.mount(this.container);

        // 创建模板引擎实例
        this.templateEngine = new TemplateEngine(this.options.state || {});
      }

      this.mounted = true;

      // 触发生命周期钩子
      this.onMounted();
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * 卸载应用
   */
  public unmount(): void {
    if (!this.mounted) {
      console.warn('应用未处于运行状态');
      return;
    }

    try {
      // 触发卸载前钩子
      this.onBeforeUnmount();

      if (this.rootInstance) {
        // 调用组件卸载方法
        if ('unmount' in this.rootInstance) {
          this.rootInstance.unmount();
        }

        this.rootInstance = null;
        this.mounted = false;
        delete (globalThis as { __APP__?: unknown }).__APP__;
      }

      // 清除模板引擎
      if (this.templateEngine) {
        this.templateEngine.clearBindings();
        this.templateEngine = null;
      }

      // 清空容器
      if (this.container) {
        this.container.innerHTML = '';
      }

      // 触发卸载后钩子
      if (this.unmountedCallback) {
        this.unmountedCallback();
      }
    } catch (error) {
      console.error('Failed to unmount app:', error);
    }
  }

  /**
   * 应用是否正在运行
   */
  public isRunning(): boolean {
    return this.mounted;
  }

  /**
   * 更新根组件
   */
  public updateRootComponent(
    component: ComponentConstructor<TRootProps>
  ): void {
    if (this.mounted) {
      this.unmount();
    }
    this.options.root = component;
    this.mount();
  }

  /**
   * 更新应用状态
   */
  public update(state?: Partial<TState>): this {
    if (!this.mounted) {
      console.warn('Cannot update unmounted app');
      return this;
    }

    try {
      // 更新状态
      if (state && this.options.state) {
        this.options.state = { ...this.options.state, ...state };

        // 更新组件状态
        if (this.rootInstance && 'setState' in this.rootInstance) {
          this.rootInstance.setState(state);
        }

        // 更新模板引擎状态
        if (this.templateEngine) {
          // 如果存在templateEngine，更新其状态
          this.templateEngine.state = this.options.state;
        }
      }

      // 触发更新钩子
      this.onUpdated();
    } catch (error) {
      console.error('Failed to update app:', error);
    }

    return this;
  }

  /**
   * 获取应用上下文
   */
  public getContext(): AppContext<TConfig> {
    return this.appContext;
  }

  public provide<T>(key: InjectionKey<T>, value: T): this {
    this.providers.set(key, value);
    return this;
  }

  public inject<T>(key: InjectionKey<T>): T | undefined;
  public inject<T>(key: InjectionKey<T>, fallback: T): T;
  public inject<T>(key: InjectionKey<T>, fallback?: T): T | undefined {
    const result = this.resolveInjection(key);
    return result.found ? result.value : fallback;
  }

  public resolveInjection<T>(key: InjectionKey<T>): InjectionResult<T> {
    if (!this.providers.has(key)) {
      return { found: false, value: undefined };
    }

    return { found: true, value: this.providers.get(key) as T | undefined };
  }

  /**
   * 获取应用状态
   */
  public getState(): TState | undefined {
    return this.options.state;
  }

  /**
   * 设置应用状态
   */
  public setState(newState: TState): this {
    this.options.state = newState;
    if (this.mounted) {
      this.update();
    }
    return this;
  }

  /**
   * 监听应用卸载
   */
  public onUnmounted(callback: () => void): this {
    this.unmountedCallback = callback;
    return this;
  }

  /**
   * 生成应用入口 HTML 文档
   */
  public renderHtmlDocument(options: AppDocumentRenderOptions = {}): string {
    const appDocument = this.options.document ?? {};
    const scripts = this.mergeDocumentScripts(
      appDocument.scripts,
      options.scripts
    );

    return renderDocumentShell({
      ...appDocument,
      ...options,
      title: options.title ?? appDocument.title ?? 'TransOne App',
      body: options.body ?? appDocument.body ?? this.createMountDocumentBody(),
      scripts,
    });
  }

  /**
   * 解析根元素
   */
  private resolveRootElement(selector?: string | Element): Element | null {
    if (!selector) {
      return null;
    }

    if (typeof selector === 'string') {
      if (typeof document === 'undefined') {
        return null;
      }

      return document.querySelector(selector);
    }

    return typeof Element !== 'undefined' && selector instanceof Element
      ? selector
      : null;
  }

  private resolveMountContainer(): HTMLElement | null {
    if (typeof document === 'undefined') {
      return null;
    }

    const rootElement = this.resolveRootElement(
      this.options.rootElement ?? DEFAULT_ROOT_ELEMENT
    );
    return rootElement instanceof HTMLElement ? rootElement : null;
  }

  private createMountDocumentBody(): HtmlDocumentBody {
    const rootElement = this.options.rootElement ?? DEFAULT_ROOT_ELEMENT;

    if (typeof rootElement === 'string') {
      return this.createMountElementFromSelector(rootElement);
    }

    if (typeof Element !== 'undefined' && rootElement instanceof Element) {
      const props: Record<string, string> = {};
      if (rootElement.id) {
        props.id = rootElement.id;
      }
      if (rootElement.className) {
        props.className = rootElement.className;
      }

      return { tag: rootElement.tagName.toLowerCase(), props };
    }

    return Div({ props: { id: 'app' } });
  }

  private createMountElementFromSelector(selector: string): HtmlDocumentBody {
    if (selector.startsWith('#') && selector.length > 1) {
      return Div({ props: { id: selector.slice(1) } });
    }

    if (selector.startsWith('.') && selector.length > 1) {
      return Div({ props: { className: selector.slice(1) } });
    }

    return Div({ props: { 'data-transone-root': selector } });
  }

  private mergeDocumentScripts(
    baseScripts?: HtmlScript[],
    extraScripts?: HtmlScript[]
  ): HtmlScript[] | undefined {
    if (!baseScripts && !extraScripts) {
      return undefined;
    }

    return [...(baseScripts ?? []), ...(extraScripts ?? [])];
  }

  // 生命周期钩子
  private onMounted(): void {
    // 触发插件的mounted钩子
    this.plugins.forEach(({ plugin: pluginObj }) => {
      if (pluginObj && typeof pluginObj.onMounted === 'function') {
        pluginObj.onMounted(this as unknown as OneApp);
      }
    });
  }

  private onUpdated(): void {
    // 触发插件的updated钩子
    this.plugins.forEach(({ plugin: pluginObj }) => {
      if (pluginObj && typeof pluginObj.onUpdated === 'function') {
        pluginObj.onUpdated(this as unknown as OneApp);
      }
    });
  }

  private onBeforeUnmount(): void {
    // 触发插件的beforeUnmount钩子
    this.plugins.forEach(({ plugin: pluginObj }) => {
      if (pluginObj && typeof pluginObj.onBeforeUnmount === 'function') {
        pluginObj.onBeforeUnmount(this as unknown as OneApp);
      }
    });
  }
}

/**
 * 创建应用实例
 */
export function createApp<
  TState extends object = Record<string, unknown>,
  TConfig extends object = Record<string, unknown>,
  TRootProps extends ComponentProps = ComponentProps,
>(
  options: AppOptions<TState, TConfig, TRootProps> = {}
): OneApp<TState, TConfig, TRootProps> {
  return new OneApp<TState, TConfig, TRootProps>(options);
}
