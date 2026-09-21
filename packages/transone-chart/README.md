# transone-chart

TransOne 生态的跨端图表库：**一份 TypeScript 源码，基于 Canvas 2D 渲染**，同时跑通 Web 与微信 / 阿里 / 字节小程序，并为未来原生 App（iOS / Android / 鸿蒙）预留扩展契约。

一期内置四种常用图表：**折线图 / 柱状图 / 饼图（环形）/ 雷达图**。

- 零运行时依赖（`transone` 仅组件集成为 optional peer）
- OOP + 策略模式：`core（纯引擎）→ charts（图表策略）→ adapters（平台差异）→ factory（分发）→ component（声明式组件）`
- 跨端唯一解耦边界是 `ICanvas2D` 契约（图表所需的最小 Canvas 2D 子集）
- 与 `transone` 组件系统无缝集成：`<TcChart option={...} />` 一份代码编译到 Web / 小程序

## 安装

```bash
bun add transone-chart          # 运行时（peer: transone >= 0.3.0）
bun add -d transone-chart       # 仅引擎用法时
```

## 快速开始

### 方式一：声明式组件（推荐，配合 transone）

```tsx
import { Component, createComponent } from 'transone';
import { TcChart } from 'transone-chart';

// 任意图表 Option
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
}
```

`TcChart` 是**受控组件**：`option` 由父级传入，数据变化自动 `setOption + render`；组件卸载自动销毁。
尺寸变化（容器宽度 / 窗口横竖屏）自动**防抖重绘（150ms）**：Web 用 ResizeObserver 增量 `resize + render`，
小程序端用窗口尺寸回调重建，无需手动调用。

### 方式二：引擎直用（无框架场景）

```ts
import { createWebChart, createMiniProgramChart } from 'transone-chart';

// Web：canvas 元素
const chart = createWebChart(canvasElement, option);
chart.render();

// 小程序：Canvas 2D 节点
const chart2 = createMiniProgramChart(canvasNode, option);
chart2.render();

// 高级：自定义渲染上下文（如原生桥层实现 ICanvas2D 后）
import { createChart } from 'transone-chart';
const chart3 = createChart(context, option); // context 为 ChartRenderContext
chart3.render();
```

## 图表 API 一览

所有配置均为 `ECharts` 心智（`title / legend / xAxis / yAxis / series`），但零依赖纯 Canvas 绘制。

| 图表 | Option 类型 | 核心配置 |
|---|---|---|
| 折线 | `LineChartOption` | `smooth` 平滑曲线、`area` 面积填充、`showSymbol` 数据点、`startFromZero` |
| 柱状 | `BarChartOption` | `stack` 堆叠分组、`horizontal` 横向、`borderRadius` 圆角、`barWidth` |
| 饼图 | `PieChartOption` | `radius / innerRadius`（环形）、`startAngle`、`labelPosition: 'outside'` 引线外置标签 |
| 雷达 | `RadarChartOption` | `indicators[].max` 归一化、`splitCount` 网格层、`area` 多边形填充 |

完整字段见 [`lib/types.ts`](./lib/types.ts)（每个字段均带中文注释）。

## 跨端支持

| 平台 | 支持 | 说明 |
|---|---|---|
| Web | ✅ | `HTMLCanvasElement.getContext('2d')` 直接满足 `ICanvas2D` |
| 微信小程序 | ✅ | `<canvas type="2d">` + SelectorQuery 节点；CLI 已内置 canvas 标签映射 |
| 阿里小程序 | ✅ | 同一适配层（安全取全局 `my` / `tt` / `wx`） |
| 字节小程序 | ✅ | 同上 |
| iOS / Android / 鸿蒙 App | 🔜 契约就绪 | 实现 `ICanvas2D`（约 20 个方法）即可接入，见下节 |

> 小程序端 DPR 通过各端 `getSystemInfoSync()` 获取，像素比自动适配，无需手工处理。

### 小程序端约束（写组件代码前必读）

transone-cli 对小程序端模板/组件有静态编译约束，`TcChart` 已按其适配，使用方注意：

- **option 请放在 `initState()` 的返回对象中**（经 data 序列化 + `wx:for` 数据绑定传给组件），
  不要直接在 `render()` 里引用模块级常量对象——静态常量会被折叠为字符串属性，对象 props 会丢失。
  参见 `playground/chart-demo/src/pages/home.ts` 的 `charts` 数组写法。
- `initState()` 内只支持 `const` 声明与 `return`（小程序端需静态求值）；`render()` 内不支持调用
  自定义辅助方法（请用 `each(...)` 展开），`each` 的 key 仅支持 `(item) => item.xxx` 或 `(item, index) => index`。
- 小程序端 props 无法传函数（如 `option.format`），需要函数时请在端内判断分支。

## 原生 App 扩展指南

图表引擎与平台完全解耦，唯一的平台边界是 `ICanvas2D`（`lib/core/canvas.ts`）。
原生端只需实现该契约（`beginPath / moveTo / lineTo / bezierCurveTo / arc / fill / stroke / measureText / createLinearGradient` 等），
再通过 `adapters/native.ts` 的 `resolveNativeCanvas` 注入即可，图表层零改动。

```ts
import { createChart } from 'transone-chart';
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
chart.render();
```

> `adapters/native.ts` 当前是契约占位：未实现时调用会显式抛错，**绝不静默降级**，
> 保证原生端不会出现"看起来渲染了其实空白"的隐性故障。

## 架构

```
┌─────────────────────────────────────────────────────┐
│ component.ts   TcChart 声明式组件（受控，自动生命周期）   │
├─────────────────────────────────────────────────────┤
│ factory.ts     createChart(option) 按 type 分发策略    │
├─────────────────────────────────────────────────────┤
│ charts/        LineChart / BarChart / PieChart /     │
│                RadarChart（策略类，只依赖 core）       │
├─────────────────────────────────────────────────────┤
│ core/          canvas.ts(ICanvas2D 契约) · scale ·    │
│                layout · axis · legend · chart(基类)   │
├─────────────────────────────────────────────────────┤
│ adapters/      web.ts · miniprogram.ts · native.ts   │
└─────────────────────────────────────────────────────┘
```

渲染管线（`ChartBase`）：

```
save → scale(dpr) → clear → 背景 → 布局(title/legend/轴区逐层扣除)
→ 标题 → 图例 → 坐标轴(仅笛卡尔类) → drawSeries → restore
```

- `seriesColor` 按索引取 `DEFAULT_PALETTE` 色板，显式 `color` 优先
- 数值轴自动 nice 刻度；类目轴无标签不预留轴区
- 图例：series 带 `name` 且未显式配置时，默认 `top` 显示

## 开发

```bash
bun test                  # 53 个单测（mock canvas 断言绘制命令 + 防抖 / resize）
bun run build             # tsc 声明 + Bun.build（minify, ESM）
bun run --cwd ../../playground/chart-demo build:web   # 演示项目构建
```

## 目录结构

```
packages/transone-chart/
├── lib/               # 源码（core / charts / adapters / factory / component / types）
├── tests/             # 单测（scale / layout / line / bar / pie / radar / factory / debounce / resize）
├── scripts/build.ts   # 构建脚本
└── playground 演示：playground/chart-demo（城市指数场景，五种图表卡片）
```

## 路线图

- [x] 一期：折线 / 柱状 / 饼 / 雷达 + Web / 小程序 + 原生契约
- [ ] 交互：tooltip / 高亮 / 点击事件（event 层）
- [ ] 更多图表：散点 / 面积 / 漏斗 / 仪表盘
- [ ] 原生 App 适配器实现（iOS / Android / 鸿蒙桥层）
- [ ] 主题系统 / 动画过渡
