import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { Component, createComponent, flushSync, type VNode } from '../../index';

let container: HTMLElement;
const roots: Component[] = [];

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  for (const root of roots.splice(0).reverse()) root.unmount();
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

describe('guarded callback recovery edges', () => {
  it('dispatches an explicitly guarded DOM listener error once through each parent boundary', () => {
    const failure = new Error('guarded DOM failure');
    const captured: Array<[string, unknown]> = [];
    class Child extends Counter {
      protected override render(): VNode {
        return {
          tag: 'button',
          props: {
            onClick: this.wrap(() => {
              throw failure;
            }),
          },
          children: ['click'],
        };
      }
    }
    class Inner extends Counter {
      protected override render(): VNode {
        return createComponent(Child);
      }
      protected onErrorCaptured(error: unknown) {
        captured.push(['inner', error]);
        return true;
      }
    }
    class Outer extends Counter {
      protected override render(): VNode {
        return createComponent(Inner);
      }
      protected onErrorCaptured(error: unknown) {
        captured.push(['outer', error]);
      }
    }
    const root = new Outer();
    roots.push(root);
    root.mount(container);

    expect(() =>
      container.querySelector('button')!.dispatchEvent(new Event('click'))
    ).toThrow(failure);
    expect(captured).toEqual([
      ['inner', failure],
      ['outer', failure],
    ]);
    expect(root.mounted).toBe(true);
    expect(container.textContent).toBe('click');
  });

  it('dispatches a nested guarded promise rejection once through each parent boundary', async () => {
    const task = deferred<number>();
    const failure = new Error('nested guarded promise failure');
    const captured: Array<[string, unknown]> = [];
    let child!: Counter;
    class Child extends Counter {
      constructor() {
        super();
        child = this;
      }
    }
    class Inner extends Counter {
      protected override render(): VNode {
        return createComponent(Child);
      }
      protected onErrorCaptured(error: unknown) {
        captured.push(['inner', error]);
      }
    }
    class Outer extends Counter {
      protected override render(): VNode {
        return createComponent(Inner);
      }
      protected onErrorCaptured(error: unknown) {
        captured.push(['outer', error]);
      }
    }
    const root = new Outer();
    roots.push(root);
    root.mount(container);
    const inner = child.wrap(() => task.promise);
    const result = child.wrap(() => inner())();
    task.reject(failure);

    await expect(result).rejects.toBe(failure);
    expect(captured).toEqual([
      ['inner', failure],
      ['outer', failure],
    ]);
    expect(child.mounted).toBe(true);
    expect(container.textContent).toBe('0');
  });

  it('cleans a failed guarded lifecycle once after dispatching its error once', async () => {
    const task = deferred<void>();
    const reported = deferred<void>();
    const failure = new Error('guarded lifecycle failure');
    const captured: unknown[] = [];
    const logged: unknown[] = [];
    let child!: Child;
    let unmounts = 0;
    class Child extends Counter {
      constructor() {
        super();
        child = this;
      }
      protected onMounted() {
        return this.wrap(() => task.promise)();
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
    const root = new Boundary();
    roots.push(root);
    const log = spyOn(console, 'error').mockImplementation(
      (...args: unknown[]) => {
        logged.push(args[1]);
        reported.resolve();
      }
    );
    try {
      root.mount(container);
      const stale = child.wrap(() => {
        child.setState({ count: 99 });
      });
      task.reject(failure);
      await reported.promise;

      expect(captured).toEqual([failure]);
      expect(logged).toEqual([failure]);
      expect(unmounts).toBe(1);
      expect(child.mounted).toBe(false);
      expect(root.mounted).toBe(true);
      expect(container.textContent).toBe('sibling');
      expect(stale()).toBeUndefined();
      expect(child.state.count).toBe(0);
    } finally {
      log.mockRestore();
    }
  });

  it('keeps timer-to-promise commits scoped across consecutive boundary recoveries', async () => {
    const failures: unknown[] = [];
    const pending: Array<ReturnType<typeof deferred<number>>> = [];
    const completions: Promise<unknown>[] = [];
    let child!: Child;
    let sibling!: Sibling;
    let siblingMounts = 0;
    class Child extends Counter {
      constructor() {
        super();
        child = this;
      }
      start(task: ReturnType<typeof deferred<number>>) {
        const started = deferred<void>();
        const completed = deferred<void>();
        const timer = setTimeout(
          this.wrap(() => {
            started.resolve();
            void task.promise
              .then(
                this.wrap((count: number) => {
                  child.setState({ count });
                })
              )
              .then(() => completed.resolve(), completed.reject);
          }),
          0
        );
        this.onDispose(() => clearTimeout(timer));
        return { started: started.promise, completed: completed.promise };
      }
      fail(error: unknown) {
        return this.wrap(() => {
          throw error;
        })();
      }
    }
    class Sibling extends Counter {
      constructor() {
        super();
        sibling = this;
      }
      protected onMounted() {
        siblingMounts++;
      }
    }
    class Boundary extends Component<object, { failed: boolean }> {
      protected initState() {
        return { failed: false };
      }
      protected initStyles() {}
      protected render(): VNode {
        return {
          tag: 'main',
          children: [
            this.state.failed
              ? { tag: 'aside', children: ['fallback'] }
              : createComponent(Child),
            createComponent(Sibling),
          ],
        };
      }
      protected onErrorCaptured(error: unknown) {
        failures.push(error);
        this.setState({ failed: true });
        return false;
      }
      recover() {
        this.setState({ failed: false });
      }
    }
    const root = new Boundary();
    roots.push(root);
    root.mount(container);
    const originalSibling = sibling;
    originalSibling.setState({ count: 7 });
    flushSync();

    const expectedFailures = [
      new Error('first failure'),
      new Error('second failure'),
      new Error('third failure'),
    ];
    for (const failure of expectedFailures) {
      const oldChild = child;
      const task = deferred<number>();
      const timer = oldChild.start(task);
      pending.push(task);
      completions.push(timer.completed);
      await timer.started;
      oldChild.fail(failure);
      flushSync();
      expect(container.textContent).toBe('fallback7');
      expect(oldChild.mounted).toBe(false);
      root.recover();
      flushSync();
      expect(child).not.toBe(oldChild);
      expect(container.textContent).toBe('07');
    }

    pending[2].resolve(93);
    pending[0].resolve(91);
    pending[1].resolve(92);
    await Promise.all(completions);
    flushSync();
    expect(child.state.count).toBe(0);
    expect(container.textContent).toBe('07');
    expect(failures).toEqual(expectedFailures);
    expect(sibling).toBe(originalSibling);
    expect(siblingMounts).toBe(1);
    expect(originalSibling.mounted).toBe(true);

    const fresh = deferred<number>();
    const timer = child.start(fresh);
    await timer.started;
    fresh.resolve(8);
    await timer.completed;
    flushSync();
    expect(container.textContent).toBe('87');
  });

  it('does not revive timer-to-promise commits after repeated mounts of the same instance', async () => {
    const instance = new Counter();
    roots.push(instance);
    instance.mount(container);
    const completions: Promise<unknown>[] = [];
    const tasks: Array<ReturnType<typeof deferred<number>>> = [];

    for (let cycle = 0; cycle < 3; cycle++) {
      const task = deferred<number>();
      const started = deferred<void>();
      const finished = deferred<void>();
      const commit = instance.wrap((count: number) => {
        instance.setState({ count });
      });
      setTimeout(() => {
        started.resolve();
        void task.promise.then(commit).then(finished.resolve, finished.reject);
      }, 0);
      tasks.push(task);
      completions.push(finished.promise);
      await started.promise;
      instance.unmount();
      instance.mount(container);
    }

    tasks[2].resolve(93);
    tasks[0].resolve(91);
    tasks[1].resolve(92);
    await Promise.all(completions);
    flushSync();
    expect(instance.state.count).toBe(0);
    expect(container.textContent).toBe('0');
    instance.wrap(() => instance.setState({ count: 8 }))();
    flushSync();
    expect(container.textContent).toBe('8');
  });

  for (const failure of [new Error('reused failure'), 'reused primitive']) {
    it(`dispatches independent callbacks separately when they reuse ${typeof failure === 'string' ? 'a primitive' : 'an Error'}`, async () => {
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
      const root = new Boundary();
      roots.push(root);
      root.mount(container);
      const callback = child.wrap(() => {
        throw failure;
      });
      expect(callback).toThrow(failure);
      expect(callback).toThrow(failure);

      const first = deferred<void>();
      const second = deferred<void>();
      const firstResult = child.wrap(() => first.promise)();
      const secondResult = child.wrap(() => second.promise)();
      const observed = Promise.all([
        Promise.resolve(firstResult).catch((error) => error),
        Promise.resolve(secondResult).catch((error) => error),
      ]);
      first.reject(failure);
      second.reject(failure);
      expect(await observed).toEqual([failure, failure]);
      expect(captured).toEqual([failure, failure, failure, failure]);
    });
  }

  for (const asynchronous of [false, true]) {
    it(`retains one original and boundary failure when nested guards propagate ${asynchronous ? 'a rejection' : 'a throw'}`, async () => {
      const failure = new Error('original callback failure');
      const boundaryFailure = new Error('boundary failure');
      const captured: unknown[] = [];
      const task = deferred<void>();
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
        protected onErrorCaptured(error: unknown): never {
          captured.push(error);
          throw boundaryFailure;
        }
      }
      const root = new Boundary();
      roots.push(root);
      root.mount(container);
      const inner = child.wrap(() => {
        if (asynchronous) return task.promise;
        throw failure;
      });
      let caught: unknown;
      try {
        const result = child.wrap(() => inner())();
        if (asynchronous) task.reject(failure);
        await result;
      } catch (error) {
        caught = error;
      }

      expect(captured).toEqual([failure]);
      expect(caught).toBeInstanceOf(AggregateError);
      expect((caught as AggregateError).errors).toEqual([
        boundaryFailure,
        failure,
      ]);
      expect(child.mounted).toBe(true);
    });
  }

  for (const handled of [false, true]) {
    it(`${handled ? 'keeps a mounted child after handling' : 'dispatches once and tears down after'} a synchronous guarded onMounted failure`, () => {
      const failure = new Error('synchronous guarded mounted failure');
      const captured: unknown[] = [];
      let unmounts = 0;
      class Boundary extends Counter {
        protected onErrorCaptured(error: unknown) {
          captured.push(error);
          return handled ? false : undefined;
        }
      }
      class Child extends Counter {
        protected onMounted() {
          this.wrap(() => {
            throw failure;
          })();
        }
        protected onUnmounted() {
          unmounts++;
        }
      }
      const root = new Boundary();
      const child = new Child();
      roots.push(root, child);
      root.mount(container);
      child.setParentComponent(root);

      if (handled) child.mount(container);
      else expect(() => child.mountToNode()).toThrow(failure);

      expect(captured).toEqual([failure]);
      expect(child.mounted).toBe(handled);
      expect(unmounts).toBe(handled ? 0 : 1);
      expect(root.mounted).toBe(true);
      expect(container.textContent).toBe(handled ? '00' : '0');
    });

    it(`${handled ? 'continues rendering after handling' : 'dispatches once and preserves the mounted child after'} a synchronous guarded beforeUpdate failure`, () => {
      const failure = new Error('synchronous guarded update failure');
      const captured: unknown[] = [];
      class Boundary extends Counter {
        protected onErrorCaptured(error: unknown) {
          captured.push(error);
          return handled ? false : undefined;
        }
      }
      class Child extends Counter {
        protected beforeUpdate() {
          this.wrap(() => {
            throw failure;
          })();
        }
      }
      const root = new Boundary();
      const child = new Child();
      roots.push(root, child);
      root.mount(container);
      child.setParentComponent(root);
      child.mount(container);
      child.setState({ count: 1 });

      if (handled) flushSync();
      else expect(() => flushSync()).toThrow(failure);

      expect(captured).toEqual([failure]);
      expect(child.mounted).toBe(true);
      expect(root.mounted).toBe(true);
      expect(container.textContent).toBe(handled ? '01' : '00');
    });
  }

  for (const asynchronous of [false, true]) {
    it(`keeps the original owner boundary chain when a child guard propagates its parent's ${asynchronous ? 'promise rejection' : 'throw'}`, async () => {
      const failure = new Error('parent-owned guarded failure');
      const task = deferred<void>();
      const captured: Array<[string, unknown]> = [];
      const origins: unknown[] = [];
      let parent!: Parent;
      let child!: Child;
      class Child extends Counter {
        constructor(props?: object) {
          super(props);
          child = this;
        }
        run() {
          return this.wrap(() =>
            (this.props as { run: () => unknown }).run()
          )();
        }
      }
      class Parent extends Counter {
        constructor() {
          super();
          parent = this;
        }
        protected override render(): VNode {
          return createComponent(Child, {
            run: this.wrap(() => {
              if (asynchronous) return task.promise;
              throw failure;
            }),
          });
        }
        protected onErrorCaptured(error: unknown) {
          captured.push(['parent', error]);
        }
      }
      class Grandparent extends Counter {
        protected override render(): VNode {
          return createComponent(Parent);
        }
        protected onErrorCaptured(error: unknown, instance: unknown) {
          captured.push(['grandparent', error]);
          origins.push(instance);
        }
      }
      const root = new Grandparent();
      roots.push(root);
      root.mount(container);
      let caught: unknown;
      try {
        const result = child.run();
        if (asynchronous) task.reject(failure);
        await result;
      } catch (error) {
        caught = error;
      }

      expect(caught).toBe(failure);
      expect(captured).toEqual([['grandparent', failure]]);
      expect(origins).toEqual([parent]);
      expect(child.mounted).toBe(true);
      expect(parent.mounted).toBe(true);
    });
  }
});
