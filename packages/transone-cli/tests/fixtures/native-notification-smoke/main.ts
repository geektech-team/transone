import {
  BaseComponent,
  createApp,
  createComponent,
  Emit,
  h,
  WatchProps,
} from 'transone';

type ValueProps = { value: number };

class Leaf extends BaseComponent<ValueProps> {
  protected initState() {
    return {};
  }
  protected initStyles() {}

  @Emit('trace')
  log(message: string): string {
    return message;
  }

  @Emit('change')
  change(value: number): number {
    return value;
  }

  @WatchProps('value', { immediate: true })
  first(next: number, previous: number | undefined): void {
    this.log('leaf:' + String(next) + '/' + String(previous) + ';');
    if (next === 2) {
      this.setProps({ value: 3 });
      this.change(3);
    }
  }

  @WatchProps('value')
  second(next: number, previous: number | undefined): void {
    this.log('leaf2:' + String(next) + '/' + String(previous) + ';');
    if (next === 5) throw new Error('watch failed');
  }

  protected render() {
    return h('text', {}, [String(this.props.value)]);
  }
}

class Branch extends BaseComponent<ValueProps> {
  protected initState() {
    return {};
  }
  protected initStyles() {}

  @Emit('trace')
  log(message: unknown): string {
    return String(message);
  }

  @Emit('change')
  change(input: unknown): number {
    const value = Number(input);
    this.setProps({ value });
    return value;
  }

  @WatchProps('value', { immediate: true })
  watch(next: number, previous: number | undefined): void {
    this.log('branch:' + String(next) + '/' + String(previous) + ';');
  }

  protected render() {
    return createComponent({
      component: Leaf,
      props: { value: this.props.value },
      emitters: { trace: this.log, change: this.change },
    });
  }
}

class Sibling extends BaseComponent<ValueProps & { name: string }> {
  protected initState() {
    return {};
  }
  protected initStyles() {}

  @Emit('trace')
  log(message: string): string {
    return message;
  }

  @WatchProps('value', { immediate: true })
  watch(next: number, previous: number | undefined): void {
    this.log(
      this.props.name + ':' + String(next) + '/' + String(previous) + ';'
    );
  }

  protected render() {
    return h('text', {}, [String(this.props.value)]);
  }
}

class App extends BaseComponent<
  Record<string, never>,
  { value: number; trace: string }
> {
  protected initState() {
    return { value: 1, trace: '' };
  }
  protected initStyles() {}

  record(message: unknown): void {
    this.state.trace += String(message);
  }
  receive(value: unknown): void {
    this.setState({ value: Number(value) });
  }
  batch(): void {
    this.setState({ value: 2 });
  }
  fail(): void {
    this.setState({ value: 5 });
  }
  recover(): void {
    this.setState({ value: 6 });
  }
  stale(): void {
    this.record('stale;');
  }

  protected render() {
    return h('view', {}, [
      h('text', {}, [this.state.trace]),
      h('button', {}, ['Batch and reentry'], { click: this.batch }),
      h('button', {}, ['Fail watch'], { click: this.fail }),
      h('button', {}, ['Recover'], { click: this.recover }),
      h('button', {}, ['Record action'], { click: this.stale }),
      createComponent({
        component: Branch,
        props: { value: this.state.value },
        emitters: { trace: this.record, change: this.receive },
      }),
      createComponent({
        component: Sibling,
        props: { name: 'a', value: this.state.value },
        emitters: { trace: this.record },
      }),
      createComponent({
        component: Sibling,
        props: { name: 'b', value: this.state.value },
        emitters: { trace: this.record },
      }),
    ]);
  }
}

createApp({ root: App }).mount();
