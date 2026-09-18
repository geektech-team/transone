import {
  apiTable,
  callout,
  codeBlock,
  heading,
  inlineCode,
  link,
  ol,
  paragraph,
  strong,
  table,
  ul,
  type DocPage,
} from './types';

// ---- 快速开始 ----

export const gettingStartedPage: DocPage = {
  path: '/guide/getting-started',
  title: '快速开始',
  description: '安装 TransOne、理解应用入口约定，并把同一份源码构建到多个目标端。',
  section: 'guide',
  order: 0,
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
      link('playground/counter', 'https://github.com/geektech/transone/tree/main/playground/counter'),
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
        ['transone build --target web', 'H5 静态站点 / SPA（M1 已实现）'],
        ['transone build --target mp-weixin', '微信小程序原生工程（M2 已实现）'],
        ['transone build --target mp-alipay', '阿里小程序原生工程（M3 规划）'],
        ['transone build --target mp-bytedance', '字节小程序原生工程（M3 规划）'],
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
        link('核心概念', '/guide/core-concepts'),
        '：响应式系统、组件模型、渲染策略、路由与样式。',
      ],
      [
        link('子包文档', '/packages'),
        '：核心框架 transone 与编译器 transone-cli。',
      ],
      [
        link('CLI 文档', './cli/'),
        '：命令与配置的完整参考。',
      ],
    ]),
  ],
};

// ---- 核心概念 ----

export const coreConceptsPage: DocPage = {
  path: '/guide/core-concepts',
  title: '核心概念',
  description: '响应式系统、组件模型、策略化渲染、路由与样式的设计概览。',
  section: 'guide',
  order: 1,
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
  ],
};

// ---- 定位与设计 ----

export const positioningPage: DocPage = {
  path: '/guide/positioning',
  title: '定位与设计',
  description: 'TransOne 的品牌定位、技术路线对比、能力边界与架构方向。',
  section: 'guide',
  order: 2,
  body: [
    heading(1, '定位与设计'),
    callout(
      'info',
      ['本文是规划稿要点速览，权威依据见仓库内 docs/positioning.md 全文。'],
      '来源'
    ),
    heading(2, '一句话定位'),
    paragraph(
      strong('一套 TypeScript 源码，通过编译期静态转换产出 Web 与多端小程序原生工程，未来扩展原生 App 的跨端前端框架。'),
      '核心主张：一套源码，多端原生产物，零运行时桥接。',
    ),
    heading(2, '为什么是编译期静态转换'),
    table(
      ['方案', '代表', '机制', '代价'],
      [
        ['运行时桥接', 'uni-app', '框架运行时 + 编译产物（自定义组件 + 运行时适配层）', '产物依赖框架运行时，包体大，调试隔层'],
        ['编译转换 + 运行时适配', 'Taro', 'Babel 编译 + 运行时 reconciler', '运行时依赖框架子集，性能与兼容性受限'],
        ['编译期静态转换（本项目）', 'TSone build --mp-weixin 原型', '静态分析 VNode 子集 → 目标端原生模板 / 组件代码', '对源码形态有约束（必须可静态编译），需文档化限制'],
      ]
    ),
    ul([
      ['产物即原生工程：直接由各平台官方工具链构建、预览、发布，无框架运行时依赖。'],
      ['体积与性能最优：小程序端尤其敏感，静态转换产物最接近手写原生。'],
      ['代价可控：每端维护一个静态编译目标（模板语法、样式、API 映射），不可静态编译的写法在编译期快速报错。'],
    ]),
    heading(2, '能力边界'),
    paragraph('首期做（M1–M3）：Web 产物、微信 / 阿里 / 字节小程序静态转换、响应式与类组件、目标端抽象（Target）。'),
    paragraph('首期明确排除：SSR、devtools、HMR、JSX 编译器、运行时跨端桥接、App 端（列为远期并预留 Target 扩展点）、第三方运行时。'),
    heading(2, '架构方向'),
    paragraph(
      '每个端一个编译目标（Target），编译器按 Target 分发代码生成：web 直接渲染（与 TSone 一致）；mp-weixin 产出 WXML / WXSS / JS；mp-alipay 与 mp-bytedance 为 M3 规划；app-* 为远期占位。编译流水线：入口文档 → 静态分析（可编译性校验）→ VNode 子集抽取 → 各 Target 代码生成 → 原生工程文件输出。',
    ),
    heading(2, '设计约束'),
    ul([
      ['OOP + 策略模式 + SOLID，对齐 TSone 项目内 OOP 设计约束。'],
      ['新增渲染 / 编译行为优先扩展或拆分 Strategy。'],
      ['零外部运行时依赖；Bun-first 工具链。'],
      ['TypeScript strict 风格，避免新增 any；公共 API 优先泛型、unknown、显式接口。'],
    ]),
  ],
};

// ---- 目标端 ----

export const targetsPage: DocPage = {
  path: '/guide/targets',
  title: '目标端支持矩阵',
  description: '各目标端的产物形态、生成机制与落地状态。',
  section: 'guide',
  order: 3,
  body: [
    heading(1, '目标端支持矩阵'),
    table(
      ['目标端', '产物形态', '生成机制', '状态'],
      [
        ['Web（H5）', '静态站点 / SPA', '复用 TSone 策略化渲染', '已实现（M1）'],
        ['微信小程序', '原生小程序工程', '编译期静态转换', '已实现（M2）'],
        ['阿里小程序（支付宝 / 淘宝）', '原生小程序工程', '编译期静态转换', '规划（M3）'],
        ['字节小程序（抖音）', '原生小程序工程', '编译期静态转换', '规划（M3）'],
        ['iOS', '原生 App', 'TBD', '远期'],
        ['Android', '原生 App', 'TBD', '远期'],
        ['鸿蒙', '原生 App（ArkUI）', 'TBD', '远期'],
      ]
    ),
    callout(
      'warn',
      [
        '以上为规划目标，实际落地进度以路线图为准。未实现的目标端会在编译期快速报错并给出对应阶段。',
      ],
      '注意'
    ),
    heading(2, '本站在各端的产物'),
    paragraph(
      '本文档站本身就是 TransOne 的 Web 产物（',
      inlineCode('transone build --target web'),
      '），以 directoryPages 多页形态部署到 GitHub Pages 子路径——base 推导、SSR 内容渲染与客户端路由均跑在框架自身能力上。',
    ),
  ],
};

// ---- 路线图 ----

export const roadmapPage: DocPage = {
  path: '/guide/roadmap',
  title: '路线图',
  description: 'M1–M4 里程碑、验收标准与开放问题。',
  section: 'guide',
  order: 4,
  body: [
    heading(1, '路线图'),
    table(
      ['里程碑', '内容', '验收标准'],
      [
        ['M1', 'Web 产物：迁移 / 复用 TSone 核心到 transone，建立 monorepo 骨架', 'transone build --target web 产出可运行 H5 站点（已完成）'],
        ['M2', '微信小程序：泛化 TSone build --mp-weixin 为 Target 抽象', 'transone build --target mp-weixin 产出可被微信开发者工具打开的原生工程（已完成）'],
        ['M3', '阿里、字节小程序：新增 mp-alipay / mp-bytedance Target', '两端均产出可构建的原生工程；沉淀跨端差异层'],
        ['M4（远期）', 'App 端探索：iOS / Android / 鸿蒙技术选型', '输出技术选型结论，不阻塞 M1–M3 设计'],
      ]
    ),
    heading(2, '开放问题'),
    ol([
      ['App 端技术路线：自绘渲染引擎 vs 编译到原生 vs 原生容器 + WebView——决定 Target 抽象是否需要原生渲染后端。'],
      ['小程序模板语法覆盖范围：WXML / AXML / ttml 子集边界，组件与事件映射如何按端定制。'],
      ['与 TSone 的 API 兼容策略：Web 端完全复用 TSone API，小程序端约束为可静态编译的子集并文档化差异。'],
      ['跨端能力映射表的维护机制：建议以表格 + 契约测试固化。'],
    ]),
  ],
};
