# transone-cli

TransOne 多端编译器：Bun 原生 CLI，按 Target 将一份 TypeScript 源码静态转换为多端原生工程。

## 目标端抽象（Target）

```text
web            直接渲染（HTML + 浏览器运行时，M1 已实现）
mp-weixin      WXML / WXSS / JS 静态转换（M2 规划中）
mp-alipay      AXML / ACSS 静态转换（M3 规划中）
mp-bytedance   ttml / ttss 静态转换（M3 规划中）
app-*          远期占位（app-ios / app-android / app-harmony）
```

新增目标端：实现 `BuildTarget` 接口并注册到 `TargetRegistry`，无需改动构建入口。

## 使用

```bash
transone build --target web           # 产出 H5 站点
transone build --target mp-weixin     # 未实现时编译期报错并给出路线图阶段
transone dev                          # 开发服务（仅 web）
transone create                       # 脚手架
```

```bash
bun test          # 测试
bun run build     # 构建 dist（CLI bundle + .d.ts）
```

## 文档

- 在线文档（CLI 子站）：<https://geektech-team.github.io/transone/cli/>
- 主文档站：<https://geektech-team.github.io/transone/>
- 仓库：<https://github.com/geektech-team/transone>
