import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  Component,
  createApp,
  createComponent,
  flushSync,
  bindComponentImplementations,
  computed,
  reactive,
  type VNode,
} from '../../index';

const calls: string[] = [];
const instances: Component[] = [];
let container: HTMLElement;

class FieldComponent extends Component<{ start?: number }, { count: number }> {
  protected seed = 7;
  protected palette = { color: 'rebeccapurple' };

  constructor(props?: { start?: number }) {
    super(props);
    this.seed += props?.start ?? 0;
    instances.push(this);
  }

  protected initState() {
    calls.push('state');
    return { count: this.seed };
  }

  protected initStyles() {
    calls.push('styles');
    this.styleManager.addStyle('field', {
      selector: '.field',
      properties: { color: this.palette.color },
    });
  }

  protected beforeMount() {
    calls.push(`before:${this.state.count}`);
  }

  protected render(): VNode {
    return {
      tag: 'span',
      props: { className: 'field' },
      children: ['{{count}}'],
    };
  }
}

beforeEach(() => {
  calls.length = 0;
  document.head.innerHTML = '';
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  for (const instance of instances.splice(0)) instance.unmount();
  container.remove();
});

describe('component initialization after derived construction', () => {
  it('keeps props-based field and initial state snapshots when props change before first mount', () => {
    class PropsSnapshot extends Component<
      { start?: number; label?: string },
      { count: number }
    > {
      seed = this.props.start ?? 7;
      original = this.props;
      protected initState() {
        return { count: this.props.start ?? 7 };
      }
      protected initStyles() {}
      protected render(): VNode {
        return {
          tag: 'span',
          children: [String(this.state.count), this.props.label ?? ''],
        };
      }
    }
    const component = new PropsSnapshot({ start: 0, label: '' });
    component.setProps({ start: 99, label: 'later' });
    expect(component.seed).toBe(0);
    expect(component.original.start).toBe(0);
    expect(component.state.count).toBe(0);
    component.mount(container);
    expect(container.textContent).toBe('0later');
    component.unmount();
  });

  it('does not initialize state when a parent constructor updates props', () => {
    class Parent extends Component<{ start?: number }, { count: number }> {
      constructor() {
        super({ start: 1 });
        this.setProps({ start: 2 });
      }
      protected initState() {
        calls.push('state');
        return { count: 1 };
      }
      protected initStyles() {}
      protected render(): VNode {
        return { tag: 'span', children: [String(this.state.count)] };
      }
    }
    class Child extends Parent {
      seed = 7;
      protected override initState() {
        calls.push('state');
        return { count: this.seed };
      }
    }
    const component = new Child();
    expect(calls).toEqual([]);
    expect(component.state.count).toBe(7);
    expect(calls).toEqual(['state']);
    component.unmount();
  });
  it('reads initialized fields and constructor changes on synchronous state access', () => {
    const component = new FieldComponent({ start: 3 });
    expect(calls).toEqual([]);
    expect(component.state.count).toBe(10);
    expect(component.state).toBe(component.state);
    component.setState({ count: 11 });
    expect(component.state.count).toBe(11);
    expect(calls).toEqual(['state']);
    expect(document.head.querySelectorAll('style')).toHaveLength(0);

    component.mount(container);
    expect(calls).toEqual(['state', 'styles', 'before:11']);
    expect(container.textContent).toBe('11');
    expect(document.head.textContent).toContain('rebeccapurple');
    component.state.count = 12;
    flushSync();
    expect(container.textContent).toBe('12');
  });

  it('initializes inherited hooks once per mount while preserving state on remount', () => {
    class Derived extends FieldComponent {
      protected override seed = 20;
      protected override palette = { color: 'tomato' };
      protected override initState() {
        return { ...super.initState(), count: this.seed + 1 };
      }
      protected override initStyles() {
        super.initStyles();
      }
    }
    const component = new Derived();
    component.mount(container);
    component.mount(container);
    expect(container.textContent).toBe('21');
    expect(calls).toEqual(['state', 'styles', 'before:21']);
    component.state.count = 22;
    component.unmount();
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
    component.mount(container);
    expect(calls).toEqual([
      'state',
      'styles',
      'before:21',
      'styles',
      'before:22',
    ]);
    expect(document.head.textContent).toContain('tomato');
    component.state.count = 23;
    flushSync();
    expect(container.textContent).toBe('23');
  });

  it('does not initialize an unused instance during teardown', () => {
    const component = new FieldComponent();
    component.unmount();
    expect(calls).toEqual([]);
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
  });

  it('supports state reads inside an existing derived constructor', () => {
    class ConstructorReader extends FieldComponent {
      observed: number;
      constructor() {
        super({ start: 2 });
        this.observed = this.state.count;
      }
    }
    const component = new ConstructorReader();
    expect(component.observed).toBe(9);
    component.mount(container);
    expect(container.textContent).toBe('9');
  });

  it('initializes bound roots and descendants through the existing app API', () => {
    class Page extends Component {
      protected initState() {
        return {};
      }
      protected initStyles() {}
      protected render(): VNode {
        return createComponent(FieldComponent, { start: 1 });
      }
    }
    class BoundField extends FieldComponent {
      protected override seed = 30;
    }
    const restore = bindComponentImplementations([
      [FieldComponent, BoundField],
    ]);
    const app = createApp({ root: Page, rootElement: container });
    try {
      app.mount();
      expect(container.textContent).toBe('30');
      expect(calls).toEqual(['state', 'styles', 'before:30']);
    } finally {
      app.unmount();
      restore();
    }
  });

  it('does not subscribe the parent render to child initialization reads', () => {
    let child: FieldComponent | undefined;
    let renders = 0;
    class Child extends FieldComponent {
      constructor() {
        super();
        child = this;
      }
      protected override initStyles() {
        super.initStyles();
        const count = computed(() => this.state.count);
        this.styleManager.addStyle('count', {
          selector: '.count',
          properties: { zIndex: count.value + this.state.count },
        });
      }
      protected override onMounted() {
        calls.push(`mounted:${this.state.count}`);
      }
    }
    class Parent extends Component {
      protected initState() {
        return {};
      }
      protected initStyles() {}
      protected render(): VNode {
        renders += 1;
        return createComponent(Child);
      }
    }
    const parent = new Parent();
    instances.push(parent);
    parent.mount(container);
    child!.state.count = 8;
    flushSync();
    expect(container.textContent).toBe('8');
    expect(renders).toBe(1);
  });

  it('cleans failed style initialization and can remount without rebuilding state', () => {
    const failure = new Error('styles failed');
    let fail = true;
    let cleaned = 0;
    class FailingStyles extends FieldComponent {
      protected override initStyles() {
        super.initStyles();
        this.onDispose(() => {
          cleaned += 1;
        });
        if (fail) throw failure;
      }
    }
    const component = new FailingStyles();
    expect(() => component.mountToNode()).toThrow(failure);
    expect(cleaned).toBe(1);
    expect(component.mounted).toBe(false);
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
    fail = false;
    component.mount(container);
    expect(calls).toEqual(['state', 'styles', 'styles', 'before:7']);
    component.state.count = 9;
    flushSync();
    expect(container.textContent).toBe('9');
    component.unmount();
    expect(cleaned).toBe(2);
  });

  it('routes state initialization errors to the parent boundary and releases resources', () => {
    const failure = new Error('state failed');
    let cleaned = 0;
    let attempts = 0;
    let failed: FailingState | undefined;
    const errors: unknown[] = [];
    class FailingState extends FieldComponent {
      constructor() {
        super();
        failed = this;
      }
      protected override initState(): { count: number } {
        attempts += 1;
        this.onDispose(() => {
          cleaned += 1;
        });
        throw failure;
      }
    }
    class Boundary extends Component {
      protected initState() {
        return {};
      }
      protected initStyles() {}
      protected onErrorCaptured(error: unknown) {
        errors.push(error);
        return false;
      }
      protected render(): VNode {
        return createComponent(FailingState);
      }
    }
    const boundary = new Boundary();
    instances.push(boundary);
    boundary.mount(container);
    expect(boundary.mounted).toBe(true);
    expect(errors).toEqual([failure]);
    expect(cleaned).toBe(1);
    expect(() => failed!.state).toThrow(failure);
    expect(attempts).toBe(1);
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
  });

  it('rejects recursive state reads without rerunning the failed hook', () => {
    class Recursive extends FieldComponent {
      protected override initState(): { count: number } {
        calls.push('recursive');
        return { count: this.state.count };
      }
    }
    const component = new Recursive();
    expect(() => component.state).toThrow(
      'Cannot read state while initState() is running'
    );
    expect(() => component.state).toThrow(
      'Cannot read state while initState() is running'
    );
    expect(calls).toEqual(['recursive']);
  });

  it('preserves writable state fields and arrow-function initialization hooks', () => {
    class ArrowHooks extends FieldComponent {
      protected override initState = () => ({ count: this.seed + 2 });
      protected override initStyles = () => {
        this.styleManager.addStyle('arrow', {
          selector: '.field',
          properties: { color: this.palette.color },
        });
      };
    }
    const arrow = new ArrowHooks();
    expect(arrow.state.count).toBe(9);
    expect(Object.keys(arrow)).toContain('state');
    arrow.mount(container);
    expect(container.textContent).toBe('9');
    arrow.unmount();

    class StateField extends FieldComponent {
      public override state = reactive({ count: 40 });
    }
    const field = new StateField();
    field.mount(container);
    expect(container.textContent).toBe('40');
    field.state.count = 41;
    flushSync();
    expect(container.textContent).toBe('41');
    field.unmount();

    const assigned = new FieldComponent();
    assigned.state = reactive({ count: 50 });
    assigned.mount(container);
    expect(container.textContent).toBe('50');
    assigned.state.count = 51;
    flushSync();
    expect(container.textContent).toBe('51');
  });
});
