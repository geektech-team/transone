import type * as tsTypes from 'typescript';
import {
  foldExpression,
  FoldedValue,
  isThisExpression,
  unwrapParentheses,
} from './fold';
import { mpError } from './errors';

/** 绑定表达式求值作用域：each 参数名 + render 内局部 const。 */
export interface BindingScope {
  params: Set<string>;
  locals: Map<string, tsTypes.Expression>;
  /** 模块级 const（name -> 初始化表达式）。 */
  consts: Map<string, tsTypes.Expression>;
}

export interface BindingContext {
  ts: typeof tsTypes;
  scope: BindingScope;
  filePath: string;
  /** 组件模板中访问 this.props.X 时回调，用于收集 properties 声明。 */
  onProp?: (name: string) => void;
}

/**
 * 把 TypeScript 表达式转换为 WXML 数据绑定表达式（{{...}} 内的部分）。
 * 支持：this.state / this.props 路径、字面量、三元、二元、each 参数、
 * render 局部 const、可折叠的模块级 const。
 */
export function toBinding(context: BindingContext, node: tsTypes.Node): string {
  const { ts } = context;
  node = unwrapParentheses(ts, node);

  if (ts.isPropertyAccessExpression(node)) {
    const statePath = thisStatePath(ts, node);
    if (statePath) {
      return statePath;
    }
    const propsPath = thisPropsPath(ts, node);
    if (propsPath) {
      context.onProp?.(propsPath.split('.')[0]);
      return propsPath;
    }

    const folded = foldExpression(ts, node, context.scope.consts);
    if (folded !== undefined) {
      return literalToBinding(folded);
    }

    const base = toBinding(context, node.expression);
    if (!isPathLike(base)) {
      throw mpError(
        context.filePath,
        `模板表达式不支持该属性访问: ${node.getText()}`
      );
    }
    return `${base}.${node.name.text}`;
  }

  if (ts.isElementAccessExpression(node)) {
    const folded = foldExpression(ts, node, context.scope.consts);
    if (folded !== undefined) {
      return literalToBinding(folded);
    }
    const base = toBinding(context, node.expression);
    const index = toBinding(context, node.argumentExpression);
    if (!isPathLike(base)) {
      throw mpError(
        context.filePath,
        `模板表达式不支持该下标访问: ${node.getText()}`
      );
    }
    return `${base}[${index}]`;
  }

  if (ts.isIdentifier(node)) {
    const { params, locals, consts } = context.scope;
    if (params.has(node.text)) {
      return node.text;
    }
    if (locals.has(node.text)) {
      return toBinding(context, locals.get(node.text)!);
    }
    if (consts.has(node.text)) {
      const folded = foldExpression(ts, node, consts);
      if (folded !== undefined) {
        return literalToBinding(folded);
      }
      return toBinding(context, consts.get(node.text)!);
    }
    throw mpError(context.filePath, `无法解析模板标识符 "${node.text}"`);
  }

  if (ts.isStringLiteral(node)) {
    return singleQuoted(node.text);
  }
  if (ts.isNumericLiteral(node)) {
    return node.text;
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return 'true';
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return 'false';
  }
  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return 'null';
  }

  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    // 含 {{}} 的模板串本身就是 WXML 绑定语法，直接透传
    if (node.text.includes('{{')) {
      return node.text;
    }
    return singleQuoted(node.text);
  }

  if (ts.isTemplateExpression(node)) {
    const parts: string[] = [];
    if (node.head.text !== '') {
      parts.push(singleQuoted(node.head.text));
    }
    for (const span of node.templateSpans) {
      parts.push(toBinding(context, span.expression));
      if (span.literal.text !== '') {
        parts.push(singleQuoted(span.literal.text));
      }
    }
    return parts.join(' + ');
  }

  if (ts.isBinaryExpression(node)) {
    return `(${toBinding(context, node.left)} ${node.operatorToken.getText()} ${toBinding(context, node.right)})`;
  }

  if (ts.isConditionalExpression(node)) {
    return `(${toBinding(context, node.condition)} ? ${toBinding(context, node.whenTrue)} : ${toBinding(context, node.whenFalse)})`;
  }

  if (ts.isPrefixUnaryExpression(node)) {
    const operator = ts.tokenToString(node.operator) ?? String(node.operator);
    return `(${operator}${toBinding(context, node.operand)})`;
  }

  if (ts.isArrayLiteralExpression(node)) {
    const folded = foldExpression(ts, node, context.scope.consts);
    if (folded !== undefined) {
      return literalToBinding(folded);
    }
    const items = node.elements.map((element) => toBinding(context, element));
    return `[${items.join(', ')}]`;
  }

  if (ts.isObjectLiteralExpression(node)) {
    const folded = foldExpression(ts, node, context.scope.consts);
    if (folded !== undefined) {
      return literalToBinding(folded);
    }
    throw mpError(
      context.filePath,
      `模板表达式中的对象字面量无法静态求值: ${node.getText()}`
    );
  }

  if (ts.isCallExpression(node)) {
    throw mpError(
      context.filePath,
      `模板表达式不支持函数调用（如 ${node.getText()}）：WXML 无法执行方法，请在方法/state 中预先计算格式化结果`
    );
  }

  throw mpError(
    context.filePath,
    `不支持的模板表达式: ${node.getText() ?? node.kind}`
  );
}

/** this.state.a.b.c -> "a.b.c"；非该形态返回 undefined。 */
function thisStatePath(
  ts: typeof tsTypes,
  node: tsTypes.PropertyAccessExpression
): string | undefined {
  return thisMemberPath(ts, node, 'state');
}

/** this.props.a.b -> "a.b"；非该形态返回 undefined。 */
function thisPropsPath(
  ts: typeof tsTypes,
  node: tsTypes.PropertyAccessExpression
): string | undefined {
  return thisMemberPath(ts, node, 'props');
}

function thisMemberPath(
  ts: typeof tsTypes,
  node: tsTypes.PropertyAccessExpression,
  member: string
): string | undefined {
  let current: tsTypes.Expression = node;
  const parts: string[] = [];
  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = current.expression;
    if (
      ts.isPropertyAccessExpression(current) &&
      isThisExpression(ts, current.expression)
    ) {
      if (current.name.text === member) {
        return parts.join('.');
      }
      return undefined;
    }
    if (ts.isElementAccessExpression(current)) {
      if (
        !ts.isStringLiteral(current.argumentExpression) ||
        !thisMemberBase(ts, current.expression)
      ) {
        return undefined;
      }
      parts.unshift(current.argumentExpression.text);
      current = current.expression;
      if (
        ts.isPropertyAccessExpression(current) &&
        current.name.text === member
      ) {
        return parts.join('.');
      }
      return undefined;
    }
  }
  return undefined;
}

function thisMemberBase(ts: typeof tsTypes, node: tsTypes.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(node) && isThisExpression(ts, node.expression)
  );
}

function isPathLike(value: string): boolean {
  return /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(value);
}

function literalToBinding(value: FoldedValue): string {
  if (typeof value === 'string') {
    return singleQuoted(value);
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(literalToBinding).join(', ')}]`;
  }
  const entries = Object.entries(value).map(
    ([key, item]) => `${key}: ${literalToBinding(item)}`
  );
  return `{${entries.join(', ')}}`;
}

function singleQuoted(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}
