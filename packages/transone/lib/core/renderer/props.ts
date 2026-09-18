export interface ParsedEventName {
  eventName: string;
  modifiers: Set<string>;
}

export function isEventProp(key: string): boolean {
  return /^on[A-Z]/.test(key) || /^on[a-z]/.test(key);
}

export function eventNameFromProp(key: string): string {
  return key.slice(2).toLowerCase();
}

export function parseEventName(event: string): ParsedEventName {
  const [eventName, ...modifiers] = event.split('.');
  return { eventName, modifiers: new Set(modifiers) };
}

export function wrapEventHandler(
  handler: (event: Event) => void,
  modifiers: Set<string>
): EventListener {
  const eventHandler = (event: Event): void => {
    if (modifiers.has('stop')) {
      event.stopPropagation();
    }

    if (modifiers.has('prevent')) {
      event.preventDefault();
    }

    if (modifiers.has('self') && event.currentTarget !== event.target) {
      return;
    }

    if (modifiers.has('once')) {
      (event.currentTarget as EventTarget).removeEventListener(
        event.type,
        eventHandler
      );
    }

    handler(event);
  };

  return eventHandler;
}

export function setStyleValue(
  style: CSSStyleDeclaration,
  property: string,
  value: string | number
): void {
  const cssProperty = property.includes('-')
    ? property
    : property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);

  style.setProperty(cssProperty, String(value));
}
