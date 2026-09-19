import {
  apiTable,
  callout,
  codeBlock,
  featureGrid,
  heading,
  hero,
  inlineCode,
  link,
  linkGrid,
  ol,
  paragraph,
  strong,
  table,
  ul,
  type DocPage,
} from './types';

const GITHUB_URL = 'https://github.com/geektech-team/transone';

// ---- 落地页（父菜单 transone，路径 /）----

export const transoneLandingPage: DocPage = {
  path: '/',
  title: 'transone 核心框架',
  description: '跨端前端框架：一份 TypeScript 源码，编译期静态转换为 Web 与多端小程序原生产物，产物不携带框架运行时。',
  section: 'transone',
  order: -1,
  body: [
    hero(
      '跨端前端框架 · 编译期静态转换',
      '一套 TypeScript 源码，多端原生产物',
      'transone 通过编译期静态转换（transpile / transform），把同一份 TypeScript 源码输出为 Web 与微信 / 阿里 / 字节小程序原生工程；响应式、类组件、策略化渲染、路由与样式全内置，产物不携带框架运行时。',
      [
        { label: '快速开始', href: '/getting-started', primary: true },
        { label: 'CLI 编译器', href: '/cli' },
        { label: 'GitHub', href: GITHUB_URL },
      ]
    ),
    featureGrid([
      {
        title: 'TypeScript 第一公民',
        description: '纯 TypeScript 实现，公开 API 提供完整类型定义，Bun 原生工具链驱动安装、测试、构建与文档。',
      },
      {
        title: '编译期静态转换',
        description: 'transone build --target <端> 直接产出各平台原生工程，产物不携带框架运行时，体积更小、更接近原生。',
      },
      {
        title: '响应式系统',
        description: 'reactive / effect / computed 细粒度依赖收集，微任务批处理调度器合并同批变更。',
      },
      {
        title: '面向对象组件模型',
        description: 'Component<Props, State>、生命周期、事件、插槽，OOP + 策略模式 + SOLID 设计。',
      },
      {
        title: '策略化渲染层',
        description: '文本、元素、组件、插槽按 VNode 类型分发，渲染行为可扩展、可替换。',
      },
      {
        title: '内置路由',
        description: 'createRouter / RouterView / RouterLink、导航守卫、history 与 hash 双模式、base 子路径支持。',
      },
      {
        title: '零运行时桥接',
        description: '与 uni-app 运行时桥接划清界限：产物即原生工程，直接由各平台官方工具链构建发布。',
      },
      {
        title: '多端 Target 抽象',
        description: 'web / mp-weixin / mp-alipay / mp-bytedance，远期 app-ios / app-android / app-harmony。',
      },
    ]),
    heading(2, '子文档'),
    linkGrid([
      {
        title: '快速开始',
        description: '安装、应用骨架、组件示例与多端构建命令。',
        href: '/getting-started',
      },
      {
        title: '核心概念',
        description: '响应式、组件模型、渲染策略、路由与样式的设计概览。',
        href: '/core-concepts',
      },
      {
        title: '应用与组件模型',
        description: 'createApp / OneApp、插件、组件基类、生命周期与数据模型表单。',
        href: '/application',
      },
      {
        title: '响应式系统',
        description: 'reactive / ref / computed / effect / watch，细粒度依赖收集与批处理调度。',
        href: '/reactivity',
      },
      {
        title: '渲染层与模板',
        description: 'VNode 模型、元素工厂、策略化渲染分发与文本模板引擎。',
        href: '/renderer',
      },
      {
        title: '路由',
        description: 'createRouter、导航守卫、RouterLink / RouterView 与 history / hash 双模式。',
        href: '/router',
      },
      {
        title: '样式系统',
        description: 'StyleManager 组件样式、StyleSheet 数据化样式表与 rpx 多端单位。',
        href: '/style',
      },
      {
        title: '服务端渲染与 DOM',
        description: 'renderHtmlDocument 文档壳、SSR 同构形态与零依赖 DOM 模拟。',
        href: '/ssr',
      },
      {
        title: 'API 概览',
        description: '公开 API 分组速览（详细签名以 dist 类型定义为准）。',
        href: '/api',
      },
    ]),
    callout(
      'info',
      [
        'One 家族：TSone（前端框架）· TransOne（跨端框架）· BackOne（后端框架）。',
        '本仓库还包含 transone-cli 多端编译器与 transone-ui 跨端组件库，见对应父菜单。',
      ],
      '家族'
    ),
  ],
};

// ---- 快速开始 ----

export const gettingStartedPage: DocPage = {
  path: '/getting-started',
  title: '快速开始',
  description: '安装 transone、理解应用入口约定，并把同一份源码构建到多个目标端。',
  section: 'transone',
  order: 1,
  body: [
    heading(1, '快速开始'),
    heading(2, '安装'),
    paragraph(
      'TransOne 是 Bun workspace monorepo。在项目中使用以下命令同时安装框架与编译器：'
    ),
    codeBlock(
      'bash',
      `bun add transone transone-cli`
    ),
    paragraph(
      '也可以先执行',
      inlineCode('transone create'),
      '从交互骨架开始，或直接参考仓库内的',
      link('playground/counter', 'https://github.com/geektech-team/transone/tree/main/playground/counter'),
      '演练项目。',
    ),
    heading(2, '应用骨架'),
    paragraph(
      '约定入口为',
      inlineCode('src/main.ts'),
      '：导出名为',
      inlineCode('app'),
      '的应用实例（含',
      inlineCode('renderHtmlDocument'),
      '），并调用',
      inlineCode('app.mount()'),
      '在浏览器侧挂载。',
      strong('这份源码同时驱动 SSR 渲染与客户端挂载'),
      '，多页构建时每一页都会以对应 URL 重新解析当前路由。',
    ),
    codeBlock(
      'typescript',
      `import { Component, VNode, createApp } from 'transone';

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
          children: [\`count: {{count}}\`],
        },
      ],
    };
  }
}

const app = createApp({ root: App });
app.mount();

export const app = app;`
    ),
    heading(2, '构建到多端'),
    paragraph('同一份源码，按目标端构建出各平台原生工程：'),
    table(
      ['命令', '产物'],
      [
        ['transone build --target web', 'H5 静态站点 / SPA（已实现）'],
        ['transone build --target mp-weixin', '微信小程序原生工程（已实现）'],
        ['transone build --target mp-alipay', '阿里小程序原生工程（已实现）'],
        ['transone build --target mp-bytedance', '字节小程序原生工程（已实现）'],
      ]
    ),
    callout(
      'info',
      [
        '未实现的目标端会在编译期快速报错，并给出对应路线图阶段，而不是静默产出残缺产物。',
      ],
      '快速失败'
    ),
    heading(2, '本地开发'),
    paragraph('开发服务器支持多页、代理与 base 子路径预览：'),
    codeBlock(
      'bash',
      `transone dev                 # 启动开发服务器（默认 127.0.0.1:52211）
transone dev --port 52311  # 指定端口
transone dev --base /transone/  # 以子路径模式预览（与线上部署一致）`
    ),
    heading(2, '下一步'),
    ul([
      [
        link('核心概念', '/core-concepts'),
        '：响应式系统、组件模型、渲染策略、路由与样式。',
      ],
      [
        link('CLI 编译器', '/cli'),
        '：transone create / dev / build 命令与配置参考。',
      ],
      [
        link('UI 组件库', '/ui'),
        '：transone-ui 跨端组件库的 17 个组件。',
      ],
    ]),
  ],
};

// ---- 核心概念 ----

export const coreConceptsPage: DocPage = {
  path: '/core-concepts',
  title: '核心概念',
  description: '响应式系统、组件模型、策略化渲染、路由与样式的设计概览。',
  section: 'transone',
  order: 2,
  body: [
    heading(1, '核心概念'),
    heading(2, '响应式系统'),
    paragraph(
      '响应式系统是组件与渲染的基础：',
      inlineCode('reactive'),
      ' 创建响应式对象，',
      inlineCode('effect'),
      ' 注册副作用并在依赖变化时重新执行，',
      inlineCode('computed'),
      ' 派生值按需缓存。组件 render 期间的依赖按需收集——只访问到的 state 属性才建立依赖，未访问的属性变化不会触发重渲染。',
    ),
    apiTable('响应式 API', [
      { name: 'reactive', type: '<T extends object>(target: T) => T', description: '创建深层响应式代理对象。' },
      { name: 'effect', type: '(fn, options?) => ReactiveEffect', description: '注册副作用；支持自定义调度器（scheduler）与错误处理。' },
      { name: 'computed', type: '<T>(getter) => ComputedRef<T>', description: '依赖缓存的计算值。' },
      { name: 'readonly', type: '<T>(target: T) => Readonly<T>', description: '只读代理，写入在开发期告警。' },
      { name: 'ref', type: '<T>(value: T) => Ref<T>', description: '包装原始值为响应式引用。' },
      { name: 'stop', type: '(effect) => void', description: '停止副作用，解除依赖订阅。' },
      { name: 'reactiveScheduler', type: 'ReactiveScheduler', description: '微任务批处理调度器：同批状态变更合并为一次渲染。' },
    ]),
    callout(
      'tip',
      [
        '状态批量变更由调度器合并：同一批次内的多次赋值只会触发一次重渲染，这是组件性能的关键保证。',
      ],
      '批处理'
    ),
    heading(2, '组件模型'),
    paragraph(
      '组件是继承自',
      inlineCode('Component<Props, State>'),
      ' 的类：',
      inlineCode('initState()'),
      ' 返回响应式初始状态，',
      inlineCode('initStyles()'),
      ' 注册组件样式，',
      inlineCode('render()'),
      ' 返回 VNode。组件之间通过 props、事件（',
      inlineCode('emit'),
      ' / ',
      inlineCode('on'),
      '）与插槽协作。',
    ),
    table(
      ['生命周期', '时机'],
      [
        ['beforeMount', '挂载前'],
        ['onMounted', '挂载完成'],
        ['beforeUpdate', '重渲染前'],
        ['onUpdated', '重渲染后'],
        ['beforeUnmount', '卸载前'],
        ['onUnmounted', '卸载完成'],
        ['onErrorCaptured', '后代渲染/更新出错时（错误边界）'],
      ]
    ),
    heading(2, '策略化渲染'),
    paragraph(
      '渲染层按 VNode 类型分发到不同策略：文本、元素、组件与插槽各自有独立的渲染/更新/卸载实现。新增渲染行为优先扩展或拆分 Strategy，而不是把逻辑堆进单个大函数——这是项目的 OOP + 策略模式 + SOLID 约束。',
    ),
    heading(2, '路由'),
    paragraph(
      '内置路由提供',
      inlineCode('createRouter'),
      '、',
      inlineCode('RouterView'),
      '、',
      inlineCode('RouterLink'),
      '：支持 history / hash 双模式、命名路由、重定向与循环检测、全局前置守卫（beforeEach）与导航完成钩子（afterEach）。路由支持',
      inlineCode('base'),
      ' 选项，用于部署在子路径下（如 GitHub Pages 的',
      inlineCode('/transone/'),
      '）。',
    ),
    heading(2, '样式'),
    paragraph(
      '组件通过',
      inlineCode('styleManager.addStyle(name, { selector, properties, hover, media })'),
      ' 声明样式，样式在首次使用时注入',
      inlineCode('<style>'),
      '。SSR 场景可向文档壳传入全局',
      inlineCode('StyleSheet'),
      '，让构建产物直接内联样式。',
    ),
    heading(2, '下一步'),
    ul([
      [link('模块文档', '/'), '：应用与组件模型、响应式、渲染、路由、样式、SSR 逐一深入。'],
      [link('API 概览', '/api'), '：公开 API 分组速览。'],
      [link('CLI 编译器', '/cli'), '：如何把同一份源码构建到多端。'],
    ]),
  ],
};

// ---- API 概览 ----

export const apiOverviewPage: DocPage = {
  path: '/api',
  title: 'API 概览',
  description: 'transone 公开 API 分组速览（详细签名以 dist 类型定义为准）。',
  section: 'transone',
  order: 9,
  body: [
    heading(1, 'API 概览'),
    paragraph(
      '以下为 transone 公开 API 的分组速览。完整签名与类型定义以包内 dist 的 .d.ts 为准；编译器 transone-cli 的 API 见',
      link('CLI · API 参考', '/cli/api'),
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
    ol([['子路径导出：', 'transone/router、transone/style、transone/dom、transone/request，见对应模块页。']]),
  ],
};
