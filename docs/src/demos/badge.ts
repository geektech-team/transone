import { createComponent, type VNode } from 'transone';
import { TuBadge, TuButton } from 'transone-ui';
import { DemoHost } from './DemoHost';

interface DemoBadgeState {
  count: number;
}

/** TuBadge 可交互实例：按钮 +1 驱动徽标计数，超过 max 显示 max+。 */
export class DemoBadge extends DemoHost<DemoBadgeState> {
  protected initState(): DemoBadgeState {
    return { count: 8 };
  }

  protected renderDemo(): VNode {
    const s = this.state;
    return {
      tag: 'div',
      children: [
        createComponent({
          component: TuBadge,
          props: { content: s.count, max: 99 },
          children: ['消息'],
        }) as unknown as VNode,
        createComponent({
          component: TuButton,
          props: { size: 'small' },
          children: ['+1'],
          emitters: {
            click: () => this.setState({ count: Math.min(120, s.count + 1) }),
          },
        }) as unknown as VNode,
        createComponent({
          component: TuButton,
          props: { size: 'small', plain: true, type: 'danger' },
          children: ['清零'],
          emitters: { click: () => this.setState({ count: 0 }) },
        }) as unknown as VNode,
      ],
    };
  }

  protected renderNote(): VNode[] {
    const s = this.state;
    const shown = s.count > 99 ? '99+' : String(s.count);
    return [
      {
        tag: 'p',
        props: { className: 'tu-demo__note' },
        children: [
          `当前徽标显示 ${shown}（实际计数 ${s.count}）—— content 超过 max 时自动显示 max+。`,
        ],
      },
    ];
  }
}
