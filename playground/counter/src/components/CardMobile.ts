import { WebMobile, h, type VNode } from 'transone';
import { CardWebComponent } from './CardWeb';

@WebMobile()
export class CardMobileComponent extends CardWebComponent {
  protected render(): VNode {
    return h('section', { style: { width: '100%' } }, [
      h('p', {}, ['Mobile Web Card']),
      super.render(),
    ]);
  }
}
