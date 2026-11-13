import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { Component, createComponent, flushSync, type VNode } from '../../index';

let container: HTMLElement;
let root: Component | undefined;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  root?.unmount();
  root = undefined;
  flushSync();
  container.remove();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

class Counter extends Component<object, { count: number }> {
  protected initState() {
    return { count: 0 };
  }
  protected initStyles() {}
  protected render(): VNode {
    return { tag: 'span', children: [String(this.state.count)] };
  }
  wrap<Args extends unknown[], Result>(callback: (...args: Args) => Result) {
    return this.guardCallback(callback);
  }
}

describe('guarded errors through derived promises', () => {
  it('dispatches once when an async guarded callback awaits another guarded callback', async () => {
    const task = deferred<number>();
    const failure = new Error('guarded rejection awaited by an outer callback');
    const captured: unknown[] = [];
    let child!: Counter;
    class Child extends Counter {
      constructor() {
        super();
        child = this;
      }
    }
    class Boundary extends Counter {
      protected override render(): VNode {
        return createComponent(Child);
      }
      protected onErrorCaptured(error: unknown) {
        captured.push(error);
      }
    }
    root = new Boundary();
    root.mount(container);
    const inner = child.wrap(() => task.promise);
    const result = child.wrap(async () => await inner())();
    task.reject(failure);

    await expect(result).rejects.toBe(failure);
    expect(captured).toEqual([failure]);
    expect(child.mounted).toBe(true);
    expect(container.textContent).toBe('0');
  });

  it('dispatches once and cleans up when an async lifecycle awaits a guarded callback', async () => {
    const task = deferred<number>();
    const reported = deferred<void>();
    const failure = new Error('guarded rejection awaited by a lifecycle');
    const captured: unknown[] = [];
    const logged: unknown[] = [];
    let child!: Child;
    let unmounts = 0;
    class Child extends Counter {
      constructor() {
        super();
        child = this;
      }
      protected async onMounted() {
        return await this.wrap(() => task.promise)();
      }
      protected onUnmounted() {
        unmounts++;
      }
    }
    class Boundary extends Counter {
      protected override render(): VNode {
        return {
          tag: 'main',
          children: [
            createComponent(Child),
            { tag: 'b', children: ['sibling'] },
          ],
        };
      }
      protected onErrorCaptured(error: unknown) {
        captured.push(error);
      }
    }
    root = new Boundary();
    const log = spyOn(console, 'error').mockImplementation(
      (...args: unknown[]) => {
        logged.push(args[1]);
        reported.resolve();
      }
    );
    try {
      root.mount(container);
      task.reject(failure);
      await reported.promise;

      expect(captured).toEqual([failure]);
      expect(logged).toEqual([failure]);
      expect(unmounts).toBe(1);
      expect(child.mounted).toBe(false);
      expect(root.mounted).toBe(true);
      expect(container.textContent).toBe('sibling');
    } finally {
      log.mockRestore();
    }
  });
});
