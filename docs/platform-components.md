# 业务组件与端实现

框架 0.5.0 与 CLI 0.8.0 提供统一的 `Platform` 枚举和类装饰器。
页面引用业务组件，`dev/build --target` 决定使用哪个端子类。
业务状态和方法放在基类，子类保留真实继承关系，只覆盖需要不同的视图或行为。

```ts
import { BaseComponent, WebMobile, WebPc, createComponent, h } from 'transone';

export class CardComponent extends BaseComponent<{ title: string }, { count: number }> {
  protected initState() { return { count: 0 }; }
  protected initStyles(): void {}
  protected increment(): void { this.state.count += 1; }
  protected render() { return h('p', {}, [this.props.title]); }
}

@WebMobile()
export class CardMobileComponent extends CardComponent {
  protected render() {
    return h('button', {}, ['Mobile: {{count}}'], { click: () => this.increment() });
  }
}

@WebPc()
export class CardPcComponent extends CardComponent {
  protected render() {
    return h('button', {}, ['PC: {{count}}'], { click: () => this.increment() });
  }
}

// 放在页面 render() 中；不用 import 每个端子类来注册。
createComponent({ component: CardComponent, props: { title: 'Card' } });
```

实际项目可将三个类分别放在不同文件。装饰器应用于具名、导出的类；
命名空间导入、import alias、默认导出、具名 re-export 和 tsconfig paths 都可解析。
标准装饰器不要求启用 `experimentalDecorators` 或安装 reflect-metadata。
原有直接继承 `Component` 的组件继续可用，不要求全部迁移到 BaseComponent。

## 枚举与命令

| 枚举 | target | 装饰器 |
| --- | --- | --- |
| `Platform.Web` | `web` | `@Web()` |
| `Platform.WebMobile` | `web-mobile` | `@WebMobile()` |
| `Platform.WebPc` | `web-pc` | `@WebPc()` |
| `Platform.MiniprogramWeixin` | `miniprogram-weixin` | `@MiniprogramWeixin()` |
| `Platform.MiniprogramAlipay` | `miniprogram-alipay` | `@MiniprogramAlipay()` |
| `Platform.MiniprogramBytedance` | `miniprogram-bytedance` | `@MiniprogramBytedance()` |
| `Platform.MiniprogramXiaohongshu` | `miniprogram-xiaohongshu` | `@MiniprogramXiaohongshu()` |
| `Platform.AppIos` | `app-ios` | `@AppIos()` |
| `Platform.AppAndroid` | `app-android` | `@AppAndroid()` |
| `Platform.AppHarmony` | `app-harmony` | `@AppHarmony()` |

```sh
transone dev --target web-mobile
transone dev --target web-pc
transone build --target miniprogram-weixin
transone build --target app-ios
```

项目默认端写在配置中，命令参数优先：

```ts
import { Platform } from 'transone';
import { defineConfig } from 'transone-cli';

export default defineConfig({
  target: Platform.WebMobile,
  components: {
    include: ['shared/components/**/*.ts'],
    exclude: ['src/experiments/**'],
  },
});
```

默认仍为 `web`。`dev` 只支持三个 Web 端；它不会按 UA、窗口尺寸在运行中更换组件。
`web-mobile`、`web-pc` 默认分别输出到 `dist/build/web-mobile`、`dist/build/web-pc`。
旧的 `mp-*`、`app-*` 命令、平台配置键和输出目录继续兼容，显式 `--out-dir` 优先。
`build --library` 保留可发布的组件实现，不按应用端裁剪。

## 选择与继承

使用 `transone build --target web-pc --report-components` 查看组件、实现来源与匹配原因。
单独读取报告可调用 CLI 包的 `reportComponents`，详见[诊断与清理](./reliability.md)。

选择优先级为：精确端实现 → 同族通用实现 → 可实例化业务基类。

| 平台族 | 通用装饰器 | 适用目标 |
| --- | --- | --- |
| Web | `@Web()` | web / web-mobile / web-pc |
| 小程序 | `@Miniprogram()` | 微信 / 支付宝 / 字节 / 小红书小程序 |
| App | `@App()` | iOS / Android / 鸿蒙 |

`@Miniprogram()` 与 `@App()` 是组件匹配标记，`Platform` 枚举继续表示具体构建目标。
构建命令仍指定 `miniprogram-weixin`、`app-ios` 等具体端；不接受 `--target miniprogram` 或 `--target app`。
通用层不会跨平台族回退；同一优先级的通用实现冲突也会报错。
具体端需要复用通用实现的方法时，应显式继承通用类；选择过程不自动合并多个类。

```ts
import { Web, Miniprogram, App } from 'transone';

@Web()
export class CardWebComponent extends CardComponent {
  protected render() { return h('p', {}, ['Web: {{count}}']); }
}

@Miniprogram()
export class CardMiniprogramComponent extends CardComponent {
  protected render() { return h('view', {}, ['小程序: {{count}}']); }
}

@App()
export class CardAppComponent extends CardComponent {
  protected render() { return h('main', {}, [h('p', {}, ['App: {{count}}'])]); }
}
```

三个通用装饰器均从 `transone` 或 `transone/platform` 导入。

抽象业务基类也可用作逻辑引用，但当前端必须有具体实现。
同一业务基类同一端有两个不同实现时，编译报错并显示来源，不依赖文件顺序。
未被页面使用的抽象辅助类不会使构建失败。

如果端子类再继承一个已标注的端子类，两者仍属于原业务家族。
普通未标注的业务子类拥有自己的组件身份。直接引用某个实现类表示显式选择，
不会再次被其他端类替换；直接 `new CardComponent()` 不在自动分发契约中。

Web 的 root、嵌套组件、路由和 document.body 共用同一个实例化解析入口。
通过变量、options、数组或函数返回业务组件后再交给框架，也会按实际构造函数解析。
浏览器产物与文档执行使用相同的端选择；其他端实现及其专用依赖不进入当前产物。

跨文件继承保留成员声明来源，父类常量、工具函数和 import 不会误用子类作用域。
小程序/原生编译支持其静态子集内的 `super`，超出子集的语句会明确报错。
Component 构造器会调用 initState/initStyles，子类字段此时尚未初始化；
不要在这两个钩子里读取依赖子类字段初始化的值。

## 扫描、开发与样式

默认只读扫描 `src/**/*.ts` 和 `src/**/*.tsx`，跳过声明文件、dist 和 node_modules；
`components.include` 可补充共享源码目录，`exclude` 可排除实验文件。
入口依赖及业务祖先也会被解析。源码分析不会执行未选端模块。
已压缩第三方 JS 中被擦除的装饰器不能恢复；需要提供可扫描的源码。

watch 模式会重新索引新增、修改和删除的实现。冲突等错误会保留上一代成功页面；
修正后再发布新产物。不同 Web 端的文档执行和开发会话相互隔离。

平台装饰器在选择之后擦除，再执行既有静态 CSS 分析。
可安全提取的固定组件/文档样式继续生成 CSS，动态或不安全的样式保留运行时处理；
JS/CSS hash 和相对资源路径规则保持原有行为。

## 原生 App 边界

App 生成器支持单页内静态嵌套组件，每个组件实例具有独立的 state 与动作。
示例使用 `h`、`createComponent`、静态 props、简单父 state 绑定和按钮计数；
生成 SwiftUI、Compose 或 ArkUI 工程，不引入 WebView 或 JS 运行时。

原有节点、内联样式和有限状态动作仍是编译边界。不支持动态组件、复杂 slots/emitters、
任意 JS 表达式、异步请求、原生多页路由或任意 CSS 规则。
现有原生生成器会校验并携带内联 style，但尚未输出对应的原生样式修饰链；
本轮组件选择和状态组合不代表完整布局样式已对齐。
共享基类若包含 App 不支持的 initStyles 规则，可由 App 子类覆盖为空并使用受支持的内联样式。
不支持的写法会在覆盖旧输出前给出源码诊断。
非空生命周期钩子（包括 beforeMount、onPropsChange 和错误边界）同样会被拒绝，
避免业务副作用在原生生成时被静默丢弃；App 子类可以显式覆盖为空。

生成工程的验证不等于 Xcode、Gradle、DevEco 或设备验收，仍应使用目标工具链验证。

## 初始化示例

`transone create` 生成 AppComponent、CardComponent、三类通用实现与六个具体端实现、配置和构建脚本。
业务页面只引用 CardComponent；点击计数的方法来自同一个业务基类。
字节、小红书示例回退到通用小程序实现，Harmony 示例回退到通用 App 实现。
已有任一模板文件时会拒绝整次覆盖，包括深层 Card 文件。

```sh
transone create
bun install
bun run dev:mobile
bun run build:pc
bun run build:weixin
bun run build:ios
```
