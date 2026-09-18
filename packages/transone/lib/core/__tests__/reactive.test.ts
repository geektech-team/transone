import { describe, expect, it, spyOn } from 'bun:test';

import {
  reactive,
  readonly,
  effect,
  ReactiveSystem,
  isReactive,
  isReadonly,
  ref,
  isRef,
  unref,
  watch,
  flushSync,
} from '../reactive';

describe('ReactiveSystem', () => {
  describe('reactive', () => {
    it('应该正确代理基本类型属性的get和set操作', () => {
      const original = { count: 0 };
      const observed = reactive(original);

      expect(observed.count).toBe(0);
      observed.count = 1;
      expect(observed.count).toBe(1);
      expect(original.count).toBe(1);
    });

    it('应该正确处理嵌套对象', () => {
      const original = { nested: { count: 0 } };
      const observed = reactive(original);

      expect(observed.nested.count).toBe(0);
      observed.nested.count = 1;
      expect(observed.nested.count).toBe(1);
      expect(original.nested.count).toBe(1);
    });

    it('应该追踪数组中嵌套对象的属性变化', () => {
      const observed = reactive({ items: [{ count: 0 }] });
      let dummy = 0;

      effect(() => {
        dummy = observed.items[0].count;
      });

      observed.items[0].count = 1;

      expect(dummy).toBe(1);
    });

    it('不应重复创建响应式对象', () => {
      const original = { count: 0 };
      const observed1 = reactive(original);
      const observed2 = reactive(observed1);

      expect(observed1).toBe(observed2);
    });
  });

  describe('effect', () => {
    it('应该正确收集和触发依赖', () => {
      const observed = reactive({ count: 0 });
      let dummy = 0;

      effect(() => {
        dummy = observed.count;
      });

      expect(dummy).toBe(0);
      observed.count++;
      expect(dummy).toBe(1);
    });

    it('应该处理多个effect', () => {
      const observed = reactive({ count: 0 });
      let dummy1 = 0;
      let dummy2 = 0;

      effect(() => {
        dummy1 = observed.count;
      });

      effect(() => {
        dummy2 = observed.count * 2;
      });

      expect(dummy1).toBe(0);
      expect(dummy2).toBe(0);

      observed.count = 2;
      expect(dummy1).toBe(2);
      expect(dummy2).toBe(4);
    });

    it('应该正确处理嵌套的effect', () => {
      const observed = reactive({ foo: 0, bar: 0 });
      let dummy = 0;

      effect(() => {
        effect(() => {
          dummy = observed.bar;
        });
        observed.foo;
      });

      expect(dummy).toBe(0);
      observed.bar = 1;
      expect(dummy).toBe(1);
    });
  });

  describe('readonly', () => {
    it('应该阻止嵌套数组和数组项被修改', () => {
      const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
      const original = { items: [{ count: 0 }] };
      const observed = readonly(original);

      expect(isReadonly(observed)).toBe(true);
      expect(isReactive(observed)).toBe(false);
      expect(isReadonly(observed.items)).toBe(true);
      expect(isReadonly(observed.items[0])).toBe(true);

      try {
        observed.items.push({ count: 1 });
      } catch {
        // Proxy set traps may throw in strict mode when readonly mutation fails.
      }

      try {
        (observed.items[0] as { count: number }).count = 2;
      } catch {
        // Proxy set traps may throw in strict mode when readonly mutation fails.
      }

      expect(original.items).toHaveLength(1);
      expect(original.items[0].count).toBe(0);
      warnSpy.mockRestore();
    });
  });

  describe('ref', () => {
    it('应该创建响应式单值引用并支持unref', () => {
      const count = ref(0);
      let dummy = 0;

      expect(isRef(count)).toBe(true);
      expect(isRef(1)).toBe(false);

      effect(() => {
        dummy = count.value;
      });

      count.value = 2;

      expect(dummy).toBe(2);
      expect(unref(count)).toBe(2);
      expect(unref('plain')).toBe('plain');
    });
  });

  describe('数组搜索方法', () => {
    it('includes/indexOf/lastIndexOf 应命中数组中的响应式元素', () => {
      const rawItem = { id: 1 };
      const rawItem2 = { id: 2 };
      const observed = reactive([rawItem, rawItem2]);

      // 传入原始对象也应命中（元素是响应式代理）
      expect(observed.includes(rawItem)).toBe(true);
      expect(observed.includes(rawItem2)).toBe(true);
      expect(observed.indexOf(rawItem2)).toBe(1);
      expect(observed.lastIndexOf(rawItem)).toBe(0);
    });

    it('includes 应命中传入的响应式对象', () => {
      const proxyItem = reactive({ id: 1 });
      const observed = reactive([proxyItem]);

      expect(observed.includes(proxyItem)).toBe(true);
      expect(observed.indexOf(proxyItem)).toBe(0);
    });

    it('不存在的对象应返回 false/-1', () => {
      const observed = reactive([{ id: 1 }]);

      expect(observed.includes({ id: 1 })).toBe(false);
      expect(observed.indexOf({ id: 1 })).toBe(-1);
    });

    it('通过索引赋值存入的元素（响应式代理）应能被原始对象命中', () => {
      const rawItem = { id: 2 };
      const observed = reactive([{ id: 1 }]);

      observed[0] = rawItem;

      expect(observed.includes(rawItem)).toBe(true);
      expect(observed.indexOf(rawItem)).toBe(0);
    });

    it('数组内容变化后应重新运行依赖搜索方法的 effect', () => {
      const rawItem = { id: 1 };
      const observed = reactive<{ id: number }[]>([]);
      let found = false;

      effect(() => {
        found = observed.includes(rawItem);
      });

      expect(found).toBe(false);
      observed.push(rawItem);
      expect(found).toBe(true);
    });
  });

  describe('watch', () => {
    it('追踪 getter 源并在变化时回调', () => {
      const observed = reactive({ count: 0 });
      const calls: Array<[number, number | undefined]> = [];

      watch(
        () => observed.count,
        (value, oldValue) => {
          calls.push([value, oldValue]);
        }
      );

      observed.count = 1;
      flushSync();

      expect(calls).toEqual([[1, 0]]);
    });

    it('支持 ref 源', () => {
      const count = ref(0);
      const calls: number[] = [];

      watch(count, (value) => {
        calls.push(value);
      });

      count.value = 2;
      flushSync();

      expect(calls).toEqual([2]);
    });

    it('immediate 时立即回调一次', () => {
      let calls = 0;

      watch(
        () => 0,
        () => {
          calls += 1;
        },
        { immediate: true }
      );

      expect(calls).toBe(1);
    });

    it('同一批多次变化只回调一次', () => {
      const observed = reactive({ count: 0 });
      const calls: Array<[number, number | undefined]> = [];

      watch(
        () => observed.count,
        (value, oldValue) => {
          calls.push([value, oldValue]);
        }
      );

      observed.count = 1;
      observed.count = 2;
      flushSync();

      expect(calls).toEqual([[2, 0]]);
    });

    it('sync 选项下变化立即回调', () => {
      const observed = reactive({ count: 0 });
      const calls: number[] = [];

      watch(
        () => observed.count,
        (value) => {
          calls.push(value);
        },
        { sync: true }
      );

      observed.count = 1;
      expect(calls).toEqual([1]);
    });

    it('deep 选项追踪嵌套属性变化', () => {
      const observed = reactive({ nested: { count: 0 } });
      const calls: number[] = [];

      watch(
        () => observed.nested,
        (value) => {
          calls.push(value.count);
        },
        { deep: true }
      );

      observed.nested.count = 1;
      flushSync();

      expect(calls).toEqual([1]);
    });

    it('返回的 stop 函数停止追踪', () => {
      const observed = reactive({ count: 0 });
      const calls: number[] = [];
      const stopWatch = watch(
        () => observed.count,
        (value) => {
          calls.push(value);
        }
      );

      observed.count = 1;
      flushSync();
      stopWatch();

      observed.count = 2;
      flushSync();

      expect(calls).toEqual([1]);
    });

    it('onCleanup 在下次回调前执行', () => {
      const observed = reactive({ count: 0 });
      const order: string[] = [];

      watch(
        () => observed.count,
        (_value, _oldValue, onCleanup) => {
          order.push('callback');
          onCleanup(() => {
            order.push('cleanup');
          });
        }
      );

      observed.count = 1;
      flushSync();
      observed.count = 2;
      flushSync();

      expect(order).toEqual(['callback', 'cleanup', 'callback']);
    });
  });

  describe('单例模式', () => {
    it('应该始终返回相同的实例', () => {
      const instance1 = ReactiveSystem.getInstance();
      const instance2 = ReactiveSystem.getInstance();

      expect(instance1).toBe(instance2);
    });
  });
});
