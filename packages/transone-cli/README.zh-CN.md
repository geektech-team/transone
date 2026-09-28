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
