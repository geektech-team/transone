import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  Component,
  createComponent,
  flushSync,
  type ComponentEventListener,
  type VNode,
} from '../../index';

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

function retainedClick(node: Node): EventListener {
  const entries = (
    node as unknown as {
      getListeners(name: string): Array<{ listener: EventListener }>;
    }
  ).getListeners('click');
  return entries[0].listener;
}

describe('renderer callback ownership', () => {
  for (const syntax of ['prop', 'listeners'] as const) {
    it(`ignores a retained old DOM ${syntax} entry after a new mount`, () => {
      class Example extends Component<object, { count: number }> {
        protected initState() {
          return { count: 0 };
        }
        protected initStyles() {}
        protected render(): VNode {
          const callback = () => {
            this.setState({ count: this.state.count + 1 });
          };
          return syntax === 'prop'
            ? {
                tag: 'button',
                props: { onClick: callback },
                children: [String(this.state.count)],
              }
            : {
                tag: 'button',
                listeners: { click: callback },
                children: [String(this.state.count)],
              };
        }
      }
      const component = new Example();
      instances.push(component);
      component.mount(container);
      const oldNode = component.getElement()!;
      const oldClick = retainedClick(oldNode);
      component.unmount();
      component.mount(container);
      oldClick.call(oldNode, new Event('click'));
      flushSync();
      expect(component.state.count).toBe(0);
      expect(container.textContent).toBe('0');
      (component.getElement() as HTMLElement).dispatchEvent(new Event('click'));
      expect(component.state.count).toBe(1);
      expect(container.textContent).toBe('1');
    });
  }

  it('routes an emitter promise rejection through the declaring parent boundary chain', async () => {
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((_resolve, fail) => {
      reject = fail;
    });
    const handled = promise.catch(() => {});
    const failure = new Error('emitter promise failed');
    const captured: unknown[] = [];
    const wrongOwner: unknown[] = [];
    let child!: Child;
    class Child extends Component {
      constructor() {
        super();
        child = this;
      }
      protected initState() {
        return {};
      }
      protected initStyles() {}
      protected render(): VNode {
        return { tag: 'button' };
      }
      fire() {
        this.emit('change');
      }
    }
    class Parent extends Component {
      protected initState() {
        return {};
      }
      protected initStyles() {}
      protected render(): VNode {
        return createComponent({
          component: Child,
          emitters: { change: () => promise },
        });
      }
      protected onErrorCaptured(error: unknown) {
        wrongOwner.push(error);
        return false;
      }
    }
    class Outer extends Component {
      protected initState() {
        return {};
      }
      protected initStyles() {}
      protected render(): VNode {
        return createComponent(Parent);
      }
      protected onErrorCaptured(error: unknown) {
        captured.push(error);
        return false;
      }
    }
    const outer = new Outer();
    instances.push(outer);
    outer.mount(container);
    child.fire();
    reject(failure);
    await handled;
    await Promise.resolve();
    await Promise.resolve();
    expect(captured).toEqual([failure]);
    expect(wrongOwner).toEqual([]);
  });

  it('ignores an old emitter entry retained by a child after its parent remounts', () => {
    const subscriptions: ComponentEventListener[] = [];
    let child!: Child;
    class Child extends Component {
      constructor() {
        super();
        child = this;
      }
      protected initState() {
        return {};
      }
      protected initStyles() {}
      protected render(): VNode {
        return { tag: 'button' };
      }
      override on(name: string, listener: ComponentEventListener) {
        if (name === 'change') subscriptions.push(listener);
        return super.on(name, listener);
      }
      fire(value: number) {
        this.emit('change', value);
      }
    }
    class Parent extends Component<object, { count: number }> {
      protected initState() {
        return { count: 0 };
      }
      protected initStyles() {}
      private receive = (value: unknown) => {
        this.setState({ count: value as number });
      };
      protected render(): VNode {
        return {
          tag: 'main',
          children: [
            String(this.state.count),
            createComponent({
              component: Child,
              emitters: { change: this.receive },
            }),
          ],
        };
      }
    }
    const parent = new Parent();
    instances.push(parent);
    parent.mount(container);
    const oldEntry = subscriptions[0];
    parent.unmount();
    parent.mount(container);
    oldEntry(99);
    flushSync();
    expect(parent.state.count).toBe(0);
    child.fire(2);
    flushSync();
    expect(parent.state.count).toBe(2);
    expect(container.textContent).toBe('2');
  });

  it('replaces emitter subscriptions without duplicating retained handlers', () => {
    const seen: string[] = [];
    let child!: Child;
    class Child extends Component {
      constructor() {
        super();
        child = this;
      }
      protected initState() {
        return {};
      }
      protected initStyles() {}
      protected render(): VNode {
        return { tag: 'button' };
      }
      fire() {
        this.emit('change');
      }
    }
    class Parent extends Component<
      object,
      { version: number; replacement: boolean }
    > {
      protected initState() {
        return { version: 0, replacement: false };
      }
      protected initStyles() {}
      private first = () => {
        seen.push('first');
      };
      private second = () => {
        seen.push('second');
      };
      protected render(): VNode {
        return {
          tag: 'main',
          children: [
            String(this.state.version),
            createComponent({
              component: Child,
              emitters: {
                change: this.state.replacement ? this.second : this.first,
              },
            }),
          ],
        };
      }
    }
    const parent = new Parent();
    instances.push(parent);
    parent.mount(container);
    const originalChild = child;
    for (let version = 1; version <= 3; version++) {
      parent.setState({ version });
      flushSync();
      child.fire();
    }
    expect(child).toBe(originalChild);
    expect(seen).toEqual(['first', 'first', 'first']);
    parent.setState({ replacement: true });
    flushSync();
    child.fire();
    expect(seen).toEqual(['first', 'first', 'first', 'second']);
  });
});
