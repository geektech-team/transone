import {
  callout,
  featureGrid,
  hero,
  inlineCode,
  linkGrid,
  paragraph,
  type DocPage,
} from './types';

const GITHUB_URL = 'https://github.com/geektech-team/transone';

/**
 * 主页（/）：只展示各个子包 / 项目的入口卡片，不再堆叠任何子包内容。
 * 子包内容各自独立在 /transone/、/cli/、/ui/、/transone-chart/、/project/ 下。
 */
export const homePage: DocPage = {
  path: '/',
  title: 'TransOne 文档',
  description: '一套 TypeScript 源码，多端原生产物 —— TransOne 跨端前端框架文档。',
  section: 'home',
  order: -1,
  body: [
    hero(
      'TransOne 项目 · 跨端前端框架',
      '一套 TypeScript 源码，多端原生产物',
      'TransOne 把同一份 TypeScript 源码经编译期静态转换输出为 Web 与微信 / 阿里 / 字节小程序原生工程，未来扩展原生 App。选择子包进入对应文档：',
      [
        { label: 'transone 框架', href: '/transone', primary: true },
        { label: 'transone-chart 图表库', href: '/transone-chart' },
        { label: 'GitHub', href: GITHUB_URL },
      ]
    ),
    linkGrid([
      {
        title: 'transone',
        description: '跨端前端框架：响应式、类组件、策略化渲染、路由与样式，一套源码编译到多端。',
        href: '/transone',
      },
      {
        title: 'transone-cli',
        description: '多端编译器：create / dev / build 命令、配置与各目标端代码生成。',
        href: '/cli',
      },
      {
        title: 'transone-ui',
        description: '跨端组件库：Button / Input / Toast 等 17 个组件，Web 与小程序共用。',
        href: '/ui',
      },
      {
        title: 'transone-chart',
        description: '跨端图表库：折线 / 柱状 / 饼图 / 雷达，Canvas 2D 渲染，Web 与小程序共用。',
        href: '/transone-chart',
      },
      {
        title: '项目',
        description: '项目级文档：定位与设计、目标端支持矩阵、M1–M4 路线图。',
        href: '/project',
      },
    ]),
    featureGrid([
      {
        title: '子包独立文档',
        description: '每个子包有自己的落地页与侧边栏，只展示本包内容，入口统一在主页。',
      },
      {
        title: '同一份源码',
        description: '本站由 transone 构建（' + 'transone build' + '），文档本身即框架的 Web 产物。',
      },
    ]),
    paragraph(
      inlineCode(
        'monorepo：packages/transone · transone-cli · transone-ui · transone-chart，playground/* 为演练与 Demo。'
      )
    ),
    callout(
      'info',
      [
        'One 家族：TSone（前端框架）· TransOne（跨端框架）· BackOne（后端框架）。',
      ],
      '家族'
    ),
  ],
};
