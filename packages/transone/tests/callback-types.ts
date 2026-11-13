import { Component } from '../lib';

// Compile-only API checks. Calling these continuations is intentionally not
// part of runtime tests: the compiler must account for an expired scope.
export class CallbackTypeChecks extends Component {
  protected initState() {
    return {};
  }
  protected initStyles() {}
  protected render() {
    return { tag: 'span' };
  }

  public checkTypes(): void {
    const sync = this.guardCallback(function (
      this: { value: number },
      increment: number
    ) {
      return this.value + increment;
    });
    const maybeNumber: number | undefined = sync.call({ value: 1 }, 2);
    // @ts-expect-error a guarded callback retains its receiver type
    sync.call({ value: 'wrong' }, 2);
    // @ts-expect-error a guarded callback retains its argument type
    sync.call({ value: 1 }, 'wrong');
    // @ts-expect-error an expired callback can return undefined
    const number: number = sync.call({ value: 1 }, 2);

    const async = this.guardCallback(async (value: number) => ({ value }));
    const result: Promise<{ value: number } | undefined> | undefined = async(1);
    // @ts-expect-error a callback can expire while its promise is pending
    const unsafe: Promise<{ value: number }> | undefined = async(1);

    const throwing = this.guardCallback(() => {
      throw new Error('callback');
    });
    const isNever: [ReturnType<typeof throwing>] extends [never]
      ? true
      : false = false;
    void [maybeNumber, number, result, unsafe, isNever];
  }
}
