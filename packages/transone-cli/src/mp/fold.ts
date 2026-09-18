import type * as tsTypes from 'typescript';

export type FoldedValue =
  | string
  | number
  | boolean
  | null
  | FoldedValue[]
  | { [key: string]: FoldedValue };

/** 收集源文件顶层 const 声明（name -> 初始化表达式）。 */
export function collectModuleConsts(
  ts: typeof tsTypes,
  source: tsTypes.SourceFile
): Map<string, tsTypes.Expression> {
  const consts = new Map<string, tsTypes.Expression>();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    const isConst = statement.declarationList.flags & ts.NodeFlags.Const;
    if (!isConst) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        consts.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  return consts;
}

/**
 * 常量折叠：把可静态求值的表达式折叠为 JSON 值。
 * 无法求值时返回 undefined（调用方决定如何报错）。
 */
export function foldExpression(
  ts: typeof tsTypes,
  node: tsTypes.Node,
  consts: Map<string, tsTypes.Expression>,
  seen = new Set<string>()
): FoldedValue | undefined {
  node = unwrapParentheses(ts, node);

  if (ts.isStringLiteral(node)) {
    return node.text;
  }
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    // 含 {{}} 的模板串依赖运行时 TemplateEngine，不是常量
    if (node.text.includes('{{')) {
      return undefined;
    }
    return node.text;
  }
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }

  if (ts.isPrefixUnaryExpression(node)) {
    const operand = foldExpression(ts, node.operand, consts, seen);
    if (operand === undefined) {
      return undefined;
    }
    if (node.operator === ts.SyntaxKind.MinusToken) {
      return typeof operand === 'number' ? -operand : undefined;
    }
    if (node.operator === ts.SyntaxKind.PlusToken) {
      return typeof operand === 'number' ? operand : undefined;
    }
    if (node.operator === ts.SyntaxKind.ExclamationToken) {
      return !operand;
    }
    return undefined;
  }

  if (ts.isBinaryExpression(node)) {
    const left = foldExpression(ts, node.left, consts, seen);
    const right = foldExpression(ts, node.right, consts, seen);
    if (left === undefined || right === undefined) {
      return undefined;
    }
    return foldBinary(ts, node.operatorToken.kind, left, right);
  }

  if (ts.isConditionalExpression(node)) {
    const condition = foldExpression(ts, node.condition, consts, seen);
    if (typeof condition !== 'boolean') {
      return undefined;
    }
    return condition
      ? foldExpression(ts, node.whenTrue, consts, seen)
      : foldExpression(ts, node.whenFalse, consts, seen);
  }

  if (ts.isArrayLiteralExpression(node)) {
    const items: FoldedValue[] = [];
    for (const element of node.elements) {
      if (ts.isSpreadElement(element)) {
        const spread = foldExpression(ts, element.expression, consts, seen);
        if (!Array.isArray(spread)) {
          return undefined;
        }
        items.push(...spread);
        continue;
      }
      const value = foldExpression(ts, element, consts, seen);
      if (value === undefined) {
        return undefined;
      }
      items.push(value);
    }
    return items;
  }

  if (ts.isObjectLiteralExpression(node)) {
    const result: Record<string, FoldedValue> = {};
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) {
        const key = propertyNameText(ts, property.name);
        const value = foldExpression(ts, property.initializer, consts, seen);
        if (key === undefined || value === undefined) {
          return undefined;
        }
        result[key] = value;
        continue;
      }
      if (
        ts.isShorthandPropertyAssignment(property) &&
        ts.isIdentifier(property.name)
      ) {
        const initializer = consts.get(property.name.text);
        if (!initializer) {
          return undefined;
        }
        const value = foldExpression(ts, initializer, consts, seen);
        if (value === undefined) {
          return undefined;
        }
        result[property.name.text] = value;
        continue;
      }
      return undefined;
    }
    return result;
  }

  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) {
      return undefined;
    }
    const initializer = consts.get(node.text);
    if (!initializer) {
      return undefined;
    }
    seen.add(node.text);
    const value = foldExpression(ts, initializer, consts, seen);
    seen.delete(node.text);
    return value;
  }

  if (ts.isPropertyAccessExpression(node)) {
    const base = foldExpression(ts, node.expression, consts, seen);
    if (base === undefined) {
      return undefined;
    }
    if (Array.isArray(base)) {
      if (node.name.text === 'length') {
        return base.length;
      }
      return undefined;
    }
    if (typeof base === 'object' && base !== null) {
      return base[node.name.text];
    }
    return undefined;
  }

  if (ts.isElementAccessExpression(node)) {
    const base = foldExpression(ts, node.expression, consts, seen);
    const index = foldExpression(ts, node.argumentExpression, consts, seen);
    if (!Array.isArray(base) || typeof index !== 'number') {
      return undefined;
    }
    return base[index];
  }

  if (ts.isTemplateExpression(node)) {
    let result = '';
    if (node.head.text !== '') {
      result += node.head.text;
    }
    for (const span of node.templateSpans) {
      const value = foldExpression(ts, span.expression, consts, seen);
      if (value === undefined) {
        return undefined;
      }
      result += String(value);
      result += span.literal.text;
    }
    return result;
  }

  return undefined;
}

function foldBinary(
  ts: typeof tsTypes,
  operator: tsTypes.SyntaxKind,
  left: FoldedValue,
  right: FoldedValue
): FoldedValue | undefined {
  switch (operator) {
    case ts.SyntaxKind.PlusToken:
      return `${left}${right}` as FoldedValue;
    case ts.SyntaxKind.MinusToken:
      return (left as number) - (right as number);
    case ts.SyntaxKind.AsteriskToken:
      return (left as number) * (right as number);
    case ts.SyntaxKind.SlashToken:
      return (left as number) / (right as number);
    case ts.SyntaxKind.PercentToken:
      return (left as number) % (right as number);
    case ts.SyntaxKind.EqualsEqualsEqualsToken:
      return left === right;
    case ts.SyntaxKind.ExclamationEqualsEqualsToken:
      return left !== right;
    case ts.SyntaxKind.LessThanToken:
      return (left as number) < (right as number);
    case ts.SyntaxKind.LessThanEqualsToken:
      return (left as number) <= (right as number);
    case ts.SyntaxKind.GreaterThanToken:
      return (left as number) > (right as number);
    case ts.SyntaxKind.GreaterThanEqualsToken:
      return (left as number) >= (right as number);
    case ts.SyntaxKind.AmpersandAmpersandToken:
      return Boolean(left) && Boolean(right);
    case ts.SyntaxKind.BarBarToken:
      return Boolean(left) || Boolean(right);
    default:
      return undefined;
  }
}

export function propertyNameText(
  ts: typeof tsTypes,
  name: tsTypes.PropertyName
): string | undefined {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return undefined;
}

export function unwrapParentheses<T extends tsTypes.Node>(
  ts: typeof tsTypes,
  node: T
): T {
  let current: tsTypes.Node = node;
  while (ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current as T;
}

/** this 表达式判断（TypeScript API 未导出 isThisExpression）。 */
export function isThisExpression(
  ts: typeof tsTypes,
  node: tsTypes.Node
): node is tsTypes.ThisExpression {
  return node.kind === ts.SyntaxKind.ThisKeyword;
}
