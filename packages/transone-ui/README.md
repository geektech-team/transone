# transone-ui

跨端 UI 组件库：**一份 TypeScript 源码**，经 [transone-cli](https://www.npmjs.com/package/transone-cli) 静态编译为 Web 与小程序（微信 / 阿里 / 字节）原生产物。

首期组件：`TuButton`、`TuSwitch`、`TuTag`、`TuProgress`、`TuInput`、`TuPopup`（支持 top / right / bottom / left 四向弹出）。

- 运行时：依赖 `transone`（>= 0.1.2，peerDependency）
- 包名：`transone-ui`（无 scope）
- 版本：0.1.0
- 技术栈：Bun + 纯 TypeScript，零运行时依赖（仅依赖 transone 本身）

## 安装

```bash
bun add transone-ui
# 或 npm / pnpm / yarn
```

## 快速上手

```ts
import { Component, createComponent, h } from 'transone';
import { TuButton, TuInput, TuPopup } from 'transone-ui';

class MyPage extends Component {
  protected initState() {
    return { text: '', popupVisible: false };
  }

  protected render() {
    return h('div', { className: 'page' }, [
      createComponent({
        component: TuInput,
        props: { value: this.state.text, clearable: true },
        emitters: { input: (v: string) => (this.state.text = v) },
      }),
      createComponent({
        component: TuButton,
        props: { type: 'primary' },
        children: ['打开弹层'],
        emitters: { click: () => (this.state.popupVisible = true) },
      }),
      createComponent({
        component: TuPopup,
        props: { visible: this.state.popupVisible, position: 'bottom' },
        children: [h('div', {}, ['弹层内容'])],
        emitters: { close: () => (this.state.popupVisible = false) },
      }),
    ]);
  }
}
```

> 组件全部为**受控组件**：状态由父级维护，交互通过 `click` / `change` / `input` / `close` 等自定义事件回传，父级用 `emitters` 订阅。

## 组件 API

### TuButton

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `type` | `default \| primary \| success \| warning \| danger` | `default` | 类型 |
| `size` | `small \| medium \| large` | `medium` | 尺寸 |
| `disabled` | `boolean` | `false` | 禁用，不响应点击 |
| `loading` | `boolean` | `false` | 加载中，内容替换为 `loadingText` |
| `loadingText` | `string` | `加载中…` | 加载文案 |
| `block` | `boolean` | `false` | 块级（占满父容器宽度） |
| `plain` | `boolean` | `false` | 朴素（透明底 + 描边） |
| `round` | `boolean` | `false` | 圆角胶囊 |
| `children` | `Array<VNode \| string>` | — | 按钮内容（插槽） |

事件：`click`（disabled / loading 时不触发）。

### TuSwitch

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `checked` | `boolean` | `false` | 选中态（受控） |
| `disabled` | `boolean` | `false` | 禁用 |
| `activeColor` | `string` | `var(--tu-primary, #1677ff)` | 选中轨道颜色 |
| `size` | `small \| medium \| large` | `medium` | 尺寸 |

事件：`change`，回传切换后的布尔值（`!checked`）。

### TuTag

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `type` | `default \| primary \| success \| warning \| danger \| info` | `default` | 类型 |
| `plain` | `boolean` | `false` | 朴素样式 |
| `round` | `boolean` | `false` | 圆角胶囊 |
| `closable` | `boolean` | `false` | 显示关闭按钮 |
| `name` | `string \| number` | — | 关闭时回传的标识，用于列表删除场景 |

事件：`close`，回传 `name`。

### TuProgress

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `percent` | `number` | `0` | 进度 0–100（越界自动收敛） |
| `showText` | `boolean` | `true` | 显示百分比文字 |
| `textInside` | `boolean` | `false` | 文字置于条内 |
| `strokeWidth` | `number` | `8` | 轨道高度（px） |
| `color` | `string` | `var(--tu-primary, #1677ff)` | 进度条颜色 |
| `trackColor` | `string` | `var(--tu-track, #ebedf0)` | 轨道颜色 |

### TuInput

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `value` | `string` | `''` | 输入值（受控） |
| `placeholder` | `string` | — | 占位文案 |
| `type` | `text \| password \| number` | `text` | 输入类型 |
| `disabled` | `boolean` | `false` | 禁用 |
| `readonly` | `boolean` | `false` | 只读（小程序端映射为 disabled） |
| `maxlength` | `number` | — | 最大长度 |
| `clearable` | `boolean` | `false` | 非空时显示清空按钮 |
| `size` | `small \| medium \| large` | `medium` | 尺寸 |

事件：`input` / `change` / `focus` / `blur` / `confirm`。`input` 与 `change` 回传字符串值（已归一化 Web 的 `e.target.value` 与小程序 `e.detail.value`）；点击清空按钮回传 `''`。

### TuPopup

| 属性 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `visible` | `boolean` | `false` | 是否显示（受控） |
| `position` | `top \| right \| bottom \| left` | `bottom` | 弹出方向 |
| `mask` | `boolean` | `true` | 显示遮罩 |
| `maskClosable` | `boolean` | `true` | 点击遮罩关闭（触发 `close`） |
| `round` | `boolean` | `false` | 面板圆角（底部/顶部弹出时生效） |
| `children` | `Array<VNode \| string>` | — | 面板内容（插槽） |

事件：`close`。隐藏态通过 CSS `visibility` + `transform` + `transition` 实现，`pointer-events: none` 隔离交互；动画时长由主题令牌控制。

## 跨端注意事项

1. **插槽内的动态文本**：小程序端插槽内容编译在父级 wxml 中、绑定父级数据；Web 端插槽内容绑定的是**组件自身**的 state（组件 state 为空时 `{{}}` 渲染为空）。因此**不要在组件 children 插槽里写 `{{xxx}}` 模板插值**，改用模板表达式字符串，例如 `` [`计数：${this.state.count}`] ``（双端都编译/渲染正确），或将动态文本放在页面的直属节点上。
2. **`each()` 返回数组**：作为 children 时直接传入（`h('div', {}, each(...))`），不要再包一层数组字面量（Web 渲染器只铺一层 children）。
3. **子节点类型**：`children` 只接受 `VNode | string`；需要数字时先转字符串（模板表达式自动转换）。
4. **标签映射**：`div` → `view`、`span` → `text`；小程序端 `text` 内不能放 `view`/`slot`，所以 `TuTag` 根节点使用 `div`。
5. **事件回传**：组件用 `emit(name, ...args)` 回传，父级用 `createComponent({ ..., emitters: { name: (v) => this.handle(v) } })` 订阅（对象形式）。小程序端编译为页面的包装方法并绑定 `bind:name`，同名事件自动加序号避免覆盖。
6. **模板插值求值**：组件内部渲染（非插槽部分）不要使用 `{{}}`，一律通过 props 传入数据。
7. **CSS 变量**：小程序端不支持运行时注入 CSS 变量，组件内联默认值保证开箱即用；如需定制，在 `app.wxss` 的 `page` 选择器里覆盖同名变量即可（见下节）。

## 主题定制

设计令牌定义在 `lib/theme.ts`：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `--tu-primary` | `#1677ff` | 主色 |
| `--tu-success` | `#00b578` | 成功色 |
| `--tu-warning` | `#ff8f1f` | 警告色 |
| `--tu-danger` | `#ff3141` | 危险色 |
| `--tu-info` | `#909399` | 信息色 |
| `--tu-text` | `#323233` | 主文字色 |
| `--tu-border` | `#ebedf0` | 边框色 |
| `--tu-track` | `#ebedf0` | 轨道色 |
| `--tu-white` | `#ffffff` | 白色 |
| `--tu-radius-sm/md/lg` | `4/8/12px` | 圆角 |
| `--tu-duration-fast/normal/slow` | `0.15/0.3/0.5s` | 动画时长 |
| `--tu-zindex-popup` | `1000` | 弹层层级 |

- **Web**：调用 `injectTuTheme()`（可在入口执行一次），会向 `<head>` 注入 `style[data-tu-theme]` 默认令牌；传入覆盖对象可自定义：

  ```ts
  import { injectTuTheme } from 'transone-ui';
  injectTuTheme({ '--tu-primary': '#ff6600' });
  ```

- **小程序**：在 `app.wxss` 的 `page` 选择器中覆盖：

  ```css
  page {
    --tu-primary: #ff6600;
  }
  ```

## 包 `source` 字段约定（CLI 编译依赖）

`transone-cli` 编译小程序时，会从 `node_modules/<包>/package.json` 读取 `"source"` 字段定位该包的 TypeScript 入口，再沿 `export` / re-export 链解析组件类的实际文件。因此发布组件库时必须声明：

```json
{
  "name": "transone-ui",
  "source": "./lib/index.ts",
  "peerDependencies": { "transone": ">=0.1.2" }
}
```

> 注意：只有 `source` 指向的入口及其 re-export 链中的类会被静态编译分析；组件类的 `render()` / `initState()` / `initStyles()` 需保持静态可分析（字面量、三元、`&&`、`each` 等受支持语法），方法体独立翻译、不能闭包捕获。

## 开发

```bash
# 构建 dist（类型声明 + Bun.build）
bun run --cwd packages/transone-ui build

# 组件运行时测试（Web DOM 环境）
bun test packages/transone-ui/tests/components.test.ts

# 演示页整页集成测试（覆盖受控数据流）
bun test packages/transone-ui/tests/demo-integration.test.ts
```

演示项目位于 `playground/ui-demo`，覆盖全部组件与受控交互，可分别构建 Web / 微信 / 阿里 / 字节产物：

```bash
bun run --cwd playground/ui-demo build:web        # dist/web
bun run --cwd playground/ui-demo build:weixin     # dist/build/mp-weixin
bun run --cwd playground/ui-demo build:alipay     # dist/build/mp-alipay
bun run --cwd playground/ui-demo build:bytedance  # dist/build/mp-bytedance
```
