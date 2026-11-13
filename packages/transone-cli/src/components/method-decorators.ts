import ts from 'typescript';
import { dirname, join } from 'node:path';
import type { ComponentIndex } from './types';
import { analyzeInstanceFields } from './instance-fields';

export interface MethodDecoratorSpec {
  bind: boolean;
  emit?: { eventName: string };
  watchProps?: { key: string; immediate: boolean };
  schedule?: {
    kind: 'delay' | 'debounce';
    milliseconds: number;
    replace: boolean;
  };
}
type Kind = 'Bind' | 'Delay' | 'Debounce' | 'Emit' | 'WatchProps';
const KINDS = new Set<string>([
  'Bind',
  'Delay',
  'Debounce',
  'Emit',
  'WatchProps',
]);
const HOOKS = new Set([
  'initState',
  'initStyles',
  'render',
  'beforeMount',
  'onMounted',
  'beforeUpdate',
  'onUpdated',
  'onPropsChange',
  'beforeUnmount',
  'onUnmounted',
  'onErrorCaptured',
  'mount',
  'mountToNode',
  'unmount',
  'onLoad',
  'onReady',
  'onUnload',
  'onShow',
  'onHide',
  'onPullDownRefresh',
  'onReachBottom',
  'onShareAppMessage',
  'onPageScroll',
  'onResize',
  'created',
  'attached',
  'detached',
  'onInit',
  'didMount',
  'didUnmount',
  'didUpdate',
]);
const standaloneCheckers = new WeakMap<ts.SourceFile, ts.TypeChecker>();
function fail(node: ts.Node, message: string): never {
  const source = node.getSourceFile();
  const point = source.getLineAndCharacterOfPosition(node.getStart(source));
  throw new Error(
    `[transone decorators] ${source.fileName}:${point.line + 1}:${point.character + 1} ${message}`
  );
}
function unwrap(node: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node)
  )
    node = node.expression;
  return node;
}
function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return !!(
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((m) => m.kind === kind)
  );
}
/** A single-source checker supplies lexical binding identity without loading or executing imports. */
function standaloneChecker(source: ts.SourceFile): ts.TypeChecker {
  let checker = standaloneCheckers.get(source);
  if (!checker) {
    const options: ts.CompilerOptions = {
      noResolve: true,
      noLib: true,
      target: ts.ScriptTarget.ESNext,
    };
    const host = ts.createCompilerHost(options);
    host.getSourceFile = (file) =>
      file === source.fileName ? source : undefined;
    host.fileExists = (file) => file === source.fileName;
    host.readFile = (file) =>
      file === source.fileName ? source.text : undefined;
    checker = ts
      .createProgram([source.fileName], options, host)
      .getTypeChecker();
    standaloneCheckers.set(source, checker);
  }
  return checker;
}
function declarationAt(
  index: ComponentIndex | undefined,
  source: ts.SourceFile,
  node: ts.Node
): ts.Symbol | undefined {
  return index
    ? index.symbolAt(node, source)
    : ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent)
      ? standaloneChecker(source).getShorthandAssignmentValueSymbol(node.parent)
      : standaloneChecker(source).getSymbolAtLocation(node);
}
function frameworkDeclaration(symbol: ts.Symbol): boolean {
  return !!symbol.declarations?.some((declaration) => {
    // The unaliased symbol must itself be an exported declaration owned by the real package.
    const exported =
      ts.isVariableDeclaration(declaration) &&
      ts.isVariableDeclarationList(declaration.parent)
        ? declaration.parent.parent
        : declaration;
    if (!hasModifier(exported, ts.SyntaxKind.ExportKeyword)) return false;
    let directory = dirname(declaration.getSourceFile().fileName);
    while (true) {
      const manifest = ts.sys.readFile(join(directory, 'package.json'));
      if (manifest !== undefined) {
        try {
          return (
            (JSON.parse(manifest) as { name?: string }).name === 'transone'
          );
        } catch {
          return false;
        }
      }
      const parent = dirname(directory);
      if (parent === directory) return false;
      directory = parent;
    }
  });
}
function directImportKind(
  source: ts.SourceFile,
  expression: ts.Expression
): Kind | undefined {
  const checker = standaloneChecker(source);
  let name: string | undefined;
  let declaration: ts.Declaration | undefined;
  if (ts.isIdentifier(expression)) {
    const symbol = checker.getSymbolAtLocation(expression);
    declaration = symbol?.declarations?.find(ts.isImportSpecifier);
    if (declaration && ts.isImportSpecifier(declaration))
      name = (declaration.propertyName ?? declaration.name).text;
  } else if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression)
  ) {
    const symbol = checker.getSymbolAtLocation(expression.expression);
    declaration = symbol?.declarations?.find(ts.isNamespaceImport);
    name = expression.name.text;
  }
  if (!declaration || !name || !KINDS.has(name)) return undefined;
  let imported: ts.Node = declaration;
  while (!ts.isImportDeclaration(imported) && imported.parent)
    imported = imported.parent;
  return ts.isImportDeclaration(imported) &&
    ts.isStringLiteral(imported.moduleSpecifier) &&
    imported.moduleSpecifier.text === 'transone'
    ? (name as Kind)
    : undefined;
}
function kindAt(
  index: ComponentIndex | undefined,
  source: ts.SourceFile,
  expression: ts.Expression
): Kind | undefined {
  expression = unwrap(expression);
  if (!index) return directImportKind(source, expression);
  const symbol = index.symbolAt(expression, source);
  return symbol && KINDS.has(symbol.name) && frameworkDeclaration(symbol)
    ? (symbol.name as Kind)
    : undefined;
}
/** Reject unsupported decorated fields/accessors before backends erase their syntax. */
export function validateMethodDecoratorTargets(
  _index: ComponentIndex | undefined,
  _source: ts.SourceFile,
  declaration: ts.ClassLikeDeclaration
): void {
  for (const member of declaration.members) {
    const decorators = ts.canHaveDecorators(member)
      ? ts.getDecorators(member)
      : undefined;
    if (decorators?.length && !ts.isMethodDeclaration(member))
      fail(decorators[0], '装饰器只支持普通实例方法，不支持字段或访问器');
  }
}
function validateNoOverloads(method: ts.MethodDeclaration, kind: string): void {
  const staticName = (name: ts.PropertyName): string | undefined => {
    const computed = ts.isComputedPropertyName(name);
    const key = computed ? unwrap(name.expression) : name;
    return (!computed && ts.isIdentifier(key)) ||
      ts.isStringLiteralLike(key) ||
      ts.isNumericLiteral(key)
      ? key.text
      : undefined;
  };
  const key = staticName(method.name);
  if (
    ts.isClassLike(method.parent) &&
    method.parent.members.some(
      (member) =>
        ts.isMethodDeclaration(member) &&
        member !== method &&
        !member.body &&
        hasModifier(member, ts.SyntaxKind.StaticKeyword) ===
          hasModifier(method, ts.SyntaxKind.StaticKeyword) &&
        key !== undefined &&
        staticName(member.name) === key
    )
  )
    fail(method, `${kind} 不支持重载方法 overload`);
}
function validateSynchronous(method: ts.MethodDeclaration, kind: string): void {
  if (hasModifier(method, ts.SyntaxKind.AsyncKeyword) || method.asteriskToken)
    fail(method, `${kind} 不支持 async 异步或 generator 方法`);
}
function validateVoidReturn(method: ts.MethodDeclaration, kind: string): void {
  validateNoOverloads(method, kind);
  validateSynchronous(method, kind);
  if (method.type && method.type.kind !== ts.SyntaxKind.VoidKeyword)
    fail(method.type, `${kind} 方法必须返回 void`);
  const visit = (node: ts.Node): void => {
    if (node !== method && (ts.isFunctionLike(node) || ts.isClassLike(node)))
      return;
    if (
      ts.isReturnStatement(node) &&
      node.expression &&
      !ts.isVoidExpression(unwrap(node.expression))
    )
      fail(node, `${kind} 方法只支持 void 返回，不能返回结果`);
    ts.forEachChild(node, visit);
  };
  if (method.body) visit(method.body);
}
function validateEmitReturn(method: ts.MethodDeclaration): void {
  validateNoOverloads(method, 'Emit');
  validateSynchronous(method, 'Emit');
  // A type's spelling does not identify a thenable: Promise/PromiseLike may
  // name local payload types. The public decorator type checks the actual
  // return type, and the runtime rejects returned thenables before emitting.
}
function readBooleanOption(
  evaluate: (expression: ts.Expression) => unknown,
  expression: ts.Expression,
  kind: string,
  key: string
): boolean {
  const options = unwrap(expression);
  if (ts.isObjectLiteralExpression(options)) {
    const keys = new Set<string>();
    for (const property of options.properties) {
      if (
        (!ts.isPropertyAssignment(property) &&
          !ts.isShorthandPropertyAssignment(property)) ||
        (!ts.isIdentifier(property.name) &&
          !ts.isStringLiteralLike(property.name))
      )
        fail(property, `${kind} options 只支持静态 ${key} 布尔属性`);
      if (keys.has(property.name.text))
        fail(property, `${kind} options 存在重复属性`);
      keys.add(property.name.text);
    }
  }
  const value = evaluate(options);
  if (value === undefined) return false;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((name) => name !== key)
  )
    fail(options, `${kind} options 只支持 ${key} 属性`);
  const option = Object.prototype.hasOwnProperty.call(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined;
  if (option === undefined) return false;
  if (typeof option !== 'boolean')
    fail(options, `${kind} options.${key} 必须为 boolean 布尔值`);
  return option;
}
/** Read framework decorators by symbol identity; no decorator expressions are executed. */
export function readMethodDecorators(
  index: ComponentIndex | undefined,
  source: ts.SourceFile,
  method: ts.MethodDeclaration
): MethodDecoratorSpec | undefined {
  const decorators = ts.getDecorators(method) ?? [];
  if (!decorators.length) return undefined;
  if (hasModifier(method, ts.SyntaxKind.StaticKeyword))
    fail(method, '方法装饰器不支持 static 静态方法');
  if (ts.isPrivateIdentifier(method.name))
    fail(method.name, '方法装饰器不支持 #private 私有方法');
  if (
    !ts.isIdentifier(method.name) &&
    !ts.isStringLiteralLike(method.name) &&
    !ts.isNumericLiteral(method.name)
  )
    fail(method.name, '方法装饰器只支持静态方法名');
  if (HOOKS.has(method.name.text))
    fail(method, `方法装饰器不支持生命周期或初始化方法 ${method.name.text}`);
  if (!method.body) fail(method, '方法装饰器需要方法实现');
  const spec: MethodDecoratorSpec = { bind: false };
  const evaluator = analyzeInstanceFields([], {
    resolve(node) {
      const symbol = declarationAt(index, node.getSourceFile(), node);
      const declaration = symbol?.valueDeclaration;
      return declaration && ts.isVariableDeclaration(declaration)
        ? declaration
        : undefined;
    },
    sources: index?.sources ?? [source],
    fail(node, message) {
      return fail(node, `方法装饰器参数必须为纯静态值: ${message}`);
    },
  });
  for (const decorator of decorators) {
    const expression = unwrap(decorator.expression);
    const kind = kindAt(
      index,
      source,
      ts.isCallExpression(expression) ? expression.expression : expression
    );
    if (!kind)
      fail(decorator, `未知或不支持的方法装饰器 ${decorator.getText(source)}`);
    if (!ts.isCallExpression(expression))
      fail(decorator, `${kind} 必须使用工厂调用 ${kind}()`);
    const args = expression.arguments;
    if (expression.typeArguments?.length || args.some(ts.isSpreadElement))
      fail(decorator, `${kind} 不支持类型或展开参数`);
    if (kind === 'Bind') {
      if (args.length) fail(decorator, 'Bind 不接受参数');
      if (spec.bind) fail(decorator, '重复的 Bind 方法装饰器');
      spec.bind = true;
      continue;
    }
    if (kind === 'Emit' || kind === 'WatchProps') {
      if (kind === 'Emit' && spec.emit)
        fail(decorator, '重复的 Emit 方法装饰器');
      if (kind === 'WatchProps' && spec.watchProps)
        fail(decorator, '重复的 WatchProps 方法装饰器');
      if (spec.schedule || spec.emit || spec.watchProps)
        fail(decorator, 'Emit、WatchProps 和调度装饰器不能组合');
      if (args.length < 1 || args.length > (kind === 'Emit' ? 1 : 2))
        fail(decorator, `${kind} 参数数量不正确`);
      const key = evaluator.evaluate(args[0]);
      if (typeof key !== 'string' || !key.trim())
        fail(args[0], `${kind} 名称必须为非空的字符串`);
      if (kind === 'Emit') spec.emit = { eventName: key };
      else {
        spec.watchProps = {
          key,
          immediate: args[1]
            ? readBooleanOption(
                (expression) => evaluator.evaluate(expression),
                args[1],
                'WatchProps',
                'immediate'
              )
            : false,
        };
      }
      continue;
    }
    if (spec.emit || spec.watchProps)
      fail(decorator, 'Emit、WatchProps 和调度装饰器不能组合');
    if (spec.schedule) fail(decorator, '重复的调度方法装饰器');
    if (args.length < 1 || args.length > (kind === 'Delay' ? 2 : 1))
      fail(decorator, `${kind} 参数数量不正确`);
    const milliseconds = evaluator.evaluate(args[0]);
    if (
      typeof milliseconds !== 'number' ||
      !Number.isFinite(milliseconds) ||
      milliseconds < 0
    )
      fail(args[0], `${kind} milliseconds 必须是有限非负数字`);
    let replace = kind === 'Debounce';
    if (args[1]) {
      const options = unwrap(args[1]);
      if (ts.isObjectLiteralExpression(options)) {
        const keys = new Set<string>();
        for (const property of options.properties) {
          if (
            (!ts.isPropertyAssignment(property) &&
              !ts.isShorthandPropertyAssignment(property)) ||
            (!ts.isIdentifier(property.name) &&
              !ts.isStringLiteralLike(property.name))
          )
            fail(property, 'Delay options 只支持静态 replace 布尔属性');
          if (keys.has(property.name.text))
            fail(property, 'Delay options 存在重复属性');
          keys.add(property.name.text);
        }
      }
      const value = evaluator.evaluate(options);
      if (value !== undefined) {
        if (
          !value ||
          typeof value !== 'object' ||
          Array.isArray(value) ||
          Object.keys(value).some((key) => key !== 'replace')
        )
          fail(options, 'Delay options 只支持 replace 属性');
        if (
          Object.prototype.hasOwnProperty.call(value, 'replace') &&
          value.replace !== undefined
        ) {
          if (typeof value.replace !== 'boolean')
            fail(options, 'Delay options.replace 必须为 boolean 布尔值');
          replace = value.replace;
        }
      }
    }
    spec.schedule = {
      kind: kind === 'Delay' ? 'delay' : 'debounce',
      milliseconds,
      replace,
    };
  }
  if (spec.schedule) validateVoidReturn(method, 'Delay/Debounce');
  if (spec.emit) validateEmitReturn(method);
  if (spec.watchProps) validateVoidReturn(method, 'WatchProps');
  return spec;
}
