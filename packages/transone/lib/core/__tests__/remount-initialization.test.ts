import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Component, flushSync, type VNode } from '../../index';

let container: HTMLElement;
const instances: Component[] = [];
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  for (const instance of instances.splice(0)) instance.unmount();
  flushSync();
  container.remove();
});

function inheritedComponent() {
  const calls = {
    state: [] as string[],
    styles: [] as string[],
    cleaned: [] as string[],
    renders: 0,
    updated: 0,
  };
  class Base extends Component<
    { caption: string },
    { count: number; captured: number; middle: number }
  > {
    protected seed = 2;
    protected captured = this.seed;
    protected initState() {
      calls.state.push('base');
      return { count: this.seed, captured: this.captured, middle: 0 };
    }
    protected initStyles() {
      calls.styles.push('base');
      this.onDispose(() => {
        calls.cleaned.push('base');
      });
      this.styleManager.addStyle('cycle', {
        selector: '.cycle',
        properties: { color: 'teal' },
      });
    }
    protected render(): VNode {
      return { tag: 'span' };
    }
  }
  class Middle extends Base {
    protected override seed = 5;
    protected seen = this.seed;
    protected override initState() {
      calls.state.push('middle');
      return { ...super.initState(), middle: this.seen };
    }
    protected override initStyles() {
      super.initStyles();
      calls.styles.push('middle');
      this.onDispose(() => {
        calls.cleaned.push('middle');
      });
    }
  }
  class Leaf extends Middle {
    protected override seed = 7;
    protected override initState() {
      calls.state.push('leaf');
      return super.initState();
    }
    protected override initStyles() {
      super.initStyles();
      calls.styles.push('leaf');
      this.onDispose(() => {
        calls.cleaned.push('leaf');
      });
    }
    protected override render(): VNode {
      calls.renders++;
      return {
        tag: 'span',
        props: { className: 'cycle' },
        children: [`${this.state.count}:${this.props.caption}`],
      };
    }
    protected override onUpdated() {
      calls.updated++;
    }
  }
  const component = new Leaf({ caption: 'initial' });
  instances.push(component);
  return { component, calls };
}

describe('inherited component mount generations', () => {
  for (const phase of ['beforeUpdate', 'render', 'onUpdated'] as const) {
    for (const remount of [false, true]) {
      it(`stops the old update after ${phase} ${remount ? 'remounts' : 'unmounts'} the instance`, () => {
        let armed = false;
        let updates = 0;
        let propsChanges = 0;
        let replacement: Node | null = null;
        class Example extends Component<object, { count: number }> {
          protected initState() {
            return { count: 1 };
          }
          protected initStyles() {}
          private changeAt(hook: string) {
            if (!armed || hook !== phase) return;
            armed = false;
            this.unmount();
            if (remount) {
              this.mount(container);
              replacement = this.getElement();
            }
          }
          protected beforeUpdate() {
            this.changeAt('beforeUpdate');
          }
          protected render(): VNode {
            this.changeAt('render');
            return { tag: 'span', children: [String(this.state.count)] };
          }
          protected onUpdated() {
            updates++;
            this.changeAt('onUpdated');
          }
          protected onPropsChange() {
            propsChanges++;
          }
        }
        const component = new Example();
        instances.push(component);
        component.mount(container);
        armed = true;
        component.state.count = 2;
        expect(() => flushSync()).not.toThrow();
        expect(component.mounted).toBe(remount);
        expect(component.getElement()).toBe(remount ? replacement : null);
        expect(container.textContent).toBe(remount ? '2' : '');
        expect(updates).toBe(phase === 'onUpdated' ? 1 : 0);
        expect(propsChanges).toBe(0);
        if (remount) {
          component.state.count = 3;
          flushSync();
          expect(container.textContent).toBe('3');
          expect(propsChanges).toBe(1);
        }
      });
    }
  }
  it('drops queued updates from each previous mount while preserving inherited state', () => {
    const { component, calls } = inheritedComponent();
    component.mount(container);
    const state = component.state;
    expect(state).toEqual({ count: 7, captured: 2, middle: 5 });
    for (let generation = 1; generation <= 3; generation++) {
      component.state.count++;
      component.setProps({ caption: `generation-${generation}` });
      component.unmount();
      component.mount(container);
      expect(component.state).toBe(state);
      expect(container.textContent).toBe(
        `${7 + generation}:generation-${generation}`
      );
      expect(calls.renders).toBe(generation + 1);
      flushSync();
      expect(calls.renders).toBe(generation + 1);
      expect(calls.updated).toBe(0);
    }
    expect(calls.state).toEqual(['leaf', 'middle', 'base']);
    expect(calls.styles).toEqual(
      Array.from({ length: 4 }, () => ['base', 'middle', 'leaf']).flat()
    );
    component.state.count = 20;
    flushSync();
    expect(container.textContent).toBe('20:generation-3');
    expect(calls.updated).toBe(1);
    component.unmount();
    expect(calls.cleaned).toEqual(
      Array.from({ length: 4 }, () => ['base', 'middle', 'leaf']).flat()
    );
  });

  for (const freshUpdate of [false, true]) {
    it(`drops a previous generation already in the flushing batch${freshUpdate ? ' and retains a new generation update' : ''}`, () => {
      const { component, calls } = inheritedComponent();
      component.mount(container);
      class Driver extends Component<object, { count: number }> {
        protected initState() {
          return { count: 0 };
        }
        protected initStyles() {}
        protected beforeUpdate() {
          component.unmount();
          component.mount(container);
          if (freshUpdate) component.setState({ count: 9 });
        }
        protected render(): VNode {
          return { tag: 'b', children: [String(this.state.count)] };
        }
      }
      const driver = new Driver();
      instances.push(driver);
      driver.mount(container);
      driver.state.count++;
      component.state.count++;
      flushSync();
      expect(calls.renders).toBe(freshUpdate ? 3 : 2);
      expect(calls.updated).toBe(freshUpdate ? 1 : 0);
      component.state.count++;
      flushSync();
      expect(calls.renders).toBe(freshUpdate ? 4 : 3);
      expect(calls.updated).toBe(freshUpdate ? 2 : 1);
    });
  }
});
