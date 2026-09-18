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

/**
 * transone-cli 编译器模块文档。
 *
 * 每个模块页介绍一个功能域：命令、配置、目标端抽象与构建流程。
 * 与 packages/transone-cli/src 下的源码模块一一对应。
 */

// ---- 命令 ----

export const cliCommandsPage: DocPage = {
  path: '/packages/transone-cli/commands',
  title: 'CLI 命令',
  description: 'transone create / dev / build 三个命令与全部参数。',
  section: 'packages',
  order: 9,
  body: [
    heading(1, 'CLI 命令'),
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
    table(
      ['命令', '参数', '说明'],
      [
        ['transone create', '—', '交互式创建项目骨架（src/main.ts、transone.config.ts 等）。'],
        ['transone dev', '--host · --port · --base · --no-watch', '启动开发服务器，SSR + 浏览器刷新。'],
        ['transone build', '--target · --out-dir · --base · --library', '构建站点或库（--library 走库打包管线）。'],
      ]
    ),
    heading(2, 'create：项目骨架'),
    paragraph(
      inlineCode('createProject()'),
      ' 在当前目录生成可运行的最小工程：入口、配置与多端构建脚本。内置常量',
      inlineCode('TRANSONE_FRAMEWORK_VERSION'),
      ' / ',
      inlineCode('TRANSONE_CLI_VERSION'),
      ' 保证脚手架版本与编译器一致。',
    ),
    heading(2, 'dev：开发服务器'),
    paragraph(
      inlineCode('startDevServer(options)'),
      ' 启动开发服务器：按配置加载入口与页面，SSR 渲染首屏，客户端',
      inlineCode('main.js'),
      ' 挂载接管交互；',
      inlineCode('--no-watch'),
      ' 关闭文件监听（CI / 只读场景）。',
      inlineCode('--base'),
      ' 让 SSR 注入的 URL 带上子路径，与部署形态一致。',
    ),
    heading(2, 'build：构建产物'),
    paragraph(
      inlineCode('build(options)'),
      ' 返回',
      inlineCode('BuildResult'),
      '（root / outDir / assetsBuilt）。默认构建站点（多页静态 HTML + 客户端 bundle），',
      inlineCode('--library'),
      ' 构建可发布的 ESM 库。',
      inlineCode('--target'),
      ' 选择编译端（默认 web）。',
    ),
    callout(
      'tip',
      [
        '完整的逐命令说明与示例见',
        link('CLI 文档子站 · 命令', './cli/guide/commands'),
        '。',
      ],
      '前往'
    ),
  ],
};

// ---- 配置 ----

export const cliConfigPage: DocPage = {
  path: '/packages/transone-cli/config',
  title: '配置',
  description: 'transone.config.ts、defineConfig / resolveConfig 与配置字段。',
  section: 'packages',
  order: 10,
  body: [
    heading(1, '配置'),
    paragraph(
      '工程根目录的',
      inlineCode('transone.config.ts'),
      ' 用',
      inlineCode('defineConfig'),
      ' 声明配置；',
      inlineCode('resolveConfig'),
      ' 合并默认值与 CLI 参数（CLI 参数优先）后得到 ResolvedConfig。',
    ),
    codeBlock(
      'ts',
      `import { defineConfig } from 'transone-cli';

export default defineConfig({
  entry: 'src/main.ts',
  pages: { '/': 'src/main.ts', '/about': 'src/main.ts' },
  server: { host: '127.0.0.1', port: 52310 },
  build: { outDir: 'dist', basePath: '', directoryPages: true },
});`,
    ),
    apiTable('UserConfig 字段', [
      { name: 'entry', type: 'string', description: '默认入口（默认 src/main.ts），供单入口场景使用。' },
      { name: 'pages', type: 'Record<string, string>', description: '路由 → 入口文件映射（多页站点）。' },
      { name: 'server', type: 'ServerConfig', description: 'dev 服务器：host / port / proxy（开发代理）。' },
      { name: 'build.outDir', type: 'string', description: '站点产物目录（默认 dist）。' },
      { name: 'build.basePath', type: 'string', description: '部署基础路径（如 /transone/），默认空串表示站点根路径。' },
      { name: 'build.directoryPages', type: 'boolean', description: '每个页面输出为目录 + index.html（/{route}/index.html），默认输出扁平 {route}.html。' },
      { name: 'library', type: 'LibraryConfig', description: '库打包配置（--library 时使用）：entry / outDir / external / tsconfigs / dts / splitting / sourcemap / minify。' },
      { name: 'mp', type: 'MiniProgramConfig | MiniProgramConfigMap', description: '小程序目标端配置：单一配置（作用于所有 mp 目标），或按平台分组（mp[\'mp-weixin\'] / mp[\'mp-alipay\'] / mp[\'mp-bytedance\']），构建时只取当前 target 对应的一份。' },
    ]),
    heading(2, '解析与覆盖'),
    ul([
      [strong('默认值：'), 'entry=src/main.ts、target=web、outDir=dist、basePath=空、directoryPages=false。'],
      [strong('覆盖顺序：'), 'CLI 参数（--out-dir / --base / --target / --port 等）覆盖 transone.config.ts，配置覆盖默认值。'],
      [strong('动态求值：'), '配置在 Node/Bun 环境求值，可读取环境变量或按平台分支（文档站即用 process.env 切换 base）。'],
    ]),
    callout(
      'tip',
      [
        '字段的完整语义与示例见',
        link('CLI 文档子站 · 配置', './cli/guide/config'),
        '。',
      ],
      '前往'
    ),
  ],
};

// ---- 目标端抽象 ----

export const cliTargetsPage: DocPage = {
  path: '/packages/transone-cli/targets',
  title: '目标端抽象',
  description: 'BuildTarget 接口、TargetRegistry 注册表与 web / 小程序目标端实现。',
  section: 'packages',
  order: 11,
  body: [
    heading(1, '目标端抽象'),
    paragraph(
      '“一套 TS 源码，多端原生产物”的核心：每个端一个',
      inlineCode('BuildTarget'),
      '，编译器按',
      inlineCode('--target'),
      ' 分发构建；新增目标端只需实现接口并注册，无需改动构建入口。',
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
    ul([
      [link('CLI 文档子站 · 目标端', './cli/guide/targets')],
      [link('构建流程与产物', '/transone/packages/transone-cli/build')],
    ]),
  ],
};

// ---- 构建流程 ----

export const cliBuildPage: DocPage = {
  path: '/packages/transone-cli/build',
  title: '构建流程与产物',
  description: '站点构建（SSR + 静态多页）、库打包（--library）与小程序产物。',
  section: 'packages',
  order: 12,
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
      [link('部署到 GitHub Pages 的工作流', '/transone/packages/transone-cli/commands')],
      [link('目标端抽象与注册表', '/transone/packages/transone-cli/targets')],
    ]),
  ],
};
