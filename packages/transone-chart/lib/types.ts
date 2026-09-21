/**
 * transone-chart 公共类型定义。
 *
 * 所有图表共用一份 Option 风格配置（对齐 ECharts 心智：xAxis / yAxis /
 * series / legend / title），但实现零依赖、纯 Canvas 2D 绘制。
 */

/** 一期支持的图表类型。 */
export type ChartType = 'line' | 'bar' | 'pie' | 'radar';

/** 默认主题色板（与 transone-ui 主色一致，可按需覆盖）。 */
export const DEFAULT_PALETTE: readonly string[] = [
  '#1677ff',
  '#00b578',
  '#ff8f1f',
  '#ff3141',
  '#eb2f96',
  '#722ed1',
  '#13c2c2',
  '#faad14',
  '#2f54eb',
  '#a0d911',
];

export const DEFAULT_TEXT_COLOR = '#323233';
export const DEFAULT_AXIS_COLOR = '#c8c9cc';
export const DEFAULT_GRID_COLOR = '#ebedf0';
export const DEFAULT_FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif";

/** 标题配置。 */
export interface TitleOption {
  text: string;
  fontSize?: number;
  color?: string;
  /** 标题与绘图区之间的留白，默认 16。 */
  padding?: number;
}

/** 图例配置。 */
export interface LegendOption {
  show?: boolean;
  /** 图例位置：顶部横向 / 底部横向 / 右侧纵向。 */
  position?: 'top' | 'bottom' | 'right';
  fontSize?: number;
  color?: string;
  /** 图例色块边长（正方形），默认 12。 */
  markerSize?: number;
  /** 图例项之间的水平间距，默认 16。 */
  itemGap?: number;
}

/** 数值轴（y 轴/雷达数值）配置。 */
export interface ValueAxisOption {
  /** 显式最小值；缺省自动 nice。 */
  min?: number;
  /** 显式最大值；缺省自动 nice。 */
  max?: number;
  /** 刻度分段数，默认 5。 */
  splitCount?: number;
  labelFontSize?: number;
  labelColor?: string;
  gridColor?: string;
  gridLineWidth?: number;
  /** 网格虚线，如 [4, 4]；默认实线。 */
  gridLineDash?: number[];
  /** 是否显示网格，默认 true。 */
  showGrid?: boolean;
  /** 刻度标签格式化。 */
  format?: (value: number) => string;
}

/** 类目轴（x 轴/雷达指标）配置。 */
export interface CategoryAxisOption {
  labels: readonly string[];
  labelFontSize?: number;
  labelColor?: string;
  gridColor?: string;
  gridLineWidth?: number;
  /** 是否显示类目网格竖线，默认 false。 */
  showGrid?: boolean;
}

/** —— 折线图 —— */

export interface LineSeries {
  name?: string;
  data: readonly number[];
  color?: string;
  /** 平滑曲线（三次贝塞尔插值），默认 false。 */
  smooth?: boolean;
  /** 是否填充系列与数值轴之间的面积，默认 false。 */
  area?: boolean;
  /** 是否绘制数据点标记，默认 true。 */
  showSymbol?: boolean;
  lineWidth?: number;
}

export interface LineChartOption {
  type: 'line';
  title?: TitleOption;
  legend?: LegendOption;
  xAxis: CategoryAxisOption;
  yAxis?: ValueAxisOption;
  series: readonly LineSeries[];
  /** 数值轴是否从 0 开始（数据全为正时强制含 0），默认 false（按数据范围紧凑显示）。 */
  startFromZero?: boolean;
  /** 背景色（如 'rgba(22,119,255,0.06)'），默认无。 */
  backgroundColor?: string;
}

/** —— 柱状图 —— */

export interface BarSeries {
  name?: string;
  data: readonly number[];
  color?: string;
  /** 堆叠组名；同名系列纵向堆叠。 */
  stack?: string;
  /** 柱体宽度（px），缺省按类目带自动计算。 */
  barWidth?: number;
  /** 柱体圆角，默认 0。 */
  borderRadius?: number;
}

export interface BarChartOption {
  type: 'bar';
  title?: TitleOption;
  legend?: LegendOption;
  xAxis: CategoryAxisOption;
  yAxis?: ValueAxisOption;
  series: readonly BarSeries[];
  /** 横向柱状图（类目轴转纵向、数值轴转横向），默认 false。 */
  horizontal?: boolean;
  backgroundColor?: string;
}

/** —— 饼图 —— */

export interface PieDatum {
  name: string;
  value: number;
  color?: string;
}

export interface PieChartOption {
  type: 'pie';
  data: readonly PieDatum[];
  title?: TitleOption;
  legend?: LegendOption;
  /** 外半径：数字（px）或百分比字符串（相对 min(width, height) / 2），默认 '60%'。 */
  radius?: number | string;
  /** 内半径：0 为饼图；>0 为环形图，默认 0。 */
  innerRadius?: number | string;
  /** 是否显示扇区标签（名称 + 百分比），默认 true。 */
  showLabel?: boolean;
  /** 标签位置：'inside' 画在扇区内（默认，白字）；'outside' 画在扇区外并带引线（适合小扇区 / 长名称）。 */
  labelPosition?: 'inside' | 'outside';
  /** 外部标签引线沿平分线的长度（px），仅 labelPosition: 'outside' 生效，默认 14。 */
  labelLineLength?: number;
  /** 外部标签与引线端点的水平间距（px），仅 labelPosition: 'outside' 生效，默认 6。 */
  labelGap?: number;
  /** 外部标签引线颜色，默认 '#c0c4cc'。 */
  labelLineColor?: string;
  labelFontSize?: number;
  labelColor?: string;
  /** 起始角（弧度），默认 -Math.PI / 2（12 点方向），顺时针。 */
  startAngle?: number;
  backgroundColor?: string;
}

/** —— 雷达图 —— */

export interface RadarIndicator {
  name: string;
  /** 指标最大值；缺省取所有系列该指标的最大值。 */
  max?: number;
}

export interface RadarSeries {
  name?: string;
  data: readonly number[];
  color?: string;
  /** 是否填充多边形区域，默认 true。 */
  area?: boolean;
  lineWidth?: number;
}

export interface RadarChartOption {
  type: 'radar';
  indicators: readonly RadarIndicator[];
  series: readonly RadarSeries[];
  title?: TitleOption;
  legend?: LegendOption;
  /** 网格层数，默认 5。 */
  splitCount?: number;
  gridColor?: string;
  gridLineWidth?: number;
  labelFontSize?: number;
  labelColor?: string;
  /** 雷达中心半径（px），缺省取 min(width, height) / 2 的 60%。 */
  radius?: number;
  /** 起始角（弧度），默认 -Math.PI / 2（12 点方向），顺时针。 */
  startAngle?: number;
  backgroundColor?: string;
}

export type ChartOption =
  | LineChartOption
  | BarChartOption
  | PieChartOption
  | RadarChartOption;

/** 图表渲染上下文（适配器解析后的产物）。 */
export interface ChartRenderContext {
  /** 跨端 Canvas 2D 上下文。 */
  ctx: import('./core/canvas').ICanvas2D;
  /** 逻辑宽度（CSS px）。 */
  width: number;
  /** 逻辑高度（CSS px）。 */
  height: number;
  /** 设备像素比。 */
  dpr: number;
  /** 自定义色板，缺省使用 DEFAULT_PALETTE。 */
  palette?: readonly string[];
}
