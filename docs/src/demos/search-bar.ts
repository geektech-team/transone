import { createComponent, type VNode } from 'transone';
import { TuSearchBar } from 'transone-ui';
import { DemoHost } from './DemoHost';

interface DemoSearchBarState {
  value: string;
  keyword: string;
}

/** TuSearchBar 可交互实例：输入回传 value，回车触发 search 显示搜索词。 */
export class DemoSearchBar extends DemoHost<DemoSearchBarState> {
  protected initState(): DemoSearchBarState {
    return { value: '', keyword: '尚未搜索' };
  }

  protected renderDemo(): VNode {
    return createComponent({
      component: TuSearchBar,
      props: {
        value: this.state.value,
        placeholder: '搜索城市 / 关键词',
        showCancel: true,
        confirmType: 'search',
      },
      emitters: {
        input: (...args: unknown[]) => this.setState({ value: args[0] as string }),
        search: (...args: unknown[]) => this.setState({ keyword: args[0] as string }),
      },
    }) as unknown as VNode;
  }

  protected renderNote(): VNode[] {
    return [
      {
        tag: 'p',
        props: { className: 'tu-demo__note' },
        children: [
          `最近搜索：${this.state.keyword} —— 输入实时回传 input，回车触发 search（小程序 confirm-type=search）。`,
        ],
      },
    ];
  }
}
