import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Component, createComponent, flushSync, type VNode } from '../../index';

let container: HTMLElement;
const components: Component[] = [];
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  for (const component of components.splice(0)) component.unmount();
  container.remove();
});

describe('component initialization recovery', () => {
  it('keeps already mounted calls idempotent inside onMounted', () => {
    let mounted = 0;
    class Example extends Component {
      protected initState() {
        return {};
      }
      protected initStyles() {}
      protected render(): VNode {
        return { tag: 'span', children: ['ready'] };
      }
      protected onMounted() {
        mounted++;
        expect(this.mountToNode()).toBe(this.getElement()!);
      }
    }
    const component = new Example();
    components.push(component);
    component.mount(container);
    expect(container.textContent).toBe('ready');
    expect(mounted).toBe(1);
  });

  it('cleans the entire resource graph when a child cancels its parent mount', () => {
    let parent: Component;
    let cleaned = 0;
    let clicked = 0;
    const children: Child[] = [];
    const nodes: HTMLElement[] = [];
    class Child extends Component {
      constructor() {
        super();
        children.push(this);
      }
      protected initState() {
        return {};
      }
      protected initStyles() {
        this.onDispose(() => {
          cleaned++;
        });
        this.styleManager.addStyle('child', {
          selector: '.child',
          properties: { color: 'red' },
        });
      }
      protected render(): VNode {
        return {
          tag: 'button',
          props: {
            className: 'child',
            onClick: () => {
              clicked++;
            },
          },
        };
      }
      protected onMounted() {
        nodes.push(this.getElement() as HTMLElement);
        parent.unmount();
      }
    }
    class Parent extends Component {
      protected initState() {
        return {};
      }
      protected initStyles() {
        this.onDispose(() => {
          cleaned++;
        });
      }
      protected render(): VNode {
        return {
          tag: 'main',
          children: [createComponent(Child), createComponent(Child)],
        };
      }
    }
    parent = new Parent();
    components.push(parent);
    expect(() => parent.mountToNode()).toThrow(/cancel|unmount/i);
    expect(parent.mounted).toBe(false);
    expect(parent.getElement()).toBeNull();
    expect(children).toHaveLength(2);
    expect(cleaned).toBe(3);
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
    for (const child of children) {
      expect(child.mounted).toBe(false);
      expect(child.getParentComponent()).toBeNull();
    }
    for (const node of nodes) node.dispatchEvent(new Event('click'));
    expect(clicked).toBe(0);
  });
  for (const fails of [false, true]) {
    it(`preserves props updates made during ${fails ? 'failed' : 'successful'} state initialization`, () => {
      const failure = new Error('state failed');
      let attempts = 0;
      class Example extends Component<
        { start: number; label: string; keep?: string; added?: boolean },
        { count: number }
      > {
        protected initState() {
          attempts++;
          const start = this.props.start;
          this.setProps({ label: 'from initState', added: true });
          if (fails) throw failure;
          return { count: start };
        }
        protected initStyles() {}
        protected render(): VNode {
          return { tag: 'span', children: [this.props.label] };
        }
        snapshot() {
          return this.props;
        }
      }
      const component = new Example({ start: 1, label: 'initial' });
      components.push(component);
      component.setProps({ start: 99, label: 'current', keep: 'newer' });
      if (fails) {
        expect(() => component.state).toThrow(failure);
        expect(() => component.state).toThrow(failure);
      } else expect(component.state.count).toBe(1);
      expect(component.snapshot()).toEqual({
        start: 99,
        label: 'from initState',
        keep: 'newer',
        added: true,
      });
      expect(attempts).toBe(1);
    });
  }

  for (const phase of ['initStyles', 'beforeMount', 'render'] as const) {
    it(`rejects reentrant mounting in ${phase} and can mount after cleanup`, () => {
      let reenter = true;
      let cleaned = 0;
      let states = 0;
      class Example extends Component<object, { count: number }> {
        protected initState() {
          states++;
          return { count: 7 };
        }
        private enter(entered: string) {
          if (phase === entered && reenter) {
            reenter = false;
            this.mountToNode();
          }
        }
        protected initStyles() {
          this.onDispose(() => {
            cleaned++;
          });
          this.styleManager.addStyle('phase', {
            selector: '.phase',
            properties: { color: 'red' },
          });
          this.enter('initStyles');
        }
        protected beforeMount() {
          this.enter('beforeMount');
        }
        protected render(): VNode {
          this.enter('render');
          return {
            tag: 'span',
            props: { className: 'phase' },
            children: ['{{count}}'],
          };
        }
      }
      const component = new Example();
      components.push(component);
      expect(() => component.mountToNode()).toThrow(/mount|initializ/i);
      expect(component.mounted).toBe(false);
      expect(cleaned).toBe(1);
      expect(document.head.querySelectorAll('style')).toHaveLength(0);
      component.mount(container);
      expect(component.mounted).toBe(true);
      expect(container.textContent).toBe('7');
      component.state.count = 8;
      flushSync();
      expect(container.textContent).toBe('8');
      expect(states).toBe(1);
      component.unmount();
      expect(cleaned).toBe(2);
    });
  }

  for (const phase of [
    'initState',
    'initStyles',
    'beforeMount',
    'render',
    'onMounted',
  ] as const) {
    it(`stops a mount cancelled in ${phase} without reviving disposed resources`, () => {
      let cancel = true;
      let cleaned = 0;
      let states = 0;
      class Example extends Component<object, { count: number }> {
        private cancelAt(entered: string) {
          if (cancel && phase === entered) this.unmount();
        }
        protected initState() {
          states++;
          this.cancelAt('initState');
          return { count: 7 };
        }
        protected initStyles() {
          this.onDispose(() => {
            cleaned++;
          });
          this.styleManager.addStyle('phase', {
            selector: '.phase',
            properties: { color: 'red' },
          });
          this.cancelAt('initStyles');
        }
        protected beforeMount() {
          this.cancelAt('beforeMount');
        }
        protected render(): VNode {
          this.cancelAt('render');
          return {
            tag: 'span',
            props: { className: 'phase' },
            children: ['{{count}}'],
          };
        }
        protected onMounted() {
          this.cancelAt('onMounted');
        }
      }
      const component = new Example();
      components.push(component);
      expect(() => component.mountToNode()).toThrow(
        /cancel|unmount|initializ/i
      );
      expect(component.mounted).toBe(false);
      expect(component.getElement()).toBeNull();
      expect(document.head.querySelectorAll('style')).toHaveLength(0);
      expect(cleaned).toBe(phase === 'initState' ? 0 : 1);
      cancel = false;
      component.mount(container);
      component.state.count = 8;
      flushSync();
      expect(container.textContent).toBe('8');
      expect(states).toBe(1);
    });
  }
});
