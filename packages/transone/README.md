# transone

TransOne 核心框架包：一份 TypeScript 源码，跨端框架的核心运行时模型。

- 响应式系统：`reactive`、`readonly`、`effect`、`stop`、`computed`、`ref`、`watch`
- 面向对象组件：`Component<Props, State>`、生命周期、事件、插槽
- 策略化渲染：`RenderStrategy` 按 VNode 类型分发（文本 / 元素 / 组件 / 插槽）
- 内置路由：`createRouter`、`RouterView`、`RouterLink`
- 样式管理：`StyleManager`

与 TSone 同源：核心公开 API 复用 TSone，Web 产物可直接复用 TSone 渲染策略。
编译器见 [transone-cli](../transone-cli)。

```bash
bun test          # 测试
bun run build     # 构建 dist（ESM + .d.ts）
```
