import { Component } from '../component';
import { VNode, createComponent } from '../vnode';
import { flushSync } from '../reactive';
import { describe, expect, it, beforeEach, afterEach, spyOn } from 'bun:test';

class TestComponent extends Component {
  protected initState(): object {
    return { count: 0 };
  }

  protected initStyles(): void {
    // 测试组件不需要样式
  }

  render(): VNode {
    return {
      tag: 'div',
      props: { id: 'test-component' },
      children: [`Count: ${this.state.count}`],
    };
  }
}

class StyledComponent extends TestComponent {
  protected override initStyles(): void {
    this.styleManager.addStyle('styled', {
      selector: '.styled-host',
      properties: { color: 'red' },
    });
  }

  override render(): VNode {
    return { tag: 'div', props: { className: 'styled-host' } };
  }
}

describe('Component', () => {
  let component: TestComponent;
  let container: HTMLElement;

  beforeEach(() => {
    document.head.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    component = new TestComponent();
  });

  afterEach(() => {
    component.unmount();
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  describe('生命周期', () => {
    it('应该正确执行mount和unmount', () => {
      component.mount(container);
      expect(container.querySelector('#test-component')).toBeTruthy();
      expect(container.textContent).toBe('Count: 0');

      component.unmount();
      expect(container.querySelector('#test-component')).toBeFalsy();
    });

    it('无样式组件不应创建 style 元素', () => {
      component.mount(container);
      expect(document.head.querySelectorAll('style')).toHaveLength(0);

      component.unmount();
      expect(document.head.querySelectorAll('style')).toHaveLength(0);
    });

    it('卸载时应该移除组件创建的style元素', () => {
      const styled = new StyledComponent();

      styled.mount(container);
      expect(document.head.querySelectorAll('style')).toHaveLength(1);
      expect(document.head.querySelector('style')?.textContent).toContain(
        '.styled-host'
      );

      styled.unmount();
      expect(document.head.querySelectorAll('style')).toHaveLength(0);
    });
  });

  describe('状态管理', () => {
    it('应该正确处理状态更新', () => {
      component.mount(container);
      const initialText = container.textContent;

      // 通过修改响应式状态来触发更新（批处理，需冲刷后生效）
      component.state.count = 1;
      flushSync();
      expect(container.textContent).not.toBe(initialText);
      expect(container.textContent).toBe('Count: 1');
    });

    it('状态更新应该触发重新渲染', () => {
      const renderSpy = spyOn(component, 'render');
      component.mount(container);
      renderSpy.mockClear(); // 清除mount时的render调用

      component.state.count = 2;
      flushSync();
      expect(renderSpy).toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    it('应该捕获渲染错误', () => {
      const error = new Error('Render error');
      const consoleSpy = spyOn(console, 'error').mockImplementation(() => {});
      spyOn(component, 'render').mockImplementation(() => {
        throw error;
      });

      expect(() => component.mount(container)).toThrow(error);
      expect(consoleSpy).toHaveBeenCalledWith('组件渲染错误:', error);
      consoleSpy.mockRestore();
    });
  });
});

class PropBatchChild extends Component<{ label: string }, object> {
  static renderCount = 0;

  protected initState(): object {
    return {};
  }

  protected initStyles(): void {}

  render(): VNode {
    PropBatchChild.renderCount += 1;
    return { tag: 'span', children: [this.props.label] };
  }
}

describe('渲染依赖隔离', () => {
  class ChildComponent extends Component<object, { count: number }> {
    static lastInstance: ChildComponent | null = null;
    renderCount = 0;

    constructor(props?: object) {
      super(props);
      ChildComponent.lastInstance = this;
    }

    protected initState(): { count: number } {
      return { count: 0 };
    }

    protected initStyles(): void {}

    render(): VNode {
      this.renderCount += 1;
      return { tag: 'span', children: [`${this.state.count}`] };
    }
  }

  class ParentComponent extends Component<object, { trigger: number }> {
    updateCount = 0;

    protected initState(): { trigger: number } {
      return { trigger: 0 };
    }

    protected initStyles(): void {}

    protected onUpdated(): void {
      this.updateCount += 1;
    }

    render(): VNode {
      return {
        tag: 'div',
        children: [createComponent(ChildComponent), { tag: 'i' }],
      };
    }
  }

  let parent: ParentComponent;
  let container: HTMLElement;

  beforeEach(() => {
    document.head.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    parent = new ParentComponent();
  });

  afterEach(() => {
    parent.unmount();
    ChildComponent.lastInstance = null;
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  it('子组件内部状态变化不应触发父组件重渲染', () => {
    parent.mount(container);
    const child = ChildComponent.lastInstance as ChildComponent;
    expect(child).toBeTruthy();

    // 先触发一次父组件更新，使父 effect 在 patch 子组件时执行子组件 render
    parent.state.trigger = 1;
    flushSync();
    parent.updateCount = 0;

    child.state.count += 1;
    flushSync();

    expect(parent.updateCount).toBe(0);
  });

  it('子组件内部状态变化不应导致子组件被重复渲染', () => {
    parent.mount(container);
    const child = ChildComponent.lastInstance as ChildComponent;

    // 先触发一次父组件更新制造依赖污染场景
    parent.state.trigger = 1;
    flushSync();

    child.renderCount = 0;
    child.state.count += 1;
    flushSync();

    expect(child.renderCount).toBe(1);
  });
});

describe('props 批处理', () => {
  let child: PropBatchChild;
  let container: HTMLElement;

  beforeEach(() => {
    document.head.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    child = new PropBatchChild({ label: 'init' });
  });

  afterEach(() => {
    child.unmount();
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  it('同一批连续 setProps 只触发一次更新', () => {
    child.mount(container);
    PropBatchChild.renderCount = 0;

    child.setProps({ label: 'a' });
    child.setProps({ label: 'b' });
    flushSync();

    expect(PropBatchChild.renderCount).toBe(1);
    expect(container.textContent).toBe('b');
  });
});

class ErrorChild extends Component {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {}

  render(): VNode {
    throw new Error('child boom');
  }
}

class ErrorBoundaryHost extends Component<object, { show: boolean }> {
  static captured: unknown[] = [];

  protected initState(): { show: boolean } {
    return { show: false };
  }

  protected initStyles(): void {}

  protected onErrorCaptured(error: unknown): boolean {
    ErrorBoundaryHost.captured.push(error);
    return false;
  }

  render(): VNode {
    return this.state.show
      ? createComponent(ErrorChild)
      : { tag: 'span', children: ['ok'] };
  }
}

class ErrorUpdateChild extends Component<object, { boom: boolean }> {
  static lastInstance: ErrorUpdateChild | null = null;

  constructor(props?: object) {
    super(props);
    ErrorUpdateChild.lastInstance = this;
  }

  protected initState(): { boom: boolean } {
    return { boom: false };
  }

  protected initStyles(): void {}

  render(): VNode {
    if (this.state.boom) {
      throw new Error('boom');
    }
    return { tag: 'span', children: ['child'] };
  }
}

class ErrorUpdateHost extends Component<object, { show: boolean }> {
  static captured: unknown[] = [];

  protected initState(): { show: boolean } {
    return { show: false };
  }

  protected initStyles(): void {}

  protected onErrorCaptured(error: unknown): boolean {
    ErrorUpdateHost.captured.push(error);
    return false;
  }

  render(): VNode {
    return this.state.show
      ? createComponent(ErrorUpdateChild)
      : { tag: 'span', children: ['ok'] };
  }
}

class PassingInnerBoundary extends Component<{ show: boolean }, object> {
  static captured: unknown[] = [];

  protected initState(): object {
    return {};
  }

  protected initStyles(): void {}

  protected onErrorCaptured(error: unknown): boolean {
    PassingInnerBoundary.captured.push(error);
    return true;
  }

  render(): VNode {
    return this.props.show
      ? createComponent(ErrorChild)
      : { tag: 'i', children: ['inner'] };
  }
}

class PassingOuterBoundary extends Component<object, { show: boolean }> {
  static captured: unknown[] = [];

  protected initState(): { show: boolean } {
    return { show: false };
  }

  protected initStyles(): void {}

  protected onErrorCaptured(error: unknown): boolean {
    PassingOuterBoundary.captured.push(error);
    return false;
  }

  render(): VNode {
    return createComponent(PassingInnerBoundary, {
      show: this.state.show,
    });
  }
}

class PlainErrorHost extends Component {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {}

  render(): VNode {
    return createComponent(ErrorChild);
  }
}

describe('细粒度依赖', () => {
  class FineGrainedComponent extends Component<
    object,
    { visible: number; hidden: number }
  > {
    renderCount = 0;

    protected initState(): { visible: number; hidden: number } {
      return { visible: 0, hidden: 0 };
    }

    protected initStyles(): void {}

    render(): VNode {
      this.renderCount += 1;
      return { tag: 'span', children: [`${this.state.visible}`] };
    }
  }

  let component: FineGrainedComponent;
  let container: HTMLElement;

  beforeEach(() => {
    document.head.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    component = new FineGrainedComponent();
  });

  afterEach(() => {
    component.unmount();
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  it('修改 render 未访问的 state 属性不应触发重渲染', () => {
    component.mount(container);
    component.renderCount = 0;

    component.state.hidden += 1;
    flushSync();
    expect(component.renderCount).toBe(0);
  });

  it('修改 render 访问的 state 属性应触发重渲染', () => {
    component.mount(container);
    component.renderCount = 0;

    component.state.visible += 1;
    flushSync();
    expect(component.renderCount).toBe(1);
  });
});

describe('错误边界', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.head.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  it('子组件挂载错误被祖先错误边界捕获而不向外抛出', () => {
    ErrorBoundaryHost.captured = [];
    const host = new ErrorBoundaryHost();

    host.mount(container);
    expect(() => {
      host.state.show = true;
      flushSync();
    }).not.toThrow();

    expect(ErrorBoundaryHost.captured).toHaveLength(1);
    expect((ErrorBoundaryHost.captured[0] as Error).message).toBe('child boom');
  });

  it('子组件更新错误被边界捕获并保留旧 DOM', () => {
    ErrorUpdateHost.captured = [];
    ErrorUpdateChild.lastInstance = null;
    const host = new ErrorUpdateHost();

    host.mount(container);
    host.state.show = true;
    flushSync();

    const child = ErrorUpdateChild.lastInstance;
    expect(child).toBeTruthy();

    expect(() => {
      if (child) {
        child.state.boom = true;
      }
      flushSync();
    }).not.toThrow();

    expect(ErrorUpdateHost.captured).toHaveLength(1);
    expect(container.querySelector('span')?.textContent).toBe('child');
  });

  it('边界返回 true 时错误继续冒泡到外层边界', () => {
    PassingInnerBoundary.captured = [];
    PassingOuterBoundary.captured = [];
    const host = new PassingOuterBoundary();

    host.mount(container);
    expect(() => {
      host.state.show = true;
      flushSync();
    }).not.toThrow();

    expect(PassingInnerBoundary.captured).toHaveLength(1);
    expect(PassingOuterBoundary.captured).toHaveLength(1);
  });

  it('无错误边界时子组件挂载错误向上抛出', () => {
    const host = new PlainErrorHost();

    expect(() => host.mount(container)).toThrow('child boom');
  });
});
