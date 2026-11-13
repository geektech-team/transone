import type * as tsTypes from 'typescript';
import { foldExpression } from './fold';
import { mpError } from './errors';
import { ClassSource, CompileContext } from './types';
import { moduleConstants, ownedMethod, parentSource } from './inheritance';
import {
  DeferredInitialProps,
  referencesProps,
  type InstanceFieldPlan,
  type InstanceFieldValue,
} from '../components/instance-fields';
import { instanceFields, stateAliases, type FieldStateAlias } from './fields';

/**
 * 编译 initState() 为小程序 data 初始值（JS 对象字面量源码）。
 * 只支持静态可求值的字面量/模块常量/局部常量；其余表达式快速报错。
 */
export function compileState(
  context: CompileContext,
  classSource: ClassSource,
  fields?: InstanceFieldPlan,
  aliases?: FieldStateAlias[]
): string {
  const plan = fields ?? instanceFields(context, classSource);
  try {
    const value = evaluateState(context, classSource, plan, new Set());
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw mpError(classSource.filePath, 'initState() 必须返回对象');
    function validateJSON(value: unknown): void {
      if (
        value === undefined ||
        (typeof value === 'number' && !Number.isFinite(value))
      )
        throw mpError(
          classSource.filePath,
          '初始 state 不支持 undefined 或非有限数字'
        );
      if (value && typeof value === 'object')
        Object.values(value).forEach(validateJSON);
    }
    validateJSON(value);
    if (aliases) aliases.push(...stateAliases(plan, value));
    return JSON.stringify(value, null, 2);
  } catch (error) {
    if (error instanceof DeferredInitialProps) return '{}';
    throw error;
  }
}

/** Keep parent objects alive until the final result is serialized. Each call
 * gets a fresh local-constant frame, while fields retain their actual identity. */
function evaluateState(
  context: CompileContext,
  classSource: ClassSource,
  fields: InstanceFieldPlan,
  active: Set<tsTypes.MethodDeclaration>
): InstanceFieldValue {
  const { ts } = context;
  const owned = ownedMethod(context, classSource, 'initState');
  const method = owned?.declaration;
  if (owned) classSource = owned.owner;
  if (!method?.body) return {};
  if (active.has(method))
    throw mpError(classSource.filePath, 'initState() 继承调用循环');
  const locals = new Map<tsTypes.VariableDeclaration, tsTypes.Expression>();
  let returned: tsTypes.Expression | undefined;
  for (const statement of method.body.statements) {
    if (returned)
      throw mpError(
        classSource.filePath,
        'initState() 必须以单个 return 表达式结束'
      );
    if (ts.isVariableStatement(statement)) {
      if (!(statement.declarationList.flags & ts.NodeFlags.Const))
        throw mpError(
          classSource.filePath,
          'initState() 内只支持 const 声明（data 需静态求值）'
        );
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer)
          throw mpError(
            classSource.filePath,
            'initState() 内只支持有初值的 const 标识符'
          );
        locals.set(declaration, declaration.initializer);
      }
    } else if (ts.isReturnStatement(statement) && statement.expression)
      returned = statement.expression;
    else
      throw mpError(
        classSource.filePath,
        'initState() 内只支持 const 声明与 return'
      );
  }
  if (!returned)
    throw mpError(classSource.filePath, 'initState() 必须以 return 表达式结束');
  let hasSuper = false;
  const findSuper = (node: tsTypes.Node): void => {
    if (node.kind === ts.SyntaxKind.SuperKeyword) hasSuper = true;
    ts.forEachChild(node, findSuper);
  };
  findSuper(method.body);
  // Preserve the legacy field-free, single-return static constant subset.
  if (
    !fields.entries.length &&
    !fields.usesProps &&
    !referencesProps(method.body) &&
    !hasSuper &&
    !locals.size
  ) {
    const value = foldExpression(
      ts,
      returned,
      collectModuleConsts(context, classSource)
    );
    if (value === undefined)
      throw mpError(classSource.filePath, 'initState() 的结果必须能静态求值');
    return value;
  }
  active.add(method);
  try {
    const resolveSuper = (): InstanceFieldValue => {
      const parent = parentSource(context, classSource);
      return parent ? evaluateState(context, parent, fields, active) : {};
    };
    // Validate unused local initializers too, including branches hidden by
    // deferred props. Their evaluation frames are intentionally discarded.
    for (const declaration of locals.keys()) {
      try {
        fields.evaluate(
          declaration.name as tsTypes.Identifier,
          undefined,
          locals,
          resolveSuper
        );
      } catch (error) {
        if (!(error instanceof DeferredInitialProps)) throw error;
      }
    }
    return fields.evaluate(returned, undefined, locals, resolveSuper);
  } finally {
    active.delete(method);
  }
}

function collectModuleConsts(
  context: CompileContext,
  classSource: ClassSource
): Map<string, tsTypes.Expression> {
  return moduleConstants(context, classSource);
}
