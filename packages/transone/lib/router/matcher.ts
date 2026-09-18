import type { RouteRecord } from './index';

export interface RouteMatch {
  route: RouteRecord;
  params: Record<string, string>;
}

export function normalizePath(path: string): string {
  if (!path.startsWith('/')) {
    return `/${path}`;
  }
  return path || '/';
}

export function matchRoute(
  routes: RouteRecord[],
  path: string
): RouteMatch | null {
  const normalizedPath = normalizePath(path.split('?')[0]);

  for (const route of routes) {
    if (route.path === '*') {
      continue;
    }
    const params = matchRoutePath(route.path, normalizedPath);
    if (params) {
      return { route, params };
    }
  }

  // catch-all 通配路由：匹配任意未命中路径
  const wildcard = routes.find((route) => route.path === '*');
  if (wildcard) {
    return {
      route: wildcard,
      params: { pathMatch: normalizedPath },
    };
  }

  const fallback = routes.find((route) => route.path === '/');
  return fallback ? { route: fallback, params: {} } : null;
}

function matchRoutePath(
  routePath: string,
  currentPath: string
): Record<string, string> | null {
  const routeSegments = getPathSegments(routePath);
  const currentSegments = getPathSegments(currentPath);

  if (routeSegments.length !== currentSegments.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let index = 0; index < routeSegments.length; index += 1) {
    const routeSegment = routeSegments[index];
    const currentSegment = currentSegments[index];

    if (routeSegment.startsWith(':')) {
      const paramName = routeSegment.slice(1);
      if (!paramName) {
        return null;
      }
      params[decodeURIComponent(paramName)] =
        decodeURIComponent(currentSegment);
      continue;
    }

    if (routeSegment !== currentSegment) {
      return null;
    }
  }

  return params;
}

function getPathSegments(path: string): string[] {
  const normalizedPath = normalizePath(path);
  if (normalizedPath === '/') {
    return [];
  }

  return normalizedPath.split('/').filter(Boolean);
}
