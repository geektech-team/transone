import { createComponent, type VNode } from 'transone';
import { TuSwitch } from 'transone-ui';
import { DemoHost } from './DemoHost';

interface DemoSwitchState {
  checked: boolean;
}

/** TuSwitch 可交互实例：点击开关，change 事件回传新值并切换选中态。 */
export class DemoSwitch extends DemoHost<DemoSwitchState> {
  protected initState(): DemoSwitchState {
    return { checked: true };
  }

  protected renderDemo(): VNode {
    return createComponent({
      component: TuSwitch,
      props: { checked: this.state.checked },
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
        children: [`当前${this.state.checked ? '已开启' : '已关闭'} —— 完全受控：点击触发 change 事件，由父级维护 checked。`],
      },
    ];
  }
}
