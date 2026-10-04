import { createComponent, type VNode } from 'transone';
import { TcChart, type FunnelChartOption } from 'transone-chart';
import { DemoHost } from './DemoHost';

/** 漏斗图 live demo：按业务阶段顺序展示访问到付费的转化。 */
export class DemoChartFunnel extends DemoHost<{ option: FunnelChartOption }> {
  protected initState(): { option: FunnelChartOption } {
    return {
      option: {
        type: 'funnel',
        title: { text: '访问到付费的转化' },
        legend: { show: false },
        data: [
          { name: '访问', value: 1000 },
          { name: '点击', value: 650 },
          { name: '注册', value: 320 },
          { name: '付费', value: 160 },
        ],
        gap: 6,
        minWidth: 40,
      },
    };
  }

  protected initStyles(): void {
    super.initStyles();
    this.styleManager.addStyle('tc-demo-box', {
      selector: '.tc-demo-box',
      properties: {
        boxSizing: 'border-box',
        height: '260px',
        width: '100%',
      },
    });
  }

  protected renderDemo(): VNode {
    return {
      tag: 'div',
      props: { className: 'tc-demo-box' },
      children: [
        createComponent({
          component: TcChart,
          props: { option: this.state.option },
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
          'sort 默认 none，保留 data 中的业务阶段顺序；gap 控制阶段间距，minWidth 为最小宽度（px）。',
        ],
      },
    ];
  }
}
