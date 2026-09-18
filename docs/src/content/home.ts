import {
  hero,
  featureGrid,
  linkGrid,
  type DocPage,
} from './types';

export const homePage: DocPage = {
  path: '/',
  title: 'TransOne 文档',
  description: '一套 TypeScript 源码，编译期静态转换为 Web 与多端小程序产物的跨端前端框架。',
  section: 'guide',
  order: -1,
  body: [
    hero(
      '跨端前端框架 · M1 Web / M2 微信小程序已落地',
      '一套 TypeScript 源码，多端原生产物',
      'TransOne 通过编译期静态转换（transpile / transform），把同一份 TypeScript 源码输出为 Web 与微信 / 阿里 / 字节小程序原生工程，产物不携带框架运行时；未来扩展 iOS / Android / 鸿蒙原生 App。',
      [
        { label: '快速开始', href: '/guide/getting-started', primary: true },
        { label: '定位与设计', href: '/guide/positioning' },
        { label: 'GitHub', href: 'https://github.com/geektech-team/transone' },
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
        title: '多端 Target 抽象',
        description: 'web / mp-weixin / mp-alipay / mp-bytedance，远期 app-ios / app-android / app-harmony。',
      },
      {
        title: '零运行时桥接',
        description: '与 uni-app 运行时桥接划清界限：产物即原生工程，直接由各平台官方工具链构建发布。',
      },
    ]),
    linkGrid([
      {
        title: '快速开始',
        description: '安装、应用骨架、组件示例与多端构建命令。',
        href: '/guide/getting-started',
      },
      {
        title: '核心概念',
        description: '响应式、组件模型、渲染策略、路由与样式。',
        href: '/guide/core-concepts',
      },
      {
        title: '子包文档',
        description: 'transone 核心框架与 transone-cli 多端编译器。',
        href: '/packages',
      },
      {
        title: 'CLI 文档',
        description: 'transone create / dev / build 命令与配置参考。',
        // './' 前缀 = 站点相对链接（渲染为指向 /cli/ 子站的普通链接）
        href: './cli/',
      },
    ]),
  ],
};
