import type {
  InterceptorFulfilled,
  InterceptorHandler,
  InterceptorRejected,
} from './types';

/**
 * 拦截器管理器：维护同类型（请求 / 响应）拦截器列表。
 * - use 注册并返回 id，eject 按 id 移除（软删除，保留占位）
 * - forEach 跳过已移除的项
 */
export class InterceptorManager<T> {
  private readonly handlers: Array<InterceptorHandler<T> | null> = [];

  public use(
    onFulfilled?: InterceptorFulfilled<T>,
    onRejected?: InterceptorRejected
  ): number {
    this.handlers.push({ onFulfilled, onRejected });
    return this.handlers.length - 1;
  }

  public eject(id: number): void {
    if (this.handlers[id] !== undefined) {
      this.handlers[id] = null;
    }
  }

  public clear(): void {
    this.handlers.length = 0;
  }

  public forEach(
    fn: (handler: InterceptorHandler<T>, id: number) => void
  ): void {
    this.handlers.forEach((handler, id) => {
      if (handler !== null) {
        fn(handler, id);
      }
    });
  }
}
