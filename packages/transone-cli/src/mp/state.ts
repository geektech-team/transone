import type * as tsTypes from 'typescript';
import { foldExpression } from './fold';
import { mpError } from './errors';
import { ClassSource, CompileContext } from './types';
import { moduleConstants, ownedMethod, parentSource } from './inheritance';

/**
 * 编译 initState() 为小程序 data 初始值（JS 对象字面量源码）。
 * 只支持静态可求值的字面量/模块常量/局部常量；其余表达式快速报错。
 */
export function compileState(
  context: CompileContext,
  classSource: ClassSource
): string {
  const { ts } = context;
  const owned = ownedMethod(context, classSource, 'initState');
  const method = owned?.declaration;
  if (owned) classSource = owned.owner;
  if (!method?.body) {
    return '{}';
  }

  const consts = collectModuleConsts(context, classSource);
  const locals = new Map<string, tsTypes.Expression>();
  let returnStatement: tsTypes.ReturnStatement | undefined;
  for (const statement of method.body.statements) {
    if (ts.isVariableStatement(statement)) {
      const isConst = statement.declarationList.flags & ts.NodeFlags.Const;
      if (!isConst) {
        throw mpError(
          classSource.filePath,
          'initState() 内只支持 const 声明（data 需静态求值）'
        );
      }
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          locals.set(declaration.name.text, declaration.initializer);
        }
      }
      continue;
    }
    if (ts.isReturnStatement(statement)) {
      returnStatement = statement;
      continue;
    }
    throw mpError(
      classSource.filePath,
      `initState() 内不支持的语句（只支持 const 声明与 return）: ${statement.getText().slice(0, 60)}`
    );
  }
  if (!returnStatement?.expression) {
    throw mpError(classSource.filePath, 'initState() 必须以 return 表达式结束');
  }

  const allConsts = new Map([...consts, ...locals]);
  const replaceSuper = (expression: tsTypes.Expression): tsTypes.Expression => {
    const transformed = ts.transform(expression, [
      (transformContext) => (node) => {
        const visit = (current: tsTypes.Node): tsTypes.Node => {
          if (
            ts.isCallExpression(current) &&
            ts.isPropertyAccessExpression(current.expression) &&
            current.expression.expression.kind === ts.SyntaxKind.SuperKeyword &&
            current.expression.name.text === 'initState' &&
            current.arguments.length === 0
          ) {
            const parent = parentSource(context, classSource);
            const text = parent ? compileState(context, parent) : '{}';
            return ts
              .createSourceFile(
                'state.ts',
                `(${text})`,
                ts.ScriptTarget.Latest,
                true
              )
              .statements.filter(ts.isExpressionStatement)[0].expression;
          }
          return ts.visitEachChild(current, visit, transformContext);
        };
        return ts.visitNode(node, visit) as tsTypes.Expression;
      },
    ]);
    const result = transformed.transformed[0];
    transformed.dispose();
    return result;
  };
  for (const [name, value] of allConsts)
    allConsts.set(name, replaceSuper(value));
  const value = foldExpression(
    ts,
    replaceSuper(returnStatement.expression),
    allConsts
  );
  if (value === undefined) {
    throw mpError(
      classSource.filePath,
      'initState() 的结果必须能静态求值（只支持字面量、模块/局部常量与简单表达式）'
    );
  }
  return JSON.stringify(value, null, 2);
}

function collectModuleConsts(
  context: CompileContext,
  classSource: ClassSource
): Map<string, tsTypes.Expression> {
  return moduleConstants(context, classSource);
}
