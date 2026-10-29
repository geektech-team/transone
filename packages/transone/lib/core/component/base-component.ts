import { Component } from './base';
import type { ComponentProps, ComponentState } from './base';

/** Shared business component contract, with rendering supplied by target implementations. */
export abstract class BaseComponent<
  P extends ComponentProps = ComponentProps,
  S extends ComponentState = ComponentState,
> extends Component<P, S> {}
