/** 跨端尺寸单位换算：rpx（微信 750 设计宽）在 H5 端转换为视口相对值。
 *
 * 1rpx = 视口宽度 / 750，且视口宽度上限 750px（桌面端不再放大，页面按
 * 750px 基准居中显示，与小程序设计宽一致）。
 */

/** 根 CSS 变量：--cyy-rpx 为 1rpx 的等效长度 */
export const ROOT_RPX_RULE =
  ':root{--cyy-rpx:calc(min(100vw, 750px) / 750);}';

const RPX_PATTERN = /(-?\d+(?:\.\d+)?)rpx/g;

/** 把字符串/数值中的 `N rpx` 替换为 `calc(N * var(--cyy-rpx))` */
export function convertRpx(value: string | number): string {
  return String(value).replace(
    RPX_PATTERN,
    (_match, number: string) => `calc(${number} * var(--cyy-rpx))`
  );
}
