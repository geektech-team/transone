import ts from 'typescript';
import { dirname, join } from 'node:path';
import { canonicalPath } from './discovery';

export function unalias(
  checker: ts.TypeChecker,
  symbol: ts.Symbol | undefined
): ts.Symbol | undefined {
  const seen = new Set<ts.Symbol>();
  while (symbol && symbol.flags & ts.SymbolFlags.Alias && !seen.has(symbol)) {
    seen.add(symbol);
    symbol = checker.getAliasedSymbol(symbol);
  }
  return symbol;
}

/** Map a parser-owned node back into the Program without losing its source scope. */
export function sourceNode(
  node: ts.Node,
  source: ts.SourceFile
): ts.Node | undefined {
  if (node.getSourceFile() === source) return node;
  const start = node.getStart();
  let match: ts.Node | undefined;
  const visit = (current: ts.Node) => {
    if (current.pos > start || current.end < node.end) return;
    if (
      current.kind === node.kind &&
      current.getStart(source) === start &&
      current.end === node.end
    )
      match = current;
    if (!match) ts.forEachChild(current, visit);
  };
  visit(source);
  return match;
}

export function classDeclaration(
  symbol: ts.Symbol | undefined
): ts.ClassLikeDeclaration | undefined {
  for (const declaration of symbol?.declarations ?? []) {
    if (ts.isClassDeclaration(declaration) || ts.isClassExpression(declaration))
      return declaration;
    if (
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer &&
      ts.isClassExpression(declaration.initializer)
    ) {
      return declaration.initializer;
    }
  }
  return undefined;
}

/** Find actual framework modules independently of consumer import spelling. */
export function frameworkSourceFiles(
  program: ts.Program,
  root: string
): readonly ts.SourceFile[] {
  const configuredModules = new Set<string>();
  for (const name of ['transone', 'transone/platform', 'transone/core']) {
    const resolved = ts.resolveModuleName(
      name,
      join(root, '__component_index__.ts'),
      program.getCompilerOptions(),
      ts.sys
    ).resolvedModule;
    if (resolved)
      configuredModules.add(canonicalPath(resolved.resolvedFileName));
  }
  const packages = new Map<string, string | undefined>();
  const packageName = (filePath: string): string | undefined => {
    let current = dirname(filePath);
    const visited: string[] = [];
    let name: string | undefined;
    while (true) {
      if (packages.has(current)) {
        name = packages.get(current);
        break;
      }
      visited.push(current);
      const manifest = ts.sys.readFile(join(current, 'package.json'));
      if (manifest !== undefined) {
        try {
          name = (JSON.parse(manifest) as { name?: string }).name;
        } catch {
          /* Unrelated invalid package metadata does not confer framework identity. */
        }
        break;
      }
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    for (const directory of visited) packages.set(directory, name);
    return name;
  };
  return program.getSourceFiles().filter((source) => {
    const path = canonicalPath(source.fileName);
    return configuredModules.has(path) || packageName(path) === 'transone';
  });
}
