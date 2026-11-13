import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Component, flushSync, type VNode } from '../../index';
import { createRequest, type Request, type RequestResponse } from '../index';

const originalFetch = globalThis.fetch;
let container: HTMLElement;
const instances: Component[] = [];

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  for (const instance of instances.splice(0)) instance.unmount();
  globalThis.fetch = originalFetch;
  flushSync();
  container.remove();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

class RequestOwner extends Component<
  object,
  { count: number; error: string; completed: number }
> {
  failMount = false;
  protected initState() {
    return { count: 7, error: 'none', completed: 0 };
  }
  protected initStyles() {}
  protected beforeMount() {
    if (this.failMount) throw new Error('mount failed');
  }
  protected render(): VNode {
    return {
      tag: 'span',
      children: [
        `${this.state.count}:${this.state.error}:${this.state.completed}`,
      ],
    };
  }
  load(client: Request, codes: string[], timeout = 0) {
    const controller = new AbortController();
    this.onDispose(() => controller.abort());
    const commit = this.guardCallback((response: RequestResponse<number>) => {
      this.setState({ count: response.data });
    });
    const fail = this.guardCallback((error: { code: string }) => {
      this.setState({ error: error.code });
    });
    const finish = this.guardCallback(() => {
      this.setState({ completed: this.state.completed + 1 });
    });
    const response = client
      .get<number>('/count', { signal: controller.signal, timeout })
      .catch((error) => {
        // Observe transport classification independently of the guarded UI write.
        codes.push(error.code);
        throw error;
      });
    return {
      controller,
      done: response.then(commit, fail).finally(finish),
    };
  }
}

describe('request continuations owned by a component scope', () => {
  it('keeps aborted catch/finally callbacks stale through repeated failed mounts and recovery', async () => {
    const started: ReturnType<typeof deferred<AbortSignal>>[] = [];
    let next = 0;
    globalThis.fetch = ((_url, init) => {
      const signal = init!.signal!;
      started[next++].resolve(signal);
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => reject(new DOMException('aborted', 'AbortError'));
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      });
    }) as typeof fetch;
    const owner = new RequestOwner();
    instances.push(owner);
    owner.mount(container);
    const client = createRequest({ platform: 'web' });
    const codes: string[] = [];

    for (let cycle = 0; cycle < 3; cycle++) {
      const entered = deferred<AbortSignal>();
      started.push(entered);
      const old = owner.load(client, codes, 1000);
      const transport = await entered.promise;
      owner.unmount();
      expect(transport.aborted).toBe(true);
      owner.failMount = true;
      expect(() => owner.mountToNode()).toThrow('mount failed');
      owner.failMount = false;
      owner.mount(container);
      owner.setState({ count: 20 + cycle });
      await old.done;
      flushSync();
      expect(owner.state).toEqual({
        count: 20 + cycle,
        error: 'none',
        completed: 0,
      });
    }
    expect(codes).toEqual(['ABORTED', 'ABORTED', 'ABORTED']);

    const entered = deferred<AbortSignal>();
    started.push(entered);
    const current = owner.load(client, codes);
    await entered.promise;
    current.controller.abort();
    await current.done;
    flushSync();
    expect(container.textContent).toBe('22:ABORTED:1');
  });

  it('guards success/finally after a completed fetch waits inside a response interceptor', async () => {
    const signals: AbortSignal[] = [];
    globalThis.fetch = ((_url, init) => {
      signals.push(init!.signal!);
      return Promise.resolve(new Response('99'));
    }) as typeof fetch;
    const response = deferred<RequestResponse>();
    const entered = deferred<RequestResponse>();
    const client = createRequest({ platform: 'web' });
    const interceptor = client.interceptors.response.use((value) => {
      entered.resolve(value);
      return response.promise;
    });
    const owner = new RequestOwner();
    instances.push(owner);
    owner.mount(container);
    const codes: string[] = [];
    const old = owner.load(client, codes);
    const value = await entered.promise;
    owner.unmount();
    owner.mount(container);
    owner.setState({ count: 8 });
    // The adapter has completed and detached its listener. Cancelling the
    // resource cannot cancel an arbitrary Promise returned by an interceptor.
    expect(old.controller.signal.aborted).toBe(true);
    expect(signals[0].aborted).toBe(false);
    response.resolve(value);
    await old.done;
    flushSync();
    expect(container.textContent).toBe('8:none:0');
    expect(codes).toEqual([]);

    client.interceptors.response.eject(interceptor);
    await owner.load(client, codes).done;
    flushSync();
    expect(container.textContent).toBe('99:none:1');
  });

  it('keeps an active fetch timeout classified and permits fresh requests afterwards', async () => {
    let first = true;
    globalThis.fetch = ((_url, init) => {
      if (!first) return Promise.resolve(new Response('12'));
      first = false;
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true }
        );
      });
    }) as typeof fetch;
    const owner = new RequestOwner();
    instances.push(owner);
    owner.mount(container);
    const client = createRequest({ platform: 'web' });
    const codes: string[] = [];
    await owner.load(client, codes, 1).done;
    flushSync();
    expect(container.textContent).toBe('7:TIMEOUT:1');
    expect(codes).toEqual(['TIMEOUT']);
    await owner.load(client, codes).done;
    flushSync();
    expect(container.textContent).toBe('12:TIMEOUT:2');
  });
});
