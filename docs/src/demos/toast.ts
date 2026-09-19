import { createComponent, type VNode } from 'transone';
import { TuButton, TuToast } from 'transone-ui';
import { DemoHost } from './DemoHost';

interface DemoToastState {
  visible: boolean;
  content: string;
  position: 'top' | 'center' | 'bottom';
}

/** TuToast 可交互实例：三个位置触发轻提示，父级计时自动隐藏。 */
export class DemoToast extends DemoHost<DemoToastState> {
  protected initState(): DemoToastState {
    return { visible: false, content: '', position: 'center' };
  }

  private show(position: 'top' | 'center' | 'bottom'): void {
    const labels: Record<string, string> = {
      top: '顶部提示',
      center: '居中提示',
      bottom: '底部提示',
    };
    this.setState({ visible: true, content: labels[position], position });
    setTimeout(() => {
      if (this.mounted) {
        this.setState({ visible: false });
      }
    }, 1600);
  }

  protected renderDemo(): VNode {
    const s = this.state;
    return {
      tag: 'div',
      children: [
        createComponent({
          component: TuButton,
          props: { size: 'small' },
          children: ['顶部'],
          emitters: { click: () => this.show('top') },
        }) as unknown as VNode,
        createComponent({
          component: TuButton,
          props: { size: 'small', plain: true },
          children: ['居中'],
          emitters: { click: () => this.show('center') },
        }) as unknown as VNode,
        createComponent({
          component: TuButton,
          props: { size: 'small', plain: true },
          children: ['底部'],
          emitters: { click: () => this.show('bottom') },
        }) as unknown as VNode,
        createComponent({
          component: TuToast,
          props: { visible: s.visible, content: s.content, position: s.position },
        }) as unknown as VNode,
      ],
    };
  }

  protected renderNote(): VNode[] {
    return [
      {
        tag: 'p',
        props: { className: 'tu-demo__note' },
        children: [
          '点击按钮触发对应位置的轻提示，父级定时 1.6s 后自动隐藏 —— visible 完全受控。',
        ],
      },
    ];
  }
}
