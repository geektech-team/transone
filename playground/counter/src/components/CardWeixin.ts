import { MiniprogramWeixin, h, slot, type VNode } from 'transone';
import { CardComponent } from './Card';

@MiniprogramWeixin()
export class CardWeixinComponent extends CardComponent {
  protected render(): VNode {
    return h('view', { className: 'card-host' }, [
      h('text', { className: 'card-title' }, [this.props.title]),
      h('text', {}, ['Weixin Card']),
      h('view', { className: 'card-body' }, [slot('default')]),
    ]);
  }
}
