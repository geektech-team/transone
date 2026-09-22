# TransOne 原生 App Target 设计

> 状态：已确认，待实施 · 2026-09-21

## 目标

让 `transone build --target app-ios`、`app-android` 与 `app-harmony`
从同一份 TransOne TypeScript 类组件源码生成可打开、可编译的原生应用工程：
SwiftUI、Kotlin + Jetpack Compose、ArkTS + ArkUI。生成结果不依赖
TransOne 运行时、JavaScript 引擎、WebView 或跨端桥接层。

本次交付先覆盖可验证的静态 UI 子集：单页应用、`view`/`main`/`div` 容器、
`text`/`span`/`p`/`h1` 文本、`button`、初始化 state、`{{state.key}}`
绑定、按钮 `click` 调用同类方法、`initStyles()` 的 class 样式。其余节点或表达式必须
在编译期标明文件、节点和支持范围后失败，绝不生成残缺工程。

## 范围与非目标

包含：三个 App Target 的 CLI/配置接入、统一 App 中间表示、三个原生工程写入器、
静态资源复制、编译器契约测试和 counter playground 端到端快照测试。

不包含：路由、多页面导航、组件嵌套/slots、表单双向绑定、网络请求、动画、原生
插件、App Store/Play/Harmony 发布、调用 Xcode/Gradle/DevEco CLI。原生 IDE 编译属于
各平台工具链责任；本次保证生成工程的目录、清单及源码可被工具链接收。

## 架构

App 构建使用独立于小程序 `MpDialect` 的 `NativeDialect` 协议，原因是原生声明式
UI 没有模板文件/页面 JS/组件 JSON 的共同结构。三个 Target 仍实现既有
`BuildTarget`，因而 `build()`、CLI 和 TargetRegistry 不需要为平台分支。

```text
TransOne TS Component
  -> TypeScript AST 分析
  -> NativeScreen（平台无关的节点、state、action、style）
  -> NativeDialect.generateProject(screen, config)
  -> SwiftUI / Compose / ArkUI 原生工程
```

`NativeScreen` 是受控编译边界，而不是完整 VNode 运行时。AST 分析仅接受已有
`Component` 子类中可静态推导的 `initState()`、`render()`、`initStyles()` 形式；
unsupported 写法使用新的 `nativeError()` 统一错误，包含源文件与可操作原因。
此策略与现有小程序编译器的 `mpError()` 快速失败原则一致。

## 模块边界

| 模块 | 责任 |
| --- | --- |
| `src/app/types.ts` | 定义 `NativeScreen`、`NativeNode`、绑定、样式、动作与 `NativeDialect` 公共模型。 |
| `src/app/analyze.ts` | 从页面入口定位 Component 类，并提取/验证 state、节点树、事件、样式。 |
| `src/app/errors.ts` | 生成带文件位置的 App 编译错误。 |
| `src/app/build-app.ts` | 遍历页面、创建 NativeScreen、清空并写入目标目录、复制 `public/`，并返回 BuildResult。 |
| `src/app/dialects/*.ts` | 每端原生工程布局与源文件字符串生成；不得包含 AST 分析逻辑。 |
| `src/target/app-target.ts` | 将 `AppTarget` 与其 NativeDialect 接到 BuildTarget。 |
| `src/target/registry.ts` | 用真实 AppTarget 替代三个 PlaceholderTarget。 |
| `src/config.ts` / `src/types.ts` | 增加 `app` 的全局/按平台配置并解析独立 outDir。 |

## 公共配置契约

`transone.config.ts` 增加可选 `app` 字段；扁平配置作用于三个 App 目标，按端 map
覆盖当前端。这与 `mp` 的配置语义一致。

```ts
export default defineConfig({
  pages: { '/': 'src/main.ts' },
  app: {
    appName: 'Counter',
    bundleId: 'com.example.counter',
    outDir: 'dist/build/app',
    minPlatformVersion: '16.0',
  },
});
```

`appName` 默认 `TransOne`；`bundleId` 默认 `com.transone.app`；每端默认产物目录为
`dist/build/app-ios`、`dist/build/app-android` 和 `dist/build/app-harmony`。`app-ios`
使用 `minPlatformVersion` 作为 iOS deployment target；Android/Harmony 的具体 SDK 版本
固定在经测试的工程模板常量中，不暴露为首期配置。

`app` 可写为：

```ts
app: {
  'app-ios': { bundleId: 'com.example.counter.ios' },
  'app-android': { bundleId: 'com.example.counter.android' },
  'app-harmony': { bundleId: 'com.example.counter.harmony' },
}
```

扁平字段和目标端 map 不可混写；配置校验报错说明冲突字段。`--out-dir` 对 App
目标同样生效，并覆盖 `app.outDir`。

## 原生生成规则

`NativeNode` 只包含 `container`、`text`、`button` 三种稳定语义，标签归一化发生在
AST 提取期。文本节点由字面量片段与单个 state-path binding 组成；不允许任意 JS
表达式插值。事件只接受 `listeners.click` 中 `this.method()` 或
`() => this.method()`，方法体只允许将 `this.state.<key>` 赋为字面量或做 `+= 1`/
`-= 1`。这让同一动作可安全映射为 Swift、Kotlin 与 ArkTS。

| NativeScreen 概念 | SwiftUI | Compose | ArkUI |
| --- | --- | --- | --- |
| container | `VStack` | `Column` | `Column` |
| text | `Text` | `Text` | `Text` |
| button | `Button(action:)` | `Button(onClick = {})` | `Button().onClick()` |
| state | `@State` | `var x by remember { mutableStateOf() }` | `@State` |
| class style | modifier 链 | `Modifier` 链 | 属性链 |

支持的样式声明：`color`、`backgroundColor`、`fontSize`、`fontWeight`、`padding`、
`margin`、`width`、`height`、`borderRadius`、`textAlign`。单位只接受无单位数字或
`px`，并原样作为逻辑显示单位；不支持的选择器、伪类和单位编译失败。生成器以
确定性的缩进、排序和换行输出，保证快照稳定。

## 三个平台工程契约

- iOS：`<outDir>/TransOneApp.xcodeproj/project.pbxproj`、
  `TransOneApp/TransOneApp.swift`、`TransOneApp/ContentView.swift`、
  `TransOneApp/Assets.xcassets/Contents.json`。工程采用 Swift 5.9、SwiftUI、iOS 16.0。
- Android：`<outDir>/settings.gradle.kts`、根 `build.gradle.kts`、
  `app/build.gradle.kts`、`app/src/main/AndroidManifest.xml`、
  `app/src/main/java/<package>/MainActivity.kt`。工程采用 Kotlin、Compose 和
  `minSdk = 26`。
- HarmonyOS：`<outDir>/AppScope/app.json5`、`AppScope/resources/base/element/string.json`、
  `entry/src/main/module.json5`、`entry/src/main/ets/entryability/EntryAbility.ets`、
  `entry/src/main/ets/pages/Index.ets`。工程采用 ArkTS/ArkUI、API 12。

所有工程复制 `app.publicDir` 到各自原生资源约定目录；首期不在 Node 中引用这些资源，
仅保证资源随产物交付。

## 兼容性与扩展规则

App analyzer 与 Mp compiler 不共用 `CompiledUnit`，但都复用 TypeScript loader、
根 Component 定位、BuildResult、资源复制和 TargetRegistry。未来每增加一个 native
节点或 style 属性，必须：扩展 `NativeNode`/`NativeStyle` 联合类型、为三个 dialect
添加映射、为每端快照及不支持用法测试添加断言。不得把平台判断散落在 analyzer。

平台特有能力以显式 `NativeDialect.capabilities` 和编译期诊断来管理；首期三个端的
能力集相同。禁止悄悄降级为 HTML、WebView 或注入 JS runtime。

## 验收与测试

1. `TargetRegistry` 的三个 `app-*` 项均为 `AppTarget`，不再是 PlaceholderTarget。
2. 每个目标构建 counter fixture 后，`BuildResult.assetsBuilt` 列出相应的原生工程
   文件，且读取到的主界面源码包含 state binding 与点击动作。
3. iOS、Android、HarmonyOS 清单中的应用名、bundle/package 标识来自配置。
4. 无 `app` 配置时，三个目标使用默认目录和默认应用标识；`--out-dir` 能覆盖目录。
5. 不支持的节点、表达式、样式或事件在输出目录写入前失败，并带源文件路径。
6. 全量 `bun test`、`bunx tsc --noEmit`、`bun run build` 与 `git diff --check` 通过。

本仓库不具备三套官方 SDK 的可移植 CI 前置条件，因此 Xcode、Gradle 和 DevEco
构建属于本次以外的手动验证；文档须明确区分“生成工程验证”与“平台工具链验证”。
