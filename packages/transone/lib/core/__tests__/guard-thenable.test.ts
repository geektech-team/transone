import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Component, createComponent, flushSync, type VNode } from '../../index';

let container: HTMLElement;
const instances: Component[] = [];
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  for (const instance of instances.splice(0).reverse()) instance.unmount();
  flushSync();
  container.remove();
});

class Counter extends Component<object, { count: number }> {
  protected initState() {
    return { count: 7 };
  }
  protected initStyles() {}
  protected render(): VNode {
    return { tag: 'span', children: [String(this.state.count)] };
  }
  wrap<Args extends unknown[], Result>(callback: (...args: Args) => Result) {
    return this.guardCallback(callback);
  }
}

describe('guardCallback thenable results', () => {
  it('does not redispatch a guarded child mount failure while its ancestors also unwind', () => {
    const failure = new Error('descendant mount failed');
    const captured: Array<[string, unknown]> = [];
    class Child extends Counter {
      protected onMounted() {
        this.wrap(() => {
          throw failure;
        })();
      }
    }
    class Parent extends Counter {
      protected render(): VNode {
        return createComponent(Child);
      }
      protected onErrorCaptured(error: unknown) {
        captured.push(['parent', error]);
      }
    }
    class Grandparent extends Counter {
      protected render(): VNode {
        return createComponent(Parent);
      }
      protected onErrorCaptured(error: unknown) {
        captured.push(['grandparent', error]);
      }
    }
    const instance = new Grandparent();
    instances.push(instance);
    expect(() => instance.mountToNode()).toThrow(failure);
    expect(captured).toEqual([
      ['parent', failure],
      ['grandparent', failure],
    ]);
    expect(instance.mounted).toBe(false);
    expect(container.textContent).toBe('');
  });

  it('normalizes Promise subclasses whose species creates a non-Promise capability', async () => {
    class ForeignCapability {
      constructor(executor: (resolve: () => void, reject: () => void) => void) {
        executor(
          () => {},
          () => {}
        );
      }
    }
    class Subclass extends Promise<number> {
      static get [Symbol.species](): PromiseConstructor {
        return ForeignCapability as unknown as PromiseConstructor;
      }
    }
    const instance = new Counter();
    instances.push(instance);
    const result = instance.wrap(
      () => new Subclass((resolve) => resolve(12))
    )();
    expect(result).toBeInstanceOf(Promise);
    expect(await result).toBe(12);
  });

  it('keeps an incompatible native then receiver failure asynchronous', async () => {
    const instance = new Counter();
    instances.push(instance);
    for (const value of [
      { then: Promise.prototype.then },
      new Proxy(Promise.resolve(7), {}),
    ]) {
      let result: unknown;
      expect(() => {
        result = instance.wrap(() => value)();
      }).not.toThrow();
      await expect(result).rejects.toBeInstanceOf(TypeError);
    }
  });

  it('reads a thenable getter once and retains its receiver and first settlement', async () => {
    const instance = new Counter();
    instances.push(instance);
    instance.mount(container);
    let reads = 0;
    let calls = 0;
    const thenable = {
      value: 12,
      get then() {
        reads++;
        if (reads > 1) throw new Error('then getter read twice');
        return function (
          this: { value: number },
          resolve: (value: number) => void,
          reject: (error: unknown) => void
        ) {
          calls++;
          resolve(this.value);
          reject(new Error('ignored second settlement'));
          throw new Error('ignored throw after settlement');
        };
      },
    };
    const result = instance.wrap(
      () => thenable as unknown as PromiseLike<number>
    )();
    expect(calls).toBe(0);
    expect(await result).toBe(12);
    expect(reads).toBe(1);
    expect(calls).toBe(1);
  });

  it('keeps a non-callable then result synchronous without rereading its getter', () => {
    const instance = new Counter();
    instances.push(instance);
    let reads = 0;
    const result = {
      get then() {
        reads++;
        return 42;
      },
    };
    expect(instance.wrap(() => result)()).toBe(result);
    expect(reads).toBe(1);
  });

  it('routes the original throwing then getter through the active boundary once', () => {
    const failure = new Error('then getter failed');
    const errors: unknown[] = [];
    class Boundary extends Counter {
      protected onErrorCaptured(error: unknown) {
        errors.push(error);
        return false;
      }
    }
    const boundary = new Boundary();
    const child = new Counter();
    instances.push(boundary, child);
    child.setParentComponent(boundary);
    const result = {
      get then(): never {
        throw failure;
      },
    };
    expect(child.wrap(() => result)()).toBeUndefined();
    expect(errors).toEqual([failure]);
  });

  it('discards a thenable result whose getter synchronously remounts its component', async () => {
    const instance = new Counter();
    instances.push(instance);
    instance.mount(container);
    let reads = 0;
    const result = {
      get then() {
        reads++;
        instance.unmount();
        instance.mount(container);
        return (resolve: (value: number) => void) => resolve(99);
      },
    };
    const pending = instance.wrap(
      () => result as unknown as PromiseLike<number>
    )();
    expect(await pending).toBeUndefined();
    expect(reads).toBe(1);
    instance.wrap(() => instance.setState({ count: 8 }))();
    flushSync();
    expect(container.textContent).toBe('8');
  });
});
