import type { MpDialect } from './dialect';
import type { CompiledUnit } from './types';

/** Alipay function props need an on-prefix; encode the exact logical event name. */
export function componentEventProp(eventName: string): string {
  let key = 'onTransoneEvent';
  for (let index = 0; index < eventName.length; index++)
    key += `_${eventName.charCodeAt(index).toString(16).padStart(4, '0')}`;
  return key;
}

export function componentEventAttribute(
  dialect: MpDialect,
  eventName: string
): string {
  return dialect.id === 'mp-alipay'
    ? componentEventProp(eventName)
    : `bind:${eventName}`;
}

export function componentEventPreamble(
  unit: CompiledUnit,
  dialect: MpDialect
): string {
  if (unit.kind !== 'component' || !unit.customEvents.length) return '';
  if (dialect.id !== 'mp-alipay')
    return `\nfunction __transone_emit(instance, eventName, args) {
  instance.triggerEvent(eventName, {args});
}\n`;
  // Computed keys keep special logical names such as __proto__ as own entries.
  const properties = unit.customEvents.map(
    (event) =>
      `[${JSON.stringify(event)}]:${JSON.stringify(componentEventProp(event))}`
  );
  return `\nconst __transone_event_props = {${properties.join(',')}};
function __transone_emit(instance, eventName, args) {
  const key = __transone_event_props[eventName];
  const callback = typeof key === 'string' && instance.props && instance.props[key];
  if (typeof callback === 'function') callback(...args);
}\n`;
}
