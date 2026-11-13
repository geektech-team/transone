import type {
  NativeExpression,
  NativeInstruction,
  NativeRuntimeInstance,
  NativeScreen,
} from './types';

export type NativeRuntimeValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | NativeRuntimeObject
  | NativeRuntimeValue[];
export interface NativeRuntimeObject {
  [key: string]: NativeRuntimeValue;
}
type Environment = Record<string, NativeRuntimeValue>;
type Memo = {
  value: NativeRuntimeValue;
  reads: PropertyRead[];
  propsVersion: number;
};
type PropertyRead = {
  versions: Map<string, number>;
  key: string;
  version: number;
};
type RenderSample = { reads: PropertyRead[]; propsVersion: number };
type Notification = {
  instance: string;
  method: string;
  next: NativeRuntimeValue;
  previous: NativeRuntimeValue;
};
type NotificationQueue = {
  pending: Map<string, Notification[]>;
  busy: boolean;
  owners: Set<string>;
};

/** Executable value semantics shared by compiler validation and native differential tests.
 * Native projects receive generated Swift/Kotlin/ArkTS machines, never JavaScript. */
export class NativeRuntime {
  readonly state: Environment;
  private readonly instances = new Map<string, NativeRuntimeInstance>();
  private readonly overrides = new Map<string, Environment>();
  private readonly nativeProps = new Map<string, Environment>();
  private readonly baselines = new Map<string, Environment>();
  private readonly mounted = new Set<string>();
  private readonly started = new Set<string>();
  private readonly values = new Map<
    string,
    NativeRuntimeObject | NativeRuntimeValue[]
  >();
  private readonly revisions = new WeakMap<object, number>();
  private readonly readVersions = new WeakMap<object, Map<string, number>>();
  private capturing?: PropertyRead[];
  private readonly propsVersions = new Map<string, number>();
  private readonly memos = new Map<string, Map<string, Memo>>();
  private readonly renderSamples = new Map<string, RenderSample>();
  private notifications: NotificationQueue = {
    pending: new Map(),
    busy: false,
    owners: new Set(),
  };
  private depth = 0;
  private generation = 0;
  private active = false;
  private unmounting = false;
  private mountedOnce = false;

  constructor(screen: NativeScreen) {
    this.state = Object.assign(
      Object.create(null),
      Object.fromEntries(screen.state.map((entry) => [entry.key, entry.value]))
    );
    for (const instance of screen.program?.instances ?? [])
      this.instances.set(instance.id, instance);
    // Allocate all boxes before filling any of them. This preserves graph
    // identity, including forward references, without sharing across runtimes.
    for (const entry of screen.program?.values ?? [])
      this.values.set(entry.id, entry.value.kind === 'array' ? [] : {});
    for (const entry of screen.program?.values ?? [])
      this.fill(entry.value, this.values.get(entry.id)!, Object.create(null));
    for (const [key, expression] of Object.entries(
      screen.program?.initialState ?? {}
    ))
      this.state[key] = this.evaluate(expression);
    this.syncBindings();
  }
  mount(): void {
    if (this.active || this.unmounting) return;
    this.active = true;
    this.depth = 0;
    if (this.mountedOnce)
      for (const instance of this.instances.values())
        this.bumpProps(instance.id);
    this.mountedOnce = true;
    const generation = ++this.generation;
    this.notifications = {
      pending: new Map(),
      busy: false,
      owners: new Set(),
    };
    try {
      this.syncBindings();
      const mountInstance = (instance: NativeRuntimeInstance): void => {
        if (!this.current(generation)) return;
        this.started.add(instance.id);
        if (instance.beforeMount)
          this.invoke(instance.id, instance.beforeMount);
        if (!this.current(generation)) return;
        for (const child of this.instances.values())
          if (child.parent === instance.id) mountInstance(child);
        if (!this.current(generation)) return;
        this.mounted.add(instance.id);
        const props = this.props(instance.id);
        this.baselines.set(instance.id, { ...props });
        for (const watch of instance.watchers)
          if (watch.immediate)
            this.enqueue({
              instance: instance.id,
              method: watch.method,
              next: this.own(props, watch.key),
              previous: undefined,
            });
        this.flush();
        if (this.current(generation) && instance.onMounted)
          this.invoke(instance.id, instance.onMounted);
      };
      for (const instance of this.instances.values())
        if (!instance.parent) mountInstance(instance);
    } catch (error) {
      if (this.current(generation)) {
        try {
          this.unmount();
        } catch (cleanup) {
          throw this.aggregate(
            [error, cleanup],
            'Native mount and cleanup failed'
          );
        }
      }
      throw error;
    }
  }
  unmount(): void {
    if (!this.active || this.unmounting) return;
    this.unmounting = true;
    this.active = false;
    this.generation++;
    this.notifications = {
      pending: new Map(),
      busy: false,
      owners: new Set(),
    };
    this.mounted.clear();
    this.baselines.clear();
    const failures: unknown[] = [];
    const unmountInstance = (instance: NativeRuntimeInstance): void => {
      if (!this.started.has(instance.id)) return;
      this.started.delete(instance.id);
      if (instance.beforeUnmount)
        try {
          this.call(instance.id, instance.beforeUnmount, []);
        } catch (error) {
          failures.push(error);
        }
      for (const child of this.instances.values())
        if (child.parent === instance.id) unmountInstance(child);
      if (instance.onUnmounted)
        try {
          this.call(instance.id, instance.onUnmounted, []);
        } catch (error) {
          failures.push(error);
        }
    };
    try {
      for (const instance of this.instances.values())
        if (!instance.parent) unmountInstance(instance);
    } finally {
      this.unmounting = false;
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1)
      throw this.aggregate(failures, 'Native component cleanup failed');
  }
  callback(
    instance: string,
    method: string
  ): (...args: NativeRuntimeValue[]) => NativeRuntimeValue {
    const generation = this.generation;
    return (...args) =>
      this.current(generation)
        ? this.invoke(instance, method, args)
        : undefined;
  }
  invoke(
    instance: string,
    method: string,
    args: NativeRuntimeValue[] = []
  ): NativeRuntimeValue {
    if (!this.active) return undefined;
    const generation = this.generation;
    this.depth++;
    let result: NativeRuntimeValue;
    const failures: unknown[] = [];
    try {
      result = this.call(instance, method, args);
    } catch (error) {
      if (this.current(generation)) failures.push(error);
    } finally {
      if (this.current(generation)) this.depth--;
      if (this.depth === 0 && this.current(generation))
        try {
          this.collect();
          this.flush();
        } catch (error) {
          failures.push(error);
        }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1)
      throw this.aggregate(
        failures,
        'Native action and props notification failed'
      );
    return this.current(generation) ? result : undefined;
  }
  props(instance: string): Environment {
    this.instance(instance);
    return (
      this.overrides.get(instance) ??
      this.nativeProps.get(instance) ??
      Object.create(null)
    );
  }
  private syncBindings(): void {
    const decisions = new Map<string, boolean>();
    const samples = new Map<string, RenderSample>();
    const renders = (owner: string): boolean => {
      if (decisions.has(owner)) return decisions.get(owner)!;
      if (this.instance(owner).renderDependencies === undefined) return true;
      const previous = this.renderSamples.get(owner);
      const propsVersion = this.propsVersions.get(owner) ?? 0;
      const dirty =
        !previous ||
        previous.propsVersion !== propsVersion ||
        !this.cleanReads(previous.reads);
      decisions.set(owner, dirty);
      if (dirty)
        samples.set(owner, {
          reads: this.sampleReads(owner, Object.create(null)),
          propsVersion,
        });
      return dirty;
    };
    for (const instance of this.instances.values()) {
      if (
        instance.parent &&
        this.nativeProps.has(instance.id) &&
        !renders(instance.parent)
      )
        continue;
      const native: Environment = Object.create(null);
      for (const [key, value] of Object.entries(instance.props))
        native[key] = this.evaluate(value, Object.create(null));
      const previous = this.nativeProps.get(instance.id);
      const restoresOverride =
        instance.parent !== undefined &&
        this.instance(instance.parent).renderDependencies !== undefined &&
        decisions.get(instance.parent) === true &&
        this.overrides.has(instance.id);
      if (previous && (!this.same(previous, native) || restoresOverride)) {
        const overlay = this.overrides.get(instance.id);
        if (
          restoresOverride &&
          overlay &&
          Object.keys(overlay).some(
            (key) => !Object.prototype.hasOwnProperty.call(native, key)
          )
        )
          this.overrides.set(instance.id, { ...overlay, ...native });
        else this.overrides.delete(instance.id);
        this.bumpProps(instance.id);
      }
      this.nativeProps.set(instance.id, native);
    }
    for (const [owner, sample] of samples)
      this.renderSamples.set(owner, sample);
  }
  evaluate(
    expression: NativeExpression,
    environment: Environment = Object.create(null)
  ): NativeRuntimeValue {
    switch (expression.kind) {
      case 'literal':
        return expression.value;
      case 'undefined':
        return undefined;
      case 'state':
        this.recordRead(this.state, expression.key);
        return this.state[expression.key];
      case 'prop':
        return this.own(this.props(expression.instance), expression.key);
      case 'local':
        return environment[expression.name];
      case 'value-ref': {
        const value = this.values.get(expression.id);
        if (!value) throw new Error(`Unknown native value ${expression.id}`);
        return value;
      }
      case 'object':
      case 'array':
        return this.fill(
          expression,
          expression.kind === 'array' ? [] : {},
          environment
        );
      case 'member': {
        const target = this.evaluate(expression.target, environment);
        if (target == null && expression.optional) return undefined;
        return this.readMember(
          target,
          this.evaluate(expression.key, environment)
        );
      }
      case 'revision':
        return this.enumerationRevision(
          this.evaluate(expression.value, environment),
          expression.mode
        );
      case 'memo': {
        const propsVersion = this.propsVersions.get(expression.owner) ?? 0;
        let owner = this.memos.get(expression.owner);
        if (!owner) this.memos.set(expression.owner, (owner = new Map()));
        const previous = owner.get(expression.key);
        if (
          previous &&
          previous.propsVersion === propsVersion &&
          this.cleanReads(previous.reads)
        )
          return previous.value;
        const reads = this.sampleReads(expression.owner, environment);
        const value = this.evaluate(
          !previous && expression.initial
            ? expression.initial
            : expression.value,
          environment
        );
        owner.set(expression.key, {
          value,
          reads,
          propsVersion,
        });
        return value;
      }
      case 'conditional':
        return this.evaluate(expression.condition, environment)
          ? this.evaluate(expression.whenTrue, environment)
          : this.evaluate(expression.whenFalse, environment);
      case 'call':
        return this.call(
          expression.instance,
          expression.method,
          expression.args.map((value) => this.evaluate(value, environment))
        );
      case 'unary': {
        const value = this.evaluate(expression.value, environment);
        this.validate(value);
        if (expression.operator !== '!' && expression.operator !== 'Boolean')
          this.recordCoercion(
            value,
            expression.operator === 'String' ? 'string' : 'number'
          );
        switch (expression.operator) {
          case '+':
          case 'Number':
            return Number(value);
          case '-':
            return -Number(value);
          case '!':
            return !value;
          case 'String':
            return String(value);
          case 'Boolean':
            return Boolean(value);
          default:
            throw new Error(
              `Unsupported native unary operator ${expression.operator}`
            );
        }
      }
      case 'binary': {
        const left = this.evaluate(expression.left, environment);
        if (expression.operator === '&&')
          return left ? this.evaluate(expression.right, environment) : left;
        if (expression.operator === '||')
          return left ? left : this.evaluate(expression.right, environment);
        if (expression.operator === '??')
          return left === null || left === undefined
            ? this.evaluate(expression.right, environment)
            : left;
        const right = this.evaluate(expression.right, environment);
        this.validate(left);
        this.validate(right);
        const equality = ['===', '!==', '==', '!='].includes(
          expression.operator
        );
        if (!equality) {
          this.recordCoercion(left, 'number');
          this.recordCoercion(right, 'number');
        } else if (
          ['==', '!='].includes(expression.operator) &&
          left != null &&
          right != null &&
          (typeof left === 'object') !== (typeof right === 'object')
        ) {
          this.recordCoercion(
            typeof left === 'object' ? left : right,
            'number'
          );
        }
        // Use JavaScript's ToPrimitive rules as the oracle for the generated
        // native machines, including array/object addition and comparisons.
        const jsLeft = left as number;
        const jsRight = right as number;
        switch (expression.operator) {
          case '+':
            return jsLeft + jsRight;
          case '-':
            return Number(left) - Number(right);
          case '*':
            return Number(left) * Number(right);
          case '/':
            return Number(left) / Number(right);
          case '%':
            return Number(left) % Number(right);
          case '===':
            return left === right;
          case '!==':
            return left !== right;
          case '==':
            return left == right;
          case '!=':
            return left != right;
          case '<':
            return jsLeft < jsRight;
          case '<=':
            return jsLeft <= jsRight;
          case '>':
            return jsLeft > jsRight;
          case '>=':
            return jsLeft >= jsRight;
          default:
            throw new Error(
              `Unsupported native binary operator ${expression.operator}`
            );
        }
      }
    }
  }
  private call(
    instance: string,
    method: string,
    args: NativeRuntimeValue[]
  ): NativeRuntimeValue {
    for (const argument of args) this.validate(argument);
    const declaration = this.instance(instance).methods[method];
    if (!declaration)
      throw new Error(`Unknown native method ${instance}.${method}`);
    const generation = this.generation;
    const environment: Environment = Object.create(null);
    declaration.params.forEach(
      (name, index) => (environment[name] = args[index])
    );
    const returned = this.instructions(declaration.body, environment);
    const result = returned?.value;
    if (declaration.emit && this.current(generation))
      this.emit(
        instance,
        declaration.emit,
        result === undefined ? args : [result]
      );
    return this.current(generation) ? result : undefined;
  }
  private instructions(
    instructions: NativeInstruction[],
    environment: Environment
  ): { value: NativeRuntimeValue } | undefined {
    for (const instruction of instructions) {
      switch (instruction.kind) {
        case 'assign': {
          const value = this.evaluate(instruction.value, environment);
          if (this.state[instruction.key] !== value)
            this.bumpRead(this.state, instruction.key);
          this.state[instruction.key] = value;
          break;
        }
        case 'set-member': {
          const target = this.evaluate(instruction.target, environment);
          const key = this.key(this.evaluate(instruction.key, environment));
          const value = this.evaluate(instruction.value, environment);
          this.writeMember(target, key, value);
          break;
        }
        case 'local':
          environment[instruction.name] = this.evaluate(
            instruction.value,
            environment
          );
          break;
        case 'expression':
          this.evaluate(instruction.value, environment);
          break;
        case 'return':
          return {
            value: instruction.value
              ? this.evaluate(instruction.value, environment)
              : undefined,
          };
        case 'if': {
          const returned = this.instructions(
            this.evaluate(instruction.condition, environment)
              ? instruction.then
              : instruction.otherwise,
            environment
          );
          if (returned) return returned;
          break;
        }
        case 'throw':
          throw new Error(
            String(this.evaluate(instruction.message, environment))
          );
        case 'emit':
          this.emit(
            instruction.instance,
            instruction.event,
            instruction.args.map((value) => this.evaluate(value, environment))
          );
          break;
        case 'set-props': {
          const patch: Environment = Object.create(null);
          for (const [key, value] of Object.entries(instruction.values))
            patch[key] = this.evaluate(value, environment);
          this.overrides.set(instruction.instance, {
            ...this.props(instruction.instance),
            ...patch,
          });
          this.bumpProps(instruction.instance);
          this.collect(instruction.instance);
          this.flush(instruction.instance);
          break;
        }
      }
    }
    return undefined;
  }
  private emit(
    instance: string,
    event: string,
    args: NativeRuntimeValue[]
  ): void {
    if (!this.active) return;
    const target = this.instance(instance).emitters[event];
    if (target) this.call(target.instance, target.method, args);
  }
  private collect(target?: string, draining = false): void {
    if (!this.active) return;
    const notifications = this.notifications;
    // Parent state reaches children at the render boundary. A watcher may
    // commit its own props synchronously, but cannot publish unrelated pending
    // parent bindings ahead of the remainder of this notification batch.
    if (target === undefined && notifications.busy && !draining) return;
    const generation = this.generation;
    if (target === undefined) this.syncBindings();
    const batch: Notification[] = [];
    for (const instance of this.instances.values()) {
      if (!this.current(generation) || this.notifications !== notifications)
        return;
      if (target !== undefined && instance.id !== target) continue;
      if (!this.mounted.has(instance.id)) continue;
      const next = { ...this.props(instance.id) };
      const previous = this.baselines.get(instance.id) ?? Object.create(null);
      this.baselines.set(instance.id, next);
      for (const watch of instance.watchers)
        if (
          !Object.is(this.own(next, watch.key), this.own(previous, watch.key))
        )
          batch.push({
            instance: instance.id,
            method: watch.method,
            next: this.own(next, watch.key),
            previous: this.own(previous, watch.key),
          });
    }
    if (this.current(generation) && this.notifications === notifications)
      for (const notification of batch) this.enqueue(notification);
  }
  private enqueue(notification: Notification): void {
    const pending = this.notifications.pending;
    const batch = pending.get(notification.instance);
    if (batch) batch.push(notification);
    else pending.set(notification.instance, [notification]);
  }
  private drainOwner(owner: string, notifications: NotificationQueue): void {
    if (notifications.owners.has(owner) || !this.active) return;
    notifications.owners.add(owner);
    const generation = this.generation;
    const current = () =>
      this.current(generation) && this.notifications === notifications;
    try {
      while (current()) {
        const batch = notifications.pending.get(owner);
        if (!batch) break;
        // Detach the batch so same-owner reentry queues behind its remaining listeners.
        notifications.pending.delete(owner);
        for (const notification of batch) {
          if (!current()) return;
          this.invoke(notification.instance, notification.method, [
            notification.next,
            notification.previous,
          ]);
        }
      }
    } catch (error) {
      notifications.pending.delete(owner);
      if (current()) throw error;
    } finally {
      notifications.owners.delete(owner);
    }
  }
  private flush(target?: string): void {
    const notifications = this.notifications;
    if (!this.active) return;
    if (notifications.busy) {
      if (target !== undefined) this.drainOwner(target, notifications);
      return;
    }
    notifications.busy = true;
    const generation = this.generation;
    const current = (): boolean =>
      this.current(generation) && this.notifications === notifications;
    try {
      while (current()) {
        // Map iteration skips entries consumed by nested drains and visits new
        // entries at the tail without rescanning the remaining owners.
        for (const owner of notifications.pending.keys()) {
          if (!current()) return;
          this.drainOwner(owner, notifications);
        }
        if (!current()) return;
        if (this.depth > 0) break;
        this.collect(undefined, true);
        if (!notifications.pending.size) break;
      }
    } catch (error) {
      notifications.pending.clear();
      if (current()) throw error;
    } finally {
      notifications.busy = false;
      if (!current()) notifications.pending.clear();
    }
  }
  private fill(
    expression: Extract<NativeExpression, { kind: 'object' | 'array' }>,
    target: NativeRuntimeObject | NativeRuntimeValue[],
    environment: Environment
  ): NativeRuntimeObject | NativeRuntimeValue[] {
    if (expression.kind === 'object') {
      for (const entry of expression.entries) {
        if (entry.spread) {
          const source = this.evaluate(entry.value, environment);
          if (source == null) continue;
          this.validate(source);
          const boxed = Object(source);
          for (const key of Object.keys(boxed)) {
            const descriptor = Object.getOwnPropertyDescriptor(boxed, key)!;
            this.define(target, key, descriptor.value);
          }
        } else {
          // Property key coercion is observable and precedes the value.
          const key = this.key(
            entry.key ? this.evaluate(entry.key, environment) : undefined
          );
          const value = this.evaluate(entry.value, environment);
          this.validate(value);
          this.define(target, key, value);
        }
      }
    } else {
      const array = target as NativeRuntimeValue[];
      for (const item of expression.items) {
        if (item.hole) {
          array.length++;
          continue;
        }
        const value = item.value
          ? this.evaluate(item.value, environment)
          : undefined;
        this.validate(value);
        if (item.spread) {
          if (typeof value === 'string') {
            // Array spread iterates Unicode code points; object spread uses
            // the boxed string's UTF-16 indexed own properties instead.
            for (const character of value) array.push(character);
          } else if (Array.isArray(value)) {
            for (let index = 0; index < value.length; index++)
              array.push(this.readMember(value, index));
          } else {
            throw new TypeError(
              'Native array spread requires an array or string'
            );
          }
        } else {
          array.push(value);
        }
      }
    }
    this.revisions.set(target, 0);
    return target;
  }
  private define(target: object, key: string, value: NativeRuntimeValue): void {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  private key(value: NativeRuntimeValue): string {
    this.validate(value);
    this.recordCoercion(value, 'string');
    return String(value);
  }
  private readMember(
    target: NativeRuntimeValue,
    key: NativeRuntimeValue
  ): NativeRuntimeValue {
    if (target == null)
      throw new TypeError(`Cannot read properties of ${target}`);
    this.validate(target);
    const property = this.key(key);
    if (typeof target === 'object') this.recordRead(target, property);
    const descriptor = Object.getOwnPropertyDescriptor(
      Object(target),
      property
    );
    return descriptor?.value;
  }
  private writeMember(
    target: NativeRuntimeValue,
    key: NativeRuntimeValue,
    value: NativeRuntimeValue
  ): void {
    if (target === null || typeof target !== 'object')
      throw new TypeError(
        'Native member assignment requires an object or array'
      );
    this.validate(target);
    const property = this.key(key);
    this.validate(value);
    const previous = Object.getOwnPropertyDescriptor(target, property);
    if (previous && !previous.writable)
      throw new TypeError(`Cannot assign to read only property ${property}`);
    const previousLength = Array.isArray(target) ? target.length : undefined;
    if (previous) Object.defineProperty(target, property, { value });
    else this.define(target, property, value);
    const next = Object.getOwnPropertyDescriptor(target, property);
    if (previous?.value !== next?.value) {
      this.bumpRead(target, property);
      if (Array.isArray(target) && !Number.isNaN(Number(property)))
        this.bumpRead(target, 'length');
    }
    if (
      !previous ||
      !Object.is(previous.value, next?.value) ||
      (Array.isArray(target) && previousLength !== target.length)
    )
      this.revisions.set(target, this.revision(target) + 1);
  }
  private versions(target: object): Map<string, number> {
    let versions = this.readVersions.get(target);
    if (!versions) this.readVersions.set(target, (versions = new Map()));
    return versions;
  }
  private cleanReads(reads: PropertyRead[]): boolean {
    return reads.every(
      (read) => (read.versions.get(read.key) ?? 0) === read.version
    );
  }
  private sampleReads(owner: string, environment: Environment): PropertyRead[] {
    const reads: PropertyRead[] = [],
      outer = this.capturing;
    this.capturing = reads;
    try {
      for (const dependency of this.instance(owner).renderDependencies ?? [])
        this.evaluate(dependency, environment);
      return reads;
    } finally {
      this.capturing = outer;
    }
  }
  private recordRead(target: object, key: string): void {
    if (!this.capturing) return;
    const versions = this.versions(target);
    this.capturing.push({ versions, key, version: versions.get(key) ?? 0 });
  }
  private bumpRead(target: object, key: string): void {
    const versions = this.versions(target);
    versions.set(key, (versions.get(key) ?? 0) + 1);
  }
  private enumerationRevision(
    value: NativeRuntimeValue,
    mode?: 'object' | 'array'
  ): number {
    if (value !== null && typeof value === 'object' && this.capturing) {
      if (Array.isArray(value) && mode !== 'object') {
        this.recordRead(value, 'length');
        for (let index = 0; index < value.length; index++)
          this.recordRead(value, String(index));
      } else for (const key of Object.keys(value)) this.recordRead(value, key);
    }
    return this.revision(value);
  }
  private recordCoercion(
    value: NativeRuntimeValue,
    hint: 'string' | 'number',
    seen = new Set<object>()
  ): void {
    if (!this.capturing || value === null || typeof value !== 'object') return;
    if (hint === 'number') this.recordRead(value, 'valueOf');
    this.recordRead(value, 'toString');
    if (Object.prototype.hasOwnProperty.call(value, 'toString')) {
      if (hint === 'string') this.recordRead(value, 'valueOf');
      return;
    }
    if (!Array.isArray(value)) return;
    this.recordRead(value, 'join');
    if (Object.prototype.hasOwnProperty.call(value, 'join') || seen.has(value))
      return;
    seen.add(value);
    try {
      this.recordRead(value, 'length');
      for (let index = 0; index < value.length; index++) {
        this.recordRead(value, String(index));
        this.recordCoercion(value[index], 'string', seen);
      }
    } finally {
      seen.delete(value);
    }
  }
  private revision(value: NativeRuntimeValue): number {
    return value !== null && typeof value === 'object'
      ? (this.revisions.get(value) ?? 0)
      : 0;
  }
  private bumpProps(instance: string): void {
    this.propsVersions.set(
      instance,
      (this.propsVersions.get(instance) ?? 0) + 1
    );
  }
  private validate(
    value: NativeRuntimeValue,
    seen = new WeakSet<object>()
  ): void {
    if (
      value === null ||
      value === undefined ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    )
      return;
    if (typeof value !== 'object')
      throw new TypeError('Unsupported native value');
    if (seen.has(value)) return;
    seen.add(value);
    const prototype = Object.getPrototypeOf(value);
    if (
      Array.isArray(value)
        ? prototype !== Array.prototype
        : prototype !== Object.prototype && prototype !== null
    )
      throw new TypeError('Native values must be plain objects or arrays');
    if (Object.getOwnPropertySymbols(value).length)
      throw new TypeError('Native values cannot contain symbol properties');
    for (const descriptor of Object.values(
      Object.getOwnPropertyDescriptors(value)
    )) {
      if (!('value' in descriptor))
        throw new TypeError('Native values cannot contain accessors');
      this.validate(descriptor.value, seen);
    }
  }
  private instance(id: string): NativeRuntimeInstance {
    const instance = this.instances.get(id);
    if (!instance) throw new Error(`Unknown native instance ${id}`);
    return instance;
  }
  private current(generation: number): boolean {
    return this.active && this.generation === generation;
  }
  private same(left: Environment, right: Environment): boolean {
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(right, key) &&
          Object.is(left[key], right[key])
      )
    );
  }
  private own(values: Environment, key: string): NativeRuntimeValue {
    return Object.prototype.hasOwnProperty.call(values, key)
      ? values[key]
      : undefined;
  }
  private aggregate(errors: unknown[], message: string): Error {
    const error = new Error(message);
    error.name = 'AggregateError';
    Object.defineProperty(error, 'errors', { value: errors });
    return error;
  }
}
