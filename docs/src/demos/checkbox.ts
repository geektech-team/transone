import { createComponent, type VNode } from 'transone';
import { TuCheckbox } from 'transone-ui';
import { DemoHost } from './DemoHost';

interface DemoCheckboxState {
  checked: boolean;
}

/** TuCheckbox 可交互实例：选中态受控，change 回传布尔值。 */
export class DemoCheckbox extends DemoHost<DemoCheckboxState> {
  protected initState(): DemoCheckboxState {
    return { checked: true };
  }

  protected renderDemo(): VNode {
    return createComponent({
      component: TuCheckbox,
      props: { checked: this.state.checked, label: '同意用户协议' },
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
          `当前${this.state.checked ? '已勾选' : '未勾选'} —— 完全受控：点击触发 change，父级维护 checked。`,
        ],
      },
    ];
  }
}
