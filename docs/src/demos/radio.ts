import { createComponent, type VNode } from 'transone';
import { TuRadio } from 'transone-ui';
import { DemoHost } from './DemoHost';

interface DemoRadioState {
  checked: boolean;
}

/** TuRadio 可交互实例：选中态受控，change 回传布尔值。 */
export class DemoRadio extends DemoHost<DemoRadioState> {
  protected initState(): DemoRadioState {
    return { checked: false };
  }

  protected renderDemo(): VNode {
    return createComponent({
      component: TuRadio,
      props: { checked: this.state.checked, label: '选择此项' },
      emitters: {
        change: (...args: unknown[]) => this.setState({ checked: args[0] as boolean }),
      },
    }) as unknown as VNode;
  }

  protected renderNote(): VNode[] {
    return [
      {
        tag: 'p',
        props: { className: 'tu-demo__note' },
        children: [
          `当前${this.state.checked ? '已选中' : '未选中'} —— 单选框同样完全受控。`,
        ],
      },
    ];
  }
}
