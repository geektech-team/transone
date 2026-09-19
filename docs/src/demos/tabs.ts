import { createComponent, type VNode } from 'transone';
import { TuTabs } from 'transone-ui';
import { DemoHost } from './DemoHost';

const ITEMS = [
  { title: '标签一' },
  { title: '标签二' },
  { title: '标签三' },
  { title: '禁用项', disabled: true },
];

interface DemoTabsState {
  active: number;
}

/** TuTabs 可交互实例：点击切换激活项，change 回传索引（禁用项不可点）。 */
export class DemoTabs extends DemoHost<DemoTabsState> {
  protected initState(): DemoTabsState {
    return { active: 0 };
  }

  protected renderDemo(): VNode {
    return createComponent({
      component: TuTabs,
      props: { items: ITEMS, active: this.state.active },
      emitters: {
        change: (index: number) => this.setState({ active: index }),
      },
    }) as unknown as VNode;
  }

  protected renderNote(): VNode[] {
    return [
      {
        tag: 'p',
        props: { className: 'tu-demo__note' },
        children: [
          `当前激活：${ITEMS[this.state.active].title} —— 点击标签触发 change 回传索引，disabled 项不响应。`,
        ],
      },
    ];
  }
}
