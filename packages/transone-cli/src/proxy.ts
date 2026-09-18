import type { ProxyOptions, ServerConfig } from './types';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

interface ProxyRule {
  prefix: string;
  target: URL;
  changeOrigin: boolean;
  rewrite?: (path: string) => string;
}

export function createProxyHandler(
  proxy: ServerConfig['proxy']
): (request: Request) => Promise<Response | undefined> {
  const rules = Object.entries(proxy ?? {})
    .map(([prefix, options]) => toProxyRule(prefix, options))
    .sort((first, second) => second.prefix.length - first.prefix.length);

  return async (request) => {
    const sourceUrl = new URL(request.url);
    const rule = rules.find(({ prefix }) =>
      sourceUrl.pathname.startsWith(prefix)
    );

    if (!rule) {
      return undefined;
    }

    const target = createTargetUrl(rule, sourceUrl);
    const headers = createRequestHeaders(request, sourceUrl, rule, target);
    const body =
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : request.body;

    try {
      const upstream = await fetch(target, {
        method: request.method,
        headers,
        body,
        signal: request.signal,
        redirect: 'manual',
      });

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: filterHeaders(upstream.headers),
      });
    } catch {
      return new Response('Bad Gateway', { status: 502 });
    }
  };
}

function toProxyRule(prefix: string, value: string | ProxyOptions): ProxyRule {
  const options = typeof value === 'string' ? { target: value } : value;

  return {
    prefix,
    target: new URL(options.target),
    changeOrigin: options.changeOrigin ?? false,
    ...(options.rewrite === undefined ? {} : { rewrite: options.rewrite }),
  };
}

function createTargetUrl(rule: ProxyRule, sourceUrl: URL): URL {
  const target = new URL(rule.target);
  const pathname = rule.rewrite?.(sourceUrl.pathname) ?? sourceUrl.pathname;

  target.pathname = joinPathnames(target.pathname, pathname);
  target.search = sourceUrl.search;
  return target;
}

function joinPathnames(basePathname: string, pathname: string): string {
  const base = basePathname === '/' ? '' : basePathname.replace(/\/+$/, '');
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;

  return `${base}${path}` || '/';
}

function createRequestHeaders(
  request: Request,
  sourceUrl: URL,
  rule: ProxyRule,
  target: URL
): Headers {
  const headers = filterHeaders(request.headers);
  const incomingHost = request.headers.get('host') ?? sourceUrl.host;

  headers.set('host', rule.changeOrigin ? target.host : incomingHost);
  return headers;
}

function filterHeaders(source: Headers): Headers {
  const headers = new Headers(source);
  const connection = headers.get('connection');

  if (connection) {
    connection.split(',').forEach((header) => {
      const name = header.trim();
      if (name) {
        headers.delete(name);
      }
    });
  }

  HOP_BY_HOP_HEADERS.forEach((header) => headers.delete(header));
  return headers;
}
