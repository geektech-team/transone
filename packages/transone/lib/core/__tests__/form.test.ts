import { describe, expect, it } from 'bun:test';
import { Component } from '../component';
import { getModelValue, ModelBindingController, setModelValue } from '../model';
import { reactive } from '../reactive';
import { createForm, minLength, required, validate } from '../form';
import type { VNode } from '../vnode';

class FormHost extends Component<
  Record<string, never>,
  {
    text: string;
    enabled: boolean;
    choices: string[];
    choice: string;
    selected: string;
    selectedMany: string[];
  }
> {
  protected initState() {
    return {
      text: 'Ada',
      enabled: true,
      choices: ['a'],
      choice: 'b',
      selected: 'two',
      selectedMany: ['one', 'three'],
    };
  }

  protected initStyles(): void {}

  protected render(): VNode {
    return {
      tag: 'form',
      children: [
        { tag: 'input', props: { id: 'text' }, directions: { model: 'text' } },
        {
          tag: 'textarea',
          props: { id: 'textarea' },
          directions: {
            model: {
              path: 'text',
              parse: (value) => String(value).replace(/^#/, ''),
              format: (value) => `#${value}`,
            },
          },
        },
        {
          tag: 'input',
          props: { id: 'enabled', type: 'checkbox' },
          directions: { model: 'enabled' },
        },
        {
          tag: 'input',
          props: { id: 'choice-a', type: 'checkbox', value: 'a' },
          directions: { model: 'choices' },
        },
        {
          tag: 'input',
          props: { id: 'choice-b', type: 'checkbox', value: 'b' },
          directions: { model: 'choices' },
        },
        {
          tag: 'input',
          props: { id: 'radio-a', type: 'radio', value: 'a' },
          directions: { model: 'choice' },
        },
        {
          tag: 'input',
          props: { id: 'radio-b', type: 'radio', value: 'b' },
          directions: { model: 'choice' },
        },
        {
          tag: 'select',
          props: { id: 'single' },
          directions: { model: 'selected' },
          children: [
            { tag: 'option', props: { value: 'one' }, children: ['One'] },
            { tag: 'option', props: { value: 'two' }, children: ['Two'] },
          ],
        },
        {
          tag: 'select',
          props: { id: 'multiple', multiple: true },
          directions: { model: 'selectedMany' },
          children: [
            { tag: 'option', props: { value: 'one' }, children: ['One'] },
            { tag: 'option', props: { value: 'two' }, children: ['Two'] },
            { tag: 'option', props: { value: 'three' }, children: ['Three'] },
          ],
        },
      ],
    };
  }
}

describe('model paths', () => {
  it('reads and writes own-property dot paths', () => {
    const state = { profile: { name: 'Ada' } };

    expect(getModelValue(state, 'profile.name')).toBe('Ada');
    setModelValue(state, 'profile.name', 'Grace');

    expect(state.profile.name).toBe('Grace');
  });

  it('creates missing own intermediate paths when writing', () => {
    const state = {};

    setModelValue(state, 'profile.name', 'Ada');

    expect(state).toEqual({ profile: { name: 'Ada' } });
  });

  it('returns undefined for an absent nested path before it is written', () => {
    const state = {};

    expect(getModelValue(state, 'profile.name')).toBeUndefined();
    setModelValue(state, 'profile.name', 'Ada');

    expect(getModelValue(state, 'profile.name')).toBe('Ada');
  });

  it('rejects empty, inherited, and unsafe paths', () => {
    expect(() => getModelValue({}, '')).toThrow('Invalid model path');
    expect(() => getModelValue({}, 'toString')).toThrow('Invalid model path');
    expect(() =>
      setModelValue(Object.create({ profile: {} }), 'profile.name', 'Ada')
    ).toThrow('Invalid model path');
    expect(() => setModelValue({}, 'profile.__proto__.name', 'Ada')).toThrow(
      'Invalid model path'
    );
    expect(() => setModelValue({}, 'profile.constructor.name', 'Ada')).toThrow(
      'Invalid model path'
    );
  });
});

describe('model binding controller', () => {
  it('initially synchronizes an absent nested binding as an empty control', () => {
    const state = reactive({});
    const input = document.createElement('input');
    const controller = new ModelBindingController();

    controller.bind(input, 'profile.name', state);

    expect(input.value).toBe('');
    input.value = 'Ada';
    input.dispatchEvent(new Event('input'));
    expect(state).toEqual({ profile: { name: 'Ada' } });
  });

  it('rebinds when the same options object changes its path or converters', () => {
    const state = reactive({ first: 'Ada', second: 'Grace' });
    const input = document.createElement('input');
    const binding = {
      path: 'first',
      parse: (value: unknown) => `first:${String(value)}`,
      format: (value: unknown) => `first:${String(value)}`,
    };
    const controller = new ModelBindingController();

    controller.bind(input, binding, state);
    expect(input.value).toBe('first:Ada');

    binding.path = 'second';
    binding.parse = (value) => `second:${String(value)}`;
    binding.format = (value) => `second:${String(value)}`;
    controller.bind(input, binding, state);

    state.first = 'Lin';
    expect(input.value).toBe('second:Grace');
    state.second = 'Jo';
    expect(input.value).toBe('second:Jo');

    input.value = 'Kai';
    input.dispatchEvent(new Event('input'));
    expect(state.first).toBe('Lin');
    expect(state.second).toBe('second:Kai');
  });

  it('does not write an unchecked radio value back to the model', () => {
    const state = reactive({ choice: 'a' });
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.value = 'b';
    const controller = new ModelBindingController();

    controller.bind(radio, 'choice', state);
    radio.checked = false;
    radio.dispatchEvent(new Event('change'));

    expect(state.choice).toBe('a');
  });

  it('matches and removes numeric array checkbox values by their DOM value', () => {
    const state = reactive({ choices: [1] });
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = '1';
    const controller = new ModelBindingController();

    controller.bind(checkbox, 'choices', state);
    expect(checkbox.checked).toBe(true);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expect(state.choices).toEqual(['1']);

    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));

    expect(state.choices).toEqual([]);
  });
});

describe('native form model bindings', () => {
  it('synchronizes input, textarea, checkbox, radio, and select controls', () => {
    const container = document.createElement('div');
    const component = new FormHost();
    component.mount(container);

    const text = container.querySelector('#text') as HTMLInputElement;
    const textarea = container.querySelector(
      '#textarea'
    ) as HTMLTextAreaElement;
    const enabled = container.querySelector('#enabled') as HTMLInputElement;
    const choiceA = container.querySelector('#choice-a') as HTMLInputElement;
    const choiceB = container.querySelector('#choice-b') as HTMLInputElement;
    const radioA = container.querySelector('#radio-a') as HTMLInputElement;
    const radioB = container.querySelector('#radio-b') as HTMLInputElement;
    const single = container.querySelector('#single') as HTMLSelectElement;
    const multiple = container.querySelector('#multiple') as HTMLSelectElement;

    expect(text.value).toBe('Ada');
    expect(textarea.value).toBe('#Ada');
    expect(enabled.checked).toBe(true);
    expect(choiceA.checked).toBe(true);
    expect(choiceB.checked).toBe(false);
    expect(radioA.checked).toBe(false);
    expect(radioB.checked).toBe(true);
    expect(single.value).toBe('two');
    expect([...multiple.selectedOptions].map((option) => option.value)).toEqual(
      ['one', 'three']
    );

    text.value = 'Grace';
    text.dispatchEvent(new Event('input', { bubbles: true }));
    expect(component.state.text).toBe('Grace');

    textarea.value = '#Lin';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(component.state.text).toBe('Lin');

    enabled.checked = false;
    enabled.dispatchEvent(new Event('change', { bubbles: true }));
    expect(component.state.enabled).toBe(false);

    choiceA.checked = false;
    choiceA.dispatchEvent(new Event('change', { bubbles: true }));
    choiceB.checked = true;
    choiceB.dispatchEvent(new Event('change', { bubbles: true }));
    expect(component.state.choices).toEqual(['b']);

    radioA.checked = true;
    radioA.dispatchEvent(new Event('change', { bubbles: true }));
    expect(component.state.choice).toBe('a');

    single.value = 'one';
    single.dispatchEvent(new Event('change', { bubbles: true }));
    expect(component.state.selected).toBe('one');

    multiple.options[0].selected = false;
    multiple.options[1].selected = true;
    multiple.dispatchEvent(new Event('change', { bubbles: true }));
    expect(component.state.selectedMany).toEqual(['two', 'three']);
  });
});

describe('form validation', () => {
  it('collects validation errors and clears them after a valid field check', () => {
    const model = { name: '' };
    const form = createForm(model, {
      name: [required('Name is required'), minLength(2)],
    });

    expect(form.validate()).toEqual({
      valid: false,
      errors: { name: ['Name is required', 'Must be at least 2 characters'] },
    });
    expect(form.errors).toEqual({
      name: ['Name is required', 'Must be at least 2 characters'],
    });

    model.name = 'Ada';
    expect(form.validateField('name')).toEqual({ valid: true, errors: [] });
    expect(form.errors).toEqual({});
  });

  it('resets collected errors and turns thrown rule errors into messages', () => {
    const form = createForm(
      { code: 'bad' },
      {
        code: [
          validate(() => {
            throw new Error('Unexpected code');
          }),
        ],
      }
    );

    expect(form.validateField('code')).toEqual({
      valid: false,
      errors: ['Unexpected code'],
    });
    form.resetErrors();

    expect(form.errors).toEqual({});
  });
});
