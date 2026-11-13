import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { flushSync } from 'transone';
import { TuPopup } from '../lib/components/Popup';

let container: HTMLElement;
let popup: TuPopup;
const timers: Array<() => void> = [];
const setTimer = globalThis.setTimeout;
const clearTimer = globalThis.clearTimeout;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  timers.length = 0;
  globalThis.setTimeout = ((callback: () => void) => {
    timers.push(callback);
    return timers.length;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = (() => {}) as typeof clearTimeout;
});
afterEach(() => {
  popup?.unmount();
  flushSync();
  container.remove();
  globalThis.setTimeout = setTimer;
  globalThis.clearTimeout = clearTimer;
});

describe('Popup asynchronous transition scopes', () => {
  for (const legacy of [false, true]) {
    it(`rejects an old transition after remount${legacy ? ' with an older core peer' : ''}`, () => {
      popup = new TuPopup({ visible: true, position: 'bottom' });
      if (legacy)
        Object.defineProperty(popup, 'guardCallback', { value: undefined });
      popup.mount(container);
      flushSync();
      popup.setProps({ position: 'right' });
      expect(() => flushSync()).not.toThrow();
      const old = timers[0];
      expect(old).toBeDefined();
      popup.unmount();
      popup.setProps({ position: 'left' });
      popup.mount(container);
      flushSync();
      expect(timers).toHaveLength(2);
      const root = () => container.querySelector('.tu-popup') as HTMLElement;
      expect(root().classList.contains('tu-popup--visible')).toBe(false);
      old();
      flushSync();
      expect(root().classList.contains('tu-popup--visible')).toBe(false);
      timers[1]();
      flushSync();
      expect(root().classList.contains('tu-popup--visible')).toBe(true);
      expect(root().classList.contains('tu-popup--left')).toBe(true);
    });
  }

  it('does not keep a cancelled transition pending when remounted in the same direction', () => {
    popup = new TuPopup({ visible: true, position: 'bottom' });
    popup.mount(container);
    flushSync();
    popup.setProps({ position: 'right' });
    flushSync();
    popup.unmount();
    popup.mount(container);
    flushSync();
    expect(
      container
        .querySelector('.tu-popup')
        ?.classList.contains('tu-popup--visible')
    ).toBe(true);
  });
});
