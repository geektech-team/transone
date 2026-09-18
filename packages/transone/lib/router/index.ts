import { AnyComponentConstructor, Component } from '../core/component';
import { OneApp } from '../core/app';
import type { VNode } from '../core/vnode';
import { setRouter } from './instance';
import {
  createRouterHref,
  getBrowserLocation,
  navigateBrowser,
} from './history';
import { matchRoute, RouteMatch } from './matcher';

export { useRouter } from './instance';

export type RouteMeta = Record<string, unknown>;

export interface RouteRecord {
  path: string;
  component?: AnyComponentConstructor;
  redirect?: string;
  name?: string;
  meta?: RouteMeta;
}

export interface RouterOptions {
  routes: RouteRecord[];
  mode?: 'history' | 'hash';
  base?: string;
}

export interface RouteLocation {
  path: string;
  query: Record<string, string>;
  params: Record<string, string>;
  fullPath: string;
  name?: string;
  meta?: RouteMeta;
}

export type RouteChangeListener = (
  to: RouteLocation,
  from: RouteLocation | null
) => void;

interface RedirectResult {
  route: RouteRecord;
  params: Record<string, string>;
  path: string;
}

function parseQueryFromPath(fullPath: string): Record<string, string> {
  const queryStart = fullPath.indexOf('?');
  if (queryStart < 0) {
    return {};
  }

  const queryString = fullPath.slice(queryStart + 1);
  const query: Record<string, string> = {};
  if (!queryString) {
    return query;
  }

  queryString.split('&').forEach((param) => {
    const [key, value] = param.split('=');
    if (key) {
      query[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
    }
  });

  return query;
}

/**
 * 导航守卫。返回 false 取消导航；返回字符串表示重定向到该路径；
 * 返回 true 或 undefined 放行。
 */
export type NavigationGuard = (
  to: RouteLocation,
  from: RouteLocation | null
) => boolean | void | string;

export class Router {
  protected currentRoute: RouteRecord | null = null;
  protected currentLocation: RouteLocation | null = null;
  private readonly routes: RouteRecord[] = [];
  private app: OneApp | null = null;
  private readonly mode: 'history' | 'hash';
  private readonly base: string;
  private readonly routeChangeListeners: RouteChangeListener[] = [];
  private readonly beforeGuards: NavigationGuard[] = [];
  private readonly afterHooks: RouteChangeListener[] = [];
  private removeWindowListener?: () => void;

  constructor(options: RouterOptions | RouteRecord[]) {
    const resolvedOptions = Array.isArray(options)
      ? { routes: options }
      : options;

    this.routes = resolvedOptions.routes || [];
    this.mode = resolvedOptions.mode || 'history';
    this.base = resolvedOptions.base || '/';
    this.validateRoutes();
    this.initEvents();
    this.resolveCurrentRoute();
  }

  public install(app: OneApp): void {
    this.app = app;
    app.router = this;
    setRouter(this);

    const context = app.getContext() as { router?: Router };
    context.router = this;

    this.resolveCurrentRoute();
  }

  public push(path: string): void {
    this.navigate(path, false);
  }

  public replace(path: string): void {
    this.navigate(path, true);
  }

  public forward(): void {
    window.history.forward();
  }

  public back(): void {
    window.history.back();
  }

  public go(delta: number): void {
    window.history.go(delta);
  }

  public getCurrentRoute(): RouteLocation | null {
    if (!this.currentLocation) {
      this.resolveCurrentRoute();
    }
    return this.currentLocation;
  }

  public getCurrentRouteRecord(): RouteRecord | null {
    if (!this.currentRoute) {
      this.resolveCurrentRoute();
    }
    return this.currentRoute;
  }

  public onRouteChange(listener: RouteChangeListener): () => void {
    this.routeChangeListeners.push(listener);

    return () => {
      const index = this.routeChangeListeners.indexOf(listener);
      if (index > -1) {
        this.routeChangeListeners.splice(index, 1);
      }
    };
  }

  /**
   * 注册全局前置守卫；返回移除该守卫的函数。
   */
  public beforeEach(guard: NavigationGuard): () => void {
    this.beforeGuards.push(guard);

    return () => {
      const index = this.beforeGuards.indexOf(guard);
      if (index > -1) {
        this.beforeGuards.splice(index, 1);
      }
    };
  }

  /**
   * 注册导航完成后钩子；返回移除该钩子的函数。
   */
  public afterEach(hook: RouteChangeListener): () => void {
    this.afterHooks.push(hook);

    return () => {
      const index = this.afterHooks.indexOf(hook);
      if (index > -1) {
        this.afterHooks.splice(index, 1);
      }
    };
  }

  public getRoutes(): RouteRecord[] {
    return [...this.routes];
  }

  public addRoute(route: RouteRecord): void {
    if (this.routes.some((item) => item.path === route.path)) {
      throw new Error(`Route already exists: ${route.path}`);
    }

    this.routes.push(route);

    const location = this.getCurrentLocation();
    if (location.path === route.path) {
      this.handleRouteChange();
    }
  }

  public createHref(path: string): string {
    return createRouterHref(path, this.mode, this.base);
  }

  public destroy(): void {
    this.removeWindowListener?.();
    this.removeWindowListener = undefined;
    if (this.app?.router === this) {
      this.app.router = undefined;
    }
    this.app = null;
  }

  private navigate(path: string, replace: boolean): void {
    if (!path || typeof path !== 'string') {
      throw new Error('Path must be a non-empty string');
    }

    const from = this.currentLocation;
    const target = this.resolveTarget(path);
    if (!target) {
      return;
    }

    const to = target.location;

    // 前置守卫：返回 false 取消导航，返回字符串重定向
    for (const guard of this.beforeGuards) {
      const result = guard(to, from);
      if (result === false) {
        return;
      }
      if (typeof result === 'string' && result !== path) {
        this.navigate(result, replace);
        return;
      }
    }

    // 同路径导航不做重复入栈
    if (from && this.isSameLocation(from, to)) {
      return;
    }

    navigateBrowser(target.path, replace, this.mode, this.base);
    this.currentRoute = target.route;
    this.currentLocation = to;
    this.triggerRouteChangeListeners(to, from);
    this.afterHooks.forEach((hook) => {
      try {
        hook(to, from);
      } catch (error) {
        console.error('Route afterEach error:', error);
      }
    });
  }

  /**
   * 解析导航目标：应用 redirect 链后返回最终路径、路由与 location。
   */
  private resolveTarget(
    path: string
  ): { path: string; route: RouteRecord; location: RouteLocation } | null {
    const match = matchRoute(this.routes, path.split('?')[0]);
    if (!match) {
      return null;
    }

    const redirected = this.applyRedirect(match);
    const finalPath = redirected?.path ?? path;
    const route = redirected?.route ?? match.route;

    return {
      path: finalPath,
      route,
      location: {
        path: finalPath.split('?')[0],
        query: parseQueryFromPath(finalPath),
        params: redirected?.params ?? match.params,
        fullPath: finalPath,
        name: route?.name,
        meta: route?.meta,
      },
    };
  }

  /**
   * 沿 redirect 链解析到最终路由（防循环）。
   */
  private applyRedirect(match: RouteMatch): RedirectResult | null {
    const visited = new Set<string>();
    let current = match;
    let finalPath = '';

    while (current.route.redirect) {
      if (visited.has(current.route.path)) {
        throw new Error(
          `Redirect loop detected for route: ${current.route.path}`
        );
      }
      visited.add(current.route.path);
      finalPath = current.route.redirect;
      const next = matchRoute(this.routes, finalPath.split('?')[0]);
      if (!next) {
        return null;
      }
      current = next;
    }

    return finalPath
      ? { route: current.route, params: current.params, path: finalPath }
      : null;
  }

  private validateRoutes(): void {
    if (!Array.isArray(this.routes)) {
      throw new Error('Router routes must be an array');
    }

    const paths = new Set<string>();
    this.routes.forEach((route) => {
      if (!route.component && !route.redirect) {
        throw new Error(
          `Route ${route.path} must define a component or redirect`
        );
      }
      if (paths.has(route.path)) {
        throw new Error(`Duplicate route path: ${route.path}`);
      }
      paths.add(route.path);
    });
  }

  private initEvents(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const eventName = this.mode === 'history' ? 'popstate' : 'hashchange';
    const listener = (): void => {
      this.handleRouteChange();
    };

    window.addEventListener(eventName, listener);
    this.removeWindowListener = () => {
      window.removeEventListener(eventName, listener);
    };
  }

  private handleRouteChange(): void {
    const fromLocation = this.currentLocation;
    const nextLocation = this.resolveCurrentRoute();

    if (!this.isSameLocation(fromLocation, nextLocation)) {
      this.triggerRouteChangeListeners(nextLocation, fromLocation);
    }
  }

  private resolveCurrentRoute(): RouteLocation {
    const location = this.getCurrentLocation();
    const match = matchRoute(this.routes, location.path);
    const redirected = match ? this.applyRedirect(match) : null;
    const route = redirected?.route ?? match?.route ?? null;

    // URL 与重定向目标不一致时修正历史记录（replaceState 不触发 popstate）
    if (redirected && redirected.path !== location.path) {
      navigateBrowser(redirected.path, true, this.mode, this.base);
    }

    this.currentRoute = route;
    this.currentLocation = {
      ...location,
      params: redirected?.params ?? match?.params ?? {},
      name: route?.name,
      meta: route?.meta,
    };

    return this.currentLocation;
  }

  private getCurrentLocation(): RouteLocation {
    return getBrowserLocation(this.mode, this.base);
  }

  private isSameLocation(
    from: RouteLocation | null,
    to: RouteLocation | null
  ): boolean {
    return from?.fullPath === to?.fullPath && from?.name === to?.name;
  }

  private triggerRouteChangeListeners(
    to: RouteLocation,
    from: RouteLocation | null
  ): void {
    this.routeChangeListeners.forEach((listener) => {
      try {
        listener(to, from);
      } catch (error) {
        console.error('Route change listener error:', error);
      }
    });
  }
}

export interface RouterLinkProps {
  to: string;
  replace?: boolean;
  className?: string;
  activeClass?: string;
  children?: Array<VNode | string>;
}

interface RouterLinkState {
  currentPath: string;
}

export class RouterLink extends Component<RouterLinkProps, RouterLinkState> {
  private unsubscribe?: () => void;

  protected initState(): RouterLinkState {
    const router = this.router as Router | undefined;
    return {
      currentPath: router?.getCurrentRoute()?.path ?? window.location.pathname,
    };
  }

  protected initStyles(): void {}

  protected onMounted(): void {
    const router = this.router as Router | undefined;
    this.unsubscribe = router?.onRouteChange((to) => {
      this.state.currentPath = to.path;
    });
  }

  protected onUnmounted(): void {
    this.unsubscribe?.();
  }

  protected render(): VNode {
    const router = this.router as Router | undefined;
    const activeClass = this.props.activeClass ?? 'active';
    const isActive = this.state.currentPath === this.props.to;
    const className = [this.props.className, isActive ? activeClass : undefined]
      .filter(Boolean)
      .join(' ');

    return {
      tag: 'a',
      props: {
        href: router?.createHref(this.props.to) ?? this.props.to,
        className,
      },
      listeners: {
        click: (event: Event) => {
          event.preventDefault();
          if (this.props.replace) {
            router?.replace(this.props.to);
          } else {
            router?.push(this.props.to);
          }
        },
      },
      children:
        this.props.children && this.props.children.length > 0
          ? this.props.children
          : [this.props.to],
    };
  }
}

interface RouterViewState {
  route: RouteLocation | null;
  record: RouteRecord | null;
}

export class RouterView extends Component<object, RouterViewState> {
  private unsubscribe?: () => void;

  protected initState(): RouterViewState {
    const router = this.router as Router | undefined;
    return {
      route: router?.getCurrentRoute() ?? null,
      record: router?.getCurrentRouteRecord() ?? null,
    };
  }

  protected initStyles(): void {}

  protected onMounted(): void {
    const router = this.router as Router | undefined;
    this.unsubscribe = router?.onRouteChange((to) => {
      this.state.route = to;
      this.state.record = router.getCurrentRouteRecord();
    });
  }

  protected onUnmounted(): void {
    this.unsubscribe?.();
  }

  protected render(): VNode {
    const routeRecord =
      this.state.record ??
      (this.router as Router | undefined)?.getCurrentRouteRecord();

    return {
      tag: 'div',
      props: { 'data-router-view': '' },
      children: routeRecord?.component
        ? [{ component: routeRecord.component }]
        : [],
    };
  }
}

export function createRouter(options: RouterOptions | RouteRecord[]): Router {
  return new Router(options);
}
