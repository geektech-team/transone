import { createComponent, type VNode } from 'transone';
import { TcChart, type ScatterChartOption } from 'transone-chart';
import { DemoHost } from './DemoHost';

/** 散点图 live demo：双数值轴与按点大小区分的城市样本。 */
export class DemoChartScatter extends DemoHost<{ option: ScatterChartOption }> {
  protected initState(): { option: ScatterChartOption } {
    return {
      option: {
        type: 'scatter',
        title: { text: '生活成本与宜居度' },
        legend: { position: 'top' },
        xAxis: { min: 0, max: 100, splitCount: 5 },
        yAxis: { min: 0, max: 100, splitCount: 5 },
        series: [
          {
            name: '一线城市',
            symbolSize: 12,
            data: [
              { name: '北京', value: [90, 82], symbolSize: 18 },
              { name: '上海', value: [92, 86], symbolSize: 16 },
              { name: '深圳', value: [85, 84] },
            ],
          },
          {
            name: '区域中心',
            symbolSize: 12,
            data: [
              { name: '杭州', value: [72, 91], symbolSize: 16 },
              { name: '成都', value: [55, 88], color: '#13c2c2' },
              [60, 80],
            ],
          },
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
          '每个点为 [x, y] 或 { value: [x, y], name?, symbolSize?, color? }；点的 symbolSize 优先于系列配置，单位为 px 直径。图例按系列展示。',
        ],
      },
    ];
  }
}
