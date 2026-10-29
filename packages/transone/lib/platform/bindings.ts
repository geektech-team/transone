import type {
  Component,
  ComponentConstructor,
  ComponentReference,
  ComponentProps,
  ComponentState,
} from '../core/component/base';

interface BindingLayer {
  implementation: Function;
}

// Deliberately module-local: each generated application/SSR bundle owns its bindings.
const bindings = new Map<Function, BindingLayer[]>();

export function bindComponentImplementations(
  pairs: readonly (readonly [Function, Function])[]
): () => void {
  const installed = pairs.map(([reference, implementation]) => {
    const layer = { implementation };
    const layers = bindings.get(reference) ?? [];
    layers.push(layer);
    bindings.set(reference, layers);
    return { reference, layer };
  });
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const { reference, layer } of installed) {
      const layers = bindings.get(reference);
      if (!layers) continue;
      const index = layers.indexOf(layer);
      if (index !== -1) layers.splice(index, 1);
      if (layers.length === 0) bindings.delete(reference);
    }
  };
}

export function createComponentInstance<
  P extends ComponentProps = ComponentProps,
  S extends ComponentState = ComponentState,
>(reference: ComponentReference<P, S>, props?: P): Component<P, S> {
  // Exact identity only; never follow inheritance or rebind an explicit implementation.
  const layers = bindings.get(reference);
  const implementation = (layers?.[layers.length - 1]?.implementation ??
    reference) as ComponentConstructor<P, S>;
  return new implementation(props);
}
