import { afterEach, describe, expect, it } from 'bun:test';
import { FetchAdapter } from '../adapters/fetch';
import { createAdapter } from '../adapters';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete (globalThis as Record<string, unknown>).wx;
});
type Options = {
  success: (res: Record<string, unknown>) => void;
  fail: (err: Record<string, unknown>) => void;
};
function installMp(
  request: (options: Options) => { abort?: () => void } | void
) {
  (globalThis as Record<string, unknown>).wx = { request };
}
function outcome(
  promise: Promise<unknown>,
  milliseconds = 30
): Promise<unknown> {
  return Promise.race([
    promise.then(
      () => 'resolved',
      (error) => error
    ),
    new Promise((resolve) =>
      setTimeout(() => resolve('still pending'), milliseconds)
    ),
  ]);
}

describe('request settlement cleanup', () => {
  it('detaches completed fetch requests from a shared signal while cancelling pending requests', async () => {
    const signals: AbortSignal[] = [];
    globalThis.fetch = ((_url, init) => {
      const signal = init!.signal!;
      signals.push(signal);
      if (signals.length === 1) return Promise.resolve(new Response('ok'));
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      );
    }) as typeof fetch;
    const controller = new AbortController();
    const adapter = new FetchAdapter();
    await adapter.request({
      url: '/done',
      signal: controller.signal,
      dataType: 'text',
    });
    const pending = adapter.request({
      url: '/pending',
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
    expect(signals.map((signal) => signal.aborted)).toEqual([false, true]);
  });

  it('detaches fetch listeners on network and response-body failures', async () => {
    for (const mode of ['network', 'body'] as const) {
      const controller = new AbortController();
      let internal: AbortSignal | undefined;
      globalThis.fetch = ((_url, init) => {
        internal = init!.signal!;
        if (mode === 'network') throw new Error('offline');
        return Promise.resolve({
          headers: new Headers(),
          text: () => Promise.reject(new Error('body failed')),
        } as Response);
      }) as typeof fetch;
      await expect(
        new FetchAdapter().request({
          url: '/failed',
          signal: controller.signal,
        })
      ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
      controller.abort();
      expect(internal?.aborted).toBe(false);
    }
  });

  it('removes synchronous MP success/failure listeners and clears their timers', async () => {
    for (const mode of ['success', 'failure'] as const) {
      let aborts = 0;
      installMp((options) => {
        if (mode === 'success')
          options.success({ data: 'ok', statusCode: 200 });
        else options.fail({ errMsg: 'request:fail network' });
        return {
          abort() {
            aborts++;
          },
        };
      });
      const controller = new AbortController();
      const promise = createAdapter('weixin').request({
        url: '/sync',
        timeout: 5,
        signal: controller.signal,
      });
      if (mode === 'success') expect((await promise).data).toBe('ok');
      else
        await expect(promise).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(aborts).toBe(0);
    }
  });

  it('settles MP synchronous request throws as network errors and detaches the signal', async () => {
    installMp(() => {
      throw new Error('host threw');
    });
    const controller = new AbortController();
    await expect(
      createAdapter('weixin').request({
        url: '/throw',
        timeout: 5,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR', message: 'host threw' });
    controller.abort();
  });

  it('does not start an MP request for a pre-aborted signal', async () => {
    let started = 0;
    installMp(() => {
      started++;
      return {};
    });
    const controller = new AbortController();
    controller.abort();
    const result = await outcome(
      createAdapter('weixin').request({
        url: '/cancelled',
        signal: controller.signal,
      })
    );
    expect(result).toMatchObject({ code: 'ABORTED' });
    expect(started).toBe(0);
  });

  it('settles MP timeout even when abort is absent, throws or never invokes fail', async () => {
    for (const mode of ['absent', 'throws', 'silent'] as const) {
      let aborts = 0;
      installMp(() =>
        mode === 'absent'
          ? {}
          : {
              abort() {
                aborts++;
                if (mode === 'throws') throw new Error('abort threw');
              },
            }
      );
      const result = await outcome(
        createAdapter('weixin').request({ url: '/timeout', timeout: 5 })
      );
      expect(result).toMatchObject({ code: 'TIMEOUT' });
      expect(aborts).toBe(mode === 'absent' ? 0 : 1);
    }
  });

  it('settles MP abort without a host callback and ignores late success/failure', async () => {
    let options!: Options;
    let aborts = 0;
    installMp((captured) => {
      options = captured;
      return {
        abort() {
          aborts++;
          throw new Error('abort threw');
        },
      };
    });
    const controller = new AbortController();
    const promise = createAdapter('weixin').request({
      url: '/cancel',
      signal: controller.signal,
      timeout: 5,
    });
    expect(() => controller.abort()).not.toThrow();
    options.success({ data: 'too late', statusCode: 200 });
    options.fail({ errMsg: 'timeout' });
    expect(await outcome(promise)).toMatchObject({ code: 'ABORTED' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(aborts).toBe(1);
  });

  it('preserves abort classification when host abort synchronously reports timeout', async () => {
    let options!: Options;
    installMp((captured) => {
      options = captured;
      return {
        abort() {
          options.fail({ errMsg: 'request:fail timeout' });
        },
      };
    });
    const controller = new AbortController();
    const promise = createAdapter('weixin').request({
      url: '/cancel',
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('aborts a task returned after a signal fires synchronously inside requestFn', async () => {
    const controller = new AbortController();
    let aborted = false;
    installMp(() => {
      controller.abort();
      return {
        abort() {
          aborted = true;
        },
      };
    });
    const result = await outcome(
      createAdapter('weixin').request({
        url: '/sync-cancel',
        signal: controller.signal,
      })
    );
    expect(result).toMatchObject({ code: 'ABORTED' });
    expect(aborted).toBe(true);
  });

  it('keeps only pending MP requests connected to a shared signal', async () => {
    const options: Options[] = [];
    const aborted: number[] = [];
    installMp((captured) => {
      const index = options.length;
      options.push(captured);
      return {
        abort() {
          aborted.push(index);
        },
      };
    });
    const controller = new AbortController();
    const adapter = createAdapter('weixin');
    const done = adapter.request({ url: '/done', signal: controller.signal });
    options[0].success({ data: 'ok', statusCode: 200 });
    await done;
    const failed = adapter.request({
      url: '/failed',
      signal: controller.signal,
    });
    options[1].fail({ errMsg: 'network' });
    await expect(failed).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    const pending = adapter.request({
      url: '/pending',
      signal: controller.signal,
    });
    controller.abort();
    expect(await outcome(pending)).toMatchObject({ code: 'ABORTED' });
    expect(aborted).toEqual([2]);
  });
});
