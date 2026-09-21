import { describe, expect, test } from 'bun:test';
import { debounce } from '../lib/core/debounce';

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('debounce', () => {
  test('连续触发合并为一次执行（只在停止后执行）', async () => {
    let calls = 0;
    const d = debounce(() => {
      calls += 1;
    }, 30);

    for (let i = 0; i < 5; i += 1) {
      d.run();
      await tick(5); // 每次触发都在防抖窗口内
    }
    expect(calls).toBe(0);
    expect(d.pending()).toBe(true);

    await tick(60); // 窗口过后才执行一次
    expect(calls).toBe(1);
    expect(d.pending()).toBe(false);
  });

  test('传参透传给目标函数（取最后一次）', async () => {
    let received = 0;
    const d = debounce((value: number) => {
      received = value;
    }, 20);

    d.run(1);
    d.run(2);
    d.run(3);
    await tick(60);
    expect(received).toBe(3);
  });

  test('cancel 取消待执行调用', async () => {
    let calls = 0;
    const d = debounce(() => {
      calls += 1;
    }, 20);

    d.run();
    d.cancel();
    expect(d.pending()).toBe(false);
    await tick(60);
    expect(calls).toBe(0);
  });

  test('执行一次后可再次触发（非一次性）', async () => {
    let calls = 0;
    const d = debounce(() => {
      calls += 1;
    }, 10);

    d.run();
    await tick(40);
    d.run();
    await tick(40);
    expect(calls).toBe(2);
  });
});
