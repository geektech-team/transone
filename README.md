# TransOne

**简体中文**（英文版规划中）

> 一份 TypeScript 源码，编译期静态转换为 Web 与多端小程序产物，未来扩展到原生 App 的跨端前端框架。
> 与 TSone 同源的 One 家族成员。

## 特性

- 纯 TypeScript 实现，TypeScript 为第一公民，公开 API 提供完整类型定义
- Bun 原生工具链：安装、测试、构建、演练和文档服务均由 Bun 驱动
- 一份源码，多端产物：`transone build --target <端>` 直接产出各平台原生工程
- 编译期静态转换（transpile/transform），产物**不携带框架运行时**，体积更小、更接近原生
- 响应式系统：`reactive`、`effect`、`computed`
- 面向对象组件模型：`Component<Props, State>`、生命周期、事件、插槽
- 策略化渲染层：文本、元素、组件、插槽按 VNode 类型分发
- 内置路由：`createRouter`、`RouterView`、`RouterLink`
- 跨端请求：`request` 模块统一封装 Web / 微信 / 阿里 / 字节的请求 API，支持拦截器
- 目标端抽象：`web` / `mp-weixin` / `mp-alipay` / `mp-bytedance`，未来扩展 `app-ios` / `app-android` / `app-harmony`

## 目标端支持矩阵

| 目标端 | 产物形态 | 生成机制 | 状态 |
| --- | --- | --- | --- |
| Web（H5） | 静态站点 / SPA | 复用 TSone 策略化渲染 | 已实现（M1） |
| 微信小程序 | 原生小程序工程 | 编译期静态转换 | 已实现（M2） |
| 阿里小程序（支付宝 / 淘宝） | 原生小程序工程 | 编译期静态转换 | 已实现（M3） |
| 字节小程序（抖音） | 原生小程序工程 | 编译期静态转换 | 已实现（M3） |
| iOS | 原生 App | TBD | 远期 |
| Android | 原生 App | TBD | 远期 |
| 鸿蒙 | 原生 App（ArkUI） | TBD | 远期 |

> 以上为规划目标，实际落地进度以路线图为准，详见 [定位与设计文档](./docs/positioning.md)。
> M1–M3 已落地：`--target web` 产出 H5 站点、`--target mp-weixin` 产出微信原生工程、`--target mp-alipay` 产出阿里原生工程（AXML/ACSS）、`--target mp-bytedance` 产出字节原生工程（TTML/TTSS）。同一份源码经跨端差异层（MpDialect）静态转换。见 [playground/counter](./playground/counter)。

## 快速开始

> 以下示例即 [playground/counter](./playground/counter) 的实现，M1 已可运行。

```typescript
import { Component, VNode, createApp } from 'transone';

interface AppState {
  count: number;
}

class App extends Component<Record<string, never>, AppState> {
  protected initState(): AppState {
    return { count: 0 };
  }

  protected initStyles(): void {}

  protected render(): VNode {
    return {
      tag: 'main',
      children: [
        { tag: 'h1', children: ['TransOne'] },
        {
          tag: 'button',
          listeners: {
            click: () => {
              this.state.count += 1;
            },
          },
          children: [`count: {{count}}`],
        },
      ],
    };
  }
}

const app = createApp({ root: App });
app.mount();
```

同一份源码，构建到不同目标端：

```bash
transone build --target web           # 产出 H5 站点（M1 已实现）
transone build --target mp-weixin     # 产出微信小程序原生工程（M2 已实现）
transone build --target mp-alipay     # 产出阿里小程序原生工程（M3 已实现）
transone build --target mp-bytedance  # 产出字节小程序原生工程（M3 已实现）
```

未实现的目标端会在编译期快速报错并给出对应路线图阶段。

## 跨端请求（request）

`transone/request`（同时从 `transone` 根入口导出）封装各端请求 API：
Web 走 `fetch`，微信 / 阿里 / 字节小程序分别走 `wx.request` / `my.request` / `tt.request`。
运行环境自动探测，一份源码无需改动即可跨端发请求；也支持按端显式指定或注入自定义适配器。

```typescript
import { createRequest } from 'transone/request';

// 实例级默认值：baseURL / headers / timeout / platform 等
const http = createRequest({ baseURL: '/api', timeout: 10000 });

// 请求拦截器：注册顺序执行（如注入登录态）
http.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 响应拦截器：后注册的先执行（如统一解包业务码、兜底错误提示）
http.interceptors.response.use(
  (response) => {
    if (response.data?.code !== 0) {
      throw new RequestError({
        code: 'BAD_REQUEST',
        message: response.data?.message ?? '业务错误',
        config: response.config,
        response,
      });
    }
    return response;
  },
  (error) => {
    // error 为 RequestError，可按 code 分支：TIMEOUT / ABORTED / NETWORK_ERROR …
    throw error;
  }
);

const res = await http.get<{ list: Item[] }>('/items', { params: { page: 1 } });
await http.post('/users', { name: 'a' });
```

也可用全局默认实例，或按目标端覆盖：

```typescript
import { request, detectPlatform } from 'transone/request';

await request.get('/ping');                          // 自动探测目标端
await request.get('/x', { platform: 'weixin' });     // 显式指定端
console.log(detectPlatform());                       // 'web' | 'weixin' | 'alipay' | 'bytedance'
```

错误统一为 `RequestError`（`code` / `config` / `response` / `cause`），
HTTP 4xx / 5xx 不视为异常（与小程序端 success 语义一致），由调用方按 `statusCode` 处理。

## 与 TSone 的关系

- **TransOne 是 TSone 的多端泛化**：TSone 聚焦 Web 运行时，TransOne 把同一套响应式 / 组件 / 渲染模型通过编译期转换输出到多端。
- TSone 的 `build --mp-weixin` 是 TransOne 微信端编译器的原型验证，其产物形态与约束将迁移到 TransOne 并泛化为多端 Target。
- 核心公开 API 与 TSone 同源，Web 产物可直接复用 TSone 的渲染策略与既有组件生态。
- One 家族：`TSone`（前端框架）· `TransOne`（跨端框架）· `BackOne`（后端框架）。

## 仓库结构

本仓库为 Bun workspace monorepo，包含三个发布包：

```text
packages/transone/      核心框架 transone
packages/transone-cli/  多端编译器 transone-cli（Target 抽象 + CLI）
packages/transone-ui/   跨端 UI 组件库 transone-ui（17 个受控组件）
playground/counter/     多端演练项目（M1：Web 可运行）
playground/ui-demo/     UI 组件演示项目（全部组件 + 受控交互）
```

## 开发命令

与 TSone 仓库保持一致：

```bash
bun install              # 安装依赖
bun test                 # 全量测试
bunx tsc --noEmit        # 类型检查
bun run build            # 构建发布产物
bun run format           # Prettier 格式化
```

演练项目：

```bash
bun run --cwd playground/counter build:web   # 构建 Web 产物
bun run --cwd playground/counter preview     # 本地预览构建产物
```

## 常见问题

### 构建报 `EADDRINUSE: address already in use, listen '.../*.sock'`

**症状**：`yarn run build:weixin` 等命令输出 `Failed to start inspector:` 后退出码 1，
报错路径形如 `/var/folders/.../T/wyjy2vn8ox.sock`，且日志开头有 `Debugger attached.`。

**根因**：构建命令被以调试模式启动了（IDE 的 JavaScript Debug Terminal / Bun 调试按钮会
注入 `BUN_INSPECT` 等调试器变量）。Bun 因此尝试启动 inspector 并监听临时 Unix socket；
上一次调试会话异常退出留下的 socket 文件未清理，`bind()` 撞上已存在的文件即报
`EADDRINUSE`（与是否有进程占用无关）。

**已内置的防护**：playground 的 `build:*` 脚本统一用
`env -u BUN_INSPECT -u BUN_INSPECT_BREAK -u VSCODE_INSPECTOR_OPTIONS NODE_OPTIONS=`
剥离调试器变量，构建命令不再进入调试模式，也不会再创建/碰撞调试 socket。

**残留清理**：历史遗留的无占用 socket 可用仓库脚本安全清理（只删无进程占用的文件）：

```bash
bash scripts/clean-debug-sockets.sh           # 预览
bash scripts/clean-debug-sockets.sh --apply   # 执行
```

**日常建议**：构建类命令用普通终端或 IDE 的普通运行（非 Debug）执行即可；
调试能力只对 `dev` 长驻进程有意义，需要调试 dev 时显式使用
`bun --inspect transone dev`。

## 文档

在线文档部署在 GitHub Pages（按包拆分为四个分区，路径与包一一对应）：

- transone 核心框架：<https://geektech-team.github.io/transone/>（快速开始 / 核心概念 / 六个模块 / API）
- transone-cli 编译器：<https://geektech-team.github.io/transone/cli/>（命令 / 配置 / 目标端 / 构建 / API）
- transone-ui 组件库：<https://geektech-team.github.io/transone/ui/>（快速上手 / 主题定制 / 17 个组件）
- 项目：<https://geektech-team.github.io/transone/project/>（定位与设计 / 目标端矩阵 / 路线图）

侧边栏为父子菜单：父菜单 = 包 / 项目，子菜单 = 包的模块、功能或组件页。

本地开发文档：

```bash
bun run docs:dev        # 文档站开发服务器（端口 52313）
bun run docs:build      # 构建文档站产物（docs/dist）
bun run docs:preview    # 本地预览文档站
```

文档站由 transone 构建（`transone build`，SSR + 静态产物），
源码在 [docs/](./docs)。CI 部署见 [.github/workflows/docs-pages.yml](./.github/workflows/docs-pages.yml)：
`transone build --base=/transone/` 一次性构建全站（含 cli / ui / project 分区）。

## 发布前检查

对齐 TSone：

```bash
bun test && bunx tsc --noEmit && bun run build && \
bun pm pack --cwd packages/transone --dry-run && \
bun pm pack --cwd packages/transone-cli --dry-run && \
bun pm pack --cwd packages/transone-ui --dry-run
```

## License

待定，与 TSone 保持一致。
