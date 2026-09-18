import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createApp } from '../app';
import { Component } from '../component';
import type { VNode } from '../vnode';

class ReadyMountComponent extends Component {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {}

  protected render(): VNode {
    return {
      tag: 'main',
      props: { id: 'ready-mount' },
      children: ['Ready mount'],
    };
  }
}

interface PropRootProps {
  message: string;
}

class PropRootComponent extends Component<PropRootProps> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {}

  protected render(): VNode {
    return {
      tag: 'main',
      props: { id: 'prop-root' },
      children: [this.props.message],
    };
  }
}

describe('OneApp', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts to #app when rootElement is omitted', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const app = createApp({
      root: ReadyMountComponent,
    });

    expect(() => app.mount()).not.toThrow();

    expect(app.isRunning()).toBe(true);
    expect(document.querySelector('#app')?.textContent).toBe('Ready mount');
  });

  it('skips mounting when mount cannot find the configured root element', () => {
    const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});
    const app = createApp({
      root: ReadyMountComponent,
      rootElement: '#missing-root',
    });

    expect(() => app.mount()).not.toThrow();

    expect(app.isRunning()).toBe(false);
    expect(document.body.textContent).toBe('');
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('passes configured root props into the root component', () => {
    document.body.innerHTML = '<div id="app"></div>';
    createApp({
      root: PropRootComponent,
      rootProps: { message: 'Root props from app' },
    }).mount();

    expect(document.querySelector('#app')?.textContent).toBe(
      'Root props from app'
    );
  });
});
