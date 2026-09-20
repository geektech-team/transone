/**
 * 图表工厂：按 option.type 分发到具体图表策略类（策略模式入口）。
 *
 * 用法（Web）：
 *   const chart = createWebChart(canvasEl, { type: 'line', ... });
 *   chart.render();
 *
 * 用法（小程序，页面 onReady 后）：
 *   const node = await getMiniProgramCanvasNode({ selector: '#chart' });
 *   const chart = createMiniProgramChart(node, option);
 *   chart.render();
 */

import type { ChartOption, ChartRenderContext } from './types';
import type { ChartBase } from './core/chart';
import { LineChart } from './charts/line';
import { BarChart } from './charts/bar';
import { PieChart } from './charts/pie';
import { RadarChart } from './charts/radar';
import { resolveMiniProgramCanvas } from './adapters/miniprogram';
import type { MiniProgramCanvasNode } from './adapters/miniprogram';
import { resolveWebCanvas } from './adapters/web';
import type { ResolveCanvasOptions } from './adapters/types';

/** 按类型创建图表实例（引擎核心入口）。 */
export function createChart<T extends ChartOption>(
  context: ChartRenderContext,
  option: T
): ChartBase<T> {
  switch (option.type) {
    case 'line':
      return new LineChart(context, option) as unknown as ChartBase<T>;
    case 'bar':
      return new BarChart(context, option) as unknown as ChartBase<T>;
    case 'pie':
      return new PieChart(context, option) as unknown as ChartBase<T>;
    case 'radar':
      return new RadarChart(context, option) as unknown as ChartBase<T>;
    default:
      throw new Error(
        `createChart: unsupported chart type "${(option as ChartOption).type}"`
      );
  }
}

/** Web 便捷入口：从 HTMLCanvasElement 直接创建并渲染。 */
export function createWebChart<T extends ChartOption>(
  canvas: HTMLCanvasElement,
  option: T,
  resolveOptions: ResolveCanvasOptions = {}
): ChartBase<T> {
  return createChart(resolveWebCanvas(canvas, resolveOptions), option);
}

/** 小程序便捷入口：从 Canvas 2D 节点直接创建并渲染。 */
export function createMiniProgramChart<T extends ChartOption>(
  node: MiniProgramCanvasNode,
  option: T,
  resolveOptions: ResolveCanvasOptions = {}
): ChartBase<T> {
  return createChart(resolveMiniProgramCanvas(node, resolveOptions), option);
}
