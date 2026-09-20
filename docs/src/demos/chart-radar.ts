import { createComponent, type VNode } from 'transone';
import { TcChart, type RadarChartOption } from 'transone-chart';
import { DemoHost } from './DemoHost';

/**
 * 雷达图 live demo：六维指标、双系列对比（indicators.max 归一化）。
 */
export class DemoChartRadar extends DemoHost<{ option: RadarChartOption }> {
  protected initState(): { option: RadarChartOption } {
    return {
      option: {
        type: 'radar',
        title: { text: '城市宜居度评分' },
        legend: { position: 'top' },
        indicators: [
          { name: '经济', max: 100 },
          { name: '教育', max: 100 },
          { name: '医疗', max: 100 },
          { name: '交通', max: 100 },
          { name: '环境', max: 100 },
          { name: '安全', max: 100 },
        ],
        series: [
          { name: '北京', data: [92, 90, 88, 85, 70, 82] },
          { name: '杭州', data: [82, 86, 80, 88, 90, 91] },
        ],
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
          'indicators 定义指标轴，max 缺省时取各系列该指标最大值；series[].area 默认 true 填充多边形区域；splitCount 控制同心网格层数。',
        ],
      },
    ];
  }
}
