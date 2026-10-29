# transone-cli

**简体中文** · [English](./README.md)

TransOne 多端编译器：Bun 原生 CLI，按 Target 将一份 TypeScript 源码静态转换为多端原生工程。

## 目标端抽象（Target）

```text
web            直接渲染（HTML + 浏览器运行时，M1 已实现）
mp-weixin      WXML / WXSS / JS 静态转换（已实现）
mp-alipay      AXML / ACSS 静态转换（已实现）
mp-bytedance   TTML / TTSS 静态转换（已实现）
mp-xiaohongshu XHSML / CSS 静态转换（已实现；小红书小程序，非小组件）
app-*          原生应用代码生成（app-ios / app-android / app-harmony，已实现）
```

新增目标端：实现 `BuildTarget` 接口并注册到 `TargetRegistry`，无需改动构建入口。

## 使用

```bash
transone build --target web           # 产出 H5 站点
transone build --target web-mobile    # 选择 @WebMobile() 实现
transone build --target web-pc        # 选择 @WebPc() 实现
transone build --target miniprogram-weixin # 选择 @MiniprogramWeixin() 实现
transone build --target app-ios       # 选择 @AppIos()，生成原生工程
transone build --target mp-weixin     # 生成微信小程序原生工程
transone build --target mp-xiaohongshu # 生成小红书小程序原生工程（XHSML / CSS）
transone dev                          # 开发服务（仅 web）
transone dev --target web-mobile       # 移动 Web 开发服务
transone create                       # 脚手架
```

框架 `Platform` 枚举与装饰器为端定义的唯一来源。配置可使用 `target: Platform.WebMobile`，
命令参数优先；旧的 `mp-*`、`app-*` 命令和平台配置键继续兼容。
`web-mobile`、`web-pc` 默认分别输出到 `dist/build/web-mobile`、`dist/build/web-pc`。

业务组件 `CardComponent extends BaseComponent` 提供共享状态和方法，端类继承它并使用
`@WebMobile()`、`@WebPc()`、`@MiniprogramWeixin()`、`@AppIos()` 等装饰器。
页面只引用 CardComponent。精确端优先，再回退同族通用实现 `@Web()` / `@Miniprogram()` / `@App()`，最后回退可实例化基类；
冲突和已使用的抽象基类缺少实现时明确报错。通用小程序和 App 层不是独立构建目标，仍需指定微信、iOS 等具体端。
默认扫描 src 的 TS/TSX，`components.include` / `exclude` 可调整源码范围。

`transone create` 生成共享 Card、三类通用实现和六个具体端实现、配置及脚本，保留任一模板文件已存在即拒绝覆盖的保护。
需要框架 0.5.0 与 CLI 0.8.0。完整枚举、继承、显式引用和原生静态子集见
[业务组件与端实现](../../docs/platform-components.md)。

Web 的 `dev`、`build` 会将可安全静态确定的组件 `initStyles()` 样式与文档样式输出为静态 CSS，通过 `<link rel="stylesheet">` 加载。组件提取支持字面量、不可变模块常量、hover、media 与 rpx 换算；依赖 props/state、后续修改 StyleManager 或含不支持语句的方法继续在运行时处理。无法安全确定选择器或跨模块继承关系时，当前 bundle 的组件样式保留在运行时。带标识的文档 `<style>` 和含相对资源 URL 的样式保留内联，以维持原有行为。组件应使用专属选择器：提取的规则在挂载前就已生效，并按稳定的源文件顺序排列。

Web 生产入口与分块 JS 文件名包含内容 hash，例如 `main-<hash>.js`，HTML 自动引用实际文件名；内容不变时 hash 不变。小程序及库入口保留平台与包约定的文件名。

```bash
bun test          # 测试
bun run build     # 构建 dist（CLI bundle + .d.ts）
```

在 Counter 演练项目中生成微信、支付宝、字节和小红书小程序：

```bash
bun run --cwd playground/counter build:weixin
bun run --cwd playground/counter build:alipay
bun run --cwd playground/counter build:bytedance
bun run --cwd playground/counter build:xiaohongshu
```

小红书产物位于 `playground/counter/dist/build/mp-xiaohongshu`。`mp` 配置既支持适用于所有小程序端的扁平配置，也支持按 target 分组；小红书未配置 `appId` 时使用占位默认值，导入开发者工具前应设置真实 App ID。

## 文档

- 在线文档（CLI 子站）：<https://geektech-team.github.io/transone/cli/>
- 主文档站：<https://geektech-team.github.io/transone/>
- 仓库：<https://github.com/geektech-team/transone>

## 组件诊断与输出恢复

`transone build --target web-pc --report-components` 输出静态组件选择报告，包含来源位置、精确匹配/通用平台族/基类回退以及候选实现。报告覆盖发现的逻辑组件，不代表运行时可达性，不与 `--library` 组合。
CLI 包的 `reportComponents(options)` 可单独读取结构化报告，`formatComponentSelectionReport(report)` 提供文本格式；只读检查不会执行组件模块或写入产物。

Web、小程序、App 与库构建在临时目录完整生成成功后再切换输出。失败保留旧产物，切换失败尝试回滚；只清理本次拥有的工作目录。
详见[诊断与清理](../../docs/reliability.md)。
