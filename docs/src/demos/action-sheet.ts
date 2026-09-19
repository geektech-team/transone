import { createComponent, type VNode } from 'transone';
import { TuActionSheet, TuButton } from 'transone-ui';
import { DemoHost } from './DemoHost';

const ACTIONS = [
  { name: '复制链接' },
  { name: '分享给好友' },
  { name: '投诉', color: '#ff3141' },
];

interface DemoActionSheetState {
  visible: boolean;
  selected: string;
}

/** TuActionSheet 可交互实例：打开动作面板，select 回传所选项索引。 */
export class DemoActionSheet extends DemoHost<DemoActionSheetState> {
  protected initState(): DemoActionSheetState {
    return { visible: false, selected: '尚未选择' };
  }

  protected renderDemo(): VNode {
    const s = this.state;
    return {
      tag: 'div',
      children: [
        createComponent({
          component: TuButton,
          props: { size: 'small' },
          children: ['打开动作面板'],
          emitters: { click: () => this.setState({ visible: true }) },
        }) as unknown as VNode,
        createComponent({
          component: TuActionSheet,
          props: { visible: s.visible, actions: ACTIONS },
          emitters: {
            select: (index: number) =>
              this.setState({ visible: false, selected: ACTIONS[index].name }),
            cancel: () => this.setState({ visible: false }),
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
          `上次选择：${this.state.selected} —— select 回传动作索引（dataIndex 取数，双端一致），cancel 回传关闭。`,
        ],
      },
    ];
  }
}
