import type { ComponentEventListener, ComponentProps } from './component/base';
import {
  ComponentNode,
  SlotProvider,
  VNode,
  isComponentNode,
  isSlotProvider,
  toChildren,
} from './vnode';
import { ElementRenderStrategy } from './renderer/element-strategy';
export { ElementRenderStrategy } from './renderer/element-strategy';
export type {
  ComponentInstance,
  RenderRuntimeContext,
  RenderStrategy,
  Renderable,
  RendererHost,
} from './renderer/types';
import type {
  ComponentInstance,
  RenderRuntimeContext,
  RenderStrategy,
  Renderable,
} from './renderer/types';

export class RendererContext {
  private readonly strategies: RenderStrategy[];

  constructor() {
    this.strategies = [
      new TextRenderStrategy(),
      new ComponentRenderStrategy(),
      new SlotRenderStrategy(),
      new ElementRenderStrategy(),
    ];
  }

  public mount(vnode: Renderable, context: RenderRuntimeContext): Node {
    return this.findStrategy(vnode).mount(vnode as never, context);
  }

  public patch(
    oldVNode: Renderable,
    newVNode: Renderable,
    currentNode: Node,
    context: RenderRuntimeContext
  ): Node {
    const oldStrategy = this.findStrategy(oldVNode);
    const newStrategy = this.findStrategy(newVNode);

    if (oldStrategy !== newStrategy) {
      const nextNode = newStrategy.mount(newVNode as never, context);
      currentNode.parentNode?.replaceChild(nextNode, currentNode);
      oldStrategy.unmount(oldVNode as never, currentNode, context);
      return nextNode;
    }

    return oldStrategy.patch(
      oldVNode as never,
      newVNode as never,
      currentNode,
      context
    );
  }

  public unmount(
    vnode: Renderable,
    currentNode: Node,
    context: RenderRuntimeContext
  ): void {
    this.findStrategy(vnode).unmount(vnode as never, currentNode, context);
  }

  private findStrategy(vnode: Renderable): RenderStrategy {
    const strategy = this.strategies.find((item) => item.matches(vnode));
    if (!strategy) {
      throw new Error('No render strategy found for vnode');
    }
    return strategy;
  }
}

export class TextRenderStrategy implements RenderStrategy<string> {
  public matches(vnode: Renderable): vnode is string {
    return typeof vnode === 'string';
  }

  public mount(vnode: string, context: RenderRuntimeContext): Node {
    return context.templateEngine.parseTemplate(vnode);
  }

  public patch(
    oldVNode: string,
    newVNode: string,
    currentNode: Node,
    context: RenderRuntimeContext
  ): Node {
    if (oldVNode === newVNode) {
      return currentNode;
    }

    const nextNode = this.mount(newVNode, context);
    currentNode.parentNode?.replaceChild(nextNode, currentNode);
    return nextNode;
  }

  public unmount(): void {}
}

export class ComponentRenderStrategy implements RenderStrategy<ComponentNode> {
  private readonly instances = new WeakMap<Node, ComponentInstance>();
  private readonly instanceNodes = new Map<ComponentInstance, Set<Node>>();
  private readonly emitterUnsubscribers = new WeakMap<
    ComponentInstance,
    Map<string, { listener: ComponentEventListener; unsubscribe: () => void }>
  >();

  public matches(vnode: Renderable): vnode is ComponentNode {
    return (
      typeof vnode === 'object' && vnode !== null && isComponentNode(vnode)
    );
  }

  public mount(vnode: ComponentNode, context: RenderRuntimeContext): Node {
    if (vnode.directions?.if === false) {
      return document.createComment('if');
    }

    const ComponentClass = vnode.component as new (
      props?: ComponentProps
    ) => ComponentInstance;
    const instance = new ComponentClass(this.createProps(vnode));

    if (context.appContext && instance.setAppContext) {
      instance.setAppContext(context.appContext);
    }

    this.syncEmitters(instance, vnode.emitters ?? {});

    context.registerChild(instance);

    const node = instance.mountToNode();
    this.trackInstanceNode(instance, node);
    instance.setElementChangeListener?.((previousNode, nextNode) => {
      this.trackInstanceNode(instance, previousNode);
      this.trackInstanceNode(instance, nextNode);
    });
    return node;
  }

  public patch(
    oldVNode: ComponentNode,
    newVNode: ComponentNode,
    currentNode: Node,
    context: RenderRuntimeContext
  ): Node {
    if (currentNode.nodeType === Node.COMMENT_NODE) {
      const nextNode = this.mount(newVNode, context);
      currentNode.parentNode?.replaceChild(nextNode, currentNode);
      return nextNode;
    }

    if (newVNode.directions?.if === false) {
      const nextNode = document.createComment('if');
      currentNode.parentNode?.replaceChild(nextNode, currentNode);
      this.unmount(oldVNode, currentNode, context);
      return nextNode;
    }

    const instance = this.instances.get(currentNode);

    if (instance && oldVNode.component === newVNode.component) {
      this.syncEmitters(instance, newVNode.emitters ?? {});
      instance.setProps(this.createProps(newVNode));
      const nextNode = instance.getElement() ?? currentNode;
      this.trackInstanceNode(instance, nextNode);
      return nextNode;
    }

    const nextNode = this.mount(newVNode, context);
    currentNode.parentNode?.replaceChild(nextNode, currentNode);
    this.unmount(oldVNode, currentNode, context);
    return nextNode;
  }

  public unmount(
    _vnode: ComponentNode,
    currentNode: Node,
    context: RenderRuntimeContext
  ): void {
    const instance = this.instances.get(currentNode);
    if (instance) {
      this.clearEmitters(instance);
      instance.unmount();
      this.clearInstanceNodes(instance);
      context.unregisterChild(instance);
    }
  }

  private createProps(vnode: ComponentNode): ComponentProps {
    return {
      ...(vnode.props ?? {}),
      children: toChildren(vnode.children),
    };
  }

  private syncEmitters(
    instance: ComponentInstance,
    emitters: NonNullable<ComponentNode['emitters']>
  ): void {
    const current = this.emitterUnsubscribers.get(instance) ?? new Map();

    current.forEach(({ listener: currentListener, unsubscribe }, eventName) => {
      const listener = emitters[eventName];
      if (!listener || listener !== currentListener) {
        unsubscribe();
        current.delete(eventName);
      }
    });

    Object.entries(emitters).forEach(([eventName, listener]) => {
      if (current.get(eventName)?.listener === listener) {
        return;
      }

      current.set(eventName, {
        listener,
        unsubscribe: instance.on(eventName, listener),
      });
    });

    this.emitterUnsubscribers.set(instance, current);
  }

  private clearEmitters(instance: ComponentInstance): void {
    this.emitterUnsubscribers.get(instance)?.forEach(({ unsubscribe }) => {
      unsubscribe();
    });
    this.emitterUnsubscribers.delete(instance);
  }

  private trackInstanceNode(instance: ComponentInstance, node: Node): void {
    this.instances.set(node, instance);
    const nodes = this.instanceNodes.get(instance) ?? new Set<Node>();
    nodes.add(node);
    this.instanceNodes.set(instance, nodes);
  }

  private clearInstanceNodes(instance: ComponentInstance): void {
    this.instanceNodes.get(instance)?.forEach((node) => {
      this.instances.delete(node);
    });
    this.instanceNodes.delete(instance);
  }
}

export class SlotRenderStrategy implements RenderStrategy<SlotProvider> {
  private readonly renderedChildren = new WeakMap<
    HTMLElement,
    Array<VNode | string>
  >();

  public matches(vnode: Renderable): vnode is SlotProvider {
    return typeof vnode === 'object' && vnode !== null && isSlotProvider(vnode);
  }

  public mount(vnode: SlotProvider, context: RenderRuntimeContext): Node {
    if (vnode.directions?.if === false) {
      return document.createComment('if');
    }

    const slotContainer = document.createElement('div');
    slotContainer.setAttribute('data-slot', vnode.props.name);
    this.mountSlotChildren(
      slotContainer,
      this.resolveChildren(vnode, context),
      context
    );
    return slotContainer;
  }

  public patch(
    oldVNode: SlotProvider,
    newVNode: SlotProvider,
    currentNode: Node,
    context: RenderRuntimeContext
  ): Node {
    if (currentNode.nodeType === Node.COMMENT_NODE) {
      const nextNode = this.mount(newVNode, context);
      currentNode.parentNode?.replaceChild(nextNode, currentNode);
      return nextNode;
    }

    if (newVNode.directions?.if === false) {
      const nextNode = document.createComment('if');
      currentNode.parentNode?.replaceChild(nextNode, currentNode);
      this.unmount(oldVNode, currentNode, context);
      return nextNode;
    }

    if (currentNode instanceof HTMLElement) {
      currentNode.setAttribute('data-slot', newVNode.props.name);
      this.replaceSlotChildren(currentNode, oldVNode, newVNode, context);
    }
    return currentNode;
  }

  public unmount(
    _vnode: SlotProvider,
    currentNode: Node,
    context: RenderRuntimeContext
  ): void {
    if (!(currentNode instanceof HTMLElement)) {
      return;
    }

    this.unmountSlotChildren(currentNode, context);
    this.renderedChildren.delete(currentNode);
  }

  private resolveChildren(
    vnode: SlotProvider,
    context: RenderRuntimeContext
  ): Array<VNode | string> {
    return context.slots[vnode.props.name] ?? toChildren(vnode.children);
  }

  private replaceSlotChildren(
    element: HTMLElement,
    _oldVNode: SlotProvider,
    newVNode: SlotProvider,
    context: RenderRuntimeContext
  ): void {
    const oldChildren = this.renderedChildren.get(element) ?? [];
    const newChildren = this.resolveChildren(newVNode, context);
    const sharedLength = Math.min(oldChildren.length, newChildren.length);

    // 复用已有节点逐个 patch，避免 slot 内容整体重建导致
    // 组件实例与 DOM 元素（含焦点）丢失。
    for (let index = 0; index < sharedLength; index += 1) {
      const childNode = element.childNodes[index];
      if (!childNode) {
        element.appendChild(
          context.renderer.mount(newChildren[index], context)
        );
        continue;
      }
      context.renderer.patch(
        oldChildren[index],
        newChildren[index],
        childNode,
        context
      );
    }

    for (let index = sharedLength; index < newChildren.length; index += 1) {
      element.appendChild(context.renderer.mount(newChildren[index], context));
    }

    for (
      let index = oldChildren.length - 1;
      index >= newChildren.length;
      index -= 1
    ) {
      const childNode = element.childNodes[index];
      if (childNode) {
        context.renderer.unmount(oldChildren[index], childNode, context);
        if (childNode.parentNode === element) {
          element.removeChild(childNode);
        }
      }
    }

    this.renderedChildren.set(element, newChildren);
  }

  private mountSlotChildren(
    element: HTMLElement,
    children: Array<VNode | string>,
    context: RenderRuntimeContext
  ): void {
    children.forEach((child) => {
      element.appendChild(context.renderer.mount(child, context));
    });
    this.renderedChildren.set(element, children);
  }

  private unmountSlotChildren(
    element: HTMLElement,
    context: RenderRuntimeContext
  ): void {
    const children = this.renderedChildren.get(element) ?? [];
    children.forEach((child, index) => {
      const childNode = element.childNodes[index];
      if (childNode) {
        context.renderer.unmount(child, childNode, context);
      }
    });
  }
}
