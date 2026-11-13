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
卸载会取消该轮尚未执行的响应式更新，包括已经进入刷新批次的任务；重新挂载后产生的新更新仍正常调度，旧任务不会重复触发更新钩子。
如果更新钩子或 `render` 主动卸载、重新挂载了当前实例，原更新会在阶段边界停止，不再提交旧节点或继续调用该轮后续钩子。

状态初始化失败会保存原始异常，后续读取继续抛出，避免重复创建部分资源；
`initState` 内递归读取 `this.state` 会给出明确错误，应直接使用局部变量或 `super.initState()` 的返回值。
显式赋值 `state` 仍遵循现有可写属性行为，可以替换失败的懒初始化入口。
`initState` 内调用 `setProps` 的更新会在成功或抛错后保留，并合并到初始化前最新的 props，
不会因恢复初始 props 上下文而丢失外部已经传入的属性。
挂载期间的初始化错误沿既有错误边界传播，并清理已创建的资源；
在挂载前主动读取状态时，异常由调用者接收，放弃实例时仍应调用 `unmount()` 释放其资源。

`initStyles`、`beforeMount` 或 `render` 中再次挂载同一实例会明确报错，避免递归初始化；
已经挂载的实例保持幂等，包括在 `onMounted` 中再次调用挂载。
挂载过程中调用 `unmount()` 会取消本次挂载：当前同步阶段结束后清理完整子树和已登记资源，
再通过既有错误边界报告取消。它不会返回 `null` 节点或在清理后继续激活资源。
清理完成后可以重新挂载；已经成功创建的 state 保留，样式和本次挂载资源重新建立。

如果在字段初始化器或父类自定义构造器中主动读取 `state`，初始化会在当时发生。
这类代码只能依赖已经完成初始化的字段，不能依赖派生类尚未执行的字段初始化或构造器语句。
小程序和原生 App 继续通过源码静态分析生成目标代码，实例字段遵循下面的共同求值规则。

## 小程序与 App 实例字段

小程序四端和原生 App 三端共用字段分析，不执行业务模块来求值：

- 先执行祖先类字段，再执行子类字段；每类内部保持声明顺序。祖先字段捕获当时值，`initState` 读取最终覆盖后的字段。
- 普通无初始化字段创建 `undefined` 自有属性，覆盖祖先同名值；`declare` 与 `static` 不会重置实例字段。
- 支持字符串、有限数字、布尔值、null、undefined、数组、对象、模块 `const`、字段引用、静态属性读取、纯算术/比较/条件/模板字符串及短路表达式。
- 支持在字段和 `initState` 中读取 `this.props`，包括对象/数组属性、`??` 默认值和对象展开。先取得该实例的初始 props，再按父到子顺序初始化字段，最后执行 `initState`；缺失值与 `0`、`false`、空字符串分别处理。
- 字面量数组和对象在每个实例中重新创建；字段之间的对象别名保留。模块对象的写入、调用和逃逸不能被当作不可变常量折叠。

多层继承可以直接 `return super.initState()`，中间没有覆写该方法的类不改变调用来源。
直接透传保留祖先返回对象与实例字段的引用关系；`{ ...super.initState() }` 会创建新的根对象，并保留其嵌套值引用。
同一次初始化中多次调用 `super.initState()` 仍分别执行纯求值，不会把方法局部对象缓存为跨调用共享对象。

连续可选链遵循 JavaScript 的短路规则，例如缺少 `config` 时，
`this.props.config?.nested.count ?? 5` 得到 `5`；若 `config` 存在而 `nested` 缺失，普通的 `.count` 仍报错。
括号会断开短路链，`(this.props.config?.nested).count` 不会把后面的普通访问变成可选访问。
纯求值或模块对象校验失败不会进入成功缓存，同一分析上下文中再次求值仍执行完整校验。

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
没有实例字段的组件也在上述数据可写阶段执行 `beforeMount`，不在微信等平台的 `created` 中调用 `setData`。
挂载钩子内的 `setData` 重入、同一轮重复挂载和重复卸载不会重复执行生命周期；真正卸载再挂载时重新执行挂载钩子，保留已成功初始化的字段和 state。
支付宝只有在 `beforeMount` 成功后才进入 `onMounted`，失败后可重试本次挂载，卸载后的迟到回调不会重新激活组件。
字段定义、`initState`、初始数据校验或首次 `setData` 同步失败时，会恢复声明字段的原属性描述符，
移除本次新增的声明字段，并恢复 JavaScript 侧的 `data` 对象图、框架内部槽和原 `setData` 属性。
恢复保持既有数组、对象及别名的引用关系；重试会重新读取当前 props，且不会叠加 `setData` 包装。
业务维护的 `retry`、`attempts` 等控制标记和外部副作用不在回滚范围。
如果宿主不可配置属性阻碍完整恢复，仍抛出原始异常；可附加的恢复失败记录在异常的 `cleanupErrors` 中。
这里的恢复限于同步 JavaScript 状态，不能撤回已经发往原生渲染桥的异步 UI 更新。
读取原生 props 时拒绝访问器属性，不执行 getter 来获取或校验初始值。
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

## 异步回调与挂载作用域

组件提供可选的受保护方法 `guardCallback(callback)`，把续体绑定到创建它的资源作用域。
卸载或初始化失败会使对应作用域失效，重新挂载使用新的作用域；已成功初始化的 state 仍按既有规则保留。
`state`、`setProps`、`setState` 的用法和签名不变，业务可以在方法或钩子中显式保护异步结果提交：

```ts
// loadCount 是业务已有的 Promise<number> 函数。
protected beforeMount() {
  const commit = this.guardCallback((value: number) => {
    this.setState({ count: value });
  });
  return loadCount().then(commit);
}
```

使用 `await` 时，也先创建 `commit`，再在 `await` 之后调用它。
包装保留调用时的 `this` 和参数，不额外改变接收者；过期调用及过期返回结果得到 `undefined`，
因此普通返回值类型和 Promise 的解析值类型都包含 `undefined`。
guard 保护回调入口和返回结果，不能中断已经开始执行的 async 函数：
该函数在 `await` 后直接使用原 `this` 写 state，仍可能影响重新挂载后的组件。
应保护提交动作本身，并结合现有 `onDispose`、AbortSignal 或业务取消机制管理请求和其他外部工作。

定时器和请求的成功、失败、收尾回调都可能迟到；凡是写状态的 `then`、`catch`、`finally`
回调，都应在开始等待前创建 guard。不要等旧请求完成后再创建 guard，那时绑定的是新的挂载作用域。
取消是释放外部工作，guard 是隔离迟到提交，两者应配合使用；取消请求不能撤回已经完成的适配器结果，
也不会中断响应拦截器返回的任意 Promise。Web 的清理函数本身应直接执行取消，避免用已失效的 guard 包住清理。

```ts
protected onMounted() {
  const controller = new AbortController();
  const commit = this.guardCallback((count: number) => this.setState({ count }));
  const fail = this.guardCallback(() => this.setState({ failed: true }));
  const finish = this.guardCallback(() => this.setState({ loading: false }));
  this.onDispose(() => controller.abort());
  // loadCount 接收业务已有的 signal，清理时取消请求。
  return loadCount(controller.signal).then(commit).catch(fail).finally(finish);
}
```

返回的嵌套 Promise 和 thenable 按 Promise 规则同化，最终结果投递时再次核对原作用域；
thenable 的 `then` getter 只读取一次，保留调用接收者和首次完成结果。
这不会取消 thenable 自身的执行，其中的业务状态提交也需要显式 guard。
框架重复包装、跨组件同步调用和直接等待内层 guard 返回结果时，会保留已分发错误的来源，
避免外层再次进入错误边界；独立调用即使复用同一个错误对象，也各自处理。

Web 自动保护组件声明的 DOM props/listeners、子组件 emitters 和模型输入回调入口。
emitters 按声明回调的父组件作用域归属；模型输入在解析前和提交前检查 binding 是否仍有效。
活动回调的同步异常和 Promise 拒绝进入调用时保存的祖先错误边界链，
祖先卸载、换代或修改父链后，旧错误不会转送到新的挂载关系。
无边界处理的同步异常继续抛出，未处理的异步异常记录日志；边界自身抛错时同时保留原错误和边界错误。

Web 会观察生命周期钩子返回的 Promise，挂载本身保持同步，不等待异步钩子完成。
活动的异步生命周期失败经原边界链处理，并只清理仍属于该作用域的实例；
卸载后的迟到拒绝会被消费，不进入新挂载的边界。`onErrorCaptured` 仍是同步钩子，
使用 `false` 表示已处理，使用 `true` 或 `undefined` 继续传播，不使用异步返回值决定处理结果。
卸载钩子和资源清理函数返回的 Promise 不阻塞卸载，其拒绝记录日志，不转入新组件的错误边界。

小程序守护 `setData` completion 回调、observer 和生命周期返回结果，跳过已经失效的 observer 入口；
方法与钩子中的 `this.guardCallback(...)` 会编译成对应的作用域守护，静态组件和页面同样适用。
仍活动的异常保持宿主的抛出或 Promise 拒绝语义，不引入 Web 错误边界语义。
小程序不能在纯实例字段初始化器中调用 `guardCallback`；业务应在方法或生命周期钩子中创建受保护续体。
这些保护不扩展原生 App 的异步请求或生命周期编译能力，也不会自动取消任意业务 Promise 的执行。

## 方法装饰器

从 `transone` 导入标准方法装饰器 `Bind`、`Delay`、`Debounce`、`Emit`、`WatchProps`，沿用当前项目的标准
decorators 配置，不需要 `experimentalDecorators` 或 `reflect-metadata`。

```ts
import { Bind, Debounce, Delay } from 'transone';

// 以下方法位于 Component 子类中。
@Bind()
protected onInput(value: unknown): void {
  this.setState({ text: String(value) });
}
// render 中可以直接使用 emitters: { input: this.onInput }。

@Debounce(1600)
protected hideToast(): void {
  this.setState({ visible: false });
}

@Delay(300)
protected showHint(): void {
  this.setState({ hint: true });
}
```

| API | 调用语义 | 平台 |
| --- | --- | --- |
| `@Bind()` | 绑定当前实例，保留参数和返回值；同一实例的回调引用稳定 | Web、四方小程序；App 按原生动作方法处理 |
| `@Delay(ms)` | 每次调用各自延迟执行，调用立即返回 `undefined` | Web、四方小程序 |
| `@Delay(ms, {replace: true})` | 替换本方法尚未执行的任务，仅保留最后一次调用的参数 | Web、四方小程序 |
| `@Debounce(ms)` | 尾部防抖，连续调用重新计时，执行最后一次 | Web、四方小程序 |
| `@Emit(eventName)` | 成功执行同步方法后发送自定义事件；保留原返回值 | Web、四方小程序的自定义组件、原生 App |
| `@WatchProps(key, { immediate?: boolean }?)` | 同步监听单个顶层 prop，接收新值和旧值 | Web、四方小程序、原生 App |

```ts
import { Component, Emit, WatchProps, h } from 'transone';

class ValueEditor extends Component<{ value: number }, { draft: number }> {
  protected initState() { return { draft: this.props.value }; }
  protected initStyles() {}

  @Emit('change')
  public commit(value: number): number {
    this.setState({ draft: value });
    return value;
  }

  @WatchProps('value', { immediate: true })
  protected receive(value: number, previous: number | undefined): void {
    if (value === previous) return;
    this.setState({ draft: value });
  }

  protected render() {
    return h('button', {}, [String(this.state.draft)], {
      click: () => this.commit(this.state.draft + 1),
    });
  }
}
// 父组件通过 emitters: { change: (value) => ... } 接收事件，
// 与手动 this.emit('change', value) 使用同一通道。
```

`Emit` 必须显式指定非空事件名。返回 `0`、`false`、`null`、数组或对象时，整个返回值作为
一个 payload；只有返回 `undefined` 时才转发方法原参数。方法抛错时不发送事件。
它只支持同步方法，不等待 Promise；JavaScript 绕过类型检查返回 thenable 时会报错，且不发送事件。
事件名不会自动从方法名推导，也不会自动转换大小写。

`WatchProps` 用 `Object.is` 比较新旧值，不做深层监听；原地修改对象内部字段不会通知，
换成新对象引用才会通知。默认不在首次挂载时调用。开启 `immediate` 后，每次挂载在
`beforeMount` 之后、`onMounted` 之前调用一次，旧值为 `undefined`。
挂载前的 props 更新只更新初始基线；挂载后的 `setProps` 提交 props 后同步通知，
不随 `setState` 或重渲染调用。原有 `onPropsChange` 钩子的时机保持不变。
小程序宿主也通过原生 props observer 进入同一比较流程，字段缺省值及事件名仍需遵守宿主规则。

监听方法中的 `setProps` 会排入通知队列，当前批次中的每个监听器收到相同快照的参数；
卸载会终止旧批次，重新挂载使用新的基线。监听失败不会重复执行已经消费的批次，
后续 props 更新仍可恢复。方法必须同步返回 `void`，异步提交继续使用 `guardCallback`。
两种装饰器都会绑定当前实例；可与单个 `Bind` 组合，不与彼此或 `Delay` / `Debounce` 组合，
小程序和原生 App 不支持这两种方法的重载，装饰器参数必须能静态求值；CLI 不代替 TypeScript 类型检查。
继承沿用已有装饰器模型：未覆盖的方法保留声明，覆盖方法需要重新添加装饰器；
显式 `super.method()` 只复用父类业务体，不额外触发父类装饰行为，因此外层 `Emit` 只发送一次。
同一实例中的监听方法按父类到子类、每层声明顺序执行；覆盖方法在子类所处位置参与排序。
事件分发使用开始时的监听器快照；分发期间注销的监听器会跳过，新注册或重渲染替换的
监听器从下一次事件开始接收，避免同步重渲染或错误边界恢复时重复处理同一事件。
卸载重挂载会终止旧分发，旧回调入口也不会进入新作用域。
监听器身份按有效注册区分：重复 `on(event, fn)` 保持去重；`off` 后重新注册同一个函数会创建
新注册，旧事件快照不会提前调用它，旧 unsubscribe 也不会取消新注册。

小程序页面没有自定义组件事件通道，使用 `Emit` 同样会明确报错；页面可通过 `setProps` 更新
`rootProps` 对应的 props 并触发 `WatchProps`。
组件手动更新 props 后，父级确认同一引用会推进原生快照；之后父级再切回原引用仍是有效更新，
不会被当作旧的渲染投影反馈丢弃。重复确认不重复通知，重新挂载使用当前原生 props 建立基线。
小程序父 props 按提供的 own keys 浅合并到已提交的逻辑 props，省略的本地字段与共享引用保留，
显式 `undefined` / `null` 则覆盖对应键。原生确认快照只记录实际传入的原生值，避免把逻辑本地字段
当成新的父输入反复通知；同一实例卸载期间收到的新 props packet 在重挂载时也按此规则合并。
原生 props observer 在执行监听器前捕获作用域；监听器或发布过程同步卸载重挂载后，旧
observer 的发布、`onPropsChange` 和错误尾部均停止。同一作用域内监听失败仍会发布最终 props，
并保留监听与发布的聚合错误。
手动 `setProps` 的发布与错误尾部同样保留入口作用域。父组件的原生事件接收器按挂载及
初始化尝试缓存，保留的旧 native callback 不会通过新的装饰方法进入新作用域；重新查找
接收器会取得当前入口，同一挂载内引用保持稳定。
支付宝自定义组件事件按[官方回调 props 契约](https://miniprogram.alipay.com/docs/miniprogram/mpdev/framework_custom-component_create-custom-component_method-and-attribute)
生成发射、模板绑定与父处理器适配；普通 `this.emit` 和 `@Emit` 共用相同传输，事件名、参数数量、
对象与数组引用保持不变。内部回调名自动编码，避免不同大小写或特殊字符的事件名冲突。

iOS、Android、鸿蒙 App 会生成对应的 Swift、Kotlin、ArkTS 同步运行时，支持子组件事件参数传到
父组件处理方法、父 state 的动态 props 绑定、手动 `setProps` 和挂载范围内的监听队列。
显式 `setProps` 同步提交并通知；父 state 引起的 props 变化在当前原生动作结束后统一比较，
不会因为不相关的 state 变化重复调用监听器。父组件确实重新渲染时会重新提交绑定，恢复子组件
的手动 props 覆盖，即使绑定值与上次相同；没有触发父渲染的内部扫描保持覆盖，根组件自身
的手动 props 也会保留。
恢复按父组件本轮提供的键浅合并，未提供的子组件本地 props 字段和共享引用继续保留。
同一组件的监听器重入更新会排在当前批次之后；事件链显式更新另一个组件的 props 时，
会同步完成该组件的监听通知。后续叶组件异常不会清掉祖先组件已经完成的通知；
这不会提前发布当前监听批次中待提交的父 state 绑定。
挂载失败、监听失败后仍可恢复，卸载会使旧原生事件入口失效；重新挂载保留 state 并重建监听基线。
作用域保护针对回调入口、通知队列和返回结果，不会强行中断已经进入执行的同步业务方法。

原生路径保留静态组件树及纯实例初始化约束，方法体支持普通参数、局部变量、条件、赋值、
方法调用与返回。事件 payload 和动态 props 支持字符串、数字、布尔值、`null`、`undefined`、
普通对象和数组，可嵌套组合，支持浅展开、属性与索引读写、数组 `length` 和稀疏项。
事件传递不隐式克隆，对象和数组比较引用身份；同一对象的内部字段修改不触发顶层监听，
替换为新引用才触发。通知保留旧值与新值的引用，后续对该对象的修改也会反映在引用中。

同一 App 内的初始对象别名保持一致，不同 App 运行时的数据图各自初始化，不会写穿编译结果或
另一实例。方法中的对象、数组字面量每次执行创建新引用；render 中的复合 props 按实际依赖和
props 提交更新，不会因为内部比较反复分配而无限触发监听。`undefined`、稀疏项和共享子对象
均通过原生容器保存。依赖跟踪记录实际读取的属性及其写入版本：同一动作内 A→B→A 仍会
完成一次已触发的渲染，数组索引写入沿用 Web 的 `length` 失效规则。对象展开只跟踪已有键，
数组迭代跟踪长度与索引；新增未读取键、普通数组属性或把稀疏项补成 `undefined` 不会误触发。
`String` / `Number` 和相关运算会跟踪其数组转换读取，包括嵌套数组。直接传递对象引用仍保持浅层语义。
父组件没有触发渲染时，不会因为内部扫描而重新发布子 props；重新挂载则重新创建渲染字面量，
重建监听基线。旧调用的嵌套深度不会阻塞新挂载的 props 提交。相关数据
通过原生引用容器保存，不经 JSON 往返。Swift 的字符串数据同时保留 UTF-16 单元，以免
索引、对象字符串展开或拼接时丢失 surrogate 信息。

原生数据支持范围是普通数据对象和数组，不执行 getter、对象方法、函数、Date/Map/Set 等
自定义实例、异步代码或任意 JavaScript。可用逐级 `?.` 读取可空成员；当前不接受
`a?.b.c` 这种后续普通链访问，应明确写出每一级的可选访问。`throw` 仅支持内置 `new Error(...)`。
默认参数、解构参数、剩余参数和局部变量遮蔽也会明确报错；TypeScript 的显式 `this` 参数会被正确擦除。
仅用于纯初始化的静态对象 props 仍可作为字段和初始 state 的快照输入；进入运行时的对象通过共享引用图传递。
不能编译的表达式、参数形式或装饰器会带源位置报错，构建失败保留上一版输出；CLI 不会执行用户装饰器表达式。
旧的静态 App 不会仅因升级而切换为新运行时；没有继承框架组件的旧式独立分析入口仍保持原限制。

`Delay` / `Debounce` 自动绑定实例，通常无需再加 `Bind`；需要组合时两种书写顺序均可。
不同实例、不同方法的任务互不影响。装饰器初始化只登记方法，不读取 state 或执行业务；
调度方法的回调按资源作用域缓存，卸载、挂载失败时取消定时器。即使宿主队列保留了旧回调，
它也不能在重新挂载后执行或重新安排任务。新的挂载会取得新的调度入口。
`Bind` 只负责接收者绑定，不替代 `guardCallback` 的异步续体保护。
组件会在派生字段求值前安装回调入口，可以在字段中保存方法引用；小程序仍沿用不支持函数字段的纯初始化子集。
普通类的 `Bind` 依赖编译器的标准装饰器初始化顺序：当前 Bun 直接执行普通类时，
字段提前保存方法可能早于装饰器初始化，应在构造器体或构造完成后取得绑定回调。

延迟参数必须是有限的非负数字；小程序编译时还必须能静态求值。
调度方法采用同步 `void` 返回契约，不支持直接装饰 `async` 或依赖返回值的方法。
小程序编译器还不支持调度方法重载；`Bind` 保留方法重载。
它们适合事件响应、布局更新、延迟隐藏等动作；不会返回一个可以等待任务完成的 Promise。
已开始的请求不会因防抖或卸载而自动中断，异步提交仍应使用 `guardCallback` 和显式取消机制，
同一挂载内的多个请求还需由业务决定取消或结果版本规则。

仅支持普通实例方法，包括 TypeScript 的 `private` / `protected` 方法；不支持静态方法、
ECMAScript `#private` 方法、访问器、字段或框架初始化/渲染/生命周期钩子，也不允许重复的
`Bind` 或多个调度装饰器。现有小程序和 App 的纯字段初始化限制继续适用。
小程序、App 对被编译代码上的未知方法装饰器给出错误，避免生成时悄悄丢失其行为。
原生 App 当前没有定时动作编译能力，使用 `Delay` / `Debounce` 会明确报错并保留上一版输出。

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
