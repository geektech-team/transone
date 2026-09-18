import {
  apiTable,
  heading,
  paragraph,
  type DocPage,
} from './types';

export const apiOverviewPage: DocPage = {
  path: '/reference/api',
  title: 'API 概览',
  description: 'transone 公开 API 分组速览（详细签名以 dist 类型定义为准）。',
  section: 'reference',
  order: 0,
  body: [
    heading(1, 'API 概览'),
    paragraph(
      '以下为 transone 公开 API 的分组速览。完整签名与类型定义以包内 dist 的 .d.ts 为准；编译器 transone-cli 的 API 见',
      { kind: 'link', text: 'CLI 文档子站', href: './cli/' },
      '。',
    ),
    apiTable('应用与组件', [
      { name: 'createApp', type: '(options: AppOptions) => OneApp', description: '创建应用；root / rootProps / rootElement / state / config / document。' },
      { name: 'OneApp', type: 'class', description: 'mount / unmount / use(plugin) / provide / inject / renderHtmlDocument。' },
      { name: 'Component', type: 'abstract class<TProps, TState>', description: 'initState / initStyles / render、生命周期、emit/on、slot、provide/inject。' },
      { name: 'createComponent', type: '(descriptor | class, props?, children?) => VNode', description: '组件 VNode。' },
      { name: 'h / Tag', type: '(tag, props?, children?, listeners?) => VNode', description: '通用元素 VNode 工厂。' },
      { name: 'Div / Span / H1–H6 / …', type: 'ElementShortcut', description: '元素快捷工厂。' },
      { name: 'slot / each', type: 'helper', description: '插槽声明与列表渲染。' },
    ]),
    apiTable('响应式', [
      { name: 'reactive', type: '<T extends object>(target) => T', description: '深层响应式代理。' },
      { name: 'effect', type: '(fn, options?) => ReactiveEffect', description: '副作用；options: scheduler / throwOnError。' },
      { name: 'computed', type: '<T>(getter) => ComputedRef<T>', description: '依赖缓存派生值。' },
      { name: 'readonly', type: '<T>(target) => Readonly<T>', description: '只读代理。' },
      { name: 'ref', type: '<T>(value) => Ref<T>', description: '原始值包装。' },
      { name: 'stop', type: '(effect) => void', description: '停止副作用。' },
      { name: 'reactiveScheduler', type: 'ReactiveScheduler', description: '微任务批处理调度器。' },
    ]),
    apiTable('路由', [
      { name: 'createRouter', type: '(options | RouteRecord[]) => Router', description: '创建路由；mode: history | hash，base 子路径。' },
      { name: 'Router', type: 'class', description: 'push / replace / beforeEach / afterEach / addRoute / createHref。' },
      { name: 'RouterView', type: 'component', description: '渲染当前路由组件。' },
      { name: 'RouterLink', type: 'component', description: '导航链接；to / replace / activeClass。' },
      { name: 'useRouter / getRouter', type: 'function', description: '获取全局路由实例。' },
    ]),
    apiTable('样式与文档', [
      { name: 'StyleManager', type: 'class', description: 'addStyle(name, {selector, properties, hover, media})。' },
      { name: 'renderHtmlDocument', type: '(options) => string', description: 'SSR 文档壳：title / body / styles / scripts / htmlAttributes。' },
      { name: 'StyleSheet / StyleRule / StyleAtRule', type: 'type', description: '样式表类型。' },
    ]),
    apiTable('DOM 渲染（transone/dom）', [
      { name: 'createDomWindow', type: '(options) => Window', description: '创建 SSR DOM 环境（含 location/url 支持）。' },
      { name: 'installDomGlobals / DOM_GLOBAL_KEYS', type: 'function / const', description: '把 window 全局安装到 globalThis，供 SSR 渲染。' },
    ]),
  ],
};
