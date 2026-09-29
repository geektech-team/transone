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

Targets: web, mp-weixin, mp-alipay, mp-bytedance, mp-xiaohongshu, app-ios, app-android, app-harmony (default: web)
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
transone build --target mp-xiaohongshu # Xiaohongshu mini-program project (XHSML/CSS)
```

- `--out-dir` overrides the output directory.
- `--base` sets the deployment base path (e.g. a GitHub Pages sub-path).
- `--library` builds in library mode (no page entry required).

The iOS, Android, and Harmony native app targets are implemented. A generated project should still be opened in its platform IDE for runtime/device validation.

## Targets

| Target | Output | Mechanism | Status |
| --- | --- | --- | --- |
| `web` | H5 site / SPA | Direct rendering (HTML + browser runtime) | Implemented |
| `mp-weixin` | Native WeChat mini-program project | Compile-time static conversion (WXML / WXSS / JS) | Implemented |
| `mp-alipay` | Native Alipay mini-program project | Compile-time static conversion (AXML / ACSS) | Implemented |
| `mp-bytedance` | Native ByteDance mini-program project | Compile-time static conversion (TTML / TTSS) | Implemented |
| `mp-xiaohongshu` | Native Xiaohongshu Mini Program (not Mini Widget) | Compile-time static conversion (XHSML / CSS) | Implemented |
| `app-ios` / `app-android` / `app-harmony` | Native app (SwiftUI / Jetpack Compose / ArkUI) | Compile-time source generation | Implemented |

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
    host: 'https://api.example.com', // default request baseURL
    navigationBarTitleText: 'TransOne',
    lengthUnit: 'px',              // or 'rpx' (values converted at 1px = 2rpx)
    // pages, window, tabBar, appExtra, pageExtra, globalData, publicDir ...
    'mp-weixin': { appId: 'wx123456' },
    'mp-alipay': { appId: '2024000000000000', navigationBarTitleText: 'Alipay' },
  },
});
```

Common mini-program fields live directly under `mp`; platform-specific fields live under keys such as `'mp-weixin'` or `'mp-alipay'`. The current platform overrides common fields: objects merge recursively, arrays replace as a whole, and undefined fields inherit common values. Platforms without overrides use the common configuration. Existing flat and platform-only configurations remain supported. The default app ID is `touristappid` unless configured.

Generate the Counter playground project for Xiaohongshu with:

```bash
bun run --cwd playground/counter build:xiaohongshu
```

The output is `playground/counter/dist/build/mp-xiaohongshu`.

## How the compiler works

1. Loads the project config and resolves pages from the entry file.
2. For Web: renders directly with the browser runtime (H5 site / SPA).
3. For mini-program targets: statically analyzes the root component class of each page, then compiles the component tree into native files — WXML/WXSS (WeChat), AXML/ACSS (Alipay), TTML/TTSS (ByteDance), and XHSML/CSS (Xiaohongshu) — including styles, template bindings, event methods, and data-state mapping. The generated code is a standalone native project with no TransOne runtime.
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

### API host for mini-programs and native apps

Set `mp.host` or `app.host` in `transone.config.ts` (an absolute HTTP/HTTPS URL).
`mp['mp-weixin'].host` and `app['app-ios'].host` override their common host.
For mini-programs, `transone/request` uses this host as its default `baseURL`;
instance and per-request `baseURL` take priority, and absolute request URLs keep their own address.
With no host configured, request behavior remains unchanged.

```ts
export default defineConfig({
  mp: {
    host: 'https://api.example.com',
    'mp-weixin': { host: 'https://wx-api.example.com' },
  },
  app: {
    host: 'https://api.example.com',
    'app-ios': { host: 'https://ios-api.example.com' },
  },
});
```

Native app builds write `{ host }` to `transone.config.json` in the platform resource directory.
Native request compilation is not yet supported; this file is configuration for future integration.

Weixin builds default to `lazyCodeLoading: "requiredComponents"` in `app.json` (component injection on demand). Override it through `mp.appExtra.lazyCodeLoading` or the platform-specific `appExtra`.
