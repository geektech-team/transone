import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { Component, createComponent, flushSync, type VNode } from '../../index';

interface Deferred {
  promise: Promise<void>;
  handled: Promise<void>;
  reject(error: unknown): void;
}

function deferred(): Deferred {
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((_resolve, fail) => {
    reject = fail;
  });
  // Keep deliberately rejected fixtures from becoming process-level unhandled
  // rejections while still testing the framework's independent observation.
  const handled = promise.catch(() => {});
  return { promise, handled, reject };
}

async function rejectAndDrain(task: Deferred, error: unknown): Promise<void> {
  task.reject(error);
  await task.handled;
  await Promise.resolve();
  await Promise.resolve();
}

let container: HTMLElement;
const instances: Array<{ unmount(): void }> = [];
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  for (const instance of instances.splice(0).reverse()) instance.unmount();
  flushSync();
  container.remove();
});

class RecordingBoundary extends Component {
  readonly errors: unknown[] = [];
  protected initState() {
    return {};
  }
  protected initStyles() {}
  protected render(): VNode {
    return { tag: 'aside' };
  }
  protected onErrorCaptured(error: unknown) {
    this.errors.push(error);
    return false;
  }
}

describe('asynchronous callbacks and component error boundaries', () => {
  it('reports the original asynchronous lifecycle error when a boundary rethrows it', async () => {
    const task = deferred();
    const failure = new Error('same asynchronous error');
    const reported: unknown[] = [];
    class Child extends Component {
      protected initState() {
        return {};
      }
      protected initStyles() {}
      protected render(): VNode {
        return { tag: 'span' };
      }
      protected onMounted() {
        return task.promise;
      }
    }
    class Boundary extends Component {
      protected initState() {
        return {};
      }
      protected initStyles() {}
      protected render(): VNode {
        return createComponent(Child);
      }
      protected onErrorCaptured(error: unknown): never {
        throw error;
      }
    }
    const log = spyOn(console, 'error').mockImplementation(
      (...args: unknown[]) => {
        reported.push(args[1]);
      }
    );
    const boundary = new Boundary();
    instances.push(boundary);
    try {
      boundary.mount(container);
      await rejectAndDrain(task, failure);
      expect(reported).toHaveLength(1);
      expect(reported[0]).toBe(failure);
    } finally {
      log.mockRestore();
    }
  });
  it('retains both the original update failure and a throwing boundary failure', () => {
    const original = new Error('child update failed');
    const boundaryFailure = new Error('boundary failed');
    let child!: Child;
    class Child extends Component<object, { fail: boolean }> {
      constructor() {
        super();
        child = this;
      }
      protected initState() {
        return { fail: false };
      }
      protected initStyles() {}
      protected render(): VNode {
        if (this.state.fail) throw original;
        return { tag: 'span' };
      }
    }
    class Boundary extends Component {
      protected initState() {
        return {};
      }
      protected initStyles() {}
      protected render(): VNode {
        return createComponent(Child);
      }
      protected onErrorCaptured(): never {
        throw boundaryFailure;
      }
    }
    const boundary = new Boundary();
    instances.push(boundary);
    boundary.mount(container);
    child.state.fail = true;
    let caught: unknown;
    try {
      flushSync();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const combined = caught as Error & { errors: unknown[] };
    expect(combined.name).toBe('AggregateError');
    expect(combined.errors).toHaveLength(2);
    expect(combined.errors).toContain(original);
    expect(combined.errors).toContain(boundaryFailure);
  });
  it('routes a returned onMounted rejection to the active parent boundary', async () => {
    const task = deferred();
    const failure = new Error('mounted async failure');
    const errors: unknown[] = [];
    class Child extends Component {
      protected initState() {
        return {};
      }
      protected initStyles() {}
      protected onMounted() {
        return task.promise;
      }
      protected render(): VNode {
        return { tag: 'span', children: ['child'] };
      }
    }
    class Boundary extends Component {
      protected initState() {
        return {};
      }
      protected initStyles() {}
      protected render(): VNode {
        return createComponent(Child);
      }
      protected onErrorCaptured(error: unknown) {
        errors.push(error);
        return false;
      }
    }
    const boundary = new Boundary();
    instances.push(boundary);
    boundary.mount(container);
    await rejectAndDrain(task, failure);
    expect(errors).toEqual([failure]);
  });

  for (const listenerKind of ['prop', 'listeners'] as const) {
    it(`routes an active DOM ${listenerKind} callback rejection to its component boundary`, async () => {
      const task = deferred();
      const failure = new Error('event async failure');
      const errors: unknown[] = [];
      class Child extends Component {
        protected initState() {
          return {};
        }
        protected initStyles() {}
        protected render(): VNode {
          const callback = () => task.promise;
          return listenerKind === 'prop'
            ? {
                tag: 'button',
                props: { onClick: callback },
                children: ['click'],
              }
            : {
                tag: 'button',
                listeners: { click: callback },
                children: ['click'],
              };
        }
      }
      class Boundary extends Component {
        protected initState() {
          return {};
        }
        protected initStyles() {}
        protected render(): VNode {
          return createComponent(Child);
        }
        protected onErrorCaptured(error: unknown) {
          errors.push(error);
          return false;
        }
      }
      const boundary = new Boundary();
      instances.push(boundary);
      boundary.mount(container);
      container.querySelector('button')!.dispatchEvent(new Event('click'));
      await rejectAndDrain(task, failure);
      expect(errors).toEqual([failure]);
    });
  }

  for (const origin of ['onMounted', 'event'] as const) {
    it(`ignores an old ${origin} rejection after the same instance mounts under a new boundary`, async () => {
      const oldTask = deferred(),
        currentTask = deferred();
      const oldFailure = new Error('old generation failure');
      const currentFailure = new Error('current generation failure');
      const originalParent = new RecordingBoundary(),
        nextParent = new RecordingBoundary();
      instances.push(originalParent, nextParent);
      const boundaryHost = document.createElement('div');
      container.appendChild(boundaryHost);
      originalParent.mount(boundaryHost);
      nextParent.mount(boundaryHost);
      let calls = 0;
      const taskForCall = () =>
        calls++ === 0 ? oldTask.promise : currentTask.promise;
      class Child extends Component<object, { count: number }> {
        protected initState() {
          return { count: 1 };
        }
        protected initStyles() {}
        protected onMounted() {
          if (origin === 'onMounted') return taskForCall();
        }
        protected render(): VNode {
          return {
            tag: 'button',
            props: { onClick: () => taskForCall() },
            children: [String(this.state.count)],
          };
        }
      }
      const child = new Child();
      instances.push(child);
      child.setParentComponent(originalParent);
      child.mount(container);
      if (origin === 'event')
        (child.getElement() as HTMLElement).dispatchEvent(new Event('click'));
      const state = child.state;
      child.unmount();
      child.setParentComponent(nextParent);
      child.mount(container);
      if (origin === 'event')
        (child.getElement() as HTMLElement).dispatchEvent(new Event('click'));
      await rejectAndDrain(oldTask, oldFailure);
      expect(originalParent.errors).toEqual([]);
      expect(nextParent.errors).toEqual([]);
      expect(child.state).toBe(state);
      expect(child.state.count).toBe(1);
      await rejectAndDrain(currentTask, currentFailure);
      expect(originalParent.errors).toEqual([]);
      expect(nextParent.errors).toEqual([currentFailure]);
    });
  }

  for (const reparent of [false, true]) {
    it(`keeps the original boundary chain when the inner boundary ${reparent ? 'reparents' : 'unmounts'} itself`, () => {
      const failure = new Error('original render failure');
      const log: string[] = [];
      const nextParent = new RecordingBoundary();
      instances.push(nextParent);
      nextParent.mount(container);
      let child!: Child;
      class Child extends Component<object, { fail: boolean }> {
        constructor() {
          super();
          child = this;
        }
        protected initState() {
          return { fail: false };
        }
        protected initStyles() {}
        protected render(): VNode {
          if (this.state.fail) throw failure;
          return { tag: 'span' };
        }
      }
      class Inner extends Component {
        protected initState() {
          return {};
        }
        protected initStyles() {}
        protected render(): VNode {
          return createComponent(Child);
        }
        protected onErrorCaptured() {
          log.push('inner');
          this.unmount();
          if (reparent) this.setParentComponent(nextParent);
          return true;
        }
      }
      class Outer extends Component {
        protected initState() {
          return {};
        }
        protected initStyles() {}
        protected render(): VNode {
          return createComponent(Inner);
        }
        protected onErrorCaptured(error: unknown) {
          expect(error).toBe(failure);
          log.push('outer');
          return false;
        }
      }
      const outer = new Outer();
      instances.push(outer);
      outer.mount(container);
      child.state.fail = true;
      expect(() => flushSync()).not.toThrow();
      expect(log).toEqual(['inner', 'outer']);
      expect(nextParent.errors).toEqual([]);
    });
  }

  it('does not deliver an old synchronous error to a remounted ancestor generation', () => {
    const failure = new Error('old descendant render failure');
    const log: string[] = [];
    const nextParent = new RecordingBoundary();
    instances.push(nextParent);
    nextParent.mount(container);
    let child!: Child;
    let outer!: Outer;
    class Child extends Component<object, { fail: boolean }> {
      constructor() {
        super();
        child = this;
      }
      protected initState() {
        return { fail: false };
      }
      protected initStyles() {}
      protected render(): VNode {
        if (this.state.fail) throw failure;
        return { tag: 'span' };
      }
    }
    class Inner extends Component {
      protected initState() {
        return {};
      }
      protected initStyles() {}
      protected render(): VNode {
        return createComponent(Child);
      }
      protected onErrorCaptured() {
        log.push('inner');
        outer.unmount();
        outer.mount(container);
        this.setParentComponent(nextParent);
        return true;
      }
    }
    class Outer extends Component {
      protected initState() {
        return {};
      }
      protected initStyles() {}
      protected render(): VNode {
        return createComponent(Inner);
      }
      protected onErrorCaptured() {
        log.push('new outer generation');
        return false;
      }
    }
    outer = new Outer();
    instances.push(outer);
    outer.mount(container);
    const failed = child;
    failed.state.fail = true;
    expect(() => flushSync()).toThrow(failure);
    expect(log).toEqual(['inner']);
    expect(nextParent.errors).toEqual([]);
    expect(outer.mounted).toBe(true);
  });

  for (const hasBoundary of [false, true]) {
    it(`preserves synchronous active event error behavior ${hasBoundary ? 'with' : 'without'} a parent boundary`, () => {
      const failure = new Error('synchronous event failure');
      const boundary = new RecordingBoundary();
      instances.push(boundary);
      if (hasBoundary) boundary.mount(container);
      class Child extends Component {
        protected initState() {
          return {};
        }
        protected initStyles() {}
        protected render(): VNode {
          return {
            tag: 'button',
            props: {
              onClick: () => {
                throw failure;
              },
            },
          };
        }
      }
      const child = new Child();
      instances.push(child);
      if (hasBoundary) child.setParentComponent(boundary);
      child.mount(container);
      const click = () =>
        (child.getElement() as HTMLElement).dispatchEvent(new Event('click'));
      if (hasBoundary) {
        expect(click).not.toThrow();
        expect(boundary.errors).toEqual([failure]);
      } else expect(click).toThrow(failure);
    });
  }
});
