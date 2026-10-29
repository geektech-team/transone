import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type tsTypes from 'typescript';
import type { ClassReference } from '../components/types';
import type { ClassSource, CompileContext } from './types';
import { mpError } from './errors';

/** Declaration identities remain owned by the build index. Their executable MP
 * members come from the installed package's existing `source` contract. */
export function runtimeOwner(
  context: CompileContext,
  reference: ClassReference
): ClassSource {
  if (!reference.source.isDeclarationFile) return { ...reference, reference };
  const cache = (context.packageSources ??= new Map());
  const cached = cache.get(reference.id);
  if (cached) return cached;
  let directory = dirname(reference.filePath);
  let entry: string | undefined;
  for (;;) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as {
        source?: unknown;
      };
      if (typeof pkg.source !== 'string' || !pkg.source)
        throw mpError(
          reference.filePath,
          '声明组件所在包缺少 source 字段：小程序需要可编译的 TypeScript 源码'
        );
      const base = resolve(directory, pkg.source);
      entry = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      if (!entry)
        throw mpError(
          reference.filePath,
          `包 source 指向的文件不存在: ${pkg.source}`
        );
      break;
    }
    const parent = dirname(directory);
    if (parent === directory)
      throw mpError(
        reference.filePath,
        '无法定位声明组件的 package.json/source'
      );
    directory = parent;
  }
  const owner = {
    ...loadSourceExport(
      context,
      entry,
      [reference.exportName, reference.className].filter(
        (name): name is string => !!name
      )
    ),
    reference,
  };
  cache.set(reference.id, owner);
  return owner;
}

/** The old package.source path can be absent from the shared index entirely. */
export function loadSourceExport(
  context: CompileContext,
  entry: string,
  names: readonly string[]
): ClassSource {
  const program = sourceProgram(context, entry);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry)!;
  const module = checker.getSymbolAtLocation(source);
  const exports = module ? checker.getExportsOfModule(module) : [];
  const exported = names
    .map((name) => exports.find((symbol) => symbol.name === name))
    .find(Boolean);
  const symbol = exported && unalias(context, checker, exported);
  const declaration =
    symbol?.valueDeclaration ??
    symbol?.declarations?.find(context.ts.isClassDeclaration);
  if (!declaration || !context.ts.isClassDeclaration(declaration))
    throw mpError(entry, `source 中找不到组件类 ${names.join(' / ')}`);
  const owner: ClassSource = {
    filePath: declaration.getSourceFile().fileName,
    source: declaration.getSourceFile(),
    declaration,
    className: declaration.name?.text ?? names[0]!,
  };
  (context.packageComponentSources ??= new Set()).add(owner.source);
  return owner;
}

function sourceProgram(
  context: CompileContext,
  entry: string
): tsTypes.Program {
  const programs = (context.sourcePrograms ??= new Map());
  const cached = programs.get(entry);
  if (cached) return cached;
  const { ts } = context;
  const configPath = ts.findConfigFile(context.root, ts.sys.fileExists);
  const config = configPath && ts.readConfigFile(configPath, ts.sys.readFile);
  const options =
    configPath && config && !config.error
      ? ts.parseJsonConfigFileContent(
          config.config,
          ts.sys,
          dirname(configPath)
        ).options
      : {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
        };
  const program = ts.createProgram([entry], { ...options, noEmit: true });
  program.getTypeChecker();
  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile) continue;
    programs.set(source.fileName, program);
    context.files.set(source.fileName, source);
  }
  programs.set(entry, program);
  return program;
}

/** Actual package source owns its checker, including imported helpers and locals.
 * The shared index still handles all normal application/selection references. */
export function sourceSymbolAt(
  context: CompileContext,
  node: tsTypes.Node,
  source = node.getSourceFile()
): tsTypes.Symbol | undefined {
  const indexed = context.index?.symbolAt(node, source);
  if (indexed) return indexed;
  const program = context.sourcePrograms?.get(source.fileName);
  if (!program) return undefined;
  const { ts } = context;
  const checker = program.getTypeChecker();
  const original = ts.getOriginalNode(node);
  let symbol =
    ts.isIdentifier(original) &&
    ts.isShorthandPropertyAssignment(original.parent)
      ? checker.getShorthandAssignmentValueSymbol(original.parent)
      : checker.getSymbolAtLocation(original);
  if (
    !symbol &&
    ts.isElementAccessExpression(original) &&
    (ts.isStringLiteralLike(original.argumentExpression) ||
      ts.isNumericLiteral(original.argumentExpression))
  ) {
    symbol = checker.getPropertyOfType(
      checker.getTypeAtLocation(original.expression),
      original.argumentExpression.text
    );
  }
  return symbol && unalias(context, checker, symbol);
}
function unalias(
  context: CompileContext,
  checker: tsTypes.TypeChecker,
  symbol: tsTypes.Symbol
): tsTypes.Symbol {
  const seen = new Set<tsTypes.Symbol>();
  while (symbol.flags & context.ts.SymbolFlags.Alias && !seen.has(symbol)) {
    seen.add(symbol);
    symbol = checker.getAliasedSymbol(symbol);
  }
  return symbol;
}
