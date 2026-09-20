import { createComponent, type VNode } from 'transone';
import { TcChart, type LineChartOption } from 'transone-chart';
import { DemoHost } from './DemoHost';

/**
 * 折线图 live demo：双系列对比，smooth 平滑曲线 + area 面积填充。
 * Web 端为便于演示直接引用模块级 option；小程序端请将 option
 * 放入 initState() 返回对象（静态常量会被折叠成字符串属性，见跨端集成页）。
 */
export class DemoChartLine extends DemoHost<{ option: LineChartOption }> {
  protected initState(): { option: LineChartOption } {
    return {
      option: {
        type: 'line',
        title: { text: '城市指数趋势' },
        legend: { position: 'top' },
        xAxis: { labels: ['4月', '5月', '6月', '7月', '8月', '9月'] },
        series: [
          { name: '北京', data: [82, 85, 84, 88, 90, 92], smooth: true },
          {
            name: '上海',
            data: [80, 83, 86, 85, 89, 91],
            smooth: true,
            area: true,
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
          'series[].smooth 开启平滑曲线（三次贝塞尔插值）；series[].area 开启面积填充（globalAlpha 0.15）。',
        ],
      },
    ];
  }
}
