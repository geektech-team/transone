import type * as tsTypes from 'typescript';
import type { MpDialect } from './dialect';

export type UnitKind = 'page' | 'component';

/** 一个 Component 子类的定位信息：文件 + 类声明。 */
export interface ClassSource {
  filePath: string;
  source: tsTypes.SourceFile;
  declaration: tsTypes.ClassLikeDeclaration;
  className: string;
}

/** 编译生成的函数条目（页面/组件方法或生命周期钩子）。 */
export interface FunctionEntry {
  key: string;
  fn: string;
}

/** 组件属性定义：propName -> WeChat 属性类型（String/Number/...）。 */
export type PropertyTypes = Record<string, string>;

/** 编译产物单元：一个页面或一个自定义组件。 */
export interface CompiledUnit {
  kind: UnitKind;
  /** 页面为路由叶名（如 index），组件为 kebab-case 标签名。 */
  name: string;
  /** WXML 模板源码。 */
  template: string;
  /** 本单元作用域内的 WXSS（class 选择器）。 */
  style: string;
  /** 全局样式（body 选择器，页面单元会合并进 app.wxss）。 */
  globalStyle: string;
  /** data 初始值 JS 源码（对象字面量）。 */
  data: string;
  /** 自定义组件 properties（页面为空对象）。 */
  properties: PropertyTypes;
  /** 页面/组件 methods 条目（不含生命周期钩子）。 */
  methods: FunctionEntry[];
  /** 页面级生命周期（onLoad/onReady/onUnload）或组件 lifetimes。 */
  lifecycle: FunctionEntry[];
  /** 组件通过 triggerEvent 暴露的自定义事件名。 */
  customEvents: string[];
  /** 模板中引用到的 props 名（finalize 时并入 properties）。 */
  propsReferenced: Set<string>;
  /** usingComponents：tag -> 小程序绝对路径。 */
  usingComponents: Record<string, string>;
}

/** 编译过程中的上下文：跨模块共享的文件缓存与产物缓存。 */
export interface CompileContext {
  ts: typeof tsTypes;
  root: string;
  /** 已解析的源文件缓存（绝对路径 -> SourceFile）。 */
  files: Map<string, tsTypes.SourceFile>;
  /** 已编译完成的组件（tag -> unit）。 */
  components: Map<string, CompiledUnit>;
  /** 正在编译的组件 tag，用于检测循环引用。 */
  compiling: Set<string>;
  /** 组件调用点收集：tag -> 各调用点传的属性（name -> 类型）。 */
  callSites: Map<string, Array<Record<string, string>>>;
  /** 样式数字长度单位：'px'（默认）或 'rpx'（数值按 1px=2rpx 换算）。 */
  lengthUnit: 'px' | 'rpx';
  /** 跨端差异层：决定模板指令前缀、事件绑定、文件后缀、工程配置等平台差异。 */
  dialect: MpDialect;
  warnings: string[];
}

export function warn(context: CompileContext, message: string): void {
  context.warnings.push(message);
}
