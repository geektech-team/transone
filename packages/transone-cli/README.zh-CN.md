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
transone build --target mp-weixin     # 生成微信小程序原生工程
transone build --target mp-xiaohongshu # 生成小红书小程序原生工程（XHSML / CSS）
transone dev                          # 开发服务（仅 web）
transone create                       # 脚手架
```

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
