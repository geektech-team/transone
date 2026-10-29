/** Collect independent teardown failures without skipping later resource releases. */
export class CleanupErrors {
  private readonly errors: unknown[] = [];

  public attempt(cleanup: () => void): void {
    try {
      cleanup();
    } catch (error) {
      this.errors.push(error);
    }
  }

  public add(error: unknown): void {
    this.errors.push(error);
  }

  public throwIfAny(message: string): void {
    if (this.errors.length === 1) {
      throw this.errors[0];
    }
    if (this.errors.length > 1) {
      // AggregateError is available on modern hosts; retain all evidence on ES2020 hosts too.
      const Aggregate = (
        globalThis as unknown as {
          AggregateError?: new (errors: unknown[], message: string) => Error;
        }
      ).AggregateError;
      if (Aggregate) {
        throw new Aggregate(this.errors, message);
      }
      const error = new Error(message) as Error & { errors: unknown[] };
      error.name = 'AggregateError';
      error.errors = this.errors;
      throw error;
    }
  }
}
