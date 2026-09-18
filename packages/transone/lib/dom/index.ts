/**
 * 零依赖最小 DOM 实现。
 *
 * 供 SSR（CLI 项目渲染、docs 静态构建）与测试环境使用，
 * 覆盖 TSone 框架与测试实际依赖的 DOM 面（节点树、事件、CSS 选择器、
 * innerHTML 序列化/解析、history/location/localStorage 等）。
 * 仅面向本项目所需场景，不追求完整浏览器兼容。
 */

export const enum DomNodeType {
  ELEMENT_NODE = 1,
  TEXT_NODE = 3,
  COMMENT_NODE = 8,
  DOCUMENT_NODE = 9,
  DOCUMENT_FRAGMENT_NODE = 11,
}

export class DOMException extends Error {
  public readonly code: number;

  constructor(message: string, name = 'Error') {
    super(message);
    this.name = name;
    this.code = 0;
  }
}

type EventListenerRecord =
  | ((event: Event) => void)
  | { handleEvent(event: Event): void };

interface ListenerEntry {
  listener: EventListenerRecord;
  capture: boolean;
  once: boolean;
  passive: boolean;
}

/**
 * EventTarget 基类：addEventListener / removeEventListener / dispatchEvent。
 */
export class EventTarget {
  private readonly listenerMap = new Map<string, ListenerEntry[]>();

  public addEventListener(
    type: string,
    listener: EventListenerRecord | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (!listener) {
      return;
    }
    const capture =
      typeof options === 'boolean' ? options : (options?.capture ?? false);
    const once = typeof options === 'object' ? (options.once ?? false) : false;
    const passive =
      typeof options === 'object' ? (options.passive ?? false) : false;
    let entries = this.listenerMap.get(type);
    if (!entries) {
      entries = [];
      this.listenerMap.set(type, entries);
    }
    if (
      entries.some(
        (entry) => entry.listener === listener && entry.capture === capture
      )
    ) {
      return;
    }
    entries.push({ listener, capture, once, passive });
  }

  public removeEventListener(
    type: string,
    listener: EventListenerRecord | null,
    options?: boolean | EventListenerOptions
  ): void {
    if (!listener) {
      return;
    }
    const capture =
      typeof options === 'boolean' ? options : (options?.capture ?? false);
    const entries = this.listenerMap.get(type);
    if (!entries) {
      return;
    }
    const index = entries.findIndex(
      (entry) => entry.listener === listener && entry.capture === capture
    );
    if (index >= 0) {
      entries.splice(index, 1);
    }
    if (entries.length === 0) {
      this.listenerMap.delete(type);
    }
  }

  public dispatchEvent(event: Event): boolean {
    if (!(event instanceof Event)) {
      throw new TypeError('dispatchEvent requires an Event instance');
    }
    if (event.dispatched) {
      throw new Error('Event has already been dispatched');
    }
    return dispatchOnTarget(this, event);
  }

  /** @internal 返回本节点的监听器。 */
  public getListeners(type: string): ListenerEntry[] {
    return this.listenerMap.get(type) ?? [];
  }
}

export class Event {
  public static readonly NONE = 0;
  public static readonly CAPTURING_PHASE = 1;
  public static readonly AT_TARGET = 2;
  public static readonly BUBBLING_PHASE = 3;

  public readonly type: string;
  public readonly bubbles: boolean;
  public readonly cancelable: boolean;
  public readonly composed: boolean;
  public target: EventTarget | null = null;
  public currentTarget: EventTarget | null = null;
  public eventPhase = Event.NONE;
  public defaultPrevented = false;
  public readonly isTrusted = false;
  public readonly timeStamp: number;
  public cancelBubble = false;

  /** @internal */
  public dispatched = false;
  /** @internal */
  private propagationStopped = false;
  /** @internal */
  private immediateStopped = false;
  /** @internal */
  private canceled = false;

  constructor(type: string, init?: EventInit) {
    this.type = type;
    this.bubbles = init?.bubbles ?? false;
    this.cancelable = init?.cancelable ?? false;
    this.composed = init?.composed ?? false;
    this.timeStamp = Date.now();
  }

  public preventDefault(): void {
    if (this.cancelable) {
      this.canceled = true;
      this.defaultPrevented = true;
    }
  }

  public stopPropagation(): void {
    this.propagationStopped = true;
    this.cancelBubble = true;
  }

  public stopImmediatePropagation(): void {
    this.propagationStopped = true;
    this.immediateStopped = true;
    this.cancelBubble = true;
  }

  /** @internal */
  public propagationPrevented(): boolean {
    return this.propagationStopped;
  }

  /** @internal */
  public immediatePrevented(): boolean {
    return this.immediateStopped;
  }

  /** @internal */
  public wasCanceled(): boolean {
    return this.canceled;
  }
}

export class CustomEvent<T = unknown> extends Event {
  public readonly detail: T;

  constructor(type: string, init?: CustomEventInit<T>) {
    super(type, init);
    this.detail = init?.detail as T;
  }
}

export class MouseEvent extends Event {
  public readonly clientX: number;
  public readonly clientY: number;
  public readonly button: number;
  public readonly buttons: number;
  public readonly relatedTarget: unknown;

  constructor(type: string, init?: MouseEventInit) {
    super(type, init);
    this.clientX = init?.clientX ?? 0;
    this.clientY = init?.clientY ?? 0;
    this.button = init?.button ?? 0;
    this.buttons = init?.buttons ?? 0;
    this.relatedTarget = init?.relatedTarget ?? null;
  }
}

export class KeyboardEvent extends Event {
  public readonly key: string;
  public readonly code: string;
  public readonly shiftKey: boolean;
  public readonly ctrlKey: boolean;
  public readonly altKey: boolean;
  public readonly metaKey: boolean;

  constructor(type: string, init?: KeyboardEventInit) {
    super(type, init);
    this.key = init?.key ?? '';
    this.code = init?.code ?? '';
    this.shiftKey = init?.shiftKey ?? false;
    this.ctrlKey = init?.ctrlKey ?? false;
    this.altKey = init?.altKey ?? false;
    this.metaKey = init?.metaKey ?? false;
  }
}

function invokeListener(listener: ListenerEntry, event: Event): void {
  const record = listener.listener;
  if (typeof record === 'function') {
    record.call(event.currentTarget, event);
  } else {
    record.handleEvent(event);
  }
}

function dispatchOnTarget(target: EventTarget, event: Event): boolean {
  event.dispatched = true;
  event.target = target;

  const chain = buildEventPath(target);
  const capturePath = [...chain].reverse();
  const targetIndex = capturePath.length - 1;

  event.eventPhase = Event.CAPTURING_PHASE;
  for (let index = 0; index < targetIndex; index += 1) {
    const current = capturePath[index];
    if (event.propagationPrevented()) {
      break;
    }
    event.currentTarget = current;
    runListeners(current, event, true);
  }

  if (!event.propagationPrevented()) {
    event.eventPhase = Event.AT_TARGET;
    event.currentTarget = target;
    runListeners(target, event, true);
    if (!event.immediatePrevented()) {
      runListeners(target, event, false);
    }
  }

  if (event.bubbles && !event.propagationPrevented()) {
    event.eventPhase = Event.BUBBLING_PHASE;
    for (let index = capturePath.length - 2; index >= 0; index -= 1) {
      const current = capturePath[index];
      if (event.propagationPrevented()) {
        break;
      }
      event.currentTarget = current;
      runListeners(current, event, false);
    }
  }

  event.eventPhase = Event.NONE;
  event.currentTarget = null;
  return !event.wasCanceled();
}

function runListeners(
  target: EventTarget,
  event: Event,
  capture: boolean
): void {
  const listeners = target.getListeners(event.type);
  for (const entry of [...listeners]) {
    if (entry.capture !== capture) {
      continue;
    }
    if (event.immediatePrevented()) {
      break;
    }
    if (entry.once) {
      target.removeEventListener(event.type, entry.listener, {
        capture: entry.capture,
      });
    }
    invokeListener(entry, event);
  }
}

function buildEventPath(target: EventTarget): EventTarget[] {
  const path: EventTarget[] = [];
  let current: EventTarget | null = target;
  while (current) {
    path.push(current);
    const node = current as unknown as Node;
    if (node.nodeType === DomNodeType.DOCUMENT_NODE) {
      const view = (node as Document).defaultView;
      if (view) {
        path.push(view);
      }
      break;
    }
    const parent = node.parentNode;
    if (parent) {
      current = parent;
      continue;
    }
    break;
  }
  return path;
}

export class DOMTokenList implements Iterable<string> {
  private readonly element: Element;
  private readonly attributeName: string;

  constructor(element: Element, attributeName = 'class') {
    this.element = element;
    this.attributeName = attributeName;
  }

  public get length(): number {
    return this.tokens().length;
  }

  public get value(): string {
    return this.element.getAttribute(this.attributeName) ?? '';
  }

  public set value(value: string) {
    this.setTokens(splitTokens(value));
  }

  public item(index: number): string | null {
    return this.tokens()[index] ?? null;
  }

  public contains(token: string): boolean {
    return this.tokens().includes(token);
  }

  public add(...tokens: string[]): void {
    const current = new Set(this.tokens());
    for (const token of tokens) {
      if (token) {
        current.add(token);
      }
    }
    this.setTokens([...current]);
  }

  public remove(...tokens: string[]): void {
    const current = new Set(this.tokens());
    for (const token of tokens) {
      current.delete(token);
    }
    this.setTokens([...current]);
  }

  public toggle(token: string, force?: boolean): boolean {
    const current = new Set(this.tokens());
    const shouldAdd = force ?? !current.has(token);
    if (shouldAdd) {
      current.add(token);
    } else {
      current.delete(token);
    }
    this.setTokens([...current]);
    return shouldAdd;
  }

  public replace(oldToken: string, newToken: string): boolean {
    const current = this.tokens();
    const index = current.indexOf(oldToken);
    if (index < 0) {
      return false;
    }
    current[index] = newToken;
    this.setTokens(current);
    return true;
  }

  public [Symbol.iterator](): Iterator<string> {
    return this.tokens()[Symbol.iterator]();
  }

  public forEach(
    callback: (value: string, index: number, list: DOMTokenList) => void
  ): void {
    this.tokens().forEach((value, index) => callback(value, index, this));
  }

  public toString(): string {
    return this.value;
  }

  private tokens(): string[] {
    return splitTokens(this.element.getAttribute(this.attributeName) ?? '');
  }

  private setTokens(tokens: string[]): void {
    const value = tokens.filter(Boolean).join(' ');
    if (value) {
      this.element.setAttribute(this.attributeName, value);
    } else {
      this.element.removeAttribute(this.attributeName);
    }
  }
}

function splitTokens(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function normalizeCssProperty(property: string): string {
  return property.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

interface StyleTarget {
  properties: Map<string, { value: string; priority: string }>;
  setProperty(property: string, value: string, priority?: string): void;
  getPropertyValue(property: string): string;
  getPropertyPriority(property: string): string;
  removeProperty(property: string): string;
  item(index: number): string;
  readonly length: number;
  cssText: string;
}

/**
 * 创建 CSSStyleDeclaration 代理，支持任意 camelCase 属性访问与赋值。
 */
export function createStyleDeclaration(): CSSStyleDeclaration {
  const properties = new Map<string, { value: string; priority: string }>();

  const target: StyleTarget = {
    properties,

    setProperty(property: string, value: string, priority = ''): void {
      const name = normalizeCssProperty(property);
      if (value === '') {
        properties.delete(name);
      } else {
        properties.set(name, { value, priority });
      }
    },

    getPropertyValue(property: string): string {
      return properties.get(normalizeCssProperty(property))?.value ?? '';
    },

    getPropertyPriority(property: string): string {
      return properties.get(normalizeCssProperty(property))?.priority ?? '';
    },

    removeProperty(property: string): string {
      const name = normalizeCssProperty(property);
      const previous = properties.get(name)?.value ?? '';
      properties.delete(name);
      return previous;
    },

    item(index: number): string {
      return [...properties.keys()][index] ?? '';
    },

    get length(): number {
      return properties.size;
    },

    get cssText(): string {
      return [...properties.entries()]
        .map(
          ([name, entry]) =>
            `${name}: ${entry.value}${entry.priority ? ` ${entry.priority}` : ''};`
        )
        .join(' ');
    },

    set cssText(value: string) {
      properties.clear();
      for (const declaration of value.split(';')) {
        const trimmed = declaration.trim();
        if (!trimmed) {
          continue;
        }
        const separator = trimmed.indexOf(':');
        if (separator < 0) {
          continue;
        }
        const name = trimmed.slice(0, separator).trim();
        const propertyValue = trimmed.slice(separator + 1).trim();
        if (name) {
          target.setProperty(name, propertyValue);
        }
      }
    },
  };

  const handler: ProxyHandler<StyleTarget> = {
    get(t, property, receiver) {
      if (typeof property === 'symbol') {
        return Reflect.get(t, property, receiver);
      }
      if (property in t) {
        const value = Reflect.get(t, property, receiver);
        return typeof value === 'function' ? value.bind(t) : value;
      }
      return t.getPropertyValue(property);
    },
    set(t, property, value, receiver) {
      if (typeof property === 'symbol') {
        return Reflect.set(t, property, value, receiver);
      }
      if (property in t) {
        return Reflect.set(t, property, value, receiver);
      }
      t.setProperty(property, String(value));
      return true;
    },
    has(t, property) {
      if (typeof property === 'symbol') {
        return Reflect.has(t, property);
      }
      if (property in t) {
        return true;
      }
      return t.getPropertyValue(property) !== '';
    },
    ownKeys() {
      return [
        ...Reflect.ownKeys(target),
        ...[...properties.keys()].map((name) => camelCaseProperty(name)),
      ];
    },
    getOwnPropertyDescriptor(t, property) {
      if (typeof property === 'symbol') {
        return Reflect.getOwnPropertyDescriptor(t, property);
      }
      if (property in t) {
        return Reflect.getOwnPropertyDescriptor(t, property);
      }
      const value = t.getPropertyValue(property);
      if (value !== '') {
        return { configurable: true, enumerable: true, writable: true, value };
      }
      return undefined;
    },
  };

  return new Proxy(target, handler) as unknown as CSSStyleDeclaration;
}

function camelCaseProperty(property: string): string {
  return property.replace(/-([a-z])/g, (_match, char: string) =>
    char.toUpperCase()
  );
}

/**
 * 类数组节点列表：支持 .length、.item()、数值索引与迭代。
 */
export class NodeList<T extends Node = Node> implements Iterable<T> {
  /** @internal */
  private readonly items: T[];

  constructor(items: T[] = []) {
    this.items = items;
    for (let index = 0; index < items.length; index += 1) {
      Object.defineProperty(this, String(index), {
        configurable: true,
        enumerable: true,
        get: () => this.items[index],
      });
    }
  }

  public get length(): number {
    return this.items.length;
  }

  public item(index: number): T | null {
    return this.items[index] ?? null;
  }

  public [Symbol.iterator](): Iterator<T> {
    return this.items[Symbol.iterator]();
  }

  public forEach(
    callback: (value: T, index: number, list: NodeList<T>) => void
  ): void {
    this.items.forEach((value, index) => callback(value, index, this));
  }

  public entries(): IterableIterator<[number, T]> {
    return this.items.entries();
  }

  public keys(): IterableIterator<number> {
    return this.items.keys();
  }

  public values(): IterableIterator<T> {
    return this.items.values();
  }

  public toArray(): T[] {
    return [...this.items];
  }
}

/**
 * Node 基类：节点树、父子关系、文本内容。
 */
export class Node extends EventTarget {
  public static readonly ELEMENT_NODE = DomNodeType.ELEMENT_NODE;
  public static readonly TEXT_NODE = DomNodeType.TEXT_NODE;
  public static readonly COMMENT_NODE = DomNodeType.COMMENT_NODE;
  public static readonly DOCUMENT_NODE = DomNodeType.DOCUMENT_NODE;
  public static readonly DOCUMENT_FRAGMENT_NODE =
    DomNodeType.DOCUMENT_FRAGMENT_NODE;

  public readonly nodeType: number;
  public readonly nodeName: string;
  public parentNode: Node | null = null;
  public ownerDocument: Document | null = null;

  /** @internal */
  public childList: Node[] = [];

  constructor(nodeType: number, nodeName: string) {
    super();
    this.nodeType = nodeType;
    this.nodeName = nodeName;
  }

  public get parentElement(): Element | null {
    const parent = this.parentNode;
    return parent instanceof Element ? parent : null;
  }

  public get childNodes(): NodeList<Node> {
    return new NodeList([...this.childList]);
  }

  public get firstChild(): Node | null {
    return this.childList[0] ?? null;
  }

  public get lastChild(): Node | null {
    return this.childList[this.childList.length - 1] ?? null;
  }

  public get nextSibling(): Node | null {
    const parent = this.parentNode;
    if (!parent) {
      return null;
    }
    const index = parent.childList.indexOf(this);
    return index >= 0 ? (parent.childList[index + 1] ?? null) : null;
  }

  public get previousSibling(): Node | null {
    const parent = this.parentNode;
    if (!parent) {
      return null;
    }
    const index = parent.childList.indexOf(this);
    return index > 0 ? parent.childList[index - 1] : null;
  }

  public get textContent(): string {
    let text = '';
    for (const child of this.childList) {
      if (child.nodeType === DomNodeType.TEXT_NODE) {
        text += (child as Text).data;
      } else if (child.nodeType === DomNodeType.ELEMENT_NODE) {
        text += child.textContent;
      }
    }
    return text;
  }

  public set textContent(value: string) {
    this.childList = [];
    if (value) {
      const textNode = new Text(value);
      textNode.ownerDocument = this.ownerDocument;
      textNode.parentNode = this;
      this.childList.push(textNode);
    }
  }

  public hasChildNodes(): boolean {
    return this.childList.length > 0;
  }

  public appendChild<T extends Node>(node: T): T {
    if (node === (this as Node)) {
      throw new Error('Cannot append a node to itself');
    }
    this.insertBefore(node, null);
    return node;
  }

  public insertBefore<T extends Node>(node: T, reference: Node | null): T {
    if (node === (this as Node)) {
      throw new Error('Cannot insert a node before itself');
    }
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
    node.parentNode = this;
    if (node.ownerDocument === null) {
      node.ownerDocument = this.ownerDocument;
    }
    if (reference === null) {
      this.childList.push(node);
      return node;
    }
    const index = this.childList.indexOf(reference);
    if (index < 0) {
      throw new Error('Reference node is not a child of this node');
    }
    this.childList.splice(index, 0, node);
    return node;
  }

  public removeChild<T extends Node>(node: T): T {
    const index = this.childList.indexOf(node);
    if (index < 0) {
      throw new Error('Node is not a child of this node');
    }
    this.childList.splice(index, 1);
    node.parentNode = null;
    return node;
  }

  public replaceChild<T extends Node>(newChild: T, oldChild: Node): T {
    const index = this.childList.indexOf(oldChild);
    if (index < 0) {
      throw new Error('Old child is not a child of this node');
    }
    if (newChild.parentNode) {
      newChild.parentNode.removeChild(newChild);
    }
    newChild.parentNode = this;
    if (newChild.ownerDocument === null) {
      newChild.ownerDocument = this.ownerDocument;
    }
    this.childList[index] = newChild;
    oldChild.parentNode = null;
    return newChild;
  }

  public replaceChildren(...nodes: Node[]): void {
    for (const child of [...this.childList]) {
      this.removeChild(child);
    }
    for (const node of nodes) {
      this.appendChild(node);
    }
  }

  public contains(node: Node | null): boolean {
    if (!node) {
      return false;
    }
    let current: Node | null = node;
    while (current) {
      if (current === this) {
        return true;
      }
      current = current.parentNode;
    }
    return false;
  }

  public remove(): void {
    this.parentNode?.removeChild(this);
  }

  public cloneNode(deep = false): Node {
    const clone = this.createClone();
    if (deep) {
      for (const child of this.childList) {
        clone.appendChild(child.cloneNode(true) as Node);
      }
    }
    return clone;
  }

  /** @internal */
  protected createClone(): Node {
    const clone = new Node(this.nodeType, this.nodeName);
    clone.ownerDocument = this.ownerDocument;
    return clone;
  }

  public getRootNode(): Node {
    if (!this.parentNode) {
      return this;
    }
    let parent = this.parentNode;
    while (parent.parentNode) {
      parent = parent.parentNode;
    }
    return parent;
  }

  public get isConnected(): boolean {
    return this.getRootNode().nodeType === DomNodeType.DOCUMENT_NODE;
  }
}

/**
 * Element：标签节点。
 */
export class Element extends Node {
  public readonly namespaceURI: string | null;

  /** @internal */
  private readonly attributeList: Array<{ name: string; value: string }> = [];
  /** @internal */
  private styleValue: CSSStyleDeclaration | undefined;
  /** @internal */
  private classListValue: DOMTokenList | undefined;
  /** @internal */
  private datasetProxy: Record<string, string> | undefined;

  constructor(tagName: string, namespaceURI: string | null = null) {
    super(DomNodeType.ELEMENT_NODE, tagName.toUpperCase());
    this.namespaceURI = namespaceURI;
  }

  public get tagName(): string {
    return this.nodeName;
  }

  public get localName(): string {
    return this.nodeName.toLowerCase();
  }

  public get id(): string {
    return this.getAttribute('id') ?? '';
  }

  public set id(value: string) {
    this.setAttribute('id', value);
  }

  public get className(): string {
    return this.getAttribute('class') ?? '';
  }

  public set className(value: string) {
    this.setAttribute('class', value);
  }

  public get classList(): DOMTokenList {
    if (!this.classListValue) {
      this.classListValue = new DOMTokenList(this, 'class');
    }
    return this.classListValue;
  }

  public get style(): CSSStyleDeclaration {
    if (!this.styleValue) {
      this.styleValue = createStyleDeclaration();
    }
    return this.styleValue;
  }

  public get dataset(): Record<string, string> {
    if (!this.datasetProxy) {
      this.datasetProxy = createDatasetProxy(this);
    }
    return this.datasetProxy;
  }

  public get children(): NodeList<Element> {
    return new NodeList(
      this.childList.filter(
        (child): child is Element => child.nodeType === DomNodeType.ELEMENT_NODE
      )
    );
  }

  public get firstElementChild(): Element | null {
    return this.children.item(0);
  }

  public get lastElementChild(): Element | null {
    return this.children.item(this.children.length - 1);
  }

  public get childElementCount(): number {
    return this.children.length;
  }

  public get attributes(): NamedNodeMap {
    return new NamedNodeMap(this);
  }

  public getAttribute(name: string): string | null {
    const entry = this.findAttribute(name);
    return entry ? entry.value : null;
  }

  public getAttributeNames(): string[] {
    return this.attributeList.map((entry) => entry.name);
  }

  public setAttribute(name: string, value: unknown): void {
    const stringValue = String(value);
    if (name === 'style') {
      this.styleValue = createStyleDeclaration();
      this.styleValue.cssText = stringValue;
    }
    const entry = this.findAttribute(name);
    if (entry) {
      entry.value = stringValue;
    } else {
      this.attributeList.push({ name, value: stringValue });
    }
  }

  public removeAttribute(name: string): void {
    if (name === 'style') {
      this.styleValue = createStyleDeclaration();
    }
    const index = this.attributeList.findIndex((entry) => entry.name === name);
    if (index >= 0) {
      this.attributeList.splice(index, 1);
    }
  }

  public hasAttribute(name: string): boolean {
    return this.findAttribute(name) !== undefined;
  }

  public toggleAttribute(name: string, force?: boolean): boolean {
    const shouldAdd = force ?? !this.hasAttribute(name);
    if (shouldAdd) {
      this.setAttribute(name, '');
    } else {
      this.removeAttribute(name);
    }
    return shouldAdd;
  }

  public hasAttributes(): boolean {
    return this.attributeList.length > 0;
  }

  public get innerHTML(): string {
    return serializeChildren(this);
  }

  public set innerHTML(value: string) {
    this.replaceChildren(...parseHtmlFragment(value, this.ownerDocument));
  }

  public get outerHTML(): string {
    return serializeNode(this);
  }

  public get value(): string {
    return this.getAttribute('value') ?? '';
  }

  public set value(value: string) {
    this.setAttribute('value', value);
  }

  public querySelector(selector: string): Element | null {
    return querySelectorAll(this, selector).item(0);
  }

  public querySelectorAll(selector: string): NodeList<Element> {
    return querySelectorAll(this, selector);
  }

  public getElementsByTagName(tagName: string): NodeList<Element> {
    const lowered = tagName.toLowerCase();
    const results: Element[] = [];
    collectElements(this, (element) => {
      if (element.localName === lowered) {
        results.push(element);
      }
    });
    return new NodeList(results);
  }

  public matches(selector: string): boolean {
    return matchSelector(this, selector);
  }

  public closest(selector: string): Element | null {
    if (this.matches(selector)) {
      return this;
    }
    let parent = this.parentElement;
    while (parent) {
      if (parent.matches(selector)) {
        return parent;
      }
      parent = parent.parentElement;
    }
    return null;
  }

  public getBoundingClientRect(): DOMRect {
    const view = this.ownerDocument?.defaultView;
    // 无排版引擎时 body/documentElement 的边界即视口，给默认视口尺寸
    const width = view?.innerWidth ?? 1024;
    const height = view?.innerHeight ?? 768;
    const current = this as unknown as HTMLElement;
    const viewport =
      current === this.ownerDocument?.body ||
      current === this.ownerDocument?.documentElement;
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: viewport ? width : 0,
      bottom: viewport ? height : 0,
      width: viewport ? width : 0,
      height: viewport ? height : 0,
      toJSON(): Record<string, number> {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: viewport ? width : 0,
          bottom: viewport ? height : 0,
          width: viewport ? width : 0,
          height: viewport ? height : 0,
        };
      },
    };
  }

  public scrollIntoView(): void {}

  public focus(): void {
    this.ownerDocument?.setActiveElement(this);
  }

  public blur(): void {
    if (this.ownerDocument?.activeElement === this) {
      this.ownerDocument.setActiveElement(null);
    }
  }

  public click(): void {
    // 禁用态表单控件不派发 click（真实浏览器行为）
    const candidate = this as unknown as { disabled?: boolean };
    if (candidate.disabled === true) {
      return;
    }
    this.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
    // 表单按钮默认行为：type=reset 的按钮点击触发表单 reset 事件
    if (
      this.tagName === 'BUTTON' &&
      this.getAttribute('type') === 'reset' &&
      this.isConnected
    ) {
      this.closest('form')?.dispatchEvent(
        new Event('reset', { bubbles: true, cancelable: true })
      );
    }
  }

  public append(...nodes: (Node | string)[]): void {
    for (const node of nodes) {
      if (typeof node === 'string') {
        const textNode = new Text(node);
        textNode.ownerDocument = this.ownerDocument;
        this.appendChild(textNode);
      } else {
        this.appendChild(node);
      }
    }
  }

  public prepend(...nodes: (Node | string)[]): void {
    const reference = this.firstChild;
    for (const node of nodes) {
      if (typeof node === 'string') {
        const textNode = new Text(node);
        textNode.ownerDocument = this.ownerDocument;
        this.insertBefore(textNode, reference);
      } else {
        this.insertBefore(node, reference);
      }
    }
  }

  public before(...nodes: (Node | string)[]): void {
    const parent = this.parentNode;
    if (!parent) {
      return;
    }
    for (const node of nodes) {
      if (typeof node === 'string') {
        const textNode = new Text(node);
        textNode.ownerDocument = this.ownerDocument;
        parent.insertBefore(textNode, this);
      } else {
        parent.insertBefore(node, this);
      }
    }
  }

  public after(...nodes: (Node | string)[]): void {
    const parent = this.parentNode;
    if (!parent) {
      return;
    }
    const reference = this.nextSibling;
    for (const node of nodes) {
      if (typeof node === 'string') {
        const textNode = new Text(node);
        textNode.ownerDocument = this.ownerDocument;
        parent.insertBefore(textNode, reference);
      } else {
        parent.insertBefore(node, reference);
      }
    }
  }

  public replaceWith(...nodes: (Node | string)[]): void {
    const parent = this.parentNode;
    if (!parent) {
      return;
    }
    const reference = this.nextSibling;
    parent.removeChild(this);
    for (const node of nodes) {
      if (typeof node === 'string') {
        const textNode = new Text(node);
        textNode.ownerDocument = this.ownerDocument;
        parent.insertBefore(textNode, reference);
      } else {
        parent.insertBefore(node, reference);
      }
    }
  }

  public setAttributeNS(
    _namespace: string,
    name: string,
    value: unknown
  ): void {
    this.setAttribute(name, value);
  }

  public removeAttributeNS(_namespace: string, name: string): void {
    this.removeAttribute(name);
  }

  public hasAttributeNS(_namespace: string, name: string): boolean {
    return this.hasAttribute(name);
  }

  public getAttributeNS(_namespace: string, name: string): string | null {
    return this.getAttribute(name);
  }

  /** @internal */
  public findAttribute(
    name: string
  ): { name: string; value: string } | undefined {
    return this.attributeList.find((entry) => entry.name === name);
  }

  /** @internal */
  public attributeEntries(): Array<{ name: string; value: string }> {
    return [...this.attributeList];
  }

  /** @internal 供序列化读取内联样式。 */
  public inlineStyleText(): string {
    return this.styleValue?.cssText ?? '';
  }

  /** @internal */
  protected createClone(): Node {
    const clone = createElementForTag(this.localName, this.ownerDocument);
    for (const entry of this.attributeList) {
      clone.setAttribute(entry.name, entry.value);
    }
    return clone;
  }
}

export class HTMLElement extends Element {
  constructor(tagName: string) {
    super(tagName);
  }

  /** 页面语言（属性反射，无值回退空串）。 */
  public get lang(): string {
    return this.getAttribute('lang') ?? '';
  }

  public set lang(value: string) {
    this.setAttribute('lang', value);
  }

  /** 是否隐藏（布尔属性反射）。 */
  public get hidden(): boolean {
    return this.hasAttribute('hidden');
  }

  public set hidden(value: boolean) {
    if (value) {
      this.setAttribute('hidden', '');
    } else {
      this.removeAttribute('hidden');
    }
  }

  /** 键盘焦点顺序（数字属性反射；0 表示按文档顺序）。 */
  public get tabIndex(): number {
    const raw = this.getAttribute('tabindex');
    return raw === null ? 0 : Number(raw);
  }

  public set tabIndex(value: number) {
    if (value === 0) {
      this.removeAttribute('tabindex');
    } else {
      this.setAttribute('tabindex', String(value));
    }
  }

  /** 布局尺寸与偏移；无排版引擎时恒为 0，测试可覆盖 getBoundingClientRect。 */
  public get offsetWidth(): number {
    return 0;
  }

  public get offsetHeight(): number {
    return 0;
  }

  public get offsetLeft(): number {
    return 0;
  }

  public get offsetTop(): number {
    return 0;
  }
}

export class NamedNodeMap implements Iterable<{ name: string; value: string }> {
  private readonly element: Element;

  constructor(element: Element) {
    this.element = element;
    for (let index = 0; index < element.attributeEntries().length; index += 1) {
      Object.defineProperty(this, String(index), {
        configurable: true,
        enumerable: true,
        get: () => this.element.attributeEntries()[index] ?? null,
      });
    }
  }

  public get length(): number {
    return this.element.attributeEntries().length;
  }

  public item(index: number): { name: string; value: string } | null {
    return this.element.attributeEntries()[index] ?? null;
  }

  public getNamedItem(name: string): { name: string; value: string } | null {
    return this.element.findAttribute(name) ?? null;
  }

  public setNamedItem(attr: { name: string; value: string }): void {
    this.element.setAttribute(attr.name, attr.value);
  }

  public removeNamedItem(name: string): void {
    this.element.removeAttribute(name);
  }

  public [Symbol.iterator](): Iterator<{ name: string; value: string }> {
    return this.element.attributeEntries()[Symbol.iterator]();
  }
}

export class HTMLOptionElement extends HTMLElement {
  /** @internal */
  private selectedValue: boolean | undefined;

  constructor(tagName = 'option') {
    super(tagName);
  }

  public get value(): string {
    return this.getAttribute('value') ?? this.textContent;
  }

  public set value(value: string) {
    this.setAttribute('value', value);
  }

  public get text(): string {
    return this.textContent;
  }

  public get label(): string {
    return this.getAttribute('label') ?? this.textContent;
  }

  public get selected(): boolean {
    return this.hasSelectedValue();
  }

  public set selected(value: boolean) {
    this.setSelectedRaw(value);
    if (value) {
      const select = this.parentElement;
      if (select instanceof HTMLSelectElement && !select.multiple) {
        for (const option of select.options.toArray()) {
          if (option !== this) {
            option.setSelectedRaw(false);
          }
        }
      }
    }
  }

  /** @internal */
  public setSelectedRaw(value: boolean): void {
    this.selectedValue = value;
    if (value) {
      this.setAttribute('selected', '');
    } else {
      this.removeAttribute('selected');
    }
  }

  /** @internal */
  public hasSelectedValue(): boolean {
    if (this.selectedValue !== undefined) {
      return this.selectedValue;
    }
    return this.hasAttribute('selected');
  }
}

export class HTMLSelectElement extends HTMLElement {
  constructor(tagName = 'select') {
    super(tagName);
  }

  public get disabled(): boolean {
    return this.hasAttribute('disabled');
  }

  public set disabled(value: boolean) {
    if (value) {
      this.setAttribute('disabled', '');
    } else {
      this.removeAttribute('disabled');
    }
  }

  public get multiple(): boolean {
    return this.hasAttribute('multiple');
  }

  public set multiple(value: boolean) {
    if (value) {
      this.setAttribute('multiple', '');
    } else {
      this.removeAttribute('multiple');
    }
  }

  public get options(): HTMLOptionsCollection {
    const options: HTMLOptionElement[] = [];
    collectElements(this, (element) => {
      if (element instanceof HTMLOptionElement) {
        options.push(element);
      }
    });
    return new HTMLOptionsCollection(options);
  }

  public get selectedOptions(): NodeList<HTMLOptionElement> {
    return new NodeList(
      this.options.toArray().filter((option) => option.hasSelectedValue())
    );
  }

  public get selectedIndex(): number {
    return this.options
      .toArray()
      .findIndex((option) => option.hasSelectedValue());
  }

  public set selectedIndex(index: number) {
    const options = this.options.toArray();
    options.forEach((option, optionIndex) =>
      option.setSelectedRaw(optionIndex === index)
    );
  }

  public get value(): string {
    const options = this.options.toArray();
    const selected = options.find((option) => option.hasSelectedValue());
    if (selected) {
      return selected.value;
    }
    if (!this.multiple && options.length > 0) {
      return options[0].value;
    }
    return '';
  }

  public set value(value: string) {
    const options = this.options.toArray();
    for (const option of options) {
      const shouldSelect = option.value === value;
      if (shouldSelect) {
        if (this.multiple) {
          option.setSelectedRaw(true);
        } else {
          for (const other of options) {
            other.setSelectedRaw(other === option);
          }
          return;
        }
      }
    }
  }

  public add(option: HTMLOptionElement): void {
    this.appendChild(option);
  }

  public removeOption(index: number): void {
    const options = this.options.toArray();
    const option = options[index];
    if (option) {
      option.remove();
    }
  }
}

export class HTMLOptionsCollection implements Iterable<HTMLOptionElement> {
  private readonly items: HTMLOptionElement[];

  constructor(items: HTMLOptionElement[]) {
    this.items = items;
    for (let index = 0; index < items.length; index += 1) {
      Object.defineProperty(this, String(index), {
        configurable: true,
        enumerable: true,
        get: () => this.items[index],
      });
    }
  }

  public get length(): number {
    return this.items.length;
  }

  public item(index: number): HTMLOptionElement | null {
    return this.items[index] ?? null;
  }

  public get value(): string {
    return this.items.find((option) => option.hasSelectedValue())?.value ?? '';
  }

  public get selectedIndex(): number {
    return this.items.findIndex((option) => option.hasSelectedValue());
  }

  public toArray(): HTMLOptionElement[] {
    return [...this.items];
  }

  public [Symbol.iterator](): Iterator<HTMLOptionElement> {
    return this.items[Symbol.iterator]();
  }
}

export class HTMLInputElement extends HTMLElement {
  /** @internal */
  private inputValue: string | undefined;
  /** @internal */
  private checkedValue: boolean | undefined;

  constructor(tagName = 'input') {
    super(tagName);
  }

  public get type(): string {
    return this.getAttribute('type') ?? 'text';
  }

  public set type(value: string) {
    this.setAttribute('type', value);
  }

  public get name(): string {
    return this.getAttribute('name') ?? '';
  }

  public set name(value: string) {
    this.setAttribute('name', value);
  }

  public get value(): string {
    return this.inputValue ?? this.getAttribute('value') ?? '';
  }

  public set value(value: string) {
    this.inputValue = value;
  }

  public get defaultValue(): string {
    return this.getAttribute('value') ?? '';
  }

  public get checked(): boolean {
    return this.checkedValue ?? this.hasAttribute('checked');
  }

  public set checked(value: boolean) {
    this.checkedValue = value;
  }

  public get disabled(): boolean {
    return this.hasAttribute('disabled');
  }

  public set disabled(value: boolean) {
    if (value) {
      this.setAttribute('disabled', '');
    } else {
      this.removeAttribute('disabled');
    }
  }

  public get placeholder(): string {
    return this.getAttribute('placeholder') ?? '';
  }

  public set placeholder(value: string) {
    this.setAttribute('placeholder', value);
  }

  public get accept(): string {
    return this.getAttribute('accept') ?? '';
  }

  public get multiple(): boolean {
    return this.hasAttribute('multiple');
  }

  public set multiple(value: boolean) {
    if (value) {
      this.setAttribute('multiple', '');
    } else {
      this.removeAttribute('multiple');
    }
  }

  public set accept(value: string) {
    this.setAttribute('accept', value);
  }

  public get min(): string {
    return this.getAttribute('min') ?? '';
  }

  public set min(value: string) {
    this.setAttribute('min', value);
  }

  public get max(): string {
    return this.getAttribute('max') ?? '';
  }

  public set max(value: string) {
    this.setAttribute('max', value);
  }

  public get step(): string {
    return this.getAttribute('step') ?? '';
  }

  public set step(value: string) {
    this.setAttribute('step', value);
  }

  /** @internal */
  protected createClone(): Node {
    const clone = super.createClone() as HTMLInputElement;
    clone.inputValue = this.inputValue;
    clone.checkedValue = this.checkedValue;
    return clone;
  }
}

export class HTMLTextAreaElement extends HTMLElement {
  /** @internal */
  private textareaValue: string | undefined;

  constructor(tagName = 'textarea') {
    super(tagName);
  }

  public get value(): string {
    return this.textareaValue ?? this.textContent;
  }

  public set value(value: string) {
    this.textareaValue = value;
  }

  public get name(): string {
    return this.getAttribute('name') ?? '';
  }

  public set name(value: string) {
    this.setAttribute('name', value);
  }

  public get disabled(): boolean {
    return this.hasAttribute('disabled');
  }

  public set disabled(value: boolean) {
    if (value) {
      this.setAttribute('disabled', '');
    } else {
      this.removeAttribute('disabled');
    }
  }

  public get placeholder(): string {
    return this.getAttribute('placeholder') ?? '';
  }

  public set placeholder(value: string) {
    this.setAttribute('placeholder', value);
  }
}

export class HTMLButtonElement extends HTMLElement {
  constructor(tagName = 'button') {
    super(tagName);
  }

  public get disabled(): boolean {
    return this.hasAttribute('disabled');
  }

  public set disabled(value: boolean) {
    if (value) {
      this.setAttribute('disabled', '');
    } else {
      this.removeAttribute('disabled');
    }
  }

  public get type(): string {
    return this.getAttribute('type') ?? 'submit';
  }
}

export class HTMLTableCellElement extends HTMLElement {
  constructor(tagName = 'td') {
    super(tagName);
  }

  public get colSpan(): number {
    const raw = this.getAttribute('colspan');
    return raw === null ? 1 : Number(raw);
  }

  public set colSpan(value: number) {
    this.setAttribute('colspan', String(value));
  }
}

export class HTMLLabelElement extends HTMLElement {
  constructor(tagName = 'label') {
    super(tagName);
  }

  public get htmlFor(): string {
    return this.getAttribute('for') ?? '';
  }

  public set htmlFor(value: string) {
    this.setAttribute('for', value);
  }
}

export class HTMLImageElement extends HTMLElement {
  constructor(tagName = 'img') {
    super(tagName);
  }

  public get src(): string {
    return this.getAttribute('src') ?? '';
  }

  public set src(value: string) {
    this.setAttribute('src', value);
  }

  public get alt(): string {
    return this.getAttribute('alt') ?? '';
  }

  public set alt(value: string) {
    this.setAttribute('alt', value);
  }
}

export class HTMLStyleElement extends HTMLElement {
  constructor(tagName = 'style') {
    super(tagName);
  }
}

export class HTMLAnchorElement extends HTMLElement {
  constructor(tagName = 'a') {
    super(tagName);
  }

  public get href(): string {
    return this.getAttribute('href') ?? '';
  }

  public set href(value: string) {
    this.setAttribute('href', value);
  }
}

export class Text extends Node {
  public data: string;

  constructor(data = '') {
    super(DomNodeType.TEXT_NODE, '#text');
    this.data = data;
  }

  public get nodeValue(): string {
    return this.data;
  }

  public set nodeValue(value: string) {
    this.data = value;
  }

  public get textContent(): string {
    return this.data;
  }

  public set textContent(value: string) {
    this.data = value;
  }

  public get wholeText(): string {
    return this.data;
  }

  /** @internal */
  protected createClone(): Node {
    const clone = new Text(this.data);
    clone.ownerDocument = this.ownerDocument;
    return clone;
  }
}

export class Comment extends Node {
  public data: string;

  constructor(data = '') {
    super(DomNodeType.COMMENT_NODE, '#comment');
    this.data = data;
  }

  public get nodeValue(): string {
    return this.data;
  }

  public set nodeValue(value: string) {
    this.data = value;
  }

  /** @internal */
  protected createClone(): Node {
    const clone = new Comment(this.data);
    clone.ownerDocument = this.ownerDocument;
    return clone;
  }
}

export class DocumentFragment extends Node {
  constructor() {
    super(DomNodeType.DOCUMENT_FRAGMENT_NODE, '#document-fragment');
  }
}

export interface DomDocumentImplementation {
  createHTMLDocument(title?: string): Document;
  createDocument(): Document;
  createDocumentType(): never;
  hasFeature(): boolean;
}

export class DomDOMImplementation implements DomDocumentImplementation {
  public createDocument(): Document {
    return new Document();
  }

  public createDocumentType(): never {
    throw new Error('createDocumentType is not supported in tsone DOM');
  }

  public hasFeature(): boolean {
    return false;
  }

  public createHTMLDocument(title?: string): Document {
    const document = new Document();
    const html = document.createElement('html');
    const head = document.createElement('head');
    const body = document.createElement('body');
    if (title) {
      const titleElement = document.createElement('title');
      titleElement.textContent = title;
      head.appendChild(titleElement);
    }
    html.appendChild(head);
    html.appendChild(body);
    document.appendChild(html);
    return document;
  }
}

export class Document extends Node {
  public readonly defaultView: DomWindow | null = null;

  public readonly implementation: DomDocumentImplementation;

  private activeElementRef: Element | null = null;

  constructor() {
    super(DomNodeType.DOCUMENT_NODE, '#document');
    this.implementation = new DomDOMImplementation();
  }

  public get activeElement(): Element | null {
    return this.activeElementRef;
  }

  /** @internal 由 Element.focus()/blur() 维护。 */
  public setActiveElement(element: Element | null): void {
    this.activeElementRef = element;
  }

  public createElement(tagName: string): HTMLElement {
    return createElementForTag(tagName, this);
  }

  public createElementNS(namespaceURI: string, tagName: string): HTMLElement {
    const element = createElementForTag(tagName, this);
    (element as { namespaceURI: string | null }).namespaceURI = namespaceURI;
    return element;
  }

  public createTextNode(data: string): Text {
    const text = new Text(data);
    text.ownerDocument = this;
    return text;
  }

  public createComment(data: string): Comment {
    const comment = new Comment(data);
    comment.ownerDocument = this;
    return comment;
  }

  public createDocumentFragment(): DocumentFragment {
    const fragment = new DocumentFragment();
    fragment.ownerDocument = this;
    return fragment;
  }

  public createEvent(type: string): Event {
    if (type === 'MouseEvent' || type === 'mouseevent') {
      return new MouseEvent('');
    }
    if (type === 'KeyboardEvent' || type === 'keyboardevent') {
      return new KeyboardEvent('');
    }
    if (type === 'CustomEvent' || type === 'customevent') {
      return new CustomEvent('');
    }
    return new Event('');
  }

  public get documentElement(): HTMLElement {
    const html = this.childList.find(
      (child) => child.nodeType === DomNodeType.ELEMENT_NODE
    ) as HTMLElement | undefined;
    if (html) {
      return html;
    }
    const created = createElementForTag('html', this);
    this.appendChild(created);
    return created;
  }

  public get head(): HTMLElement {
    return this.ensureDocumentChild('head');
  }

  public get body(): HTMLElement {
    return this.ensureDocumentChild('body');
  }

  public get title(): string {
    const titleElement = this.querySelector('title');
    return titleElement?.textContent ?? '';
  }

  public set title(value: string) {
    let titleElement = this.querySelector('title');
    if (!titleElement) {
      titleElement = createElementForTag('title', this);
      this.head.appendChild(titleElement);
    }
    titleElement.textContent = value;
  }

  public querySelector(selector: string): Element | null {
    return querySelectorAll(this, selector).item(0);
  }

  public querySelectorAll(selector: string): NodeList<Element> {
    return querySelectorAll(this, selector);
  }

  public getElementById(id: string): Element | null {
    let result: Element | null = null;
    collectElements(this, (element) => {
      if (!result && element.id === id) {
        result = element;
      }
    });
    return result;
  }

  public getElementsByTagName(tagName: string): NodeList<Element> {
    return this.documentElement.getElementsByTagName(tagName);
  }

  /** @internal */
  protected createClone(): Node {
    return new Document();
  }

  private ensureDocumentChild(tagName: 'head' | 'body'): HTMLElement {
    const documentElement = this.documentElement;
    let child = documentElement.childList.find(
      (node) =>
        node.nodeType === DomNodeType.ELEMENT_NODE &&
        (node as Element).localName === tagName
    ) as HTMLElement | undefined;
    if (!child) {
      child = createElementForTag(tagName, this);
      documentElement.appendChild(child);
    }
    return child;
  }
}

/**
 * History / Location / Storage 等浏览器环境对象。
 */
export class Location {
  /** @internal */
  private url: URL;

  constructor(url: string) {
    this.url = new URL(url);
  }

  public get href(): string {
    return this.url.href;
  }

  public set href(value: string) {
    this.url = new URL(value, this.url.href);
  }

  public get origin(): string {
    return this.url.origin;
  }

  public get protocol(): string {
    return this.url.protocol;
  }

  public get host(): string {
    return this.url.host;
  }

  public get hostname(): string {
    return this.url.hostname;
  }

  public get port(): string {
    return this.url.port;
  }

  public get pathname(): string {
    return this.url.pathname;
  }

  public set pathname(value: string) {
    const url = this.url;
    const next = new URL(value, url.href);
    url.pathname = next.pathname;
  }

  public get search(): string {
    return this.url.search;
  }

  public set search(value: string) {
    this.url.search = value.startsWith('?') ? value : `?${value}`;
  }

  public get hash(): string {
    return this.url.hash;
  }

  public set hash(value: string) {
    const nextHash = value.startsWith('#') ? value : `#${value}`;
    this.url.hash = nextHash;
  }

  public get username(): string {
    return this.url.username;
  }

  public get password(): string {
    return this.url.password;
  }

  public assign(value: string): void {
    this.url = new URL(value, this.url.href);
  }

  public replace(value: string): void {
    this.url = new URL(value, this.url.href);
  }

  public reload(): void {}

  public toString(): string {
    return this.url.href;
  }

  /** @internal */
  public getHashPath(): string {
    return this.url.hash.slice(1);
  }

  /** @internal */
  public getHrefWithoutHash(): string {
    const url = this.url;
    return `${url.origin}${url.pathname}${url.search}`;
  }
}

interface HistoryEntry {
  state: unknown;
  url: string;
}

export class History {
  /** @internal */
  private readonly windowRef: DomWindow;
  /** @internal */
  private entries: HistoryEntry[] = [];
  /** @internal */
  private index = 0;
  /** @internal */
  public scrollRestoration: 'auto' | 'manual' = 'auto';

  constructor(windowRef: DomWindow) {
    this.windowRef = windowRef;
    this.entries = [{ state: null, url: windowRef.location.href }];
  }

  public get length(): number {
    return this.entries.length;
  }

  public get state(): unknown {
    return this.entries[this.index]?.state ?? null;
  }

  public pushState(state: unknown, _unusedTitle: string, url?: string): void {
    const nextUrl = url
      ? new URL(url, this.windowRef.location.href).href
      : this.windowRef.location.href;
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push({ state, url: nextUrl });
    this.index = this.entries.length - 1;
    this.windowRef.setLocationUrl(nextUrl);
  }

  public replaceState(
    state: unknown,
    _unusedTitle: string,
    url?: string
  ): void {
    const nextUrl = url
      ? new URL(url, this.windowRef.location.href).href
      : this.windowRef.location.href;
    this.entries[this.index] = { state, url: nextUrl };
    this.windowRef.setLocationUrl(nextUrl);
  }

  public back(): void {
    this.go(-1);
  }

  public forward(): void {
    this.go(1);
  }

  public go(delta = 0): void {
    const nextIndex = this.index + delta;
    if (nextIndex < 0 || nextIndex >= this.entries.length) {
      return;
    }
    this.index = nextIndex;
    this.windowRef.setLocationUrl(this.entries[nextIndex].url);
    this.windowRef.dispatchEvent(
      new Event('popstate', { bubbles: false, cancelable: false })
    );
  }
}

export class Storage {
  private readonly store = new Map<string, string>();

  public get length(): number {
    return this.store.size;
  }

  public key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }

  public getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  public setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  public removeItem(key: string): void {
    this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
  }
}

export class Navigator {
  public readonly userAgent = 'TSone/0.5.1';
  public readonly platform = 'TSone';
  public readonly language = 'zh-CN';
  public readonly languages = ['zh-CN'];
  public readonly onLine = true;
  public readonly maxTouchPoints = 0;
}

export interface MediaQueryList {
  readonly media: string;
  readonly matches: boolean;
  onchange: ((event: Event) => void) | null;
  addEventListener(type: string, listener: EventListenerRecord): void;
  removeEventListener(type: string, listener: EventListenerRecord): void;
  addListener(listener: EventListenerRecord): void;
  removeListener(listener: EventListenerRecord): void;
  dispatchEvent(event: Event): boolean;
}

export function createMatchMedia(
  _windowRef: DomWindow,
  query: string
): MediaQueryList {
  const listeners = new Set<EventListenerRecord>();
  const matches = false;
  const list: MediaQueryList = {
    media: query,
    matches,
    onchange: null,
    addEventListener(type, listener) {
      if (type === 'change') {
        listeners.add(listener);
      }
    },
    removeEventListener(type, listener) {
      if (type === 'change') {
        listeners.delete(listener);
      }
    },
    addListener(listener) {
      listeners.add(listener);
    },
    removeListener(listener) {
      listeners.delete(listener);
    },
    dispatchEvent(event) {
      for (const listener of [...listeners]) {
        if (typeof listener === 'function') {
          listener.call(list, event);
        } else {
          listener.handleEvent(event);
        }
      }
      return true;
    },
  };
  return list;
}

export class ResizeObserver {
  public observe(): void {}
  public unobserve(): void {}
  public disconnect(): void {}
}

export const DOM_GLOBAL_KEYS: readonly string[] = [
  'window',
  'document',
  'Node',
  'Text',
  'Comment',
  'Element',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
  'HTMLButtonElement',
  'HTMLOptionElement',
  'HTMLStyleElement',
  'HTMLAnchorElement',
  'HTMLImageElement',
  'HTMLTableCellElement',
  'HTMLLabelElement',
  'DocumentFragment',
  'Document',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'CustomEvent',
  'EventTarget',
  'DOMException',
  'history',
  'location',
  'navigator',
  'localStorage',
  'matchMedia',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'ResizeObserver',
];

/**
 * DomWindow：模拟的浏览器 window 环境。
 */
export class DomWindow extends EventTarget {
  public readonly innerWidth = 1024;
  public readonly innerHeight = 768;

  public setTimeout(
    handler: () => void,
    timeout?: number
  ): ReturnType<typeof setTimeout> {
    return setTimeout(handler, timeout);
  }

  public clearTimeout(id: ReturnType<typeof setTimeout>): void {
    clearTimeout(id);
  }
  public readonly window: DomWindow = this;
  public readonly document: Document;
  public readonly location: Location;
  public readonly history: History;
  public readonly localStorage = new Storage();
  public readonly navigator = new Navigator();
  public readonly Node = Node;
  public readonly Text = Text;
  public readonly Comment = Comment;
  public readonly Element = Element;
  public readonly HTMLElement = HTMLElement;
  public readonly HTMLInputElement = HTMLInputElement;
  public readonly HTMLTextAreaElement = HTMLTextAreaElement;
  public readonly HTMLSelectElement = HTMLSelectElement;
  public readonly HTMLButtonElement = HTMLButtonElement;
  public readonly HTMLOptionElement = HTMLOptionElement;
  public readonly HTMLStyleElement = HTMLStyleElement;
  public readonly HTMLAnchorElement = HTMLAnchorElement;
  public readonly DocumentFragment = DocumentFragment;
  public readonly Document = Document;
  public readonly Event = Event;
  public readonly MouseEvent = MouseEvent;
  public readonly KeyboardEvent = KeyboardEvent;
  public readonly CustomEvent = CustomEvent;
  public readonly EventTarget = EventTarget;
  public readonly DOMException = DOMException;
  public readonly NodeList = NodeList;

  constructor(options: { url?: string } = {}) {
    super();
    const url = options.url ?? 'http://localhost/';
    this.location = new Location(url);
    this.history = new History(this);
    this.document = new Document();
    (this.document as { defaultView: DomWindow | null }).defaultView = this;
    setupDocumentTree(this.document);
  }

  public matchMedia(query: string): MediaQueryList {
    return createMatchMedia(this, query);
  }

  public getComputedStyle(element: Element): CSSStyleDeclaration {
    return element.style;
  }

  public requestAnimationFrame(callback: FrameRequestCallback): number {
    return setTimeout(() => callback(Date.now()), 0) as unknown as number;
  }

  public cancelAnimationFrame(handle: number): void {
    clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
  }

  /** @internal */
  public setLocationUrl(url: string): void {
    this.location.href = url;
  }

  /** @internal 安装到目标对象上的全局属性名。 */
  public installKeys(): string[] {
    return [...DOM_GLOBAL_KEYS];
  }
}

export interface DomWindowOptions {
  url?: string;
}

/**
 * 创建隔离的 DOM window 环境。
 */
export function createDomWindow(options: DomWindowOptions = {}): DomWindow {
  return new DomWindow(options);
}

/**
 * 将 DOM window 的全局属性安装到目标对象（默认 globalThis），
 * 返回可恢复旧值的函数。
 */
export function installDomGlobals(
  windowRef: DomWindow,
  target: Record<string, unknown> = globalThis as Record<string, unknown>
): () => void {
  const previous = new Map<string, PropertyDescriptor | undefined>();
  const keys = windowRef.installKeys();
  for (const key of keys) {
    previous.set(key, Object.getOwnPropertyDescriptor(target, key));
  }
  for (const key of keys) {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: (windowRef as unknown as Record<string, unknown>)[key],
    });
  }
  Object.defineProperty(target, 'window', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: windowRef,
  });

  return () => {
    for (const key of keys) {
      const descriptor = previous.get(key);
      if (descriptor) {
        Object.defineProperty(target, key, descriptor);
      } else {
        Reflect.deleteProperty(target, key);
      }
    }
  };
}

/**
 * 解析 HTML 片段为节点列表（innerHTML setter 用）。
 */
export function parseHtmlFragment(
  source: string,
  documentRef: Document | null
): Node[] {
  const root = new DocumentFragment();
  if (documentRef) {
    root.ownerDocument = documentRef;
  }
  parseInto(root, source, documentRef);
  return [...root.childList];
}

function parseInto(
  parent: Node,
  source: string,
  documentRef: Document | null
): void {
  const stack: Element[] = [];
  let current: Node = parent;
  let index = 0;
  const length = source.length;

  const append = (node: Node): void => {
    if (node.ownerDocument === null) {
      node.ownerDocument = documentRef;
    }
    current.appendChild(node);
  };

  while (index < length) {
    const openIndex = source.indexOf('<', index);
    if (openIndex < 0) {
      append(new Text(source.slice(index)));
      break;
    }
    if (openIndex > index) {
      append(new Text(source.slice(index, openIndex)));
    }
    if (source.startsWith('<!--', openIndex)) {
      const closeIndex = source.indexOf('-->', openIndex + 4);
      const commentEnd = closeIndex < 0 ? length : closeIndex;
      append(new Comment(source.slice(openIndex + 4, commentEnd)));
      index = closeIndex < 0 ? length : closeIndex + 3;
      continue;
    }
    const tagEnd = findTagEnd(source, openIndex);
    if (tagEnd < 0) {
      append(new Text(source.slice(openIndex)));
      break;
    }
    const tagSource = source.slice(openIndex + 1, tagEnd);
    const trimmed = tagSource.trim();
    if (trimmed.startsWith('/')) {
      const tagName = trimmed.slice(1).trim().toLowerCase();
      if (stack.length > 0 && stack[stack.length - 1].localName === tagName) {
        stack.pop();
        current = stack[stack.length - 1] ?? parent;
      }
      index = tagEnd + 1;
      continue;
    }
    const selfClosing = trimmed.endsWith('/');
    const parsed = parseTag(trimmed.replace(/\/$/, '').trim());
    if (!parsed) {
      index = tagEnd + 1;
      continue;
    }
    const element = createElementForTag(parsed.name, documentRef);
    for (const attr of parsed.attributes) {
      element.setAttribute(attr.name, attr.value);
    }
    append(element);
    if (VOID_TAGS.has(parsed.name) || selfClosing) {
      index = tagEnd + 1;
      continue;
    }
    if (RAW_TEXT_TAGS.has(parsed.name)) {
      const closeTag = `</${parsed.name}>`;
      const rawEnd = source.toLowerCase().indexOf(closeTag, tagEnd + 1);
      const rawText = source.slice(tagEnd + 1, rawEnd < 0 ? length : rawEnd);
      element.appendChild(
        documentRef?.createTextNode(rawText) ?? new Text(rawText)
      );
      index = rawEnd < 0 ? length : rawEnd + closeTag.length;
      continue;
    }
    stack.push(element);
    current = element;
    index = tagEnd + 1;
  }
}

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title']);

function findTagEnd(source: string, openIndex: number): number {
  let inQuote: string | null = null;
  for (let index = openIndex + 1; index < source.length; index += 1) {
    const char = source[index];
    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inQuote = char;
      continue;
    }
    if (char === '>') {
      return index;
    }
  }
  return -1;
}

function parseTag(
  source: string
): { name: string; attributes: Array<{ name: string; value: string }> } | null {
  const match = source.match(/^([a-zA-Z][a-zA-Z0-9-]*)\s*(.*)$/);
  if (!match) {
    return null;
  }
  const name = match[1].toLowerCase();
  const attributes: Array<{ name: string; value: string }> = [];
  const attributeSource = match[2];
  const pattern =
    /([a-zA-Z_:][a-zA-Z0-9_:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let attributeMatch: RegExpExecArray | null;
  while ((attributeMatch = pattern.exec(attributeSource)) !== null) {
    const attrName = attributeMatch[1];
    const value =
      attributeMatch[2] ?? attributeMatch[3] ?? attributeMatch[4] ?? '';
    attributes.push({ name: attrName, value: decodeEntities(value) });
  }
  return { name, attributes };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, '\u00a0');
}

function encodeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function encodeAttribute(value: string): string {
  return encodeText(value).replace(/"/g, '&quot;');
}

function serializeNode(node: Node): string {
  switch (node.nodeType) {
    case DomNodeType.TEXT_NODE:
      return encodeText((node as Text).data);
    case DomNodeType.COMMENT_NODE:
      return `<!--${(node as Comment).data}-->`;
    case DomNodeType.ELEMENT_NODE:
      return serializeElement(node as Element);
    default:
      return '';
  }
}

function serializeElement(element: Element): string {
  const tag = element.localName;
  const attributes: string[] = [];
  for (const entry of element.attributeEntries()) {
    if (entry.name === 'style') {
      continue;
    }
    attributes.push(`${entry.name}="${encodeAttribute(entry.value)}"`);
  }
  const inlineStyle = element.inlineStyleText();
  if (inlineStyle) {
    attributes.push(`style="${encodeAttribute(inlineStyle)}"`);
  }
  const attributeText = attributes.length > 0 ? ` ${attributes.join(' ')}` : '';
  if (VOID_TAGS.has(tag)) {
    return `<${tag}${attributeText}>`;
  }
  if (RAW_TEXT_TAGS.has(tag)) {
    return `<${tag}${attributeText}>${element.textContent}</${tag}>`;
  }
  return `<${tag}${attributeText}>${serializeChildren(element)}</${tag}>`;
}

function serializeChildren(element: Element): string {
  return element.childList.map((child) => serializeNode(child)).join('');
}

/**
 * CSS 选择器引擎：支持 tag、#id、.class、[attr]、[attr=value]、复合与后代选择器。
 */
function parseSelector(selector: string): SimpleSelector[][] {
  return selector.split(',').map((group) => {
    const segments: SimpleSelector[] = [];
    let index = 0;
    while (index < group.length) {
      while (index < group.length && group[index] === ' ') {
        index += 1;
      }
      if (index >= group.length) {
        break;
      }
      if (group[index] === '>') {
        segments.push({ type: 'child' });
        index += 1;
        continue;
      }
      const start = index;
      while (
        index < group.length &&
        group[index] !== ' ' &&
        group[index] !== '>'
      ) {
        index += 1;
      }
      segments.push(parseCompound(group.slice(start, index)));
    }
    return segments;
  });
}

type SimpleSelector =
  | { type: 'universal' }
  | { type: 'tag'; name: string }
  | { type: 'id'; id: string }
  | { type: 'class'; className: string }
  | { type: 'attribute'; name: string; operator?: string; value?: string }
  | { type: 'compound'; parts: SimpleSelector[] }
  | { type: 'not'; selector: SimpleSelector }
  | { type: 'child' };

function parseCompound(source: string): SimpleSelector {
  const selectors: SimpleSelector[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === '*') {
      selectors.push({ type: 'universal' });
      index += 1;
    } else if (char === '#') {
      const end = scanIdentifier(source, index + 1);
      selectors.push({ type: 'id', id: source.slice(index + 1, end) });
      index = end;
    } else if (char === '.') {
      const end = scanIdentifier(source, index + 1);
      selectors.push({
        type: 'class',
        className: source.slice(index + 1, end),
      });
      index = end;
    } else if (char === '[') {
      const end = source.indexOf(']', index);
      const inner = source
        .slice(index + 1, end < 0 ? source.length : end)
        .trim();
      const attrMatch = inner.match(
        /^([a-zA-Z_:][a-zA-Z0-9_:.-]*)(?:([~|^$*]?=)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?$/
      );
      if (attrMatch) {
        selectors.push({
          type: 'attribute',
          name: attrMatch[1],
          operator: attrMatch[2],
          value: attrMatch[3] ?? attrMatch[4] ?? attrMatch[5],
        });
      } else {
        selectors.push({ type: 'attribute', name: inner });
      }
      index = end < 0 ? source.length : end + 1;
    } else if (char === ':' && source.startsWith(':not(', index)) {
      const close = source.indexOf(')', index);
      const inner = source.slice(index + 5, close < 0 ? source.length : close);
      selectors.push({ type: 'not', selector: parseCompound(inner.trim()) });
      index = close < 0 ? source.length : close + 1;
    } else if (char === ':' && source.startsWith(':disabled', index)) {
      selectors.push({ type: 'attribute', name: 'disabled' });
      index += ':disabled'.length;
    } else if (/[a-zA-Z_]/.test(char)) {
      const end = scanIdentifier(source, index);
      selectors.push({
        type: 'tag',
        name: source.slice(index, end).toLowerCase(),
      });
      index = end;
    } else {
      index += 1;
    }
  }
  if (selectors.length === 1) {
    return selectors[0];
  }
  return { type: 'compound', parts: selectors };
}

function scanIdentifier(source: string, start: number): number {
  let index = start;
  // ':' 是伪类（:not）起始，不属于标识符
  while (index < source.length && /[a-zA-Z0-9_-]/.test(source[index])) {
    index += 1;
  }
  return index;
}

function matchSelector(element: Element, selector: string): boolean {
  const groups = parseSelector(selector);
  return groups.some((group) => matchGroup(element, group));
}

function matchGroup(element: Element, group: SimpleSelector[]): boolean {
  let index = group.length - 1;
  if (index < 0) {
    return true;
  }

  // The rightmost compound must match the queried element itself.
  if (!matchSegment(element, group[index])) {
    return false;
  }
  if (index === 0) {
    return true;
  }

  // Remaining compounds must match ancestors, right to left.
  let current: Element | null = element.parentElement;
  index -= 1;
  while (current) {
    const selector = group[index];
    if (!selector) {
      return true;
    }
    if (selector.type === 'child') {
      // The previously matched element must be the immediate child of this parent.
      const parentSelector = group[index - 1];
      if (!parentSelector || !matchSegment(current, parentSelector)) {
        return false;
      }
      index -= 2;
      if (index < 0) {
        return true;
      }
      current = current.parentElement;
      continue;
    }
    if (matchSegment(current, selector)) {
      index -= 1;
      if (index < 0) {
        return true;
      }
    }
    current = current.parentElement;
  }
  return false;
}

function matchSegment(element: Element, selector: SimpleSelector): boolean {
  switch (selector.type) {
    case 'universal':
      return true;
    case 'tag':
      return element.localName === selector.name;
    case 'id':
      return element.id === selector.id;
    case 'class':
      return element.classList.contains(selector.className);
    case 'attribute':
      return matchAttribute(element, selector);
    case 'compound':
      return selector.parts.every((part) => matchSegment(element, part));
    case 'not':
      return !matchSegment(element, selector.selector);
    case 'child':
      return false;
    default:
      return false;
  }
}

function matchAttribute(
  element: Element,
  selector: { name: string; operator?: string; value?: string }
): boolean {
  const attributeValue = element.getAttribute(selector.name);
  if (!selector.operator) {
    return attributeValue !== null;
  }
  if (attributeValue === null) {
    return false;
  }
  const expected = selector.value ?? '';
  switch (selector.operator) {
    case '=':
      return attributeValue === expected;
    case '~=':
      return attributeValue.split(/\s+/).includes(expected);
    case '|=':
      return (
        attributeValue === expected || attributeValue.startsWith(`${expected}-`)
      );
    case '^=':
      return attributeValue.startsWith(expected);
    case '$=':
      return attributeValue.endsWith(expected);
    case '*=':
      return attributeValue.includes(expected);
    default:
      return false;
  }
}

function querySelectorAll(root: Node, selector: string): NodeList<Element> {
  const results: Element[] = [];
  collectElements(root, (element) => {
    if (element !== root && matchSelector(element, selector)) {
      results.push(element);
    }
  });
  return new NodeList(results);
}

function collectElements(root: Node, visit: (element: Element) => void): void {
  for (const child of root.childList) {
    if (child.nodeType === DomNodeType.ELEMENT_NODE) {
      visit(child as Element);
      collectElements(child, visit);
    }
  }
}

function createElementForTag(
  tagName: string,
  documentRef: Document | null
): HTMLElement {
  const tag = tagName.toLowerCase();
  let element: HTMLElement;
  if (tag === 'input') {
    element = new HTMLInputElement(tag);
  } else if (tag === 'textarea') {
    element = new HTMLTextAreaElement(tag);
  } else if (tag === 'select') {
    element = new HTMLSelectElement(tag);
  } else if (tag === 'option') {
    element = new HTMLOptionElement(tag);
  } else if (tag === 'button') {
    element = new HTMLButtonElement(tag);
  } else if (tag === 'style') {
    element = new HTMLStyleElement(tag);
  } else if (tag === 'a') {
    element = new HTMLAnchorElement(tag);
  } else if (tag === 'img') {
    element = new HTMLImageElement(tag);
  } else if (tag === 'label') {
    element = new HTMLLabelElement(tag);
  } else if (tag === 'td' || tag === 'th') {
    element = new HTMLTableCellElement(tag);
  } else {
    element = new HTMLElement(tag);
  }
  element.ownerDocument = documentRef;
  return element;
}

function setupDocumentTree(documentRef: Document): void {
  const html = documentRef.createElement('html');
  documentRef.appendChild(html);
  const head = documentRef.createElement('head');
  const body = documentRef.createElement('body');
  html.appendChild(head);
  html.appendChild(body);
}

function createDatasetProxy(element: Element): Record<string, string> {
  const handler: ProxyHandler<Record<string, string>> = {
    get(_target, property: string) {
      if (typeof property === 'symbol') {
        return undefined;
      }
      return (
        element.getAttribute(`data-${toKebabCase(property)}`) ?? undefined
      );
    },
    set(_target, property: string, value: string): boolean {
      if (typeof property === 'symbol') {
        return true;
      }
      if (value === null || value === undefined) {
        element.removeAttribute(`data-${toKebabCase(property)}`);
      } else {
        element.setAttribute(`data-${toKebabCase(property)}`, String(value));
      }
      return true;
    },
    deleteProperty(_target, property: string): boolean {
      if (typeof property !== 'symbol') {
        element.removeAttribute(`data-${toKebabCase(property)}`);
      }
      return true;
    },
    has(_target, property: string): boolean {
      if (typeof property === 'symbol') {
        return false;
      }
      return element.hasAttribute(`data-${toKebabCase(property)}`);
    },
    ownKeys() {
      const keys: string[] = [];
      for (const entry of element.attributeEntries()) {
        if (entry.name.startsWith('data-')) {
          keys.push(toCamelCase(entry.name.slice(5)));
        }
      }
      return keys;
    },
    getOwnPropertyDescriptor(_target, property: string) {
      if (typeof property === 'symbol') {
        return undefined;
      }
      if (element.hasAttribute(`data-${toKebabCase(property)}`)) {
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: element.getAttribute(`data-${toKebabCase(property)}`),
        };
      }
      return undefined;
    },
  };
  return new Proxy({}, handler);
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function toCamelCase(value: string): string {
  return value.replace(/-([a-z])/g, (_match, char: string) =>
    char.toUpperCase()
  );
}
