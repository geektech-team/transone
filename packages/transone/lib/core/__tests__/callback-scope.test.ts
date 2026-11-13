import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Component, flushSync, reactive, type VNode } from '../../index';

let container: HTMLElement;
const instances: Component[] = [];
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  for (const instance of instances.splice(0)) instance.unmount();
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
  void promise.catch(() => {});
  return { promise, resolve, reject };
}

class Example extends Component<object, { count: number }> {
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
  fire(value: number) {
    this.emit('value', value);
  }
}

describe('component callback scopes', () => {
  it('rejects a non-function before creating a scoped callback', () => {
    const instance = new Example();
    instances.push(instance);
    expect(() => instance.wrap(3 as unknown as () => void)).toThrow(TypeError);
  });
  it('preserves the original error when a boundary rethrows that same error', () => {
    const failure = new Error('same error');
    class Rethrowing extends Example {
      protected onErrorCaptured(error: unknown): never {
        throw error;
      }
    }
    const boundary = new Rethrowing();
    instances.push(boundary);
    const instance = new Example();
    instances.push(instance);
    instance.setParentComponent(boundary);
    const callback = instance.wrap(() => {
      throw failure;
    });
    let caught: unknown;
    try {
      callback();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(failure);
  });
  it('does not let an old continuation target a replacement instance through a mutable reference', () => {
    let current = new Example();
    instances.push(current);
    current.mount(container);
    const old = current.wrap(() => {
      current.setState({ count: 99 });
    });
    current.unmount();
    current = new Example();
    instances.push(current);
    current.mount(container);
    old();
    flushSync();
    expect(current.state.count).toBe(7);
    expect(container.textContent).toBe('7');
  });

  it('invalidates callbacks from a failed lazy state initializer before explicit recovery', () => {
    let old: (() => unknown) | undefined;
    class FailingState extends Example {
      protected override initState(): { count: number } {
        old = this.wrap(() => {
          this.setState({ count: 99 });
        });
        throw new Error('initial state failed');
      }
    }
    const instance = new FailingState();
    instances.push(instance);
    expect(() => instance.state).toThrow('initial state failed');
    instance.state = reactive({ count: 3 });
    instance.mount(container);
    old!();
    expect(instance.state.count).toBe(3);
    instance.wrap(() => {
      instance.setState({ count: 4 });
    })();
    flushSync();
    expect(container.textContent).toBe('4');
  });
  it('keeps a pre-mount callback valid for its first mount and rejects it after remount', () => {
    const instance = new Example();
    instances.push(instance);
    const apply = instance.wrap((count: number) => {
      instance.setState({ count });
      return count;
    });
    instance.mount(container);
    expect(apply(8)).toBe(8);
    flushSync();
    expect(container.textContent).toBe('8');
    instance.unmount();
    instance.mount(container);
    expect(apply(99)).toBeUndefined();
    flushSync();
    expect(instance.state.count).toBe(8);
    const current = instance.wrap((count: number) => {
      instance.setState({ count });
    });
    current(9);
    flushSync();
    expect(container.textContent).toBe('9');
  });

  it('blocks a late promise continuation from committing state into a new mount', async () => {
    const instance = new Example();
    instances.push(instance);
    instance.mount(container);
    const old = deferred<number>();
    const pending = old.promise.then(
      instance.wrap((count: number) => {
        instance.setState({ count });
      })
    );
    instance.unmount();
    instance.mount(container);
    old.resolve(99);
    await pending;
    flushSync();
    expect(instance.state.count).toBe(7);
    const fresh = deferred<number>();
    const applied = fresh.promise.then(
      instance.wrap((count: number) => {
        instance.setState({ count });
      })
    );
    fresh.resolve(10);
    await applied;
    flushSync();
    expect(container.textContent).toBe('10');
  });

  it('invalidates callbacks created by a failed mount while allowing a clean remount', () => {
    let fail = true;
    const callbacks: Array<(count: number) => unknown> = [];
    class Failing extends Example {
      protected override initStyles() {
        callbacks.push(
          this.wrap((count: number) => {
            this.setState({ count });
          })
        );
        if (fail) throw new Error('styles failed');
      }
    }
    const instance = new Failing();
    instances.push(instance);
    expect(() => instance.mountToNode()).toThrow('styles failed');
    fail = false;
    instance.mount(container);
    callbacks[0](99);
    expect(instance.state.count).toBe(7);
    callbacks[1](9);
    flushSync();
    expect(container.textContent).toBe('9');
  });

  it('preserves callback receiver, arguments and active return values', () => {
    const instance = new Example();
    instances.push(instance);
    const callback = instance.wrap(function (
      this: { prefix: string },
      value: number
    ) {
      return `${this.prefix}${value}`;
    });
    expect(callback.call({ prefix: 'value:' }, 2)).toBe('value:2');
    instance.unmount();
    expect(callback.call({ prefix: 'stale:' }, 3)).toBeUndefined();
  });

  it('ignores a stale promise rejection and preserves an active unhandled rejection', async () => {
    const instance = new Example();
    instances.push(instance);
    instance.mount(container);
    const stale = deferred<number>();
    const old = instance.wrap(() => stale.promise)();
    instance.unmount();
    instance.mount(container);
    stale.reject(new Error('old callback'));
    expect(await old).toBeUndefined();
    const failure = new Error('active callback');
    const current = deferred<number>();
    const result = instance.wrap(() => current.promise)();
    current.reject(failure);
    await expect(result).rejects.toBe(failure);
  });

  it('does not let an old unsubscribe remove a new mount subscription', () => {
    const instance = new Example();
    instances.push(instance);
    const listener = (value: unknown) => {
      instance.setState({ count: value as number });
    };
    const oldUnsubscribe = instance.on('value', listener);
    instance.mount(container);
    instance.unmount();
    instance.mount(container);
    instance.on('value', listener);
    oldUnsubscribe();
    instance.fire(9);
    flushSync();
    expect(container.textContent).toBe('9');
  });
});
