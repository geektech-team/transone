import { Web, h, slot, type VNode } from 'transone';
import { CardComponent } from './Card';

@Web()
export class CardWebComponent extends CardComponent {
  protected render(): VNode {
    return h('div', { className: 'card-host' }, [
      h('h3', { className: 'card-title' }, [this.props.title]),
      h('p', {}, ['Web Card']),
      h('div', { className: 'card-body' }, [slot('default')]),
    ]);
  }
}
