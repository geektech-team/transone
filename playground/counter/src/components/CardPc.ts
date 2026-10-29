import { WebPc, h, type VNode } from 'transone';
import { CardWebComponent } from './CardWeb';

@WebPc()
export class CardPcComponent extends CardWebComponent {
  protected render(): VNode {
    return h('section', { style: { maxWidth: '960px' } }, [
      h('p', {}, ['PC Web Card']),
      super.render(),
    ]);
  }
}
