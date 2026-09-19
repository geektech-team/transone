import { createComponent, type VNode } from 'transone';
import { TuButton } from 'transone-ui';
import { DemoHost } from './DemoHost';

type ButtonType = 'default' | 'primary' | 'success' | 'warning' | 'danger';
const TYPES: ButtonType[] = ['default', 'primary', 'success', 'warning', 'danger'];

interface DemoButtonState {
  type: ButtonType;
  clicks: number;
}

/**
 * TuButton 可交互实例：点击按钮依次切换 default → primary → success →
 * warning → danger，click 事件经 emitters 回传宿主并计数。
 */
export class DemoButton extends DemoHost<DemoButtonState> {
  protected initState(): DemoButtonState {
    return { type: 'primary', clicks: 0 };
  }

  protected renderDemo(): VNode {
    return createComponent({
      component: TuButton,
      props: { type: this.state.type },
      children: ['点击切换类型'],
      emitters: {
        click: () => {
          const s = this.state;
          this.setState({
            clicks: s.clicks + 1,
            type: TYPES[(TYPES.indexOf(s.type) + 1) % TYPES.length],
          });
        },
      },
    }) as unknown as VNode;
  }

  protected renderNote(): VNode[] {
    const s = this.state;
    return [
      {
        tag: 'p',
        props: { className: 'tu-demo__note' },
        children: [
          `已点击 ${s.clicks} 次 · 当前类型 ${s.type} · 点击按钮会依次切换 default → primary → success → warning → danger，click 事件由父级（demo 宿主）维护状态。`,
        ],
      },
    ];
  }
}
