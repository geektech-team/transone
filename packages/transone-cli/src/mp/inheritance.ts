import { createHash } from 'node:crypto';
import type ts from 'typescript';
import { runtimeOwner, sourceSymbolAt } from './source';
import type { ClassReference } from '../components/types';
import type { ClassSource, CompileContext } from './types';

export function reference(
  context: CompileContext,
  source: ClassSource
): ClassReference | undefined {
  return (
    source.reference ??
    context.index?.findClass(source.filePath, source.className)
  );
}
export function selected(
  context: CompileContext,
  ref: ClassReference
): ClassSource {
  const implementation = context.index!.select(ref);
  return { ...runtimeOwner(context, implementation), logical: ref };
}
export function ownedMethods(
  context: CompileContext,
  source: ClassSource
): Array<{ owner: ClassSource; declaration: ts.MethodDeclaration }> {
  const ref = reference(context, source);
  const effectiveOwners = new Set(
    ref && context.index
      ? context.index
          .members(ref)
          .filter((member) =>
            context.ts.isMethodDeclaration(member.declaration)
          )
          .map((member) => member.owner.id)
      : []
  );
  const owners =
    ref && context.index
      ? context.index
          .hierarchy(ref)
          .filter(
            (owner) =>
              !owner.source.isDeclarationFile || effectiveOwners.has(owner.id)
          )
          .map((owner) => runtimeOwner(context, owner))
      : [source];
  const effective = new Map<
    string,
    { owner: ClassSource; declaration: ts.ClassElement }
  >();
  for (const owner of owners) {
    for (const declaration of owner.declaration.members) {
      if (!declaration.name) continue;
      const isStatic =
        context.ts.canHaveModifiers(declaration) &&
        context.ts
          .getModifiers(declaration)
          ?.some((item) => item.kind === context.ts.SyntaxKind.StaticKeyword);
      const name =
        context.ts.isIdentifier(declaration.name) ||
        context.ts.isStringLiteralLike(declaration.name)
          ? declaration.name.text
          : declaration.name.getText(owner.source);
      effective.set(`${isStatic ? 'static:' : ''}${name}`, {
        owner,
        declaration,
      });
    }
  }
  const members = [...effective.values()];
  return members
    .filter(
      (item): item is typeof item & { declaration: ts.MethodDeclaration } =>
        context.ts.isMethodDeclaration(item.declaration) &&
        !item.declaration.modifiers?.some(
          (m) => m.kind === context.ts.SyntaxKind.StaticKeyword
        )
    )
    .map((item) => ({ owner: item.owner, declaration: item.declaration }));
}
export function ownedMethod(
  context: CompileContext,
  source: ClassSource,
  name: string
) {
  return ownedMethods(context, source).find(
    (item) => item.declaration.name.getText(item.owner.source) === name
  );
}
export function parentSource(
  context: CompileContext,
  source: ClassSource
): ClassSource | undefined {
  const ref = reference(context, source);
  return ref && context.index?.metadata(ref).parent;
}
export function stableTag(
  context: CompileContext,
  source: ClassSource
): string {
  const ref = source.logical ?? reference(context, source);
  const name = ref?.className ?? source.className;
  const normalize = (value: string): string =>
    value
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[^A-Za-z0-9-]/g, '')
      .toLowerCase();
  const tag = normalize(name);
  if (!tag) throw new Error(`无法从类名 "${name}" 生成组件标签名`);
  if (!ref || !context.index) return tag;
  const metadata = context.index.metadata(ref);
  const explicitImplementation = metadata.platforms.length > 0;
  const collides = context.index.classes.some((other) => {
    if (other.id === ref.id || !context.index!.isComponent(other)) return false;
    const otherMetadata = context.index!.metadata(other);
    // Implementation names must never alter a logical business component tag.
    // An explicit implementation gets its own suffix when its display name is
    // already owned by a logical family or another explicit implementation.
    if (!explicitImplementation && otherMetadata.platforms.length > 0)
      return false;
    return normalize(other.className) === tag;
  });
  return collides
    ? `${tag}-${createHash('sha256').update(ref.id.replace(context.root, '')).digest('hex').slice(0, 8)}`
    : tag;
}

/** Static constants retain their declaring module even when imported through aliases. */
export function moduleConstants(
  context: CompileContext,
  source: ClassSource
): Map<string, ts.Expression> {
  const api = context.ts;
  const constants = new Map<string, ts.Expression>();
  const expand = (
    expression: ts.Expression,
    seen = new Set<ts.Declaration>()
  ): ts.Expression => {
    if (!context.index) return expression;
    const result = api.transform(expression, [
      (transformContext) => (root) => {
        const visit = (node: ts.Node): ts.Node => {
          if (api.isShorthandPropertyAssignment(node)) {
            return api.factory.createPropertyAssignment(
              node.name.text,
              visit(node.name) as ts.Expression
            );
          }
          const keyOnly =
            api.isIdentifier(node) &&
            node.parent &&
            ((api.isPropertyAssignment(node.parent) &&
              node.parent.name === node) ||
              (api.isPropertyAccessExpression(node.parent) &&
                node.parent.name === node));
          if (
            !keyOnly &&
            (api.isIdentifier(node) || api.isPropertyAccessExpression(node))
          ) {
            const declaration = sourceSymbolAt(context, node)?.valueDeclaration;
            if (
              declaration &&
              api.isVariableDeclaration(declaration) &&
              declaration.initializer &&
              !seen.has(declaration) &&
              api.isVariableDeclarationList(declaration.parent) &&
              declaration.parent.flags & api.NodeFlags.Const
            ) {
              return expand(
                declaration.initializer,
                new Set([...seen, declaration])
              );
            }
          }
          return api.visitEachChild(node, visit, transformContext);
        };
        return api.visitNode(root, visit) as ts.Expression;
      },
    ]);
    const value = result.transformed[0];
    result.dispose();
    return value;
  };
  for (const statement of source.source.statements) {
    if (
      api.isVariableStatement(statement) &&
      statement.declarationList.flags & api.NodeFlags.Const
    ) {
      for (const declaration of statement.declarationList.declarations) {
        if (api.isIdentifier(declaration.name) && declaration.initializer)
          constants.set(declaration.name.text, expand(declaration.initializer));
      }
    }
    if (context.index && api.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      const bindings = clause?.namedBindings;
      const names = [
        ...(clause?.name ? [clause.name] : []),
        ...(bindings && api.isNamedImports(bindings)
          ? bindings.elements.map((item) => item.name)
          : []),
      ];
      for (const name of names) {
        const declaration = sourceSymbolAt(context, name)?.valueDeclaration;
        if (
          declaration &&
          api.isVariableDeclaration(declaration) &&
          declaration.initializer
        )
          constants.set(name.text, expand(declaration.initializer));
      }
    }
  }
  return constants;
}
