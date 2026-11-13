import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { TcChart } from '../lib/component';
import type { ChartRenderContext } from '../lib/types';
import { MockCanvas } from './mock-canvas';

const originalResizeObserver = globalThis.ResizeObserver;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const originalHosts = new Map(
  ['wx', 'my', 'tt'].map((key) => [key, Reflect.get(globalThis, key)])
);
const components: TcChart[] = [];
let container: HTMLElement;

beforeEach(() => {
  for (const key of originalHosts.keys())
    Reflect.deleteProperty(globalThis, key);
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  for (const component of components.splice(0)) component.unmount();
  container.remove();
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  for (const [key, value] of originalHosts) {
    if (value === undefined) Reflect.deleteProperty(globalThis, key);
    else Reflect.set(globalThis, key, value);
  }
});

function deferred() {
  let resolve!: (value: ChartRenderContext) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<ChartRenderContext>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function drain() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
function context(canvas: MockCanvas, width = 400): ChartRenderContext {
  return { ctx: canvas, width, height: 300, dpr: 1 };
}

// The lightweight DOM does not implement the native canvas geometry API.
class SizedChart extends TcChart {
  public override getElement(): HTMLCanvasElement | null {
    const element = super.getElement();
    if (element && typeof element.getContext !== 'function') {
      Object.defineProperties(element, {
        getContext: { value: () => null },
        clientWidth: { value: 400 },
        clientHeight: { value: 300 },
      });
    }
    return element;
  }
}

describe('TcChart asynchronous mount scopes', () => {
  for (const outcome of ['resolve', 'reject'] as const) {
    for (const legacy of [false, true])
      it(`recreates the chart after remount and ignores an old context ${outcome}${legacy ? ' without core guardCallback' : ''}`, async () => {
        const pending: ReturnType<typeof deferred>[] = [];
        const component = new SizedChart({
          option: {
            type: 'line',
            xAxis: { labels: ['A'] },
            series: [{ data: [1] }],
          },
          resolve: () => {
            const next = deferred();
            pending.push(next);
            return next.promise;
          },
        });
        if (legacy)
          Object.defineProperty(component, 'guardCallback', {
            value: undefined,
          });
        components.push(component);
        const oldCanvas = new MockCanvas(),
          currentCanvas = new MockCanvas();
        component.mount(container);
        const oldElement = component.getElement();
        component.unmount();
        component.mount(container);
        expect(component.getElement()).not.toBe(oldElement);
        expect(pending).toHaveLength(2);
        pending[1].resolve(context(currentCanvas, 600));
        await drain();
        const current = component.getChart();
        expect(current).not.toBeNull();
        const errorLog = spyOn(console, 'error').mockImplementation(() => {});
        try {
          if (outcome === 'resolve') pending[0].resolve(context(oldCanvas));
          else pending[0].reject(new Error('obsolete canvas'));
          await drain();
          expect(component.getChart()).toBe(current);
          expect(oldCanvas.commands).toEqual([]);
          expect(currentCanvas.of('clearRect').map((args) => args[2])).toEqual([
            600,
          ]);
          expect(errorLog).not.toHaveBeenCalled();
        } finally {
          errorLog.mockRestore();
        }
      });
  }

  for (const legacy of [false, true])
    it(`releases old hover listeners and ignores old resize and retained hover callbacks${legacy ? ' without core guardCallback' : ''}`, async () => {
      const observers: Array<{
        callback: ResizeObserverCallback;
        disconnected: boolean;
      }> = [];
      globalThis.ResizeObserver = class {
        private callback: ResizeObserverCallback;
        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
          observers.push({ callback, disconnected: false });
        }
        observe() {}
        unobserve() {}
        disconnect() {
          observers.find(
            (item) => item.callback === this.callback
          )!.disconnected = true;
        }
      } as unknown as typeof ResizeObserver;
      const timers: Array<() => void> = [];
      globalThis.setTimeout = ((callback: () => void) => {
        timers.push(callback);
        return timers.length;
      }) as unknown as typeof setTimeout;
      globalThis.clearTimeout = (() => {}) as typeof clearTimeout;
      const canvas = new MockCanvas();
      const component = new SizedChart({
        option: {
          type: 'line',
          xAxis: { labels: ['A'] },
          series: [{ data: [1] }],
        },
        resolve: () => context(canvas),
      });
      if (legacy)
        Object.defineProperty(component, 'guardCallback', { value: undefined });
      components.push(component);
      component.mount(container);
      await drain();
      const oldElement = component.getElement()! as HTMLCanvasElement & {
        getListeners(type: string): Array<{ listener: (event: Event) => void }>;
      };
      const oldHover = oldElement.getListeners('mouseleave')[0].listener;
      component.unmount();
      expect(oldElement.getListeners('mousemove')).toHaveLength(0);
      expect(oldElement.getListeners('mouseleave')).toHaveLength(0);
      expect(observers[0].disconnected).toBe(true);
      component.mount(container);
      await drain();
      expect(observers).toHaveLength(2);
      canvas.clear();
      oldHover.call(oldElement, new Event('mouseleave'));
      observers[0].callback([], {} as ResizeObserver);
      for (const timer of timers.splice(0)) timer();
      expect(canvas.commands).toEqual([]);
      component.getElement()!.dispatchEvent(new Event('mouseleave'));
      expect(canvas.of('clearRect')).toHaveLength(1);
      canvas.clear();
      observers[1].callback([], {} as ResizeObserver);
      for (const timer of timers.splice(0)) timer();
      expect(canvas.of('clearRect')).toHaveLength(1);
    });
});
