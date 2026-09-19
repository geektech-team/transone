import { createComponent, type VNode } from 'transone';
import { TuButton, TuPopup } from 'transone-ui';
import { DemoHost } from './DemoHost';

type PopupPosition = 'top' | 'right' | 'bottom' | 'left';

interface DemoPopupState {
  visible: boolean;
  position: PopupPosition;
}

/** TuPopup 可交互实例：从底面 / 侧面弹出，点击遮罩或按钮关闭。 */
export class DemoPopup extends DemoHost<DemoPopupState> {
  protected initState(): DemoPopupState {
    return { visible: false, position: 'bottom' };
  }

  private open(position: PopupPosition): void {
    this.setState({ visible: true, position });
  }

  protected renderDemo(): VNode {
    const s = this.state;
    return {
      tag: 'div',
      children: [
        createComponent({
          component: TuButton,
          props: { size: 'small' },
          children: ['底面弹出'],
          emitters: { click: () => this.open('bottom') },
        }) as unknown as VNode,
        createComponent({
          component: TuButton,
          props: { size: 'small', plain: true },
          children: ['右侧弹出'],
          emitters: { click: () => this.open('right') },
        }) as unknown as VNode,
        createComponent({
          component: TuPopup,
          props: { visible: s.visible, position: s.position },
          children: ['我是弹出面板：点遮罩或面板内按钮关闭'],
          emitters: { close: () => this.setState({ visible: false }) },
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
          `当前方向 ${this.state.position}${this.state.visible ? '（弹出中，点遮罩关闭）' : '（已关闭）'} —— visible 受控，close 事件回传父级。`,
        ],
      },
    ];
  }
}
