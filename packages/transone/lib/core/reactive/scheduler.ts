import type { ReactiveEffect } from './types';

/**
 * 响应式 effect 批处理调度器。
 *
 * 同一批同步状态变更（同一个任务内的多次 mutation）只会触发一次 effect
 * 运行：effect 被 enqueue 后去重入队，并在微任务中统一冲刷（flush）。
 * 冲刷期间的重复入队会在同一轮循环中继续处理，直到队列清空。
 *
 * 组件渲染通过该调度器合并更新：连续修改 state 不会逐次重渲染，
 * 与 Vue 微任务调度 / React 自动批处理的语义一致。
 */
export class ReactiveScheduler {
  private readonly pending = new Set<ReactiveEffect>();
  private flushing = false;
  private flushPromise: Promise<void> | null = null;
  private flushResolve: (() => void) | null = null;

  /**
   * 将 effect 加入待冲刷队列（去重）。
   */
  public enqueue(effect: ReactiveEffect): void {
    if (this.pending.has(effect)) {
      return;
    }
    this.pending.add(effect);
    if (!this.flushing) {
      queueMicrotask(() => this.flush());
    }
  }

  /**
   * 同步冲刷队列：立即执行所有待运行的 effect。
   * 若当前正处于一次冲刷中（例如在 effect 内部调用），则直接返回，
   * 由正在进行的冲刷循环负责处理新增任务。
   */
  public flush(): void {
    if (this.flushing) {
      return;
    }
    this.flushing = true;
    try {
      while (this.pending.size > 0) {
        const batch = Array.from(this.pending);
        this.pending.clear();
        for (const effect of batch) {
          if (effect.active) {
            effect();
          }
        }
      }
    } finally {
      this.flushing = false;
      const resolve = this.flushResolve;
      this.flushResolve = null;
      this.flushPromise = null;
      resolve?.();
    }
  }

  /**
   * 返回一个在待冲刷的 effect 全部执行完成后 resolve 的 Promise。
   * 若当前没有待冲刷任务，立即 resolve。
   */
  public nextTick(): Promise<void> {
    if (!this.flushing && this.pending.size === 0) {
      return Promise.resolve();
    }
    if (this.flushPromise) {
      return this.flushPromise;
    }
    this.flushPromise = new Promise<void>((resolve) => {
      this.flushResolve = resolve;
    });
    return this.flushPromise;
  }
}
