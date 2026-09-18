import { describe, expect, it, beforeEach, afterEach, spyOn } from 'bun:test';

import { Component } from '../component';
import { VNode } from '../vnode';
import {
  reactive,
  effect,
  computed,
  nextTick,
  flushSync,
  stop,
  reactiveScheduler,
} from '../reactive';

class CounterComponent extends Component {
  protected initState(): object {
    return { count: 0 };
  }

  protected initStyles(): void {
    // 测试组件不需要样式
  }

  render(): VNode {
    return {
      tag: 'div',
      children: [`Count: ${this.state.count}`],
    };
  }
}

describe('ReactiveScheduler', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.head.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    reactiveScheduler.flush();
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  it('同一批同步状态变更只触发一次 effect 运行', () => {
    const state = reactive({ count: 0 });
    let runs = 0;

    // 带调度器的 effect 才会批处理；普通 effect 保持同步执行
    effect(
      () => {
        runs += 1;
        state.count;
      },
      { scheduler: (e) => reactiveScheduler.enqueue(e) }
    );

    expect(runs).toBe(1);

    for (let i = 0; i < 1000; i += 1) {
      state.count += 1;
    }

    // 批处理：立即冲刷后只多运行一次
    flushSync();
    expect(runs).toBe(2);
    expect(state.count).toBe(1000);
  });

  it('nextTick 在待冲刷 effect 执行完成后 resolve', async () => {
    const state = reactive({ count: 0 });
    let value = 0;

    effect(
      () => {
        value = state.count;
      },
      { scheduler: (e) => reactiveScheduler.enqueue(e) }
    );

    state.count = 5;
    expect(value).toBe(0); // 尚未冲刷，保持旧值

    await nextTick();
    expect(value).toBe(5);
  });

  it('无待冲刷任务时 nextTick 立即 resolve', async () => {
    await nextTick();
    expect(true).toBe(true);
  });

  it('flushSync 同步冲刷队列', () => {
    const state = reactive({ count: 0 });
    let value = 0;

    effect(
      () => {
        value = state.count;
      },
      { scheduler: (e) => reactiveScheduler.enqueue(e) }
    );

    state.count = 7;
    expect(value).toBe(0);

    flushSync();
    expect(value).toBe(7);
  });

  it('冲刷期间新增的任务在同一轮循环中继续处理', () => {
    const state = reactive({ count: 0 });
    const runs: number[] = [];

    effect(() => {
      runs.push(state.count);
      if (state.count === 0) {
        state.count = 1;
      }
    });

    flushSync();
    expect(runs).toEqual([0, 1]);
  });

  it('已停止的 effect 在队列中被跳过', () => {
    const state = reactive({ count: 0 });
    let value = 0;

    const runner = effect(
      () => {
        value = state.count;
      },
      { scheduler: (e) => reactiveScheduler.enqueue(e) }
    );

    state.count = 3;
    stop(runner);
    flushSync();

    expect(value).toBe(0);
  });

  it('组件连续修改 state 只重渲染一次', () => {
    const component = new CounterComponent();
    component.mount(container);
    expect(container.textContent).toBe('Count: 0');

    const renderSpy = spyOn(component, 'render');
    renderSpy.mockClear();

    for (let i = 1; i <= 1000; i += 1) {
      component.state.count = i;
    }

    expect(renderSpy).not.toHaveBeenCalled(); // 批处理期间未渲染

    flushSync();
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('Count: 1000');
  });

  it('flushSync 后 DOM 已同步反映最新状态', () => {
    const component = new CounterComponent();
    component.mount(container);

    component.state.count = 1;
    component.state.count = 2;
    expect(container.textContent).toBe('Count: 0'); // 批处理中，尚未渲染

    flushSync();
    expect(container.textContent).toBe('Count: 2');
  });

  it('卸载后的组件不会因待冲刷任务而重新渲染', () => {
    const component = new CounterComponent();
    component.mount(container);

    component.state.count = 1;
    component.unmount();

    flushSync(); // 不抛错，也不产生 DOM
    expect(container.querySelector('div')).toBeNull();
  });

  it('computed 与批处理配合仍保持惰性求值', () => {
    const state = reactive({ count: 0 });
    let computedRuns = 0;

    const doubled = computed(() => {
      computedRuns += 1;
      return state.count * 2;
    });

    state.count = 1;
    state.count = 2;
    flushSync();

    expect(doubled.value).toBe(4);
    expect(computedRuns).toBe(1);
  });
});
