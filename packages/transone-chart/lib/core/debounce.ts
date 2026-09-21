/**
 * 零依赖防抖工具。
 *
 * 用于高频触发场景（如窗口 / 容器尺寸变化）的合并调度：
 * 连续调用只会在停止触发 delay 毫秒后执行一次。
 */

export interface Debounced<T extends (...args: never[]) => unknown> {
  /** 触发一次；若已有待执行调用则重置计时器（合并连续触发）。 */
  run: (...args: Parameters<T>) => void;
  /** 取消尚未执行的调用。 */
  cancel: () => void;
  /** 是否已有待执行的调用。 */
  pending: () => boolean;
}

type AnyFunction = (...args: any[]) => unknown;

export function debounce<T extends AnyFunction>(
  fn: T,
  delay: number
): Debounced<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  return {
    run(...args: Parameters<T>): void {
      lastArgs = args;
      if (timer !== null) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = null;
        if (lastArgs !== null) {
          const runArgs = lastArgs;
          lastArgs = null;
          fn(...runArgs);
        }
      }, delay);
    },
    cancel(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      lastArgs = null;
    },
    pending(): boolean {
      return timer !== null;
    },
  };
}
