# TransOne

**English** · [简体中文](./README.zh-CN.md)

> A cross-platform front-end framework: **one TypeScript source**, statically converted at compile time into Web and multi-platform mini-program output, with native App targets on the roadmap.
> A member of the One family, same-origin with TSone.

## Features

- Pure TypeScript implementation — TypeScript is a first-class citizen and every public API ships with full type definitions
- Bun-native toolchain: install, test, build, playground and docs are all driven by Bun
- One source, many targets: `transone build --target <target>` emits each platform's native project directly
- Compile-time static conversion (transpile/transform) — output carries **no framework runtime**, keeping it smaller and closer to native
- Reactive system: `reactive`, `effect`, `computed`
- OOP component model: `Component<Props, State>`, lifecycle, events, slots
- Strategy-based rendering layer: text, element, component and slot dispatched by VNode type
- Built-in router: `createRouter`, `RouterView`, `RouterLink`
- Cross-platform request: the `request` module unifies Web / WeChat / Alipay / ByteDance request APIs with interceptor support
- Target abstraction: `web` / `mp-weixin` / `mp-alipay` / `mp-bytedance`, with `app-ios` / `app-android` / `app-harmony` planned

## Target support matrix

| Target | Output | Generation mechanism | Status |
| --- | --- | --- | --- |
| Web (H5) | Static site / SPA | Reuses TSone strategy-based rendering | Implemented (M1) |
| WeChat mini-program | Native mini-program project | Compile-time static conversion | Implemented (M2) |
| Alipay mini-program (Alipay / Taobao) | Native mini-program project | Compile-time static conversion | Implemented (M3) |
| ByteDance mini-program (Douyin) | Native mini-program project | Compile-time static conversion | Implemented (M3) |
| iOS | Native app | TBD | Future |
| Android | Native app | TBD | Future |
| HarmonyOS | Native app (ArkUI) | TBD | Future |

> These are planning targets; actual progress follows the roadmap — see the [positioning & design doc](./docs/positioning.md).
> M1–M3 are landed: `--target web` emits an H5 site, `--target mp-weixin` a WeChat native project, `--target mp-alipay` an Alipay native project (AXML/ACSS), `--target mp-bytedance` a ByteDance native project (TTML/TTSS). The same source is statically converted through the cross-platform dialect layer (MpDialect). See [playground/counter](./playground/counter).

## Quick start

> The example below is exactly [playground/counter](./playground/counter); M1 is runnable.

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

Build the same source to different targets:

```bash
transone build --target web           # emits an H5 site (M1 implemented)
transone build --target mp-weixin     # emits a WeChat mini-program project (M2 implemented)
transone build --target mp-alipay     # emits an Alipay mini-program project (M3 implemented)
transone build --target mp-bytedance  # emits a ByteDance mini-program project (M3 implemented)
```

Unimplemented targets fail fast at compile time with an error naming the corresponding roadmap stage.

## Cross-platform request

`transone/request` (also re-exported from the `transone` root entry) wraps each platform's request API: Web uses `fetch`, while WeChat / Alipay / ByteDance mini-programs use `wx.request` / `my.request` / `tt.request` respectively. The runtime detects the environment automatically, so one source makes cross-platform requests without changes; you can also pin a platform explicitly or inject a custom adapter.

```typescript
import { createRequest } from 'transone/request';

// Instance-level defaults: baseURL / headers / timeout / platform ...
const http = createRequest({ baseURL: '/api', timeout: 10000 });

// Request interceptors run in registration order (e.g. inject auth state)
http.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptors: later-registered ones run first (e.g. unwrap business codes, fallback error toasts)
http.interceptors.response.use(
  (response) => {
    if (response.data?.code !== 0) {
      throw new RequestError({
        code: 'BAD_REQUEST',
        message: response.data?.message ?? 'Business error',
        config: response.config,
        response,
      });
    }
    return response;
  },
  (error) => {
    // error is a RequestError; branch on code: TIMEOUT / ABORTED / NETWORK_ERROR ...
    throw error;
  }
);

const res = await http.get<{ list: Item[] }>('/items', { params: { page: 1 } });
await http.post('/users', { name: 'a' });
```

A global default instance and per-target overrides are also available:

```typescript
import { request, detectPlatform } from 'transone/request';

await request.get('/ping');                       // auto-detect target platform
await request.get('/x', { platform: 'weixin' });  // explicit platform
console.log(detectPlatform());                    // 'web' | 'weixin' | 'alipay' | 'bytedance'
```

Errors are normalized to `RequestError` (`code` / `config` / `response` / `cause`). HTTP 4xx / 5xx are not treated as exceptions (consistent with mini-program `success` semantics); inspect `statusCode` on the caller side.

## Relationship with TSone

- **TransOne is the multi-target generalization of TSone**: TSone focuses on the Web runtime; TransOne compiles the same reactive / component / rendering model to multiple targets through compile-time transformation.
- TSone's `build --mp-weixin` served as the prototype for TransOne's WeChat target; its output shape and constraints migrate into TransOne and are generalized into multi-target `Target`s.
- The core public API is same-origin with TSone, so Web output can directly reuse TSone rendering strategies and the existing component ecosystem.
- The One family: `TSone` (front-end framework) · `TransOne` (cross-platform framework) · `BackOne` (back-end framework).

## Repository structure

This is a Bun workspace monorepo with three published packages:

```text
packages/transone/       core framework transone
packages/transone-cli/   multi-target compiler transone-cli (Target abstraction + CLI)
packages/transone-ui/    cross-platform UI library transone-ui (17 controlled components)
playground/counter/      multi-target playground project (M1: Web runnable)
playground/ui-demo/      UI component demo project (all components + controlled interactions)
```

## Development commands

Aligned with the TSone repository:

```bash
bun install              # install dependencies
bun test                 # run all tests
bunx tsc --noEmit        # type-check
bun run build            # build release output
bun run format           # Prettier formatting
```

Playground:

```bash
bun run --cwd playground/counter build:web   # build the Web output
bun run --cwd playground/counter preview     # preview the built output locally
```

## Troubleshooting

### Build fails with `EADDRINUSE: address already in use, listen '.../*.sock'`

**Symptoms**: commands like `yarn run build:weixin` print `Failed to start inspector:` and exit with code 1; the error path looks like `/var/folders/.../T/wyjy2vn8ox.sock`, and the log starts with `Debugger attached.`

**Root cause**: the build command was launched in debug mode (an IDE's JavaScript Debug Terminal or Bun's debug button injects `BUN_INSPECT` and other debugger variables). Bun then tries to start an inspector listening on a temporary Unix socket; a socket file left over from an abnormally exited debug session is never cleaned up, so `bind()` collides with the existing file and reports `EADDRINUSE` (regardless of whether a process is still holding it).

**Built-in protection**: the playground `build:*` scripts uniformly strip debugger variables via `env -u BUN_INSPECT -u BUN_INSPECT_BREAK -u VSCODE_INSPECTOR_OPTIONS NODE_OPTIONS=`, so build commands no longer enter debug mode and no longer create/collide with debug sockets.

**Cleanup**: stale sockets not held by any process can be safely removed with the repo script (only deletes files no process is using):

```bash
bash scripts/clean-debug-sockets.sh           # preview
bash scripts/clean-debug-sockets.sh --apply   # execute
```

**Everyday advice**: run build-type commands from a normal terminal or the IDE's normal (non-debug) run; debugging only matters for the long-running `dev` process — when you need to debug dev, explicitly use `bun --inspect transone dev`.

## Documentation

Online docs are deployed on GitHub Pages, split into four sections whose paths map 1:1 to packages:

- transone core framework: <https://geektech-team.github.io/transone/> (quick start / core concepts / six modules / API)
- transone-cli compiler: <https://geektech-team.github.io/transone/cli/> (commands / config / targets / build / API)
- transone-ui component library: <https://geektech-team.github.io/transone/ui/> (quick start / theming / 17 components)
- Project: <https://geektech-team.github.io/transone/project/> (positioning & design / target matrix / roadmap)

The sidebar is a parent–child menu: parent = package / project, child = the package's modules, features or component pages.

Developing the docs locally:

```bash
bun run docs:dev        # docs dev server (port 52313)
bun run docs:build      # build the docs site (docs/dist)
bun run docs:preview    # preview the docs site locally
```

The docs site is built by transone itself (`transone build`, SSR + static output); the source lives in [docs/](./docs). CI deployment is in [.github/workflows/docs-pages.yml](./.github/workflows/docs-pages.yml): a single `transone build --base=/transone/` builds the whole site (including the cli / ui / project sections).

## Pre-publish checklist

Aligned with TSone:

```bash
bun test && bunx tsc --noEmit && bun run build && \
bun pm pack --cwd packages/transone --dry-run && \
bun pm pack --cwd packages/transone-cli --dry-run && \
bun pm pack --cwd packages/transone-ui --dry-run
```

## License

TBD — will stay consistent with TSone.
