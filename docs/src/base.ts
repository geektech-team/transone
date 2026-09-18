/**
 * GitHub Pages 子路径（base path）处理。
 *
 * 部署形态：站点挂在组织 Pages 的子路径下（如
 * `https://geektech-team.github.io/transone/`）。transone-cli 的
 * `--base` 只影响 SSR 时注入的 window URL（`http://127.0.0.1<base><route>`），
 * 因此入口可以在模块作用域读取 `window.location.pathname`，用已知路由表
 * 反推 base——SSR 与客户端使用同一套逻辑，无需额外注入。
 */

let docBasePath = '';

export function normalizeDocBasePath(base: string): string {
  const trimmed = (base ?? '').trim();
  if (!trimmed || trimmed === '/') {
    return '';
  }
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading;
}

export function setDocBasePath(base: string): void {
  docBasePath = normalizeDocBasePath(base);
}

export function getDocBasePath(): string {
  return docBasePath;
}

export function withDocBasePath(path: string): string {
  if (!docBasePath) {
    return path;
  }
  return path === '/' ? `${docBasePath}/` : `${docBasePath}${path}`;
}

/**
 * 从真实 URL pathname 推导部署 base。
 *
 * 思路：遍历路由表（去掉尾斜杠、按长度降序），若 pathname 以某路由结尾，
 * 则路由在原始 pathname 中的前一字符必须是 '/'（或位于起点），满足段边界
 * 后剥掉路由，剩余部分即 base（去掉尾斜杠）。
 * 没有任何路由命中时（如访问站点根 `/transone/`），整个 pathname 视为 base。
 */
export function deriveDocBase(
  pathname: string,
  routes: readonly string[]
): string {
  const stripped = pathname.replace(/\/+$/, '') || '/';
  if (stripped === '/') {
    return '';
  }

  const candidates = [...new Set(routes)]
    .map((route) => (route === '/' ? '' : route.replace(/\/+$/, '')))
    .filter((route) => route !== '')
    .sort((a, b) => b.length - a.length);

  for (const route of candidates) {
    if (stripped === route) {
      return '';
    }
    // 路由一律以 '/' 开头，endsWith 命中即从段首开始，无需额外边界判断
    if (stripped.endsWith(route)) {
      return stripped
        .slice(0, stripped.length - route.length)
        .replace(/\/+$/, '') || '';
    }
  }

  return stripped;
}
