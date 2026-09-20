# transone-cli

**English** · [简体中文](./README.zh-CN.md)

Bun-native, multi-target compiler CLI for TransOne applications. It statically converts **one TypeScript source** into Web and multi-platform mini-program native projects at compile time, per target.

The CLI is the compiler half of the TransOne framework — the runtime model is in [`transone`](../transone), and the component library is in [`transone-ui`](../transone-ui).

## Install

```bash
bun add -g transone-cli
# or npm i -g transone-cli
```

Requires Bun >= 1.3.0.

## Usage

```text
Usage:
  transone create
  transone dev [--host <host>] [--port <port>] [--base <path>] [--no-watch]
  transone build [--target <target>] [--out-dir <path>] [--base <path>] [--library]

Targets: web, mp-weixin, mp-alipay, mp-bytedance, app-ios, app-android, app-harmony (default: web)
```

### `transone create`

Scaffolds a new TransOne project in the current directory (refuses to overwrite existing project files).

### `transone dev`

Starts the development server (Web target only) with optional watch mode (`--no-watch` to disable), custom `--host` / `--port`, and a `--base` path.

### `transone build`

Builds the app for a target:

```bash
transone build --target web           # H5 site / SPA
transone build --target mp-weixin     # WeChat mini-program project (WXML/WXSS/JS)
transone build --target mp-alipay     # Alipay mini-program project (AXML/ACSS)
transone build --target mp-bytedance  # ByteDance mini-program project (TTML/TTSS)
```

- `--out-dir` overrides the output directory.
- `--base` sets the deployment base path (e.g. a GitHub Pages sub-path).
- `--library` builds in library mode (no page entry required).

Unimplemented targets fail fast at compile time with a clear error pointing to the corresponding roadmap stage.

## Targets

| Target | Output | Mechanism | Status |
| --- | --- | --- | --- |
| `web` | H5 site / SPA | Direct rendering (HTML + browser runtime) | Implemented |
| `mp-weixin` | Native WeChat mini-program project | Compile-time static conversion (WXML / WXSS / JS) | Implemented |
| `mp-alipay` | Native Alipay mini-program project | Compile-time static conversion (AXML / ACSS) | Implemented |
| `mp-bytedance` | Native ByteDance mini-program project | Compile-time static conversion (TTML / TTSS) | Implemented |
| `app-ios` / `app-android` / `app-harmony` | Native app | TBD | Roadmap |

Mini-program builds emit a complete native project: `app.json` / `app.js` / app style file / project config, plus `pages/<route>/<name>.*` and `components/<tag>/<tag>.*`. Platform differences (template syntax, style language, event binding, lifecycle mapping) are handled by the `MpDialect` abstraction.

## Configuration

Create a `transone.config.ts` in the project root and export the config with `defineConfig`:

```ts
import { defineConfig } from 'transone-cli';

export default defineConfig({
  entry: 'src/main.ts',            // default
  server: {
    host: '127.0.0.1',             // default
    port: 52211,                   // default
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist/build/h5',       // default
    basePath: '',
    directoryPages: false,
  },
  mp: {
    appId: 'touristappid',         // WeChat dev-tool test id by default
    navigationBarTitleText: 'TransOne',
    lengthUnit: 'px',              // or 'rpx' (values converted at 1px = 2rpx)
    // pages, window, tabBar, appExtra, pageExtra, globalData, publicDir ...
  },
});
```

The `mp` field accepts either a single `MiniProgramConfig` (applies to every mini-program target; recommended for WeChat-only apps) or a per-platform map like `{ 'mp-weixin': {...}, 'mp-alipay': {...} }` — only the config for the current target is used.

## How the compiler works

1. Loads the project config and resolves pages from the entry file.
2. For Web: renders directly with the browser runtime (H5 site / SPA).
3. For mini-program targets: statically analyzes the root component class of each page, then compiles the component tree into native files — WXML/JS (WeChat), AXML/ACSS (Alipay), TTML/TTSS (ByteDance) — including styles, template bindings, event methods, and data-state mapping. The generated code is a standalone native project with no TransOne runtime.
4. Library components are resolved through the `"source"` field of each package's `package.json` (see `transone-ui`).

## Extending a new target

Implement the `BuildTarget` interface and register it with `TargetRegistry` — no changes to the build entry point are needed:

```ts
import type { BuildTarget, TargetType, ResolvedConfig, BuildOptions, BuildResult } from 'transone-cli';

export class MyTarget implements BuildTarget {
  readonly type: TargetType = 'my-target';
  readonly label = 'My target platform';
  async build(config: ResolvedConfig, options: BuildOptions): Promise<BuildResult> {
    // generate the native project for your platform
  }
}
```

## Development

```bash
bun test          # run tests
bun run build     # build dist (CLI bundle + .d.ts)
bun run build:types
bun run lint
```

## Documentation

- Online docs (CLI site): <https://geektech-team.github.io/transone/cli/>
- Main docs site: <https://geektech-team.github.io/transone/>
- Repository: <https://github.com/geektech-team/transone>

## License

MIT
