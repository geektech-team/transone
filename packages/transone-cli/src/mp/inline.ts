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
import { mpError } from './errors';
import { sourceSymbolAt } from './source';
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
  const requestImports: string[] = [];
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === 'transone/request' &&
      !statement.importClause?.isTypeOnly
    ) {
      const clause = statement.importClause;
      if (clause?.name)
        requestImports.push(
          `const ${clause.name.text} = getApp().__transoneRequest.default;`
        );
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        requestImports.push(
          `const ${bindings.name.text} = getApp().__transoneRequest;`
        );
      } else if (bindings && ts.isNamedImports(bindings)) {
        for (const item of bindings.elements) {
          if (!item.isTypeOnly)
            requestImports.push(
              `const ${item.name.text} = getApp().__transoneRequest[${JSON.stringify(item.propertyName?.text ?? item.name.text)}];`
            );
        }
      }
    }
    if (
      ts.isImportDeclaration(statement) ||
      ts.isExportDeclaration(statement) ||
      ts.isExportAssignment(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      continue;
    }
    // Component classes and createApp calls are compiled into Page/Component elsewhere.
    if (
      ts.isClassDeclaration(statement) &&
      statement.heritageClauses?.some((clause) =>
        clause.types.some(
          (type) =>
            ts.isIdentifier(type.expression) &&
            (type.expression.text === 'Component' ||
              type.expression.text.endsWith('Component'))
        )
      )
    )
      continue;
    if (ts.isVariableStatement(statement)) {
      const declarations = statement.declarationList.declarations.filter(
        (declaration) =>
          !(
            declaration.initializer &&
            ts.isCallExpression(declaration.initializer) &&
            ts.isIdentifier(declaration.initializer.expression) &&
            declaration.initializer.expression.text === 'createApp'
          )
      );
      if (declarations.length === 0) continue;
      kept.push(
        ts.factory.updateVariableStatement(
          statement,
          statement.modifiers,
          ts.factory.updateVariableDeclarationList(
            statement.declarationList,
            declarations
          )
        )
      );
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
  return [
    ...requestImports,
    transpiled.outputText.replace(/^export\s+/gm, '').trim(),
  ].join('\n');
}

/** Link only declarations referenced by compiled methods. Checker symbols preserve the
 * lexical module of every parent method and avoid same-name helper collisions. */
export class MethodModuleLinker {
  private readonly names = new Map<tsTypes.Declaration, string>();
  private readonly entries = new Map<
    tsTypes.SourceFile,
    Map<tsTypes.Node, tsTypes.Node>
  >();
  private readonly dependencies = new Map<
    tsTypes.SourceFile,
    Set<tsTypes.SourceFile>
  >();
  constructor(private readonly context: CompileContext) {}

  modules(): string[] {
    const { ts } = this.context;
    // A selected ordinary helper module runs its initialization once, in source
    // order. Discovering its initialization can select further helper modules.
    let size = -1;
    const linkedSize = (): number =>
      this.names.size +
      [...this.entries.values()].reduce(
        (count, entries) => count + entries.size,
        0
      );
    while (size !== linkedSize()) {
      size = linkedSize();
      for (const [source, entries] of this.entries) {
        const componentModule =
          this.context.packageComponentSources?.has(source) ||
          this.context.index!.classes.some(
            (ref) =>
              ref.source === source && this.context.index!.isComponent(ref)
          );
        for (const statement of source.statements) {
          if (ts.isImportDeclaration(statement)) {
            if (!statement.importClause && !componentModule)
              throw mpError(
                source.fileName,
                `小程序 helper 暂不支持副作用导入: ${statement.moduleSpecifier.getText(source)}`
              );
            continue;
          }
          if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) {
              if (
                componentModule &&
                !this.names.has(declaration) &&
                (!declaration.initializer ||
                  !this.referencesLinkedValue(declaration.initializer))
              )
                continue;
              if (
                !componentModule &&
                !this.names.has(declaration) &&
                (!declaration.initializer ||
                  !this.mayInitialize(declaration.initializer))
              )
                continue;
              if (!ts.isIdentifier(declaration.name))
                throw mpError(
                  source.fileName,
                  '小程序 helper 顶层解构初始化暂不支持'
                );
              this.link(declaration);
            }
            continue;
          }
          if (
            ts.isClassDeclaration(statement) &&
            !componentModule &&
            !this.names.has(statement) &&
            statement.members.some(
              (member) =>
                ts.isClassStaticBlockDeclaration(member) ||
                (ts.isPropertyDeclaration(member) &&
                  member.initializer &&
                  member.modifiers?.some(
                    (modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword
                  ))
            )
          ) {
            throw mpError(
              source.fileName,
              `小程序 helper 未引用类的静态初始化暂不支持: ${statement.name?.text ?? 'default'}`
            );
          }
          if (
            ts.isFunctionDeclaration(statement) ||
            ts.isClassDeclaration(statement) ||
            ts.isInterfaceDeclaration(statement) ||
            ts.isTypeAliasDeclaration(statement) ||
            ts.isExportDeclaration(statement)
          )
            continue;
          if (componentModule && !this.referencesLinkedValue(statement))
            continue;
          if (
            ts.isExportAssignment(statement) ||
            ts.isEnumDeclaration(statement) ||
            ts.isModuleDeclaration(statement)
          ) {
            throw mpError(
              source.fileName,
              `小程序 helper 不支持此初始化语句: ${statement.getText(source).slice(0, 80)}`
            );
          }
          entries.set(statement, this.rewrite(statement, source));
        }
      }
    }
    const output: string[] = [];
    const visited = new Set<tsTypes.SourceFile>();
    const active = new Set<tsTypes.SourceFile>();
    const emit = (source: tsTypes.SourceFile): void => {
      if (visited.has(source)) return;
      if (active.has(source))
        throw mpError(source.fileName, '小程序 helper 模块存在循环初始化依赖');
      active.add(source);
      for (const dependency of this.orderedDependencies(source))
        emit(dependency);
      active.delete(source);
      visited.add(source);
      const statements = [...(this.entries.get(source)?.entries() ?? [])]
        .sort(([a], [b]) => a.pos - b.pos)
        .map(([, node]) => node);
      const printer = ts.createPrinter();
      const printed = statements
        .map((node) => printer.printNode(ts.EmitHint.Unspecified, node, source))
        .join('\n');
      const result = ts.transpileModule(printed, {
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
        },
        reportDiagnostics: true,
      });
      const error = result.diagnostics?.find(
        (item) => item.category === ts.DiagnosticCategory.Error
      );
      if (error)
        throw mpError(
          source.fileName,
          `helper 转换失败: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`
        );
      output.push(
        result.outputText.replace(/^export\s+(default\s+)?/gm, '').trim()
      );
    };
    const dependedOn = new Set(
      [...this.dependencies.values()].flatMap((values) => [...values])
    );
    for (const source of this.entries.keys())
      if (!dependedOn.has(source)) emit(source);
    for (const source of this.entries.keys()) emit(source);
    return output;
  }

  /** Pure unused closures/constants need no execution and must not pull their
   * otherwise unreachable platform imports into the initialization graph. */
  private mayInitialize(node: tsTypes.Expression): boolean {
    const { ts } = this.context;
    if (
      ts.isArrowFunction(node) ||
      ts.isFunctionExpression(node) ||
      ts.isIdentifier(node) ||
      ts.isStringLiteralLike(node) ||
      ts.isNumericLiteral(node) ||
      [
        ts.SyntaxKind.TrueKeyword,
        ts.SyntaxKind.FalseKeyword,
        ts.SyntaxKind.NullKeyword,
      ].includes(node.kind)
    )
      return false;
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node)
    )
      return this.mayInitialize(node.expression);
    if (ts.isArrayLiteralExpression(node))
      return node.elements.some(
        (item) => ts.isSpreadElement(item) || this.mayInitialize(item)
      );
    if (ts.isObjectLiteralExpression(node))
      return node.properties.some((property) => {
        if (ts.isSpreadAssignment(property)) return true;
        if (
          property.name &&
          ts.isComputedPropertyName(property.name) &&
          this.mayInitialize(property.name.expression)
        )
          return true;
        return (
          ts.isPropertyAssignment(property) &&
          this.mayInitialize(property.initializer)
        );
      });
    return true;
  }

  private orderedDependencies(
    source: tsTypes.SourceFile
  ): tsTypes.SourceFile[] {
    const { ts } = this.context;
    const order = new Map<tsTypes.SourceFile, number>();
    source.statements.forEach((statement, position) => {
      if (!ts.isImportDeclaration(statement)) return;
      const clause = statement.importClause;
      const bindings = clause?.namedBindings;
      const names: tsTypes.Node[] = [
        statement.moduleSpecifier,
        ...(clause?.name ? [clause.name] : []),
        ...(bindings && ts.isNamedImports(bindings)
          ? bindings.elements.map((item) => item.name)
          : bindings
            ? [bindings.name]
            : []),
      ];
      for (const name of names) {
        const symbol = sourceSymbolAt(this.context, name, source);
        for (const declaration of symbol?.declarations ?? []) {
          const owner = declaration.getSourceFile();
          if (!order.has(owner)) order.set(owner, position);
        }
      }
    });
    return [...(this.dependencies.get(source) ?? [])].sort(
      (a, b) =>
        (order.get(a) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b) ?? Number.MAX_SAFE_INTEGER)
    );
  }

  /** Initialization next to component families is retained only when it can
   * touch selected module values. This excludes unused platform-only clients. */
  private referencesLinkedValue(
    node: tsTypes.Node,
    seen = new Set<tsTypes.Node>()
  ): boolean {
    const { ts } = this.context;
    if (seen.has(node)) return false;
    seen.add(node);
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
      const declaration = sourceSymbolAt(this.context, node)?.valueDeclaration;
      if (declaration && this.names.has(declaration)) return true;
      if (declaration && !seen.has(declaration)) {
        if (
          ts.isFunctionDeclaration(declaration) &&
          declaration.body &&
          this.referencesLinkedValue(declaration.body, seen)
        )
          return true;
        if (
          ts.isVariableDeclaration(declaration) &&
          declaration.initializer &&
          this.referencesLinkedValue(declaration.initializer, seen)
        )
          return true;
      }
    }
    return (
      ts.forEachChild(
        node,
        (child) => this.referencesLinkedValue(child, seen) || undefined
      ) ?? false
    );
  }

  private linkFrom(
    declaration: tsTypes.Declaration,
    source: tsTypes.SourceFile
  ): string | undefined {
    const name = this.link(declaration);
    const dependency = declaration.getSourceFile();
    if (name && dependency !== source) {
      if (!this.entries.has(source)) this.entries.set(source, new Map());
      const dependencies =
        this.dependencies.get(source) ?? new Set<tsTypes.SourceFile>();
      dependencies.add(dependency);
      this.dependencies.set(source, dependencies);
    }
    return name;
  }

  rewrite<T extends tsTypes.Node>(node: T, source: tsTypes.SourceFile): T {
    const { ts } = this.context;
    const result = ts.transform(node, [
      (transformContext) => (root) => {
        const visit = (current: tsTypes.Node): tsTypes.Node => {
          if (ts.isShorthandPropertyAssignment(current)) {
            const request = this.requestReference(current.name, source);
            if (request)
              return ts.factory.createPropertyAssignment(
                current.name.text,
                request
              );
            const original = ts.getOriginalNode(current.name);
            const declaration =
              original.pos >= 0 && original.getSourceFile()
                ? sourceSymbolAt(this.context, original, source)
                    ?.valueDeclaration
                : undefined;
            const linked = declaration && this.linkFrom(declaration, source);
            if (linked)
              return ts.factory.createPropertyAssignment(
                current.name.text,
                ts.factory.createIdentifier(linked)
              );
            return current;
          }
          if (
            ts.isIdentifier(current) ||
            ts.isPropertyAccessExpression(current)
          ) {
            const parent = current.parent;
            const keyOnly =
              ts.isIdentifier(current) &&
              parent &&
              ((ts.isPropertyAccessExpression(parent) &&
                parent.name === current) ||
                (ts.isPropertyAssignment(parent) && parent.name === current) ||
                (ts.isMethodDeclaration(parent) && parent.name === current));
            if (!keyOnly) {
              const request = this.requestReference(current, source);
              if (request) return request;
              const original = ts.getOriginalNode(current);
              const symbol =
                original.pos >= 0 && original.getSourceFile()
                  ? sourceSymbolAt(this.context, original, source)
                  : undefined;
              const declaration = symbol?.valueDeclaration;
              const linked = declaration && this.linkFrom(declaration, source);
              if (linked) return ts.factory.createIdentifier(linked);
            }
          }
          return ts.visitEachChild(current, visit, transformContext);
        };
        return ts.visitNode(root, visit) as T;
      },
    ]);
    const transformed = result.transformed[0] as T;
    result.dispose();
    return transformed;
  }

  private requestReference(
    node: tsTypes.Node,
    source: tsTypes.SourceFile
  ): tsTypes.Expression | undefined {
    const { ts } = this.context;
    const parent = node.parent;
    if (
      parent &&
      ts.isIdentifier(node) &&
      (ts.isParameter(parent) ||
        ts.isVariableDeclaration(parent) ||
        ts.isFunctionDeclaration(parent) ||
        ts.isClassDeclaration(parent) ||
        ts.isBindingElement(parent)) &&
      parent.name === node
    )
      return undefined;
    let local: string | undefined;
    let member: string | undefined;
    if (ts.isIdentifier(node)) local = node.text;
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression)
    ) {
      local = node.expression.text;
      member = node.name.text;
    }
    if (!local) return undefined;
    const original = ts.getOriginalNode(
      ts.isPropertyAccessExpression(node) ? node.expression : node
    );
    if (original.pos < 0 || !original.getSourceFile()) return undefined;
    const symbol = sourceSymbolAt(this.context, original, source);
    if (!symbol) return undefined;
    const sameBinding = (name: tsTypes.Identifier): boolean =>
      name.text === local &&
      sourceSymbolAt(this.context, name, source) === symbol;
    for (const statement of source.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !== 'transone/request'
      )
        continue;
      const clause = statement.importClause;
      const bindings = clause?.namedBindings;
      let exported: string | undefined;
      if (clause?.name && sameBinding(clause.name)) exported = 'default';
      if (bindings && ts.isNamedImports(bindings))
        exported =
          bindings.elements.find((item) => sameBinding(item.name))?.propertyName
            ?.text ??
          (bindings.elements.some((item) => sameBinding(item.name))
            ? local
            : exported);
      if (
        bindings &&
        ts.isNamespaceImport(bindings) &&
        sameBinding(bindings.name)
      )
        exported = member ?? '*';
      if (!exported) continue;
      // Named/default imports can themselves have properties (request.get).
      // Rewrite their receiver, reserving whole-member replacement for namespaces.
      if (
        member &&
        !(
          bindings &&
          ts.isNamespaceImport(bindings) &&
          sameBinding(bindings.name)
        )
      )
        return undefined;
      const runtime = ts.factory.createPropertyAccessExpression(
        ts.factory.createCallExpression(
          ts.factory.createIdentifier('getApp'),
          undefined,
          []
        ),
        '__transoneRequest'
      );
      return exported === '*'
        ? runtime
        : ts.factory.createElementAccessExpression(
            runtime,
            ts.factory.createStringLiteral(exported)
          );
    }
    return undefined;
  }

  private link(declaration: tsTypes.Declaration): string | undefined {
    const { ts } = this.context;
    const source = declaration.getSourceFile();
    if (source.isDeclarationFile) return undefined;
    const topVariable =
      ts.isVariableDeclaration(declaration) &&
      ts.isVariableDeclarationList(declaration.parent) &&
      ts.isVariableStatement(declaration.parent.parent) &&
      ts.isSourceFile(declaration.parent.parent.parent);
    const topFunction =
      ts.isFunctionDeclaration(declaration) &&
      ts.isSourceFile(declaration.parent);
    const topClass =
      ts.isClassDeclaration(declaration) && ts.isSourceFile(declaration.parent);
    if (!topVariable && !topFunction && !topClass) return undefined;
    if (topClass) {
      const ref = this.context.index?.findClass(
        source.fileName,
        declaration.name?.text ?? 'default'
      );
      if (ref && this.context.index!.isComponent(ref)) return undefined;
    }
    const existing = this.names.get(declaration);
    if (existing) return existing;
    const name = `__mp_module_${this.names.size}`;
    this.names.set(declaration, name);
    const entries =
      this.entries.get(source) ?? new Map<tsTypes.Node, tsTypes.Node>();
    this.entries.set(source, entries);
    const transformed = this.rewrite(declaration, source);
    let statement: tsTypes.Node = transformed;
    if (ts.isVariableDeclaration(transformed))
      statement = ts.factory.createVariableStatement(
        undefined,
        ts.factory.createVariableDeclarationList(
          [transformed],
          ts.isVariableDeclarationList(declaration.parent)
            ? declaration.parent.flags
            : ts.NodeFlags.Const
        )
      );
    entries.set(declaration, statement);
    return name;
  }
}
