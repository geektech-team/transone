import ts from 'typescript';
import {
  analyzeInstanceFields,
  fieldValueNode,
  outerTransparent,
  DeferredInitialProps,
  referencesProps,
  type InstanceFieldPlan,
} from '../components/instance-fields';
import { reference } from './inheritance';
import { ownedMethod } from './inheritance';
import { runtimeOwner, sourceSymbolAt } from './source';
import { mpError } from './errors';
import type { ClassSource, CompileContext } from './types';
export interface FieldStateAlias {
  field: string[];
  state: string[];
}
export function stateAliases(
  plan: InstanceFieldPlan,
  root: unknown
): FieldStateAlias[] {
  const states = new Map<object, string[]>();
  const collect = (value: unknown, path: string[]): void => {
    if (!value || typeof value !== 'object' || states.has(value)) return;
    states.set(value, path);
    for (const [key, item] of Object.entries(value))
      collect(item, [...path, key]);
  };
  collect(root, []);
  const aliases: FieldStateAlias[] = [];
  const visit = (value: unknown, path: string[]): void => {
    if (!value || typeof value !== 'object') return;
    const state = states.get(value);
    if (state) aliases.push({ field: path, state });
    for (const [key, item] of Object.entries(value))
      visit(item, [...path, key]);
  };
  for (const [key, value] of plan.values) visit(value, [key]);
  return aliases.sort((a, b) => b.field.length - a.field.length);
}
export function instanceFieldPath(node: ts.Node): string[] | undefined {
  const path: string[] = [];
  node = unwrapField(node);
  while (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node)
  ) {
    if (ts.isPropertyAccessExpression(node)) path.unshift(node.name.text);
    else if (
      ts.isStringLiteralLike(node.argumentExpression) ||
      ts.isNumericLiteral(node.argumentExpression)
    )
      path.unshift(node.argumentExpression.text);
    else return undefined;
    node = unwrapField(node.expression);
  }
  return node.kind === ts.SyntaxKind.ThisKeyword ? path : undefined;
}

function fieldOwners(
  context: CompileContext,
  source: ClassSource
): ClassSource[] {
  const ref = reference(context, source);
  if (!ref || !context.index) return [source];
  const effective = new Set(
    context.index.members(ref).map((member) => member.owner.id)
  );
  return context.index
    .hierarchy(ref)
    .filter(
      (owner) =>
        !owner.source.isDeclarationFile ||
        effective.has(owner.id) ||
        owner.declaration.members.some(
          (member) =>
            ts.isPropertyDeclaration(member) &&
            !member.modifiers?.some(
              (m) => m.kind === ts.SyntaxKind.StaticKeyword
            )
        )
    )
    .map((owner) => runtimeOwner(context, owner));
}

export function instanceFields(
  context: CompileContext,
  source: ClassSource
): InstanceFieldPlan {
  const owners = fieldOwners(context, source);
  return analyzeInstanceFields(owners, {
    deferProps: true,
    resolve(node) {
      const declaration = sourceSymbolAt(context, node)?.valueDeclaration;
      return declaration && ts.isVariableDeclaration(declaration)
        ? declaration
        : undefined;
    },
    sources: [
      ...(context.index?.sources ?? []),
      ...owners.map((owner) => owner.source),
    ],
    fail(node, message): never {
      const source = node.getSourceFile();
      const point = source.getLineAndCharacterOfPosition(node.getStart());
      throw mpError(
        source.fileName,
        `${point.line + 1}:${point.character + 1} ${message}`
      );
    },
  });
}
export function requiresInitialProps(
  context: CompileContext,
  source: ClassSource
): boolean {
  const owners = fieldOwners(context, source);
  if (
    owners.some((owner) =>
      owner.declaration.members.some(
        (member) =>
          ts.isPropertyDeclaration(member) &&
          !!member.initializer &&
          referencesProps(member.initializer)
      )
    )
  )
    return true;
  const method = ownedMethod(context, source, 'initState');
  if (!method?.declaration.body) return false;
  if (referencesProps(method.declaration.body)) return true;
  // A super initializer may consume props even when the selected override does not.
  return owners.some((owner) =>
    owner.declaration.members.some(
      (member) =>
        ts.isMethodDeclaration(member) &&
        member.name.getText(owner.source) === 'initState' &&
        !!member.body &&
        referencesProps(member.body)
    )
  );
}

export function fieldRoot(node: ts.Node): string | undefined {
  let current = unwrapField(node);
  while (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current)
  ) {
    if (unwrapField(current.expression).kind === ts.SyntaxKind.ThisKeyword) {
      return ts.isPropertyAccessExpression(current)
        ? current.name.text
        : ts.isStringLiteralLike(current.argumentExpression)
          ? current.argumentExpression.text
          : undefined;
    }
    current = unwrapField(current.expression);
  }
  return undefined;
}

function unwrapField(node: ts.Node): ts.Node {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node)
  )
    node = node.expression;
  return node;
}
/** Static consumers must not freeze a field that runtime methods can change. */
export function assertStaticField(
  context: CompileContext,
  source: ClassSource,
  key: string,
  plan?: InstanceFieldPlan
): void {
  const aliases = new Set([key]);
  if (plan) {
    const references = (
      value: unknown,
      found = new Set<object>()
    ): Set<object> => {
      if (value && typeof value === 'object' && !found.has(value)) {
        found.add(value);
        Object.values(value).forEach((item) => references(item, found));
      }
      return found;
    };
    const target = references(plan.values.get(key));
    for (const [name, value] of plan.values)
      if ([...references(value)].some((item) => target.has(item)))
        aliases.add(name);
  }
  const owners = fieldOwners(context, source);
  for (const owner of owners) {
    const visit = (node: ts.Node): void => {
      if (
        (ts.isBinaryExpression(node) &&
          node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
          aliases.has(fieldRoot(node.left) ?? '')) ||
        ((ts.isPostfixUnaryExpression(node) ||
          (ts.isPrefixUnaryExpression(node) &&
            (node.operator === ts.SyntaxKind.PlusPlusToken ||
              node.operator === ts.SyntaxKind.MinusMinusToken))) &&
          aliases.has(fieldRoot(node.operand) ?? '')) ||
        (ts.isDeleteExpression(node) &&
          aliases.has(fieldRoot(node.expression) ?? '')) ||
        (ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          aliases.has(fieldRoot(node.expression) ?? ''))
      ) {
        throw mpError(
          owner.filePath,
          `实例字段 ${key} 被运行时修改或调用，不能用于静态模板/样式`
        );
      }
      const root = fieldRoot(node),
        outer = outerTransparent(node);
      if (
        plan &&
        root &&
        aliases.has(root) &&
        (ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node)) &&
        !(
          (ts.isPropertyAccessExpression(node.parent) ||
            ts.isElementAccessExpression(node.parent)) &&
          node.parent.expression === node
        )
      ) {
        let value: unknown;
        try {
          value = plan.evaluate(node);
        } catch (error) {
          if (!(error instanceof DeferredInitialProps)) throw error;
        }
        const parent = outer.parent;
        if (value && typeof value === 'object') {
          const comparison =
            ts.isBinaryExpression(parent) &&
            [
              ts.SyntaxKind.EqualsEqualsEqualsToken,
              ts.SyntaxKind.ExclamationEqualsEqualsToken,
            ].includes(parent.operatorToken.kind);
          const booleanRead =
            (ts.isPrefixUnaryExpression(parent) &&
              parent.operator === ts.SyntaxKind.ExclamationToken) ||
            ts.isTypeOfExpression(parent) ||
            (ts.isConditionalExpression(parent) &&
              parent.condition === outer) ||
            ((ts.isIfStatement(parent) || ts.isWhileStatement(parent)) &&
              parent.expression === outer);
          const propertyRead =
            (ts.isPropertyAccessExpression(parent) ||
              ts.isElementAccessExpression(parent)) &&
            parent.expression === outer;
          if (!comparison && !booleanRead && !propertyRead)
            throw mpError(
              owner.filePath,
              `实例字段 ${key} 的对象引用可能逃逸，不能用于静态模板/样式`
            );
        }
        if (
          value &&
          typeof value === 'object' &&
          (ts.isVariableDeclaration(parent) ||
            ts.isReturnStatement(parent) ||
            ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
              parent.arguments?.includes(outer as ts.Expression)) ||
            (ts.isBinaryExpression(parent) &&
              parent.right === outer &&
              parent.operatorToken.kind === ts.SyntaxKind.EqualsToken))
        )
          throw mpError(
            owner.filePath,
            `实例字段 ${key} 存在运行时别名逃逸，不能用于静态模板/样式`
          );
      }
      ts.forEachChild(node, visit);
    };
    for (const member of owner.declaration.members)
      if (
        ts.isMethodDeclaration(member) &&
        !['initState', 'initStyles', 'render'].includes(
          member.name.getText(owner.source)
        )
      )
        visit(member);
  }
}

export function replaceFieldReads<T extends ts.Node>(
  node: T,
  plan: InstanceFieldPlan,
  context?: CompileContext,
  source?: ClassSource
): T {
  const transformed = ts.transform(node, [
    (transformContext) => (root) => {
      const visit = (current: ts.Node): ts.Node => {
        const key = fieldRoot(current);
        if (
          key &&
          plan.values.has(key) &&
          (ts.isPropertyAccessExpression(current) ||
            ts.isElementAccessExpression(current))
        ) {
          if (context && source) assertStaticField(context, source, key, plan);
          return fieldValueNode(plan.evaluate(current));
        }
        return ts.visitEachChild(current, visit, transformContext);
      };
      return ts.visitNode(root, visit) as T;
    },
  ]);
  const result = transformed.transformed[0];
  transformed.dispose();
  return result;
}
