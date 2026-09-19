import { createComponent, type VNode } from 'transone';
import { TuButton, TuProgress } from 'transone-ui';
import { DemoHost } from './DemoHost';

interface DemoProgressState {
  percent: number;
}

/** TuProgress 可交互实例：按钮驱动进度递增（跨组件受控联动）。 */
export class DemoProgress extends DemoHost<DemoProgressState> {
  protected initState(): DemoProgressState {
    return { percent: 30 };
  }

  protected renderDemo(): VNode {
    const s = this.state;
    return {
      tag: 'div',
      children: [
        createComponent({
          component: TuProgress,
          props: { percent: s.percent },
        }) as unknown as VNode,
        createComponent({
          component: TuButton,
          props: { size: 'small' },
          children: ['进度 +10%'],
          emitters: {
            click: () => {
              this.setState({ percent: Math.min(100, s.percent + 10) });
            },
          },
        }) as unknown as VNode,
        createComponent({
          component: TuButton,
          props: { size: 'small', plain: true, type: 'danger' },
          children: ['归零'],
          emitters: {
            click: () => this.setState({ percent: 0 }),
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
          `当前进度 ${this.state.percent}% —— 进度由父级维护，点击按钮更新 percent。`,
        ],
      },
    ];
  }
}
