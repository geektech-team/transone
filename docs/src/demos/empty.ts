import { createComponent, type VNode } from 'transone';
import { TuButton, TuEmpty } from 'transone-ui';
import { DemoHost } from './DemoHost';

interface DemoEmptyState {
  refreshed: number;
}

/** TuEmpty 可交互实例：空状态展示 + 插槽操作区（按钮点击计数）。 */
export class DemoEmpty extends DemoHost<DemoEmptyState> {
  protected initState(): DemoEmptyState {
    return { refreshed: 0 };
  }

  protected renderDemo(): VNode {
    return createComponent({
      component: TuEmpty,
      props: { text: '暂无数据', description: '下拉刷新或点击按钮重试' },
      children: [
        createComponent({
          component: TuButton,
          props: { size: 'small', plain: true },
          children: ['刷新'],
          emitters: {
            click: () => this.setState({ refreshed: this.state.refreshed + 1 }),
          },
        }) as unknown as VNode,
      ],
    }) as unknown as VNode;
  }

  protected renderNote(): VNode[] {
    return [
      {
        tag: 'p',
        props: { className: 'tu-demo__note' },
        children: [
          `已刷新 ${this.state.refreshed} 次 —— 底部操作区是插槽（children），可放任意组件。`,
        ],
      },
    ];
  }
}
