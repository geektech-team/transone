import { createComponent, type VNode } from 'transone';
import { TcChart, type GaugeChartOption } from 'transone-chart';
import { DemoHost } from './DemoHost';

/** 仪表盘 live demo：用进度弧、指针与刻度展示目标完成率。 */
export class DemoChartGauge extends DemoHost<{ option: GaugeChartOption }> {
  protected initState(): { option: GaugeChartOption } {
    return {
      option: {
        type: 'gauge',
        title: { text: '目标完成率' },
        name: '完成率',
        value: 82,
        min: 0,
        max: 100,
        splitCount: 5,
        lineWidth: 12,
        progressColor: '#00b578',
        trackColor: '#ebedf0',
        pointerColor: '#323233',
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
          'min / max 定义量程；value 超出量程时，仅进度弧与指针位置钳制到边界，数值文本和 tooltip 保留原值。',
        ],
      },
    ];
  }
}
