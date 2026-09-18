import type { RouteLocation, RouterOptions } from './index';
import { normalizePath } from './matcher';

export type RouterMode = NonNullable<RouterOptions['mode']>;

export function createRouterHref(
  path: string,
  mode: RouterMode,
  base: string
): string {
  const normalizedPath = normalizePath(path);
  const fullPath = base === '/' ? normalizedPath : base + normalizedPath;
  return mode === 'hash' ? `#${fullPath}` : fullPath;
}

export function getBrowserLocation(
  mode: RouterMode,
  base: string
): RouteLocation {
  let path: string;
  let fullPath: string;
  let queryString: string;

  if (mode === 'history') {
    fullPath = window.location.pathname + window.location.search;
    path = window.location.pathname;
    queryString = window.location.search;
  } else {
    const hash = window.location.hash;
    fullPath = hash || '#/';
    path = fullPath.startsWith('#') ? fullPath.slice(1) : fullPath;
    const queryStart = path.indexOf('?');
    queryString = queryStart >= 0 ? path.slice(queryStart + 1) : '';
    path = queryStart >= 0 ? path.slice(0, queryStart) : path;
  }

  if (path.startsWith(base) && base !== '/' && path !== '/') {
    path = path.slice(base.length);
  }

  path = normalizePath(path);

  return {
    path,
    fullPath,
    query: parseQuery(queryString),
    params: {},
  };
}

export function navigateBrowser(
  path: string,
  replace: boolean,
  mode: RouterMode,
  base: string
): void {
  const normalizedPath = normalizePath(path);
  const fullPath = base === '/' ? normalizedPath : base + normalizedPath;

  if (mode === 'history') {
    if (replace) {
      window.history.replaceState({}, '', fullPath);
    } else {
      window.history.pushState({}, '', fullPath);
    }
    return;
  }

  if (replace) {
    const href = window.location.href.split('#')[0];
    window.location.replace(`${href}#${fullPath}`);
    return;
  }

  window.location.hash = fullPath;
}

function parseQuery(queryString: string): Record<string, string> {
  const query: Record<string, string> = {};
  const normalizedQuery = queryString.startsWith('?')
    ? queryString.slice(1)
    : queryString;

  if (!normalizedQuery) {
    return query;
  }

  normalizedQuery.split('&').forEach((param) => {
    const [key, value] = param.split('=');
    if (key) {
      query[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
    }
  });

  return query;
}
