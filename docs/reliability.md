# 组件选择诊断与资源、产物清理

## 查看组件选择报告

```sh
transone build --target web-pc --report-components
transone build --target miniprogram-weixin --report-components
transone build --target app-ios --report-components
```

报告显示逻辑组件、选中实现的源码位置和匹配原因：

- `exact`：匹配具体端实现。
- `family`：回退到同族的 `@Web()` / `@Miniprogram()` / `@App()`。
- `base`：回退到可实例化的业务基类。
- `missing`：抽象业务基类没有可用实现。

每行附带入口上下文与已发现的候选实现。源码路径相对项目根目录，行列从 1 开始，记录顺序稳定。
Web 按入口分别报告，与多页构建各自的组件选择一致；小程序和 App 沿用各自生成器的共享页面索引。
报告覆盖静态发现的逻辑组件映射，不证明运行时会实例化所有这些组件。
显式引用实现类仍保持原身份，不属于逻辑组件的自动替换报告。
同一个逻辑组件在不同 Web 入口下可能选择不同实现，结构化行的 `entrypoints` 标明对应入口。
未使用的抽象类可以显示 `missing`；是否影响实际构建仍遵循已有的组件消费检查。

报告不会执行组件模块或写入构建产物；项目配置文件按正常配置加载流程处理。
`--report-components` 只用于应用构建，不与 `--library` 组合。

也可以单独读取结构化数据，按需保存 JSON：

```ts
import {
  reportComponents,
  formatComponentSelectionReport,
} from 'transone-cli';

const report = await reportComponents({
  root: process.cwd(),
  target: 'web-pc',
});

console.log(formatComponentSelectionReport(report));
console.log(JSON.stringify(report, null, 2));
```

单独调用 `reportComponents` 不会执行后续构建。

## 注册组件资源清理

Web 组件运行时提供 `onDispose`，适合管理自己创建的定时器、订阅和请求取消：

```ts
protected onMounted(): void {
  const controller = new AbortController();
  const timer = setInterval(() => this.refresh(), 30_000);

  this.onDispose(() => clearInterval(timer));
  this.onDispose(() => controller.abort());
}
```

- 按注册顺序执行清理；返回的函数可以撤销某一项注册。
- 一个清理函数或生命周期钩子抛错后，继续执行其余清理。
- 重复卸载不会重复清理；清理期间的重入不会重走卸载流程。
- 清理期间或已释放后新登记的资源会立即清理。
- 单个异常保留原始对象，多个异常通过带 `errors` 的 `AggregateError` 汇总。

子组件卸载失败也会继续处理兄弟节点并解除父子引用。挂载中途失败会释放已创建的资源。
应用卸载保持既有日志式异常行为，并继续清理根组件、模板、容器和自身拥有的全局引用。

这个资源管理入口属于当前组件运行时；小程序、原生 App 的源码仍受各自静态编译子集约束。
它不会自动赋予原生生成器异步请求或复杂生命周期能力。

请求适配器在成功、失败、超时和取消后均释放取消监听与定时器。
小程序宿主缺少 abort 回调或 abort 自身抛错，也不会使请求一直悬挂。

## 构建失败时保留上一版输出

Web、小程序、原生 App 与库构建先在独占的临时目录完成编译、写入和静态资源复制，
成功后再切换到最终输出目录。失败时清理本次临时产物，保留上一版完整输出；
首次构建失败时，不留下可以被误认为成功产物的半成品目录。

切换失败会尝试恢复旧目录；如果恢复本身失败，错误会保留备份位置，方便恢复。
成功发布后若旧备份无法清理，会给出警告，当前新产物仍视为成功发布。
返回的输出目录、资产路径及页面资源链接使用最终位置。

同一进程内对同一输出目录的并发构建会协调处理，不会清理另一构建的工作目录。
开发服务器继续使用自身的 session/generation 管理，生产构建回滚不接管或清理开发会话。

输出路径仍需满足既有安全约束，不能覆盖工程根目录、已知源码、配置或静态输入。
Web 输出保持工程根目录内的子目录约束；小程序、App 和库可以指定安全的外部输出目录。
最终输出路径本身不能是符号链接，且不能与已知的源码输入、配置或 public 目录重叠。
保护范围包含实际打包依赖、TypeScript 配置继承/引用，以及 TransOne 配置的静态导入与转导出。
任意运行时文件读取、动态计算的导入路径不属于这次静态输入保护的范围。

库构建保留各 TypeScript 配置的声明文件目录布局；所有 TypeScript 输出必须位于
`library.outDir` 内，才能由同一个输出事务管理。越界配置会明确报错并保留旧输出，
不会为了构建成功而改写项目的 tsconfig 或把部分声明文件发布到另一个目录。

这里保证可捕获异常下的恢复；不承诺断电、强制终止进程时的目录交换原子性。
