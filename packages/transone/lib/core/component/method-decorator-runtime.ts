/** Internal bridge: decorators never expose Component's protected resource APIs. */
export interface MethodResourceScope {
  readonly key: object;
  readonly mountKey: object;
  isCurrent(): boolean;
  invoke(callback: () => unknown): unknown;
  onDispose(cleanup: () => void): () => void;
  observe(result: unknown): void;
}

export interface MethodDecoratorHost {
  emit(eventName: string, ...args: unknown[]): void;
  captureScope(): MethodResourceScope;
}

const hosts = new WeakMap<object, MethodDecoratorHost>();

export function registerMethodDecoratorHost(
  instance: object,
  host: MethodDecoratorHost
): void {
  hosts.set(instance, host);
}

export function getMethodDecoratorHost(
  instance: object
): MethodDecoratorHost | undefined {
  return hosts.get(instance);
}
