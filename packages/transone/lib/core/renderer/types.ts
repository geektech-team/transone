import type { TemplateEngine } from '../template';
import type { ComponentEventListener, ComponentProps } from '../component';
import type { InjectionKey, InjectionResult } from '../component';
import type { VNode } from '../vnode';

export interface ComponentInstance {
  mountToNode(): Node;
  update(): void;
  unmount(): void;
  setProps(props: Partial<ComponentProps>): void;
  setAppContext?(context: unknown): void;
  setParentComponent?(parent: ComponentInstance | null): void;
  getParentComponent?(): ComponentInstance | null;
  setElementChangeListener?(
    listener: (previousElement: Node, nextElement: Node) => void
  ): void;
  resolveInjection?<T>(key: InjectionKey<T>): InjectionResult<T>;
  getElement(): Node | null;
  on(eventName: string, listener: ComponentEventListener): () => void;
}

export type Renderable = VNode | string;

export interface RendererHost {
  mount(vnode: Renderable, context: RenderRuntimeContext): Node;
  patch(
    oldVNode: Renderable,
    newVNode: Renderable,
    currentNode: Node,
    context: RenderRuntimeContext
  ): Node;
  unmount(
    vnode: Renderable,
    currentNode: Node,
    context: RenderRuntimeContext
  ): void;
}

export interface RenderRuntimeContext {
  templateEngine: TemplateEngine;
  appContext?: unknown;
  renderer: RendererHost;
  slots: Record<string, Array<VNode | string>>;
  registerChild(component: ComponentInstance): void;
  unregisterChild(component: ComponentInstance): void;
}

export interface RenderStrategy<T extends Renderable = Renderable> {
  matches(vnode: Renderable): vnode is T;
  mount(vnode: T, context: RenderRuntimeContext): Node;
  patch(
    oldVNode: T,
    newVNode: T,
    currentNode: Node,
    context: RenderRuntimeContext
  ): Node;
  unmount(vnode: T, currentNode: Node, context: RenderRuntimeContext): void;
}
