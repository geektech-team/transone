import {
  apiTable,
  callout,
  codeBlock,
  heading,
  inlineCode,
  link,
  linkGrid,
  paragraph,
  strong,
  table,
  ul,
  type DocPage,
} from './types';

// ---- 子包总览 ----

export const packagesOverviewPage: DocPage = {
  path: '/packages',
  title: '子包文档',
  description: 'TransOne monorepo 中各发布包的文档目录：核心框架与多端编译器。',
  section: 'packages',
  order: 0,
  body: [
    heading(1, '子包文档'),
    paragraph(
      'TransOne 是 Bun workspace monorepo，两个发布包按目录组织：',
      inlineCode('/packages/transone/'),
      ' 为核心框架各模块，',
      inlineCode('/packages/transone-cli/'),
      ' 为多端编译器各模块。本文档站由 @geektech/tsone 构建，编译器操作指南部署在',
      inlineCode('/cli/'),
      ' 子路径。',
    ),
    heading(2, 'transone · 核心框架'),
    paragraph(
      '纯 TypeScript、零运行时依赖的跨端前端框架：响应式、面向对象组件模型、策略化渲染、路由与样式。',
    ),
    linkGrid([
      {
        title: '应用与组件模型',
        description: 'createApp / OneApp、插件、组件基类、生命周期、插槽与数据模型表单。',
        href: '/packages/transone/application',
      },
      {
        title: '响应式系统',
        description: 'reactive / ref / computed / effect / watch，细粒度依赖收集与批处理调度。',
        href: '/packages/transone/reactivity',
      },
      {
        title: '渲染层与模板',
        description: 'VNode 模型、元素工厂、策略化渲染分发与文本模板引擎。',
        href: '/packages/transone/renderer',
      },
      {
        title: '路由',
        description: 'createRouter、导航守卫、RouterLink / RouterView 与 history / hash 双模式。',
        href: '/packages/transone/router',
      },
      {
        title: '样式系统',
        description: 'StyleManager 组件样式、StyleSheet 数据化样式表与 rpx 多端单位。',
        href: '/packages/transone/style',
      },
      {
        title: '服务端渲染与 DOM',
        description: 'renderHtmlDocument 文档壳、SSR 同构形态与零依赖 DOM 模拟。',
        href: '/packages/transone/ssr',
      },
    ]),
    heading(2, 'transone-cli · 多端编译器'),
    paragraph(
      'Bun-native 编译器：按 Target 把同一份 TypeScript 源码静态转换为 Web 与多端小程序原生工程。',
    ),
    linkGrid([
      {
        title: 'CLI 命令',
        description: 'transone create / dev / build 三个命令与全部参数。',
        href: '/packages/transone-cli/commands',
      },
      {
        title: '配置',
        description: 'transone.config.ts、defineConfig / resolveConfig 与配置字段。',
        href: '/packages/transone-cli/config',
      },
      {
        title: '目标端抽象',
        description: 'BuildTarget 接口、TargetRegistry 注册表与 web / 小程序目标端实现。',
        href: '/packages/transone-cli/targets',
      },
      {
        title: '构建流程与产物',
        description: '站点构建（SSR + 静态多页）、库打包（--library）与小程序产物。',
        href: '/packages/transone-cli/build',
      },
    ]),
    callout(
      'info',
      [
        'One 家族：TSone（前端框架）· TransOne（跨端框架）· BackOne（后端框架）。本仓库当前承载 TransOne 的两个发布包。',
      ],
      '家族'
    ),
  ],
};

// ---- 核心框架 ----

export const transonePackagePage: DocPage = {
  path: '/packages/transone',
  title: 'transone 核心框架',
  description: '核心框架包：安装、公开 API 一览、子路径导出与模块目录。',
  section: 'packages',
  order: 1,
  body: [
    heading(1, 'transone'),
    paragraph(
      strong('核心框架包'),
      '：纯 TypeScript 实现，TypeScript 为第一公民，公开 API 提供完整类型定义；零外部运行时依赖。Web 端与 TSone 同源，产物可复用 TSone 的渲染策略与组件生态。',
    ),
    heading(2, '安装'),
    codeBlock('bash', `bun add transone`),
    heading(2, '公开 API 一览'),
    apiTable('入口导出', [
      { name: 'createApp', type: '(options: AppOptions) => OneApp', description: '创建应用实例；root 为根组件，document 配置 HTML 壳。' },
      { name: 'Component', type: 'abstract class', description: '组件基类：initState / initStyles / render + 生命周期钩子。' },
      { name: 'createComponent', type: '(descriptor) => VNode', description: '创建组件 VNode（支持 props / children / key）。' },
      { name: 'h / Div / P / H1 / …', type: 'VNode 工厂', description: '元素快捷工厂：Div、Span、H1–H6、Table 等。' },
      { name: 'reactive / effect / computed / ref', type: '响应式 API', description: '响应式系统核心。' },
      { name: 'createRouter / RouterView / RouterLink', type: '路由 API', description: '内置路由，支持 base 子路径与导航守卫。' },
      { name: 'StyleManager / renderHtmlDocument', type: '样式与文档', description: '组件样式管理；SSR 文档壳渲染。' },
      { name: 'version / name', type: '常量', description: '框架版本与包名。' },
    ]),
    heading(2, '子路径导出'),
    paragraph('按功能域提供子路径导出，便于摇树与按需引用：'),
    table(
      ['导出路径', '内容'],
      [
        ['transone', '入口：core + router 全量'],
        ['transone/router', '路由：createRouter / RouterView / RouterLink'],
        ['transone/style', '样式：StyleManager 与样式类型'],
        ['transone/dom', 'DOM 渲染模块（createDomWindow / installDomGlobals 等）'],
      ]
    ),
    heading(2, '模块目录'),
    paragraph('按源码模块拆分，逐一深入：'),
    ul([
      [link('应用与组件模型', '/transone/packages/transone/application'), ' · createApp / OneApp / 组件 / 生命周期 / 数据模型表单'],
      [link('响应式系统', '/transone/packages/transone/reactivity'), ' · reactive / ref / computed / effect / watch / 调度器'],
      [link('渲染层与模板', '/transone/packages/transone/renderer'), ' · VNode / 策略分发 / 元素工厂 / TemplateEngine'],
      [link('路由', '/transone/packages/transone/router'), ' · createRouter / 守卫 / RouterView / 双模式 / base'],
      [link('样式系统', '/transone/packages/transone/style'), ' · StyleManager / StyleSheet / rpx 单位'],
      [link('服务端渲染与 DOM', '/transone/packages/transone/ssr'), ' · renderHtmlDocument / SSR 同构 / DOM 模拟'],
    ]),
    heading(2, '示例'),
    paragraph('完整示例见快速开始页面，或仓库内 playground/counter 演练项目。'),
    ul([
      [link('npm: transone', 'https://www.npmjs.com/package/transone')],
      [link('源码：packages/transone', 'https://github.com/geektech/transone/tree/main/packages/transone')],
    ]),
  ],
};

// ---- 编译器 ----

export const transoneCliPackagePage: DocPage = {
  path: '/packages/transone-cli',
  title: 'transone-cli 多端编译器',
  description: '编译器包：Target 抽象、命令一览、配置与部署形态。',
  section: 'packages',
  order: 8,
  body: [
    heading(1, 'transone-cli'),
    paragraph(
      strong('Bun-native 多端编译器'),
      '：按 Target 将同一份 TypeScript 源码静态转换为 Web 与多端小程序原生工程。包含目标端抽象（Target）、CLI 命令、开发服务器与配置解析。',
    ),
    heading(2, '安装'),
    codeBlock('bash', `bun add -d transone-cli`),
    heading(2, '命令一览'),
    table(
      ['命令', '说明'],
      [
        ['transone create', '交互式创建项目骨架。'],
        ['transone dev', '启动开发服务器（--host / --port / --base / --no-watch）。'],
        ['transone build', '构建产物（--target / --out-dir / --base / --library）。'],
      ]
    ),
    heading(2, 'Target 抽象'),
    paragraph(
      '每个端一个编译目标，编译器按 Target 分发代码生成。',
      inlineCode('--target'),
      ' 取值：',
      inlineCode('web'),
      '、',
      inlineCode('mp-weixin'),
      '、',
      inlineCode('mp-alipay'),
      '、',
      inlineCode('mp-bytedance'),
      '、',
      inlineCode('app-ios'),
      '、',
      inlineCode('app-android'),
      '、',
      inlineCode('app-harmony'),
      '（默认 web；未实现的端编译期快速报错）。',
    ),
    heading(2, '模块目录'),
    paragraph('按编译器源码模块拆分，逐一深入：'),
    ul([
      [link('CLI 命令', '/transone/packages/transone-cli/commands'), ' · create / dev / build 与全部参数'],
      [link('配置', '/transone/packages/transone-cli/config'), ' · transone.config.ts / defineConfig / 字段与覆盖顺序'],
      [link('目标端抽象', '/transone/packages/transone-cli/targets'), ' · BuildTarget / TargetRegistry / web 与小程序目标'],
      [link('构建流程与产物', '/transone/packages/transone-cli/build'), ' · SSR 静态多页 / 库打包 / 小程序产物'],
    ]),
    heading(2, '子路径部署'),
    paragraph(
      'GitHub Pages 等静态托管把项目挂在子路径下（如',
      inlineCode('/transone/'),
      '）。CLI 的',
      inlineCode('--base'),
      ' 选项让 SSR 与客户端路由都感知子路径：',
    ),
    codeBlock('bash', `transone build --target web --base /transone/
transone build --target web --base /transone/cli/`),
    callout(
      'tip',
      [
        '完整命令、配置与目标端文档见',
        link('CLI 文档子站', './cli/'),
        '。',
      ],
      '前往'
    ),
  ],
};
