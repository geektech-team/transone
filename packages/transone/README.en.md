# transone

TransOne core framework package — a cross-platform front-end framework that compiles **one TypeScript source** into Web and multi-platform mini-program native projects at build time. Emitted artifacts carry **no framework runtime**: code is statically transformed (transpile/transform), so the output stays small and close to native.

The core public API is same-origin with [TSone](https://github.com/geektech-team/tsone): Web output can directly reuse TSone rendering strategies and its component ecosystem. The multi-target compiler lives in [`transone-cli`](../transone-cli).

## Features

- **Reactive system** — `reactive`, `readonly`, `effect`, `computed`, `ref`, `isRef`, `unref`, `stop`, `watch`, `nextTick`, `flushSync`, backed by a reactive scheduler
- **OOP component model** — `Component<Props, State>` with lifecycle hooks, custom events, slots, and `provide` / `inject`
- **Strategy-based renderer** — `RenderStrategy` dispatches by VNode type (text / element / component / slot)
- **Built-in router** — `createRouter`, `RouterView`, `RouterLink` with history / hash modes, base path, navigation guards, redirects and route metadata
- **Cross-platform request** — one unified API over `fetch` (Web), `wx.request` (WeChat), `my.request` (Alipay) and `tt.request` (ByteDance), with request / response interceptors and platform auto-detection
- **Style management** — `StyleManager` with class / id / sheet style units
- **DOM abstractions** — `createDomWindow`, `installDomGlobals`, `parseHtmlFragment` for headless and test environments

## Install

```bash
bun add transone
# or npm / pnpm / yarn
```

Requires Bun >= 1.3.0.

## Quick start

A counter component — the same source builds to every supported target:

```ts
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

Build the same source to different targets with `transone-cli`:

```bash
transone build --target web           # H5 site / SPA
transone build --target mp-weixin     # WeChat mini-program project (WXML/WXSS/JS)
transone build --target mp-alipay     # Alipay mini-program project (AXML/ACSS)
transone build --target mp-bytedance  # ByteDance mini-program project (TTML/TTSS)
```

## Reactivity

```ts
import { reactive, computed, effect, ref, watch, nextTick } from 'transone';

const state = reactive({ count: 0 });

const doubled = computed(() => state.count * 2);

effect(() => {
  console.log(`count is ${state.count}, doubled is ${doubled.value}`);
});

state.count += 1; // triggers the effect

const message = ref('hello');
watch(message, (value, oldValue) => {
  console.log(`message changed: ${oldValue} -> ${value}`);
});

await nextTick(); // flush pending reactive updates
```

## Component model

```ts
import { Component, h, type VNode } from 'transone';

interface GreetingProps {
  name: string;
}

class Greeting extends Component<GreetingProps, { shown: boolean }> {
  protected initState() {
    return { shown: false };
  }

  protected initStyles(): void {}

  protected onMounted(): void {
    this.setState({ shown: true });
  }

  protected render(): VNode {
    return h('p', {}, [`Hello, ${this.props.name}!`]);
  }
}
```

Lifecycle hooks: `beforeMount`, `onMounted`, `beforeUpdate`, `onUpdated`, `onPropsChange`, `beforeUnmount`, `onUnmounted`, `onErrorCaptured`. Components communicate through custom events (`emit` / `on` / `off`) and dependency injection (`provide` / `inject`).

## Router

```ts
import { createRouter, RouterView, RouterLink } from 'transone/router';

const router = createRouter({
  mode: 'history',
  base: '/app',
  routes: [
    { path: '/', component: Home, name: 'home' },
    { path: '/about', component: About, name: 'about' },
    { path: '/old', redirect: '/about' },
    { path: '/users/:id', component: UserDetail },
  ],
});

router.beforeEach((to, from) => {
  // return false to cancel, a path string to redirect, or undefined to continue
});
```

Render the matched route with `RouterView` and link with `RouterLink`:

```ts
import { Component, h, createComponent, type VNode } from 'transone';

class Layout extends Component {
  protected initStyles(): void {}

  protected render(): VNode {
    return h('div', {}, [
      createComponent({
        component: RouterLink,
        props: { to: '/', activeClass: 'active' },
        children: ['Home'],
      }),
      createComponent({ component: RouterView }),
    ]);
  }
}
```

## Cross-platform request

`transone/request` (also re-exported from the root entry) wraps each platform's request API: Web uses `fetch`, while WeChat / Alipay / ByteDance mini-programs use `wx.request` / `my.request` / `tt.request` respectively. The runtime detects the environment automatically, so one source works across targets without changes; you can also pin a platform explicitly or inject a custom adapter.

```ts
import { createRequest, RequestError } from 'transone/request';

const http = createRequest({ baseURL: '/api', timeout: 10000 });

// Request interceptors run in registration order (e.g. inject auth state)
http.interceptors.request.use((config) => {
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptors: later-registered ones run first
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

```ts
import { request, detectPlatform } from 'transone/request';

await request.get('/ping');                       // auto-detect target platform
await request.get('/x', { platform: 'weixin' });  // explicit platform
console.log(detectPlatform());                    // 'web' | 'weixin' | 'alipay' | 'bytedance'
```

Errors are normalized to `RequestError` (`code` / `config` / `response` / `cause`). HTTP 4xx / 5xx are not treated as exceptions (consistent with mini-program `success` semantics); inspect `statusCode` on the caller side.

## Sub-path exports

| Entry | Contents |
| --- | --- |
| `transone` | Core (reactivity, components, renderer) + router + request |
| `transone/router` | `createRouter`, `Router`, `RouterView`, `RouterLink`, `useRouter` |
| `transone/request` | `createRequest`, `request`, `Request`, `InterceptorManager`, `RequestError`, `detectPlatform` |
| `transone/style` | `StyleManager`, style sheets and units |
| `transone/dom` | DOM abstractions: `createDomWindow`, `installDomGlobals`, `parseHtmlFragment` |

## Relationship with TSone

- **TransOne is the multi-target generalization of TSone**: TSone focuses on the Web runtime; TransOne compiles the same reactive / component / rendering model to multiple targets through compile-time transformation.
- TSone's `build --mp-weixin` served as the prototype for TransOne's WeChat target; its output shape and constraints migrate into TransOne's multi-target abstraction.
- The One family: `TSone` (front-end framework) · `TransOne` (cross-platform framework) · `BackOne` (back-end framework).

## Development

```bash
bun test          # run tests (Bun's test runner)
bun run build     # build dist (ESM + .d.ts)
bun run build:types
bun run lint
```

## License

MIT
