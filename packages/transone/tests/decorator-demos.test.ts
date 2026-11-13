import { afterEach, beforeEach, expect, it } from 'bun:test';
import { DemoToast } from '../../../docs/src/demos/toast';
import { UiDemoPage } from '../../../playground/ui-demo/src/pages/home';
import { flushSync } from '../lib';

const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const timers: Array<{ callback: () => void; cancelled: boolean }> = [];
let toast: DemoToast | undefined;
let page: UiDemoPage | undefined;
let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  globalThis.setTimeout = ((callback: () => void) => {
    timers.push({ callback, cancelled: false });
    return timers.length;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = ((handle: number) => {
    if (timers[handle - 1]) timers[handle - 1].cancelled = true;
  }) as unknown as typeof clearTimeout;
});

afterEach(() => {
  toast?.unmount();
  page?.unmount();
  toast = undefined;
  page = undefined;
  timers.length = 0;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
  flushSync();
  container.remove();
});

it('allows the UI demo input callback to be passed directly without losing its instance', () => {
  page = new UiDemoPage();
  const input = (page as unknown as { handleInput(value: unknown): void })
    .handleInput;
  input('typed');
  expect(page.state.text).toBe('typed');
});

it('keeps a newly shown toast visible when an earlier queued hide callback arrives', () => {
  toast = new DemoToast();
  toast.mount(container);
  const controls = toast as unknown as {
    show(position: 'top' | 'bottom'): void;
  };
  controls.show('top');
  controls.show('bottom');
  flushSync();
  expect(toast.state.visible).toBe(true);
  expect(toast.state.position).toBe('bottom');
  // A cancelled timer may already have reached the host queue.
  timers[0].callback();
  flushSync();
  expect(toast.state.visible).toBe(true);
  timers[1].callback();
  flushSync();
  expect(toast.state.visible).toBe(false);
  expect(timers[0].cancelled).toBe(true);
});
