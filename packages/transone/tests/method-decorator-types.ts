import { Bind, Component, Debounce, Delay, type DelayOptions } from 'transone';

export class MethodDecoratorTypeChecks extends Component {
  protected initState() {
    return {};
  }
  protected initStyles() {}
  protected render() {
    return { tag: 'span' };
  }

  @Bind()
  public bound(value: number): string {
    return String(value);
  }

  @Delay(0)
  public delayed(value: string): void {
    void value;
  }

  @Debounce(10)
  public debounced(value: number): void {
    void value;
  }

  @Bind()
  @Delay(0, { replace: true })
  public combined(): void {}

  @Debounce(10)
  @Bind()
  public reverseCombined(): void {}

  // @ts-expect-error a scheduled method must not promise a result
  @Delay(0)
  public invalidResult(): number {
    return 1;
  }

  // @ts-expect-error an any return contract could promise a result or Promise
  @Delay(0)
  public invalidAny(): any {
    return 1;
  }

  // @ts-expect-error scheduling requires the explicit void contract, not undefined
  @Delay(0)
  public invalidUndefined(): undefined {
    return;
  }

  // @ts-expect-error scheduling requires the explicit void contract, not never
  @Debounce(0)
  public invalidNever(): never {
    throw new Error('never');
  }

  // @ts-expect-error a scheduled method must not retain an async Promise contract
  @Debounce(0)
  public async invalidAsync(): Promise<void> {}

  // @ts-expect-error binding must not hide the result contract from scheduling
  @Delay(0)
  @Bind()
  public invalidCombination(): string {
    return 'result';
  }

  @Bind()
  // @ts-expect-error either decoration order must reject async scheduling
  @Delay(0)
  public async invalidReverseCombination(): Promise<void> {}

  public verifyCallTypes(): void {
    const result: string = this.bound(1);
    const delayed: void = this.delayed('value');
    // @ts-expect-error scheduled methods retain their argument types
    this.delayed(1);
    // @ts-expect-error Bind retains its return type
    const wrong: number = this.bound(1);
    // @ts-expect-error Delay only accepts its replace option
    const options: DelayOptions = { leading: true };
    void [result, delayed, wrong, options];
  }
}

export class OrdinaryClassTypeChecks {
  @Bind()
  public bound(): number {
    return 1;
  }

  // @ts-expect-error scheduling requires Component resource ownership
  @Delay(0)
  public scheduled(): void {}
}
