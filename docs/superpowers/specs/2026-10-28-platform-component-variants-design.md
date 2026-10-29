# TransOne 业务组件基类与端实现设计

状态：用户已确认，已实施并完成本地验证；未提交或发布，SDK/设备验收未执行。日期：2026-10-28。

2026-10-28 命名修订：按用户最新要求，枚举值统一使用中划线连接；下文替代此前的下划线命名，枚举成员和装饰器名称不变。

## 目标与用户已明确的规则

业务组件共享状态、类型和业务方法，各端通过继承实现展示及交互差异。
页面引用业务组件，编译时根据命令指定的端自动选择对应实现。

用户已明确：框架提供 `web-mobile`、`web-pc` 等端枚举；
`WebMobile` 对应 `web-mobile`，项目使用 `@WebMobile()`。
CLI 初始化项目必须自带可运行的例子。

用户已确认下述完整设计；枚举命名、回退、扫描和编译边界按此实施。

## 公共 API

框架导出 `Platform` 字符串枚举，以及一一对应的类装饰器工厂：

| 枚举成员 | 值 / 新命令 target | 装饰器 | 生成器 |
| --- | --- | --- | --- |
| `Platform.Web` | `web` | `@Web()` | Web |
| `Platform.WebMobile` | `web-mobile` | `@WebMobile()` | Web |
| `Platform.WebPc` | `web-pc` | `@WebPc()` | Web |
| `Platform.MiniprogramWeixin` | `miniprogram-weixin` | `@MiniprogramWeixin()` | 微信小程序 |
| `Platform.MiniprogramAlipay` | `miniprogram-alipay` | `@MiniprogramAlipay()` | 支付宝小程序 |
| `Platform.MiniprogramBytedance` | `miniprogram-bytedance` | `@MiniprogramBytedance()` | 字节小程序 |
| `Platform.MiniprogramXiaohongshu` | `miniprogram-xiaohongshu` | `@MiniprogramXiaohongshu()` | 小红书小程序 |
| `Platform.AppIos` | `app-ios` | `@AppIos()` | SwiftUI |
| `Platform.AppAndroid` | `app-android` | `@AppAndroid()` | Jetpack Compose |
| `Platform.AppHarmony` | `app-harmony` | `@AppHarmony()` | ArkUI |

枚举及平台定义是框架与 CLI 的唯一事实来源；装饰器不维护另一份平台字符串。
支持 TypeScript 标准类装饰器，不依赖 `reflect-metadata`。
本次推荐使用上述固定名称，不同时引入另一套带平台字符串参数的装饰器 API。

新增 `BaseComponent<P, S> extends Component<P, S>`。
它保留现有 Component 生命周期、状态、样式、事件、插槽等契约，不强制迁移已有组件。
业务基类可以使用 BaseComponent，也兼容直接继承 Component 的现有类。
BaseComponent 本身为抽象类；业务基类可以提供默认 render，也可以为抽象类。
逻辑组件引用与可实例化构造函数类型分开，防止为了传递抽象基类而丢失 props 类型检查。

示意 API：

```ts
import { BaseComponent, WebMobile, WebPc, h } from 'transone';

export class CardComponent extends BaseComponent<CardProps, CardState> {
  protected initState(): CardState { return { count: 0 }; }
  protected initStyles(): void {}
  protected increment(): void { this.state.count += 1; }
  protected render() { return h('div', {}, [this.props.title]); }
}

@WebMobile()
export class CardMobileComponent extends CardComponent {
  protected render() { /* 移动 Web 的视图，复用状态与业务方法 */ }
}

@WebPc()
export class CardPcComponent extends CardComponent {
  protected render() { /* PC Web 的视图，复用状态与业务方法 */ }
}
```

业务页面始终使用 `createComponent({ component: CardComponent, props: ... })`。
端实现也可作为明确的组件类使用；显式引用某端类不会再被替换成其他端类。

## 命令、配置与兼容性

```sh
transone dev --target web-mobile
transone dev --target web-pc
transone build --target web-mobile
transone build --target web-pc
transone build --target miniprogram-weixin
transone build --target app-ios
```

`dev` 只接受三个 Web 端，选择小程序或 App 端时明确报错。
`build` 接受枚举中的全部具体端。
`transone.config.ts` 可写 `target: Platform.WebMobile` 作为项目默认值，CLI 优先。
未配置时保留原默认 `web`，不根据 UA 或运行中的窗口尺寸切换实现。

旧的 `mp-weixin`、`mp-alipay`、`mp-bytedance`、`mp-xiaohongshu`、
`app-ios`、`app-android`、`app-harmony` 命令继续工作，并归一化为对应 Platform。
已有 `mp`、`app` 平台配置键保留；无需修改现有配置才能使用新框架。
原有生成器及方言继续复用，新增枚举值不复制生成器。

Web mobile/pc 默认分别写入 `dist/build/web-mobile`、`dist/build/web-pc`，
避免两种视图互相覆盖；已有 Web、MP、App 命令默认输出目录保持兼容。
显式 outDir 继续优先。开发产物使用既有 session/generation 隔离。
库构建不按应用目标裁剪业务组件实现，保留既有 ESM/声明文件契约。

## 选择规则

组件身份由规范化源文件路径与真实类声明确定，不按类名字符串匹配。

1. 业务基类的匹配端实现优先。
2. 没有精确实现时，回退到同族通用 `@Web()` / `@Miniprogram()` / `@App()` 实现（2026-10-29 按用户要求扩展）。通用小程序和 App 是组件标记，构建仍指定具体端。
3. 仍无实现时，使用可实例化的业务基类。
4. 抽象业务基类没有可用实现时，构建失败并指出基类、目标及候选位置。
5. 同一业务基类、同一优先级出现两个不同实现时，构建失败，不依赖 import 顺序。

装饰器应用于具名、可导出的组件子类。一个类可以声明多个端装饰器，
相同类的重复匹配去重，不同类的同目标匹配报错。
如果端实现继承另一个已标注的端实现，它仍属于该实现对应的业务基类家族。
普通、未标注的业务子类拥有自身组件身份，不因继承另一业务类就被其端实现替换。

父类关系必须保留。禁止把 `CardMobileComponent extends CardComponent`
改写成 `CardMobileComponent extends CardMobileComponent`。
类的类型位置、声明名及真实继承边也不能被消费位置的替换误伤。

## 实现发现与共同编译模型

默认对项目 `src/**/*.{ts,tsx}` 做只读 AST 扫描，排除 dist、node_modules 和声明文件。
允许 `components.include` / `components.exclude` 扩展源码扫描范围。
被入口引用的业务基类及其祖先也进入类索引，即使它们位于 src 以外。
扫描发现实现不要求业务页面 import 所有端实现，也不执行未选端模块。

首期覆盖项目源码及显式纳入扫描的源码组件库；不从任意已压缩的第三方 JS
反推已经擦除的装饰器。现有无端装饰器的已安装组件仍按旧路径工作。

共享分析模块建立：逻辑组件、选中实现、继承链、有效成员及各成员的声明来源。
支持同文件/跨文件继承、命名及默认 import、import alias、namespace 引用、
具名 re-export 和 tsconfig paths。循环继承与无法解析的声明必须带文件位置报错。

继承成员必须保留其 owner 模块：父类方法引用的常量、工具函数及 import
按父类文件解析，不按子类文件解析。方法覆盖遵循正常类继承语义。
支持在静态编译范围内使用 `super.initState()` 的对象合并、
`super.initStyles()` 后追加规则及调用父业务方法；超出各端编译子集的表达式明确失败。
子类字段在父构造器调用 initState/initStyles 时尚未初始化，示例不得依赖这种字段。

Web、MP、App 消费同一选择结果，不各自实现一套匹配优先级。

## Web：浏览器、文档执行和样式

在真实组件消费位置绑定选中实现，覆盖 root、嵌套 createComponent、路由组件
及 document.body 中的组件。浏览器打包与文档入口执行采用相同的转换结果。
Web 仍支持通过变量、对象、数组或函数传递组件引用，例如先构造 options，
或由 chooseComponent() 返回 CardComponent，再交给框架。最终传入的构造函数
属于已索引的业务组件家族时，必须使用当前端实现，不只处理直接写在调用点的标识符。
不在构建时执行用户函数，也不要求对任意函数做跨过程数据流分析。
最终构造函数不属于已索引家族时，沿用原有 Web 实例化行为，不因此新增静态编译错误。
实现可使用构建独享、只包含已选实现的绑定表，在实例化入口完成最终解析；
该表必须与文档执行/构建会话隔离，不依赖加载全部端模块完成运行时注册。
不使用进程级 currentPlatform 或全局 Bun 插件注册，防止并行构建和 dev 重建串端。
同一已启动应用的端固定；切换命令端需要重新启动/构建。

只把选中实现及其共享父类、共享依赖加入产物；其他端实现和专用依赖不进入模块图。
静态导入所选实现时必须保留正常模块初始化顺序，不通过提前执行未选模块注册候选。
直接 new 业务类不作为平台自动分发 API；自动分发契约覆盖框架接受组件类型的位置。

源码处理按“端选择和绑定 → 擦除已消费的平台装饰器 → 既有样式分析”组合，
不能假设两个独立 onLoad 回调会自动串联。
未知装饰器继续遵循既有保守样式策略。
保留 document/components CSS 外置、动态样式回退、内容 hash、相对资源安全策略。

dev 新增、删除、改动端实现时重新索引；重复实现等失败保留上一代成功产物。
平台选择及 SSR 的临时产物随会话清理，文档执行不残留旧端类或注册状态。

## 小程序：继承业务逻辑与端模板

根页面和嵌套组件的引用解析后统一选择端实现。
组件标签/缓存使用逻辑组件身份，避免实现类改名影响使用方，
并防止不同目录的同名业务组件互相覆盖。

state、样式、模板、事件、生命周期和模块内联均从共享的有效成员及 owner 取值。
不能只递归 findMethod 或把父类成员直接复制到子类 AST；这会丢失父模块作用域。
四种小程序方言继续使用已有模板、样式、事件及配置生成规则。
未选端的 Web/原生 API 不被解析为小程序逻辑，也不需要伪造运行时环境。

## 原生 App：同一个嵌套 Card 的生成

本次包括根组件和嵌套业务组件的端选择，不能只支持入口第一个类，
也不能要求示例另写一份完全独立的 iOS/Android 页面来规避 Card 替换。

在现有 NativeScreen/NativeNode 之前加入组件组合步骤：
定位根逻辑组件 → 选择实现 → 解析继承成员 → 展开可静态分析的组件节点。
子组件 props 支持字面量及现有 state 绑定；每个静态组件实例拥有独立状态/动作作用域，
降低到 NativeScreen 时生成稳定的名字，避免父子及兄弟同名 state 冲突。
同一组件渲染两次的状态不能共享。

本次补足示例需要的 h/createComponent、静态嵌套、静态 props、简单 state 绑定及按钮动作。
不扩展为任意 JS 执行器：原有原生节点/样式/动作子集仍是边界，
动态组件、任意 JS 表达式、复杂 slots/emitters、异步请求、路由、多页面不在本次范围。
这些写法必须在覆盖旧输出前报出清晰的源码诊断。
继续生成真正的 SwiftUI/Compose/ArkUI 工程，不改为 WebView 或 JS 桥接。

## CLI 初始化与现有示例

扩展现有 `transone create`；“初始化”先不新增另一套 init 命令。
生成至少以下源码，业务页面只引用 CardComponent：

```text
src/main.ts
src/AppComponent.ts
src/components/card/CardComponent.ts
src/components/card/CardWebComponent.ts
src/components/card/CardMiniprogramComponent.ts
src/components/card/CardAppComponent.ts
src/components/card/CardMobileComponent.ts
src/components/card/CardPcComponent.ts
src/components/card/CardWeixinComponent.ts
src/components/card/CardAlipayComponent.ts
src/components/card/CardIosComponent.ts
src/components/card/CardAndroidComponent.ts
transone.config.ts
```

CardComponent 提供共享 props、计数状态和 increment 方法；子类只演示视图/样式差异。
普通 Web、mobile、pc、微信、支付宝、iOS、Android 有可见的端标记。
字节和小红书使用通用小程序实现，Harmony 使用通用 App 实现（2026-10-29 扩展）。
生成 package scripts 包含上述端的 dev/build 例子，tsconfig 与标准装饰器兼容。

新增目录逐文件创建父目录；保持任一模板文件已存在即拒绝全部覆盖的原有保护。
当前 scaffold 引用的已发布 framework 0.4.0 不包含新 API，不能把新示例搭配旧版依赖。
实现需统一框架/CLI/模板的待发布版本，并用本地包验证；本次不自动发布 npm。
playground/counter 的 Card 也改造成该模式，其他现有 UI 组件不强制重命名/迁移。

## 验收

1. 所有枚举值与装饰器对应一致；新旧 target、配置优先级、错误值均有测试。
2. 同一页面只引用 CardComponent，Web mobile/pc 产物分别展示其实现。
   SSR/文档执行与浏览器一致，未选实现及专用依赖标记不出现。
3. 微信/支付宝等生成选中的模板，保留基类 state、事件方法、样式及父模块依赖。
4. iOS/Android/Harmony 的生成工程具有正确 Card 视图；嵌套实例 state 互不覆盖。
5. 继承边、super、抽象基类、同名类、冲突、循环、默认回退、显式引用有契约覆盖。
6. 装饰器与既有静态 CSS/hash 功能共存；开发实现变更、失败保留及产物回收通过验证。
7. 新建项目可 typecheck，能真实生成 Web、小程序和受支持的原生示例产物。
8. 全量测试、包类型检查、框架/CLI 构建、现有与生成示例构建通过。
   生成工程验证与 Xcode/Gradle/DevEco/小程序真机验证分别报告，不混为已验收。

## 留给实施者的选择

类索引是否采用 TypeScript Program/TypeChecker、Web 消费绑定的具体转换方式、
测试 fixture 拆分和内部文件布局可由实施者决定，前提是保持上述行为和安全边界。
不加入新的编译依赖、不默认扫描整个 node_modules，
不通过全端导入或进程全局运行时注册表绕过类身份与会话隔离问题。
