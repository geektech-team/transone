import type { ResolvedMiniProgramConfig } from '../types';

/**
 * 跨端差异层：同一套 mp 编译器（AST 静态分析 → WXML 系模板 / WXSS 系样式 /
 * Page/Component JS）通过 MpDialect 描述各小程序平台的产物差异。
 *
 * 平台差异点（positioning 9.M3「沉淀跨端差异层」）：
 * - 模板文件后缀：.wxml / .axml / .ttml
 * - 样式文件后缀与 app 样式文件名：.wxss / .acss / .ttss
 * - 模板指令前缀：wx: / a: / tt:
 * - 事件绑定写法：bindtap / onTap / bindtap
 * - 工程配置文件与字段：project.config.json / mini.project.json / project.config.json
 * - app.json 的 window 字段名（navigationBarTitleText vs defaultTitle）与顶层差异
 * - 组件 json（微信 multipleSlots；阿里 / 字节无需）
 * - 是否生成 sitemap.json（微信特有）
 */
export interface MpDialect {
  /** 目标端标识，与 TargetType 一致。 */
  id: string;
  /** 人类可读描述。 */
  label: string;
  /** 模板文件后缀（不含点）。 */
  templateExt: string;
  /** 样式文件后缀（不含点）。 */
  styleExt: string;
  /** 全局样式文件名（app.wxss / app.acss / app.ttss）。 */
  appStyleFile: string;
  /** 模板指令前缀（wx: / a: / tt:）。 */
  directivePrefix: string;
  /** 普通事件绑定：bindtap / onTap / bindtap。 */
  bindEvent: (eventName: string) => string;
  /** 阻止冒泡事件绑定：catchtap / catchTap / catchtap。 */
  catchEvent: (eventName: string) => string;
  /** 工程配置文件文件名（project.config.json / mini.project.json）。 */
  projectConfigFile: string;
  /** 工程配置文件内容。 */
  buildProjectConfig: (
    mp: ResolvedMiniProgramConfig,
    projectName: string
  ) => Record<string, unknown>;
  /** app.json.window 的默认字段（平台字段名映射）。 */
  windowDefaults: (title: string) => Record<string, unknown>;
  /** app.json 顶层额外字段（微信的 style / sitemapLocation）。 */
  appJsonExtras: () => Record<string, unknown>;
  /** 是否生成 sitemap.json（微信特有）。 */
  sitemap: boolean;
  /** 自定义组件 json 的固定字段。 */
  componentJson: (usingComponents: Record<string, string>) => Record<string, unknown>;
}

/** camelCase 事件名转 PascalCase（阿里 onTap / onTouchStart）。 */
function pascalEvent(eventName: string): string {
  return eventName.charAt(0).toUpperCase() + eventName.slice(1);
}

const WEIXIN_PROJECT_SETTING = {
  es6: true,
  postcss: true,
  minified: true,
  urlCheck: false,
} as const;

export const MP_WEIXIN_DIALECT: MpDialect = {
  id: 'mp-weixin',
  label: '微信小程序原生工程（WXML / WXSS / JS 静态转换）',
  templateExt: 'wxml',
  styleExt: 'wxss',
  appStyleFile: 'app.wxss',
  directivePrefix: 'wx:',
  bindEvent: (event) => `bind${event}`,
  catchEvent: (event) => `catch${event}`,
  projectConfigFile: 'project.config.json',
  buildProjectConfig: (mp, projectName) => ({
    appid: mp.appId,
    projectname: projectName,
    compileType: 'miniprogram',
    setting: { ...WEIXIN_PROJECT_SETTING },
  }),
  windowDefaults: (title) => ({
    navigationBarTitleText: title,
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
    backgroundTextStyle: 'light',
  }),
  appJsonExtras: () => ({
    style: 'v2',
    sitemapLocation: 'sitemap.json',
  }),
  sitemap: true,
  componentJson: (usingComponents) => ({
    component: true,
    multipleSlots: true,
    usingComponents,
  }),
};

export const MP_ALIPAY_DIALECT: MpDialect = {
  id: 'mp-alipay',
  label: '阿里小程序原生工程（AXML / ACSS / JS 静态转换）',
  templateExt: 'axml',
  styleExt: 'acss',
  appStyleFile: 'app.acss',
  directivePrefix: 'a:',
  bindEvent: (event) => `on${pascalEvent(event)}`,
  catchEvent: (event) => `catch${pascalEvent(event)}`,
  projectConfigFile: 'mini.project.json',
  buildProjectConfig: () => ({
    miniprogramRoot: './',
    component2: true,
    enableAppxNg: true,
    compileType: 'miniprogram',
  }),
  windowDefaults: (title) => ({
    defaultTitle: title,
    titleBarColor: '#ffffff',
  }),
  appJsonExtras: () => ({}),
  sitemap: false,
  componentJson: (usingComponents) => ({
    component: true,
    usingComponents,
  }),
};

export const MP_BYTEDANCE_DIALECT: MpDialect = {
  id: 'mp-bytedance',
  label: '字节小程序原生工程（TTML / TTSS / JS 静态转换）',
  templateExt: 'ttml',
  styleExt: 'ttss',
  appStyleFile: 'app.ttss',
  directivePrefix: 'tt:',
  bindEvent: (event) => `bind${event}`,
  catchEvent: (event) => `catch${event}`,
  projectConfigFile: 'project.config.json',
  buildProjectConfig: (mp, projectName) => ({
    miniprogramRoot: './',
    compileType: 'miniprogram',
    projectname: projectName,
    appid: mp.appId,
    setting: { ...WEIXIN_PROJECT_SETTING },
  }),
  windowDefaults: (title) => ({
    navigationBarTitleText: title,
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
    backgroundTextStyle: 'light',
  }),
  appJsonExtras: () => ({}),
  sitemap: false,
  componentJson: (usingComponents) => ({
    component: true,
    usingComponents,
  }),
};

export const MP_DIALECTS: Record<string, MpDialect> = {
  'mp-weixin': MP_WEIXIN_DIALECT,
  'mp-alipay': MP_ALIPAY_DIALECT,
  'mp-bytedance': MP_BYTEDANCE_DIALECT,
};
