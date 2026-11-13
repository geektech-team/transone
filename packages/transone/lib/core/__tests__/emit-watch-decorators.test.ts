import { afterEach, describe, expect, it } from 'bun:test';
import * as Core from '../../index';
const { Component, Bind, Delay, Emit, WatchProps, flushSync } = Core;
const instances: Core.Component[] = [];
afterEach(() => {
  for (const instance of instances.splice(0)) instance.unmount();
  flushSync();
});
class Example extends Component<
  { value: number; other?: number },
  { count: number }
> {
  protected initState() {
    return { count: 0 };
  }
  protected initStyles() {}
  protected render(): Core.VNode {
    return { tag: 'span', children: [String(this.state.count)] };
  }
}
function track<T extends Core.Component>(instance: T): T {
  instances.push(instance);
  return instance;
}

describe('Emit and WatchProps decorators', () => {
  it('emits successful results and forwards arguments for undefined returns', () => {
    class E extends Example {
      @Emit('result') value(a: number, b: number) {
        return a + b + this.props.value;
      }
      @Emit('arguments') forward(_a: string, _b: number): void {}
      @Emit('nil') nil() {
        return null;
      }
    }
    const e = track(new E({ value: 2 }));
    const events: unknown[][] = [];
    e.on('result', (...args) => events.push(args));
    e.on('arguments', (...args) => events.push(args));
    e.on('nil', (...args) => events.push(args));
    const value = e.value;
    expect(value(3, 4)).toBe(9);
    expect(e.forward('a', 3)).toBeUndefined();
    expect(e.nil()).toBeNull();
    expect(events).toEqual([[9], ['a', 3], [null]]);
  });
  it('supports event names that collide with Object prototype properties', () => {
    class E extends Example {
      @Emit('constructor') constructorEvent() {
        return 1;
      }
      @Emit('__proto__') prototypeEvent() {
        return 2;
      }
    }
    const e = track(new E({ value: 0 }));
    const events: unknown[][] = [];
    const unsubscribe = e.on('constructor', (value) =>
      events.push(['constructor', value])
    );
    e.on('__proto__', (value) => events.push(['__proto__', value]));
    e.constructorEvent();
    e.prototypeEvent();
    unsubscribe();
    e.constructorEvent();
    expect(events).toEqual([
      ['constructor', 1],
      ['__proto__', 2],
    ]);
  });
  it('applies Emit to the effective method while super reuses the original body', () => {
    class Base extends Example {
      @Emit('base') action(value: number) {
        return value + 1;
      }
    }
    class Plain extends Base {
      override action(value: number) {
        return super.action(value) + 1;
      }
    }
    class Decorated extends Base {
      @Emit('leaf') override action(value: number) {
        return super.action(value) + 1;
      }
    }
    const inherited = track(new Base({ value: 0 }));
    const plain = track(new Plain({ value: 0 }));
    const decorated = track(new Decorated({ value: 0 }));
    const events: unknown[][] = [];
    for (const instance of [inherited, plain, decorated]) {
      instance.on('base', (value) => events.push(['base', value]));
      instance.on('leaf', (value) => events.push(['leaf', value]));
    }
    expect(inherited.action(1)).toBe(2);
    expect(plain.action(1)).toBe(3);
    expect(decorated.action(1)).toBe(3);
    expect(events).toEqual([
      ['base', 2],
      ['leaf', 3],
    ]);
  });
  it('does not emit on failure and keeps the original synchronous error', () => {
    const failure = new Error('action failed');
    class E extends Example {
      @Emit('done') action(): number {
        throw failure;
      }
    }
    const e = track(new E({ value: 0 }));
    const events: unknown[] = [];
    e.on('done', (value) => events.push(value));
    expect(() => e.action()).toThrow(failure);
    expect(events).toEqual([]);
  });
  it('invalidates retained Emit entries across repeated mount generations', () => {
    class E extends Example {
      @Emit('done') action(value: number) {
        this.state.count++;
        return value;
      }
    }
    const e = track(new E({ value: 0 }));
    const initial = e.action;
    for (let i = 0; i < 3; i++) {
      e.mountToNode();
      const current = e.action;
      const events: unknown[] = [];
      e.on('done', (value) => events.push(value));
      current(i);
      expect(events).toEqual([i]);
      e.unmount();
      const count = e.state.count;
      current(99);
      expect(e.state.count).toBe(count);
    }
    expect(initial(99)).toBeUndefined();
    expect(e.state.count).toBe(3);
  });
  it('suppresses emission when the action invalidates its own scope', () => {
    class E extends Example {
      @Emit('done') action() {
        this.unmount();
        return 2;
      }
    }
    const e = track(new E({ value: 0 }));
    e.mountToNode();
    let count = 0;
    e.on('done', () => count++);
    e.action();
    expect(count).toBe(0);
  });
  it('rejects Promise-like results without emitting or leaving rejections unobserved', async () => {
    class E extends Example {
      @Emit('done') action(): any {
        return Promise.reject(new Error('late'));
      }
    }
    const e = track(new E({ value: 0 }));
    let count = 0;
    e.on('done', () => count++);
    expect(() => e.action()).toThrow(/synchronous|同步/);
    await Promise.resolve();
    await Promise.resolve();
    expect(count).toBe(0);
  });
  it('notifies only changed watched props after committing props, never state', () => {
    const changes: unknown[][] = [];
    class E extends Example {
      @WatchProps('value') changed(
        next: number,
        previous: number | undefined
      ): void {
        changes.push([next, previous, this.props.value]);
      }
    }
    const e = track(new E({ value: 1 }));
    e.setProps({ value: 2 });
    expect(changes).toEqual([]);
    e.mountToNode();
    e.setProps({ other: 1 });
    e.setProps({ value: 2 });
    e.setState({ count: 1 });
    flushSync();
    expect(changes).toEqual([]);
    e.setProps({ value: 3 });
    expect(changes).toEqual([[3, 2, 3]]);
  });
  it('treats absent prototype-named props as undefined and watches own values', () => {
    const changes: unknown[][] = [];
    class E extends Component<
      { __proto__?: number; constructor?: number },
      object
    > {
      protected initState() {
        return {};
      }
      protected initStyles() {}
      protected render(): Core.VNode {
        return { tag: 'span' };
      }
      @WatchProps('__proto__', { immediate: true }) prototypeChanged(
        next: number | undefined,
        old: number | undefined
      ): void {
        changes.push(['prototype', next, old]);
      }
      @WatchProps('constructor', { immediate: true }) constructorChanged(
        next: number | undefined,
        old: number | undefined
      ): void {
        changes.push(['constructor', next, old]);
      }
    }
    const e = track(new E());
    e.mountToNode();
    e.setProps(JSON.parse('{"__proto__":1,"constructor":2}'));
    e.setProps(JSON.parse('{"__proto__":null,"constructor":null}'));
    e.setProps({ ['__proto__']: undefined, constructor: undefined });
    expect(changes).toEqual([
      ['prototype', undefined, undefined],
      ['constructor', undefined, undefined],
      ['prototype', 1, undefined],
      ['constructor', 2, undefined],
      ['prototype', null, 1],
      ['constructor', null, 2],
      ['prototype', undefined, null],
      ['constructor', undefined, null],
    ]);
  });
  it('uses Object.is comparisons for NaN and signed zero', () => {
    const changes: unknown[][] = [];
    class E extends Example {
      @WatchProps('value') changed(
        next: number,
        old: number | undefined
      ): void {
        changes.push([next, old]);
      }
    }
    const e = track(new E({ value: NaN }));
    e.mountToNode();
    e.setProps({ value: NaN });
    e.setProps({ value: 0 });
    e.setProps({ value: -0 });
    expect(changes.length).toBe(2);
    expect(Object.is(changes[0][0], 0)).toBe(true);
    expect(Number.isNaN(changes[0][1])).toBe(true);
    expect(Object.is(changes[1][0], -0)).toBe(true);
  });
  it('runs immediate watchers once per mount after derived fields and initial state', () => {
    const changes: unknown[][] = [];
    class E extends Example {
      prefix = 'ready';
      @WatchProps('value', { immediate: true }) changed(
        next: number,
        old: number | undefined
      ): void {
        changes.push([next, old, this.prefix, this.state.count]);
      }
    }
    const e = track(new E({ value: 1 }));
    expect(changes).toEqual([]);
    e.mountToNode();
    e.mountToNode();
    e.unmount();
    e.setProps({ value: 2 });
    e.mountToNode();
    expect(changes).toEqual([
      [1, undefined, 'ready', 0],
      [2, undefined, 'ready', 0],
    ]);
  });
  it('queues reentrant props batches so every watcher sees the same old and new values', () => {
    const changes: unknown[][] = [];
    class E extends Example {
      @WatchProps('value') first(next: number, old: number | undefined): void {
        changes.push(['first', next, old]);
        if (next === 1) this.setProps({ value: 2 });
      }
      @WatchProps('value') second(next: number, old: number | undefined): void {
        changes.push(['second', next, old]);
      }
    }
    const e = track(new E({ value: 0 }));
    e.mountToNode();
    e.setProps({ value: 1 });
    expect(changes).toEqual([
      ['first', 1, 0],
      ['second', 1, 0],
      ['first', 2, 1],
      ['second', 2, 1],
    ]);
  });
  it('stops an obsolete watch batch when its first callback unmounts', () => {
    const changes: number[] = [];
    class E extends Example {
      @WatchProps('value') first(next: number): void {
        changes.push(next);
        this.unmount();
      }
      @WatchProps('value') second(): void {
        changes.push(99);
      }
    }
    const e = track(new E({ value: 0 }));
    e.mountToNode();
    e.setProps({ value: 1 });
    expect(changes).toEqual([1]);
    e.mountToNode();
    expect(changes).toEqual([1]);
  });
  it('can recover after a watcher throws without replaying an old batch', () => {
    const changes: unknown[][] = [];
    class E extends Example {
      @WatchProps('value') changed(
        next: number,
        old: number | undefined
      ): void {
        changes.push([next, old]);
        if (next === 1) throw new Error('watch failed');
      }
    }
    const e = track(new E({ value: 0 }));
    e.mountToNode();
    expect(() => e.setProps({ value: 1 })).toThrow('watch failed');
    e.setProps({ value: 2 });
    expect(changes).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });
  it('does not return an emitted result after its listener fails inside a handled boundary', () => {
    const failures: unknown[] = [];
    class Boundary extends Example {
      protected onErrorCaptured(error: unknown) {
        failures.push(error);
        return false;
      }
    }
    class E extends Example {
      @Emit('done') action() {
        return 4;
      }
    }
    const parent = track(new Boundary({ value: 0 }));
    const e = track(new E({ value: 0 }));
    e.setParentComponent(parent);
    e.mountToNode();
    e.on('done', () => {
      throw new Error('listener failed');
    });
    expect(e.action()).toBeUndefined();
    expect((failures[0] as Error).message).toBe('listener failed');
  });
  it('routes watcher errors to the current parent boundary', () => {
    const failures: unknown[] = [];
    class Boundary extends Example {
      protected onErrorCaptured(error: unknown) {
        failures.push(error);
        return false;
      }
    }
    class E extends Example {
      @WatchProps('value') changed(): void {
        throw new Error('captured');
      }
    }
    const parent = track(new Boundary({ value: 0 }));
    const e = track(new E({ value: 0 }));
    e.setParentComponent(parent);
    e.mountToNode();
    expect(() => e.setProps({ value: 1 })).not.toThrow();
    expect((failures[0] as Error).message).toBe('captured');
  });
  it('uses the effective override and supports Bind composition in either order', () => {
    const changes: string[] = [];
    class Base extends Example {
      @WatchProps('value') changed(): void {
        changes.push('base');
      }
    }
    class E extends Base {
      @Bind() @WatchProps('value') override changed(): void {
        changes.push('leaf');
      }
      @Emit('done') @Bind() action(value: number) {
        return value;
      }
    }
    const e = track(new E({ value: 0 }));
    e.mountToNode();
    e.setProps({ value: 1 });
    expect(changes).toEqual(['leaf']);
    const action = e.action;
    expect(action(7)).toBe(7);
    class PlainOverride extends Base {
      override changed(): void {
        changes.push('plain');
      }
    }
    const plain = track(new PlainOverride({ value: 0 }));
    plain.mountToNode();
    plain.setProps({ value: 1 });
    expect(changes).toEqual(['leaf']);
  });
  it('notifies numeric method names in declaration order among ordinary method names', () => {
    const changes: string[] = [];
    class E extends Example {
      @WatchProps('value', { immediate: true }) named(): void {
        changes.push('named');
      }
      @WatchProps('value', { immediate: true }) '10'(): void {
        changes.push('10');
      }
      @WatchProps('value', { immediate: true }) '2'(): void {
        changes.push('2');
      }
    }
    const e = track(new E({ value: 0 }));
    e.mountToNode();
    expect(changes).toEqual(['named', '10', '2']);
    changes.length = 0;
    e.setProps({ value: 1 });
    expect(changes).toEqual(['named', '10', '2']);
    e.unmount();
    e.mountToNode();
    expect(changes).toEqual(['named', '10', '2', 'named', '10', '2']);
  });

  it('applies inherited watchers from base to leaf without reversing each layer or reviving overridden declarations', () => {
    const changes: string[] = [];
    class Base extends Example {
      @WatchProps('value', { immediate: true }) reset(): void {
        changes.push('base');
        this.state.count = 1;
      }
      @WatchProps('value', { immediate: true }) suppressed(): void {
        changes.push('overridden base');
        this.state.count = 9;
      }
    }
    class Middle extends Base {
      @WatchProps('value', { immediate: true }) first(): void {
        changes.push('middle first');
        this.state.count = this.state.count * 10 + 2;
      }
      @WatchProps('value', { immediate: true }) second(): void {
        changes.push('middle second');
        this.state.count = this.state.count * 10 + 3;
      }
    }
    class Leaf extends Middle {
      override suppressed(): void {
        changes.push('plain override');
      }
      @WatchProps('value', { immediate: true }) last(): void {
        changes.push('leaf');
        this.state.count = this.state.count * 10 + 4;
      }
    }
    const instance = track(new Leaf({ value: 0 }));
    instance.mountToNode();
    expect(instance.state.count).toBe(1234);
    expect(changes).toEqual(['base', 'middle first', 'middle second', 'leaf']);
    changes.length = 0;
    instance.setProps({ value: 1 });
    expect(instance.state.count).toBe(1234);
    expect(changes).toEqual(['base', 'middle first', 'middle second', 'leaf']);
  });
  it('prepares detached Emit callbacks before derived instance fields capture them', () => {
    class E extends Example {
      @Emit('done') action(value: number) {
        return value + this.props.value;
      }
      saved = this.action;
    }
    const e = track(new E({ value: 2 }));
    const events: unknown[] = [];
    e.on('done', (value) => events.push(value));
    const saved = e.saved;
    expect(saved(3)).toBe(5);
    expect(events).toEqual([5]);
  });
  it('invalidates callbacks retained during a failed initial state attempt', () => {
    let saved: (() => unknown) | undefined;
    class E extends Example {
      @Emit('done') action() {
        return 1;
      }
      protected override initState() {
        saved = this.action;
        throw new Error('init failed');
      }
    }
    const e = track(new E({ value: 0 }));
    expect(() => e.state).toThrow('init failed');
    let count = 0;
    e.on('done', () => count++);
    expect(saved!()).toBeUndefined();
    expect(count).toBe(0);
  });
  it('reads an invalid thenable getter once and consumes its rejection', async () => {
    let reads = 0;
    let observed = 0;
    class E extends Example {
      @Emit('done') action(): any {
        return {
          get then() {
            reads++;
            return (_resolve: unknown, reject: (error: unknown) => void) => {
              observed++;
              reject(new Error('late'));
            };
          },
        };
      }
    }
    const e = track(new E({ value: 0 }));
    expect(() => e.action()).toThrow(/synchronous/);
    await Promise.resolve();
    await Promise.resolve();
    expect(reads).toBe(1);
    expect(observed).toBe(1);
  });
  it('does not emit when inspecting a synchronous result throws', () => {
    const failure = new Error('then getter failed');
    class E extends Example {
      @Emit('done') action(): any {
        return {
          get then() {
            throw failure;
          },
        };
      }
    }
    const e = track(new E({ value: 0 }));
    let emitted = 0;
    e.on('done', () => emitted++);
    expect(() => e.action()).toThrow(failure);
    expect(emitted).toBe(0);
  });
  it('starts a fresh immediate batch on remount and abandons queued old changes', () => {
    const changes: unknown[][] = [];
    let armed = false;
    class E extends Example {
      @WatchProps('value', { immediate: true }) first(
        next: number,
        old: number | undefined
      ): void {
        changes.push(['first', next, old]);
        if (armed) {
          armed = false;
          this.setProps({ value: 2 });
          this.unmount();
          this.mountToNode();
        }
      }
      @WatchProps('value', { immediate: true }) second(
        next: number,
        old: number | undefined
      ): void {
        changes.push(['second', next, old]);
      }
    }
    const e = track(new E({ value: 0 }));
    e.mountToNode();
    changes.length = 0;
    armed = true;
    e.setProps({ value: 1 });
    expect(changes).toEqual([
      ['first', 1, 0],
      ['first', 2, undefined],
      ['second', 2, undefined],
    ]);
    e.setProps({ value: 3 });
    expect(changes.slice(-2)).toEqual([
      ['first', 3, 2],
      ['second', 3, 2],
    ]);
  });
  it('treats assignment as a replacement body while retaining the watch declaration', () => {
    const changes: string[] = [];
    class E extends Example {
      @WatchProps('value') changed(): void {
        changes.push('original');
      }
    }
    const e = track(new E({ value: 0 }));
    e.mountToNode();
    const original = e.changed;
    e.changed = function () {
      changes.push('replacement');
    };
    e.setProps({ value: 1 });
    expect(changes).toEqual(['replacement']);
    e.unmount();
    e.mountToNode();
    original();
    expect(changes).toEqual(['replacement']);
    e.setProps({ value: 2 });
    expect(changes).toEqual(['replacement', 'replacement']);
  });
  it('consumes a failed immediate notification and recovers on a later mount', () => {
    let shouldFail = true;
    const changes: unknown[][] = [];
    class E extends Example {
      @WatchProps('value', { immediate: true }) changed(
        next: number,
        old: number | undefined
      ): void {
        changes.push([next, old]);
        if (shouldFail) throw new Error('initial watch failed');
      }
    }
    const e = track(new E({ value: 0 }));
    expect(() => e.mountToNode()).toThrow('initial watch failed');
    e.setProps({ value: 1 });
    expect(changes).toEqual([[0, undefined]]);
    shouldFail = false;
    e.mountToNode();
    e.setProps({ value: 2 });
    expect(changes).toEqual([
      [0, undefined],
      [1, undefined],
      [2, 1],
    ]);
  });
  it('rejects invalid names, options, async bodies and incompatible combinations', () => {
    expect(() => Emit(' ')).toThrow();
    expect(() => WatchProps('')).toThrow();
    expect(() => WatchProps('value', { deep: true } as any)).toThrow();
    expect(() => {
      class E extends Example {
        @Emit('a') @WatchProps('value') action(): void {}
      }
      return E;
    }).toThrow();
    expect(() => {
      class E extends Example {
        @Delay(0) @Emit('a') action(): void {}
      }
      return E;
    }).toThrow();
    expect(() => {
      class E extends Example {
        @WatchProps('value') @WatchProps('value') action(): void {}
      }
      return E;
    }).toThrow();
    expect(() => {
      class E extends Example {
        @Emit('a') async action(): Promise<void> {}
      }
      return E;
    }).toThrow();
  });
});
