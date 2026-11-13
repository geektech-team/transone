import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  Component,
  createComponent,
  flushSync,
  reactive,
  type VNode,
} from '../../index';
import { ModelBindingController } from '../model';

let container: HTMLElement;
const components: Array<{ unmount(): void }> = [];
const bindings: Array<{
  controller: ModelBindingController;
  input: HTMLInputElement;
}> = [];
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  for (const component of components.splice(0).reverse()) component.unmount();
  for (const { controller, input } of bindings.splice(0))
    controller.cleanup(input);
  flushSync();
  container.remove();
});

function retainInput(input: HTMLInputElement): EventListener {
  return (
    input as unknown as {
      getListeners(type: string): Array<{ listener: EventListener }>;
    }
  ).getListeners('input')[0].listener;
}
function controllerFixture() {
  const controller = new ModelBindingController();
  const input = document.createElement('input');
  bindings.push({ controller, input });
  container.appendChild(input);
  return { controller, input };
}

describe('model callback ownership', () => {
  it('ignores an old input entry before parsing after its component remounts', () => {
    let parses = 0;
    class Example extends Component<object, { name: string }> {
      protected initState() {
        return { name: 'current' };
      }
      protected initStyles() {}
      protected render(): VNode {
        return {
          tag: 'input',
          directions: {
            model: {
              path: 'name',
              parse: (value) => {
                parses++;
                return String(value);
              },
            },
          },
        };
      }
    }
    const component = new Example();
    components.push(component);
    component.mount(container);
    const oldInput = component.getElement() as HTMLInputElement;
    const oldEntry = retainInput(oldInput);
    component.unmount();
    component.mount(container);
    oldInput.value = 'late';
    oldEntry.call(oldInput, new Event('input'));
    flushSync();
    expect(parses).toBe(0);
    expect(component.state.name).toBe('current');
    const input = component.getElement() as HTMLInputElement;
    expect(input.value).toBe('current');
    input.value = 'fresh';
    input.dispatchEvent(new Event('input'));
    expect(parses).toBe(1);
    expect(component.state.name).toBe('fresh');
  });

  it('rebinds the same element and path to a new state without reviving its old listener', () => {
    const { controller, input } = controllerFixture();
    const original = reactive({ name: 'original' }),
      current = reactive({ name: 'current' });
    controller.bind(input, 'name', original);
    const oldEntry = retainInput(input);
    controller.bind(input, 'name', current);
    expect(input.value).toBe('current');
    input.value = 'late';
    oldEntry.call(input, new Event('input'));
    expect(original.name).toBe('original');
    expect(current.name).toBe('current');
    input.value = 'fresh';
    input.dispatchEvent(new Event('input'));
    expect(current.name).toBe('fresh');
    expect(original.name).toBe('original');
  });

  for (const action of ['cleanup', 'rebind'] as const) {
    it(`does not commit an input after parse synchronously triggers ${action}`, () => {
      const { controller, input } = controllerFixture();
      const state = reactive({ name: 'original', replacement: 'replacement' });
      controller.bind(
        input,
        {
          path: 'name',
          parse: (value) => {
            if (action === 'cleanup') controller.cleanup(input);
            else controller.bind(input, 'replacement', state);
            return String(value);
          },
        },
        state
      );
      const entry = retainInput(input);
      input.value = 'late';
      entry.call(input, new Event('input'));
      expect(state).toEqual({ name: 'original', replacement: 'replacement' });
      if (action === 'rebind') {
        input.value = 'fresh';
        input.dispatchEvent(new Event('input'));
        expect(state).toEqual({ name: 'original', replacement: 'fresh' });
      } else {
        input.value = 'ignored';
        entry.call(input, new Event('input'));
        expect(state.name).toBe('original');
      }
    });
  }

  it('routes an active component parser failure to its original parent boundary', () => {
    const failure = new Error('model parser failed');
    const errors: unknown[] = [];
    let child!: Child;
    class Child extends Component<object, { name: string }> {
      constructor() {
        super();
        child = this;
      }
      protected initState() {
        return { name: 'current' };
      }
      protected initStyles() {}
      protected render(): VNode {
        return {
          tag: 'input',
          directions: {
            model: {
              path: 'name',
              parse: () => {
                throw failure;
              },
            },
          },
        };
      }
    }
    class Boundary extends Component {
      protected initState() {
        return {};
      }
      protected initStyles() {}
      protected render(): VNode {
        return createComponent(Child);
      }
      protected onErrorCaptured(error: unknown) {
        errors.push(error);
        return false;
      }
    }
    const boundary = new Boundary();
    components.push(boundary);
    boundary.mount(container);
    const input = child.getElement() as HTMLInputElement;
    input.value = 'input';
    expect(() => input.dispatchEvent(new Event('input'))).not.toThrow();
    expect(errors).toEqual([failure]);
    expect(child.state.name).toBe('current');
  });

  it('preserves the original thrown parser failure for a standalone controller without a guard', () => {
    const { controller, input } = controllerFixture();
    const failure = new Error('standalone parser failed');
    const state = reactive({ name: 'current' });
    controller.bind(
      input,
      {
        path: 'name',
        parse: () => {
          throw failure;
        },
      },
      state
    );
    input.value = 'input';
    expect(() => input.dispatchEvent(new Event('input'))).toThrow(failure);
    expect(state.name).toBe('current');
  });
});
