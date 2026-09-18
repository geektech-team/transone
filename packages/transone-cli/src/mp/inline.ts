/**
 * 相对模块内联：小程序产物是自包含的（页面/组件 JS 不打包 node_modules），
 * 页面 import 的相对路径普通模块（非 Component 子类、非 transone 运行时）
 * 需要内联进页面/组件 JS，否则方法体中的标识符在产物里未定义。
 *
 * 处理规则：
 * - 相对路径 import（./、../）且目标文件不是组件文件 → 内联；
 * - 内联时剥离 import/export/interface/type 声明，顶层声明原样保留；
 * - 递归处理模块自身的相对 import（按依赖顺序输出），seen 集合防环。
 */
import { dirname, join } from 'node:path';
import type * as tsTypes from 'typescript';
import { warn } from './types';
import { readSource } from './analyze';
import type { ClassSource, CompileContext } from './types';

/** 收集 entry 源码需要内联的相对模块 JS 文本（依赖先于使用方）。 */
export function collectInlineModules(
  context: CompileContext,
  classSource: ClassSource
): string[] {
  const { ts } = context;
  const output: string[] = [];
  const seen = new Set<string>();
  const stack = new Set<string>();

  const walk = (source: tsTypes.SourceFile): void => {
    const filePath = source.fileName;
    if (seen.has(filePath)) {
      return;
    }
    // 先递归处理本文件的相对 import，保证依赖顺序
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement)) {
        continue;
      }
      const specifier = statement.moduleSpecifier;
      if (!ts.isStringLiteral(specifier)) {
        continue;
      }
      const target = resolveRelativeModule(context, filePath, specifier.text);
      if (!target) {
        continue;
      }
      if (stack.has(target)) {
        warn(context, `模块循环引用已跳过: ${target}`);
        continue;
      }
      stack.add(target);
      walk(readSource(context, target));
      stack.delete(target);
    }
    seen.add(filePath);
    output.push(compileInlineModule(context, source));
  };

  walk(classSource.source);
  return output;
}

/** 解析相对 import 目标；返回 null 表示不内联（非相对路径/包内组件）。 */
function resolveRelativeModule(
  context: CompileContext,
  fromFile: string,
  specifier: string
): string | null {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    return null;
  }
  const base = specifier.endsWith('.ts') ? specifier : `${specifier}.ts`;
  const resolved = join(dirname(fromFile), base);
  // 组件文件（导出 Component 子类）由编译器按自定义组件处理，不内联
  if (isComponentFile(context, resolved)) {
    return null;
  }
  return resolved;
}

/** 判定文件是否为组件文件（顶层导出了 Component 子类）。 */
function isComponentFile(context: CompileContext, filePath: string): boolean {
  const { ts } = context;
  const source = readSource(context, filePath);
  for (const statement of source.statements) {
    if (!ts.isClassDeclaration(statement)) {
      continue;
    }
    const name = statement.name?.text;
    if (!name) {
      continue;
    }
    const isExported = statement.modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword
    );
    if (!isExported) {
      continue;
    }
    const heritage = statement.heritageClauses?.some((clause) =>
      clause.types.some((type) => {
        const expr = type.expression;
        if (!ts.isIdentifier(expr)) {
          return false;
        }
        return expr.text === 'Component' || expr.text.endsWith('Component');
      })
    );
    if (heritage) {
      return true;
    }
  }
  return false;
}

/** 把模块源码转成可拼接的 JS：去 import/export/interface/type 声明并擦除类型。 */
function compileInlineModule(
  context: CompileContext,
  source: tsTypes.SourceFile
): string {
  const { ts } = context;
  const kept: tsTypes.Statement[] = [];
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) ||
      ts.isExportDeclaration(statement) ||
      ts.isExportAssignment(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      continue;
    }
    kept.push(statement);
  }

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const printed = printer.printList(
    ts.ListFormat.MultiLine,
    ts.factory.createNodeArray(kept),
    source
  );
  const transpiled = ts.transpileModule(printed, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ES2015,
    },
    reportDiagnostics: false,
  });
  // 顶层 export 前缀：内联进产物后不再是模块边界，直接剥离
  return transpiled.outputText.replace(/^export\s+/gm, '').trim();
}
