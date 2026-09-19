import {
  callout,
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

// ---- 落地页（父菜单 项目，路径 /project/）----

export const projectLandingPage: DocPage = {
  path: '/project',
  title: '项目',
  description: 'TransOne 项目级文档：品牌定位、目标端支持矩阵与 M1–M4 路线图。',
  section: 'project',
  order: -1,
  body: [
    hero(
      'TransOne 项目',
      '一套 TypeScript 源码，多端原生产物',
      '项目级文档面向 TransOne 整体：定位与设计原则、各目标端的支持状态，以及 M1–M4 里程碑路线图。',
      [
        { label: '定位与设计', href: '/project/positioning', primary: true },
        { label: '路线图', href: '/project/roadmap' },
        { label: 'GitHub', href: GITHUB_URL },
      ]
    ),
    featureGrid([
      {
        title: '编译期静态转换',
        description: '静态分析 VNode 子集 → 目标端原生模板 / 组件代码，产物即原生工程、零运行时桥接。',
      },
      {
        title: '多端 Target 抽象',
        description: 'web / mp-weixin / mp-alipay / mp-bytedance 已实现，app-* 远期占位。',
      },
      {
        title: 'OOP + 策略模式 + SOLID',
        description: '渲染与编译行为按 Strategy 拆分，对齐 TSone 项目设计约束。',
      },
      {
        title: 'Bun-first 工具链',
        description: '安装、测试、构建与文档全链 Bun 驱动，零外部运行时依赖。',
      },
    ]),
    heading(2, '子文档'),
    linkGrid([
      {
        title: '定位与设计',
        description: '品牌定位、技术路线对比、能力边界与架构方向。',
        href: '/project/positioning',
      },
      {
        title: '目标端矩阵',
        description: '各目标端的产物形态、生成机制与落地状态。',
        href: '/project/targets',
      },
      {
        title: '路线图',
        description: 'M1–M4 里程碑、验收标准与开放问题。',
        href: '/project/roadmap',
      },
    ]),
  ],
};

// ---- 定位与设计 ----

export const positioningPage: DocPage = {
  path: '/project/positioning',
  title: '定位与设计',
  description: 'TransOne 的品牌定位、技术路线对比、能力边界与架构方向。',
  section: 'project',
  order: 1,
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
      '每个端一个编译目标（Target），编译器按 Target 分发代码生成：web 直接渲染（与 TSone 一致）；mp-weixin 产出 WXML / WXSS / JS；mp-alipay 与 mp-bytedance 已实现；app-* 为远期占位。编译流水线：入口文档 → 静态分析（可编译性校验）→ VNode 子集抽取 → 各 Target 代码生成 → 原生工程文件输出。',
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

// ---- 目标端矩阵 ----

export const targetsPage: DocPage = {
  path: '/project/targets',
  title: '目标端支持矩阵',
  description: '各目标端的产物形态、生成机制与落地状态（项目级总览）。',
  section: 'project',
  order: 2,
  body: [
    heading(1, '目标端支持矩阵'),
    table(
      ['目标端', '产物形态', '生成机制', '状态'],
      [
        ['Web（H5）', '静态站点 / SPA', '复用 TSone 策略化渲染', '已实现（M1）'],
        ['微信小程序', '原生小程序工程', '编译期静态转换', '已实现（M2）'],
        ['阿里小程序（支付宝 / 淘宝）', '原生小程序工程', '编译期静态转换', '已实现（M3）'],
        ['字节小程序（抖音）', '原生小程序工程', '编译期静态转换', '已实现（M3）'],
        ['iOS', '原生 App', 'TBD', '远期'],
        ['Android', '原生 App', 'TBD', '远期'],
        ['鸿蒙', '原生 App（ArkUI）', 'TBD', '远期'],
      ]
    ),
    callout(
      'warn',
      [
        '以上为规划目标，实际落地进度以路线图为准。未实现的目标端会在编译期快速报错并给出对应阶段。',
        '目标端的实现细节见',
        link('CLI · 目标端', '/cli/targets'),
        '。',
      ],
      '注意'
    ),
    heading(2, '本站在各端的产物'),
    paragraph(
      '本文档站本身就是 transone 的 Web 产物（',
      inlineCode('transone build'),
      '），以 directoryPages 多页形态部署到 GitHub Pages 子路径——base 推导、SSR 内容渲染与客户端路由均跑在框架自身能力上。',
    ),
  ],
};

// ---- 路线图 ----

export const roadmapPage: DocPage = {
  path: '/project/roadmap',
  title: '路线图',
  description: 'M1–M4 里程碑、验收标准与开放问题。',
  section: 'project',
  order: 3,
  body: [
    heading(1, '路线图'),
    table(
      ['里程碑', '内容', '验收标准'],
      [
        ['M1', 'Web 产物：迁移 / 复用 TSone 核心到 transone，建立 monorepo 骨架', 'transone build --target web 产出可运行 H5 站点（已完成）'],
        ['M2', '微信小程序：泛化 TSone build --mp-weixin 为 Target 抽象', 'transone build --target mp-weixin 产出可被微信开发者工具打开的原生工程（已完成）'],
        ['M3', '阿里、字节小程序：新增 mp-alipay / mp-bytedance Target', '两端均产出可构建的原生工程；沉淀跨端差异层（已完成）'],
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
