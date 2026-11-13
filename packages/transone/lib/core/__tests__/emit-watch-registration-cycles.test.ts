import { afterEach, beforeEach, expect, it } from 'bun:test';
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

it('isolates one callback across event names and owners through repeated registrations and mounts', () => {
  type Payload = { value: number };
  const seen: Payload[] = [];
  const actions: Payload[] = [];
  const stale: Array<() => void> = [];
  let leaf!: Leaf;
  let parent!: Parent;
  const same = (value: unknown) => {
    seen.push(value as Payload);
  };
  class Leaf extends Example {
    constructor() {
      super();
      leaf = this;
    }
    @Emit('done') action(value: Payload) {
      actions.push(value);
      return value;
    }
    @Emit('other') other(value: Payload) {
      return value;
    }
  }
  class Parent extends Example {
    constructor() {
      super();
      parent = this;
    }
    @Emit('done') forward(value: Payload) {
      return value;
    }
    protected render(): VNode {
      return createComponent({
        component: Leaf,
        emitters: { done: (value) => this.forward(value as Payload) },
      });
    }
  }
  class Root extends Example {
    protected render(): VNode {
      return createComponent(Parent);
    }
  }
  const instance = new Root();
  root = instance;
  for (let mount = 0; mount < 3; mount++) {
    instance.mount(container);
    for (let cycle = 1; cycle <= 5; cycle++) {
      const payload = { value: mount * 5 + cycle };
      const otherPayload = { value: -payload.value };
      const leafOff = leaf.on('done', same);
      const duplicateOff = leaf.on('done', same);
      const otherOff = leaf.on('other', same);
      const parentOff = parent.on('done', same);
      for (const unsubscribe of stale) unsubscribe();

      seen.length = 0;
      expect(leaf.action(payload)).toBe(payload);
      expect(leaf.other(otherPayload)).toBe(otherPayload);
      expect(seen).toEqual([payload, payload, otherPayload]);
      expect(seen[0]).toBe(payload);
      expect(seen[1]).toBe(payload);
      expect(seen[2]).toBe(otherPayload);

      leafOff();
      seen.length = 0;
      leaf.action(payload);
      leaf.other(otherPayload);
      expect(seen).toEqual([payload, otherPayload]);

      const replacementOff = leaf.on('done', same);
      leafOff();
      duplicateOff();
      seen.length = 0;
      leaf.action(payload);
      expect(seen).toEqual([payload, payload]);

      parentOff();
      seen.length = 0;
      leaf.action(payload);
      leaf.other(otherPayload);
      expect(seen).toEqual([payload, otherPayload]);
      otherOff();
      replacementOff();
      stale.push(leafOff, duplicateOff, otherOff, parentOff, replacementOff);
    }
    const oldAction = leaf.action;
    instance.unmount();
    actions.length = 0;
    oldAction({ value: 999 });
    expect(actions).toEqual([]);
    expect(container.childNodes.length).toBe(0);
  }
});

it('keeps watch snapshots and references through events, cross-owner commits and same-owner queues', () => {
  type Payload = { value: number };
  const initial = { value: 0 };
  const first = { value: 1 };
  const second = { value: 2 };
  const seen: unknown[][] = [];
  let leaf!: Leaf;
  let parent!: Parent;
  class Leaf extends Example<{ value: Payload; local: Payload }> {
    constructor(props?: { value: Payload; local: Payload }) {
      super(props);
      leaf = this;
    }
    @WatchProps('value') first(next: Payload, previous: Payload): void {
      seen.push(['leaf first', next, previous]);
      this.action(next);
    }
    @WatchProps('value') second(next: Payload, previous: Payload): void {
      seen.push(['leaf second', next, previous]);
    }
    @WatchProps('local') local(next: Payload, previous: Payload): void {
      seen.push(['leaf local', next, previous]);
    }
    @Emit('done') action(value: Payload) {
      seen.push(['leaf action', value]);
      return value;
    }
    currentProps() {
      return this.props;
    }
  }
  class Parent extends Example<{ value: Payload }> {
    constructor(props?: { value: Payload }) {
      super(props);
      parent = this;
    }
    @WatchProps('value') changed(next: Payload, previous: Payload): void {
      seen.push(['parent watch', next, previous]);
      leaf.setProps({ local: next });
    }
    @Emit('forward') forward(value: Payload) {
      seen.push(['parent emit', value]);
      return value;
    }
    protected render(): VNode {
      return createComponent({
        component: Leaf,
        props: { value: initial, local: initial },
        emitters: { done: (value) => this.forward(value as Payload) },
      });
    }
  }
  class Root extends Example {
    protected render(): VNode {
      return createComponent({
        component: Parent,
        props: { value: initial },
        emitters: {
          forward: (value) => {
            seen.push(['root', value]);
            parent.setProps({ value: value as Payload });
            if (value === first) leaf.setProps({ value: second });
          },
        },
      });
    }
  }
  root = new Root();
  root.mount(container);
  leaf.setProps({ value: first });

  // The other owner notifies inside the event. This owner's later changes wait
  // until both callbacks from the original value batch have consumed its snapshot.
  expect(seen).toEqual([
    ['leaf first', first, initial],
    ['leaf action', first],
    ['parent emit', first],
    ['root', first],
    ['parent watch', first, initial],
    ['leaf second', first, initial],
    ['leaf local', first, initial],
    ['leaf first', second, first],
    ['leaf action', second],
    ['parent emit', second],
    ['root', second],
    ['parent watch', second, first],
    ['leaf second', second, first],
    ['leaf local', second, first],
  ]);
  for (const index of [0, 1, 2, 3, 4, 5, 6]) {
    expect(seen[index][1]).toBe(first);
  }
  for (const index of [7, 8, 9, 10, 11, 12, 13]) {
    expect(seen[index][1]).toBe(second);
  }
  expect(seen[5][2]).toBe(initial);
  expect(seen[12][2]).toBe(first);
  expect(leaf.currentProps().value).toBe(second);
  expect(leaf.currentProps().local).toBe(second);
});

it('recovers from consecutive event and watch failures without reviving old callbacks or subscriptions', () => {
  const seen: unknown[][] = [];
  const failures: string[] = [];
  let leaf!: Leaf;
  let armed: 'event' | 'watch' | undefined;
  const stale: Array<{
    action: (value: number) => unknown;
    watch: (next: number, previous: number | undefined) => void;
    rootAction: (value: number) => unknown;
    unsubscribe: () => void;
    leaf: Leaf;
  }> = [];
  const same = (value: unknown) => {
    seen.push(['shared', value]);
  };
  class Leaf extends Example<{ value: number }> {
    constructor(props?: { value: number }) {
      super(props);
      leaf = this;
    }
    @WatchProps('value', { immediate: true }) first(
      next: number,
      previous: number | undefined
    ): void {
      seen.push(['first', next, previous]);
      if (armed === 'watch') {
        armed = undefined;
        this.setProps({ value: next + 100 });
        throw new Error('watch');
      }
    }
    @WatchProps('value', { immediate: true }) second(
      next: number,
      previous: number | undefined
    ): void {
      seen.push(['second', next, previous]);
    }
    @Emit('done') action(value: number) {
      seen.push(['action', value]);
      return value;
    }
  }
  class Parent extends Example {
    @Emit('forward') forward(value: number) {
      seen.push(['parent', value]);
      if (armed === 'event') {
        armed = undefined;
        throw new Error('event');
      }
      return value;
    }
    protected render(): VNode {
      return createComponent({
        component: Leaf,
        props: { value: 0 },
        emitters: { done: (value) => this.forward(value as number) },
      });
    }
  }
  class Root extends Example {
    @Emit('top') action(value: number) {
      seen.push(['root action', value]);
      return value;
    }
    protected render(): VNode {
      return createComponent({
        component: Parent,
        emitters: { forward: (value) => this.action(value as number) },
      });
    }
    protected onErrorCaptured(error: unknown) {
      const message = (error as Error).message;
      seen.push(['error', message]);
      failures.push(message);
      this.unmount();
      this.mount(container);
      return false;
    }
  }
  const instance = new Root();
  root = instance;
  instance.mount(container);
  const cases = ['event', 'event', 'watch', 'watch'] as const;
  for (const [index, failure] of cases.entries()) {
    const value = index + 1;
    const oldLeaf = leaf;
    const leafOff = oldLeaf.on('done', same);
    const rootOff = instance.on('top', same);
    stale.push({
      action: oldLeaf.action,
      watch: oldLeaf.first,
      rootAction: instance.action,
      unsubscribe: () => {
        leafOff();
        rootOff();
      },
      leaf: oldLeaf,
    });
    armed = failure;
    seen.length = 0;
    if (failure === 'event') oldLeaf.action(value);
    else oldLeaf.setProps({ value });
    expect(seen).toEqual(
      failure === 'event'
        ? [
            ['action', value],
            ['parent', value],
            ['error', 'event'],
            ['first', 0, undefined],
            ['second', 0, undefined],
          ]
        : [
            ['first', value, 0],
            ['error', 'watch'],
            ['first', 0, undefined],
            ['second', 0, undefined],
          ]
    );
    expect(leaf).not.toBe(oldLeaf);
    expect(oldLeaf.mounted).toBe(false);
    expect(instance.mounted).toBe(true);
    expect(container.childNodes.length).toBe(1);

    const freshLeafOff = leaf.on('done', same);
    const freshRootOff = instance.on('top', same);
    seen.length = 0;
    for (const previous of stale) {
      previous.unsubscribe();
      previous.action(999);
      previous.watch(999, 998);
      previous.rootAction(999);
      previous.leaf.setProps({ value: 999 });
    }
    expect(seen).toEqual([]);
    leaf.action(-value);
    expect(seen).toEqual([
      ['action', -value],
      ['parent', -value],
      ['root action', -value],
      ['shared', -value],
      ['shared', -value],
    ]);
    freshLeafOff();
    freshRootOff();
  }
  expect(failures).toEqual(['event', 'event', 'watch', 'watch']);
});
