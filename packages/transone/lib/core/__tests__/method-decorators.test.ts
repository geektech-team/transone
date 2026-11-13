import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  Bind,
  Component,
  Debounce,
  Delay,
  reactive,
  type VNode,
} from '../../index';

let callbacks: Map<number, () => void>;
let nextTimer: number;
let now: number;
let deadlines: Map<number, number>;
let restoreTimers: () => void;
const instances: Component[] = [];

beforeEach(() => {
  callbacks = new Map();
  nextTimer = 0;
  now = 0;
  deadlines = new Map();
  const timeout = spyOn(globalThis, 'setTimeout').mockImplementation(((
    callback: () => void,
    milliseconds: number
  ) => {
    const timer = ++nextTimer;
    callbacks.set(timer, callback);
    deadlines.set(timer, now + milliseconds);
    return timer;
  }) as typeof setTimeout);
  const clear = spyOn(globalThis, 'clearTimeout').mockImplementation(((
    timer: number
  ) => {
    callbacks.delete(timer);
    deadlines.delete(timer);
  }) as typeof clearTimeout);
  restoreTimers = () => {
    timeout.mockRestore();
    clear.mockRestore();
  };
});
afterEach(() => {
  for (const instance of instances.splice(0)) instance.unmount();
  restoreTimers();
});
function runTimers(milliseconds = Infinity) {
  const until =
    milliseconds === Infinity
      ? Math.max(now, ...deadlines.values())
      : now + milliseconds;
  const batch = [...callbacks.entries()].filter(
    ([id]) => deadlines.get(id)! <= until
  );
  for (const [id, callback] of batch) {
    now = deadlines.get(id)!;
    callbacks.delete(id);
    deadlines.delete(id);
    callback();
  }
  now = until;
}
class Example extends Component<object, { count: number }> {
  protected initState() {
    return { count: 1 };
  }
  protected initStyles() {}
  protected render(): VNode {
    return { tag: 'span' };
  }
}
function track<T extends Component>(instance: T): T {
  instances.push(instance);
  return instance;
}

describe('component method decorators', () => {
  it('binds ordinary classes lazily with stable identity, receiver, arguments and returns', () => {
    class Plain {
      prefix = 'owned:';
      @Bind()
      public read(value: number, suffix: string) {
        return `${this.prefix}${value}${suffix}`;
      }
    }
    const instance = new Plain();
    const read = instance.read;
    expect(instance.read).toBe(read);
    expect(read.call({ prefix: 'foreign:' }, 2, '!')).toBe('owned:2!');
    expect(new Plain().read).not.toBe(read);
  });

  it('preserves ordinary method reassignment before and after reading bound entries', () => {
    class Plain {
      @Bind() read(): number {
        return 1;
      }
    }
    const first = new Plain();
    const replacement = () => 7;
    expect(() => {
      first.read = replacement;
    }).not.toThrow();
    expect(first.read).toBe(replacement);
    const second = new Plain();
    const original = second.read;
    expect(() => {
      second.read = replacement;
    }).not.toThrow();
    expect(second.read).toBe(replacement);
    expect(original()).toBe(1);
    class Scheduled extends Example {
      @Delay(5) add(): void {
        this.state.count++;
      }
    }
    const instance = track(new Scheduled());
    const scheduled = instance.add;
    const direct = () => {
      instance.state.count = 9;
    };
    expect(() => {
      instance.add = direct;
    }).not.toThrow();
    expect(instance.add).toBe(direct);
    instance.add();
    expect(instance.state.count).toBe(9);
    scheduled();
    runTimers();
    expect(instance.state.count).toBe(10);
  });

  it('installs Component accessors before Bun native fields capture decorated callbacks', () => {
    let initializations = 0;
    class Captured extends Example {
      boundField = this.bound;
      delayedField = this.later;
      seed = 7;
      values: number[] = [];
      protected override initState() {
        initializations++;
        return { count: this.seed };
      }
      @Bind() bound(value: number): number {
        return this.seed + value;
      }
      @Delay(5) later(value: number): void {
        this.values.push(value);
      }
    }
    const instance = track(new Captured());
    const bound = instance.boundField;
    const delayed = instance.delayedField;
    expect(initializations).toBe(0);
    expect(bound.call({ seed: 99 }, 1)).toBe(8);
    expect(instance.boundField).toBe(instance.bound);
    expect(instance.delayedField).toBe(instance.later);
    delayed(2);
    expect(instance.values).toEqual([]);
    runTimers();
    expect(instance.values).toEqual([2]);
    expect(initializations).toBe(0);
  });

  it('does not read state in decorator initializers or lazy callback getters', () => {
    let initializations = 0;
    class Lazy extends Example {
      protected override initState() {
        initializations++;
        return { count: this.seed };
      }
      seed = 7;
      @Bind() bound() {
        return this.state.count;
      }
      @Delay(5) delayed(): void {
        this.state.count++;
      }
    }
    const instance = track(new Lazy());
    const bound = instance.bound;
    const delayed = instance.delayed;
    expect(initializations).toBe(0);
    expect(bound()).toBe(7);
    delayed();
    expect(instance.state.count).toBe(7);
    runTimers();
    expect(instance.state.count).toBe(8);
    expect(initializations).toBe(1);
  });

  it('preserves subclass overrides rather than installing decorated ancestor bodies', () => {
    class Parent extends Example {
      @Bind() label() {
        return 'parent';
      }
      @Delay(5) apply(): void {
        this.state.count = 99;
      }
    }
    class Leaf extends Parent {
      override label() {
        return 'leaf';
      }
      override apply(): void {
        this.state.count = 7;
      }
    }
    const instance = track(new Leaf());
    expect(instance.label()).toBe('leaf');
    expect(instance.label).toBe(Leaf.prototype.label);
    instance.apply();
    expect(instance.state.count).toBe(7);
    expect(callbacks.size).toBe(0);
    class DecoratedLeaf extends Parent {
      @Bind() override label() {
        return 'decorated leaf';
      }
      @Debounce(5) override apply(): void {
        this.state.count = 8;
      }
    }
    const decorated = track(new DecoratedLeaf());
    const label = decorated.label;
    expect(label()).toBe('decorated leaf');
    decorated.apply();
    expect(callbacks.size).toBe(1);
    runTimers();
    expect(decorated.state.count).toBe(8);
  });

  it('schedules every Delay call while binding this and preserving arguments', () => {
    class Delayed extends Example {
      values: string[] = [];
      @Delay(5) add(value: number, suffix: string): void {
        this.values.push(`${value}${suffix}`);
      }
    }
    const instance = track(new Delayed());
    const add = instance.add;
    expect(add(1, 'a')).toBeUndefined();
    add.call({}, 2, 'b');
    expect(instance.values).toEqual([]);
    expect(callbacks.size).toBe(2);
    runTimers(4);
    expect(instance.values).toEqual([]);
    runTimers(1);
    expect(instance.values).toEqual(['1a', '2b']);
  });

  for (const mode of ['replace', 'debounce'] as const) {
    it(`keeps only the last ${mode} call independently for each instance and method`, () => {
      const decorator =
        mode === 'replace' ? Delay(5, { replace: true }) : Debounce(5);
      class Scheduled extends Example {
        values: number[] = [];
        @decorator add(value: number): void {
          this.values.push(value);
        }
        @Debounce(5) other(value: number): void {
          this.values.push(value * 10);
        }
      }
      const first = track(new Scheduled());
      const second = track(new Scheduled());
      first.add(1);
      first.add(2);
      first.other(3);
      second.add(4);
      expect(callbacks.size).toBe(3);
      runTimers();
      expect(first.values).toEqual([2, 30]);
      expect(second.values).toEqual([4]);
    });
  }

  for (const mode of ['replace', 'debounce'] as const) {
    it(`shares ${mode} pending work between successful initialization and its mount`, () => {
      const decorator =
        mode === 'replace' ? Delay(5, { replace: true }) : Debounce(5);
      let initializationEntry!: (value: number) => void;
      class Scheduled extends Example {
        values: number[] = [];
        @decorator later(value: number): void {
          this.values.push(value);
        }
        protected override initState() {
          initializationEntry = this.later;
          this.later(1);
          return { count: 1 };
        }
      }
      const instance = track(new Scheduled());
      void instance.state;
      instance.later(2);
      expect(callbacks.size).toBe(1);
      runTimers();
      expect(instance.values).toEqual([2]);
      initializationEntry(3);
      instance.later(4);
      expect(callbacks.size).toBe(1);
      runTimers();
      expect(instance.values).toEqual([2, 4]);
    });
  }

  it('invalidates replaced timer arguments before a reentrant clearTimeout callback', () => {
    class Scheduled extends Example {
      values: number[] = [];
      @Debounce(5) add(value: number): void {
        this.values.push(value);
      }
    }
    const instance = track(new Scheduled());
    instance.add(1);
    const originalClear = globalThis.clearTimeout;
    globalThis.clearTimeout = ((timer: number) => {
      callbacks.get(timer)?.();
      originalClear(timer);
    }) as typeof clearTimeout;
    try {
      instance.add(2);
      expect(instance.values).toEqual([]);
      runTimers();
      expect(instance.values).toEqual([2]);
    } finally {
      globalThis.clearTimeout = originalClear;
    }
  });

  it('retains the latest reentrant call made by a cancellation host', () => {
    class Scheduled extends Example {
      values: number[] = [];
      @Debounce(5) add(value: number): void {
        this.values.push(value);
      }
    }
    const instance = track(new Scheduled());
    instance.add(1);
    const originalClear = globalThis.clearTimeout;
    let reenter = true;
    globalThis.clearTimeout = ((timer: number) => {
      originalClear(timer);
      if (reenter) {
        reenter = false;
        instance.add(3);
      }
    }) as typeof clearTimeout;
    try {
      instance.add(2);
      expect(callbacks.size).toBe(1);
      runTimers();
      expect(instance.values).toEqual([3]);
    } finally {
      globalThis.clearTimeout = originalClear;
    }
  });

  it('invalidates replaced work even when clearTimeout throws', () => {
    class Scheduled extends Example {
      values: number[] = [];
      @Debounce(5) add(value: number): void {
        this.values.push(value);
      }
    }
    const instance = track(new Scheduled());
    instance.add(1);
    const queued = [...callbacks.values()][0]!;
    const originalClear = globalThis.clearTimeout;
    globalThis.clearTimeout = (() => {
      throw new Error('clear failed');
    }) as typeof clearTimeout;
    try {
      expect(() => instance.add(2)).toThrow('clear failed');
      queued();
      expect(instance.values).toEqual([]);
      expect(() => instance.unmount()).not.toThrow();
    } finally {
      globalThis.clearTimeout = originalClear;
    }
  });

  it('invalidates a callback retained by a throwing setTimeout host', () => {
    class Scheduled extends Example {
      values: number[] = [];
      @Delay(5) add(value: number): void {
        this.values.push(value);
      }
    }
    const instance = track(new Scheduled());
    const originalTimeout = globalThis.setTimeout;
    let queued!: () => void;
    globalThis.setTimeout = ((callback: () => void) => {
      queued = callback;
      throw new Error('set failed');
    }) as typeof setTimeout;
    try {
      expect(() => instance.add(1)).toThrow('set failed');
      queued();
      expect(instance.values).toEqual([]);
    } finally {
      globalThis.setTimeout = originalTimeout;
    }
    instance.add(2);
    runTimers();
    expect(instance.values).toEqual([2]);
  });

  it('restarts the debounce deadline from the last call', () => {
    class Scheduled extends Example {
      values: number[] = [];
      @Debounce(10) add(value: number): void {
        this.values.push(value);
      }
    }
    const instance = track(new Scheduled());
    instance.add(1);
    runTimers(7);
    instance.add(2);
    runTimers(3);
    expect(instance.values).toEqual([]);
    runTimers(7);
    expect(instance.values).toEqual([2]);
  });

  it('keeps Bind identity and direct synchronous behavior across remounts', () => {
    class Bound extends Example {
      @Bind() add(): number {
        return ++this.state.count;
      }
    }
    const instance = track(new Bound());
    const add = instance.add;
    instance.mountToNode();
    instance.unmount();
    instance.mountToNode();
    expect(instance.add).toBe(add);
    expect(add()).toBe(2);
  });

  it('combines binding with scheduling in either decorator order', () => {
    class Combined extends Example {
      values: number[] = [];
      @Bind() @Delay(5) first(value: number): void {
        this.values.push(value);
      }
      @Debounce(5) @Bind() second(value: number): void {
        this.values.push(value * 10);
      }
    }
    const instance = track(new Combined());
    const first = instance.first;
    const second = instance.second;
    expect(first).toBe(instance.first);
    expect(second).toBe(instance.second);
    first(2);
    second(3);
    second(4);
    expect(instance.values).toEqual([]);
    runTimers();
    expect(instance.values).toEqual([2, 40]);
  });

  it('clears pending work and invalidates retained entries across three remounts', () => {
    class Scheduled extends Example {
      values: number[] = [];
      @Delay(5) add(value: number): void {
        this.values.push(value);
      }
    }
    const instance = track(new Scheduled());
    const stale: Array<(value: number) => void> = [];
    const preMount = instance.add;
    instance.mountToNode();
    expect(instance.add).toBe(preMount);
    for (let cycle = 0; cycle < 3; cycle++) {
      const callback = instance.add;
      stale.push(callback);
      callback(99);
      const alreadyQueued = [...callbacks.values()];
      instance.unmount();
      expect(callbacks.size).toBe(0);
      instance.mountToNode();
      expect(instance.add).not.toBe(callback);
      stale.forEach((old) => old(99));
      alreadyQueued.forEach((expired) => expired());
      expect(callbacks.size).toBe(0);
      instance.add(cycle);
      runTimers();
    }
    expect(instance.values).toEqual([0, 1, 2]);
  });

  it('does not schedule work from cleanup or after disposal', () => {
    class Scheduled extends Example {
      values: number[] = [];
      @Delay(0) add(value: number): void {
        this.values.push(value);
      }
      protected override initStyles() {
        this.onDispose(() => this.add(99));
      }
    }
    const instance = track(new Scheduled());
    instance.mountToNode();
    instance.unmount();
    instance.add(88);
    expect(callbacks.size).toBe(0);
    instance.mountToNode();
    instance.add(1);
    runTimers();
    expect(instance.values).toEqual([1]);
  });

  it('immediately releases timers from failed lazy initialization outside mount', () => {
    let stale: (() => void) | undefined;
    class Failing extends Example {
      @Delay(5) add(): void {
        this.state.count = 99;
      }
      protected override initState(): { count: number } {
        stale = this.add;
        stale();
        throw new Error('state failed');
      }
    }
    const instance = track(new Failing());
    expect(() => instance.state).toThrow('state failed');
    expect(callbacks.size).toBe(0);
    instance.state = reactive({ count: 3 });
    instance.mountToNode();
    expect(instance.add).not.toBe(stale);
    stale!();
    expect(callbacks.size).toBe(0);
    instance.add();
    runTimers();
    expect(instance.state.count).toBe(99);
  });

  it('releases work scheduled by a preexisting entry inside failed lazy initialization', () => {
    let retained!: () => void;
    class Failing extends Example {
      @Delay(5)
      add(): void {
        this.state.count = 99;
      }
      protected override initState(): { count: number } {
        retained();
        throw new Error('state failed');
      }
    }
    const instance = track(new Failing());
    retained = instance.add;
    expect(() => instance.state).toThrow('state failed');
    expect(callbacks.size).toBe(0);
    instance.state = reactive({ count: 3 });
    instance.mountToNode();
    runTimers();
    expect(instance.state.count).toBe(3);
    retained();
    runTimers();
    expect(instance.state.count).toBe(99);
  });

  it('invalidates scheduled callbacks from failed mounting before remount recovery', () => {
    let fail = true;
    const stale: Array<() => void> = [];
    class Failing extends Example {
      @Delay(5) add(): void {
        this.state.count++;
      }
      protected override initStyles() {
        stale.push(this.add);
        this.add();
        if (fail) throw new Error('styles failed');
      }
    }
    const instance = track(new Failing());
    expect(() => instance.mountToNode()).toThrow('styles failed');
    expect(callbacks.size).toBe(0);
    fail = false;
    instance.mountToNode();
    stale[0]();
    runTimers();
    expect(instance.state.count).toBe(2);
  });

  it('routes synchronous timer failures through current component error boundaries', () => {
    const failure = new Error('scheduled failure');
    const errors: unknown[] = [];
    class Boundary extends Example {
      protected onErrorCaptured(error: unknown) {
        errors.push(error);
        return false;
      }
    }
    class Scheduled extends Example {
      @Delay(5) fail(): void {
        throw failure;
      }
    }
    const boundary = track(new Boundary());
    const instance = track(new Scheduled());
    instance.setParentComponent(boundary);
    instance.fail();
    expect(() => runTimers()).not.toThrow();
    expect(errors).toEqual([failure]);
    instance.setParentComponent(null);
    instance.fail();
    expect(() => runTimers()).toThrow(failure);
  });

  it('routes a defensive Promise rejection through its boundary exactly once', async () => {
    const failure = new Error('async scheduled boundary');
    const errors: unknown[] = [];
    class Boundary extends Example {
      protected onErrorCaptured(error: unknown) {
        errors.push(error);
        return false;
      }
    }
    class Scheduled extends Example {
      @Delay(0) fail(): void {
        return Promise.reject(failure) as unknown as void;
      }
    }
    const log = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const boundary = track(new Boundary());
      const instance = track(new Scheduled());
      instance.setParentComponent(boundary);
      instance.fail();
      runTimers();
      await new Promise(queueMicrotask);
      await new Promise(queueMicrotask);
      expect(errors).toEqual([failure]);
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('observes unsupported JavaScript Promise failures and ignores stale rejections', async () => {
    const failure = new Error('async timer failure');
    let reject!: (error: unknown) => void;
    class Scheduled extends Example {
      @Delay(5) fail(): void {
        return Promise.reject(failure) as unknown as void;
      }
      @Delay(5) pending(): void {
        return new Promise((_, no) => {
          reject = no;
        }) as unknown as void;
      }
    }
    const log = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const instance = track(new Scheduled());
      instance.fail();
      runTimers();
      await new Promise(queueMicrotask);
      await new Promise(queueMicrotask);
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0]?.[1]).toBe(failure);
      instance.pending();
      runTimers();
      instance.unmount();
      instance.mountToNode();
      reject(new Error('stale'));
      await new Promise(queueMicrotask);
      await new Promise(queueMicrotask);
      expect(log).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });

  it('rejects scheduling on an ordinary class', () => {
    class Plain {
      @Delay(5) work(): void {}
    }
    expect(() => new Plain()).toThrow('Component');
  });

  it('rejects invalid durations and options at decoration time', () => {
    for (const duration of [-1, NaN, Infinity, -Infinity, '5', null]) {
      expect(() => Delay(duration as number)).toThrow();
      expect(() => Debounce(duration as number)).toThrow();
    }
    for (const options of [null, true, [], { unknown: true }, { replace: 1 }]) {
      expect(() => Delay(5, options as { replace?: boolean })).toThrow();
    }
    expect(() => Delay(0)).not.toThrow();
    expect(() => Delay(0, { replace: false })).not.toThrow();
  });

  it('rejects unsupported targets, reserved methods and duplicate decorators', () => {
    for (const decorator of [Bind(), Delay(0), Debounce(0)]) {
      const value = () => {};
      for (const target of [
        { kind: 'getter', name: 'work' },
        { kind: 'method', name: 'work', static: true },
        { kind: 'method', name: 'work', private: true },
        ...[
          'render',
          'initState',
          'initStyles',
          'beforeMount',
          'onMounted',
          'beforeUpdate',
          'onUpdated',
          'onPropsChange',
          'beforeUnmount',
          'onUnmounted',
          'onErrorCaptured',
          'mount',
          'mountToNode',
          'unmount',
          'onLoad',
          'onReady',
          'onUnload',
          'onShow',
          'onHide',
          'onPullDownRefresh',
          'onReachBottom',
          'onShareAppMessage',
          'onPageScroll',
          'onResize',
          'created',
          'attached',
          'detached',
          'onInit',
          'didMount',
          'didUnmount',
          'didUpdate',
        ].map((name) => ({ kind: 'method', name })),
      ]) {
        expect(() =>
          decorator(value, {
            static: false,
            private: false,
            addInitializer() {},
            ...target,
          } as ClassMethodDecoratorContext)
        ).toThrow();
      }
    }
    expect(() => {
      class Duplicate {
        @Bind() @Bind() work() {}
      }
      void Duplicate;
    }).toThrow('duplicate');
    expect(() => {
      class Duplicate extends Example {
        @Delay(0) @Debounce(0) work(): void {}
      }
      void Duplicate;
    }).toThrow('scheduling');
  });
});
