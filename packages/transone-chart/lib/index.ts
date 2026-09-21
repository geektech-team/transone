/**
 * transone-chart：TransOne 跨端图表库。
 *
 * 一份 TypeScript 源码，基于 Canvas 2D 渲染：
 * - Web：HTMLCanvasElement 直接可用
 * - 小程序：微信 / 阿里 / 字节 Canvas 2D 节点
 * - 未来原生 App：实现 ICanvas2D 契约即可接入（见 adapters/native.ts）
 *
 * 一期图表：折线 / 柱状 / 饼图 / 雷达。
 */

// 公共类型与默认主题
export * from './types';

// 核心：跨端 Canvas 契约
export type { ICanvas2D, IGradient } from './core/canvas';
export { isCanvas2DLike } from './core/canvas';
export type {
  CanvasLineCap,
  CanvasLineJoin,
  CanvasTextAlign,
  CanvasTextBaseline,
} from './core/canvas';

// 比例尺
export { LinearScale, CategoryScale, niceTicks } from './core/scale';
export type { LinearScaleOptions, ScaleResult } from './core/scale';

// 布局
export { computeLayout } from './core/layout';
export type { Box, LayoutInput, LayoutResult, Padding } from './core/layout';

// 工具：防抖（自动重绘等高频触发场景）
export { debounce } from './core/debounce';
export type { Debounced } from './core/debounce';

// 图表基类
export { ChartBase } from './core/chart';
export type { CartesianScales } from './core/chart';

// 四种图表
export { LineChart } from './charts/line';
export { BarChart } from './charts/bar';
export { PieChart } from './charts/pie';
export { RadarChart } from './charts/radar';

// 工厂入口
export {
  createChart,
  createWebChart,
  createMiniProgramChart,
} from './factory';

// 适配器
export {
  resolveWebCanvas,
  resolveMiniProgramCanvas,
  getMiniProgramCanvasNode,
  getMiniProgramGlobal,
  detectMiniProgramPixelRatio,
  detectPixelRatio,
  resolveNativeCanvas,
} from './adapters';
export type {
  MiniProgramCanvasNode,
  MiniProgramGlobal,
  NativeCanvasHost,
  ResolveCanvasOptions,
} from './adapters';

// 可选组件集成（依赖 transone）
export { TcChart } from './component';
export type { TcChartProps } from './component';
