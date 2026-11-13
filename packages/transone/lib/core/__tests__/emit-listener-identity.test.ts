import { afterEach, beforeEach, expect, it } from 'bun:test';
import {
  Component,
  Emit,
  createComponent,
  flushSync,
  type VNode,
} from '../../index';

class Example extends Component<object, { count: number }> {
  protected initState() {
    return { count: 0 };
  }
  protected initStyles() {}
  protected render(): VNode {
    return { tag: 'button', children: [String(this.state.count)] };
  }
}
let container: HTMLElement;
let root: Component | undefined;
beforeEach(() => {
  container = document.createElement('main');
  document.body.appendChild(container);
});
afterEach(() => {
  root?.unmount();
  root = undefined;
  flushSync();
  container.remove();
});

it('defers a removed-and-readded same-function leaf registration past its old event', () => {
  const seen: unknown[][] = [];
  let leaf!: Leaf;
  let parent!: Parent;
  let replace = true;
  const same = (value: unknown) => seen.push(['leaf registration', value]);
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
    constructor() {
      super();
      parent = this;
    }
    @Emit('forward') forward(value: unknown) {
      seen.push(['parent', value]);
      return value;
    }
    protected render(): VNode {
      return createComponent({
        component: Leaf,
        emitters: { done: (value) => this.forward(value) },
      });
    }
  }
  class Root extends Example {
    protected render(): VNode {
      return createComponent({
        component: Parent,
        emitters: {
          forward: (value) => {
            seen.push(['root', value]);
            if (replace) {
              replace = false;
              leaf.off('done', same);
              leaf.on('done', same);
            }
          },
        },
      });
    }
  }
  root = new Root();
  root.mount(container);
  leaf.on('done', same);
  leaf.action(1);
  expect(seen).toEqual([
    ['parent', 1],
    ['root', 1],
  ]);
  leaf.action(2);
  expect(seen).toEqual([
    ['parent', 1],
    ['root', 1],
    ['parent', 2],
    ['root', 2],
    ['leaf registration', 2],
  ]);
  expect(parent.mounted).toBe(true);
});

it('keeps a replacement registration when its removed predecessor unsubscribe is called', () => {
  const seen: unknown[][] = [];
  let leaf!: Leaf;
  const same = (value: unknown) => seen.push(['leaf registration', value]);
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
    @Emit('forward') forward(value: unknown) {
      return value;
    }
    protected render(): VNode {
      return createComponent({
        component: Leaf,
        emitters: { done: (value) => this.forward(value) },
      });
    }
  }
  class Root extends Example {
    protected render(): VNode {
      return createComponent({
        component: Parent,
        emitters: { forward: (value) => seen.push(['root', value]) },
      });
    }
  }
  root = new Root();
  root.mount(container);
  const oldUnsubscribe = leaf.on('done', same);
  leaf.off('done', same);
  const newUnsubscribe = leaf.on('done', same);
  oldUnsubscribe();
  leaf.action(1);
  expect(seen).toEqual([
    ['root', 1],
    ['leaf registration', 1],
  ]);
  newUnsubscribe();
  leaf.action(2);
  expect(seen).toEqual([
    ['root', 1],
    ['leaf registration', 1],
    ['root', 2],
  ]);
});

it('keeps nested dispatch modifications local to their event snapshots', () => {
  const seen: unknown[][] = [];
  let leaf!: Leaf;
  let parent!: Parent;
  let nested = false;
  const removedLeaf = (value: unknown) => seen.push(['removed leaf', value]);
  const removedParent = (value: unknown) =>
    seen.push(['removed parent', value]);
  const addedLeaf = (value: unknown) => seen.push(['added leaf', value]);
  const addedParent = (value: unknown) => seen.push(['added parent', value]);
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
    constructor() {
      super();
      parent = this;
    }
    @Emit('forward') forward(value: unknown) {
      seen.push(['parent', value]);
      return value;
    }
    protected render(): VNode {
      return createComponent({
        component: Leaf,
        emitters: { done: (value) => this.forward(value) },
      });
    }
  }
  class Root extends Example {
    protected render(): VNode {
      return createComponent({
        component: Parent,
        emitters: {
          forward: (value) => {
            seen.push(['root', value]);
            if (!nested) {
              nested = true;
              leaf.off('done', removedLeaf);
              leaf.on('done', addedLeaf);
              parent.off('forward', removedParent);
              parent.on('forward', addedParent);
              leaf.action(2);
            }
          },
        },
      });
    }
  }
  root = new Root();
  root.mount(container);
  leaf.on('done', removedLeaf);
  parent.on('forward', removedParent);
  leaf.action(1);
  expect(seen).toEqual([
    ['parent', 1],
    ['root', 1],
    ['parent', 2],
    ['root', 2],
    ['added parent', 2],
    ['added leaf', 2],
  ]);
  seen.length = 0;
  leaf.action(3);
  expect(seen).toEqual([
    ['parent', 3],
    ['root', 3],
    ['added parent', 3],
    ['added leaf', 3],
  ]);
});

it('recovers repeatedly across forwarding errors and root unmount/remount scopes', () => {
  const seen: unknown[][] = [];
  let leaf!: Leaf;
  let parent!: Parent;
  let failures = 0;
  const retained: Array<{
    oldAction: (value: number) => unknown;
    oldUnsubscribe: () => void;
    oldLeaf: Leaf;
  }> = [];
  class Leaf extends Example {
    constructor() {
      super();
      leaf = this;
    }
    @Emit('done') action(value: number) {
      seen.push(['leaf', value]);
      return value;
    }
  }
  class Parent extends Example {
    constructor() {
      super();
      parent = this;
    }
    @Emit('forward') forward(value: unknown) {
      seen.push(['parent', value]);
      if (failures < 3) throw new Error('forward failed ' + value);
      return value;
    }
    protected render(): VNode {
      return createComponent({
        component: Leaf,
        emitters: { done: (value) => this.forward(value) },
      });
    }
  }
  class Root extends Example {
    protected render(): VNode {
      return createComponent({
        component: Parent,
        emitters: {
          forward: (value) => {
            seen.push(['root', value]);
          },
        },
      });
    }
    protected onErrorCaptured(error: unknown) {
      seen.push([(error as Error).message]);
      failures++;
      retained.push({
        oldAction: leaf.action,
        oldUnsubscribe: leaf.on('done', () => seen.push(['old listener'])),
        oldLeaf: leaf,
      });
      this.unmount();
      this.mount(container);
      return false;
    }
  }
  root = new Root();
  root.mount(container);
  for (let i = 1; i <= 3; i++) {
    const old = leaf;
    const staleParent = parent.forward;
    leaf.action(i);
    expect(old.mounted).toBe(false);
    expect(leaf).not.toBe(old);
    for (const item of retained) {
      item.oldUnsubscribe();
      item.oldAction(900);
    }
    staleParent(901);
  }
  leaf.action(4);
  expect(seen).toEqual([
    ['leaf', 1],
    ['parent', 1],
    ['forward failed 1'],
    ['leaf', 2],
    ['parent', 2],
    ['forward failed 2'],
    ['leaf', 3],
    ['parent', 3],
    ['forward failed 3'],
    ['leaf', 4],
    ['parent', 4],
    ['root', 4],
  ]);
  expect(container.childNodes.length).toBe(1);
});

it('deduplicates repeated on calls until their current registration is removed', () => {
  const seen: number[] = [];
  class Emitter extends Example {
    @Emit('done') action(value: number) {
      return value;
    }
  }
  root = new Emitter();
  root.mount(container);
  const emitter = root as Emitter;
  const same = (value: unknown) => seen.push(value as number);
  const firstUnsubscribe = emitter.on('done', same);
  const secondUnsubscribe = emitter.on('done', same);
  emitter.action(1);
  expect(seen).toEqual([1]);
  firstUnsubscribe();
  emitter.action(2);
  expect(seen).toEqual([1]);
  emitter.on('done', same);
  secondUnsubscribe();
  emitter.action(3);
  expect(seen).toEqual([1, 3]);
  emitter.off('done', same);
  emitter.action(4);
  expect(seen).toEqual([1, 3]);
});

it('keeps same-instance remount registrations safe from old unsubscribe closures', () => {
  const seen: number[] = [];
  class Emitter extends Example {
    @Emit('done') action(value: number) {
      return value;
    }
  }
  const emitter = new Emitter();
  root = emitter;
  emitter.mount(container);
  const same = (value: unknown) => seen.push(value as number);
  const oldUnsubscribe = emitter.on('done', same);
  emitter.action(1);
  emitter.unmount();
  emitter.mount(container);
  const newUnsubscribe = emitter.on('done', same);
  oldUnsubscribe();
  emitter.action(2);
  expect(seen).toEqual([1, 2]);
  newUnsubscribe();
  emitter.action(3);
  expect(seen).toEqual([1, 2]);
});

it('delivers a sole listener replacement to nested and later events', () => {
  const seen: unknown[][] = [];
  class Emitter extends Example {
    @Emit('done') action(value: number) {
      return value;
    }
  }
  const emitter = new Emitter();
  root = emitter;
  emitter.mount(container);
  const replacement = (value: unknown) => seen.push(['replacement', value]);
  const first = (value: unknown) => {
    seen.push(['first', value]);
    emitter.off('done', first);
    emitter.on('done', replacement);
    emitter.action(2);
  };
  emitter.on('done', first);
  emitter.action(1);
  emitter.action(3);
  expect(seen).toEqual([
    ['first', 1],
    ['replacement', 2],
    ['replacement', 3],
  ]);
});

it('delivers same-function replacements once in the nested event and later events only', () => {
  const seen: unknown[][] = [];
  let leaf!: Leaf;
  let parent!: Parent;
  const sameLeaf = (value: unknown) => seen.push(['leaf listener', value]);
  const sameParent = (value: unknown) => seen.push(['parent listener', value]);
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
    constructor() {
      super();
      parent = this;
    }
    @Emit('forward') forward(value: unknown) {
      seen.push(['parent', value]);
      return value;
    }
    protected render(): VNode {
      return createComponent({
        component: Leaf,
        emitters: { done: (value) => this.forward(value) },
      });
    }
  }
  class Root extends Example {
    protected render(): VNode {
      return createComponent({
        component: Parent,
        emitters: {
          forward: (value) => {
            seen.push(['root', value]);
            if (value === 1) {
              leaf.off('done', sameLeaf);
              leaf.on('done', sameLeaf);
              parent.off('forward', sameParent);
              parent.on('forward', sameParent);
              leaf.action(2);
            }
          },
        },
      });
    }
  }
  root = new Root();
  root.mount(container);
  leaf.on('done', sameLeaf);
  parent.on('forward', sameParent);
  leaf.action(0);
  leaf.action(1);
  leaf.action(3);
  expect(seen).toEqual([
    ['parent', 0],
    ['root', 0],
    ['parent listener', 0],
    ['leaf listener', 0],
    ['parent', 1],
    ['root', 1],
    ['parent', 2],
    ['root', 2],
    ['parent listener', 2],
    ['leaf listener', 2],
    ['parent', 3],
    ['root', 3],
    ['parent listener', 3],
    ['leaf listener', 3],
  ]);
});
