import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type * as tsTypes from 'typescript';
import { mpError } from './errors';
import { ClassSource, CompileContext } from './types';
import { unwrapParentheses } from './fold';

interface ImportBinding {
  specifier: string;
  importedName: string;
}

/** 读取并缓存源文件。 */
export function readSource(
  context: CompileContext,
  filePath: string
): tsTypes.SourceFile {
  const cached = context.files.get(filePath);
  if (cached) {
    return cached;
  }
  if (!existsSync(filePath)) {
    throw mpError(filePath, '源文件不存在');
  }
  const text = readFileSync(filePath, 'utf8');
  const source = context.ts.createSourceFile(
    filePath,
    text,
    context.ts.ScriptTarget.Latest,
    true,
    context.ts.ScriptKind.TS
  );
  context.files.set(filePath, source);
  return source;
}

/** 从页面入口定位根组件类：优先 createApp({ root })，其次导出的 Component 子类。 */
export function findRootClass(
  context: CompileContext,
  filePath: string
): ClassSource {
  const { ts } = context;
  const source = readSource(context, filePath);
  const imports = collectImports(context.ts, source);
  const localClasses = collectLocalClasses(context.ts, source);

  // 1. createApp({ root: App })
  // 入口通常写作 `export const app = createApp({ root: App })`（VariableStatement
  // 初始化器）或独立表达式语句；两种形态都要识别。
  for (const expression of topLevelExpressions(ts, source)) {
    if (!context.ts.isCallExpression(expression)) {
      continue;
    }
    const calleeName = callName(context.ts, expression.expression);
    const isCreateApp =
      calleeName === 'createApp' ||
      (calleeName !== undefined &&
        imports.get(calleeName)?.importedName === 'createApp');
    if (!isCreateApp) {
      continue;
    }
    const rootExpr = createAppRoot(context.ts, expression);
    if (!rootExpr) {
      continue;
    }
    return resolveClassReference(context, { filePath, source }, rootExpr);
  }

  // 2. 导出的 Component 子类
  for (const statement of source.statements) {
    if (!context.ts.isClassDeclaration(statement)) {
      continue;
    }
    const name = statement.name?.text;
    if (!name || !isExported(context.ts, statement)) {
      continue;
    }
    if (
      isComponentSubclass(context, {
        filePath,
        source,
        declaration: statement,
        className: name,
      })
    ) {
      return {
        filePath,
        source,
        declaration: statement,
        className: name,
      };
    }
  }

  // 3. 本地（未导出）Component 子类，供 createApp 的 root 回退使用
  for (const [name, declaration] of localClasses) {
    if (
      isComponentSubclass(context, {
        filePath,
        source,
        declaration,
        className: name,
      })
    ) {
      return { filePath, source, declaration, className: name };
    }
  }

  throw mpError(
    filePath,
    '未找到可编译的页面组件：需要 createApp({ root }) 或导出的 Component 子类'
  );
}

/** 类解析所需的来源上下文（文件 + 已解析的源）。 */
export type ClassResolverContext = Pick<ClassSource, 'filePath' | 'source'>;

/**
 * 解析一个类引用（标识符 / 类表达式）为 ClassSource。
 * 支持同文件类、相对路径导入的类；非相对导入会报错。
 */
export function resolveClassReference(
  context: CompileContext,
  from: ClassResolverContext,
  expr: tsTypes.Expression
): ClassSource {
  const { ts } = context;
  expr = unwrapParentheses(ts, expr);

  if (ts.isClassExpression(expr) || ts.isClassDeclaration(expr)) {
    const name = expr.name?.text;
    if (!name) {
      throw mpError(from.filePath, '匿名组件类不支持编译到小程序');
    }
    return {
      filePath: from.filePath,
      source: from.source,
      declaration: expr,
      className: name,
    };
  }

  if (!ts.isIdentifier(expr)) {
    throw mpError(
      from.filePath,
      `组件引用必须是类名或类表达式: ${expr.getText().slice(0, 60)}`
    );
  }
  const name = expr.text;

  // 同文件类声明
  const local = collectLocalClasses(ts, from.source).get(name);
  if (local) {
    return {
      filePath: from.filePath,
      source: from.source,
      declaration: local,
      className: name,
    };
  }

  // 导入的类
  const imports = collectImports(ts, from.source);
  const binding = imports.get(name);
  if (binding) {
    return resolveImportedClass(context, from, name, binding);
  }

  throw mpError(from.filePath, `无法解析组件标识符 "${name}"`);
}

/** 判断类是否为 Component 子类（extends 一个从 transone 导入或名为 Component 的类）。 */
export function isComponentSubclass(
  context: CompileContext,
  classSource: ClassSource
): boolean {
  const { ts } = context;
  const heritage = classSource.declaration.heritageClauses ?? [];
  const imports = collectImports(ts, classSource.source);
  for (const clause of heritage) {
    if (clause.token !== ts.SyntaxKind.ExtendsKeyword) {
      continue;
    }
    for (const type of clause.types) {
      if (!ts.isExpressionWithTypeArguments(type)) {
        continue;
      }
      const expression = unwrapParentheses(ts, type.expression);
      if (!ts.isIdentifier(expression)) {
        continue;
      }
      const binding = imports.get(expression.text);
      if (binding && binding.specifier.includes('transone')) {
        return true;
      }
      if (expression.text === 'Component') {
        return true;
      }
    }
  }
  return false;
}

function resolveImportedClass(
  context: CompileContext,
  from: ClassResolverContext,
  localName: string,
  binding: ImportBinding
): ClassSource {
  if (binding.specifier.startsWith('.')) {
    const targetPath = resolveImportPath(from.filePath, binding.specifier);
    if (!targetPath) {
      throw mpError(
        from.filePath,
        `找不到导入文件 "${binding.specifier}"（相对 ${from.filePath}）`
      );
    }
    const source = readSource(context, targetPath);
    const importedName = binding.importedName;
    const found = findExportedClass(context, source, importedName, new Set());
    if (!found) {
      throw mpError(
        targetPath,
        `找不到导出的组件类 "${importedName}"（从 ${localName} 导入）`
      );
    }
    return {
      filePath: found.filePath,
      source: readSource(context, found.filePath),
      declaration: found.declaration,
      className: importedName,
    };
  }
  return resolvePackageClass(context, from, localName, binding);
}

/**
 * 解析包名导入的组件（如 `import { TuButton } from 'transone-ui'`）：
 * 沿目录向上查找 node_modules/<specifier>/package.json，按其 `source` 字段
 * （约定为可编译的 TS 源码入口）定位源码，再沿具名 re-export 找到组件类。
 */
function resolvePackageClass(
  context: CompileContext,
  from: ClassResolverContext,
  localName: string,
  binding: ImportBinding
): ClassSource {
  const packageInfo = findPackageInfo(from.filePath, binding.specifier);
  if (!packageInfo) {
    throw mpError(
      from.filePath,
      `无法解析组件来源 "${binding.specifier}"：找不到 node_modules 包（仅支持相对路径或已安装的包）`
    );
  }
  const sourceField = packageInfo.source;
  if (typeof sourceField !== 'string' || sourceField.length === 0) {
    throw mpError(
      from.filePath,
      `包 "${binding.specifier}" 缺少 "source" 字段：小程序编译需要可分析的 TS 源码入口（在 package.json 声明 "source": "./lib/index.ts"）`
    );
  }
  const targetPath = resolvePackageSource(packageInfo.dir, sourceField);
  if (!targetPath) {
    throw mpError(
      from.filePath,
      `包 "${binding.specifier}" 的 "source" 指向的文件不存在: ${sourceField}`
    );
  }
  const source = readSource(context, targetPath);
  const importedName = binding.importedName;
  const found = findExportedClass(context, source, importedName, new Set());
  if (!found) {
    throw mpError(
      targetPath,
      `找不到导出的组件类 "${importedName}"（从 ${localName} 导入，包 "${binding.specifier}"）`
    );
  }
  return {
    filePath: found.filePath,
    source: readSource(context, found.filePath),
    declaration: found.declaration,
    className: importedName,
  };
}

interface PackageInfo {
  dir: string;
  source?: unknown;
}

/** 沿 fromFile 目录向上查找 node_modules/<specifier>/package.json。 */
function findPackageInfo(fromFile: string, specifier: string): PackageInfo | undefined {
  const segments = specifier.split('/');
  const packageJsonRelative = join('node_modules', ...segments, 'package.json');
  let current = dirname(fromFile);
  for (;;) {
    const candidate = join(current, packageJsonRelative);
    if (existsSync(candidate)) {
      try {
        const json = JSON.parse(readFileSync(candidate, 'utf8')) as Record<string, unknown>;
        return { dir: join(current, 'node_modules', ...segments), source: json.source };
      } catch {
        return undefined;
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function resolvePackageSource(packageDir: string, sourceField: string): string | undefined {
  const base = resolve(packageDir, sourceField);
  const candidates = [base, `${base}.ts`, `${base}.tsx`];
  return candidates.find((candidate) => existsSync(candidate));
}

interface ExportedClassLocation {
  filePath: string;
  declaration: tsTypes.ClassDeclaration;
}

function findExportedClass(
  context: CompileContext,
  source: tsTypes.SourceFile,
  name: string,
  seen: Set<string>
): ExportedClassLocation | undefined {
  const { ts } = context;
  if (seen.has(source.fileName)) {
    return undefined;
  }
  seen.add(source.fileName);

  for (const statement of source.statements) {
    if (ts.isClassDeclaration(statement) && statement.name?.text === name) {
      if (isExported(ts, statement)) {
        return { filePath: source.fileName, declaration: statement };
      }
    }
  }
  // export { X }（本地类）与 export { X } from './path'（re-export）
  for (const statement of source.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        if (element.name.text !== name) {
          continue;
        }
        const local = collectLocalClasses(ts, source).get(name);
        if (local) {
          return { filePath: source.fileName, declaration: local };
        }
        if (!statement.moduleSpecifier) {
          continue;
        }
        const specifier = statement.moduleSpecifier.getText().replace(/['"]/g, '');
        if (!specifier.startsWith('.')) {
          continue;
        }
        const targetPath = resolveImportPath(source.fileName, specifier);
        if (!targetPath) {
          continue;
        }
        const targetSource = readSource(context, targetPath);
        const reExported = findExportedClass(
          context,
          targetSource,
          element.propertyName?.text ?? element.name.text,
          seen
        );
        if (reExported) {
          return reExported;
        }
      }
    }
  }
  return undefined;
}

/** 顶层可求值表达式：表达式语句 + 变量声明的初始化器（如 export const app = createApp(...)）。 */
function topLevelExpressions(
  ts: typeof tsTypes,
  source: tsTypes.SourceFile
): tsTypes.Expression[] {
  const expressions: tsTypes.Expression[] = [];
  for (const statement of source.statements) {
    if (ts.isExpressionStatement(statement)) {
      expressions.push(statement.expression);
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (declaration.initializer) {
          expressions.push(declaration.initializer);
        }
      }
    }
  }
  return expressions;
}

function createAppRoot(
  ts: typeof tsTypes,
  call: tsTypes.CallExpression
): tsTypes.Expression | undefined {
  for (const argument of call.arguments) {
    const object = unwrapParentheses(ts, argument);
    if (!ts.isObjectLiteralExpression(object)) {
      continue;
    }
    for (const property of object.properties) {
      if (
        ts.isPropertyAssignment(property) &&
        ts.isIdentifier(property.name) &&
        property.name.text === 'root'
      ) {
        return property.initializer;
      }
    }
  }
  return undefined;
}

function collectLocalClasses(
  ts: typeof tsTypes,
  source: tsTypes.SourceFile
): Map<string, tsTypes.ClassDeclaration> {
  const classes = new Map<string, tsTypes.ClassDeclaration>();
  for (const statement of source.statements) {
    if (ts.isClassDeclaration(statement) && statement.name) {
      classes.set(statement.name.text, statement);
    }
  }
  return classes;
}

function collectImports(
  ts: typeof tsTypes,
  source: tsTypes.SourceFile
): Map<string, ImportBinding> {
  const imports = new Map<string, ImportBinding>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }
    const specifier = statement.moduleSpecifier.getText().replace(/['"]/g, '');
    const bindings = statement.importClause?.namedBindings;
    if (!bindings) {
      continue;
    }
    if (ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        imports.set(element.name.text, {
          specifier,
          importedName: element.propertyName?.text ?? element.name.text,
        });
      }
    } else if (ts.isNamespaceImport(bindings)) {
      imports.set(bindings.name.text, { specifier, importedName: '*' });
    }
  }
  return imports;
}

function resolveImportPath(
  fromFile: string,
  specifier: string
): string | undefined {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function isExported(
  ts: typeof tsTypes,
  declaration: tsTypes.ClassDeclaration
): boolean {
  return (declaration.modifiers ?? []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
  );
}

function callName(
  ts: typeof tsTypes,
  expression: tsTypes.Expression
): string | undefined {
  expression = unwrapParentheses(ts, expression);
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  return undefined;
}
