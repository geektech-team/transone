import { createComponent, type VNode } from 'transone';
import { TuButton, TuModal } from 'transone-ui';
import { DemoHost } from './DemoHost';

interface DemoModalState {
  visible: boolean;
  result: string;
}

/** TuModal 可交互实例：打开确认弹窗，confirm / cancel 事件回传并计数。 */
export class DemoModal extends DemoHost<DemoModalState> {
  protected initState(): DemoModalState {
    return { visible: false, result: '尚未操作' };
  }

  protected renderDemo(): VNode {
    const s = this.state;
    return {
      tag: 'div',
      children: [
        createComponent({
          component: TuButton,
          props: { size: 'small' },
          children: ['打开弹窗'],
          emitters: { click: () => this.setState({ visible: true }) },
        }) as unknown as VNode,
        createComponent({
          component: TuModal,
          props: {
            visible: s.visible,
            title: '确认删除',
            content: '删除后不可恢复，确定要继续吗？',
          },
          emitters: {
            confirm: () => this.setState({ visible: false, result: '已确认' }),
            cancel: () => this.setState({ visible: false, result: '已取消' }),
            close: () => this.setState({ visible: false }),
          },
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
          `上次操作：${this.state.result} —— 弹窗完全受控：confirm / cancel / close 三个事件回传父级。`,
        ],
      },
    ];
  }
}
