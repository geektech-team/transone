/**
 * 可选集成：基于 transone Component 的声明式图表组件 TcChart。
 *
 * 与 transone 组件系统集成，一份源码同时编译 Web 与小程序：
 * - Web：canvas 元素由组件渲染，onMounted 后自动解析并渲染
 * - 小程序：canvas 编译为 <canvas type="2d">，通过 SelectorQuery 获取节点
 * - 未来原生：通过 resolve 注入自定义解析器
 *
 * 组件本身是薄壳：状态由父级以 option 传入（完全受控），
 * 数据变化时自动 setOption + render；
 * 容器 / 窗口尺寸变化时防抖（150ms）自动重绘：
 * - Web：ResizeObserver 观察 canvas，重测 clientWidth/Height 后增量 resize + render
 * - 小程序：平台窗口尺寸回调触发后重建图表（SelectorQuery 取最新节点尺寸）
 */

import {
  Component,
  h,
  type VNode,
} from 'transone';
import type { ChartRenderContext, ChartOption } from './types';
import type { ChartBase } from './core/chart';
import { debounce, type Debounced } from './core/debounce';
import { createChart } from './factory';
import {
  detectMiniProgramGlobal,
  getMiniProgramCanvasNode,
  getMiniProgramGlobal,
  resolveMiniProgramCanvas,
} from './adapters/miniprogram';
import { detectPixelRatio } from './adapters/types';
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

/** 尺寸变化自动重绘的防抖窗口（毫秒）。连续 resize 事件只在此窗口后重绘一次。 */
const RESIZE_DEBOUNCE_MS = 150;

interface MpWindowResizeApi {
  onWindowResize?: (callback: () => void) => unknown;
  offWindowResize?: (callback: () => void) => unknown;
}

export class TcChart extends Component<TcChartProps, TcChartState> {
  private chart: ChartBase<ChartOption> | null = null;
  private destroyed = false;
  private resizeDebounced: Debounced<() => void> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private mpResizeHandler: (() => void) | null = null;
  /** Web 端 hover 事件句柄（mousemove / mouseleave），卸载时移除。 */
  private hoverHandlers: Array<[string, (e: Event) => void]> = [];

  protected initState(): TcChartState {
    return { canvasId: CANVAS_ID };
  }

  protected initStyles(): void {
    this.styleManager.addStyle('tc-chart-host', {
      selector: ':host',
      properties: {
        display: 'block',
        height: '100%',
        width: '100%',
      },
    });
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
    this.setupAutoResize();
    this.setupHoverEvents();
  }

  protected onUpdated(): void {
    if (this.chart && !this.destroyed) {
      this.chart.setOption(this.props.option).render();
    } else if (!this.chart && !this.destroyed) {
      this.attachChart();
    }
  }

  protected onUnmounted(): void {
    this.teardownAutoResize();
    this.teardownHoverEvents();
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

  /**
   * Web 端返回根 canvas；小程序端此方法不会被调用（走 SelectorQuery）。
   * 注意：方法体不能写 super.X() —— transone-cli 编译小程序时会把组件方法拍平为
   * Component options 的普通函数属性，super 在普通函数里非法（JSCore 直接报错）。
   * 基类 el 为 protected，此处直接取用；返回类型收窄在使用点做断言。
   */
  public getElement(): HTMLCanvasElement | null {
    return this.el as HTMLCanvasElement | null;
  }

  /* —— 悬浮提示（tooltip）：Web mousemove / mouseleave —— */

  /** Web 端绑定 hover 事件：鼠标移动命中数据点即显示 tooltip，离开清除。 */
  private setupHoverEvents(): void {
    // 小程序端暂无鼠标事件，一期仅 Web；后续可在 touchstart/touchmove 接入同一 setHover API
    if (detectMiniProgramGlobal()) {
      return;
    }
    if (this.destroyed || this.hoverHandlers.length > 0) {
      return;
    }
    const element = this.getElement() as HTMLCanvasElement | null;
    if (!element || typeof element.addEventListener !== 'function') {
      return;
    }

    const onMove = (event: Event): void => {
      const chart = this.chart;
      if (!chart) {
        return;
      }
      const mouse = event as MouseEvent;
      const rect = element.getBoundingClientRect();
      const relX = mouse.clientX - rect.left;
      const relY = mouse.clientY - rect.top;
      // 同步图表逻辑尺寸，避免 resize 防抖窗口内坐标系偏移导致命中错位
      const w = rect.width;
      const h = rect.height;
      if (w > 0 && h > 0) {
        chart.resize(w, h);
      }
      chart.setHover(relX, relY);
    };
    const onLeave = (): void => {
      this.chart?.clearHover();
    };

    element.addEventListener('mousemove', onMove);
    element.addEventListener('mouseleave', onLeave);
    this.hoverHandlers = [
      ['mousemove', onMove],
      ['mouseleave', onLeave],
    ];
  }

  private teardownHoverEvents(): void {
    const element = this.getElement() as HTMLCanvasElement | null;
    for (const [type, handler] of this.hoverHandlers) {
      element?.removeEventListener(type, handler);
    }
    this.hoverHandlers = [];
  }

  /* —— 自动重绘：容器 / 窗口尺寸变化时防抖重绘 —— */

  private setupAutoResize(): void {
    if (this.destroyed || this.resizeDebounced) {
      return;
    }
    this.resizeDebounced = debounce(() => this.handleResize(), RESIZE_DEBOUNCE_MS);

    const platform = detectMiniProgramGlobal();
    if (platform) {
      // 小程序：各平台均有窗口尺寸回调（横竖屏切换 / 分屏等场景）
      const mp = getMiniProgramGlobal(platform) as MpWindowResizeApi | null;
      if (mp && typeof mp.onWindowResize === 'function') {
        this.mpResizeHandler = () => this.resizeDebounced!.run();
        mp.onWindowResize(this.mpResizeHandler);
      }
      return;
    }

    // Web：ResizeObserver 观察 canvas 自身（CSS 宽高 100%，容器变化即触发）。
    // SSR / 构建期无真实元素与 ResizeObserver，跳过。
    const element = this.getElement() as HTMLCanvasElement | null;
    if (
      element &&
      typeof element.getContext === 'function' &&
      typeof ResizeObserver === 'function'
    ) {
      this.resizeObserver = new ResizeObserver(() => this.resizeDebounced!.run());
      this.resizeObserver.observe(element);
    }
  }

  private teardownAutoResize(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.resizeDebounced?.cancel();
    this.resizeDebounced = null;
    if (this.mpResizeHandler) {
      const platform = detectMiniProgramGlobal();
      const mp = platform
        ? (getMiniProgramGlobal(platform) as MpWindowResizeApi | null)
        : null;
      if (mp && typeof mp.offWindowResize === 'function') {
        mp.offWindowResize(this.mpResizeHandler);
      }
      this.mpResizeHandler = null;
    }
  }

  private handleResize(): void {
    if (this.destroyed) {
      return;
    }
    if (detectMiniProgramGlobal()) {
      // 小程序：窗口尺寸变化后 SelectorQuery 取到的节点尺寸已更新，
      // 重建图表即可拿到最新尺寸（上下文持有节点实测宽高与 pixelRatio）。
      this.chart?.destroy();
      this.chart = null;
      this.attachChart();
      return;
    }
    const element = this.getElement() as HTMLCanvasElement | null;
    if (!element || typeof element.getContext !== 'function') {
      return;
    }
    const width = element.clientWidth || 0;
    const height = element.clientHeight || 0;
    if (width <= 0 || height <= 0) {
      return;
    }
    if (!this.chart) {
      this.attachChart();
      return;
    }
    // 更新物理像素缓冲（逻辑尺寸 × DPR），并增量重绘（保留图表状态）
    const dpr = detectPixelRatio();
    element.width = Math.round(width * dpr);
    element.height = Math.round(height * dpr);
    this.chart.resize(width, height, dpr).render();
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
