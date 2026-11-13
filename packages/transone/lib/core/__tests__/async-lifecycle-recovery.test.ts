import { afterEach, beforeEach, expect, it } from 'bun:test';
import { Component, createComponent, flushSync, type VNode } from '../../index';

let container: HTMLElement;
let parent: Component | undefined;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  parent?.unmount();
  parent = undefined;
  flushSync();
  container.remove();
});

it('preserves sibling identity and state when an asynchronous lifecycle failure renders a boundary fallback', async () => {
  let reject!: (error: unknown) => void;
  const pending = new Promise<void>((_resolve, fail) => {
    reject = fail;
  });
  const handled = pending.catch(() => {});
  let sibling!: Sibling;
  let mounts = 0;
  let unmounts = 0;

  class FailedChild extends Component {
    protected initState() {
      return {};
    }
    protected initStyles() {}
    protected render(): VNode {
      return { tag: 'span', children: ['child'] };
    }
    protected onMounted() {
      return pending;
    }
  }

  class Sibling extends Component<object, { count: number }> {
    constructor() {
      super();
      sibling = this;
    }
    protected initState() {
      return { count: 0 };
    }
    protected initStyles() {}
    protected render(): VNode {
      return { tag: 'button', children: [String(this.state.count)] };
    }
    protected onMounted() {
      mounts++;
    }
    protected onUnmounted() {
      unmounts++;
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
            : createComponent(FailedChild),
          createComponent(Sibling),
        ],
      };
    }
    protected onErrorCaptured() {
      this.setState({ failed: true });
      return false;
    }
  }

  parent = new Boundary();
  parent.mount(container);
  const originalSibling = sibling;
  originalSibling.setState({ count: 7 });
  flushSync();

  reject(new Error('asynchronous child failure'));
  await handled;
  await Promise.resolve();
  await Promise.resolve();
  flushSync();

  expect(container.textContent).toBe('fallback7');
  expect(sibling).toBe(originalSibling);
  expect(originalSibling.mounted).toBe(true);
  expect(mounts).toBe(1);
  expect(unmounts).toBe(0);
});

it('renders the boundary fallback when the failing child is its root vnode', async () => {
  let reject!: (error: unknown) => void;
  const pending = new Promise<void>((_resolve, fail) => {
    reject = fail;
  });
  const handled = pending.catch(() => {});

  class FailedChild extends Component {
    protected initState() {
      return {};
    }
    protected initStyles() {}
    protected render(): VNode {
      return { tag: 'span', children: ['child'] };
    }
    protected onMounted() {
      return pending;
    }
  }

  class Boundary extends Component<object, { failed: boolean }> {
    protected initState() {
      return { failed: false };
    }
    protected initStyles() {}
    protected render(): VNode {
      return this.state.failed
        ? { tag: 'aside', children: ['fallback'] }
        : createComponent(FailedChild);
    }
    protected onErrorCaptured() {
      this.setState({ failed: true });
      return false;
    }
  }

  parent = new Boundary();
  parent.mount(container);
  reject(new Error('asynchronous root child failure'));
  await handled;
  await Promise.resolve();
  await Promise.resolve();
  flushSync();

  expect(container.textContent).toBe('fallback');
  expect(parent.getElement()?.parentNode).toBe(container);
});
