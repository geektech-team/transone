/**
 * 跨端 Canvas 2D 契约（ICanvas2D）。
 *
 * 这是 transone-chart 与平台解耦的唯一边界：
 * - Web：HTMLCanvasElement.getContext('2d') 天然满足，适配器薄封装
 * - 小程序：微信 / 阿里 / 字节的 Canvas 2D（type="2d"）节点上下文与 Web 接口基本对齐
 * - 未来原生 App：Skia / ArkUI 等原生 canvas 只需实现本接口即可接入同一套引擎
 *
 * 接口刻意收敛为图表实际需要的最小真子集，避免依赖平台各自的扩展 API；
 * 绘制一律使用「beginPath → 路径命令 → fill()/stroke() 无参」形式，
 * 不依赖 Path2D 等小程序端可能缺失的高级对象。
 */

export interface IGradient {
  addColorStop(offset: number, color: string): void;
}

export type CanvasLineCap = 'butt' | 'round' | 'square';
export type CanvasLineJoin = 'bevel' | 'round' | 'miter';
export type CanvasTextAlign =
  | 'left'
  | 'right'
  | 'center'
  | 'start'
  | 'end';
export type CanvasTextBaseline =
  | 'top'
  | 'hanging'
  | 'middle'
  | 'alphabetic'
  | 'ideographic'
  | 'bottom';

export interface ICanvas2D {
  /* —— 状态管理 —— */
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(angle: number): void;

  /* —— 样式属性 —— */
  fillStyle: string | IGradient;
  strokeStyle: string | IGradient;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;

  /* —— 路径 —— */
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number
  ): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean
  ): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  rect(x: number, y: number, width: number, height: number): void;
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean
  ): void;

  /* —— 绘制 —— */
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  clip(): void;
  setLineDash(segments: readonly number[]): void;

  /* —— 渐变 —— */
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): IGradient;
  createRadialGradient(
    x0: number,
    y0: number,
    r0: number,
    x1: number,
    y1: number,
    r1: number
  ): IGradient;

  /* —— 文字 —— */
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText(text: string): { width: number };
}

/**
 * ICanvas2D 的便捷判断：任意对象只要实现了最小方法集即视为满足契约。
 * 用于适配器防御与测试 mock 的类型断言，不承担运行时校验。
 */
export function isCanvas2DLike(value: unknown): value is ICanvas2D {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ICanvas2D).save === 'function' &&
    typeof (value as ICanvas2D).beginPath === 'function' &&
    typeof (value as ICanvas2D).fill === 'function' &&
    typeof (value as ICanvas2D).stroke === 'function' &&
    typeof (value as ICanvas2D).fillText === 'function'
  );
}
