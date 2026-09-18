# TransOne

**简体中文**（英文版规划中）

> 一份 TypeScript 源码，编译期静态转换为 Web 与多端小程序产物，未来扩展到原生 App 的跨端前端框架。
> 与 TSone 同源的 One 家族成员。

## 特性

- 纯 TypeScript 实现，TypeScript 为第一公民，公开 API 提供完整类型定义
- Bun 原生工具链：安装、测试、构建、演练和文档服务均由 Bun 驱动
- 一份源码，多端产物：`transone build --target <端>` 直接产出各平台原生工程
- 编译期静态转换（transpile/transform），产物**不携带框架运行时**，体积更小、更接近原生
- 响应式系统：`reactive`、`effect`、`computed`
- 面向对象组件模型：`Component<Props, State>`、生命周期、事件、插槽
- 策略化渲染层：文本、元素、组件、插槽按 VNode 类型分发
- 内置路由：`createRouter`、`RouterView`、`RouterLink`
- 目标端抽象：`web` / `mp-weixin` / `mp-alipay` / `mp-bytedance`，未来扩展 `app-ios` / `app-android` / `app-harmony`

## 目标端支持矩阵

| 目标端 | 产物形态 | 生成机制 | 状态 |
| --- | --- | --- | --- |
| Web（H5） | 静态站点 / SPA | 复用 TSone 策略化渲染 | 已实现（M1） |
| 微信小程序 | 原生小程序工程 | 编译期静态转换 | 已实现（M2） |
| 阿里小程序（支付宝 / 淘宝） | 原生小程序工程 | 编译期静态转换 | 已实现（M3） |
| 字节小程序（抖音） | 原生小程序工程 | 编译期静态转换 | 已实现（M3） |
| iOS | 原生 App | TBD | 远期 |
| Android | 原生 App | TBD | 远期 |
| 鸿蒙 | 原生 App（ArkUI） | TBD | 远期 |

> 以上为规划目标，实际落地进度以路线图为准，详见 [定位与设计文档](./docs/positioning.md)。
> M1–M3 已落地：`--target web` 产出 H5 站点、`--target mp-weixin` 产出微信原生工程、`--target mp-alipay` 产出阿里原生工程（AXML/ACSS）、`--target mp-bytedance` 产出字节原生工程（TTML/TTSS）。同一份源码经跨端差异层（MpDialect）静态转换。见 [playground/counter](./playground/counter)。

## 快速开始

> 以下示例即 [playground/counter](./playground/counter) 的实现，M1 已可运行。

```typescript
import { Component, VNode, createApp } from 'transone';

interface AppState {
  count: number;
}

class App extends Component<Record<string, never>, AppState> {
  protected initState(): AppState {
    return { count: 0 };
  }

  protected initStyles(): void {}

  protected render(): VNode {
    return {
      tag: 'main',
      children: [
        { tag: 'h1', children: ['TransOne'] },
        {
          tag: 'button',
          listeners: {
            click: () => {
              this.state.count += 1;
            },
          },
          children: [`count: {{count}}`],
        },
      ],
    };
  }
}

const app = createApp({ root: App });
app.mount();
```

同一份源码，构建到不同目标端：

```bash
transone build --target web           # 产出 H5 站点（M1 已实现）
transone build --target mp-weixin     # 产出微信小程序原生工程（M2 已实现）
transone build --target mp-alipay     # 产出阿里小程序原生工程（M3 已实现）
transone build --target mp-bytedance  # 产出字节小程序原生工程（M3 已实现）
```

未实现的目标端会在编译期快速报错并给出对应路线图阶段。

## 与 TSone 的关系

- **TransOne 是 TSone 的多端泛化**：TSone 聚焦 Web 运行时，TransOne 把同一套响应式 / 组件 / 渲染模型通过编译期转换输出到多端。
- TSone 的 `build --mp-weixin` 是 TransOne 微信端编译器的原型验证，其产物形态与约束将迁移到 TransOne 并泛化为多端 Target。
- 核心公开 API 与 TSone 同源，Web 产物可直接复用 TSone 的渲染策略与既有组件生态。
- One 家族：`TSone`（前端框架）· `TransOne`（跨端框架）· `BackOne`（后端框架）。

## 仓库结构

本仓库为 Bun workspace monorepo，包含两个发布包：

```text
packages/transone/      核心框架 transone
packages/transone-cli/  多端编译器 transone-cli（Target 抽象 + CLI）
playground/counter/     多端演练项目（M1：Web 可运行）
```

## 开发命令

与 TSone 仓库保持一致：

```bash
bun install              # 安装依赖
bun test                 # 全量测试
bunx tsc --noEmit        # 类型检查
bun run build            # 构建发布产物
bun run format           # Prettier 格式化
```

演练项目：

```bash
bun run --cwd playground/counter build:web   # 构建 Web 产物
bun run --cwd playground/counter preview     # 本地预览构建产物
```

## 文档

在线文档部署在 GitHub Pages（合并部署，主站 + CLI 子站）：

- 主文档站：<https://geektech-team.github.io/transone/>（框架指南 / 子包文档 / API）
- CLI 文档子站：<https://geektech-team.github.io/transone/cli/>（transone 命令与配置参考）

本地开发文档：

```bash
bun run docs:dev        # 主文档站开发服务器（端口 52313）
bun run docs:build      # 构建主文档站产物（docs/dist）
bun run docs:preview    # 本地预览主文档站
bun run docs:cli:build  # 构建 CLI 文档子站（packages/transone-cli/docs/dist）
```

文档站由 TransOne 自身构建（`transone build --target web`，SSR + 静态产物），
源码在 [docs/](./docs) 与 [packages/transone-cli/docs](./packages/transone-cli/docs)。
CI 部署见 [.github/workflows/docs-pages.yml](./.github/workflows/docs-pages.yml)：
主站与 CLI 子站分别以 `--base` 构建后合并为单个 Pages 站点。

## 发布前检查

对齐 TSone：

```bash
bun test && bunx tsc --noEmit && bun run build && \
bun pm pack --cwd packages/transone --dry-run && \
bun pm pack --cwd packages/transone-cli --dry-run
```

## License

待定，与 TSone 保持一致。
