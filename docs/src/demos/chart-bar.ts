import { createComponent, type VNode } from 'transone';
import { TcChart, type BarChartOption } from 'transone-chart';
import { DemoHost } from './DemoHost';

/**
 * 柱状图 live demo：分类堆叠柱（stack + borderRadius）+ 横向柱状图（horizontal）。
 * 两个 TcChart 实例并排（小屏自动换行）。
 */
export class DemoChartBar extends DemoHost<{
  stacked: BarChartOption;
  horizontal: BarChartOption;
}> {
  protected initState(): { stacked: BarChartOption; horizontal: BarChartOption } {
    return {
      stacked: {
        type: 'bar',
        title: { text: '城市综合指数（分类堆叠）' },
        legend: { position: 'top' },
        xAxis: { labels: ['北京', '上海', '深圳', '杭州', '成都'] },
        series: [
          { name: '经济活力', data: [40, 38, 36, 30, 26], stack: 'total', borderRadius: 2 },
          { name: '生活便利', data: [30, 32, 28, 29, 30], stack: 'total' },
          { name: '生态环境', data: [22, 21, 20, 26, 28], stack: 'total', borderRadius: 2 },
        ],
      },
      horizontal: {
        type: 'bar',
        title: { text: '城市排名 TOP5（横向）' },
        xAxis: { labels: ['成都', '杭州', '深圳', '上海', '北京'] },
        series: [{ name: '指数', data: [84, 85, 86, 91, 92], borderRadius: 3 }],
        horizontal: true,
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
      props: { className: 'tc-demo-grid' },
      children: [
        {
          tag: 'div',
          props: { className: 'tc-demo-box' },
          children: [
            createComponent({
              component: TcChart,
              props: { option: this.state.stacked },
            }) as unknown as VNode,
          ],
        },
        {
          tag: 'div',
          props: { className: 'tc-demo-box' },
          children: [
            createComponent({
              component: TcChart,
              props: { option: this.state.horizontal },
            }) as unknown as VNode,
          ],
        },
      ],
    };
  }

  protected renderNote(): VNode[] {
    return [
      {
        tag: 'p',
        props: { className: 'tu-demo__note' },
        children: [
          'series[].stack 同名系列纵向堆叠；series[].borderRadius 柱体圆角；horizontal: true 切换横向柱状图（类目轴转纵向）。',
        ],
      },
    ];
  }
}
