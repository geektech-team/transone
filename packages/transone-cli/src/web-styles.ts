import type { BunPlugin, Loader } from 'bun';
import { dirname, extname } from 'node:path';
import ts from 'typescript';

// Keep aligned with transone/lib/style/units.ts. Importing framework source
// would include files outside the CLI declaration build's rootDir.
const ROOT_RPX_RULE = ':root{--tu-rpx:calc(min(100vw, 750px) / 750);}';
const RPX_PATTERN = /(-?\d+(?:\.\d+)?)rpx/g;
const SOURCE_FILTER = /\.(?:[cm]?js|jsx|tsx?)$/;

export interface WebStylesPlugin extends BunPlugin {
  /** Source file -> fixed component CSS, emitted after document styles by Web. */
  readonly styles: Map<string, string>;
  /** Files requiring a second build without extraction to preserve selector precedence. */
  readonly runtimeFiles: Set<string>;
}

/** Extract complete, pure initStyles methods. Runtime StyleManager stays intact. */
export function createWebStylesPlugin(
  disabledFiles: ReadonlySet<string> = new Set()
): WebStylesPlugin {
  const styles = new Map<string, string>();
  const runtimeFiles = new Set<string>();
  const candidates = new Set<string>();
  const owners = new Map<string, Map<string, string>>();
  let unknownSelector = false;
  let unknownInheritance = false;
  return {
    name: 'transone-web-styles',
    styles,
    runtimeFiles,
    setup(build) {
      styles.clear();
      runtimeFiles.clear();
      candidates.clear();
      owners.clear();
      unknownSelector = false;
      unknownInheritance = false;
      build.onLoad({ filter: SOURCE_FILTER }, async ({ path }) => {
        styles.delete(path);
        const contents = await Bun.file(path).text();
        if (!contents.includes('styleManager') && !contents.includes('extends'))
          return;
        const source = ts.createSourceFile(
          path,
          contents,
          ts.ScriptTarget.Latest,
          true,
          scriptKind(path)
        );
        const extracted = extractStyles(source);
        if (extracted.bodies.length) candidates.add(path);
        for (const { selector, owner } of extracted.selectors) {
          const selectorOwners =
            owners.get(selector) ?? new Map<string, string>();
          selectorOwners.set(`${path}:${owner}`, path);
          owners.set(selector, selectorOwners);
          if (selectorOwners.size > 1)
            for (const file of selectorOwners.values()) runtimeFiles.add(file);
        }
        unknownSelector ||= extracted.unknownSelector;
        unknownInheritance ||= extracted.unknownInheritance;
        if (unknownSelector || unknownInheritance)
          for (const file of candidates) runtimeFiles.add(file);
        if (!extracted.bodies.length || disabledFiles.has(path)) return;
        styles.set(path, extracted.css);
        let transformed = contents;
        for (const body of extracted.bodies.sort(
          (left, right) => right.getStart(source) - left.getStart(source)
        )) {
          transformed =
            transformed.slice(0, body.getStart(source)) +
            '{}' +
            transformed.slice(body.end);
        }
        return {
          contents: transformed,
          loader: sourceLoader(path),
          resolveDir: dirname(path),
        };
      });
    },
  };
}

type Primitive = string | number | boolean | null;
type StaticValue = Primitive | { [key: string]: StaticValue };
interface Binding {
  expression: ts.Expression;
  declaration: ts.VariableDeclaration;
  exported: boolean;
}
interface StyleAnalysis {
  css: string;
  bodies: ts.Block[];
  selectors: { selector: string; owner: string }[];
  unknownSelector: boolean;
  unknownInheritance: boolean;
}
interface StyleEntry {
  selector: string;
  properties: Record<string, string | number>;
  hover?: Record<string, string | number>;
  media?: Record<string, Record<string, string | number>>;
}

function extractStyles(source: ts.SourceFile): StyleAnalysis {
  const bindings = collectBindings(source);
  const unsafeBindings = findUnsafeBindings(source, bindings);
  const classes = topLevelClasses(source);
  const descendants: ts.ClassLikeDeclaration[] = [];
  walk(source, (node) => {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node))
      descendants.push(node);
  });
  const { names: componentNames, roots: componentRoots } = componentBindings(
    source,
    classes,
    unsafeBindings
  );
  const selectorAnalysis = collectSelectors(
    classes,
    componentNames,
    bindings,
    unsafeBindings
  );
  const css: string[] = [];
  const bodies: ts.Block[] = [];
  for (const declaration of classes) {
    if (!extendsComponent(declaration, componentNames)) continue;
    const methods = declaration.members.filter(
      (member): member is ts.MethodDeclaration =>
        ts.isMethodDeclaration(member) && memberName(member) === 'initStyles'
    );
    if (methods.length !== 1) continue;
    const method = methods[0]!;
    if (
      !method.body ||
      method.parameters.length ||
      method.asteriskToken ||
      hasModifier(method, ts.SyntaxKind.StaticKeyword) ||
      hasModifier(method, ts.SyntaxKind.AsyncKeyword) ||
      (ts.canHaveDecorators(method) && ts.getDecorators(method)?.length) ||
      (ts.canHaveDecorators(declaration) &&
        ts.getDecorators(declaration)?.length) ||
      hasManagerAccessOutside(declaration, method) ||
      hasUnsafeAncestor(declaration, classes, componentRoots) ||
      hasUnsafeDescendant(declaration, descendants)
    )
      continue;
    const entries = new Map<string, StyleEntry>();
    let safe = true;
    for (const statement of method.body.statements) {
      if (ts.isEmptyStatement(statement)) continue;
      if (!ts.isExpressionStatement(statement)) {
        safe = false;
        break;
      }
      for (const expression of splitComma(statement.expression)) {
        const entry = readAddStyle(
          expression,
          bindings,
          unsafeBindings,
          declaration
        );
        if (!entry) {
          safe = false;
          break;
        }
        entries.set(entry.name, entry.style);
      }
      if (!safe) break;
    }
    if (!safe || !entries.size) continue;
    const rendered = [...entries.values()].map(renderStyle).join('');
    if (hasRelativeResource(rendered)) continue;
    css.push(rendered);
    bodies.push(method.body);
  }
  return {
    css: bodies.length ? ROOT_RPX_RULE + '\n' + css.join('\n') : '',
    bodies,
    ...selectorAnalysis,
    unknownInheritance: hasUnknownUnsafeAncestor(
      descendants,
      componentRoots,
      bindings
    ),
  };
}

function collectSelectors(
  classes: ts.ClassLikeDeclaration[],
  componentNames: Set<string>,
  bindings: Map<string, Binding>,
  unsafe: Set<string>
): Pick<StyleAnalysis, 'selectors' | 'unknownSelector'> {
  const selectors: StyleAnalysis['selectors'] = [];
  let unknownSelector = false;
  for (const declaration of classes) {
    if (!extendsComponent(declaration, componentNames)) continue;
    const method = declaration.members.find(
      (member): member is ts.MethodDeclaration =>
        ts.isMethodDeclaration(member) && memberName(member) === 'initStyles'
    );
    if (!method?.body) continue;
    let calls = 0;
    // Include later addStyle calls too: they may collide with another manager.
    walk(declaration, (node) => {
      if (!ts.isCallExpression(node) || !isAddStyleCall(node)) return;
      calls++;
      const options = node.arguments[1] && unwrap(node.arguments[1]);
      let selector: StaticValue | undefined;
      let hover = false;
      if (options && ts.isObjectLiteralExpression(options)) {
        const evaluate = (expression: ts.Expression) =>
          staticValue(expression, bindings, unsafe, declaration.name?.text);
        selector = objectMember(options, 'selector', evaluate).value;
        const hoverMember = objectMember(options, 'hover', evaluate);
        hover =
          hoverMember.present &&
          (hoverMember.value === undefined || !!hoverMember.value);
      } else if (options) {
        const value = staticValue(
          options,
          bindings,
          unsafe,
          declaration.name?.text
        );
        if (isRecord(value)) {
          selector = value.selector;
          hover = !!value.hover;
        }
      }
      if (typeof selector !== 'string') {
        unknownSelector = true;
        return;
      }
      // StyleManager concatenates the raw selector with :hover before CSS parses
      // selector lists. Media rules use the unmodified base selector.
      const items = splitSelectorList(selector);
      const hoverItems = hover ? splitSelectorList(selector + ':hover') : [];
      if (!items || !hoverItems) {
        unknownSelector = true;
        return;
      }
      for (const item of [...items, ...hoverItems]) {
        selectors.push({
          selector: item,
          owner: String(declaration.getStart()),
        });
      }
    });
    if (
      !calls &&
      method.body.statements.some(
        (statement) => !ts.isEmptyStatement(statement)
      )
    )
      unknownSelector = true;
  }
  return { selectors, unknownSelector };
}

function objectMember(
  object: ts.ObjectLiteralExpression,
  key: string,
  evaluate: (expression: ts.Expression) => StaticValue | undefined
): { value: StaticValue | undefined; present: boolean } {
  let result: { value: StaticValue | undefined; present: boolean } = {
    value: undefined,
    present: false,
  };
  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) {
      const value = evaluate(property.expression);
      if (!isRecord(value)) result = { value: undefined, present: true };
      else if (Object.prototype.hasOwnProperty.call(value, key))
        result = { value: value[key], present: true };
      continue;
    }
    const name = ts.isComputedPropertyName(property.name)
      ? evaluate(property.name.expression)
      : ts.isIdentifier(property.name) ||
          ts.isStringLiteral(property.name) ||
          ts.isNumericLiteral(property.name)
        ? property.name.text
        : undefined;
    if (name === undefined) {
      result = { value: undefined, present: true };
      continue;
    }
    if (name !== key) continue;
    result = {
      value: ts.isPropertyAssignment(property)
        ? evaluate(property.initializer)
        : ts.isShorthandPropertyAssignment(property)
          ? evaluate(property.name)
          : undefined,
      present: true,
    };
  }
  return result;
}

/** Unknown imported/mixin ancestors may own a manager inspected by this class.
 * Without evaluating inheritance, disable candidates across the loaded graph.
 * Known Component roots and same-file ancestor/constant aliases stay precise.
 */
function hasUnknownUnsafeAncestor(
  classes: ts.ClassLikeDeclaration[],
  roots: Set<string>,
  bindings: Map<string, Binding>
): boolean {
  const reachesUnknown = (
    name: string | undefined,
    seen: Set<string>
  ): boolean => {
    if (!name || seen.has(name)) return true;
    if (roots.has(name)) return false;
    seen.add(name);
    const ancestor = classes.find(
      (declaration) => classBinding(declaration) === name
    );
    if (ancestor) {
      if (
        !ancestor.heritageClauses?.some(
          (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword
        )
      )
        return false;
      return reachesUnknown(baseName(ancestor), seen);
    }
    const initializer = bindings.get(name)?.expression;
    if (initializer) {
      const alias = unwrap(initializer);
      if (ts.isIdentifier(alias)) return reachesUnknown(alias.text, seen);
      if (
        ts.isPropertyAccessExpression(alias) &&
        ts.isIdentifier(alias.expression)
      )
        return reachesUnknown(
          `${alias.expression.text}.${alias.name.text}`,
          seen
        );
    }
    return true;
  };
  return classes.some((declaration) => {
    if (
      !declaration.heritageClauses?.some(
        (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword
      )
    )
      return false;
    let unsafe = declaration.members.some(
      (member) => memberName(member) === 'styleManager'
    );
    walk(declaration, (node) => {
      if (unsafeManagerAccess(node)) unsafe = true;
    });
    return unsafe && reachesUnknown(baseName(declaration), new Set());
  });
}

/** Split ownership lists while preserving commas inside functions, attributes and escapes. */
function splitSelectorList(selector: string): string[] | undefined {
  const items: string[] = [];
  const delimiters: string[] = [];
  let quote: string | undefined;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < selector.length; index++) {
    const character = selector[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    // Comments and rule delimiters need a complete CSS parser; keep them at runtime.
    if (
      (character === '/' && selector[index + 1] === '*') ||
      character === '{' ||
      character === '}'
    )
      return;
    if (character === '(' || character === '[') {
      delimiters.push(character);
    } else if (character === ')' || character === ']') {
      if (delimiters.pop() !== (character === ')' ? '(' : '[')) return;
    } else if (character === ',' && delimiters.length === 0) {
      const item = selector.slice(start, index).trim();
      if (!item) return;
      items.push(item);
      start = index + 1;
    }
  }
  if (quote || escaped || delimiters.length) return;
  const item = selector.slice(start).trim();
  return item ? [...items, item] : undefined;
}

function sourceLoader(path: string): Loader {
  const extension = extname(path);
  return extension === '.tsx'
    ? 'tsx'
    : extension === '.jsx'
      ? 'jsx'
      : extension === '.ts'
        ? 'ts'
        : 'js';
}

function scriptKind(path: string): ts.ScriptKind {
  const loader = sourceLoader(path);
  return loader === 'tsx'
    ? ts.ScriptKind.TSX
    : loader === 'jsx'
      ? ts.ScriptKind.JSX
      : loader === 'ts'
        ? ts.ScriptKind.TS
        : ts.ScriptKind.JS;
}

function memberName(member: ts.ClassElement): string | undefined {
  return member.name &&
    (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))
    ? member.name.text
    : undefined;
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) &&
    !!ts.getModifiers(node)?.some((modifier) => modifier.kind === kind)
  );
}

function topLevelClasses(source: ts.SourceFile): ts.ClassLikeDeclaration[] {
  const classes: ts.ClassLikeDeclaration[] = [];
  for (const statement of source.statements) {
    if (ts.isClassDeclaration(statement)) classes.push(statement);
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (
          declaration.initializer &&
          ts.isClassExpression(declaration.initializer)
        )
          classes.push(declaration.initializer);
      }
    }
  }
  return classes;
}

function classBinding(
  declaration: ts.ClassLikeDeclaration
): string | undefined {
  const parent = declaration.parent;
  return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)
    ? parent.name.text
    : declaration.name?.text;
}

function componentBindings(
  source: ts.SourceFile,
  classes: ts.ClassLikeDeclaration[],
  unsafe: Set<string>
): { names: Set<string>; roots: Set<string> } {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const initializer =
          declaration.initializer && unwrap(declaration.initializer);
        if (!initializer) continue;
        if (isTransoneRequire(initializer)) {
          if (
            ts.isIdentifier(declaration.name) &&
            !unsafe.has(declaration.name.text)
          )
            names.add(`${declaration.name.text}.Component`);
          if (ts.isObjectBindingPattern(declaration.name)) {
            for (const binding of declaration.name.elements) {
              const imported = binding.propertyName ?? binding.name;
              if (
                ts.isIdentifier(imported) &&
                imported.text === 'Component' &&
                ts.isIdentifier(binding.name) &&
                !binding.initializer &&
                !binding.dotDotDotToken &&
                !unsafe.has(binding.name.text)
              )
                names.add(binding.name.text);
            }
          }
        } else if (
          ts.isPropertyAccessExpression(initializer) &&
          initializer.name.text === 'Component' &&
          isTransoneRequire(initializer.expression) &&
          ts.isIdentifier(declaration.name) &&
          !unsafe.has(declaration.name.text)
        )
          names.add(declaration.name.text);
      }
    }
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== 'transone' ||
      statement.importClause?.isTypeOnly
    )
      continue;
    const named = statement.importClause?.namedBindings;
    if (named && ts.isNamedImports(named)) {
      for (const binding of named.elements) {
        if (
          !binding.isTypeOnly &&
          (binding.propertyName?.text ?? binding.name.text) === 'Component'
        )
          names.add(binding.name.text);
      }
    } else if (named && ts.isNamespaceImport(named))
      names.add(`${named.name.text}.Component`);
  }
  // Published UI bundles rename the Component base. Recognize its constructor
  // lifecycle and actual bundled StyleManager, rather than class names alone.
  const managers = new Set(
    classes
      .filter((declaration) => isBundledStyleManager(declaration, source))
      .map(classBinding)
  );
  for (const declaration of classes) {
    if (
      !['mount', 'mountToNode', 'update', 'unmount'].every((name) =>
        declaration.members.some((member) => memberName(member) === name)
      )
    )
      continue;
    const constructor = declaration.members.find(
      (member): member is ts.ConstructorDeclaration =>
        ts.isConstructorDeclaration(member)
    );
    if (!constructor?.body) continue;
    let createsManager = 0;
    let unsafeConstructor = false;
    let initializesState = false;
    let initializesStyles = false;
    walk(constructor.body, (node) => {
      if (unsafeManagerAccess(node)) {
        const assignment = node.parent;
        if (
          thisProperty(node) === 'styleManager' &&
          ts.isBinaryExpression(assignment) &&
          assignment.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          assignment.left === node &&
          ts.isNewExpression(assignment.right) &&
          ts.isIdentifier(assignment.right.expression) &&
          managers.has(assignment.right.expression.text)
        )
          createsManager++;
        else unsafeConstructor = true;
      }
      if (ts.isCallExpression(node)) {
        if (thisProperty(node.expression) === 'initState')
          initializesState = true;
        if (thisProperty(node.expression) === 'initStyles')
          initializesStyles = true;
      }
    });
    const name = classBinding(declaration);
    if (
      createsManager === 1 &&
      !unsafeConstructor &&
      initializesState &&
      initializesStyles &&
      name
    )
      names.add(name);
  }
  const roots = new Set(names);
  let changed = true;
  while (changed) {
    changed = false;
    for (const declaration of classes) {
      const name = classBinding(declaration);
      if (name && !names.has(name) && extendsComponent(declaration, names)) {
        names.add(name);
        changed = true;
      }
    }
  }
  return { names, roots };
}

function isBundledStyleManager(
  declaration: ts.ClassLikeDeclaration,
  source: ts.SourceFile
): boolean {
  const method = (name: string) =>
    declaration.members.find(
      (member): member is ts.MethodDeclaration =>
        ts.isMethodDeclaration(member) && memberName(member) === name
    );
  const mutatesMap = (
    name: string,
    operation: string,
    count: number
  ): boolean => {
    const member = method(name);
    if (!member?.body || member.parameters.length !== count) return false;
    const calls: ts.Expression[] = [];
    for (const statement of member.body.statements) {
      if (!ts.isExpressionStatement(statement)) return false;
      calls.push(...splitComma(statement.expression));
    }
    if (
      calls.length !== 2 ||
      !ts.isCallExpression(calls[0]!) ||
      !ts.isCallExpression(calls[1]!)
    )
      return false;
    const write = calls[0]!;
    const update = calls[1]!;
    return (
      ts.isPropertyAccessExpression(write.expression) &&
      write.expression.name.text === operation &&
      thisProperty(write.expression.expression) === 'styles' &&
      write.arguments.length === count &&
      write.arguments.every(
        (argument, index) =>
          ts.isIdentifier(argument) &&
          ts.isIdentifier(member.parameters[index]!.name) &&
          argument.text === member.parameters[index]!.name.text
      ) &&
      thisProperty(update.expression) === 'updateStyles' &&
      update.arguments.length === 0
    );
  };
  if (
    !mutatesMap('addStyle', 'set', 2) ||
    !mutatesMap('removeStyle', 'delete', 1) ||
    !method('clearStyles') ||
    !method('destroy') ||
    !method('convertToCSS') ||
    !method('updateStyles')
  )
    return false;
  const ensure = method('ensureStyleElement');
  if (!ensure?.body) return false;
  let createsStyleElement = false;
  walk(ensure.body, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'document' &&
      node.expression.name.text === 'createElement' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]!) &&
      node.arguments[0]!.text === 'style'
    )
      createsStyleElement = true;
  });
  if (!createsStyleElement) return false;
  let hasRpxRule = false;
  walk(source, (node) => {
    if (ts.isStringLiteral(node) && node.text === ROOT_RPX_RULE)
      hasRpxRule = true;
  });
  return hasRpxRule;
}

function isTransoneRequire(node: ts.Expression): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'require' &&
    node.arguments.length === 1 &&
    ts.isStringLiteral(node.arguments[0]!) &&
    node.arguments[0]!.text === 'transone'
  );
}

function baseName(declaration: ts.ClassLikeDeclaration): string | undefined {
  const base = declaration.heritageClauses?.find(
    (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword
  )?.types[0]?.expression;
  if (base && ts.isIdentifier(base)) return base.text;
  if (
    base &&
    ts.isPropertyAccessExpression(base) &&
    ts.isIdentifier(base.expression)
  )
    return `${base.expression.text}.${base.name.text}`;
  return undefined;
}

function extendsComponent(
  declaration: ts.ClassLikeDeclaration,
  names: Set<string>
): boolean {
  const name = baseName(declaration);
  return name !== undefined && names.has(name);
}

function thisProperty(expression: ts.Node): string | undefined {
  if (
    ts.isPropertyAccessExpression(expression) &&
    expression.expression.kind === ts.SyntaxKind.ThisKeyword
  )
    return expression.name.text;
  if (
    ts.isElementAccessExpression(expression) &&
    expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
    expression.argumentExpression &&
    ts.isStringLiteral(expression.argumentExpression)
  )
    return expression.argumentExpression.text;
  return undefined;
}

function hasManagerAccessOutside(
  declaration: ts.ClassLikeDeclaration,
  method: ts.MethodDeclaration
): boolean {
  let unsafe = false;
  for (const member of declaration.members) {
    if (member === method) continue;
    if (memberName(member) === 'styleManager') return true;
    walk(member, (node) => {
      if (unsafeManagerAccess(node)) unsafe = true;
    });
  }
  return unsafe;
}

function unsafeManagerAccess(node: ts.Node): boolean {
  if (thisProperty(node) === 'styleManager') return true;
  if (
    ts.isElementAccessExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ThisKeyword
  )
    return true;
  if (node.kind !== ts.SyntaxKind.ThisKeyword) return false;
  const parent = node.parent;
  // Passing/aliasing this lets other code mutate or inspect its StyleManager.
  return (
    !(ts.isPropertyAccessExpression(parent) && parent.expression === node) &&
    !(ts.isElementAccessExpression(parent) && parent.expression === node)
  );
}

function hasUnsafeAncestor(
  declaration: ts.ClassLikeDeclaration,
  classes: ts.ClassLikeDeclaration[],
  roots: Set<string>,
  seen = new Set<string>()
): boolean {
  const name = baseName(declaration);
  if (!name || roots.has(name) || seen.has(name)) return false;
  seen.add(name);
  const ancestor = classes.find(
    (candidate) => classBinding(candidate) === name
  );
  if (!ancestor) return false;
  const initStyles = ancestor.members.find(
    (member): member is ts.MethodDeclaration =>
      ts.isMethodDeclaration(member) && memberName(member) === 'initStyles'
  );
  let unsafe = false;
  for (const member of ancestor.members) {
    if (member === initStyles) continue;
    walk(member, (node) => {
      if (unsafeManagerAccess(node)) unsafe = true;
    });
  }
  return unsafe || hasUnsafeAncestor(ancestor, classes, roots, seen);
}

function hasUnsafeDescendant(
  declaration: ts.ClassLikeDeclaration,
  classes: ts.ClassLikeDeclaration[],
  seen = new Set<string>()
): boolean {
  const name = classBinding(declaration);
  if (!name || seen.has(name)) return false;
  seen.add(name);
  return classes.some((child) => {
    if (baseName(child) !== name) return false;
    let unsafe = false;
    walk(child, (node) => {
      if (unsafeManagerAccess(node)) unsafe = true;
    });
    return unsafe || hasUnsafeDescendant(child, classes, seen);
  });
}

function collectBindings(source: ts.SourceFile): Map<string, Binding> {
  const bindings = new Map<string, Binding>();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        bindings.set(declaration.name.text, {
          expression: declaration.initializer,
          declaration,
          exported: hasModifier(statement, ts.SyntaxKind.ExportKeyword),
        });
      }
    }
  }
  return bindings;
}

function rootIdentifier(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
    return rootIdentifier(node.expression);
  return undefined;
}

function findUnsafeBindings(
  source: ts.SourceFile,
  bindings: Map<string, Binding>
): Set<string> {
  const unsafe = new Set<string>();
  const markWritten = (node: ts.Node): void => {
    const name = rootIdentifier(node);
    if (name) {
      unsafe.add(name);
      return;
    }
    if (ts.isPropertyAssignment(node)) {
      markWritten(node.initializer);
      return;
    }
    ts.forEachChild(node, markWritten);
  };
  walk(source, (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      markWritten(node.left);
    }
    if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      const name = rootIdentifier(node.operand);
      if (name) unsafe.add(name);
    }
    if (ts.isDeleteExpression(node)) {
      const name = rootIdentifier(node.expression);
      if (name) unsafe.add(name);
    }
    if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
      markWritten(node.initializer);
    }
  });
  // Object constants may escape through aliases or unknown functions. Permit
  // their references only inside static module initializers/addStyle calls.
  for (const [name, binding] of bindings) {
    if (!containsObject(binding.expression, bindings, new Set())) continue;
    if (binding.exported) {
      unsafe.add(name);
      continue;
    }
    walk(source, (node) => {
      if (!ts.isIdentifier(node) || node.text !== name || !isReference(node))
        return;
      let parent: ts.Node | undefined = node.parent;
      while (
        parent &&
        !ts.isStatement(parent) &&
        !ts.isVariableDeclaration(parent) &&
        !ts.isCallExpression(parent) &&
        !ts.isExportSpecifier(parent)
      )
        parent = parent.parent;
      if (parent && ts.isCallExpression(parent) && isAddStyleCall(parent))
        return;
      if (
        parent &&
        ts.isVariableDeclaration(parent) &&
        ts.isVariableDeclarationList(parent.parent) &&
        ts.isVariableStatement(parent.parent.parent) &&
        parent.parent.parent.parent === source
      )
        return;
      unsafe.add(name);
    });
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, binding] of bindings) {
      const dependencies = new Set<string>();
      walk(binding.expression, (node) => {
        if (
          ts.isIdentifier(node) &&
          isReference(node) &&
          bindings.has(node.text)
        )
          dependencies.add(node.text);
      });
      for (const dependency of dependencies) {
        if (unsafe.has(dependency) && !unsafe.has(name)) {
          unsafe.add(name);
          changed = true;
        }
        if (
          unsafe.has(name) &&
          containsObject(
            bindings.get(dependency)!.expression,
            bindings,
            new Set()
          ) &&
          !unsafe.has(dependency)
        ) {
          unsafe.add(dependency);
          changed = true;
        }
      }
    }
  }
  return unsafe;
}

function isReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (
    (ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isBindingElement(parent)) &&
    parent.name === node
  )
    return false;
  if (
    (ts.isPropertyAccessExpression(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent)) &&
    parent.name === node
  )
    return false;
  return true;
}

function containsObject(
  expression: ts.Expression,
  bindings: Map<string, Binding>,
  seen: Set<string>
): boolean {
  const node = unwrap(expression);
  if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node))
    return true;
  if (ts.isIdentifier(node) && !seen.has(node.text)) {
    seen.add(node.text);
    const binding = bindings.get(node.text);
    return !!binding && containsObject(binding.expression, bindings, seen);
  }
  return false;
}

function unwrap(expression: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  )
    expression = expression.expression;
  return expression;
}

function splitComma(expression: ts.Expression): ts.Expression[] {
  const node = unwrap(expression);
  return ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.CommaToken
    ? [...splitComma(node.left), ...splitComma(node.right)]
    : [node];
}

function isAddStyleCall(node: ts.CallExpression): boolean {
  const callee = node.expression;
  return (
    !node.questionDotToken &&
    ts.isPropertyAccessExpression(callee) &&
    !callee.questionDotToken &&
    callee.name.text === 'addStyle' &&
    thisProperty(callee.expression) === 'styleManager'
  );
}

function readAddStyle(
  expression: ts.Expression,
  bindings: Map<string, Binding>,
  unsafe: Set<string>,
  declaration: ts.ClassLikeDeclaration
): { name: string; style: StyleEntry } | undefined {
  if (
    !ts.isCallExpression(expression) ||
    !isAddStyleCall(expression) ||
    expression.arguments.length !== 2
  )
    return;
  const evaluate = (node: ts.Expression) =>
    staticValue(node, bindings, unsafe, declaration.name?.text);
  const name = evaluate(expression.arguments[0]!);
  const options = evaluate(expression.arguments[1]!);
  if (
    typeof name !== 'string' ||
    !isRecord(options) ||
    typeof options.selector !== 'string' ||
    !isProperties(options.properties) ||
    Object.keys(options).some(
      (key) => !['selector', 'properties', 'hover', 'media'].includes(key)
    )
  )
    return;
  if (options.hover !== undefined && !isProperties(options.hover)) return;
  if (
    options.media !== undefined &&
    (!isRecord(options.media) ||
      !Object.values(options.media).every(isProperties))
  )
    return;
  return { name, style: options as unknown as StyleEntry };
}

function staticValue(
  expression: ts.Expression,
  bindings: Map<string, Binding>,
  unsafe: Set<string>,
  className?: string,
  seen = new Set<string>()
): StaticValue | undefined {
  const node = unwrap(expression);
  const evaluate = (value: ts.Expression) =>
    staticValue(value, bindings, unsafe, className, seen);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isIdentifier(node)) {
    const binding = bindings.get(node.text);
    if (
      !binding ||
      unsafe.has(node.text) ||
      seen.has(node.text) ||
      node.text === className ||
      identifierIsShadowed(node) ||
      binding.declaration.getStart() >= node.getStart()
    )
      return;
    const next = new Set(seen);
    next.add(node.text);
    return staticValue(binding.expression, bindings, unsafe, className, next);
  }
  if (ts.isTemplateExpression(node)) {
    let value = node.head.text;
    for (const span of node.templateSpans) {
      const item = evaluate(span.expression);
      if (item === undefined || isRecord(item)) return;
      value += String(item) + span.literal.text;
    }
    return value;
  }
  if (ts.isObjectLiteralExpression(node)) {
    const result: Record<string, StaticValue> = Object.create(null);
    for (const property of node.properties) {
      if (ts.isShorthandPropertyAssignment(property)) {
        const value = evaluate(property.name);
        if (value === undefined || property.objectAssignmentInitializer) return;
        result[property.name.text] = value;
        continue;
      }
      if (!ts.isPropertyAssignment(property)) return;
      const name = ts.isComputedPropertyName(property.name)
        ? evaluate(property.name.expression)
        : ts.isIdentifier(property.name) ||
            ts.isStringLiteral(property.name) ||
            ts.isNumericLiteral(property.name)
          ? property.name.text
          : undefined;
      const value = evaluate(property.initializer);
      if (
        (typeof name !== 'string' && typeof name !== 'number') ||
        name === '__proto__' ||
        value === undefined
      )
        return;
      result[String(name)] = value;
    }
    return result;
  }
  if (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node)
  ) {
    const object = evaluate(node.expression);
    const key = ts.isPropertyAccessExpression(node)
      ? node.name.text
      : node.argumentExpression && evaluate(node.argumentExpression);
    if (
      isRecord(object) &&
      (typeof key === 'string' || typeof key === 'number')
    )
      return object[String(key)];
    return;
  }
  if (ts.isPrefixUnaryExpression(node)) {
    const operand = evaluate(node.operand);
    if (operand === undefined || isRecord(operand)) return;
    if (node.operator === ts.SyntaxKind.ExclamationToken) return !operand;
    if (typeof operand !== 'number') return;
    if (node.operator === ts.SyntaxKind.MinusToken) return -operand;
    if (node.operator === ts.SyntaxKind.PlusToken) return operand;
  }
  if (ts.isConditionalExpression(node)) {
    const condition = evaluate(node.condition);
    return condition === undefined || isRecord(condition)
      ? undefined
      : evaluate(condition ? node.whenTrue : node.whenFalse);
  }
  if (ts.isBinaryExpression(node)) {
    const left = evaluate(node.left);
    const right = evaluate(node.right);
    if (
      left === undefined ||
      right === undefined ||
      isRecord(left) ||
      isRecord(right)
    )
      return;
    if (node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      if (typeof left === 'string' || typeof right === 'string')
        return String(left) + String(right);
      if (typeof left === 'number' && typeof right === 'number')
        return left + right;
      return;
    }
    if (typeof left !== 'number' || typeof right !== 'number') return;
    switch (node.operatorToken.kind) {
      case ts.SyntaxKind.MinusToken:
        return left - right;
      case ts.SyntaxKind.AsteriskToken:
        return left * right;
      case ts.SyntaxKind.SlashToken:
        return left / right;
      case ts.SyntaxKind.PercentToken:
        return left % right;
      case ts.SyntaxKind.AsteriskAsteriskToken:
        return left ** right;
    }
  }
  return;
}

function identifierIsShadowed(identifier: ts.Identifier): boolean {
  for (
    let parent: ts.Node | undefined = identifier.parent;
    parent && !ts.isSourceFile(parent);
    parent = parent.parent
  ) {
    if (!ts.isFunctionLike(parent)) continue;
    let shadowed = false;
    walk(parent, (node) => {
      if (
        (ts.isVariableDeclaration(node) ||
          ts.isParameter(node) ||
          ts.isBindingElement(node) ||
          ts.isClassDeclaration(node) ||
          ts.isFunctionDeclaration(node)) &&
        node.name &&
        ts.isIdentifier(node.name) &&
        node.name.text === identifier.text
      )
        shadowed = true;
    });
    if (shadowed) return true;
  }
  return false;
}

function isRecord(
  value: StaticValue | undefined
): value is { [key: string]: StaticValue } {
  return typeof value === 'object' && value !== null;
}

function isProperties(
  value: StaticValue | undefined
): value is Record<string, string | number> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (item) =>
        typeof item === 'string' ||
        (typeof item === 'number' && Number.isFinite(item))
    )
  );
}

function renderProperties(properties: Record<string, string | number>): string {
  return Object.entries(properties)
    .map(
      ([key, value]) =>
        `${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${String(value).replace(RPX_PATTERN, (_match, number: string) => `calc(${number} * var(--tu-rpx))`)};`
    )
    .join('\n');
}

function renderStyle(style: StyleEntry): string {
  let css = `${style.selector} {\n${renderProperties(style.properties)}\n}\n`;
  if (style.hover)
    css += `${style.selector}:hover {\n${renderProperties(style.hover)}\n}\n`;
  for (const [query, properties] of Object.entries(style.media ?? {})) {
    css += `@media ${query} {\n${style.selector} {\n${renderProperties(properties)}\n}\n}\n`;
  }
  return css;
}

function hasRelativeResource(css: string): boolean {
  // Escapes/imports and image functions can hide document-relative string URLs.
  if (
    css.includes('\\') ||
    /@import\b|(?:-webkit-)?image(?:-set)?\s*\(/i.test(css)
  )
    return true;
  for (const match of css.matchAll(
    /url\s*\(\s*(?:(["'])(.*?)\1|([^)]*))\s*\)/gi
  )) {
    const url = (match[2] ?? match[3] ?? '').trim();
    if (!/^(?:\/|[a-z][a-z\d+.-]*:)/i.test(url)) return true;
  }
  return false;
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}
