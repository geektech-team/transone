# TransOne 定位与设计文档

> 状态：规划稿 · 2026-09-18
> 本文档定义 TransOne 的品牌定位、能力边界、目标端支持矩阵与架构方向，作为后续开发的权威依据。

## 1. 一句话定位

**一套 TypeScript 源码，通过编译期静态转换（transpile / transform）产出 Web 与多端小程序原生工程，未来扩展原生 App（iOS / Android / 鸿蒙）的跨端前端框架。**

核心主张：**一套源码，多端原生产物，零运行时桥接。**

## 2. 命名与品牌

| 项 | 值 |
| --- | --- |
| 框架名 | TransOne（Trans = transpile / transform，强调编译期转换） |
| 核心包 | `transone` |
| 编译器包 | `transone-cli` |
| 家族 | `TSone`（Web 前端框架）→ `TransOne`（跨端框架）→ `BackOne`（后端框架） |

命名意图：`Trans` 直接点明技术路线——这是一套**编译期静态转换**的框架，与"运行时桥接"方案（uni-app 等）在机制上划清界限；`One` 延续 One 家族品牌。

## 3. 为什么是编译期静态转换（核心差异）

跨端方案的主流路线对比：

| 方案 | 代表 | 机制 | 代价 |
| --- | --- | --- | --- |
| 运行时桥接 | uni-app | 框架运行时 + 编译产物（自定义组件 + 运行时适配层） | 产物依赖框架运行时，包体大，调试隔层 |
| 编译转换 + 运行时适配 | Taro | Babel 编译 + 运行时 reconciler | 运行时依赖框架子集，性能与兼容性受限 |
| **编译期静态转换（本项目）** | TSone `build --mp-weixin` 原型 | 静态分析 VNode 子集 → 目标端原生模板 / 组件代码，**产物无框架运行时** | 对源码形态有约束（必须可静态编译），需文档化限制 |

TransOne 选择第三种，理由：

- **产物即原生工程**：直接由各平台官方工具链构建、预览、发布，无框架运行时依赖，延续 TSone 的零运行时理念。
- **体积与性能最优**：小程序端尤其敏感，静态转换产物最接近手写原生。
- **代价可控**：每端维护一个静态编译目标（模板语法、样式、API 映射），对不可静态编译的写法在编译期快速报错——TSone 的 `build --mp-weixin` 已验证该策略可行。

## 4. 目标用户场景

- 需要"一套代码同时交付官网 + 多端小程序"的轻量产品（例如城市数据排名类产品：小程序 + 网站双端）。
- 对包体、启动性能敏感，希望小程序产物接近原生实现的项目。
- 希望长期保留跨端能力（未来 App），但现阶段以 Web + 小程序为主战场的团队。

## 5. 能力边界

### 首期做（M1–M3）

- Web 产物：复用 TSone 渲染策略，直接渲染，行为与 TSone 一致。
- 微信 / 阿里 / 字节小程序：编译期静态转换，产出原生小程序工程。
- 响应式系统、类组件、生命周期、事件、插槽、路由、样式管理。
- 目标端抽象（Target）与编译器 Target 化。

### 首期不做（明确排除）

- SSR、devtools、HMR / WebSocket 热更新（对齐 TSone 首版约束）。
- JSX 编译器、非静态可分析写法。
- 运行时跨端桥接（不采用 uni-app 式运行时适配层）。
- App 端（iOS / Android / 鸿蒙）列为远期，不阻塞首期设计；但 Target 抽象需预留扩展点。
- 不引入 Vue / React 等第三方运行时。

## 6. 目标端支持矩阵

| 目标端 | 产物形态 | 生成机制 | 状态 |
| --- | --- | --- | --- |
| Web（H5） | 静态站点 / SPA | 复用 TSone 策略化渲染 | 已完成（M1） |
| 微信小程序 | 原生小程序工程 | 编译期静态转换 | 已完成（M2） |
| 阿里小程序（支付宝 / 淘宝） | 原生小程序工程 | 编译期静态转换 | 已完成（M3） |
| 字节小程序（抖音） | 原生小程序工程 | 编译期静态转换 | 已完成（M3） |
| iOS | 原生 App | TBD | 远期 |
| Android | 原生 App | TBD | 远期 |
| 鸿蒙 | 原生 App（ArkUI） | TBD | 远期 |

## 7. 架构方向

### 7.1 Monorepo 布局

```text
packages/transone/      核心框架 transone
packages/transone-cli/  多端编译器 transone-cli
playground/             多端演练项目
```

### 7.2 核心包（与 TSone 同源）

- 响应式系统：`reactive`、`readonly`、`effect`、`stop`、`computed`、`ref`
- 面向对象组件：`Component<Props, State>`、生命周期、事件、插槽
- 策略化渲染：`RenderStrategy` 按 VNode 类型分发（文本 / 元素 / 组件 / 插槽）
- 内置路由：`createRouter`、`RouterView`、`RouterLink`
- 样式管理：`StyleManager`

### 7.3 编译器（transone-cli）

**目标端抽象（Target）**：每个端一个编译目标，编译器按 Target 分发代码生成。

```text
web           直接渲染（HTML + 浏览器运行时，与 TSone 一致）
mp-weixin     WXML / WXSS / JS 静态转换（迁移 TSone build --mp-weixin）
mp-alipay     AXML / ACSS 静态转换
mp-bytedance  ttml / ttss 静态转换
app-*         远期占位（app-ios / app-android / app-harmony）
```

**编译流水线**：入口文档 → 静态分析（可编译性校验）→ VNode 子集抽取 → 各 Target 代码生成 → 原生工程文件输出。

**约束**：只支持可静态编译的写法；无法编译的写法在编译期快速报错并给出原因（延续 TSone 的报错策略）。

### 7.4 设计约束

- OOP + 策略模式 + SOLID，对齐 TSone 项目内 OOP 设计约束。
- 新增渲染 / 编译行为优先扩展或拆分 Strategy，不把逻辑堆进单个大函数。
- 类、接口、继承、组合关系需清晰（依赖 / 关联 / 聚合 / 组合 / 继承 / 实现至少能说明一种）。
- 零外部运行时依赖；Bun-first 工具链。

## 8. 工程约定

- TypeScript strict 风格，避免新增 `any`；公共 API 优先泛型、`unknown`、显式接口。
- 命名：目录 / 文件 kebab-case，类 PascalCase，函数 / 变量 camelCase，常量 UPPER_SNAKE_CASE。
- Prettier：2 spaces、single quote、semicolons、trailingComma es5、printWidth 80。
- 不提交生成产物（`dist/`、`coverage/`、`node_modules/` 等）。

## 9. 路线图

| 里程碑 | 内容 | 验收标准 |
| --- | --- | --- |
| M1 | Web 产物：迁移 / 复用 TSone 核心到 `transone`，建立 monorepo 骨架 | `transone build --target web` 产出可运行 H5 站点（已完成） |
| M2 | 微信小程序：泛化 TSone `build --mp-weixin` 为 Target 抽象 | `transone build --target mp-weixin` 产出可被微信开发者工具打开的原生工程（已完成） |
| M3 | 阿里、字节小程序：新增 `mp-alipay` / `mp-bytedance` Target | 两端均产出可构建的原生工程；沉淀跨端差异层（模板语法映射、样式单位、API 能力映射）（已完成） |
| M4（远期） | App 端探索：iOS / Android / 鸿蒙技术选型 | 输出技术选型结论，不阻塞 M1–M3 设计 |

## 10. 开放问题

1. **App 端技术路线**：自绘渲染引擎（如 Skia）vs 编译到原生 vs 原生容器 + WebView——决定 Target 抽象是否需要"原生渲染后端"，M1–M3 阶段预留即可，不提前设计。
2. **小程序模板语法覆盖范围**：WXML / AXML / ttml 子集边界如何定义，哪些组件 / 事件映射需要按端定制（如 `wx.request` vs `my.request` vs `tt.request`）。
3. **与 TSone 的 API 兼容策略**：核心包直接复用 vs 分叉演进。建议：Web 端完全复用 TSone API；小程序端约束为可静态编译的子集，并在文档中声明差异。
4. **跨端能力映射表的维护机制**：各端 API / 组件能力差异的登记与测试方式（建议以表格 + 契约测试固化）。
