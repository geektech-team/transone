/**
 * transone-chart 图表演示页（城市指数场景数据）。
 * 四张图表全部使用 TcChart 声明式组件，同一份源码可编译 Web 与小程序。
 */

import { Component, createComponent, each, h, type VNode } from 'transone';
import {
  TcChart,
  type BarChartOption,
  type ChartOption,
  type LineChartOption,
  type PieChartOption,
  type RadarChartOption,
} from 'transone-chart';

const lineOption: LineChartOption = {
  type: 'line',
  title: { text: '城市指数趋势' },
  legend: { position: 'top' },
  xAxis: { labels: ['4月', '5月', '6月', '7月', '8月', '9月'] },
  series: [
    { name: '北京', data: [82, 85, 84, 88, 90, 92], smooth: true },
    { name: '上海', data: [80, 83, 86, 85, 89, 91], smooth: true, area: true },
  ],
};

const barOption: BarChartOption = {
  type: 'bar',
  title: { text: '城市综合指数（分类堆叠）' },
  legend: { position: 'top' },
  xAxis: { labels: ['北京', '上海', '深圳', '杭州', '成都'] },
  series: [
    { name: '经济活力', data: [40, 38, 36, 30, 26], stack: 'total', borderRadius: 2 },
    { name: '生活便利', data: [30, 32, 28, 29, 30], stack: 'total' },
    { name: '生态环境', data: [22, 21, 20, 26, 28], stack: 'total', borderRadius: 2 },
  ],
};

const barHorizontalOption: BarChartOption = {
  type: 'bar',
  title: { text: '城市排名 TOP5（横向）' },
  xAxis: { labels: ['成都', '杭州', '深圳', '上海', '北京'] },
  series: [{ name: '指数', data: [84, 85, 86, 91, 92], borderRadius: 3 }],
  horizontal: true,
};

const pieOption: PieChartOption = {
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
};

const radarOption: RadarChartOption = {
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
};

interface ChartDemoState {
  /** 图表 option 列表（小程序端经 state 序列化进 data，走数据绑定传给 TcChart）。 */
  charts: ChartOption[];
}

export class ChartDemoPage extends Component<Record<string, never>, ChartDemoState> {
  protected initState(): ChartDemoState {
    return {
      charts: [lineOption, barOption, barHorizontalOption, pieOption, radarOption],
    };
  }

  protected initStyles(): void {
    this.styleManager.addStyle('chart-demo-page', {
      selector: '.chart-demo',
      properties: {
        boxSizing: 'border-box',
        margin: '0 auto',
        maxWidth: '760px',
        padding: '16px',
      },
    });
    this.styleManager.addStyle('chart-demo-header', {
      selector: '.chart-demo__header',
      properties: {
        fontSize: '20px',
        fontWeight: 600,
        margin: '8px 0 16px',
      },
    });
    this.styleManager.addStyle('chart-demo-card', {
      selector: '.chart-demo__card',
      properties: {
        background: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 1px 4px rgba(15, 23, 42, 0.06)',
        marginBottom: '16px',
        padding: '16px',
      },
    });
    this.styleManager.addStyle('chart-demo-cards', {
      selector: '.chart-demo__cards',
      properties: {
        display: 'block',
      },
    });
    this.styleManager.addStyle('chart-demo-canvas', {
      selector: '.chart-demo__canvas',
      properties: {
        height: '260px',
        width: '100%',
      },
    });
    this.styleManager.addStyle('chart-demo-note', {
      selector: '.chart-demo__note',
      properties: {
        color: '#64748b',
        fontSize: '12px',
        margin: '8px 0 0',
      },
    });
  }

  protected render(): VNode {
    return h('div', { className: 'chart-demo' }, [
      h('h1', { className: 'chart-demo__header' }, ['transone-chart 图表库']),
      h(
        'div',
        { className: 'chart-demo__cards' },
        each(this.state.charts, (option) =>
          h('div', { className: 'chart-demo__card' }, [
            h('div', { className: 'chart-demo__canvas' }, [
              createComponent({
                component: TcChart,
                props: { option: option },
              }),
            ]),
          ])
        )
      ),
      h('p', { className: 'chart-demo__note' }, [
        '同一份 TypeScript 源码，Web 与小程序（微信 / 阿里 / 字节）Canvas 2D 渲染；未来原生 App 实现 ICanvas2D 契约即可接入。',
      ]),
    ]);
  }
}
