import { effect, stop, type ReactiveEffect } from './reactive';

export interface ModelBindingOptions {
  path: string;
  parse?: (value: unknown) => unknown;
  format?: (value: unknown) => string;
}

export type ModelBinding = string | ModelBindingOptions;

type ModelState = Record<string, unknown>;

interface BindingRecord {
  binding: ModelBinding;
  path: string;
  parse?: (value: unknown) => unknown;
  format?: (value: unknown) => string;
  eventName: 'input' | 'change';
  listener: EventListener;
  effect: ReactiveEffect;
}

function pathSegments(path: string): string[] {
  const segments = path.split('.');
  if (
    path.length === 0 ||
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '__proto__' ||
        segment === 'prototype' ||
        segment === 'constructor'
    )
  ) {
    throw new Error(`Invalid model path "${path}"`);
  }
  return segments;
}

function isRecord(value: unknown): value is ModelState {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function modelPath(binding: ModelBinding): string {
  return typeof binding === 'string' ? binding : binding.path;
}

export function getModelValue(state: ModelState, path: string): unknown {
  let value: unknown = state;

  for (const segment of pathSegments(path)) {
    if (!isRecord(value)) {
      throw new Error(`Invalid model path "${path}"`);
    }
    if (!hasOwn(value, segment)) {
      if (segment in value) {
        throw new Error(`Invalid model path "${path}"`);
      }
      return undefined;
    }
    value = value[segment];
  }

  return value;
}

export function setModelValue(
  state: ModelState,
  path: string,
  value: unknown
): void {
  const segments = pathSegments(path);
  let target: ModelState = state;

  for (const segment of segments.slice(0, -1)) {
    if (!hasOwn(target, segment)) {
      if (segment in target) {
        throw new Error(`Invalid model path "${path}"`);
      }
      target[segment] = {};
    } else if (!isRecord(target[segment])) {
      throw new Error(`Invalid model path "${path}"`);
    }
    const nextTarget = target[segment];
    if (!isRecord(nextTarget)) {
      throw new Error(`Invalid model path "${path}"`);
    }
    target = nextTarget;
  }

  const lastSegment = segments[segments.length - 1];
  target[lastSegment] = value;
}

function displayValue(binding: ModelBinding, value: unknown): string {
  if (typeof binding !== 'string' && binding.format) {
    return binding.format(value);
  }
  return value === undefined || value === null ? '' : String(value);
}

function toModelValue(binding: ModelBinding, value: unknown): unknown {
  if (typeof binding !== 'string' && binding.parse) {
    return binding.parse(value);
  }
  return value;
}

function syncControl(
  element: HTMLElement,
  binding: ModelBinding,
  value: unknown
): void {
  if (element instanceof HTMLInputElement) {
    if (element.type === 'checkbox') {
      element.checked = Array.isArray(value)
        ? value.some((item) => String(item) === element.value)
        : Boolean(value);
      return;
    }
    if (element.type === 'radio') {
      element.checked = value === element.value;
      return;
    }
    element.value = displayValue(binding, value);
    return;
  }

  if (element instanceof HTMLTextAreaElement) {
    element.value = displayValue(binding, value);
    return;
  }

  if (element instanceof HTMLSelectElement) {
    if (element.multiple) {
      const selected = Array.isArray(value)
        ? new Set(value.map(String))
        : new Set<string>();
      for (let index = 0; index < element.options.length; index += 1) {
        const option = element.options.item(index);
        if (!option) {
          continue;
        }
        option.selected = selected.has(option.value);
      }
      return;
    }
    element.value = displayValue(binding, value);
  }
}

function controlValue(element: HTMLElement, currentValue: unknown): unknown {
  if (element instanceof HTMLInputElement) {
    if (element.type === 'checkbox') {
      if (Array.isArray(currentValue)) {
        const values = currentValue.filter(
          (value) => String(value) !== element.value
        );
        return element.checked ? [...values, element.value] : values;
      }
      return element.checked;
    }
    if (element.type === 'radio') {
      return element.checked ? element.value : currentValue;
    }
    return element.value;
  }
  if (element instanceof HTMLTextAreaElement) {
    return element.value;
  }
  if (element instanceof HTMLSelectElement) {
    if (!element.multiple) {
      return element.value;
    }
    const values: string[] = [];
    for (let index = 0; index < element.selectedOptions.length; index += 1) {
      const option = element.selectedOptions.item(index);
      if (option) {
        values.push(option.value);
      }
    }
    return values;
  }
  return undefined;
}

export class ModelBindingController {
  private readonly bindings = new WeakMap<HTMLElement, BindingRecord>();

  public bind(
    element: HTMLElement,
    binding: ModelBinding,
    state: ModelState
  ): void {
    if (!this.isSupportedControl(element)) {
      return;
    }

    const existing = this.bindings.get(element);
    if (existing && this.sameBinding(existing, binding)) {
      return;
    }
    this.cleanup(element);

    const path = modelPath(binding);
    const sync = (): void =>
      syncControl(element, binding, getModelValue(state, path));
    const eventName =
      element instanceof HTMLTextAreaElement ||
      (element instanceof HTMLInputElement &&
        !['checkbox', 'radio'].includes(element.type))
        ? 'input'
        : 'change';
    const listener = (): void => {
      const currentValue = getModelValue(state, path);
      setModelValue(
        state,
        path,
        toModelValue(binding, controlValue(element, currentValue))
      );
    };

    element.addEventListener(eventName, listener);
    const effectRef = effect(sync);
    this.bindings.set(element, {
      binding,
      path,
      parse: typeof binding === 'string' ? undefined : binding.parse,
      format: typeof binding === 'string' ? undefined : binding.format,
      eventName,
      listener,
      effect: effectRef,
    });
  }

  public cleanup(element: HTMLElement): void {
    const existing = this.bindings.get(element);
    if (!existing) {
      return;
    }
    element.removeEventListener(existing.eventName, existing.listener);
    stop(existing.effect);
    this.bindings.delete(element);
  }

  private isSupportedControl(element: HTMLElement): boolean {
    return (
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    );
  }

  private sameBinding(record: BindingRecord, binding: ModelBinding): boolean {
    if (typeof record.binding === 'string' || typeof binding === 'string') {
      return record.binding === binding;
    }
    return (
      record.path === binding.path &&
      record.parse === binding.parse &&
      record.format === binding.format
    );
  }
}
