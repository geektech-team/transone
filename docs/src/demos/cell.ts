import { createComponent, type VNode } from 'transone';
import { TuCell } from 'transone-ui';
import { DemoHost } from './DemoHost';

interface DemoCellState {
  clicks: number;
}

/** TuCell 可交互实例：点击 cell 触发 click 事件并计数。 */
export class DemoCell extends DemoHost<DemoCellState> {
  protected initState(): DemoCellState {
    return { clicks: 0 };
  }

  protected renderDemo(): VNode {
    return {
      tag: 'div',
      children: [
        createComponent({
          component: TuCell,
          props: {
            title: '点击整行',
            label: 'cell 支持 isLink 箭头与 required 必填标记',
            value: `已点 ${this.state.clicks} 次`,
            isLink: true,
          },
          emitters: {
            click: () => this.setState({ clicks: this.state.clicks + 1 }),
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
          '整行可点：click 事件回传父级计数 —— disabled 时不响应。',
        ],
      },
    ];
  }
}
