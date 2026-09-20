import { createComponent, type VNode } from 'transone';
import { TuInput } from 'transone-ui';
import { DemoHost } from './DemoHost';

interface DemoInputState {
  value: string;
}

/** TuInput 可交互实例：输入框受控，input 事件实时回传并统计长度。 */
export class DemoInput extends DemoHost<DemoInputState> {
  protected initState(): DemoInputState {
    return { value: 'TransOne' };
  }

  protected renderDemo(): VNode {
    return createComponent({
      component: TuInput,
      props: { value: this.state.value, placeholder: '请输入…', clearable: true },
      emitters: {
        input: (...args: unknown[]) => this.setState({ value: args[0] as string }),
      },
    }) as unknown as VNode;
  }

  protected renderNote(): VNode[] {
    return [
      {
        tag: 'p',
        props: { className: 'tu-demo__note' },
        children: [
          `当前值「${this.state.value}」· ${this.state.value.length} 字符 —— 输入触发 input 事件回传，value 由父级维护。`,
        ],
      },
    ];
  }
}
