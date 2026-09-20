/**
 * 可选集成：基于 transone Component 的声明式图表组件 TcChart。
 *
 * 与 transone 组件系统集成，一份源码同时编译 Web 与小程序：
 * - Web：canvas 元素由组件渲染，onMounted 后自动解析并渲染
 * - 小程序：canvas 编译为 <canvas type="2d">，通过 SelectorQuery 获取节点
 * - 未来原生：通过 resolve 注入自定义解析器
 *
 * 组件本身是薄壳：状态由父级以 option 传入（完全受控），
 * 数据变化时自动 setOption + render。
 */

import {
  Component,
  h,
  type VNode,
} from 'transone';
import type { ChartRenderContext, ChartOption } from './types';
import type { ChartBase } from './core/chart';
import { createChart } from './factory';
import {
  detectMiniProgramGlobal,
  getMiniProgramCanvasNode,
  resolveMiniProgramCanvas,
} from './adapters/miniprogram';
import { resolveWebCanvas } from './adapters/web';

export interface TcChartProps {
  /** 图表配置（line / bar / pie / radar）。 */
  option: ChartOption;
  /** 自定义解析器：把 canvas 元素/节点解析为渲染上下文。 */
  resolve?: (
    element: unknown
  ) => Promise<ChartRenderContext> | ChartRenderContext;
  className?: string;
}

interface TcChartState {
  canvasId: string;
}

/** canvas 元素 id：Web 端仅作 DOM 属性；小程序端配合 SelectorQuery .in(实例) 隔离查询，多实例共存不冲突。 */
const CANVAS_ID = 'tc-chart-canvas';

export class TcChart extends Component<TcChartProps, TcChartState> {
  private chart: ChartBase<ChartOption> | null = null;
  private destroyed = false;

  protected initState(): TcChartState {
    return { canvasId: CANVAS_ID };
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tc-chart-canvas', {
      selector: '.tc-chart__canvas',
      properties: {
        display: 'block',
        height: '100%',
        width: '100%',
      },
    });
  }

  protected render(): VNode {
    return h('canvas', {
      id: this.state.canvasId,
      className: `tc-chart__canvas${this.props.className ? ` ${this.props.className}` : ''}`,
      type: '2d',
    });
  }

  protected onMounted(): void {
    this.attachChart();
  }

  protected onUpdated(): void {
    if (this.chart && !this.destroyed) {
      this.chart.setOption(this.props.option).render();
    } else if (!this.chart && !this.destroyed) {
      this.attachChart();
    }
  }

  protected onUnmounted(): void {
    this.destroyed = true;
    this.chart?.destroy();
    this.chart = null;
  }

  /** 对外暴露图表实例（高级用法：手动 resize / 订阅事件）。 */
  public getChart(): ChartBase<ChartOption> | null {
    return this.chart;
  }

  private attachChart(): void {
    if (this.destroyed) {
      return;
    }
    this.resolveContext()
      .then((context) => {
        if (this.destroyed || !context) {
          // 非浏览器环境（SSR / 构建期静态渲染）或显式跳过：渲染交给客户端水合阶段。
          return;
        }
        this.chart = createChart(context, this.props.option);
        this.chart.render();
      })
      .catch((error: unknown) => {
        console.error('[TcChart] attach failed:', error);
      });
  }

  /** 组件根元素（canvas）。Web 端用于解析渲染上下文；小程序端经 SelectorQuery .in(实例) 查询，不依赖此方法。 */
  public getElement(): HTMLCanvasElement | null {
    return super.getElement() as HTMLCanvasElement | null;
  }

  private resolveContext(): Promise<ChartRenderContext | null> {
    if (this.props.resolve) {
      return Promise.resolve(this.props.resolve(this.getElement()));
    }

    const platform = detectMiniProgramGlobal();
    if (platform) {
      // 小程序：SelectorQuery 查询节点（组件可能尚未渲染完，有限重试）
      const selector = `#${this.state.canvasId}`;
      const attempt = (left: number): Promise<ChartRenderContext> =>
        getMiniProgramCanvasNode({
          platform,
          instance: this,
          selector,
        })
          .then((node) => resolveMiniProgramCanvas(node))
          .catch((error: unknown) => {
            if (left <= 0) {
              throw error;
            }
            return new Promise((resolve) => setTimeout(resolve, 50)).then(() =>
              attempt(left - 1)
            );
          });
      return attempt(5);
    }

    // Web：canvas 元素即 HTMLCanvasElement。SSR / 构建期静态渲染环境下
    // 元素没有真实 2d context（如 projectDom），返回 null 跳过渲染，
    // 由客户端水合阶段（真实浏览器）完成绘制。
    const element = this.getElement() as HTMLCanvasElement | null;
    if (!element || typeof element.getContext !== 'function') {
      return Promise.resolve(null);
    }
    return Promise.resolve(
      resolveWebCanvas(element)
    );
  }
}
