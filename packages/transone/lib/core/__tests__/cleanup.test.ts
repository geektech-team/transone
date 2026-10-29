import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createApp } from '../app';
import { Component } from '../component';
import { flushSync } from '../reactive';
import {
  RendererContext,
  type ComponentInstance,
  type RenderRuntimeContext,
} from '../renderer';
import { TemplateEngine } from '../template';
import { createComponent, slot, type VNode } from '../vnode';

const calls: string[] = [];
const instances: CleanupComponent[] = [];
class CleanupComponent extends Component<
  { name?: string; fail?: string },
  { count: number }
> {
  constructor(props?: { name?: string; fail?: string }) {
    super(props);
    instances.push(this);
  }
  protected initState() {
    return { count: 0 };
  }
  protected initStyles() {
    this.styleManager.addStyle('cleanup', {
      selector: '.cleanup',
      properties: { color: 'red' },
    });
  }
  register(cleanup: () => void): () => void {
    return this.onDispose(cleanup);
  }
  fire() {
    this.emit('test');
  }
  private reentered = false;
  protected beforeUnmount() {
    calls.push(`before:${this.props.name ?? 'root'}`);
    if (!this.reentered) {
      this.reentered = true;
      this.unmount();
    }
    if (this.props.fail === 'before') throw new Error('before failed');
  }
  protected onUnmounted() {
    calls.push(`after:${this.props.name ?? 'root'}`);
    if (this.props.fail === 'after') throw new Error('after failed');
  }
  protected render(): VNode {
    return {
      tag: 'button',
      props: { className: 'cleanup', title: '{{count}}' },
      listeners: { click: () => calls.push('clicked') },
      children: [`${this.state.count}`],
    };
  }
}

beforeEach(() => {
  calls.length = 0;
  instances.length = 0;
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});
afterEach(() => {
  for (const instance of instances) {
    try {
      instance.unmount();
    } catch {}
  }
});

function mount(component: Component): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  component.mount(container);
  return container;
}

describe('exception-safe component cleanup', () => {
  it('releases DOM, bindings, providers and events after a throwing beforeUnmount', () => {
    const component = new CleanupComponent({ fail: 'before' });
    component.provide('owned', 42);
    let emitted = 0;
    component.on('test', () => emitted++);
    const container = mount(component);
    const button = component.getElement() as HTMLElement;
    expect(() => component.unmount()).toThrow('before failed');
    expect(container.childNodes).toHaveLength(0);
    expect(component.mounted).toBe(false);
    expect(component.getElement()).toBeNull();
    expect(component.inject('owned')).toBeUndefined();
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
    component.fire();
    component.state.count = 9;
    flushSync();
    button.dispatchEvent(new Event('click'));
    expect(button.getAttribute('title')).toBe('0');
    expect(emitted).toBe(0);
    expect(calls).toEqual(['before:root', 'after:root']);
    expect(() => component.unmount()).not.toThrow();
  });

  it('runs disposers once in registration order and immediately disposes late registrations', () => {
    const component = new CleanupComponent();
    const unregister = component.register(() => calls.push('removed'));
    unregister();
    component.register(() => {
      calls.push('first');
      component.register(() => calls.push('during'));
      throw new Error('dispose failed');
    });
    component.register(() => calls.push('second'));
    mount(component);
    expect(() => component.unmount()).toThrow('dispose failed');
    component.register(() => calls.push('late'));
    component.unmount();
    expect(calls).toEqual([
      'before:root',
      'first',
      'during',
      'second',
      'after:root',
      'late',
    ]);
  });

  it('retains every failure while finishing sibling cleanup and severing parent links', () => {
    class Parent extends CleanupComponent {
      protected render(): VNode {
        return {
          tag: 'div',
          children: [
            createComponent(CleanupComponent, { name: 'one', fail: 'before' }),
            createComponent(CleanupComponent, { name: 'two', fail: 'after' }),
            createComponent(CleanupComponent, { name: 'three' }),
          ],
        };
      }
    }
    const parent = new Parent();
    const container = mount(parent);
    let failure: unknown;
    try {
      parent.unmount();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AggregateError);
    expect(
      (failure as AggregateError).errors.map((error: Error) => error.message)
    ).toEqual(['before failed', 'after failed']);
    expect(calls).toEqual([
      'before:root',
      'before:one',
      'after:one',
      'before:two',
      'after:two',
      'before:three',
      'after:three',
      'after:root',
    ]);
    expect(container.childNodes).toHaveLength(0);
    for (const instance of instances) {
      expect(instance.getParentComponent()).toBeNull();
      expect(instance.mounted).toBe(false);
    }
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
  });

  it('unmounts all ordinary and slot siblings even when earlier children remove their DOM', () => {
    class Slotted extends CleanupComponent {
      protected render(): VNode {
        return slot('default');
      }
    }
    class Parent extends CleanupComponent {
      protected render(): VNode {
        return {
          tag: 'div',
          children: [
            createComponent(CleanupComponent, { name: 'ordinary-one' }),
            createComponent(CleanupComponent, { name: 'ordinary-two' }),
            createComponent(Slotted, { name: 'slot' }, [
              createComponent(CleanupComponent, { name: 'slot-one' }),
              createComponent(CleanupComponent, { name: 'slot-two' }),
            ]),
          ],
        };
      }
    }
    const parent = new Parent();
    mount(parent);
    parent.unmount();
    expect(calls.filter((call) => call.startsWith('after:'))).toEqual([
      'after:ordinary-one',
      'after:ordinary-two',
      'after:slot-one',
      'after:slot-two',
      'after:slot',
      'after:root',
    ]);
  });

  it('releases partial renders and previously mounted children when descendant mount fails', () => {
    class Broken extends CleanupComponent {
      protected render(): VNode {
        throw new Error('render failed');
      }
    }
    class Parent extends CleanupComponent {
      protected render(): VNode {
        return {
          tag: 'div',
          listeners: { click: () => calls.push('parent click') },
          children: [
            createComponent(CleanupComponent, { name: 'ready' }),
            createComponent(Broken),
          ],
        };
      }
    }
    const parent = new Parent();
    parent.register(() => calls.push('partial disposed'));
    const log = spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => mount(parent)).toThrow('render failed');
    } finally {
      log.mockRestore();
    }
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
    expect(calls).toContain('after:ready');
    expect(calls).toContain('partial disposed');
    expect(
      instances.every(
        (instance) =>
          !instance.mounted && instance.getParentComponent() === null
      )
    ).toBe(true);
    for (const instance of instances) instance.state.count++;
    flushSync();
  });

  it('treats repeated registrations of the same callback as independent resources', () => {
    const component = new CleanupComponent();
    const cleanup = () => calls.push('shared callback');
    const unregisterFirst = component.register(cleanup);
    component.register(cleanup);
    component.register(cleanup);
    unregisterFirst();
    mount(component);
    component.unmount();
    component.unmount();
    expect(calls).toEqual([
      'before:root',
      'shared callback',
      'shared callback',
      'after:root',
    ]);
  });

  it('unregisters a queued disposer even when an earlier disposer removes it', () => {
    const component = new CleanupComponent();
    let unregister = () => {};
    component.register(() => unregister());
    unregister = component.register(() => calls.push('unregistered'));
    mount(component);
    component.unmount();
    expect(calls).not.toContain('unregistered');
  });

  it('cleans up after appending the mounted root to its container fails', () => {
    const component = new CleanupComponent();
    const container = document.createElement('div');
    const append = spyOn(container, 'appendChild').mockImplementation(() => {
      throw new Error('append failed');
    });
    const log = spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => component.mount(container)).toThrow('append failed');
    } finally {
      append.mockRestore();
      log.mockRestore();
    }
    expect(component.mounted).toBe(false);
    expect(component.getElement()).toBeNull();
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
  });

  it('does not recreate descendants when a disposer flushes a queued state update', () => {
    class Parent extends CleanupComponent {
      protected render(): VNode {
        return {
          tag: 'div',
          children: this.state.count ? [createComponent(CleanupComponent)] : [],
        };
      }
    }
    const parent = new Parent();
    mount(parent);
    parent.register(() => {
      parent.state.count = 1;
      flushSync();
    });
    parent.unmount();
    expect(instances).toHaveLength(1);
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
  });

  it('can remount after disposal with styles and reactive updates restored', () => {
    const component = new CleanupComponent();
    const container = mount(component);
    component.unmount();
    component.mount(container);
    component.state.count = 7;
    flushSync();
    expect(container.textContent).toBe('7');
    expect(document.head.querySelectorAll('style')).toHaveLength(1);
  });
});

describe('exception-safe app cleanup', () => {
  it('continues plugins and root teardown and reports collected errors', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const app = createApp({
      root: CleanupComponent,
      rootProps: { fail: 'before' },
    });
    let reentered = false;
    app.use({
      install() {},
      onBeforeUnmount() {
        calls.push('plugin one');
        if (!reentered) {
          reentered = true;
          app.unmount();
        }
        throw new Error('plugin failed');
      },
    });
    app.use({
      install() {},
      onBeforeUnmount() {
        calls.push('plugin two');
      },
    });
    app.onUnmounted(() => {
      calls.push('app after');
      throw new Error('app after failed');
    });
    app.mount();
    const log = spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => app.unmount()).not.toThrow();
      expect(log).toHaveBeenCalledWith(
        'Failed to unmount app:',
        expect.any(AggregateError)
      );
    } finally {
      log.mockRestore();
    }
    expect(calls).toEqual([
      'plugin one',
      'plugin two',
      'before:root',
      'after:root',
      'app after',
    ]);
    expect(app.isRunning()).toBe(false);
    expect(document.querySelector('#app')?.childNodes).toHaveLength(0);
    expect((globalThis as { __APP__?: unknown }).__APP__).not.toBe(app);
  });

  it('resets document-only apps and preserves the global instance owned by another app', () => {
    document.body.innerHTML = '<div id="first"></div><div id="second"></div>';
    const first = createApp({ rootElement: '#first' });
    const second = createApp({ rootElement: '#second' });
    first.mount();
    second.mount();
    first.unmount();
    expect(first.isRunning()).toBe(false);
    expect((globalThis as { __APP__?: unknown }).__APP__).toBe(second);
    second.unmount();
    expect(second.isRunning()).toBe(false);
    expect((globalThis as { __APP__?: unknown }).__APP__).toBeUndefined();
  });

  it('releases roots and global ownership when app mount fails in a plugin', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const app = createApp({ root: CleanupComponent });
    app.use({
      install() {},
      onMounted() {
        throw new Error('mounted plugin failed');
      },
    });
    let pluginResource = true;
    let unmounted = false;
    app.use({
      install() {},
      onBeforeUnmount() {
        pluginResource = false;
      },
    });
    app.onUnmounted(() => {
      unmounted = true;
    });
    const log = spyOn(console, 'error').mockImplementation(() => {});
    try {
      app.mount();
    } finally {
      log.mockRestore();
    }
    expect(pluginResource).toBe(false);
    expect(unmounted).toBe(true);
    expect(app.isRunning()).toBe(false);
    expect(instances[0].mounted).toBe(false);
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
    expect((globalThis as { __APP__?: unknown }).__APP__).not.toBe(app);
  });
});

describe('renderer teardown ownership', () => {
  it.each(['element', 'slot'] as const)(
    'releases %s child registrations, emitters and sibling listeners after a child throws',
    (kind) => {
      const renderer = new RendererContext();
      const registered = new Set<ComponentInstance>();
      let emitted = 0;
      const children = [
        createComponent({
          component: CleanupComponent,
          props: { name: 'one', fail: 'before' },
          emitters: { test: () => emitted++ },
        }),
        createComponent({
          component: CleanupComponent,
          props: { name: 'two' },
          emitters: { test: () => emitted++ },
        }),
      ];
      const context: RenderRuntimeContext = {
        renderer,
        templateEngine: new TemplateEngine({}),
        slots: { content: children },
        registerChild: (child) => {
          registered.add(child);
        },
        unregisterChild: (child) => {
          registered.delete(child);
        },
      };
      const vnode =
        kind === 'element' ? { tag: 'div', children } : slot('content');
      const node = renderer.mount(vnode, context);
      const buttons = Array.from(node.childNodes);
      expect(() => renderer.unmount(vnode, node, context)).toThrow(
        'before failed'
      );
      expect(registered.size).toBe(0);
      expect(calls).toEqual([
        'before:one',
        'after:one',
        'before:two',
        'after:two',
      ]);
      for (const instance of instances) instance.fire();
      for (const button of buttons) button.dispatchEvent(new Event('click'));
      expect(emitted).toBe(0);
      expect(calls).not.toContain('clicked');
    }
  );

  it('unregisters an error-boundary placeholder instance when it is replaced', () => {
    class Boundary extends CleanupComponent {
      protected onErrorCaptured(): boolean {
        return false;
      }
    }
    class Broken extends CleanupComponent {
      protected render(): VNode {
        throw new Error('render failed');
      }
    }
    const boundary = new Boundary();
    const renderer = new RendererContext();
    const registered = new Set<ComponentInstance>();
    const context: RenderRuntimeContext = {
      renderer,
      templateEngine: new TemplateEngine({}),
      slots: {},
      registerChild: (child) => {
        registered.add(child);
        child.setParentComponent?.(boundary);
      },
      unregisterChild: (child) => {
        registered.delete(child);
        child.setParentComponent?.(null);
      },
    };
    const vnode = createComponent(Broken);
    const node = renderer.mount(vnode, context);
    expect(node.nodeType).toBe(Node.COMMENT_NODE);
    const next = createComponent(CleanupComponent);
    const nextNode = renderer.patch(vnode, next, node, context);
    expect(registered.size).toBe(1);
    renderer.unmount(next, nextNode, context);
    expect(registered.size).toBe(0);
  });

  it.each(['ordinary', 'keyed', 'slot'] as const)(
    'removes every discarded %s sibling despite teardown errors',
    (kind) => {
      const renderer = new RendererContext();
      const registered = new Set<ComponentInstance>();
      const children = [
        createComponent(
          CleanupComponent,
          { name: 'one', fail: 'before' },
          undefined,
          kind === 'keyed' ? 'one' : undefined
        ),
        createComponent(
          CleanupComponent,
          { name: 'two', fail: 'before' },
          undefined,
          kind === 'keyed' ? 'two' : undefined
        ),
      ];
      const context: RenderRuntimeContext = {
        renderer,
        templateEngine: new TemplateEngine({}),
        slots: { content: children },
        registerChild: (child) => {
          registered.add(child);
        },
        unregisterChild: (child) => {
          registered.delete(child);
        },
      };
      const vnode =
        kind === 'slot' ? slot('content') : { tag: 'div', children };
      const node = renderer.mount(vnode, context);
      context.slots.content = [];
      const next =
        kind === 'slot' ? slot('content') : { tag: 'div', children: [] };
      expect(() => renderer.patch(vnode, next, node, context)).toThrow();
      expect(node.childNodes).toHaveLength(0);
      expect(registered.size).toBe(0);
      expect(instances.every((instance) => !instance.mounted)).toBe(true);
    }
  );
});
