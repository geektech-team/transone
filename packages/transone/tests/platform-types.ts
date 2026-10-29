import {
  BaseComponent,
  createApp,
  createComponent,
  createComponentInstance,
  h,
  type ComponentConstructor,
  type ComponentReference,
  type RouteRecord,
} from '../lib';

abstract class LogicalCard extends BaseComponent<
  { title: string },
  { count: number }
> {
  protected initState() {
    return { count: 0 };
  }
  protected initStyles() {}
}

// Compiled by the package typecheck; this function is intentionally never executed.
export function checkAbstractComponentReferences() {
  const reference: ComponentReference<{ title: string }, { count: number }> =
    LogicalCard;
  // @ts-expect-error Abstract logical components cannot be used as concrete constructors.
  const concrete: ComponentConstructor<{ title: string }, { count: number }> =
    LogicalCard;
  void concrete;
  createComponent({ component: reference, props: { title: 'ok' } });
  createComponent(reference, { title: 'ok' });
  createApp({ root: reference, rootProps: { title: 'ok' } });
  createComponentInstance(reference, { title: 'ok' });
  const route: RouteRecord = { path: '/card', component: reference };
  void route;
  // @ts-expect-error Logical references must preserve required props in descriptor form.
  createComponent({ component: reference, props: { title: 1 } });
  // @ts-expect-error Logical references must preserve required props in positional form.
  createComponent(reference, { missing: 'title' });
  // @ts-expect-error Root props are checked against the abstract logical component.
  createApp({ root: reference, rootProps: { title: 1 } });
  // @ts-expect-error Direct instance creation preserves logical component props.
  createComponentInstance(reference, { title: 1 });
  // @ts-expect-error BaseComponent remains abstract.
  new BaseComponent();

  class Concrete extends LogicalCard {
    protected render() {
      return h('p');
    }
  }
  const concreteReference: ComponentConstructor<
    { title: string },
    { count: number }
  > = Concrete;
  createComponent(concreteReference, { title: 'ok' });
}
