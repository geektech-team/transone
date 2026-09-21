import { afterEach, describe, expect, test } from 'bun:test';
import { TcChart } from '../lib/component';

describe('TcChart 小程序生命周期', () => {
  const originalWx = Reflect.get(globalThis, 'wx');

  afterEach(() => {
    if (originalWx === undefined) {
      Reflect.deleteProperty(globalThis, 'wx');
    } else {
      Reflect.set(globalThis, 'wx', originalWx);
    }
  });

  test('小程序编译丢失类字段初始化时不访问 Web hoverHandlers', () => {
    Reflect.set(globalThis, 'wx', {});
    const chart = Object.create(TcChart.prototype) as TcChart & {
      setupHoverEvents(): void;
    };

    expect(() => chart.setupHoverEvents()).not.toThrow();
  });

  test('组件宿主填满父容器，为 Canvas 提供可解析尺寸', () => {
    const chart = new TcChart({
      option: { type: 'radar', indicators: [], series: [] },
    });
    const styles = (
      chart as unknown as {
        styleManager: { styles: Map<string, unknown> };
      }
    ).styleManager.styles;

    expect(styles.get('tc-chart-host')).toEqual({
      selector: ':host',
      properties: {
        display: 'block',
        height: '100%',
        width: '100%',
      },
    });
  });
});
