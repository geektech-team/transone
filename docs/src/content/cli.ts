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

// ---- 落地页（父菜单 transone-cli，路径 /cli/）----

export const cliLandingPage: DocPage = {
  path: '/cli',
  title: 'transone-cli 多端编译器',
  description: 'Bun-native 多端编译器：Target 抽象、CLI 命令与配置参考，把一份 TypeScript 源码静态转换为 Web 与多端小程序原生工程。',
  section: 'cli',
  order: -1,
  body: [
    hero(
      'Bun-native 多端编译器 · Target 抽象',
      '一份 TypeScript 源码，按 Target 静态转换',
      'transone-cli 把同一份 TypeScript 源码按目标端（web / mp-weixin / mp-alipay / mp-bytedance / app-*）静态转换为原生工程，产物不携带框架运行时；编译期快速失败，未实现的端直接报错。',
      [
        { label: '快速开始', href: '/cli/getting-started', primary: true },
        { label: '命令参考', href: '/cli/commands' },
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
        title: '快速失败',
        description: '不支持的 Target、参数与配置在编译期报错并给出可读信息。',
      },
      {
        title: 'Bun-first',
        description: 'Bun 构建、Bun 开发服务器，纯 TypeScript 实现，零外部运行时依赖。',
      },
      {
        title: '子路径部署',
        description: '--base 选项让 SSR 与客户端路由感知部署子路径（如 /transone/）。',
      },
      {
        title: '库构建',
        description: '--library 模式产出可发布的 ESM bundle 与 .d.ts（需 config.library）。',
      },
    ]),
    heading(2, '子文档'),
    linkGrid([
      {
        title: '快速开始',
        description: '安装、项目骨架与第一次多端构建。',
        href: '/cli/getting-started',
      },
      {
        title: '命令参考',
        description: 'create / dev / build 与全部参数。',
        href: '/cli/commands',
      },
      {
        title: '配置参考',
        description: 'transone.config.ts、默认值与 CLI 覆盖。',
        href: '/cli/config',
      },
      {
        title: '目标端',
        description: 'BuildTarget 接口、TargetRegistry 注册表与 web / 小程序目标端实现。',
        href: '/cli/targets',
      },
      {
        title: '构建流程与产物',
        description: '站点构建（SSR + 静态多页）、库打包（--library）与小程序产物。',
        href: '/cli/build',
      },
      {
        title: 'API 参考',
        description: 'transone-cli 公开导出一览（面向工具链集成与测试）。',
        href: '/cli/api',
      },
    ]),
    callout(
      'info',
      [
        '编译器与核心框架配合使用：',
        link('transone 核心框架', '/'),
        ' 提供响应式 / 组件 / 渲染 / 路由 / 样式，',
        link('transone-ui', '/ui'),
        ' 提供跨端组件库。',
      ],
      '生态'
    ),
  ],
};

// ---- 快速开始 ----

export const cliGettingStartedPage: DocPage = {
  path: '/cli/getting-started',
  title: '快速开始',
  description: '安装 CLI、生成项目骨架，并完成第一次多端构建。',
  section: 'cli',
  order: 1,
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
    codeBlock('bash', `transone build --target web            # H5 静态站点（已实现）
transone build --target mp-weixin     # 微信小程序原生工程（已实现）
transone build --target mp-alipay     # 阿里小程序原生工程（已实现）
transone build --target mp-bytedance  # 字节小程序原生工程（已实现）`),
    callout(
      'info',
      ['未实现的 Target 会在编译期快速报错并给出路线图阶段，而不是产出残缺产物。'],
      '快速失败'
    ),
    heading(2, '下一步'),
    ul([
      [link('命令参考', '/cli/commands'), '：dev / build 的全部参数。'],
      [link('配置参考', '/cli/config'), '：transone.config.ts 与默认值。'],
      [link('目标端', '/cli/targets'), '：Target 抽象与新增目标端。'],
    ]),
  ],
};

// ---- 命令 ----

export const cliCommandsPage: DocPage = {
  path: '/cli/commands',
  title: '命令参考',
  description: 'transone create / dev / build 的用法、参数与示例。',
  section: 'cli',
  order: 2,
  body: [
    heading(1, '命令参考'),
    paragraph(
      'CLI 提供三个命令：',
      inlineCode('transone create'),
      '（创建项目）、',
      inlineCode('transone dev'),
      '（开发服务器）、',
      inlineCode('transone build'),
      '（构建产物）。参数解析（',
      inlineCode('src/cli.ts'),
      '）只接受',
      inlineCode('--key value'),
      ' 或',
      inlineCode('--key=value'),
      '，未知命令与未知参数快速报错。',
    ),
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
  path: '/cli/config',
  title: '配置参考',
  description: 'transone.config.ts、defineConfig、默认值、多页与 CLI 覆盖。',
  section: 'cli',
  order: 3,
  body: [
    heading(1, '配置参考'),
    paragraph(
      '在项目根目录创建可选的 transone.config.ts。配置文件只支持普通对象默认导出；',
      inlineCode('defineConfig()'),
      ' 提供类型检查而不改变对象本身；',
      inlineCode('resolveConfig'),
      ' 合并默认值与 CLI 参数（CLI 参数优先）后得到 ResolvedConfig。',
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
      { name: 'build.basePath', type: 'string', description: '部署子路径前缀（如 /transone/），默认空。' },
      { name: 'build.directoryPages', type: 'boolean', description: '目录式页面（route/index.html），适合 GitHub Pages 子路径。' },
      { name: 'library', type: 'object', description: '库构建配置：entry / outDir / external / tsconfigs / dts / splitting / sourcemap / minify。' },
      { name: 'mp', type: 'MiniProgramConfig | MiniProgramConfigMap', description: '小程序目标端配置：单一配置（作用于所有 mp 目标），或按平台分组（mp[\'mp-weixin\'] / mp[\'mp-alipay\'] / mp[\'mp-bytedance\']），构建时只取当前 target 对应的一份。' },
    ]),
    heading(2, '解析与覆盖'),
    ul([
      [strong('默认值：'), 'entry=src/main.ts、target=web、outDir=dist、basePath=空、directoryPages=false。'],
      [strong('覆盖顺序：'), 'CLI 参数（--target / --out-dir / --base / --host / --port 等）覆盖 transone.config.ts，配置覆盖默认值。'],
      [strong('动态求值：'), '配置在 Node/Bun 环境求值，可读取环境变量或按平台分支（文档站即用 process.env 切换 base）。'],
    ]),
    heading(2, '子路径部署'),
    paragraph(
      'GitHub Pages 项目页挂在子路径下（如',
      inlineCode('/transone/'),
      '）。构建时传入',
      inlineCode('--base'),
      '，SSR 渲染与客户端路由都会感知子路径；配合',
      inlineCode('directoryPages'),
      '，每个路由产出独立的',
      inlineCode('index.html'),
      '，无需服务端重写。本文档站即此模式：',
    ),
    codeBlock('bash', `transone build --target web --base /transone/`),
  ],
};

// ---- 目标端 ----

export const cliTargetsPage: DocPage = {
  path: '/cli/targets',
  title: '目标端',
  description: 'BuildTarget 接口、TargetRegistry 注册表、内置目标端与新增目标端的方式。',
  section: 'cli',
  order: 4,
  body: [
    heading(1, '目标端'),
    paragraph(
      '“一套 TS 源码，多端原生产物”的核心：每个端一个',
      inlineCode('BuildTarget'),
      '，编译器按',
      inlineCode('--target'),
      ' 解析注册表并分发到对应实现——新增目标端实现接口并注册即可，无需改动构建入口。',
    ),
    apiTable('BuildTarget 接口', [
      { name: 'type', type: 'TargetType', description: '目标端标识（web / mp-weixin / …）。' },
      { name: 'label', type: 'string', description: '目标端产物形态描述（CLI 输出与文档）。' },
      { name: 'build', type: '(config, options) => Promise<BuildResult>', description: '目标端构建实现。' },
    ]),
    paragraph('内置注册表', inlineCode('TargetRegistry'), '（单例 ', inlineCode('targetRegistry'),
      '）提供 ', inlineCode('register / resolve / getAvailableTargets'),
      '；注册表构造时注册 4 个已实现目标与 3 个远期占位目标：'),
    table(
      ['类型', '实现', '状态'],
      [
        ['web', 'WebTarget', '已实现：多页静态 HTML + SSR + 客户端 bundle'],
        ['mp-weixin', 'MpTarget（微信方言）', '已实现：微信小程序原生工程'],
        ['mp-alipay', 'MpTarget（支付宝方言）', '已实现：支付宝小程序原生工程'],
        ['mp-bytedance', 'MpTarget（字节方言）', '已实现：抖音小程序原生工程'],
        ['app-ios / app-android / app-harmony', 'PlaceholderTarget', '远期：未实现的端编译期快速报错'],
      ]
    ),
    callout(
      'info',
      ['未实现的 Target 会注册为占位目标（PlaceholderTarget），构建时快速报错并给出对应阶段。'],
      '占位目标'
    ),
    heading(2, '小程序编译管线'),
    paragraph(
      '小程序目标（', inlineCode('src/mp'),
      '）是一条完整编译管线：分析（analyze）、绑定（binding）、TS 加载（ts-loader）、折叠（fold）、内联（inline）、方法收集（methods）、状态管理（state）、样式处理（styles）、方言适配（dialect）、代码生成（jsgen）、WXML 生成（wxml）与整体编译（compile / build-mp），产出可直接用官方工具链构建发布的原生工程。',
    ),
    callout(
      'info',
      [
        '方言（dialect）层负责微信 / 支付宝 / 字节三端模板语法差异，',
        inlineCode('mpWeixinTarget / mpAlipayTarget / mpBytedanceTarget'),
        ' 各自绑定一个方言实例。',
      ],
      '方言'
    ),
    heading(2, '新增目标端'),
    ol([
      ['实现 BuildTarget 接口（type / label / build）。'],
      ['把实例注册到 targetRegistry。'],
      ['在 TARGET_TYPES 与 isTargetType 中加入新类型。'],
      ['补充对应端文档与验收测试。'],
    ]),
    ul([
      [link('构建流程与产物', '/cli/build')],
      [link('目标端支持矩阵（项目级）', '/project/targets')],
    ]),
  ],
};

// ---- 构建流程 ----

export const cliBuildPage: DocPage = {
  path: '/cli/build',
  title: '构建流程与产物',
  description: '站点构建（SSR + 静态多页）、库打包（--library）与小程序产物。',
  section: 'cli',
  order: 5,
  body: [
    heading(1, '构建流程与产物'),
    paragraph(
      inlineCode('build(options)'),
      ' 按 target 分发：站点构建（web）与库打包（--library）两条管线；返回',
      inlineCode('BuildResult'),
      '（root / outDir / assetsBuilt）。',
    ),
    heading(2, '站点构建（web）'),
    ol([
      [strong('解析配置：'), 'resolveConfig 合并默认值 / transone.config.ts / CLI 参数（含 --base）。'],
      [strong('打包入口：'), '对每个页面路由用 Bun.build 打包入口为客户端 bundle（main.js）。'],
      [strong('SSR 渲染：'), '为每个页面注入部署 URL（http://127.0.0.1<base><route>），调用入口的 app.renderHtmlDocument 输出 HTML 文档壳（内联样式 + 脚本引用）。'],
      [strong('输出静态产物：'), '按 directoryPages 输出为 /{route}/index.html 或扁平 {route}.html，样式内联、资源相对路径引用，可直接静态托管。'],
    ]),
    paragraph(
      'base 子路径：GitHub Pages 等把站点挂在子路径下（如',
      inlineCode('/transone/'),
      '），',
      inlineCode('--base /transone/'),
      ' 让 SSR 注入的 URL 与客户端路由都感知子路径，产物中链接自动带 base 前缀。',
    ),
    heading(2, '库打包（--library）'),
    paragraph(
      '构建可发布的 ESM 库：Bun.build 产出 bundle，按',
      inlineCode('external'),
      ' 保留外部依赖；随后对',
      inlineCode('tsconfigs'),
      ' 列表逐个运行',
      inlineCode('tsc --project'),
      ' 生成 .d.ts（可关闭 dts）；支持代码分割（splitting）与 linked sourcemap；压缩由 TRANSONE_MINIFY 环境变量控制（未设置为 0 时压缩）。',
    ),
    heading(2, '小程序产物（mp-*）'),
    paragraph(
      '小程序目标把同一入口编译为原生工程：app.json / app.js / 页面 json + js + wxml + wxss（各端方言后缀不同），并用',
      inlineCode('MiniProgramConfig'),
      ' 控制细节。mp 字段支持两种写法：单一配置对所有小程序目标生效；按平台分组时只对当前 target 生效，',
      inlineCode('--target mp-alipay'),
      ' 即取',
      inlineCode("mp['mp-alipay']"),
      '。',
    ),
    codeBlock(
      'ts',
      `// 按平台分组：一套配置管三端，各端独立 appId / outDir / 标题
export default defineConfig({
  mp: {
    'mp-weixin': { appId: 'wx123456', navigationBarTitleText: '微信端' },
    'mp-alipay': { appId: '2024000000000000', navigationBarTitleText: '支付宝端' },
    'mp-bytedance': { appId: 'tt123456', navigationBarTitleText: '抖音端' },
  },
});`,
    ),
    apiTable('MiniProgramConfig 关键字段', [
      { name: 'appId', type: 'string', description: '小程序 appid，默认 touristappid（微信开发者工具测试号）。' },
      { name: 'outDir', type: 'string', description: '小程序产物目录，默认 dist/build/mp-<target>。' },
      { name: 'pages', type: 'Record<string, string>', description: '小程序专用页面路由，默认复用 config.pages。' },
      { name: 'window / tabBar / appExtra', type: 'Record', description: 'app.json 的 window / tabBar / 其他顶层字段合并。' },
      { name: 'lengthUnit', type: "'px' | 'rpx'", description: '样式长度单位，rpx 时数值按 1px=2rpx 换算输出。' },
      { name: 'publicDir / globalData', type: 'string / Record', description: '静态资源复制目录；App 全局数据。' },
    ]),
    heading(2, '配套能力'),
    table(
      ['能力', '模块', '说明'],
      [
        ['文件监听', 'src/watch.ts · createFileWatcher', 'dev / watch 模式的增量重建。'],
        ['开发代理', 'src/proxy.ts · createProxyHandler', 'dev 服务器把接口请求代理到后端。'],
        ['路径安全', 'src/safe-path.ts', '产物路径防目录穿越校验。'],
        ['构建输出', 'src/build-output.ts', '产物分类（JS 入口 / 样式表）与落盘。'],
      ]
    ),
    ul([
      [link('命令参考', '/cli/commands')],
      [link('目标端抽象与注册表', '/cli/targets')],
    ]),
  ],
};

// ---- API ----

export const cliApiPage: DocPage = {
  path: '/cli/api',
  title: 'API 参考',
  description: 'transone-cli 公开导出一览（面向工具链集成与测试）。',
  section: 'cli',
  order: 6,
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
