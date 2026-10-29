import ts from 'typescript';
import { COMPONENT_PLATFORM_DEFINITIONS } from 'transone/platform';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { canonicalPath } from './discovery';
import type { BunPlugin } from 'bun';
import type { ResolvedConfig } from '../types';
import { createComponentIndex, type ClassReference } from './index';

const BOOT = 'transone:platform-bootstrap';
const DEFINITIONS = 'transone:component-definitions:';
const alias = (reference: ClassReference) =>
  `__transone_${createHash('sha256').update(reference.id).digest('hex').slice(0, 16)}`;
const localName = (reference: ClassReference) =>
  reference.className === 'default'
    ? `${alias(reference)}_default`
    : reference.className;
interface Edit {
  start: number;
  end: number;
  text: string;
}
function apply(contents: string, edits: Edit[]): string {
  for (const edit of edits.sort((a, b) => b.start - a.start))
    contents =
      contents.slice(0, edit.start) + edit.text + contents.slice(edit.end);
  return contents;
}

/** Every local identifier introduced by a declaration, including nested/rest bindings. */
function bindingIdentifiers(name: ts.BindingName): ts.Identifier[] {
  return ts.isIdentifier(name)
    ? [name]
    : name.elements.flatMap((element) =>
        ts.isOmittedExpression(element) ? [] : bindingIdentifiers(element.name)
      );
}

function directlyConstructed(node: ts.Node): boolean {
  let expression = node;
  while (
    expression.parent &&
    ((ts.isPropertyAccessExpression(expression.parent) &&
      expression.parent.name === expression) ||
      ts.isParenthesizedExpression(expression.parent) ||
      ts.isAsExpression(expression.parent) ||
      ts.isNonNullExpression(expression.parent))
  )
    expression = expression.parent;
  return (
    ts.isNewExpression(expression.parent) &&
    expression.parent.expression === expression
  );
}

function componentSources(
  config: ResolvedConfig,
  entries: readonly string[]
): string[] {
  return [
    ...new Set([
      ...entries,
      ...ts.sys.readDirectory(
        config.root,
        ['.ts', '.tsx'],
        [
          '**/node_modules/**',
          '**/dist/**',
          '**/*.d.ts',
          ...(config.components?.exclude ?? []),
        ],
        ['src/**/*.ts', 'src/**/*.tsx', ...(config.components?.include ?? [])]
      ),
    ]),
  ];
}

/** One immutable selection shared by the browser and document bundles. No user code executes here. */
export function createWebComponentContext(
  config: ResolvedConfig,
  entry: string
) {
  const files = componentSources(config, [entry]);
  if (
    ![...files].some((path) =>
      /@\s*[\w$]|abstract\s+class|\bfrom\s*['"](?!transone(?:['"/]))/.test(
        ts.sys.readFile(path) ?? ''
      )
    )
  ) {
    return {
      active: false,
      entrypoint: entry,
      plugin: {
        name: 'transone-no-platform-components',
        setup() {},
      } as BunPlugin,
      transform: (_path: string, contents: string, _definitions = false) =>
        contents,
    };
  }
  const index = createComponentIndex({
    root: config.root,
    entrypoints: [entry],
    platform: config.platform,
    include: config.components?.include,
    exclude: config.components?.exclude,
  });
  const rootPath = canonicalPath(config.root);
  // Share the discovery boundary with source pruning. Explicit sibling-source
  // globs are eligible too; unindexed package JavaScript must keep its imports.
  const eligibleSources = new Set(files.map(canonicalPath));
  for (const source of index.sources) {
    const path = canonicalPath(source.fileName);
    if (
      path.startsWith(rootPath + '/') &&
      !source.isDeclarationFile &&
      /\.tsx?$/.test(path) &&
      !/(?:^|[/\\])(?:node_modules|dist)(?:[/\\]|$)/.test(path)
    )
      eligibleSources.add(path);
  }
  const frameworkEntry = Bun.resolveSync('transone', canonicalPath(entry));
  const platformDirectory = canonicalPath(
    dirname(frameworkEntry) + '/platform'
  );
  const platformNames = new Set(
    COMPONENT_PLATFORM_DEFINITIONS.map((definition) => definition.decorator)
  );
  const consumedDecorators = new Set<ts.Decorator>();
  for (const ref of index.classes)
    if (index.metadata(ref).platforms.length) {
      for (const decorator of ts.getDecorators(ref.declaration) ?? []) {
        const expression = ts.isCallExpression(decorator.expression)
          ? decorator.expression.expression
          : undefined;
        const symbol = expression && index.symbolAt(expression, ref.source);
        if (
          symbol &&
          platformNames.has(symbol.name) &&
          symbol.declarations?.some(
            (declaration) =>
              canonicalPath(dirname(declaration.getSourceFile().fileName)) ===
              platformDirectory
          )
        )
          consumedDecorators.add(decorator);
      }
    }
  const allPairs = index.bindings();
  const pairs: { base: ClassReference; implementation: ClassReference }[] = [];
  const decorated = index.classes.filter(
    (ref) => index.metadata(ref).platforms.length
  );
  const removed = new Set(decorated.map((ref) => ref.id));
  const keep = (ref: ClassReference) => {
    for (const ancestor of index.hierarchy(ref)) removed.delete(ancestor.id);
  };
  const classAt = new Map(index.classes.map((ref) => [ref.declaration, ref]));
  const liveSymbols = (
    source: ts.SourceFile,
    dropped: ReadonlySet<ts.Node> = new Set()
  ) => {
    const symbols = new Set<ts.Symbol>();
    const visit = (node: ts.Node) => {
      const owner =
        (ts.isClassDeclaration(node) || ts.isClassExpression(node)) &&
        classAt.get(node);
      if (
        dropped.has(node) ||
        (owner && removed.has(owner.id)) ||
        ts.isImportDeclaration(node) ||
        (ts.isHeritageClause(node) &&
          node.token !== ts.SyntaxKind.ExtendsKeyword) ||
        (ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node)) ||
        (ts.isDecorator(node) && consumedDecorators.has(node))
      )
        return;
      if (ts.isIdentifier(node)) {
        const symbol = index.symbolAt(node, source);
        if (symbol) symbols.add(symbol);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return symbols;
  };
  const reachable = new Set([canonicalPath(entry)]);
  const expandReachable = () => {
    let graphChanged = true;
    while (graphChanged) {
      graphChanged = false;
      for (const source of index.sources)
        if (reachable.has(source.fileName)) {
          const live = liveSymbols(source);
          for (const statement of source.statements) {
            if (
              !(
                ts.isImportDeclaration(statement) ||
                ts.isExportDeclaration(statement)
              ) ||
              !statement.moduleSpecifier
            )
              continue;
            if (ts.isImportDeclaration(statement) && statement.importClause) {
              const clause = statement.importClause;
              if (clause.isTypeOnly) continue;
              const named = clause.namedBindings;
              const names = [
                ...(clause.name ? [clause.name] : []),
                ...(named && ts.isNamedImports(named)
                  ? named.elements
                      .filter((item) => !item.isTypeOnly)
                      .map((item) => item.name)
                  : named
                    ? [named.name]
                    : []),
              ];
              if (
                !names.some((name) => {
                  const symbol = index.symbolAt(name, source);
                  return symbol && live.has(symbol);
                })
              )
                continue;
            }
            if (ts.isExportDeclaration(statement) && statement.isTypeOnly)
              continue;
            if (
              ts.isExportDeclaration(statement) &&
              statement.exportClause &&
              ts.isNamedExports(statement.exportClause) &&
              !statement.exportClause.elements.some((item) => {
                const ref = index.resolve(item.name, source);
                return !ref || !removed.has(ref.id);
              })
            )
              continue;
            const declarations =
              index.symbolAt(statement.moduleSpecifier, source)?.declarations ??
              [];
            for (const declaration of declarations)
              if (
                ts.isSourceFile(declaration) &&
                !reachable.has(declaration.fileName)
              ) {
                reachable.add(declaration.fileName);
                graphChanged = true;
              }
          }
        }
    }
  };
  // An explicitly consumed implementation keeps its original identity, even on another platform.
  let changed = true;
  while (changed) {
    changed = false;
    expandReachable();
    const consume = (ref: ClassReference, dispatch = true) => {
      if (!index.isComponent(ref)) return;
      if (dispatch && index.metadata(ref).abstract) index.select(ref);
      if (removed.has(ref.id)) {
        keep(ref);
        changed = true;
      }
      const pair = dispatch && allPairs.find((pair) => pair.base.id === ref.id);
      if (pair && !pairs.some((item) => item.base.id === ref.id)) {
        pairs.push(pair);
        keep(pair.base);
        keep(pair.implementation);
        reachable.add(pair.implementation.filePath);
        changed = true;
      }
    };
    for (const source of index.sources) {
      if (!reachable.has(source.fileName)) continue;
      const visit = (node: ts.Node) => {
        const owner =
          (ts.isClassDeclaration(node) || ts.isClassExpression(node)) &&
          index.classes.find((ref) => ref.declaration === node);
        if (owner && removed.has(owner.id)) return;
        if (
          ts.isTypeNode(node) ||
          ts.isHeritageClause(node) ||
          ts.isImportDeclaration(node) ||
          ts.isExportDeclaration(node) ||
          (ts.isDecorator(node) && consumedDecorators.has(node))
        )
          return;
        if (
          ts.isIdentifier(node) &&
          !(
            (ts.isClassDeclaration(node.parent) ||
              ts.isClassExpression(node.parent)) &&
            node.parent.name === node
          )
        ) {
          const namespace = index.symbolAt(node, source);
          if (
            namespace?.exports &&
            !(
              ts.isPropertyAccessExpression(node.parent) &&
              node.parent.expression === node
            )
          ) {
            for (const value of namespace.exports.values())
              for (const declaration of value.declarations ?? []) {
                const explicit = index.classes.find(
                  (item) => item.declaration === declaration
                );
                if (explicit) consume(explicit);
              }
          }
          const ref = index.resolve(node, source);
          if (ref) consume(ref, !directlyConstructed(node));
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  const active = decorated.length > 0;
  const exported = new Map<string, ClassReference[]>();
  for (const pair of pairs)
    for (const ref of [pair.base, pair.implementation]) {
      const refs = exported.get(ref.filePath) ?? [];
      if (!refs.some((item) => item.id === ref.id)) refs.push(ref);
      exported.set(ref.filePath, refs);
    }
  const entryPath = canonicalPath(entry);
  const entrySource = index.classes.find(
    (ref) => ref.filePath === entryPath
  )?.source;
  const hoisted = new Set<ts.Statement>();
  const hoistedNames = new Set<string>();
  if (entrySource && exported.has(entryPath)) {
    // Split entry-owned declarations from app initialization. This also breaks the
    // otherwise unavoidable bootstrap -> implementation -> main -> app cycle.
    const statements = new Set(entrySource.statements);
    const include = (statement: ts.Statement) => {
      if (hoisted.has(statement) || ts.isImportDeclaration(statement)) return;
      hoisted.add(statement);
      const visit = (node: ts.Node) => {
        if (ts.isIdentifier(node)) {
          const symbol = index.symbolAt(node, entrySource);
          for (const declaration of symbol?.declarations ?? []) {
            let top: ts.Node = declaration;
            while (top.parent && top.parent !== entrySource) top = top.parent;
            if (statements.has(top as ts.Statement))
              include(top as ts.Statement);
          }
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(statement, visit);
    };
    for (const ref of index.classes.filter(
      (ref) =>
        ref.filePath === entryPath &&
        !removed.has(ref.id) &&
        index.isComponent(ref)
    )) {
      let top: ts.Node = ref.declaration;
      while (top.parent !== entrySource) top = top.parent;
      include(top as ts.Statement);
    }
    for (const statement of entrySource.statements) {
      if (
        ts.isExportDeclaration(statement) &&
        !statement.moduleSpecifier &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause) &&
        statement.exportClause.elements.every((item) => {
          const ref = index.resolve(item.name, entrySource);
          return ref && hoisted.has(ref.declaration as ts.Statement);
        })
      )
        include(statement);
      if (ts.isExportAssignment(statement)) {
        const ref = index.resolve(statement.expression, entrySource);
        if (ref && hoisted.has(ref.declaration as ts.Statement))
          include(statement);
      }
    }
    for (const statement of hoisted) {
      if (ts.isClassDeclaration(statement) && !statement.name) {
        const ref = index.classes.find(
          (item) => item.declaration === statement
        );
        if (ref) hoistedNames.add(localName(ref));
      }
      if (
        (ts.isClassDeclaration(statement) ||
          ts.isFunctionDeclaration(statement) ||
          ts.isEnumDeclaration(statement)) &&
        statement.name
      )
        hoistedNames.add(statement.name.text);
      if (ts.isVariableStatement(statement))
        for (const declaration of statement.declarationList.declarations)
          for (const name of bindingIdentifiers(declaration.name))
            hoistedNames.add(name.text);
    }
  }
  const hoistedExports = new Set<string>();
  for (const statement of hoisted) {
    const modifiers = ts.canHaveModifiers(statement)
      ? ts.getModifiers(statement)
      : undefined;
    if (
      modifiers?.some((item) => item.kind === ts.SyntaxKind.DefaultKeyword) ||
      ts.isExportAssignment(statement)
    )
      hoistedExports.add('default');
    else if (
      modifiers?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword) &&
      (ts.isClassDeclaration(statement) ||
        ts.isFunctionDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    )
      hoistedExports.add(statement.name.text);
    if (
      modifiers?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword) &&
      ts.isVariableStatement(statement)
    )
      for (const declaration of statement.declarationList.declarations)
        for (const name of bindingIdentifiers(declaration.name))
          hoistedExports.add(name.text);
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    )
      for (const item of statement.exportClause.elements)
        hoistedExports.add(item.name.text);
  }
  if (entrySource && hoisted.size) {
    let earlierEffect: ts.Statement | undefined;
    for (const statement of entrySource.statements) {
      if (hoisted.has(statement)) {
        if (earlierEffect && !ts.isFunctionDeclaration(statement))
          throw new Error(
            `Cannot initialize entry-owned platform component after application side effects in ${entryPath}; move component definitions to a separate module`
          );
      } else if (
        !ts.isImportDeclaration(statement) &&
        !ts.isFunctionDeclaration(statement) &&
        !ts.isInterfaceDeclaration(statement) &&
        !ts.isTypeAliasDeclaration(statement) &&
        !ts.isExportDeclaration(statement)
      )
        earlierEffect = statement;
    }
    const dependencySymbols = new Set<ts.Symbol>();
    for (const statement of hoisted) {
      const name =
        ts.isClassDeclaration(statement) ||
        ts.isFunctionDeclaration(statement) ||
        ts.isEnumDeclaration(statement)
          ? statement.name
          : undefined;
      if (name) {
        const symbol = index.symbolAt(name, entrySource);
        if (symbol) dependencySymbols.add(symbol);
      }
      if (ts.isVariableStatement(statement))
        for (const declaration of statement.declarationList.declarations) {
          for (const name of bindingIdentifiers(declaration.name)) {
            const symbol = index.symbolAt(name, entrySource);
            if (symbol) dependencySymbols.add(symbol);
          }
        }
    }
    const visit = (node: ts.Node) => {
      if (hoisted.has(node as ts.Statement)) return;
      const target =
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
          ? node.left
          : (ts.isPrefixUnaryExpression(node) ||
                ts.isPostfixUnaryExpression(node)) &&
              (node.operator === ts.SyntaxKind.PlusPlusToken ||
                node.operator === ts.SyntaxKind.MinusMinusToken)
            ? node.operand
            : undefined;
      if (
        target &&
        ts.isIdentifier(target) &&
        dependencySymbols.has(index.symbolAt(target, entrySource)!)
      )
        throw new Error(
          `Cannot mutate entry-owned component dependency ${target.text} outside its definition module; move component definitions to a separate module`
        );
      ts.forEachChild(node, visit);
    };
    visit(entrySource);
  }
  const definitionPath = (path: string) =>
    path === entryPath && hoisted.size ? DEFINITIONS + path : path;
  function transform(
    path: string,
    contents: string,
    definitions = false
  ): string {
    if (!active) return contents;
    if (!eligibleSources.has(path) && !exported.has(path)) return contents;
    const source =
      index.sources.find((source) => source.fileName === path) ??
      ts.createSourceFile(path, contents, ts.ScriptTarget.Latest, true);
    // Use the checker's original AST so symbol ownership survives pruning.
    const edits: Edit[] = [];
    const dropped: ts.Node[] = [];
    for (const ref of index.classes.filter((ref) => ref.filePath === path)) {
      if (removed.has(ref.id)) {
        let node: ts.Node = ref.declaration;
        if (ts.isClassExpression(node) && ts.isVariableDeclaration(node.parent))
          node = node.parent.parent.parent;
        edits.push({ start: node.getStart(source), end: node.end, text: '' });
        dropped.push(node);
        continue;
      }
      for (const decorator of ts.getDecorators(ref.declaration) ?? [])
        if (consumedDecorators.has(decorator)) {
          edits.push({
            start: decorator.getStart(source),
            end: decorator.end,
            text: '',
          });
          dropped.push(decorator);
        }
    }
    if (path === entryPath && hoisted.size) {
      for (const statement of source.statements) {
        if (ts.isImportDeclaration(statement)) continue;
        const remove = definitions
          ? !hoisted.has(statement)
          : hoisted.has(statement);
        if (remove && !dropped.some((node) => node === statement)) {
          // Supersede decorator/class edits inside removed statements.
          for (let i = edits.length - 1; i >= 0; i--)
            if (
              edits[i]!.start >= statement.getStart(source) &&
              edits[i]!.end <= statement.end
            )
              edits.splice(i, 1);
          edits.push({
            start: statement.getStart(source),
            end: statement.end,
            text: '',
          });
          dropped.push(statement);
        }
      }
    }
    for (const statement of source.statements)
      if (
        ts.isExportDeclaration(statement) &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause) &&
        !dropped.includes(statement)
      ) {
        const elements = statement.exportClause.elements.filter((item) => {
          const ref = index.resolve(item.name, source);
          if (ref && removed.has(ref.id)) {
            dropped.push(item);
            return false;
          }
          return true;
        });
        const entryExports =
          hoisted.size &&
          statement.moduleSpecifier &&
          elements.length &&
          elements.every(
            (item) => index.resolve(item.name, source)?.filePath === entryPath
          );
        if (
          entryExports ||
          elements.length !== statement.exportClause.elements.length
        )
          edits.push({
            start: statement.getStart(source),
            end: statement.end,
            text: elements.length
              ? `export {${elements.map((item) => item.getText(source)).join(',')}}${statement.moduleSpecifier ? ` from ${entryExports ? JSON.stringify(DEFINITIONS + entryPath) : statement.moduleSpecifier.getText(source)}` : ''};`
              : '',
          });
      }
    const used = liveSymbols(source, new Set(dropped));
    for (const statement of source.statements)
      if (ts.isImportDeclaration(statement) && statement.importClause) {
        const clause = statement.importClause;
        const named = clause.namedBindings;
        const alive = (node: ts.Node) => {
          const symbol = index.symbolAt(node, source);
          return !!symbol && used.has(symbol);
        };
        const defaultName =
          clause.name && alive(clause.name) ? clause.name.text : undefined;
        const namedText =
          named && ts.isNamedImports(named)
            ? named.elements
                .filter((item) => !item.isTypeOnly && alive(item.name))
                .map((item) => item.getText(source))
            : [];
        const namespace =
          named && ts.isNamespaceImport(named) && alive(named.name)
            ? named.getText(source)
            : undefined;
        const parts = [
          defaultName,
          namespace ??
            (namedText.length ? `{${namedText.join(',')}}` : undefined),
        ].filter(Boolean);
        // Retain imports that were already unused; remove only bindings used solely by removed code.
        const originalNames = [
          ...(clause.name ? [clause.name] : []),
          ...(named && ts.isNamedImports(named)
            ? named.elements.map((item) => item.name)
            : named
              ? [named.name]
              : []),
        ];
        const originallyUsed = originalNames.some((name) => {
          const symbol = index.symbolAt(name, source);
          let found = false;
          const scan = (node: ts.Node) => {
            if (ts.isImportDeclaration(node)) return;
            if (
              ts.isIdentifier(node) &&
              node !== name &&
              index.symbolAt(node, source) === symbol
            )
              found = true;
            ts.forEachChild(node, scan);
          };
          scan(source);
          return found;
        });
        if (!parts.length && originallyUsed)
          edits.push({
            start: statement.getStart(source),
            end: statement.end,
            text: '',
          });
        else if (parts.length) {
          let module = statement.moduleSpecifier.getText(source);
          // Implementations importing an entry-owned base must see definitions without evaluating the app.
          if (ts.isStringLiteral(statement.moduleSpecifier) && hoisted.size) {
            const values = [
              ...(clause.name ? [clause.name] : []),
              ...(named && ts.isNamedImports(named)
                ? named.elements.map((item) => item.name)
                : []),
            ];
            const refs = values.map((item) => index.resolve(item, source));
            if (refs.length && refs.every((ref) => ref?.filePath === entryPath))
              module = JSON.stringify(DEFINITIONS + entryPath);
            if (named && ts.isNamespaceImport(named)) {
              const namespaceSymbol = index.symbolAt(named.name, source);
              const moduleSource = namespaceSymbol?.declarations?.find(
                ts.isSourceFile
              );
              if (moduleSource?.fileName === entryPath) {
                let onlyDefinitions = true;
                const scan = (node: ts.Node) => {
                  if (dropped.includes(node) || ts.isImportDeclaration(node))
                    return;
                  if (
                    ts.isIdentifier(node) &&
                    index.symbolAt(node, source) === namespaceSymbol
                  ) {
                    if (
                      !ts.isPropertyAccessExpression(node.parent) ||
                      node.parent.expression !== node ||
                      !hoistedExports.has(node.parent.name.text)
                    )
                      onlyDefinitions = false;
                  }
                  ts.forEachChild(node, scan);
                };
                scan(source);
                if (!onlyDefinitions)
                  throw new Error(
                    `Platform implementation namespace import from ${entryPath} also consumes app initialization; move component definitions to a separate module`
                  );
                module = JSON.stringify(DEFINITIONS + entryPath);
              }
            }
          }
          edits.push({
            start: statement.getStart(source),
            end: statement.end,
            text: `import ${parts.join(',')} from ${module};`,
          });
        }
      }
    for (const ref of exported.get(path) ?? [])
      if (
        ref.className === 'default' &&
        (path !== entryPath || definitions || !hoisted.size)
      ) {
        const keyword = ref.declaration
          .getChildren(source)
          .find((node) => node.kind === ts.SyntaxKind.ClassKeyword);
        if (!keyword)
          throw new Error(`Cannot name anonymous component in ${path}`);
        edits.push({
          start: keyword.end,
          end: keyword.end,
          text: ' ' + localName(ref),
        });
      }
    let result = apply(contents, edits);
    if (path === entryPath && hoisted.size && !definitions) {
      result =
        `import {${[...hoistedNames].join(',')}} from ${JSON.stringify(DEFINITIONS + entryPath)};\n` +
        result;
      for (const statement of hoisted) {
        if (ts.isClassDeclaration(statement) && !statement.name) {
          const ref = index.classes.find(
            (item) => item.declaration === statement
          );
          if (ref) result += `\nexport {${localName(ref)} as default};`;
        }
        if (
          ts.isExportDeclaration(statement) ||
          ts.isExportAssignment(statement)
        )
          result += '\n' + statement.getText(source);
        if (
          ts.canHaveModifiers(statement) &&
          ts
            .getModifiers(statement)
            ?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        ) {
          if (
            (ts.isClassDeclaration(statement) ||
              ts.isFunctionDeclaration(statement) ||
              ts.isEnumDeclaration(statement)) &&
            statement.name
          )
            result += `\nexport {${statement.name.text}${ts.getModifiers(statement)?.some((item) => item.kind === ts.SyntaxKind.DefaultKeyword) ? ' as default' : ''}};`;
          if (ts.isVariableStatement(statement))
            for (const declaration of statement.declarationList.declarations)
              for (const name of bindingIdentifiers(declaration.name))
                result += `\nexport {${name.text}};`;
        }
      }
    }
    if (definitions) {
      const alreadyExported = new Set<string>();
      for (const statement of hoisted)
        if (
          ts.canHaveModifiers(statement) &&
          ts
            .getModifiers(statement)
            ?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword)
        ) {
          if (
            (ts.isClassDeclaration(statement) ||
              ts.isFunctionDeclaration(statement) ||
              ts.isEnumDeclaration(statement)) &&
            statement.name &&
            !ts
              .getModifiers(statement)
              ?.some((item) => item.kind === ts.SyntaxKind.DefaultKeyword)
          )
            alreadyExported.add(statement.name.text);
          if (ts.isVariableStatement(statement))
            for (const declaration of statement.declarationList.declarations)
              for (const name of bindingIdentifiers(declaration.name))
                alreadyExported.add(name.text);
        }
      const names = [...hoistedNames].filter(
        (name) => !alreadyExported.has(name)
      );
      if (names.length) result += `\nexport {${names.join(',')}};`;
    }
    if (path !== entryPath || definitions || !hoisted.size)
      for (const ref of exported.get(path) ?? []) {
        result += `\nexport {${localName(ref)} as ${alias(ref)}};`;
      }
    return result;
  }
  const imports = pairs.flatMap((pair) => [pair.base, pair.implementation]);
  const unique = [...new Map(imports.map((ref) => [ref.id, ref])).values()];
  const bootstrap = [
    `import {bindComponentImplementations} from ${JSON.stringify(frameworkEntry)};`,
    ...unique.map(
      (ref) =>
        `import {${alias(ref)}} from ${JSON.stringify(definitionPath(ref.filePath))};`
    ),
    `bindComponentImplementations([${pairs.map((pair) => `[${alias(pair.base)},${alias(pair.implementation)}]`).join(',')}]);`,
    `const entry = await import(${JSON.stringify(entryPath)}); export const app = entry.app;`,
  ].join('\n');
  const plugin: BunPlugin = {
    name: 'transone-platform-bootstrap',
    setup(build) {
      build.onResolve({ filter: /^transone:platform-bootstrap$/ }, () => ({
        path: BOOT,
        namespace: 'transone-platform',
      }));
      build.onLoad({ filter: /.*/, namespace: 'transone-platform' }, () => ({
        contents: bootstrap,
        loader: 'ts',
        resolveDir: dirname(entryPath),
      }));
      build.onResolve(
        { filter: /^transone:component-definitions:/ },
        ({ path }) => ({
          // Bun keys loaded modules by path even across namespaces. Keep this
          // distinct from the original entry module or its app executes early.
          path: path.slice(DEFINITIONS.length) + '?transone-definitions',
          namespace: 'transone-definitions',
        })
      );
    },
  };
  return {
    active,
    entrypoint: active ? BOOT : entry,
    plugin,
    transform: (path: string, contents: string, definitions = false) =>
      transform(canonicalPath(path), contents, definitions),
  };
}
export type WebComponentContext = ReturnType<typeof createWebComponentContext>;
