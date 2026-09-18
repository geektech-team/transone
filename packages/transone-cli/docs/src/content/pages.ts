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

// ---- 首页 ----

export const cliHomePage: DocPage = {
  path: '/',
  title: 'TransOne CLI 文档',
  description: 'Bun-native 多端编译器：Target 抽象、CLI 命令与配置参考。',
  section: 'guide',
  order: -1,
  body: [
    hero(
      'Bun-native 多端编译器 · Target 抽象',
      '一份 TypeScript 源码，按 Target 静态转换',
      'transone-cli 把同一份 TypeScript 源码按目标端（web / mp-weixin / mp-alipay / mp-bytedance / app-*）静态转换为原生工程，产物不携带框架运行时；编译期快速失败，未实现的端直接报错。',
      [
        { label: '快速开始', href: '/guide/getting-started', primary: true },
        { label: '命令参考', href: '/guide/commands' },
        { label: 'GitHub', href: GITHUB_URL },
      ]
    ),
    featureGrid([
      {
        title: 'Target 抽象',
        description: '每个端一个编译目标（BuildTarget），按 Target 分发代码生成，新增端无需改动构建入口。',
      },
      {
        title: '编译期静态转换',
        description: '静态分析 VNode 子集 → 目标端原生模板 / 组件代码，产物即原生工程。',
      },
      {
        title: '子路径部署',
        description: '--base 选项让 SSR 与客户端路由感知部署子路径（如 /transone/cli/）。',
      },
      {
        title: 'Bun-first',
        description: 'Bun 构建、Bun 开发服务器，纯 TypeScript 实现，零外部运行时依赖。',
      },
      {
        title: '快速失败',
        description: '不支持的 Target、参数与配置在编译期报错并给出可读信息。',
      },
      {
        title: '库构建',
        description: '--library 模式产出可发布的 ESM bundle 与 .d.ts（需 config.library）。',
      },
    ]),
    linkGrid([
      {
        title: '快速开始',
        description: '安装、项目骨架与第一个构建。',
        href: '/guide/getting-started',
      },
      {
        title: '命令参考',
        description: 'create / dev / build 与全部参数。',
        href: '/guide/commands',
      },
      {
        title: '配置参考',
        description: 'transone.config.ts、默认值与 CLI 覆盖。',
        href: '/guide/config',
      },
      {
        title: '核心框架文档',
        description: 'transone 主文档站。',
        href: './',
      },
    ]),
  ],
};

// ---- 快速开始 ----

export const cliGettingStartedPage: DocPage = {
  path: '/guide/getting-started',
  title: '快速开始',
  description: '安装 CLI、生成项目骨架，并完成第一次多端构建。',
  section: 'guide',
  order: 0,
  body: [
    heading(1, '快速开始'),
    heading(2, '安装'),
    paragraph('在 Bun workspace 或独立项目中使用以下命令同时安装框架与编译器：'),
    codeBlock('bash', `bun add transone transone-cli`),
    paragraph('仅把编译器作为开发依赖安装：'),
    codeBlock('bash', `bun add -d transone-cli`),
    heading(2, '创建项目骨架'),
    paragraph(
      '在空目录执行',
      inlineCode('transone create'),
      '：生成 package.json（dev / build / typecheck 脚本）、transone.config.ts、tsconfig.json 与入口 src/main.ts。',
      strong('若目录已存在同名文件，命令拒绝覆盖并报错。'),
    ),
    codeBlock('bash', `mkdir my-app && cd my-app
transone create

bun dev            # 等价于 transone dev，启动开发服务器
bun run build      # 等价于 transone build，默认构建 web 目标端`),
    heading(2, '入口约定'),
    paragraph(
      'src/main.ts 导出名为',
      inlineCode('app'),
      ' 的应用实例：',
      inlineCode('createApp({ root, document })'),
      ' 返回的对象含',
      inlineCode('renderHtmlDocument'),
      '，并在模块作用域调用',
      inlineCode('app.mount()'),
      '。这份源码同时驱动 SSR 文档壳与客户端挂载。',
    ),
    heading(2, '构建多端'),
    codeBlock('bash', `transone build --target web            # H5 静态站点（M1 已实现）
transone build --target mp-weixin     # 微信小程序原生工程（M2 已实现）
transone build --target mp-alipay     # 阿里小程序（M3 规划，编译期报错）
transone build --target mp-bytedance  # 字节小程序（M3 规划，编译期报错）`),
    callout(
      'info',
      ['未实现的 Target 会在编译期快速报错并给出路线图阶段，而不是产出残缺产物。'],
      '快速失败'
    ),
    heading(2, '下一步'),
    ul([
      [link('命令参考', '/guide/commands'), '：dev / build 的全部参数。'],
      [link('配置参考', '/guide/config'), '：transone.config.ts 与默认值。'],
      [link('目标端', '/guide/targets'), '：Target 抽象与新增目标端。'],
    ]),
  ],
};

// ---- 命令 ----

export const cliCommandsPage: DocPage = {
  path: '/guide/commands',
  title: '命令参考',
  description: 'transone create / dev / build 的用法、参数与示例。',
  section: 'guide',
  order: 1,
  body: [
    heading(1, '命令参考'),
    codeBlock(
      'text',
      `Usage:
  transone create
  transone dev [--host <host>] [--port <port>] [--base <path>] [--no-watch]
  transone build [--target <target>] [--out-dir <path>] [--base <path>] [--library]

Targets: web, mp-weixin, mp-alipay, mp-bytedance, app-ios, app-android, app-harmony (default: web)`
    ),
    heading(2, 'transone create'),
    paragraph('交互式创建项目骨架（不传参数、不可用选项）。已存在文件时拒绝覆盖。'),
    codeBlock('bash', `transone create
# TransOne project created at /path/to/my-app (5 files)`),
    heading(2, 'transone dev'),
    table(
      ['参数', '默认值', '说明'],
      [
        ['--host <host>', '127.0.0.1', '监听地址。'],
        ['--port <port>', '52211', '监听端口（0–65535 整数）。'],
        ['--base <path>', '（空）', '以子路径模式预览，与线上部署一致。'],
        ['--no-watch', 'false', '关闭文件监听（watch 模式默认开启）。'],
      ]
    ),
    codeBlock('bash', `transone dev --port 52311
transone dev --base /transone/ --no-watch`),
    heading(2, 'transone build'),
    table(
      ['参数', '默认值', '说明'],
      [
        ['--target <target>', 'web', '目标端；未实现的端编译期报错。'],
        ['--out-dir <path>', 'dist/build/h5', '产物输出目录。'],
        ['--base <path>', '（空）', '部署子路径（GitHub Pages 场景）。'],
        ['--library', 'false', '库构建：产出 ESM bundle + .d.ts（需 config.library）。'],
      ]
    ),
    codeBlock('bash', `transone build --target web
transone build --target mp-weixin --out-dir dist/mp-wx
transone build --target web --base /transone/
transone build --library`),
  ],
};

// ---- 配置 ----

export const cliConfigPage: DocPage = {
  path: '/guide/config',
  title: '配置参考',
  description: 'transone.config.ts、defineConfig、默认值、多页与 CLI 覆盖。',
  section: 'guide',
  order: 2,
  body: [
    heading(1, '配置参考'),
    paragraph(
      '在项目根目录创建可选的 transone.config.ts。配置文件只支持普通对象默认导出；',
      inlineCode('defineConfig()'),
      ' 提供类型检查而不改变对象本身。',
    ),
    codeBlock(
      'typescript',
      `import { defineConfig } from 'transone-cli';

export default defineConfig({
  entry: 'src/main.ts',
  pages: {
    '/about': 'src/pages/about.ts',
  },
  server: {
    port: 52311,
  },
  build: {
    outDir: 'dist/web',
    basePath: '',
    directoryPages: true,
  },
  mp: {
    appId: 'touristappid',
    navigationBarTitleText: 'TransOne',
  },
});`
    ),
    heading(2, '配置项'),
    apiTable('transone.config.ts 字段', [
      { name: 'entry', type: 'string', description: '应用入口，默认 src/main.ts；入口必须存在。' },
      { name: 'pages', type: 'Record<string, string>', description: '多页映射：路由 → 页面入口；根路由由 entry 占用。' },
      { name: 'server.host / port / proxy', type: 'object', description: '开发服务器：地址、端口（默认 52211）与代理前缀映射。' },
      { name: 'build.outDir', type: 'string', description: '构建输出目录，默认 dist/build/h5。' },
      { name: 'build.basePath', type: 'string', description: '部署子路径前缀（如 /transone/one），默认空。' },
      { name: 'build.directoryPages', type: 'boolean', description: '目录式页面（route/index.html），适合 GitHub Pages 子路径。' },
      { name: 'library', type: 'object', description: '库构建配置：entry / outDir / external / tsconfigs / dts / splitting / sourcemap / minify。' },
      { name: 'mp', type: 'object', description: '小程序构建配置：appId / outDir / pages / navigationBarTitleText / tabBar 等。' },
    ]),
    heading(2, 'CLI 覆盖'),
    paragraph('命令行参数会覆盖配置文件对应字段（内联 > 文件 > 默认值）：'),
    table(
      ['CLI 参数', '覆盖字段'],
      [
        ['--target', '目标端选择'],
        ['--out-dir', 'build.outDir'],
        ['--base', 'build.basePath'],
        ['--host / --port', 'server.host / server.port'],
      ]
    ),
    heading(2, '子路径部署'),
    paragraph(
      'GitHub Pages 项目页挂在子路径下（如',
      inlineCode('/transone/cli/'),
      '）。构建时传入',
      inlineCode('--base'),
      '，SSR 渲染与客户端路由都会感知子路径；配合',
      inlineCode('directoryPages'),
      '，每个路由产出独立的',
      inlineCode('index.html'),
      '，无需服务端重写。本文档子站即此模式：',
    ),
    codeBlock('bash', `transone build --target web --base /transone/cli/`),
  ],
};

// ---- 目标端 ----

export const cliTargetsPage: DocPage = {
  path: '/guide/targets',
  title: '目标端',
  description: 'Target 抽象、内置目标端与新增目标端的方式。',
  section: 'guide',
  order: 3,
  body: [
    heading(1, '目标端'),
    paragraph(
      '每个端一个编译目标。编译器按',
      inlineCode('--target'),
      ' 解析注册表并分发到对应',
      inlineCode('BuildTarget'),
      ' 实现——新增目标端实现接口并注册即可，无需改动构建入口。',
    ),
    table(
      ['Target', '产物', '状态'],
      [
        ['web', 'H5 静态站点 / SPA（复用 TSone 策略化渲染）', '已实现（M1）'],
        ['mp-weixin', 'WXML / WXSS / JS 原生小程序工程', '已实现（M2）'],
        ['mp-alipay', 'AXML / ACSS 原生小程序工程', '规划（M3）'],
        ['mp-bytedance', 'ttml / ttss 原生小程序工程', '规划（M3）'],
        ['app-ios / app-android / app-harmony', '原生 App', '远期占位'],
      ]
    ),
    callout(
      'info',
      ['未实现的 Target 会注册为占位目标（PlaceholderTarget），构建时快速报错。'],
      '占位目标'
    ),
    heading(2, '新增目标端'),
    ol([
      ['实现 BuildTarget 接口（type / label / build）。'],
      ['把实例注册到 targetRegistry。'],
      ['在 TARGET_TYPES 与 isTargetType 中加入新类型。'],
      ['补充对应端文档与验收测试。'],
    ]),
  ],
};

// ---- API ----

export const cliApiPage: DocPage = {
  path: '/reference/api',
  title: 'API 参考',
  description: 'transone-cli 公开导出一览。',
  section: 'reference',
  order: 0,
  body: [
    heading(1, 'API 参考'),
    paragraph(
      'transone-cli 的公开 API：配置解析、构建、开发服务器、项目创建与 Target 抽象。',
      strong('CLI 使用建议直接走 transone 命令；以下 API 面向工具链集成与测试。'),
    ),
    apiTable('公开导出', [
      { name: 'defineConfig', type: '(config: UserConfig) => UserConfig', description: '类型检查的配置声明辅助函数。' },
      { name: 'resolveConfig', type: '(options?) => Promise<ResolvedConfig>', description: '解析 transone.config.ts + 内联覆盖，返回规范化配置。' },
      { name: 'build', type: '(options: BuildOptions) => Promise<BuildResult>', description: '构建入口：按 Target 分发；--library 走库构建。' },
      { name: 'createProject', type: '(options?) => CreateProjectResult', description: '生成项目骨架（5 个文件），已存在文件时拒绝覆盖。' },
      { name: 'startDevServer', type: '(options?) => Promise<Server>', description: '启动开发服务器（watch 模式默认开启）。' },
      { name: 'TARGET_TYPES / isTargetType', type: 'const / function', description: '目标端清单与类型守卫。' },
      { name: 'targetRegistry / TargetRegistry', type: 'instance / class', description: 'Target 注册表：resolve(type) 分发构建。' },
      { name: 'WebTarget / PlaceholderTarget', type: 'class', description: '内置 web 目标端与占位目标端。' },
      { name: 'BuildTarget', type: 'interface', description: '目标端抽象：type / label / build(config, options)。' },
      { name: '类型：UserConfig / ResolvedConfig / BuildOptions / …', type: 'type', description: '配置与构建相关的全部类型。' },
    ]),
  ],
};
