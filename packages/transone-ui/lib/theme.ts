/**
 * transone-ui 设计令牌（Design Tokens）。
 *
 * 组件样式统一通过 CSS 自定义属性 `var(--tu-*, 默认值)` 引用：
 * - Web：可在任意层覆盖（:root / 组件外层），或调用 `injectTuTheme()` 注入默认主题；
 * - 小程序：在 app.wxss 的 `page` 选择器（或任意页面 wxss）覆盖同名变量即可，
 *   默认值保证未覆盖时开箱即用（小程序基础库需支持 CSS 变量）。
 *
 * 注意：本文件只做"令牌定义 + Web 注入"，组件内联的默认值是与这里同步的字符串字面量，
 * 这是为了满足 transone 小程序编译器对 initStyles() 的静态求值约束（同文件字面量可折叠）。
 */

export type TuColorName =
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'text'
  | 'textSecondary'
  | 'border'
  | 'background'
  | 'white';

/** 令牌名 -> CSS 变量名。 */
export const TU_CSS_VARS: Readonly<Record<TuColorName | 'radiusSm' | 'radiusMd' | 'radiusLg' | 'popupZIndex' | 'duration', string>> = {
  primary: '--tu-primary',
  success: '--tu-success',
  warning: '--tu-warning',
  danger: '--tu-danger',
  info: '--tu-info',
  text: '--tu-text',
  textSecondary: '--tu-text-secondary',
  border: '--tu-border',
  background: '--tu-background',
  white: '--tu-white',
  radiusSm: '--tu-radius-sm',
  radiusMd: '--tu-radius-md',
  radiusLg: '--tu-radius-lg',
  popupZIndex: '--tu-popup-z-index',
  duration: '--tu-duration',
} as const;

/** 令牌默认值（与组件内联回退一致）。 */
export const TU_THEME_DEFAULTS: Readonly<Record<string, string>> = {
  '--tu-primary': '#1677ff',
  '--tu-success': '#00b578',
  '--tu-warning': '#ff8f1f',
  '--tu-danger': '#ff3141',
  '--tu-info': '#969799',
  '--tu-text': '#323233',
  '--tu-text-secondary': '#969799',
  '--tu-border': '#ebedf0',
  '--tu-background': '#f7f8fa',
  '--tu-white': '#ffffff',
  '--tu-radius-sm': '4px',
  '--tu-radius-md': '8px',
  '--tu-radius-lg': '12px',
  '--tu-popup-z-index': '1000',
  '--tu-duration': '300ms',
} as const;

export type TuThemeOverrides = Partial<typeof TU_THEME_DEFAULTS>;

/**
 * Web 端注入主题变量到 :root（幂等，重复调用只更新已声明变量）。
 * 小程序端无需调用：直接在 app.wxss 的 page 选择器覆盖变量。
 */
export function injectTuTheme(overrides: TuThemeOverrides = {}): void {
  if (typeof document === 'undefined') {
    return;
  }
  let style = document.querySelector<HTMLStyleElement>('style[data-tu-theme]');
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('data-tu-theme', '');
    document.head.appendChild(style);
  }
  const declarations = Object.entries({ ...TU_THEME_DEFAULTS, ...overrides })
    .map(([name, value]) => `${name}: ${value};`)
    .join('\n');
  style.textContent = `:root {\n${declarations}\n}`;
}
