import type * as tsTypes from 'typescript';
import { foldExpression, isThisExpression } from './fold';
import { mpError } from './errors';
import { ClassSource, CompileContext } from './types';
import { findMethod } from './wxml';

export interface CompiledStyles {
  /** 本单元作用域内的 WXSS（class 等选择器）。 */
  style: string;
  /** 全局样式（body 选择器，页面单元会合并进 app.wxss）。 */
  global: string;
  /** 存在 hover 样式的选择器（如 '.card'），模板据此生成 hover-class。 */
  hoverSelectors: Set<string>;
}

interface StyleEntry {
  selector: string;
  properties: Record<string, string | number>;
  hover?: Record<string, string | number>;
  media?: Record<string, Record<string, string | number>>;
}

/** 无单位合法的 CSS 属性：数字值不加 px/rpx。 */
const UNITLESS_PROPERTIES = new Set([
  'opacity',
  'zIndex',
  'fontWeight',
  'lineHeight',
  'flex',
  'flexGrow',
  'flexShrink',
  'order',
  'zoom',
  'scale',
  'transform',
  'animationIterationCount',
  'columnCount',
  'fontSizeAdjust',
]);

/**
 * 编译 initStyles()：只支持
 * `this.styleManager.addStyle('name', { selector, properties, media, hover })`
 * 字面量调用；body 选择器归入全局样式（小程序用 page 选择器）。
 */
export function compileStyles(
  context: CompileContext,
  classSource: ClassSource
): CompiledStyles {
  const { ts } = context;
  const method = findMethod(context, classSource, 'initStyles');
  if (!method?.body) {
    return { style: '', global: '', hoverSelectors: new Set() };
  }

  const consts = collectModuleConsts(context, classSource);
  const entries: StyleEntry[] = [];
  for (const statement of method.body.statements) {
    if (ts.isEmptyStatement(statement)) {
      continue;
    }
    if (!ts.isExpressionStatement(statement)) {
      throw mpError(
        classSource.filePath,
        'initStyles() 只支持 this.styleManager.addStyle(...) 调用'
      );
    }
    const expression = statement.expression;
    const entry = addStyleEntry(context, classSource, expression, consts);
    if (entry) {
      entries.push(entry);
    }
  }

  const local: string[] = [];
  const global: string[] = [];
  const hoverSelectors = new Set<string>();
  for (const entry of entries) {
    const target = entry.selector === 'body' ? global : local;
    target.push(renderStyle(entry, context.lengthUnit));
    if (entry.hover && entry.selector !== 'body') {
      hoverSelectors.add(entry.selector);
    }
  }

  return { style: local.join('\n'), global: global.join('\n'), hoverSelectors };
}

function addStyleEntry(
  context: CompileContext,
  classSource: ClassSource,
  expression: tsTypes.Expression,
  consts: Map<string, tsTypes.Expression>
): StyleEntry | undefined {
  const { ts } = context;
  if (!ts.isCallExpression(expression)) {
    throw mpError(
      classSource.filePath,
      'initStyles() 只支持 this.styleManager.addStyle(...) 调用'
    );
  }
  const callee = expression.expression;
  const manager = ts.isPropertyAccessExpression(callee)
    ? callee.expression
    : undefined;
  if (
    !ts.isPropertyAccessExpression(callee) ||
    callee.name.text !== 'addStyle' ||
    !manager ||
    !ts.isPropertyAccessExpression(manager) ||
    !isThisExpression(ts, manager.expression) ||
    manager.name.text !== 'styleManager'
  ) {
    throw mpError(
      classSource.filePath,
      'initStyles() 只支持 this.styleManager.addStyle(...) 调用'
    );
  }
  const optionsExpr = expression.arguments[1];
  if (!optionsExpr || !ts.isObjectLiteralExpression(optionsExpr)) {
    throw mpError(
      classSource.filePath,
      'addStyle 的第二个参数必须是对象字面量'
    );
  }

  const selector = foldObjectString(ts, optionsExpr, 'selector', consts);
  const properties = foldObjectRecord(ts, optionsExpr, 'properties', consts);
  const hover = foldObjectRecord(ts, optionsExpr, 'hover', consts);
  const media = foldMedia(ts, optionsExpr, consts);
  if (selector === undefined || properties === undefined) {
    throw mpError(
      classSource.filePath,
      'addStyle 需要 selector 与 properties 字面量'
    );
  }
  return {
    selector,
    properties,
    ...(hover ? { hover } : {}),
    ...(media ? { media } : {}),
  };
}

function foldObjectString(
  ts: typeof tsTypes,
  object: tsTypes.ObjectLiteralExpression,
  key: string,
  consts: Map<string, tsTypes.Expression>
): string | undefined {
  const value = objectProperty(ts, object, key);
  if (!value) {
    return undefined;
  }
  const folded = foldExpression(ts, value, consts);
  return typeof folded === 'string' ? folded : undefined;
}

function foldObjectRecord(
  ts: typeof tsTypes,
  object: tsTypes.ObjectLiteralExpression,
  key: string,
  consts: Map<string, tsTypes.Expression>
): Record<string, string | number> | undefined {
  const value = objectProperty(ts, object, key);
  if (!value) {
    return undefined;
  }
  if (!ts.isObjectLiteralExpression(value)) {
    return undefined;
  }
  const result: Record<string, string | number> = {};
  for (const property of value.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) {
      return undefined;
    }
    const folded = foldExpression(ts, property.initializer, consts);
    if (typeof folded !== 'string' && typeof folded !== 'number') {
      return undefined;
    }
    result[property.name.text] = folded;
  }
  return result;
}

function foldMedia(
  ts: typeof tsTypes,
  object: tsTypes.ObjectLiteralExpression,
  consts: Map<string, tsTypes.Expression>
): Record<string, Record<string, string | number>> | undefined {
  const value = objectProperty(ts, object, 'media');
  if (!value) {
    return undefined;
  }
  if (!ts.isObjectLiteralExpression(value)) {
    return undefined;
  }
  const result: Record<string, Record<string, string | number>> = {};
  for (const property of value.properties) {
    if (
      !ts.isPropertyAssignment(property) ||
      !ts.isStringLiteral(property.name) ||
      !ts.isObjectLiteralExpression(property.initializer)
    ) {
      return undefined;
    }
    const props: Record<string, string | number> = {};
    for (const item of property.initializer.properties) {
      if (!ts.isPropertyAssignment(item) || !ts.isIdentifier(item.name)) {
        return undefined;
      }
      const folded = foldExpression(ts, item.initializer, consts);
      if (typeof folded !== 'string' && typeof folded !== 'number') {
        return undefined;
      }
      props[item.name.text] = folded;
    }
    result[property.name.text] = props;
  }
  return result;
}

function renderStyle(entry: StyleEntry, lengthUnit: 'px' | 'rpx'): string {
  // WXSS 没有 body，全局样式用 page 选择器
  const selector = entry.selector === 'body' ? 'page' : entry.selector;
  const parts: string[] = [];
  parts.push(`${selector} {\n${convertToCss(entry.properties, lengthUnit)}\n}`);
  if (entry.hover) {
    // WXSS 不支持 :hover 伪类，输出 hover-class 样式块（.xxx-hover）
    parts.push(
      `${selector}-hover {\n${convertToCss(entry.hover, lengthUnit)}\n}`
    );
  }
  for (const [query, properties] of Object.entries(entry.media ?? {})) {
    parts.push(
      `@media ${query} {\n${selector} {\n${convertToCss(
        properties,
        lengthUnit
      )}\n}\n}`
    );
  }
  return parts.join('\n');
}

function convertToCss(
  properties: Record<string, string | number>,
  lengthUnit: 'px' | 'rpx'
): string {
  return Object.entries(properties)
    .map(([key, value]) => {
      const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      return `  ${cssKey}: ${formatValue(key, value, lengthUnit)};`;
    })
    .join('\n');
}

function formatValue(
  key: string,
  value: string | number,
  lengthUnit: 'px' | 'rpx'
): string {
  if (typeof value !== 'number') {
    return value;
  }
  // 0 与无单位属性不追加单位
  if (value === 0 || UNITLESS_PROPERTIES.has(key)) {
    return String(value);
  }
  // 数值长度默认 px；rpx 模式下按 1px=2rpx 换算（375 设计稿基准）
  return lengthUnit === 'rpx' ? `${value * 2}rpx` : `${value}px`;
}

function objectProperty(
  ts: typeof tsTypes,
  object: tsTypes.ObjectLiteralExpression,
  key: string
): tsTypes.Expression | undefined {
  for (const property of object.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === key
    ) {
      return property.initializer;
    }
  }
  return undefined;
}

function collectModuleConsts(
  context: CompileContext,
  classSource: ClassSource
): Map<string, tsTypes.Expression> {
  const consts = new Map<string, tsTypes.Expression>();
  for (const statement of classSource.source.statements) {
    if (!context.ts.isVariableStatement(statement)) {
      continue;
    }
    const isConst =
      statement.declarationList.flags & context.ts.NodeFlags.Const;
    if (!isConst) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        context.ts.isIdentifier(declaration.name) &&
        declaration.initializer
      ) {
        consts.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  return consts;
}
