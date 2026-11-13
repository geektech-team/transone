import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  Component,
  Emit,
  WatchProps,
  createComponent,
  flushSync,
  type VNode,
} from '../../index';

class Example<Props extends object = object> extends Component<
  Props,
  { count: number }
> {
  protected initState() {
    return { count: 0 };
  }
  protected initStyles() {}
  protected render(): VNode {
    return { tag: 'button', children: [String(this.state.count)] };
  }
}

let container: HTMLElement;
const instances: Component[] = [];
beforeEach(() => {
  container = document.createElement('main');
  document.body.appendChild(container);
});
afterEach(() => {
  for (const instance of instances.splice(0).reverse()) instance.unmount();
  flushSync();
  container.remove();
});
function mount<T extends Component>(instance: T): T {
  instances.push(instance);
  instance.mount(container);
  return instance;
}

describe('reentrant component event dispatch', () => {
  it('defers an emitter replacement during a synchronous parent update until the next event', () => {
    const seen: number[] = [];
    const ancestorEvents: unknown[] = [];
    let leaf!: Leaf;
    class Base extends Example<{ value: number }> {
      @Emit('base') action(value: number) {
        return value + 1;
      }
    }
    class Middle extends Base {
      override action(value: number) {
        return super.action(value) + 1;
      }
    }
    class Leaf extends Middle {
      constructor(props?: { value: number }) {
        super(props);
        leaf = this;
      }
      @Emit('done') override action(value: number) {
        return super.action(value) + 1;
      }
    }
    class Parent extends Example {
      protected render(): VNode {
        const version = this.state.count;
        return createComponent({
          component: Leaf,
          props: { value: version },
          emitters: {
            done: () => {
              seen.push(version);
              if (version === 0) {
                this.setState({ count: 1 });
                flushSync();
              }
            },
          },
        });
      }
    }
    class Outer extends Example {
      protected render(): VNode {
        return createComponent(Parent);
      }
    }
    mount(new Outer());
    leaf.on('base', (value) => ancestorEvents.push(value));
    expect(leaf.action(1)).toBe(4);
    expect(seen).toEqual([0]);
    expect(leaf.action(2)).toBe(5);
    expect(seen).toEqual([0, 1]);
    expect(ancestorEvents).toEqual([]);
  });

  it('does not deliver a failed event to the replacement installed by an ancestor error boundary', () => {
    const seen: string[] = [];
    let leaf!: Leaf;
    class Leaf extends Example {
      constructor() {
        super();
        leaf = this;
      }
      @Emit('done') action(value: number) {
        return value;
      }
    }
    class Parent extends Example<{ recovered: boolean }> {
      protected render(): VNode {
        const recovered = this.props.recovered;
        return createComponent({
          component: Leaf,
          emitters: {
            done: () => {
              seen.push(recovered ? 'recovery listener' : 'throwing listener');
              if (!recovered) throw new Error('listener failed');
            },
          },
        });
      }
    }
    class Outer extends Example {
      protected render(): VNode {
        return createComponent({
          component: Parent,
          props: { recovered: this.state.count > 0 },
        });
      }
      protected onErrorCaptured(error: unknown) {
        seen.push((error as Error).message);
        this.setState({ count: 1 });
        flushSync();
        return false;
      }
    }
    mount(new Outer());
    leaf.action(1);
    expect(seen).toEqual(['throwing listener', 'listener failed']);
    leaf.action(2);
    expect(seen).toEqual([
      'throwing listener',
      'listener failed',
      'recovery listener',
    ]);
  });

  it('skips listeners removed during dispatch while deferring newly added listeners', () => {
    const seen: string[] = [];
    class Emitter extends Example {
      @Emit('done') action(): void {}
    }
    const instance = mount(new Emitter());
    const removed = () => seen.push('removed');
    const added = () => seen.push('added');
    instance.on('done', () => {
      seen.push('first');
      instance.off('done', removed);
      instance.on('done', added);
    });
    instance.on('done', removed);
    instance.action();
    expect(seen).toEqual(['first']);
    instance.action();
    expect(seen).toEqual(['first', 'first', 'added']);
  });

  it('abandons inherited watch batches when an error boundary remounts the nested tree', () => {
    const seen: unknown[][] = [];
    let leaf!: Leaf;
    let armed = true;
    class Base extends Example<{ value: number }> {
      @WatchProps('value', { immediate: true }) first(
        next: number,
        old: number | undefined
      ): void {
        seen.push(['base', next, old]);
      }
      @WatchProps('value', { immediate: true }) suppressed(): void {
        seen.push(['suppressed']);
      }
    }
    class Middle extends Base {
      @WatchProps('value', { immediate: true }) second(
        next: number,
        old: number | undefined
      ): void {
        seen.push(['middle', next, old]);
      }
    }
    class Leaf extends Middle {
      constructor(props?: { value: number }) {
        super(props);
        leaf = this;
      }
      override suppressed(): void {
        seen.push(['plain override']);
      }
      @WatchProps('value', { immediate: true }) override first(
        next: number,
        old: number | undefined
      ): void {
        super.first(next, old);
        seen.push(['leaf', next, old]);
        if (next === 1 && armed) {
          armed = false;
          this.setProps({ value: 2 });
          throw new Error('watch failed');
        }
      }
      @Emit('done') action(value: number) {
        seen.push(['action', value]);
        return value;
      }
    }
    class Parent extends Example {
      protected render(): VNode {
        return createComponent({ component: Leaf, props: { value: 0 } });
      }
    }
    class Outer extends Example {
      protected render(): VNode {
        return createComponent(Parent);
      }
      protected onErrorCaptured(error: unknown) {
        seen.push([(error as Error).message]);
        this.unmount();
        this.mount(container);
        return false;
      }
    }
    mount(new Outer());
    const oldLeaf = leaf;
    const oldAction = leaf.action;
    seen.length = 0;
    oldLeaf.setProps({ value: 1 });
    flushSync();
    oldAction(999);
    expect(leaf).not.toBe(oldLeaf);
    expect(oldLeaf.mounted).toBe(false);
    expect(seen).toEqual([
      ['middle', 1, 0],
      ['base', 1, 0],
      ['leaf', 1, 0],
      ['watch failed'],
      ['middle', 0, undefined],
      ['base', 0, undefined],
      ['leaf', 0, undefined],
    ]);
    leaf.setProps({ value: 3 });
    flushSync();
    expect(seen.slice(-3)).toEqual([
      ['middle', 3, 0],
      ['base', 3, 0],
      ['leaf', 3, 0],
    ]);
  });

  it('stops old listeners when an error boundary remounts the nested tree', () => {
    const seen: string[] = [];
    let leaf!: Leaf;
    let armed = true;
    class Leaf extends Example {
      constructor() {
        super();
        leaf = this;
      }
      @Emit('done') action(value: number) {
        return value;
      }
    }
    class Parent extends Example {
      protected render(): VNode {
        return createComponent({
          component: Leaf,
          emitters: {
            done: () => {
              seen.push('parent');
              if (armed) {
                armed = false;
                throw new Error('failed');
              }
            },
          },
        });
      }
    }
    class Outer extends Example {
      protected render(): VNode {
        return createComponent(Parent);
      }
      protected onErrorCaptured(error: unknown) {
        seen.push((error as Error).message);
        this.unmount();
        this.mount(container);
        return false;
      }
    }
    mount(new Outer());
    const oldLeaf = leaf;
    const oldAction = leaf.action;
    oldLeaf.on('done', () => seen.push('old listener'));
    expect(oldAction(1)).toBeUndefined();
    expect(leaf).not.toBe(oldLeaf);
    expect(seen).toEqual(['parent', 'failed']);
    leaf.action(2);
    oldAction(3);
    expect(seen).toEqual(['parent', 'failed', 'parent']);
  });
});
