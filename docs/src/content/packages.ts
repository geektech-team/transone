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
  description: 'TransOne monorepo 中各发布包的文档入口：核心框架与多端编译器。',
  section: 'packages',
  order: 0,
  body: [
    heading(1, '子包文档'),
    paragraph(
      'TransOne 是 Bun workspace monorepo。每个发布包拥有独立的文档：核心框架文档即本站（本文档站由 TransOne 自身构建），编译器文档部署在',
      inlineCode('/cli/'),
      '子路径。未来加入新包时，按同样方式在',
      inlineCode('/<pkg>/'),
      '下新增子站并在',
      ' docs-pages.yml',
      ' 合并即可。',
    ),
    linkGrid([
      {
        title: 'transone',
        description: '核心框架：响应式、组件、渲染、路由、样式，SSR 文档渲染。',
        href: '/packages/transone',
      },
      {
        title: 'transone-cli',
        description: '多端编译器：Target 抽象、transone create / dev / build 命令。',
        href: '/packages/transone-cli',
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
  description: '核心框架包：安装、公开 API 一览与子路径导出。',
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
  description: '编译器包：Target 抽象、命令一览与部署形态。',
  section: 'packages',
  order: 2,
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
