# transone-ui

**English** · [简体中文](./README.zh-CN.md)

Cross-platform UI component library: **one TypeScript source** statically compiled by [`transone-cli`](https://www.npmjs.com/package/transone-cli) into Web and mini-program (WeChat / Alipay / ByteDance) native output.

17 controlled components in five groups:

- **Basic**: `TuButton` — button with type / size / loading / plain / round variants
- **Feedback**: `TuToast` (top / center / bottom toast), `TuModal` (confirm dialog), `TuActionSheet` (bottom action sheet)
- **Form**: `TuCheckbox` (custom checkbox), `TuRadio` (custom radio), `TuSearchBar` (search bar), `TuInput` (input), `TuSwitch` (switch)
- **Display**: `TuBadge` (badge, renders `max+` beyond the cap), `TuCell` (cell), `TuEmpty` (empty state), `TuTag` (tag), `TuProgress` (progress bar)
- **Navigation**: `TuTabs` (tabs), `TuNavbar` (navbar), `TuPopup` (top / right / bottom / left popup)

All components are **fully controlled**: state lives in the parent; interactions are reported back through custom events (`click` / `change` / `input` / `close` ...) that the parent subscribes to via `emitters`. See the docs site (`docs/` or after `npm i transone-ui`) and the `playground/ui-demo` demo for API details and usage.

- Runtime: depends on `transone` (>= 0.1.2, peer dependency)
- Package: `transone-ui` (unscoped)
- Version: 0.4.0
- Stack: Bun + pure TypeScript, zero runtime dependencies (only depends on `transone` itself)

## Install

```bash
bun add transone-ui
# or npm / pnpm / yarn
```

## Quick start

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
        children: ['Open popup'],
        emitters: { click: () => (this.state.popupVisible = true) },
      }),
      createComponent({
        component: TuPopup,
        props: { visible: this.state.popupVisible, position: 'bottom' },
        children: [h('div', {}, ['Popup content'])],
        emitters: { close: () => (this.state.popupVisible = false) },
      }),
    ]);
  }
}
```

## Component API

### TuButton

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | `default \| primary \| success \| warning \| danger` | `default` | Button variant |
| `size` | `small \| medium \| large` | `medium` | Size |
| `disabled` | `boolean` | `false` | Disabled; does not respond to clicks |
| `loading` | `boolean` | `false` | Loading; content replaced by `loadingText` |
| `loadingText` | `string` | `加载中…` | Text shown while loading (default text is Chinese; override as needed) |
| `block` | `boolean` | `false` | Block-level (full parent width) |
| `plain` | `boolean` | `false` | Plain style (transparent background + outline) |
| `round` | `boolean` | `false` | Pill-shaped corners |
| `children` | `Array<VNode \| string>` | — | Button content (slot) |

Events: `click` (not fired when `disabled` / `loading`).

### TuSwitch

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `checked` | `boolean` | `false` | Checked state (controlled) |
| `disabled` | `boolean` | `false` | Disabled |
| `activeColor` | `string` | `var(--tu-primary, #1677ff)` | Track color when on |
| `size` | `small \| medium \| large` | `medium` | Size |

Events: `change`, reports the toggled boolean value (`!checked`).

### TuTag

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `type` | `default \| primary \| success \| warning \| danger \| info` | `default` | Variant |
| `plain` | `boolean` | `false` | Plain style |
| `round` | `boolean` | `false` | Pill-shaped corners |
| `closable` | `boolean` | `false` | Show a close button |
| `name` | `string \| number` | — | Identifier reported on close, for list-removal scenarios |

Events: `close`, reports `name`.

### TuProgress

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `percent` | `number` | `0` | Progress 0–100 (clamped automatically) |
| `showText` | `boolean` | `true` | Show the percentage text |
| `textInside` | `boolean` | `false` | Text inside the bar |
| `strokeWidth` | `number` | `8` | Track height (px) |
| `color` | `string` | `var(--tu-primary, #1677ff)` | Bar color |
| `trackColor` | `string` | `var(--tu-track, #ebedf0)` | Track color |

### TuInput

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `value` | `string` | `''` | Input value (controlled) |
| `placeholder` | `string` | — | Placeholder text |
| `type` | `text \| password \| number` | `text` | Input type |
| `disabled` | `boolean` | `false` | Disabled |
| `readonly` | `boolean` | `false` | Read-only (maps to `disabled` on mini-program targets) |
| `maxlength` | `number` | — | Max length |
| `clearable` | `boolean` | `false` | Show a clear button when non-empty |
| `size` | `small \| medium \| large` | `medium` | Size |

Events: `input` / `change` / `focus` / `blur` / `confirm`. `input` and `change` report a normalized string (Web `e.target.value` and mini-program `e.detail.value` are unified); clearing the input reports `''`.

### TuPopup

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `visible` | `boolean` | `false` | Whether shown (controlled) |
| `position` | `top \| right \| bottom \| left` | `bottom` | Popup direction |
| `mask` | `boolean` | `true` | Show the mask |
| `maskClosable` | `boolean` | `true` | Close on mask click (fires `close`) |
| `round` | `boolean` | `false` | Rounded panel (applies to bottom / top popups) |
| `children` | `Array<VNode \| string>` | — | Panel content (slot) |

Events: `close`. Hidden state is implemented with CSS `visibility` + `transform` + `transition`, with `pointer-events: none` isolating interactions; animation duration is driven by theme tokens.

## Cross-platform notes

1. **Dynamic text in slots**: on mini-program targets, slot content is compiled into the parent's wxml and bound to the parent's data; on Web it binds to the **component's own** state (empty component state renders `{{}}` as empty). Therefore **do not write `{{xxx}}` template interpolation inside component `children` slots** — use template expression strings such as `` [`count: ${this.state.count}`] `` (compiles / renders correctly on both), or place dynamic text on page-level nodes.
2. **`each()` returns an array**: pass it directly as children (`h('div', {}, each(...))`) — do not wrap it in another array literal (the Web renderer only flattens one level of children).
3. **Child node types**: `children` only accepts `VNode | string`; convert numbers to strings first (template expressions do this automatically).
4. **Tag mapping**: `div` → `view`, `span` → `text`; on mini-program targets `text` cannot contain `view` / `slot`, so `TuTag` uses a `div` root.
5. **Event reporting**: components report with `emit(name, ...args)`; the parent subscribes via `createComponent({ ..., emitters: { name: (v) => this.handle(v) } })` (object form). On mini-program targets this compiles to wrapper methods bound with `bind:name`; same-name events are auto-suffixed to avoid collisions.
6. **Template interpolation evaluation**: inside component rendering (non-slot parts), avoid `{{}}`; always pass data in through props.
7. **CSS variables**: mini-program targets cannot inject CSS variables at runtime; components inline default values so they work out of the box. To customize, override the same variables on the `page` selector in `app.wxss` (see below).

### Mini-program style & interaction adaptation

The library adapts to WeChat / Alipay / ByteDance mini-programs as follows — new components must follow these rules:

- **No flex `gap` for spacing**: old WebView kernels are unstable with `gap`; use child `margin` instead (e.g. `Checkbox` / `Radio` labels, `Cell` right value, `Navbar` arrow, `Empty` blocks).
- **Avoid advanced selectors**: wxss only guarantees basic selectors; do not use `:not()` etc. in styles — use modifier class names (`--checked` / `--visible`) or `directions.show` to switch conditional styles.
- **Safe-area double declaration**: `env(safe-area-inset-bottom)` with a fallback second argument fails to parse on some targets — write a fixed value first, then override with `calc(env(safe-area-inset-bottom) + Npx)` (see `ActionSheet`).
- **List items use the `dataIndex` prop**: `h(..., { dataIndex: index }, [], { click: (e) => this.onTap(e) })` — compiles to `data-index="{{index}}"` on mini-program targets and is converted to `data-index` on Web; callbacks read `e.currentTarget.dataset.index` uniformly (`Tabs` / `ActionSheet`).
- **Search confirm key**: `TuSearchBar` offers `confirmType` (mini-program keyboard confirm label, e.g. `'search'`); Web ignores it. Enter fires the `search` event.
- **Inline `var()` in styles**: if a platform fails to parse inline `var()`, the same property has a default fallback in the wxss class; prefer overriding tokens in `app.wxss` for custom themes.
- **Overlay positioning**: `Toast` / `Modal` / `ActionSheet` / `Popup` use `position: fixed` rendered inside the component, with a unified `--tu-popup-z-index` layer (default 1000) so they never fight page content.

## Theming

Design tokens are defined in `lib/theme.ts`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `--tu-primary` | `#1677ff` | Primary color |
| `--tu-success` | `#00b578` | Success color |
| `--tu-warning` | `#ff8f1f` | Warning color |
| `--tu-danger` | `#ff3141` | Danger color |
| `--tu-info` | `#909399` | Info color |
| `--tu-text` | `#323233` | Primary text color |
| `--tu-border` | `#ebedf0` | Border color |
| `--tu-track` | `#ebedf0` | Track color |
| `--tu-white` | `#ffffff` | White |
| `--tu-radius-sm/md/lg` | `4/8/12px` | Corner radius |
| `--tu-duration-fast/normal/slow` | `0.15/0.3/0.5s` | Animation duration |
| `--tu-zindex-popup` | `1000` | Overlay z-index |

- **Web**: call `injectTuTheme()` (once, e.g. at entry) to inject a `style[data-tu-theme]` with default tokens into `<head>`; pass an overrides object to customize:

  ```ts
  import { injectTuTheme } from 'transone-ui';
  injectTuTheme({ '--tu-primary': '#ff6600' });
  ```

- **Mini-program**: override on the `page` selector in `app.wxss`:

  ```css
  page {
    --tu-primary: #ff6600;
  }
  ```

## Package `"source"` field convention (required by the CLI compiler)

When compiling mini-program output, `transone-cli` reads the `"source"` field from `node_modules/<package>/package.json` to locate the package's TypeScript entry, then follows the `export` / re-export chain to resolve the actual component class files. Component libraries must therefore declare:

```json
{
  "name": "transone-ui",
  "source": "./lib/index.ts",
  "peerDependencies": { "transone": ">=0.1.2" }
}
```

> Only the entry the `source` field points to (and its re-export chain) is statically analyzed by the compiler. A component's `render()` / `initState()` / `initStyles()` must stay statically analyzable (literals, ternaries, `&&`, `each` and other supported syntax); method bodies are translated independently and cannot capture closures.

## Development

```bash
# Build dist (type declarations + Bun.build)
bun run --cwd packages/transone-ui build

# Component runtime tests (Web DOM environment)
bun test packages/transone-ui/tests/components.test.ts

# Full-page demo integration tests (controlled data flow)
bun test packages/transone-ui/tests/demo-integration.test.ts
```

The demo project lives in `playground/ui-demo` and covers every component with controlled interactions. It can be built to Web / WeChat / Alipay / ByteDance output:

```bash
bun run --cwd playground/ui-demo build:web        # dist/web
bun run --cwd playground/ui-demo build:weixin     # dist/build/mp-weixin
bun run --cwd playground/ui-demo build:alipay     # dist/build/mp-alipay
bun run --cwd playground/ui-demo build:bytedance  # dist/build/mp-bytedance
```

## License

MIT
