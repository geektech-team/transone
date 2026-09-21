import {
  apiTable,
  callout,
  codeBlock,
  demo,
  featureGrid,
  heading,
  hero,
  inlineCode,
  link,
  linkGrid,
  ol,
  paragraph,
  strong,
  table,
  ul,
  type DocPage,
} from './types';

const GITHUB_URL = 'https://github.com/geektech-team/transone';

// ---- 图表示例源码（demo 的"查看源代码"折叠区内容）----

const LINE_SOURCE = `import { Component, createComponent } from 'transone';
import { TcChart } from 'transone-chart';

const option = {
  type: 'line',
  title: { text: '城市指数趋势' },
  legend: { position: 'top' },
  xAxis: { labels: ['4月', '5月', '6月', '7月', '8月', '9月'] },
  series: [
    { name: '北京', data: [82, 85, 84, 88, 90, 92], smooth: true },
    { name: '上海', data: [80, 83, 86, 85, 89, 91], smooth: true, area: true },
  ],
};

class MyPage extends Component {
  render() {
    // option 受控传入，数据变化自动 setOption + render
    return createComponent({ component: TcChart, props: { option } });
  }
}`;

const BAR_SOURCE = `import { Component, createComponent } from 'transone';
import { TcChart } from 'transone-chart';

// 堆叠柱：series[].stack 同名系列纵向堆叠
const stacked = {
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

// 横向柱状图：horizontal: true（类目轴转纵向）
const horizontal = {
  type: 'bar',
  title: { text: '城市排名 TOP5（横向）' },
  xAxis: { labels: ['成都', '杭州', '深圳', '上海', '北京'] },
  series: [{ name: '指数', data: [84, 85, 86, 91, 92], borderRadius: 3 }],
  horizontal: true,
};

class MyPage extends Component {
  render() {
    return createComponent({ component: TcChart, props: { option: stacked } });
  }
}`;

const PIE_SOURCE = `import { Component, createComponent } from 'transone';
import { TcChart } from 'transone-chart';

const option = {
  type: 'pie',
  title: { text: '访问来源占比' },
  legend: { position: 'right' },
  data: [
    { name: '小程序', value: 45 },
    { name: 'Web', value: 30 },
    { name: '分享', value: 15 },
    { name: '搜索', value: 10 },
  ],
  innerRadius: '38%', // 内半径 > 0 即环形图
  labelPosition: 'outside', // 引线把标签放到扇区外，小扇区文字不被遮挡
};

class MyPage extends Component {
  render() {
    return createComponent({ component: TcChart, props: { option } });
  }
}`;

const RADAR_SOURCE = `import { Component, createComponent } from 'transone';
import { TcChart } from 'transone-chart';

const option = {
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

class MyPage extends Component {
  render() {
    return createComponent({ component: TcChart, props: { option } });
  }
}`;

// ---- 落地页（父菜单 transone-chart，路径 /transone-chart）----

export const chartLandingPage: DocPage = {
  path: '/transone-chart',
  title: 'transone-chart 跨端图表库',
  description: 'Canvas 2D 跨端图表库：折线 / 柱状 / 饼图 / 雷达，Web 与微信 / 阿里 / 字节小程序共用一份源码，原生 App 契约就绪。',
  section: 'chart',
  order: -1,
  body: [
    hero(
      '跨端图表库 · Canvas 2D 渲染',
      '一份 TypeScript 源码，Web / 小程序 / 原生 App 共用',
      'transone-chart 以最小 Canvas 2D 契约（ICanvas2D）解耦平台：Web 直接用 HTMLCanvasElement，小程序走 Canvas 2D 节点，未来原生 App 实现契约即可接入。一期内置折线、柱状、饼图（环形）、雷达四种图表，零运行时依赖。',
      [
        { label: '快速开始', href: '/transone-chart/getting-started', primary: true },
        { label: '图表 API', href: '/transone-chart/charts' },
        { label: 'GitHub', href: GITHUB_URL },
      ]
    ),
    featureGrid([
      {
        title: '纯 Canvas 2D 绘制',
        description: '不依赖 ECharts / F2 / uCharts，自研绘制引擎，体积可控、行为透明。',
      },
      {
        title: 'ICanvas2D 契约解耦',
        description: '跨端唯一边界是约 20 个方法的 Canvas 子集契约，平台差异全部收敛在 adapters。',
      },
      {
        title: '四种一期图表',
        description: '折线（平滑 / 面积）、柱状（堆叠 / 横向 / 圆角）、饼图（环形 / 百分比标签）、雷达（多系列 / 归一化）。',
      },
      {
        title: 'OOP + 策略模式',
        description: 'core 纯引擎 → charts 图表策略 → adapters 平台差异 → factory 分发 → component 声明式组件。',
      },
      {
        title: 'TcChart 声明式组件',
        description: '与 transone 组件系统集成，option 受控传入，同一份源码编译 Web 与小程序。',
      },
      {
        title: '原生端契约占位',
        description: 'adapters/native.ts 预留 iOS / Android / 鸿蒙接入点，未实现时显式抛错、绝不静默降级。',
      },
    ]),
    heading(2, '子文档'),
    linkGrid([
      {
        title: '快速开始',
        description: '安装、TcChart 组件用法、引擎直用与 Demo 项目。',
        href: '/transone-chart/getting-started',
      },
      {
        title: '架构',
        description: '分层设计、ICanvas2D 契约、渲染管线与原生 App 扩展指南。',
        href: '/transone-chart/architecture',
      },
      {
        title: '图表总览',
        description: '四种图表组件入口与通用创建方式。',
        href: '/transone-chart/charts',
      },
      {
        title: '跨端集成',
        description: '各端支持状态、小程序端静态编译约束与原生接入路径。',
        href: '/transone-chart/cross-platform',
      },
    ]),
  ],
};

// ---- 快速开始 ----

export const chartGettingStartedPage: DocPage = {
  path: '/transone-chart/getting-started',
  title: '快速开始',
  description: '安装 transone-chart，用 TcChart 组件或引擎直用渲染第一张图表。',
  section: 'chart',
  order: 1,
  body: [
    heading(1, '快速开始'),
    heading(2, '安装'),
    paragraph(
      'transone-chart 是 monorepo 内的独立 workspace 包，peer 依赖',
      inlineCode('transone >= 0.3.0'),
      '（仅组件集成 TcChart 需要）：'
    ),
    codeBlock('bash', `bun add transone-chart`),
    heading(2, '方式一：TcChart 声明式组件（推荐）'),
    paragraph(
      '与 transone 组件系统集成：',
      inlineCode('option'),
      '由父级传入（完全受控），数据变化自动',
      inlineCode('setOption + render'),
      '，组件卸载自动销毁：'
    ),
    codeBlock(
      'typescript',
      `import { Component, createComponent } from 'transone';
import { TcChart } from 'transone-chart';

const option = {
  type: 'line',
  title: { text: '城市指数趋势' },
  xAxis: { labels: ['4月', '5月', '6月', '7月', '8月', '9月'] },
  series: [
    { name: '北京', data: [82, 85, 84, 88, 90, 92], smooth: true },
    { name: '上海', data: [80, 83, 86, 85, 89, 91], smooth: true, area: true },
  ],
};

class MyPage extends Component {
  render() {
    return createComponent({ component: TcChart, props: { option } });
  }
}`
    ),
    callout(
      'tip',
      [
        'canvas 由组件渲染（',
        inlineCode('<canvas type="2d">'),
        '），外层容器需给高度，如 260px。Web 端直接渲染，小程序端经 SelectorQuery 自动取节点。',
      ],
      '画布尺寸'
    ),
    callout(
      'tip',
      [
        '容器 / 窗口宽度变化时组件自动重绘（防抖 150ms）：Web 端 ResizeObserver 监听后增量',
        inlineCode('resize + render'),
        '，小程序端窗口尺寸回调触发后重建；图表始终铺满容器宽度，无需手动调用。',
      ],
      '自动重绘'
    ),
    heading(2, '示例：折线图（上面配置的实际渲染）'),
    demo('chart-line', LINE_SOURCE),
    heading(2, '方式二：引擎直用（无框架场景）'),
    paragraph('不依赖 transone 组件系统时，直接用工厂入口：'),
    codeBlock(
      'typescript',
      `import { createWebChart, createMiniProgramChart } from 'transone-chart';

// Web：HTMLCanvasElement
const chart = createWebChart(canvasElement, option);
chart.render();

// 小程序：Canvas 2D 节点
const chart2 = createMiniProgramChart(canvasNode, option);
chart2.render();

// 高级：自定义渲染上下文（如原生桥层实现 ICanvas2D 后）
import { createChart } from 'transone-chart';
const chart3 = createChart(context, option); // context 为 ChartRenderContext
chart3.render();`
    ),
    heading(2, 'Demo 项目'),
    paragraph(
      '仓库内',
      link('playground/chart-demo', 'https://github.com/geektech-team/transone/tree/main/playground/chart-demo'),
      '用城市指数场景数据演示五种图表（折线 / 堆叠柱 / 横向柱 / 环形饼 / 雷达），四端构建命令：'
    ),
    codeBlock(
      'bash',
      `bun run build:web          # H5
bun run build:weixin      # 微信小程序
bun run build:alipay      # 阿里小程序
bun run build:bytedance   # 字节小程序`
    ),
    heading(2, '下一步'),
    ul([
      [link('图表总览', '/transone-chart/charts'), '：四种图表组件入口。'],
      [link('架构', '/transone-chart/architecture'), '：ICanvas2D 契约与原生 App 扩展指南。'],
      [link('跨端集成', '/transone-chart/cross-platform'), '：小程序端约束与各端支持状态。'],
    ]),
  ],
};

// ---- 架构 ----

export const chartArchitecturePage: DocPage = {
  path: '/transone-chart/architecture',
  title: '架构',
  description: '分层设计、ICanvas2D 契约、渲染管线与原生 App 扩展指南。',
  section: 'chart',
  order: 2,
  body: [
    heading(1, '架构'),
    heading(2, '分层设计'),
    table(
      ['层', '职责', '位置'],
      [
        ['core', '纯引擎：ICanvas2D 契约、比例尺、布局、坐标轴、图例、ChartBase 渲染管线（零平台依赖）', 'lib/core/'],
        ['charts', '图表策略类：LineChart / BarChart / PieChart / RadarChart，只依赖 core', 'lib/charts/'],
        ['adapters', '平台差异：web / miniprogram（wx·my·tt）/ native（契约占位）', 'lib/adapters/'],
        ['factory', 'createChart 按 option.type 分发到图表策略', 'lib/factory.ts'],
        ['component', 'TcChart 声明式组件（可选，依赖 transone）', 'lib/component.ts'],
      ]
    ),
    paragraph(
      '上层只依赖下层的公开接口，平台差异被收敛在 adapters——新增一个端只需要实现一个适配器，图表层零改动。'
    ),
    heading(2, 'ICanvas2D 契约'),
    paragraph(
      '跨端解耦的唯一边界是',
      inlineCode('ICanvas2D'),
      '（',
      inlineCode('lib/core/canvas.ts'),
      '）：图表所需的最小 Canvas 2D 子集，约 20 个方法。刻意不含',
      inlineCode('Path2D'),
      '；',
      inlineCode('fill / stroke'),
      '无参调用；包含',
      inlineCode('measureText / createLinearGradient'),
      '。Web 标准 2D context 天然满足；小程序 Canvas 2D 节点经',
      inlineCode("node.getContext('2d')"),
      '适配；原生端按契约实现即可。',
    ),
    codeBlock(
      'typescript',
      `// 契约核心形状（精简示意）
interface ICanvas2D {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise?: boolean): void;
  fill(): void;
  stroke(): void;
  measureText(text: string): { width: number };
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): IGradient;
  // ... 见 lib/core/canvas.ts 完整定义
}`
    ),
    heading(2, '渲染管线'),
    paragraph('ChartBase 统一渲染顺序，各图表只实现 drawSeries：'),
    codeBlock(
      'text',
      `save → scale(dpr) → clear → 背景 → 布局(title/legend/轴区逐层扣除)
→ 标题 → 图例 → 坐标轴(仅笛卡尔类) → drawSeries → restore`
    ),
    ul([
      ['seriesColor 按索引取 DEFAULT_PALETTE 色板，显式 color 优先。'],
      ['数值轴自动 nice 刻度；类目轴无标签时不预留轴区。'],
      ['图例：series 带 name 且未显式配置时，默认 top 显示。'],
    ]),
    heading(2, '原生 App 扩展指南'),
    paragraph(
      strong('引擎与平台完全解耦'),
      '：原生端实现',
      inlineCode('ICanvas2D'),
      '（Skia / ArkUI Canvas / 原生桥），再通过',
      inlineCode('resolveNativeCanvas(host)'),
      '注入即可，图表层零改动。',
    ),
    codeBlock(
      'typescript',
      `import { createChart } from 'transone-chart';
import { resolveNativeCanvas } from 'transone-chart/adapters';

// 原生桥层：把原生画布上下文包装成 ICanvas2D，并实现 NativeCanvasHost
const host = {
  width: 375,
  height: 260,
  pixelRatio: 2,
  getContext(type: '2d') {
    return { beginPath() {}, moveTo() {}, /* ...实现 ICanvas2D */ };
  },
};
const chart = createChart(resolveNativeCanvas(host), option);
chart.render();`
    ),
    callout(
      'warn',
      [
        'adapters/native.ts 当前是契约占位：未实现时调用会显式抛错，',
        strong('绝不静默降级'),
        '，保证原生端不会出现"看起来渲染了其实空白"的隐性故障。',
      ],
      '快速失败'
    ),
  ],
};

// ---- 图表总览 + 四个图表组件页 ----

export const chartChartsPage: DocPage = {
  path: '/transone-chart/charts',
  title: '图表总览',
  description: '折线 / 柱状 / 饼图 / 雷达四种图表组件入口与通用创建方式。',
  section: 'chart',
  order: 3,
  body: [
    heading(1, '图表总览'),
    paragraph(
      'transone-chart 一期内置四种图表组件，均为',
      inlineCode('option.type'),
      '驱动的统一配置心智（',
      inlineCode('title / legend / xAxis / yAxis / series'),
      '），零依赖纯 Canvas 绘制。点击进入各组件文档（配置字段 + 示例 + 源代码）：'
    ),
    linkGrid([
      {
        title: '折线图',
        description: '多系列趋势、smooth 平滑曲线、area 面积填充、数据点标记。',
        href: '/transone-chart/line',
      },
      {
        title: '柱状图',
        description: '分类堆叠、横向柱状、圆角柱体与自动柱宽。',
        href: '/transone-chart/bar',
      },
      {
        title: '饼图',
        description: '环形图、百分比标签、top / right 等方位图例。',
        href: '/transone-chart/pie',
      },
      {
        title: '雷达图',
        description: '多系列对比、指标 max 归一化、面积填充与网格分层。',
        href: '/transone-chart/radar',
      },
    ]),
    heading(2, '创建图表'),
    paragraph(
      '统一入口',
      inlineCode('createChart(context, option)'),
      '按',
      inlineCode('option.type'),
      '分发到对应图表策略；',
      inlineCode('createWebChart / createMiniProgramChart'),
      '是两端便捷入口。完整字段以包内',
      inlineCode('lib/types.ts'),
      '（含中文注释）与 dist 类型定义为准。',
    ),
  ],
};

export const chartLinePage: DocPage = {
  path: '/transone-chart/line',
  title: '折线图',
  description: '折线图组件：多系列趋势、平滑曲线与面积填充。',
  section: 'chart',
  order: 4,
  body: [
    heading(1, '折线图'),
    paragraph(
      '多系列趋势对比：',
      inlineCode('smooth'),
      ' 平滑曲线（三次贝塞尔插值），',
      inlineCode('area'),
      ' 面积填充，',
      inlineCode('showSymbol'),
      ' 数据点标记。',
    ),
    apiTable('LineChartOption', [
      { name: 'type', type: "'line'", description: '图表类型。' },
      { name: 'xAxis.labels', type: 'readonly string[]', description: '类目轴标签。' },
      { name: 'series[].data', type: 'readonly number[]', description: '数据序列。' },
      { name: 'series[].smooth', type: 'boolean', description: '平滑曲线（三次贝塞尔插值），默认 false。' },
      { name: 'series[].area', type: 'boolean', description: '面积填充（globalAlpha 0.15），默认 false。' },
      { name: 'series[].showSymbol', type: 'boolean', description: '绘制数据点标记，默认 true。' },
      { name: 'startFromZero', type: 'boolean', description: '数据全为正时强制含 0，默认 false（紧凑显示）。' },
      { name: 'title / legend / yAxis', type: 'object', description: '标题、图例、数值轴配置。' },
    ]),
    demo('chart-line', LINE_SOURCE),
  ],
};

export const chartBarPage: DocPage = {
  path: '/transone-chart/bar',
  title: '柱状图',
  description: '柱状图组件：分类堆叠、横向柱状与圆角柱体。',
  section: 'chart',
  order: 5,
  body: [
    heading(1, '柱状图'),
    paragraph(
      inlineCode('stack'),
      ' 同名系列纵向堆叠，',
      inlineCode('horizontal'),
      ' 切换横向柱状图（类目轴转纵向），',
      inlineCode('borderRadius'),
      ' 柱体圆角。'
    ),
    apiTable('BarChartOption', [
      { name: 'series[].stack', type: 'string', description: '堆叠组名；同名系列纵向堆叠。' },
      { name: 'series[].barWidth', type: 'number', description: '柱宽（px），缺省按类目带自动计算。' },
      { name: 'series[].borderRadius', type: 'number', description: '柱体圆角，默认 0。' },
      { name: 'horizontal', type: 'boolean', description: '横向柱状图（类目轴转纵向），默认 false。' },
    ]),
    demo('chart-bar', BAR_SOURCE),
  ],
};

export const chartPiePage: DocPage = {
  path: '/transone-chart/pie',
  title: '饼图',
  description: '饼图 / 环形图组件：百分比标签与方位图例。',
  section: 'chart',
  order: 6,
  body: [
    heading(1, '饼图'),
    paragraph(
      inlineCode('innerRadius'),
      ' 大于 0 时为环形图，',
      inlineCode('labelPosition: "outside"'),
      ' 用引线把标签放到扇区外（右半区左对齐、左半区右对齐），小扇区文字不再被遮挡；',
      inlineCode('legend.position'),
      ' 可切换 top / bottom / right。'
    ),
    apiTable('PieChartOption', [
      { name: 'data', type: 'readonly PieDatum[]', description: '扇区数据：{ name, value, color? }。' },
      { name: 'radius', type: 'number | string', description: '外半径：px 或百分比（相对 min(w,h)/2），默认 60%。' },
      { name: 'innerRadius', type: 'number | string', description: '内半径：>0 为环形图，默认 0（饼图）。' },
      { name: 'labelPosition', type: "'inside' | 'outside'", description: "标签位置：inside 画在扇区内（默认，白字）；outside 画在扇区外并带引线（小扇区/长名称推荐）。" },
      { name: 'labelLineLength', type: 'number', description: '外部标签引线沿平分线长度（px），默认 14。' },
      { name: 'labelGap', type: 'number', description: '外部标签与引线端点的水平间距（px），默认 6。' },
      { name: 'labelLineColor', type: 'string', description: "外部标签引线颜色，默认 '#c0c4cc'。" },
      { name: 'showLabel', type: 'boolean', description: '是否显示扇区标签，默认 true。' },
      { name: 'startAngle', type: 'number', description: '起始角（弧度），默认 -π/2（12 点方向），顺时针。' },
    ]),
    demo('chart-pie', PIE_SOURCE),
  ],
};

export const chartRadarPage: DocPage = {
  path: '/transone-chart/radar',
  title: '雷达图',
  description: '雷达图组件：多系列对比与指标归一化。',
  section: 'chart',
  order: 7,
  body: [
    heading(1, '雷达图'),
    paragraph(
      inlineCode('indicators'),
      ' 定义指标轴，',
      inlineCode('max'),
      ' 缺省取各系列该指标最大值；',
      inlineCode('series[].area'),
      ' 默认填充多边形区域，',
      inlineCode('splitCount'),
      ' 控制同心网格层数。'
    ),
    apiTable('RadarChartOption', [
      { name: 'indicators', type: 'readonly RadarIndicator[]', description: '指标轴：{ name, max? }，max 缺省取各系列该指标最大值。' },
      { name: 'series[].data', type: 'readonly number[]', description: '每系列各指标值，按 indicator.max 归一化。' },
      { name: 'series[].area', type: 'boolean', description: '填充多边形区域，默认 true。' },
      { name: 'splitCount', type: 'number', description: '同心网格层数，默认 5。' },
      { name: 'startAngle', type: 'number', description: '起始角（弧度），默认 -π/2，顺时针。' },
    ]),
    demo('chart-radar', RADAR_SOURCE),
  ],
};

// ---- 跨端集成 ----

export const chartCrossPlatformPage: DocPage = {
  path: '/transone-chart/cross-platform',
  title: '跨端集成',
  description: '各端支持状态、小程序端静态编译约束与原生 App 接入路径。',
  section: 'chart',
  order: 8,
  body: [
    heading(1, '跨端集成'),
    heading(2, '支持矩阵'),
    table(
      ['平台', '支持', '说明'],
      [
        ['Web', '✅', 'HTMLCanvasElement.getContext(\'2d\') 直接满足 ICanvas2D。'],
        ['微信小程序', '✅', '<canvas type="2d"> + SelectorQuery 节点；CLI 已内置 canvas 标签映射。'],
        ['阿里小程序', '✅', '同一适配层（安全取全局 my / tt / wx）。'],
        ['字节小程序', '✅', '同上。'],
        ['iOS / Android / 鸿蒙 App', '🔜 契约就绪', '实现 ICanvas2D（约 20 个方法）即可接入。'],
      ]
    ),
    paragraph(
      '小程序端 DPR 通过各端',
      inlineCode('getSystemInfoSync()'),
      '获取，像素比自动适配，无需手工处理。'
    ),
    heading(2, '自动重绘'),
    paragraph(
      'TcChart 内置尺寸变化自动重绘，防抖窗口',
      inlineCode('150ms'),
      '（连续触发只重绘一次），策略按端区分：'
    ),
    table(
      ['平台', '监听方式', '重绘策略'],
      [
        ['Web', 'ResizeObserver 观察 canvas（CSS 宽高 100%，容器变化即触发）', '重测 clientWidth/Height 与 DPR → 更新 canvas 物理缓冲 → chart.resize().render() 增量重绘'],
        ['小程序', '各端窗口尺寸回调（onWindowResize，横竖屏 / 分屏等场景）', '重新解析节点尺寸 → 重建图表渲染'],
      ]
    ),
    heading(2, '小程序端约束'),
    paragraph(
      strong('transone-cli 对小程序端模板 / 组件有静态编译约束'),
      '，TcChart 已按其适配，使用方注意三点：',
    ),
    ol([
      ['option 放在 initState() 返回对象中（经 data 序列化 + wx:for 数据绑定传给组件）；不要在 render() 里引用模块级常量对象——静态常量会被折叠为字符串属性，对象 props 会丢失。示例见 playground/chart-demo/src/pages/home.ts 的 charts 数组写法。'],
      ['initState() 内只支持 const 声明与 return（需静态求值）；render() 内不支持调用自定义辅助方法（用 each(...) 展开），each 的 key 仅支持 (item) => item.xxx 或 (item, index) => index。'],
      ['小程序端 props 无法传函数（如 option.format），需要函数时请在端内判断分支。'],
    ]),
    codeBlock(
      'typescript',
      `// playground/chart-demo/src/pages/home.ts 的推荐写法
interface ChartDemoState { charts: ChartOption[] }

class ChartDemoPage extends Component<Record<string, never>, ChartDemoState> {
  protected initState(): ChartDemoState {
    return { charts: [lineOption, barOption, pieOption, radarOption] };
  }
  protected render(): VNode {
    return h('div', { className: 'chart-demo' }, [
      each(this.state.charts, (option) =>
        h('div', { className: 'chart-demo__card' }, [
          createComponent({ component: TcChart, props: { option } }),
        ])
      ),
    ]);
  }
}`
    ),
    heading(2, '原生 App 接入路径'),
    ol([
      ['宿主提供原生 canvas 能力（Skia / ArkUI Canvas / 原生桥），把原生绘制 API 实现为 ICanvas2D 契约。'],
      ['实现 NativeCanvasHost（width / height / pixelRatio / getContext(\'2d\')），调用 resolveNativeCanvas(host)。'],
      ['之后引擎与四种图表零改动运行。'],
    ]),
    callout(
      'info',
      [
        '适配器在 lib/adapters/ 下按端拆分：web.ts、miniprogram.ts、native.ts；新增端不改动 core 与 charts。',
      ],
      '扩展点'
    ),
  ],
};
