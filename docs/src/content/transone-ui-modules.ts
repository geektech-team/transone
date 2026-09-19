import {
  apiTable,
  callout,
  codeBlock,
  demo,
  featureGrid,
  heading,
  hero,
  inlineCode,
  link,
  linkGrid,
  paragraph,
  strong,
  ul,
  type DocPage,
} from './types';

/**
 * transone-ui 子包文档（ui 分区父菜单 /ui/）：
 * 落地页 + 快速上手 + 主题定制 + 17 个组件各一页。
 * 组件属性 / 事件均以 packages/transone-ui/lib/components 源码为准。
 */

const GITHUB_UI_URL = 'https://github.com/geektech-team/transone/tree/main/packages/transone-ui';
const NPM_UI_URL = 'https://www.npmjs.com/package/transone-ui';

// ---- 落地页（父菜单 transone-ui，路径 /ui/）----

export const uiLandingPage: DocPage = {
  path: '/ui',
  title: 'transone-ui 跨端 UI 组件库',
  description: '一份 TypeScript 源码，经 transone-cli 静态编译为 Web 与小程序（微信 / 阿里 / 字节）原生产物的跨端组件库，共 17 个受控组件。',
  section: 'ui',
  order: -1,
  body: [
    hero(
      '跨端 UI 组件库 · 17 个受控组件',
      '一份 TypeScript 源码，多端原生 UI',
      'transone-ui 基于 transone 的组件模型：组件全部为受控组件，状态由父级维护、交互通过自定义事件回传；一份源码经 transone-cli 静态编译为 Web 与微信 / 阿里 / 字节小程序原生产物。',
      [
        { label: '快速上手', href: '/ui/getting-started', primary: true },
        { label: '主题定制', href: '/ui/theme' },
        { label: 'npm', href: NPM_UI_URL },
      ]
    ),
    featureGrid([
      {
        title: '全部受控',
        description: '状态由父级维护，click / change / input 等自定义事件回传，双端数据流一致。',
      },
      {
        title: '零依赖自绘',
        description: '开关、勾选框、单选框等全部 CSS 自绘，不依赖端上原生控件，双端渲染一致。',
      },
      {
        title: 'CSS 变量主题',
        description: '15 个设计令牌（--tu-*）开箱即用，Web 注入 :root、小程序在 wxss 覆盖。',
      },
      {
        title: '编译期静态可分析',
        description: 'source 字段约定 + 静态可分析 render，满足 transone-cli 小程序编译约束。',
      },
    ]),
    heading(2, '子文档'),
    linkGrid([
      {
        title: '快速上手',
        description: '安装、受控用法、跨端注意与 source 字段约定。',
        href: '/ui/getting-started',
      },
      {
        title: '主题定制',
        description: '设计令牌表、Web injectTuTheme 与小程序 wxss 覆盖。',
        href: '/ui/theme',
      },
    ]),
    heading(2, '组件（17）'),
    linkGrid([
      { title: 'TuButton 按钮', description: 'type / size / disabled / loading / block / plain / round。', href: '/ui/button' },
      { title: 'TuSwitch 开关', description: '自绘轨道 + 滑块，change 回传布尔值。', href: '/ui/switch' },
      { title: 'TuTag 标签', description: 'type / plain / round / closable，close 回传 name。', href: '/ui/tag' },
      { title: 'TuBadge 徽标', description: '数字 / 文本 / 红点，超 max 显示 max+。', href: '/ui/badge' },
      { title: 'TuInput 输入框', description: '受控 value + 双端事件归一化，clearable。', href: '/ui/input' },
      { title: 'TuCheckbox 复选框', description: '自绘方框 + 对勾，round / square。', href: '/ui/checkbox' },
      { title: 'TuRadio 单选框', description: '自绘圆形 + 圆心点。', href: '/ui/radio' },
      { title: 'TuSearchBar 搜索栏', description: '输入 + 清空 + 取消，search / clear / cancel。', href: '/ui/search-bar' },
      { title: 'TuPopup 弹出层', description: 'top / right / bottom / left 四向滑入滑出。', href: '/ui/popup' },
      { title: 'TuToast 轻提示', description: 'top / center / bottom，父级控制时长。', href: '/ui/toast' },
      { title: 'TuModal 确认弹窗', description: '居中面板 + 遮罩，confirm / cancel / close。', href: '/ui/modal' },
      { title: 'TuActionSheet 动作面板', description: '底部选项列表 + 取消，select 回传索引。', href: '/ui/action-sheet' },
      { title: 'TuTabs 标签页', description: '选项条 + 指示线，equal 均分，change 回传索引。', href: '/ui/tabs' },
      { title: 'TuNavbar 导航栏', description: '左箭头 / 文案、居中标题、右文案，吸顶。', href: '/ui/navbar' },
      { title: 'TuCell 单元格', description: '标题 / 说明 / 值 / 箭头 / 必填标记。', href: '/ui/cell' },
      { title: 'TuProgress 进度条', description: '0.3s 过渡，textInside / showText。', href: '/ui/progress' },
      { title: 'TuEmpty 空状态', description: '图形占位 + 主副文案 + 操作插槽。', href: '/ui/empty' },
    ]),
    callout(
      'info',
      [
        '运行时依赖 ',
        inlineCode('transone'),
        '（>= 0.1.2，peerDependency）；Bun + 纯 TypeScript，零其它运行时依赖。',
      ],
      '依赖'
    ),
  ],
};

// ---- 快速上手 ----

export const uiGettingStartedPage: DocPage = {
  path: '/ui/getting-started',
  title: '快速上手',
  description: '安装、受控组件用法、跨端注意与包 source 字段约定。',
  section: 'ui',
  order: 1,
  body: [
    heading(1, '快速上手'),
    heading(2, '安装'),
    codeBlock('bash', `bun add transone-ui`),
    heading(2, '受控组件用法'),
    paragraph(
      '组件全部为',
      strong('受控组件'),
      '：状态由父级维护，交互通过 ',
      inlineCode('click'),
      ' / ',
      inlineCode('change'),
      ' / ',
      inlineCode('input'),
      ' / ',
      inlineCode('close'),
      ' 等自定义事件回传，父级用 ',
      inlineCode('emitters'),
      ' 订阅：',
    ),
    codeBlock(
      'ts',
      `import { Component, createComponent, h } from 'transone';
import { TuButton, TuInput, TuPopup } from 'transone-ui';

class MyPage extends Component {
  protected initState() {
    return { text: '', popupVisible: false };
  }

  protected render() {
    return h('div', { className: 'page' }, [
      createComponent({
        component: TuInput,
        props: { value: this.state.text, clearable: true },
        emitters: { input: (v: string) => (this.state.text = v) },
      }),
      createComponent({
        component: TuButton,
        props: { type: 'primary' },
        children: ['打开弹层'],
        emitters: { click: () => (this.state.popupVisible = true) },
      }),
      createComponent({
        component: TuPopup,
        props: { visible: this.state.popupVisible, position: 'bottom' },
        children: [h('div', {}, ['弹层内容'])],
        emitters: { close: () => (this.state.popupVisible = false) },
      }),
    ]);
  }
}`
    ),
    paragraph('全部组件与属性 / 事件见', link('组件列表', '/ui'), '下的 17 个组件页。'),
    heading(2, '跨端注意'),
    ul([
      [
        strong('插槽内的动态文本'),
        '：小程序端插槽内容编译在父级 wxml、绑定父级数据；Web 端插槽内容绑定的是组件自身 state（为空时 ',
        inlineCode('{{}}'),
        ' 渲染为空）。不要在组件 children 插槽里写 ',
        inlineCode('{{xxx}}'),
        ' 模板插值，改用模板表达式字符串，例如 ',
        inlineCode('`计数：${this.state.count}`'),
        '，或将动态文本放在页面直属节点。',
      ],
      [
        strong('each() 返回数组'),
        '：作为 children 直接传入（' +
          inlineCode('h("div", {}, each(...))') +
          '），不要再包一层数组字面量（Web 渲染器只铺一层 children）。',
      ],
      [
        strong('子节点类型'),
        '：children 只接受 ',
        inlineCode('VNode | string'),
        '；数字先转字符串（模板表达式自动转换）。',
      ],
      [
        strong('标签映射'),
        '：div → view、span → text；小程序端 text 内不能放 view / slot，所以 TuTag 根节点使用 div。',
      ],
      [
        strong('事件回传'),
        '：组件用 ',
        inlineCode('emit(name, ...args)'),
        ' 回传，父级用 ',
        inlineCode('createComponent({ ..., emitters })'),
        ' 订阅；小程序端编译为页面包装方法并绑定 ',
        inlineCode('bind:name'),
        '，同名事件自动加序号避免覆盖。',
      ],
      [strong('组件内部'), '：渲染（非插槽部分）不要使用 {{}}，一律通过 props 传入数据。'],
    ]),
    heading(2, '小程序端样式与交互适配'),
    ul([
      ['间距不使用 flex ', inlineCode('gap'), '（老内核 WebView 支持不稳定），组件内一律用子元素 ', inlineCode('margin'), ' 实现。'],
      ['样式避免高级选择器（如 ', inlineCode(':not()'),
        '）；条件样式用类名（', inlineCode('--checked'), ' / ', inlineCode('--visible'),
        '）或 ', inlineCode('directions.show'), ' 切换。'],
      ['安全区使用双声明：先写固定值兜底，再写 ', inlineCode('calc(env(safe-area-inset-bottom) + Npx)'), ' 覆盖。'],
      ['列表取数：渲染 ', inlineCode('dataIndex'),
        ' 属性（mp 编译为 ', inlineCode('data-index="{{index}}"'),
        '），回调从 ', inlineCode('e.currentTarget.dataset.index'), ' 读取，双端一致。'],
      [inlineCode('TuSearchBar'), ' 提供 ', inlineCode('confirmType'),
        '（小程序键盘确认键文案），Web 端忽略；回车触发 ', inlineCode('search'), ' 事件。'],
      ['行内 style 的 ', inlineCode('var()'),
        ' 若在端上不解析，同属性在 wxss 类中有默认值兜底；主题定制优先在 ', inlineCode('app.wxss'), ' 覆盖令牌。'],
      ['弹层（Toast / Modal / ActionSheet / Popup）用 ', inlineCode('position: fixed'),
        ' 渲染于组件内部，层级统一为 ', inlineCode('--tu-popup-z-index'), '（默认 1000）。'],
    ]),
    heading(2, '包 source 字段约定（CLI 编译依赖）'),
    paragraph(
      'transone-cli 编译小程序时，从 ',
      inlineCode('node_modules/<包>/package.json'),
      ' 读取 ',
      inlineCode('"source"'),
      ' 字段定位该包的 TypeScript 入口，再沿 export / re-export 链解析组件类的实际文件。因此发布组件库时必须声明：',
    ),
    codeBlock(
      'json',
      `{
  "name": "transone-ui",
  "source": "./lib/index.ts",
  "peerDependencies": { "transone": ">=0.1.2" }
}`
    ),
    callout(
      'warn',
      [
        '只有 ',
        inlineCode('source'),
        ' 指向的入口及其 re-export 链中的类会被静态编译分析；组件的 ',
        inlineCode('render()'),
        ' / ',
        inlineCode('initState()'),
        ' / ',
        inlineCode('initStyles()'),
        ' 需保持静态可分析（字面量、三元、&&、each 等受支持语法），方法体独立翻译、不能闭包捕获。',
      ],
      '注意'
    ),
    heading(2, '开发'),
    codeBlock(
      'bash',
      `# 构建 dist（类型声明 + Bun.build）
bun run --cwd packages/transone-ui build

# 组件运行时测试（Web DOM 环境）
bun test packages/transone-ui/tests/components.test.ts

# 演示页整页集成测试（覆盖受控数据流）
bun test packages/transone-ui/tests/demo-integration.test.ts`
    ),
    paragraph(
      '演示项目位于 ',
      inlineCode('playground/ui-demo'),
      '，覆盖全部组件与受控交互，可分别构建 Web / 微信 / 阿里 / 字节产物。',
    ),
    ul([
      [link('npm: transone-ui', NPM_UI_URL)],
      [link('源码：packages/transone-ui', GITHUB_UI_URL)],
    ]),
  ],
};

// ---- 主题定制 ----

export const uiThemePage: DocPage = {
  path: '/ui/theme',
  title: '主题定制',
  description: '设计令牌表、Web 端 injectTuTheme 与小程序端 wxss 覆盖。',
  section: 'ui',
  order: 2,
  body: [
    heading(1, '主题定制'),
    paragraph(
      '设计令牌定义在 ',
      inlineCode('lib/theme.ts'),
      '：颜色、文字与边框色、圆角、弹层层级与动画时长均为 CSS 变量，组件内联默认值保证开箱即用。',
    ),
    apiTable('设计令牌（TU_THEME_DEFAULTS）', [
      { name: '--tu-primary', type: '#1677ff', description: '主色（按钮 / 选中态 / 指示线）。' },
      { name: '--tu-success', type: '#00b578', description: '成功色。' },
      { name: '--tu-warning', type: '#ff8f1f', description: '警告色。' },
      { name: '--tu-danger', type: '#ff3141', description: '危险色（徽标 / 必填标记）。' },
      { name: '--tu-info', type: '#969799', description: '信息色。' },
      { name: '--tu-text', type: '#323233', description: '主文字色。' },
      { name: '--tu-text-secondary', type: '#969799', description: '次级文字色。' },
      { name: '--tu-border', type: '#ebedf0', description: '边框色（轨道 / 分隔线）。' },
      { name: '--tu-background', type: '#f7f8fa', description: '输入框 / 搜索栏背景。' },
      { name: '--tu-white', type: '#ffffff', description: '白色。' },
      { name: '--tu-radius-sm / md / lg', type: '4 / 8 / 12px', description: '圆角等级。' },
      { name: '--tu-popup-z-index', type: '1000', description: '弹层 / 轻提示层级。' },
      { name: '--tu-duration', type: '300ms', description: '过渡动画时长。' },
    ]),
    heading(2, 'Web 端'),
    paragraph(
      '调用 ',
      inlineCode('injectTuTheme()'),
      '（可在入口执行一次），向 ',
      inlineCode('<head>'),
      ' 注入 ',
      inlineCode('style[data-tu-theme]'),
      ' 的 :root 默认令牌；传入覆盖对象可自定义：',
    ),
    codeBlock(
      'ts',
      `import { injectTuTheme } from 'transone-ui';
injectTuTheme({ '--tu-primary': '#ff6600' });`
    ),
    paragraph(
      '也可不调用注入，直接在任意外层选择器覆盖同名变量（CSS 变量可继承）。',
    ),
    heading(2, '小程序端'),
    paragraph(
      '小程序不支持运行时注入 CSS 变量，在 ',
      inlineCode('app.wxss'),
      ' 的 ',
      inlineCode('page'),
      ' 选择器中覆盖同名变量即可（需基础库支持 CSS 变量）：',
    ),
    codeBlock('css', `page {
  --tu-primary: #ff6600;
  --tu-danger: #e60000;
}`),
  ],
};

// ====================== 组件页 ======================

// ---- TuButton ----

export const uiButtonPage: DocPage = {
  path: '/ui/button',
  title: 'TuButton 按钮',
  description: 'type / size / disabled / loading / block / plain / round，点击通过 click 事件回传。',
  section: 'ui',
  order: 3,
  body: [
    heading(1, 'TuButton'),
    paragraph(
      '跨端按钮：主题色实心 / 中性 / 朴素描边等五种类型，支持加载态与禁用。完全受控：点击通过 ',
      inlineCode('click'),
      ' 自定义事件通知父级（父级用 emitters 订阅）。',
    ),
    apiTable('属性', [
      { name: 'type', type: 'default | primary | success | warning | danger', description: '按钮类型，默认 default（中性底色）。' },
      { name: 'size', type: 'small | medium | large', description: '尺寸，默认 medium。' },
      { name: 'disabled', type: 'boolean', description: '禁用：不响应点击，半透明。' },
      { name: 'loading', type: 'boolean', description: '加载中：不响应点击，内容替换为 loadingText。' },
      { name: 'loadingText', type: 'string', description: '加载文案，默认「加载中…」。' },
      { name: 'block', type: 'boolean', description: '块级：占满父容器宽度。' },
      { name: 'plain', type: 'boolean', description: '朴素：透明底 + 描边 + 主题色文字。' },
      { name: 'round', type: 'boolean', description: '圆角胶囊（999px）。' },
      { name: 'children', type: 'Array<VNode | string>', description: '按钮内容（插槽）。' },
    ]),
    paragraph('事件：', inlineCode('click'), '（disabled / loading 时不触发）。'),
    demo('button'),

    heading(2, '实例'),
    codeBlock(
      'ts',
      `createComponent({
  component: TuButton,
  props: { type: 'primary', loading: this.state.saving },
  children: ['保存'],
  emitters: { click: () => this.save() },
})`
    ),
  ],
};

// ---- TuSwitch ----

export const uiSwitchPage: DocPage = {
  path: '/ui/switch',
  title: 'TuSwitch 开关',
  description: '自绘轨道 + 滑块，不依赖原生 switch，change 事件回传切换后的布尔值。',
  section: 'ui',
  order: 4,
  body: [
    heading(1, 'TuSwitch'),
    paragraph(
      '自绘轨道 + 滑块，不依赖端上原生 switch 组件，同一份源码在 Web（div）与小程序（view）渲染一致。完全受控：点击后通过 ',
      inlineCode('change'),
      ' 事件回传目标布尔值（!checked）。',
    ),
    apiTable('属性', [
      { name: 'checked', type: 'boolean', description: '是否选中（受控），默认 false。' },
      { name: 'disabled', type: 'boolean', description: '禁用：不响应点击，半透明。' },
      { name: 'activeColor', type: 'string', description: '选中态轨道颜色，默认 var(--tu-primary)。' },
      { name: 'size', type: 'small | medium', description: '尺寸，默认 medium。' },
    ]),
    paragraph('事件：', inlineCode('change'), '，回传切换后的布尔值（!checked）。'),
    demo('switch'),

    heading(2, '实例'),
    codeBlock(
      'ts',
      `createComponent({
  component: TuSwitch,
  props: { checked: this.state.enabled, size: 'medium' },
  emitters: { change: (checked: boolean) => (this.state.enabled = checked) },
})`
    ),
  ],
};

// ---- TuTag ----

export const uiTagPage: DocPage = {
  path: '/ui/tag',
  title: 'TuTag 标签',
  description: 'type / plain / round / closable，内容走插槽，close 事件回传 name 标识。',
  section: 'ui',
  order: 5,
  body: [
    heading(1, 'TuTag'),
    paragraph(
      '轻量标签：主题色实心或朴素描边，可圆角胶囊、可关闭。内容走插槽；点关闭按钮触发 ',
      inlineCode('close'),
      ' 自定义事件（是否移除由父级决定）。',
    ),
    apiTable('属性', [
      { name: 'type', type: 'primary | success | warning | danger | info', description: '标签类型，默认 primary。' },
      { name: 'plain', type: 'boolean', description: '朴素：透明底 + 主题色文字。' },
      { name: 'round', type: 'boolean', description: '圆角胶囊（999px）。' },
      { name: 'closable', type: 'boolean', description: '可关闭：右侧显示 ×，点击触发 close 事件。' },
      { name: 'name', type: 'string | number', description: '标识：close 事件回传该值（便于列表场景区分是哪个标签被关闭）。' },
      { name: 'children', type: 'Array<VNode | string>', description: '标签内容（插槽）。' },
    ]),
    paragraph('事件：', inlineCode('close'), '，回传 name 标识。'),
    demo('tag'),

    heading(2, '实例'),
    codeBlock(
      'ts',
      `createComponent({
  component: TuTag,
  props: { type: 'success', closable: true, name: 'tag-1' },
  children: ['已完成'],
  emitters: { close: (name) => this.removeTag(name) },
})`
    ),
  ],
};

// ---- TuBadge ----

export const uiBadgePage: DocPage = {
  path: '/ui/badge',
  title: 'TuBadge 徽标',
  description: '数字 / 文本胶囊或红点，数字超过 max 自动显示 max+。',
  section: 'ui',
  order: 6,
  body: [
    heading(1, 'TuBadge'),
    paragraph(
      '徽标：数字 / 文本胶囊或红点，挂在任意内容旁。数字超过 ',
      inlineCode('max'),
      ' 自动显示为 max+（双端由同一表达式求值）。无交互事件。',
    ),
    apiTable('属性', [
      { name: 'content', type: 'number | string', description: '徽标内容：数字或文本。' },
      { name: 'max', type: 'number', description: '数字上限：content 为数字且超过 max 时显示 max+。' },
      { name: 'dot', type: 'boolean', description: '纯圆点模式（忽略 content 文本）。' },
      { name: 'color', type: 'string', description: '颜色，默认 var(--tu-danger)。' },
      { name: 'textColor', type: 'string', description: '文本颜色，默认 #ffffff。' },
    ]),
    demo('badge'),

    heading(2, '实例'),
    codeBlock(
      'ts',
      `// 数字徽标：超过 max 显示 max+
createComponent({
  component: TuBadge,
  props: { content: this.state.unread, max: 99 },
  children: [{ tag: 'span', children: ['消息'] }],
});

// 纯圆点徽标
createComponent({
  component: TuBadge,
  props: { dot: true },
  children: [{ tag: 'span', children: ['设置'] }],
});`
    ),
  ],
};

// ---- TuInput ----

export const uiInputPage: DocPage = {
  path: '/ui/input',
  title: 'TuInput 输入框',
  description: '受控 value + placeholder / type / disabled / readonly / maxlength / clearable / size，双端事件归一化。',
  section: 'ui',
  order: 7,
  body: [
    heading(1, 'TuInput'),
    paragraph(
      '受控输入框：value 由父级维护，输入 / 变更 / 聚焦 / 失焦 / 回车通过同名自定义事件回传。双端差异已封装：Web 从 ',
      inlineCode('e.target.value'),
      ' 取值，小程序从 ',
      inlineCode('e.detail.value'),
      ' 取值，方法内统一归一化后 emit。',
    ),
    apiTable('属性', [
      { name: 'value', type: 'string', description: '输入值（受控），默认空串。' },
      { name: 'placeholder', type: 'string', description: '占位文案。' },
      { name: 'type', type: 'text | password | number', description: '输入类型，默认 text；小程序端 number 对应数字键盘。' },
      { name: 'disabled', type: 'boolean', description: '禁用。' },
      { name: 'readonly', type: 'boolean', description: '只读（小程序端映射为 disabled，避免可编辑）。' },
      { name: 'maxlength', type: 'number', description: '最大长度，不传则不限。' },
      { name: 'clearable', type: 'boolean', description: '可一键清空：有值时显示 × 按钮，点击回传空串。' },
      { name: 'size', type: 'small | medium | large', description: '尺寸，默认 medium。' },
    ]),
    paragraph(
      '事件：',
      inlineCode('input'),
      ' / ',
      inlineCode('change'),
      '（回传字符串值）、',
      inlineCode('focus'),
      ' / ',
      inlineCode('blur'),
      '、',
      inlineCode('confirm'),
      '（回车）。点击清空按钮触发 ',
      inlineCode('input'),
      ' 并回传空串。',
    ),
    demo('input'),

    heading(2, '实例'),
    codeBlock(
      'ts',
      `createComponent({
  component: TuInput,
  props: { value: this.state.keyword, placeholder: '搜索', clearable: true },
  emitters: { input: (v: string) => (this.state.keyword = v) },
})`
    ),
  ],
};

// ---- TuCheckbox ----

export const uiCheckboxPage: DocPage = {
  path: '/ui/checkbox',
  title: 'TuCheckbox 复选框',
  description: '自绘方框 + CSS 对勾，round / square 两种形状，change 事件回传布尔值。',
  section: 'ui',
  order: 8,
  body: [
    heading(1, 'TuCheckbox'),
    paragraph(
      '自绘方框 + CSS 对勾，不依赖端上原生 checkbox。完全受控：点击后通过 ',
      inlineCode('change'),
      ' 事件回传目标布尔值（!checked）。',
    ),
    apiTable('属性', [
      { name: 'checked', type: 'boolean', description: '是否选中（受控），默认 false。' },
      { name: 'disabled', type: 'boolean', description: '禁用：不响应点击，半透明。' },
      { name: 'label', type: 'string', description: '文案。' },
      { name: 'activeColor', type: 'string', description: '选中态颜色，默认 var(--tu-primary)。' },
      { name: 'shape', type: 'round | square', description: '形状：圆角方框 / 直角方框，默认 round。' },
    ]),
    paragraph('事件：', inlineCode('change'), '，回传切换后的布尔值（!checked）。'),
    demo('checkbox'),

    heading(2, '实例'),
    codeBlock(
      'ts',
      `createComponent({
  component: TuCheckbox,
  props: { checked: this.state.agreed, label: '我已阅读并同意用户协议' },
  emitters: { change: (checked: boolean) => (this.state.agreed = checked) },
})`
    ),
  ],
};

// ---- TuRadio ----

export const uiRadioPage: DocPage = {
  path: '/ui/radio',
  title: 'TuRadio 单选框',
  description: '自绘圆形 + 圆心点，不依赖原生 radio，change 事件回传布尔值。',
  section: 'ui',
  order: 9,
  body: [
    heading(1, 'TuRadio'),
    paragraph(
      '自绘圆形 + 圆心点，不依赖端上原生 radio。完全受控：点击后通过 ',
      inlineCode('change'),
      ' 事件回传目标布尔值（!checked）。',
    ),
    apiTable('属性', [
      { name: 'checked', type: 'boolean', description: '是否选中（受控），默认 false。' },
      { name: 'disabled', type: 'boolean', description: '禁用：不响应点击，半透明。' },
      { name: 'label', type: 'string', description: '文案。' },
      { name: 'activeColor', type: 'string', description: '选中态颜色，默认 var(--tu-primary)。' },
    ]),
    paragraph('事件：', inlineCode('change'), '，回传切换后的布尔值（!checked）。'),
    demo('radio'),

    heading(2, '实例'),
    codeBlock(
      'ts',
      `createComponent({
  component: TuRadio,
  props: { checked: this.state.gender === 'male', label: '男' },
  emitters: { change: (checked: boolean) => (this.state.gender = checked ? 'male' : '') },
})`
    ),
  ],
};

// ---- TuSearchBar ----

export const uiSearchBarPage: DocPage = {
  path: '/ui/search-bar',
  title: 'TuSearchBar 搜索栏',
  description: '输入 + 清空 + 可选取消按钮，input / change / search / clear / cancel / focus / blur 事件。',
  section: 'ui',
  order: 10,
  body: [
    heading(1, 'TuSearchBar'),
    paragraph(
      '搜索栏：输入框 + 清空按钮 + 可选取消按钮。完全受控：value 由父级维护，输入事件双端归一化（Web ',
      inlineCode('e.target.value'),
      ' / 小程序 ',
      inlineCode('e.detail.value'),
      '）。',
    ),
    apiTable('属性', [
      { name: 'value', type: 'string', description: '输入值（受控），默认空串。' },
      { name: 'placeholder', type: 'string', description: '占位文案。' },
      { name: 'disabled', type: 'boolean', description: '禁用。' },
      { name: 'maxlength', type: 'number', description: '最大长度。' },
      { name: 'shape', type: 'round | square', description: '输入框形状，默认 round。' },
      { name: 'showCancel', type: 'boolean', description: '是否显示取消按钮，默认 false。' },
      { name: 'cancelText', type: 'string', description: '取消按钮文案，默认「取消」。' },
      { name: 'clearable', type: 'boolean', description: '非空时显示清空按钮，默认 true。' },
      { name: 'background', type: 'string', description: '背景色，默认浅灰。' },
    ]),
    paragraph(
      '事件：',
      inlineCode('input'),
      ' / ',
      inlineCode('change'),
      '（回传字符串值）、',
      inlineCode('search'),
      '（键盘确认键）、',
      inlineCode('clear'),
      '（点击清空，同时触发 input 空串）、',
      inlineCode('cancel'),
      '（点击取消）、',
      inlineCode('focus'),
      ' / ',
      inlineCode('blur'),
      '。',
    ),
    demo('search-bar'),

    heading(2, '实例'),
    codeBlock(
      'ts',
      `createComponent({
  component: TuSearchBar,
  props: { value: this.state.keyword, showCancel: true },
  emitters: {
    input: (v: string) => (this.state.keyword = v),
    search: () => this.doSearch(this.state.keyword),
    cancel: () => (this.state.keyword = ''),
  },
})`
    ),
  ],
};

// ---- TuPopup ----

export const uiPopupPage: DocPage = {
  path: '/ui/popup',
  title: 'TuPopup 弹出层',
  description: 'top / right / bottom / left 四向滑入滑出，mask / maskClosable / round，close 事件。',
  section: 'ui',
  order: 11,
  body: [
    heading(1, 'TuPopup'),
    paragraph(
      '从 top / right / bottom / left 四个方向滑入滑出的弹出层。根容器固定铺满视口、始终挂载，隐藏态通过 visibility + transform 离屏 + pointer-events 隔离交互，进入 / 退出动画全部由 CSS transition 驱动，无需 JS 计时。完全受控：visible 由父级维护，点击遮罩触发 ',
      inlineCode('close'),
      '。',
    ),
    callout(
      'tip',
      [
        '小程序端 WXSS 同样支持 transition / transform / visibility，同一份源码编译出完全一致的结构与动效。',
      ],
      '跨端'
    ),
    apiTable('属性', [
      { name: 'visible', type: 'boolean', description: '是否可见（受控），默认 false。' },
      { name: 'position', type: 'top | right | bottom | left', description: '弹出方向，默认 bottom。' },
      { name: 'mask', type: 'boolean', description: '显示遮罩，默认 true。' },
      { name: 'maskClosable', type: 'boolean', description: '点击遮罩是否触发 close，默认 true。' },
      { name: 'round', type: 'boolean', description: '面板圆角（bottom 顶部圆角 / 侧边内缘圆角），默认 true。' },
      { name: 'children', type: 'Array<VNode | string>', description: '面板内容（插槽）。' },
    ]),
    paragraph('事件：', inlineCode('close'), '（点击遮罩且 maskClosable ≠ false 时触发）。'),
    demo('popup'),

    heading(2, '实例'),
    codeBlock(
      'ts',
      `createComponent({
  component: TuPopup,
  props: { visible: this.state.sheetVisible, position: 'bottom', round: true },
  children: [h('div', { className: 'sheet-body' }, ['底部面板内容'])],
  emitters: { close: () => (this.state.sheetVisible = false) },
})`
    ),
  ],
};

// ---- TuToast ----

export const uiToastPage: DocPage = {
  path: '/ui/toast',
  title: 'TuToast 轻提示',
  description: '深色半透明胶囊，top / center / bottom 三位置，自动关闭由父级定时。',
  section: 'ui',
  order: 12,
  body: [
    heading(1, 'TuToast'),
    paragraph(
      '轻提示：深色半透明胶囊 + 白字，top / center / bottom 三位置。完全受控：visible 由父级维护；',
      strong('组件不做自动关闭'),
      '，父级在打开后自行 setTimeout 关闭（Web 与小程序均支持）。',
    ),
    apiTable('属性', [
      { name: 'visible', type: 'boolean', description: '是否显示（受控），默认 false。' },
      { name: 'content', type: 'string', description: '提示文案。' },
      { name: 'position', type: 'top | center | bottom', description: '出现位置，默认 center。' },
      { name: 'duration', type: 'number', description: '显示时长（毫秒，默认 2000），仅供父级参考决定何时关闭。' },
      { name: 'closable', type: 'boolean', description: '点击 toast 是否触发 close（可手动关闭场景）。' },
    ]),
    paragraph('事件：', inlineCode('close'), '（仅 closable 为 true 时点击触发）。'),
    demo('toast'),

    heading(2, '实例'),
    codeBlock(
      'ts',
      `// 组件只负责展示，时长由父级控制
createComponent({
  component: TuToast,
  props: { visible: this.state.toastVisible, content: '保存成功', position: 'center' },
});

this.state.toastVisible = true;
setTimeout(() => (this.state.toastVisible = false), 2000);`
    ),
  ],
};

// ---- TuModal ----

export const uiModalPage: DocPage = {
  path: '/ui/modal',
  title: 'TuModal 确认弹窗',
  description: '居中面板 + 遮罩，confirm / cancel / close 事件，confirmLoading / showCancel / maskClosable。',
  section: 'ui',
  order: 13,
  body: [
    heading(1, 'TuModal'),
    paragraph(
      '确认弹窗：居中面板 + 遮罩。完全受控：visible 由父级维护；确认 / 取消 / 遮罩关闭分别触发 ',
      inlineCode('confirm'),
      ' / ',
      inlineCode('cancel'),
      ' / ',
      inlineCode('close'),
      ' 事件。动画由 visibility + opacity 过渡驱动，隐藏态 pointer-events 隔离交互。',
    ),
    apiTable('属性', [
      { name: 'visible', type: 'boolean', description: '是否显示（受控），默认 false。' },
      { name: 'title', type: 'string', description: '标题。' },
      { name: 'content', type: 'string', description: '内容文本（children 存在时忽略）。' },
      { name: 'confirmText', type: 'string', description: '确认按钮文案，默认「确认」。' },
      { name: 'cancelText', type: 'string', description: '取消按钮文案，默认「取消」。' },
      { name: 'showCancel', type: 'boolean', description: '是否显示取消按钮，默认 true。' },
      { name: 'confirmLoading', type: 'boolean', description: '确认按钮加载态（不响应点击），默认 false。' },
      { name: 'maskClosable', type: 'boolean', description: '点击遮罩是否触发 close，默认 false。' },
      { name: 'children', type: 'Array<VNode | string>', description: '内容插槽（覆盖 content 文本）。' },
    ]),
    paragraph(
      '事件：',
      inlineCode('confirm'),
      '（confirmLoading 时不触发）、',
      inlineCode('cancel'),
      '、',
      inlineCode('close'),
      '（maskClosable 为 true 时点击遮罩触发）。',
    ),
    demo('modal'),

    heading(2, '实例'),
    codeBlock(
      'ts',
      `createComponent({
  component: TuModal,
  props: {
    visible: this.state.confirmVisible,
    title: '删除确认',
    content: '删除后不可恢复，确定继续？',
    confirmLoading: this.state.deleting,
  },
  emitters: {
    confirm: () => this.doDelete(),
    cancel: () => (this.state.confirmVisible = false),
  },
})`
    ),
  ],
};

// ---- TuActionSheet ----

export const uiActionSheetPage: DocPage = {
  path: '/ui/action-sheet',
  title: 'TuActionSheet 动作面板',
  description: '底部选项列表 + 取消按钮，select 回传索引，cancel 由取消 / 遮罩触发。',
  section: 'ui',
  order: 14,
  body: [
    heading(1, 'TuActionSheet'),
    paragraph(
      '底部动作面板：遮罩 + 底部选项列表 + 取消按钮。完全受控：visible 由父级维护；选中某项触发 ',
      inlineCode('select'),
      '（回传索引），点击取消 / 遮罩触发 ',
      inlineCode('cancel'),
      '。滑入滑出动画由 visibility + transform 过渡驱动。',
    ),
    apiTable('TuActionSheetItem', [
      { name: 'name', type: 'string', description: '选项文案。' },
      { name: 'color', type: 'string', description: '文字颜色（如危险操作红色）。' },
      { name: 'disabled', type: 'boolean', description: '禁用（不响应点击）。' },
    ]),
    apiTable('属性', [
      { name: 'visible', type: 'boolean', description: '是否显示（受控），默认 false。' },
      { name: 'actions', type: 'TuActionSheetItem[]', description: '动作项列表。' },
      { name: 'cancelText', type: 'string', description: '取消按钮文案，默认「取消」。' },
      { name: 'description', type: 'string', description: '面板顶部提示文案。' },
    ]),
    paragraph(
      '事件：',
      inlineCode('select'),
      '（回传选中项索引，禁用项不触发）、',
      inlineCode('cancel'),
      '（点击取消按钮或遮罩）。',
    ),
    demo('action-sheet'),

    heading(2, '实例'),
    codeBlock(
      'ts',
      `const actions = [
  { name: '编辑' },
  { name: '分享' },
  { name: '删除', color: 'var(--tu-danger, #ff3141)' },
];
createComponent({
  component: TuActionSheet,
  props: { visible: this.state.sheetVisible, actions, description: '请选择操作' },
  emitters: { select: (i: number) => this.onAction(i) },
})`
    ),
  ],
};

// ---- TuTabs ----

export const uiTabsPage: DocPage = {
  path: '/ui/tabs',
  title: 'TuTabs 标签页',
  description: '横向选项条 + 底部指示线，equal 均分等宽，change 事件回传索引。',
  section: 'ui',
  order: 15,
  body: [
    heading(1, 'TuTabs'),
    paragraph(
      '标签页导航：横向选项条 + 底部指示线。完全受控：点击选项触发 ',
      inlineCode('change'),
      '（回传索引），指示线与激活样式由 active 驱动，跨端一致。',
    ),
    apiTable('TuTabItem', [
      { name: 'title', type: 'string', description: '选项卡标题。' },
      { name: 'disabled', type: 'boolean', description: '禁用（不响应点击）。' },
    ]),
    apiTable('属性', [
      { name: 'items', type: 'TuTabItem[]', description: '选项卡列表。' },
      { name: 'active', type: 'number', description: '当前激活索引（受控），默认 -1。' },
      { name: 'activeColor', type: 'string', description: '激活文字颜色，默认 var(--tu-primary)。' },
      { name: 'lineColor', type: 'string', description: '底部指示线颜色，默认主题色。' },
      { name: 'equal', type: 'boolean', description: '是否均分等宽（默认内容宽度自适应）。' },
    ]),
    paragraph('事件：', inlineCode('change'), '，回传被点击选项的索引（禁用项不触发）。'),
    demo('tabs'),

    heading(2, '实例'),
    codeBlock(
      'ts',
      `createComponent({
  component: TuTabs,
  props: {
    items: [
      { title: '全部' },
      { title: '进行中' },
      { title: '已完成', disabled: true },
    ],
    active: this.state.activeTab,
    equal: true,
  },
  emitters: { change: (index: number) => (this.state.activeTab = index) },
})`
    ),
  ],
};

// ---- TuNavbar ----

export const uiNavbarPage: DocPage = {
  path: '/ui/navbar',
  title: 'TuNavbar 导航栏',
  description: '左箭头 / 文案、居中标题、右侧文案，clickLeft / clickRight 事件，可吸顶。',
  section: 'ui',
  order: 16,
  body: [
    heading(1, 'TuNavbar'),
    paragraph(
      '顶部导航栏：左侧箭头 / 文案、居中标题、右侧文案。点击左侧（箭头 / 文案区域）触发 ',
      inlineCode('clickLeft'),
      '，右侧触发 ',
      inlineCode('clickRight'),
      '。标题通过左右等宽占位实现严格居中。',
    ),
    apiTable('属性', [
      { name: 'title', type: 'string', description: '标题（居中）。' },
      { name: 'leftText', type: 'string', description: '左侧文案（配合返回箭头使用）。' },
      { name: 'showArrow', type: 'boolean', description: '是否显示返回箭头。' },
      { name: 'rightText', type: 'string', description: '右侧文案。' },
      { name: 'fixed', type: 'boolean', description: '固定顶部（吸顶，需父级留出占位高度）。' },
      { name: 'background', type: 'string', description: '背景色，默认 #ffffff。' },
      { name: 'border', type: 'boolean', description: '是否显示底部分隔线，默认 true。' },
    ]),
    paragraph('事件：', inlineCode('clickLeft'), '、', inlineCode('clickRight'), '。'),
    demo('navbar'),

    heading(2, '实例'),
    codeBlock(
      'ts',
      `createComponent({
  component: TuNavbar,
  props: { title: '订单详情', leftText: '返回', showArrow: true, rightText: '分享' },
  emitters: {
    clickLeft: () => this.goBack(),
    clickRight: () => this.share(),
  },
})`
    ),
  ],
};

// ---- TuCell ----

export const uiCellPage: DocPage = {
  path: '/ui/cell',
  title: 'TuCell 单元格',
  description: '标题 / 说明 / 右侧值 / 箭头，required 必填标记，click 事件。',
  section: 'ui',
  order: 17,
  body: [
    heading(1, 'TuCell'),
    paragraph(
      '单元格：标题 / 说明 / 右侧值 / 箭头，常与列表或表单组合使用。点击触发 ',
      inlineCode('click'),
      ' 事件（禁用时不触发）；箭头由 CSS 边框旋转绘制，跨端一致。',
    ),
    apiTable('属性', [
      { name: 'title', type: 'string', description: '左侧主文案。' },
      { name: 'label', type: 'string', description: '标题下方说明文案。' },
      { name: 'value', type: 'string', description: '右侧值文案。' },
      { name: 'required', type: 'boolean', description: '是否必填（标题前红点）。' },
      { name: 'isLink', type: 'boolean', description: '是否显示箭头。' },
      { name: 'arrowDirection', type: 'right | up | down', description: '箭头方向，默认 right。' },
      { name: 'disabled', type: 'boolean', description: '禁用（不响应点击，半透明）。' },
      { name: 'border', type: 'boolean', description: '是否显示底部边框，默认 true。' },
      { name: 'center', type: 'boolean', description: '是否居中垂直（label 存在时默认顶部对齐）。' },
    ]),
    paragraph('事件：', inlineCode('click'), '（disabled 时不触发）。'),
    demo('cell'),

    heading(2, '实例'),
    codeBlock(
      'ts',
      `createComponent({
  component: TuCell,
  props: { title: '收货地址', value: '上海市 xxx', isLink: true, required: true },
  emitters: { click: () => this.openAddress() },
})`
    ),
  ],
};

// ---- TuProgress ----

export const uiProgressPage: DocPage = {
  path: '/ui/progress',
  title: 'TuProgress 进度条',
  description: 'percent / showText / textInside / strokeWidth / color，宽度 0.3s 过渡，无事件。',
  section: 'ui',
  order: 18,
  body: [
    heading(1, 'TuProgress'),
    paragraph(
      '进度条：percent 越界自动收敛到 0–100，宽度变化带 0.3s 过渡。纯受控展示组件，无自定义事件。',
    ),
    apiTable('属性', [
      { name: 'percent', type: 'number', description: '进度 0–100（越界自动收敛），默认 0。' },
      { name: 'showText', type: 'boolean', description: '显示百分比文字，默认 true。' },
      { name: 'textInside', type: 'boolean', description: '文字置于进度条内部（右侧），默认 false。' },
      { name: 'strokeWidth', type: 'number', description: '进度条高度（px），默认 8。' },
      { name: 'color', type: 'string', description: '进度条颜色，默认 var(--tu-primary)。' },
      { name: 'trackColor', type: 'string', description: '轨道颜色，默认 var(--tu-border)。' },
    ]),
    demo('progress'),

    heading(2, '实例'),
    codeBlock(
      'ts',
      `createComponent({
  component: TuProgress,
  props: { percent: this.state.uploaded, textInside: true, strokeWidth: 10 },
})`
    ),
  ],
};

// ---- TuEmpty ----

export const uiEmptyPage: DocPage = {
  path: '/ui/empty',
  title: 'TuEmpty 空状态',
  description: '图形占位 + 主副文案 + 底部操作插槽，支持自定义图片，无事件。',
  section: 'ui',
  order: 19,
  body: [
    heading(1, 'TuEmpty'),
    paragraph(
      '空状态：图形占位 + 主副文案 + 操作插槽。无交互事件；图形区支持自定义图片，缺省渲染内置 CSS 插画（云朵）。',
    ),
    apiTable('属性', [
      { name: 'image', type: 'string', description: '自定义图片 URL（缺省用内置 CSS 图形占位）。' },
      { name: 'imageSize', type: 'number', description: '图片尺寸（px），默认 120。' },
      { name: 'text', type: 'string', description: '主文案。' },
      { name: 'description', type: 'string', description: '副文案。' },
      { name: 'children', type: 'Array<VNode | string>', description: '底部操作区插槽（如「重新加载」按钮）。' },
    ]),
    demo('empty'),

    heading(2, '实例'),
    codeBlock(
      'ts',
      `createComponent({
  component: TuEmpty,
  props: { text: '暂无数据', description: '换个筛选条件试试' },
  children: [
    createComponent({
      component: TuButton,
      props: { type: 'primary', size: 'small' },
      children: ['重新加载'],
      emitters: { click: () => this.reload() },
    }),
  ],
})`
    ),
  ],
};
