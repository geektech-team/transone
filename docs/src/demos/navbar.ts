import { createComponent, type VNode } from 'transone';
import { TuNavbar } from 'transone-ui';
import { DemoHost } from './DemoHost';

interface DemoNavbarState {
  leftClicks: number;
  rightClicks: number;
}

/** TuNavbar 可交互实例：左侧返回箭头与右侧按钮点击分别回传事件。 */
export class DemoNavbar extends DemoHost<DemoNavbarState> {
  protected initState(): DemoNavbarState {
    return { leftClicks: 0, rightClicks: 0 };
  }

  protected renderDemo(): VNode {
    return createComponent({
      component: TuNavbar,
      props: { title: '导航栏', leftText: '返回', rightText: '更多' },
      emitters: {
        clickLeft: () =>
          this.setState({ leftClicks: this.state.leftClicks + 1 }),
        clickRight: () =>
          this.setState({ rightClicks: this.state.rightClicks + 1 }),
      },
    }) as unknown as VNode;
  }

  protected renderNote(): VNode[] {
    const s = this.state;
    return [
      {
        tag: 'p',
        props: { className: 'tu-demo__note' },
        children: [
          `左侧点击 ${s.leftClicks} 次 · 右侧点击 ${s.rightClicks} 次 —— clickLeft / clickRight 事件回传父级。`,
        ],
      },
    ];
  }
}
