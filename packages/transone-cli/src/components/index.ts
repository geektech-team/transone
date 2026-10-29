import ts from 'typescript';
import {
  COMPONENT_PLATFORM_DEFINITIONS,
  getPlatformDefinition,
  type ComponentPlatform,
} from 'transone/platform';
import { canonicalPath, createComponentProgram } from './discovery';
import {
  classDeclaration,
  frameworkSourceFiles,
  sourceNode,
  unalias,
} from './resolution';
import type {
  ClassReference,
  ComponentIndex,
  ComponentIndexOptions,
  ComponentMetadata,
  ComponentSelectionDecision,
  OwnedMember,
} from './types';
export type * from './types';

function location(reference: ClassReference): string {
  const point = reference.source.getLineAndCharacterOfPosition(
    reference.declaration.getStart()
  );
  return `${reference.className} (${reference.filePath}:${point.line + 1}:${point.character + 1})`;
}
function hasModifier(node: ts.Node, modifier: ts.SyntaxKind): boolean {
  return !!(
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((item) => item.kind === modifier)
  );
}

/** A fresh checker, selection table and source ownership graph for each build. */
export function createComponentIndex(
  options: ComponentIndexOptions
): ComponentIndex {
  const program = createComponentProgram(options);
  const checker = program.getTypeChecker();
  const sources = new Map(
    program
      .getSourceFiles()
      .map((source) => [canonicalPath(source.fileName), source])
  );
  const frameworkRoots = new Set<ts.Symbol>();
  const decorators = new Map<ts.Symbol, ComponentPlatform>();
  const declarations = new Map<ts.ClassLikeDeclaration, ClassReference>();
  const references: ClassReference[] = [];
  const identities = new Map<string, ClassReference>();
  const parents = new Map<string, ClassReference>();
  const metadata = new Map<string, ComponentMetadata>();
  const component = new Map<string, boolean>();
  const decisions = new Map<string, ComponentSelectionDecision>();
  const frameworkClasses = new Set<string>();

  // Module ownership/resolution establishes identity before looking at export names.
  // Aliases and absolute imports reach the same real declarations as package imports.
  const frameworkSources = new Set(frameworkSourceFiles(program, options.root));
  for (const source of frameworkSources) {
    const moduleSymbol = checker.getSymbolAtLocation(source);
    if (!moduleSymbol) continue;
    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      const symbol = unalias(checker, exported);
      if (!symbol) continue;
      if (exported.name === 'Component' || exported.name === 'BaseComponent')
        frameworkRoots.add(symbol);
      const definition = COMPONENT_PLATFORM_DEFINITIONS.find(
        (item) => item.decorator === exported.name
      );
      if (definition) decorators.set(symbol, definition.platform);
    }
  }

  const symbolAt = (
    node: ts.Node,
    source = node.getSourceFile()
  ): ts.Symbol | undefined => {
    const actual = sources.get(canonicalPath(source.fileName));
    if (!actual) return undefined;
    const owned = sourceNode(node, actual);
    if (!owned) return undefined;
    let symbol =
      ts.isIdentifier(owned) &&
      ts.isShorthandPropertyAssignment(owned.parent) &&
      owned.parent.name === owned
        ? checker.getShorthandAssignmentValueSymbol(owned.parent)
        : checker.getSymbolAtLocation(owned);
    if (
      !symbol &&
      ts.isElementAccessExpression(owned) &&
      (ts.isStringLiteralLike(owned.argumentExpression) ||
        ts.isNumericLiteral(owned.argumentExpression))
    ) {
      symbol = checker.getPropertyOfType(
        checker.getTypeAtLocation(owned.expression),
        owned.argumentExpression.text
      );
    }
    return unalias(checker, symbol);
  };
  const referenceFor = (
    declaration: ts.ClassLikeDeclaration
  ): ClassReference => {
    const previous = declarations.get(declaration);
    if (previous) return previous;
    const source = declaration.getSourceFile();
    const filePath = canonicalPath(source.fileName);
    const id = `${filePath}:${declaration.getStart(source)}`;
    const sameIdentity = identities.get(id);
    if (sameIdentity) {
      declarations.set(declaration, sameIdentity);
      return sameIdentity;
    }
    const variable = ts.isVariableDeclaration(declaration.parent)
      ? declaration.parent
      : undefined;
    const nameNode = declaration.name ?? variable?.name;
    const className = nameNode?.getText(source) ?? 'default';
    const symbol = nameNode
      ? unalias(checker, checker.getSymbolAtLocation(nameNode))
      : undefined;
    const moduleSymbol = checker.getSymbolAtLocation(source);
    const exported = moduleSymbol
      ? checker.getExportsOfModule(moduleSymbol).find((item) => {
          const target = unalias(checker, item);
          return target === symbol || classDeclaration(target) === declaration;
        })
      : undefined;
    const reference: ClassReference = {
      id,
      filePath,
      source,
      declaration,
      className,
      ...(exported ? { exportName: exported.name } : {}),
    };
    declarations.set(declaration, reference);
    identities.set(id, reference);
    references.push(reference);
    if (symbol && frameworkRoots.has(symbol))
      frameworkClasses.add(reference.id);
    return reference;
  };
  const resolveExpression = (
    expression: ts.Expression,
    source: ts.SourceFile
  ): ClassReference | undefined => {
    const declaration = classDeclaration(symbolAt(expression, source));
    return declaration ? referenceFor(declaration) : undefined;
  };

  for (const source of program.getSourceFiles()) {
    if (
      source.isDeclarationFile ||
      /[/\\]node_modules[/\\]/.test(source.fileName)
    )
      continue;
    const visit = (node: ts.Node) => {
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        referenceFor(node);
      } else if (
        (ts.isIdentifier(node) || ts.isElementAccessExpression(node)) &&
        !frameworkSources.has(source)
      ) {
        // Imports and namespace property uses can point directly at installed
        // declarations without a local subclass to pull them into the graph.
        const imported = classDeclaration(symbolAt(node, source));
        if (imported) referenceFor(imported);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  // This loop can append imported ancestors, including declarations from installed packages.
  for (let position = 0; position < references.length; position++) {
    const reference = references[position]!;
    const heritage = reference.declaration.heritageClauses?.find(
      (item) => item.token === ts.SyntaxKind.ExtendsKeyword
    )?.types[0];
    if (heritage) {
      const parent = resolveExpression(heritage.expression, reference.source);
      if (parent) parents.set(reference.id, parent);
    }
    const platforms = new Set<ComponentPlatform>();
    for (const decorator of ts.getDecorators(reference.declaration) ?? []) {
      if (!ts.isCallExpression(decorator.expression)) continue;
      const symbol = symbolAt(
        decorator.expression.expression,
        reference.source
      );
      const platform = symbol && decorators.get(symbol);
      if (platform) platforms.add(platform);
    }
    metadata.set(reference.id, {
      framework: frameworkSources.has(reference.source),
      parent: parents.get(reference.id),
      family: reference,
      platforms: [...platforms],
      abstract: hasModifier(
        reference.declaration,
        ts.SyntaxKind.AbstractKeyword
      ),
    });
  }

  const visiting = new Set<string>();
  const classify = (reference: ClassReference): boolean => {
    const known = component.get(reference.id);
    if (known !== undefined) return known;
    if (visiting.has(reference.id))
      throw new Error(`Component inheritance cycle at ${location(reference)}`);
    visiting.add(reference.id);
    const parent = parents.get(reference.id);
    const result =
      frameworkClasses.has(reference.id) || !!(parent && classify(parent));
    component.set(reference.id, result);
    visiting.delete(reference.id);
    return result;
  };
  references.forEach(classify);

  const familyFor = (reference: ClassReference): ClassReference => {
    const data = metadata.get(reference.id)!;
    if (!data.platforms.length) return reference;
    if (!data.parent || !classify(reference)) {
      throw new Error(
        `Platform implementation ${location(reference)} must extend a resolvable business component`
      );
    }
    // A directly annotated framework subclass is explicit-only, never a mapping for the framework root.
    return frameworkClasses.has(data.parent.id)
      ? reference
      : familyFor(data.parent);
  };
  const candidates = new Map<string, ClassReference[]>();
  for (const reference of references) {
    const data = metadata.get(reference.id)!;
    if (!data.platforms.length) continue;
    if (!reference.declaration.name || !reference.exportName)
      throw new Error(
        `Platform implementation must be named and exported: ${location(reference)}`
      );
    if (data.abstract)
      throw new Error(
        `Platform implementation must be concrete: ${location(reference)}`
      );
    data.family = familyFor(reference);
    const list = candidates.get(data.family.id) ?? [];
    list.push(reference);
    candidates.set(data.family.id, list);
  }
  const decide = (reference: ClassReference): ComponentSelectionDecision => {
    const data = metadata.get(reference.id);
    if (
      !data ||
      !classify(reference) ||
      frameworkClasses.has(reference.id) ||
      data.platforms.length
    )
      return {
        component: reference,
        implementation: reference,
        reason: 'explicit',
        candidates: [],
      };
    const available = candidates.get(reference.id) ?? [];
    const exact = available.filter((candidate) =>
      metadata.get(candidate.id)!.platforms.includes(options.platform)
    );
    const family = getPlatformDefinition(options.platform).family;
    const generic = available.filter((candidate) =>
      metadata.get(candidate.id)!.platforms.includes(family)
    );
    const matches = exact.length ? exact : generic;
    if (matches.length > 1)
      throw new Error(
        `Conflicting implementations for ${reference.className} on ${options.platform}:\n${matches.map(location).join('\n')}`
      );
    return {
      component: reference,
      ...(matches[0]
        ? { implementation: matches[0] }
        : data.abstract
          ? {}
          : { implementation: reference }),
      reason: matches[0]
        ? exact.length
          ? 'exact'
          : 'family'
        : data.abstract
          ? 'missing'
          : 'base',
      candidates: available,
    };
  };
  for (const reference of references)
    decisions.set(reference.id, decide(reference));

  const decision = (reference: ClassReference) =>
    decisions.get(reference.id) ?? decide(reference);

  const hierarchy = (reference: ClassReference): readonly ClassReference[] => {
    const result: ClassReference[] = [];
    let current: ClassReference | undefined =
      declarations.get(reference.declaration) ?? reference;
    while (current && !frameworkClasses.has(current.id)) {
      result.unshift(current);
      current = parents.get(current.id);
    }
    return result;
  };
  return {
    platform: options.platform,
    classes: references.filter(
      (reference) => !frameworkClasses.has(reference.id)
    ),
    sources: [...sources.values()].filter(
      (source) =>
        !source.isDeclarationFile &&
        !/[/\\]node_modules[/\\]/.test(source.fileName)
    ),
    resolve(expression, source) {
      const declaration = classDeclaration(symbolAt(expression, source));
      // Completed indexes are immutable: never append a half-initialized class.
      if (!declaration) return undefined;
      return (
        declarations.get(declaration) ??
        identities.get(
          `${canonicalPath(declaration.getSourceFile().fileName)}:${declaration.getStart()}`
        )
      );
    },
    findClass: (filePath, className) =>
      references.find(
        (reference) =>
          reference.filePath === canonicalPath(filePath) &&
          reference.className === className &&
          !frameworkClasses.has(reference.id)
      ),
    isComponent: (reference) =>
      !frameworkClasses.has(reference.id) &&
      (component.get(reference.id) ?? false),
    select(reference) {
      const result = decision(reference);
      if (!result.implementation)
        throw new Error(
          `Abstract component ${location(reference)} has no implementation for ${options.platform}. Candidates:\n${result.candidates.map(location).join('\n') || '(none)'}`
        );
      return result.implementation;
    },
    decision,
    hierarchy,
    members(reference) {
      const effective = new Map<string, OwnedMember[]>();
      for (const owner of hierarchy(reference)) {
        const own = new Map<string, OwnedMember[]>();
        for (const declaration of owner.declaration.members) {
          const property =
            declaration.name && ts.isComputedPropertyName(declaration.name)
              ? declaration.name.expression
              : declaration.name;
          const name =
            property &&
            (ts.isIdentifier(property) ||
              ts.isStringLiteralLike(property) ||
              ts.isNumericLiteral(property))
              ? property.text
              : (property?.getText(owner.source) ??
                (ts.isConstructorDeclaration(declaration)
                  ? 'constructor'
                  : `@${declaration.pos}`));
          const key = `${hasModifier(declaration, ts.SyntaxKind.StaticKeyword) ? 'static:' : ''}${name}`;
          const group = own.get(key) ?? [];
          group.push({ owner, declaration });
          own.set(key, group);
        }
        for (const [key, group] of own) effective.set(key, group);
      }
      return [...effective.values()].flat();
    },
    bindings: () =>
      references.flatMap((base) => {
        const implementation = decisions.get(base.id)!.implementation;
        return implementation && implementation.id !== base.id
          ? [{ base, implementation }]
          : [];
      }),
    metadata(reference) {
      const data = metadata.get(reference.id);
      if (!data)
        throw new Error(
          `Class is not in this component index: ${location(reference)}`
        );
      return data;
    },
    symbolAt,
  };
}
