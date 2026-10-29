# transone

**简体中文** · [English](./README.md)

TransOne 核心框架包：一份 TypeScript 源码，跨端框架的核心运行时模型。

- 响应式系统：`reactive`、`readonly`、`effect`、`stop`、`computed`、`ref`、`watch`
- 面向对象组件：`Component<Props, State>`、生命周期、事件、插槽
- 策略化渲染：`RenderStrategy` 按 VNode 类型分发（文本 / 元素 / 组件 / 插槽）
- 内置路由：`createRouter`、`RouterView`、`RouterLink`
- 样式管理：`StyleManager`

与 TSone 同源：核心公开 API 复用 TSone，Web 产物可直接复用 TSone 渲染策略。
编译器见 [transone-cli](../transone-cli)。

框架 0.5.0 / CLI 0.8.0 支持业务组件与端实现：`CardComponent extends BaseComponent`
共享业务状态与方法，`@WebMobile()`、`@WebPc()`、`@MiniprogramWeixin()`、`@AppIos()`
标注子类。框架导出的 `Platform.WebMobile` 值为 `web-mobile`；
页面只引用 CardComponent，由 `dev/build --target web-mobile` 自动选择实现。
已有直接继承 Component 的用法继续有效。

默认精确端优先，再回退到所属平台族的通用实现（`@Web()` / `@Miniprogram()` / `@App()`），最后回退到可实例化业务基类；冲突或抽象基类缺少实现时报错。通用小程序与 App 装饰器仅用于组件选择，构建仍需指定具体端。
`transone create` 自带各端 Card 示例。完整 API、扫描配置和原生静态子集见
[业务组件与端实现](../../docs/platform-components.md)。

```bash
bun test          # 测试
bun run build     # 构建 dist（ESM + .d.ts）
```

## 资源清理

Web 组件可通过 `this.onDispose(cleanup)` 按注册顺序登记资源释放，返回的函数可撤销登记。卸载期间即使钩子、子组件或某个清理函数抛错，也会继续处理其余资源；重复卸载不会重复执行清理。单个异常保留原对象，多个异常汇总并保留 `errors`。
请求结束后自动释放外部取消监听与定时器；小程序宿主取消不回调时仍能正常结算。
使用示例和静态编译边界见[诊断与清理](../../docs/reliability.md)。
