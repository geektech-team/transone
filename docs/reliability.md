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

## 组件初始化时机

Web 组件的父构造器只创建框架内部对象，不调用可覆写的 `initState/initStyles`。
`initState` 在首次读取 `state` 时同步执行一次；如果之前没有读取，挂载时会先初始化状态。
`initStyles` 在每次挂载的 `beforeMount` 之前执行。重复挂载已挂载的实例不会重复初始化。

```ts
class Counter extends Component<object, { count: number }> {
  private initialCount = 10;
  private color = 'tomato';

  protected initState() {
    return { count: this.initialCount };
  }

  protected initStyles() {
    this.styleManager.addStyle('counter', {
      selector: '.counter',
      properties: { color: this.color },
    });
  }

  protected render(): VNode {
    return { tag: 'span', props: { className: 'counter' }, children: ['{{count}}'] };
  }
}

const counter = new Counter();
counter.state.count; // 同步得到 10，不需要额外调用 initialize，也不用等待微任务
counter.setState({ count: 11 });
counter.mount(document.body);
```

现有钩子签名、`state` 读写、`setState`、继承覆写和 `super.initState/initStyles()` 调用方式不变。
构造后尚未挂载的实例不会自动插入样式。卸载不会触发未执行的初始化；重新挂载保留现有状态并重建样式。
初始化和挂载钩子的状态读取不会订阅父组件的渲染 effect。

状态初始化失败会保存原始异常，后续读取继续抛出，避免重复创建部分资源；
`initState` 内递归读取 `this.state` 会给出明确错误，应直接使用局部变量或 `super.initState()` 的返回值。
挂载期间的初始化错误沿既有错误边界传播，并清理已创建的资源；
在挂载前主动读取状态时，异常由调用者接收，放弃实例时仍应调用 `unmount()` 释放其资源。

如果在字段初始化器或父类自定义构造器中主动读取 `state`，初始化会在当时发生。
这类代码只能依赖已经完成初始化的字段，不能依赖派生类尚未执行的字段初始化或构造器语句。
小程序和原生 App 继续静态编译 `initState/initStyles`，实例字段遵循下面的共同求值规则。

## 小程序与 App 实例字段

小程序四端和原生 App 三端共用字段分析，不执行业务模块来求值：

- 先执行祖先类字段，再执行子类字段；每类内部保持声明顺序。祖先字段捕获当时值，`initState` 读取最终覆盖后的字段。
- 普通无初始化字段创建 `undefined` 自有属性，覆盖祖先同名值；`declare` 与 `static` 不会重置实例字段。
- 支持字符串、有限数字、布尔值、null、undefined、数组、对象、模块 `const`、字段引用、静态属性读取、纯算术/比较/条件/模板字符串及短路表达式。
- 支持在字段和 `initState` 中读取 `this.props`，包括对象/数组属性、`??` 默认值和对象展开。先取得该实例的初始 props，再按父到子顺序初始化字段，最后执行 `initState`；缺失值与 `0`、`false`、空字符串分别处理。
- 字面量数组和对象在每个实例中重新创建；字段之间的对象别名保留。模块对象的写入、调用和逃逸不能被当作不可变常量折叠。

```ts
class Counter extends Component<{ start?: number }, { count: number }> {
  private seed = this.props.start ?? 10;
  private step = this.seed + 2;

  protected initState() { return { count: this.seed }; }
  protected initStyles() {}
  increment() { this.state.count += this.step; }
  protected render(): VNode {
    return h('main', {}, [
      h('button', {}, [this.state.count], { click: () => this.increment() }),
    ]);
  }
}
```

小程序页面在 `Page.onLoad` 中使用 `createApp({ rootProps })` 提供的初始 props。
微信、抖音和小红书组件在 `attached`，支付宝组件在 `onInit` 中取得宿主已经安装的真实 props，
再逐实例定义字段、执行 `initState` 并调用 `setData`，之后运行 `beforeMount`。
初始化保护标记阻止提前触发的 observer 或首次 `setData` 重入初始化。方法中的普通字段读写继续作用于实例。
字段和初始 state 捕获创建时的值；后续 props 更新只更新直接的 props 读取，不会重新执行字段初始化或重置 state。
例如 `snapshot = this.props` 保留初始 props 对象，而渲染中的 `this.props.title` 继续读取当前 props。
Web 即使在首次挂载前调用 `setProps`，也会在首次访问 state 时使用初始 props 执行 `initState`，不会从父构造器提前调用初始化钩子。
小程序只将模板实际读取的 props 字段镜像到宿主数据，原始实例字段保留 `undefined`；镜像对象省略 `undefined` 属性，包含 `undefined` 的镜像数组明确报错。
用于静态模板或样式的普通字段必须保持不可变，直接写入、删除、方法调用或可变对象别名逃逸会报错，
避免视图永久使用过期初值。与 state 共享的字段对象通过对应 data 属性绑定，避免冻结为常量。

App 对每个选中组件分别求值；支持静态可分析的根 props、调用点 props，以及父 state 的初始标量值作为子组件初始化快照。
字段可参与初始 state、文本、标签、静态样式值与动作常量的解析，
state/props 的既有动态绑定继续保留。原生 state 的落点仍只支持字符串、布尔值和有限数字；
对象字段可以提供这些标量或整个初始 state 对象。与最终 state 根共享的字段读取按 state 绑定，
静态样式或动作常量位置不能使用动态 state 别名。模块对象不能作为原生共享 state 根，
可以通过 `{ ...this.defaults }` 显式复制其标量属性。返回 props 对象作为只读 state 根可用；
如果还要修改该 state，应通过 `{ ...this.props }` 等方式显式复制，避免写入共享的 props 根。
原生样式生成范围仍遵循各平台现有能力。

自定义 `constructor`、函数/箭头字段、`new`、有副作用的函数调用、实例字段初始化期间读取 `this.state`，
以及框架/方法保留成员覆盖不属于该子集。原生 App 也不能把嵌套动态 state 对象当作静态 props、样式或动作常量冻结。
无法表示的表达式带源码位置失败，并保留上一版输出；小程序依赖运行时 props 的初始 state 还会在提交宿主前检查 JSON 对象边界。
仅发布声明文件、且已由选中实现完整覆盖的无字段祖先，继续无需提供源码；存在实例字段的声明祖先需要可编译的 `source`。

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
