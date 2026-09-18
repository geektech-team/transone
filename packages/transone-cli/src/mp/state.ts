import type * as tsTypes from 'typescript';
import { foldExpression } from './fold';
import { mpError } from './errors';
import { ClassSource, CompileContext } from './types';
import { findMethod } from './wxml';

/**
 * 编译 initState() 为小程序 data 初始值（JS 对象字面量源码）。
 * 只支持静态可求值的字面量/模块常量/局部常量；其余表达式快速报错。
 */
export function compileState(
  context: CompileContext,
  classSource: ClassSource
): string {
  const { ts } = context;
  const method = findMethod(context, classSource, 'initState');
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
  const value = foldExpression(ts, returnStatement.expression, allConsts);
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
