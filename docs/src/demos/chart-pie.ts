import { createComponent, type VNode } from 'transone';
import { TcChart, type PieChartOption } from 'transone-chart';
import { DemoHost } from './DemoHost';

/**
 * 饼图 live demo：环形图（innerRadius > 0）+ 右侧图例 + 百分比标签。
 */
export class DemoChartPie extends DemoHost<{ option: PieChartOption }> {
  protected initState(): { option: PieChartOption } {
    return {
      option: {
        type: 'pie',
        title: { text: '访问来源占比' },
        legend: { position: 'right' },
        data: [
          { name: '小程序', value: 45 },
          { name: 'Web', value: 30 },
          { name: '分享', value: 15 },
          { name: '搜索', value: 10 },
        ],
        innerRadius: '38%',
        labelPosition: 'outside', // 标签引线到扇区外，避免小扇区文字被遮挡
        labelLineLength: 18,
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
          'innerRadius 大于 0 时为环形图；labelPosition: outside 用引线把标签放到扇区外（右半区左对齐、左半区右对齐），小扇区文字不再被遮挡。',
        ],
      },
    ];
  }
}
