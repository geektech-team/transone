import {
  Bind,
  Component,
  Emit,
  WatchProps,
  type WatchPropsOptions,
} from 'transone';

export class ValueEditor extends Component<
  { value: number; optional?: string },
  { draft: number }
> {
  protected initState() {
    return { draft: this.props.value };
  }
  protected initStyles() {}
  protected render() {
    return { tag: 'span' };
  }
  @Emit('change')
  public commit(value: number): number {
    this.setState({ draft: value });
    return value;
  }
  @Bind()
  @WatchProps('value', { immediate: true })
  public receive(value: number, previous: number | undefined): void {
    void [value, previous];
  }
  @WatchProps('value')
  public receiveLater(value: number, previous: number): void {
    void [value, previous];
  }
  @WatchProps('optional')
  public receiveOptional(
    value: string | undefined,
    previous: string | undefined
  ): void {
    void [value, previous];
  }

  // @ts-expect-error unknown prop names cannot be watched
  @WatchProps('missing')
  public missing(): void {}
  // @ts-expect-error new values follow the watched prop type
  @WatchProps('value')
  public wrongValue(value: string): void {
    void value;
  }
  // @ts-expect-error old values follow the watched prop type
  @WatchProps('value')
  public wrongPrevious(value: number, previous: string): void {
    void [value, previous];
  }
  // @ts-expect-error immediate notifications have no previous value
  @WatchProps('value', { immediate: true })
  public missingImmediateUndefined(value: number, previous: number): void {
    void [value, previous];
  }
  // @ts-expect-error optional props can become undefined
  @WatchProps('optional')
  public missingOptionalUndefined(value: string): void {
    void value;
  }
  // @ts-expect-error watchers cannot return a result
  @WatchProps('value')
  public returning(): number {
    return 1;
  }
  // @ts-expect-error watchers are synchronous
  @WatchProps('value')
  public async asynchronousWatch(): Promise<void> {}
  // @ts-expect-error emitting async results is unsupported
  @Emit('change')
  public async asynchronousEmit() {
    return 1;
  }
  // @ts-expect-error any could hide a Promise return
  @Emit('change')
  public anyEmit(): any {
    return 1;
  }
  // @ts-expect-error unknown can hide a callable then at runtime
  @Emit('change')
  public unknownEmit(): unknown {
    return 1;
  }
  // @ts-expect-error Promise union returns cannot be emitted
  @Emit('change')
  public unionEmit(): number | Promise<number> {
    return 1;
  }
  // @ts-expect-error JavaScript assimilates callable then methods without the PromiseLike signature
  @Emit('change')
  public customThenable() {
    return {
      then(resolve: (value: number) => void) {
        resolve(1);
      },
    };
  }
  // @ts-expect-error an optional callable then can still be a thenable at runtime
  @Emit('change')
  public optionalThenable(): { then?: Function } {
    return {};
  }
  // @ts-expect-error an unknown then property can still be callable
  @Emit('change')
  public unknownThenable(): { then?: unknown } {
    return {};
  }
  // @ts-expect-error a callable then in one return union member remains unsafe
  @Emit('change')
  public unionCustomThenable(): number | { then: () => void } {
    return 1;
  }
  @Emit('change')
  public nestedPromisePayload() {
    return { pending: Promise.resolve(1) };
  }
  @Emit('change')
  public nonCallableThenPayload(): { then?: string } {
    return { then: 'data' };
  }

  public verify(): void {
    const value: number = this.commit(1);
    // @ts-expect-error Emit preserves the method parameter types
    this.commit('1');
    // @ts-expect-error Emit preserves the method return type
    const wrong: string = this.commit(1);
    const options: WatchPropsOptions = { immediate: true };
    void [value, wrong, options];
  }
}
