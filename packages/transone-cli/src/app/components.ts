import ts from 'typescript';
import { realpathSync } from 'node:fs';
import {
  createComponentIndex,
  type ClassReference,
  type ComponentIndex,
  type OwnedMember,
} from '../components';
import {
  analyzeInstanceFields,
  type InstanceFieldPlan,
  type InstanceFieldValue,
} from '../components/instance-fields';
import {
  readMethodDecorators,
  validateMethodDecoratorTargets,
} from '../components/method-decorators';
import type { ResolvedConfig } from '../types';
import { nativeError } from './errors';
import type {
  NativeAction,
  NativeNode,
  NativeScreen,
  NativeStateValue,
  NativeStyle,
  NativeTextPart,
  NativeExpression,
  NativeInstruction,
  NativeRuntimeInstance,
  NativeMethod,
} from './types';

type Binding =
  | { kind: 'literal'; value: NativeStateValue }
  | { kind: 'state'; key: string }
  | { kind: 'expression'; value: NativeExpression };
type PropBinding =
  | { kind: 'literal'; value: InstanceFieldValue }
  | { kind: 'state'; key: string }
  | {
      kind: 'expression';
      value: NativeExpression;
      initial: InstanceFieldValue;
    };
interface Instance {
  reference: ClassReference;
  prefix: string;
  state: Map<string, string>;
  props: Map<string, PropBinding>;
  fields: InstanceFieldPlan;
  stateRoot?: Record<string, InstanceFieldValue>;
  propsStateRoot?: boolean;
  runtime: NativeRuntimeInstance;
  runtimePropKeys: Set<string>;
}
const CONTAINERS = new Set(['view', 'main', 'div']);
const TEXT = new Set(['text', 'span', 'p', 'h1']);
const STYLES = new Set([
  'color',
  'backgroundColor',
  'fontSize',
  'fontWeight',
  'padding',
  'margin',
  'width',
  'height',
  'borderRadius',
  'textAlign',
]);
function fail(node: ts.Node, message: string): never {
  const source = node.getSourceFile();
  const point = source.getLineAndCharacterOfPosition(node.getStart());
  throw nativeError(
    `${source.fileName}`,
    `${point.line + 1}:${point.character + 1} ${message}`
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
function name(node: ts.PropertyName): string {
  return ts.isIdentifier(node) ||
    ts.isStringLiteralLike(node) ||
    ts.isNumericLiteral(node)
    ? node.text
    : fail(node, '只支持静态属性名');
}
function property(
  node: ts.ObjectLiteralExpression,
  key: string
): ts.Expression | undefined {
  const item = node.properties.find(
    (p) => !ts.isSpreadAssignment(p) && name(p.name) === key
  );
  if (!item) return undefined;
  if (ts.isPropertyAssignment(item)) return item.initializer;
  if (ts.isShorthandPropertyAssignment(item)) return item.name;
  return fail(item, '只支持静态对象属性');
}
function object(
  node: ts.Expression | undefined,
  label: string
): ts.ObjectLiteralExpression {
  if (!node || !ts.isObjectLiteralExpression(unwrap(node))) {
    if (node) fail(node, `${label} 必须是静态对象`);
    throw new Error(`[transone app] 缺少 ${label}`);
  }
  return unwrap(node) as ts.ObjectLiteralExpression;
}
function returnValue(member: OwnedMember): ts.Expression {
  const declaration = member.declaration;
  if (
    !ts.isMethodDeclaration(declaration) ||
    !declaration.body ||
    declaration.parameters.length !== 0 ||
    declaration.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ||
    declaration.body.statements.length !== 1 ||
    !ts.isReturnStatement(declaration.body.statements[0]) ||
    !declaration.body.statements[0].expression
  )
    fail(
      declaration,
      `${declaration.name?.getText()} 只支持单个静态 return 表达式`
    );
  return declaration.body.statements[0].expression;
}

/** Only direct unconditional calls/initializers (and an optional mount) start a native app. */
function isTopLevelStartup(call: ts.CallExpression): boolean {
  function outer(node: ts.Expression): ts.Expression {
    let value = node;
    while (
      value.parent &&
      (ts.isParenthesizedExpression(value.parent) ||
        ts.isAsExpression(value.parent) ||
        ts.isNonNullExpression(value.parent) ||
        ts.isSatisfiesExpression(value.parent))
    )
      value = value.parent;
    return value;
  }
  let expression = outer(call);
  const access = expression.parent;
  if (
    ts.isPropertyAccessExpression(access) &&
    access.name.text === 'mount' &&
    ts.isCallExpression(access.parent) &&
    access.parent.expression === access &&
    !access.parent.arguments.length
  )
    expression = outer(access.parent);
  const parent = expression.parent;
  if (ts.isExpressionStatement(parent) || ts.isExportAssignment(parent))
    return ts.isSourceFile(parent.parent);
  if (
    ts.isVariableDeclaration(parent) &&
    parent.initializer === expression &&
    ts.isIdentifier(parent.name) &&
    ts.isVariableDeclarationList(parent.parent)
  ) {
    const statement = parent.parent.parent;
    return (
      ts.isVariableStatement(statement) && ts.isSourceFile(statement.parent)
    );
  }
  return false;
}

function validateStaticMetadata(expression: ts.Expression): void {
  const node = unwrap(expression);
  if (
    ts.isStringLiteralLike(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  )
    return;
  if (ts.isObjectLiteralExpression(node)) {
    const seen = new Set<string>();
    for (const item of node.properties) {
      if (!ts.isPropertyAssignment(item))
        fail(item, '原生 createApp 文档配置只支持静态字面量属性');
      const key = name(item.name);
      if (seen.has(key))
        fail(item, `原生 createApp 文档配置存在重复属性 ${key}`);
      seen.add(key);
      validateStaticMetadata(item.initializer);
    }
    return;
  }
  if (ts.isArrayLiteralExpression(node)) {
    for (const value of node.elements) validateStaticMetadata(value);
    return;
  }
  fail(node, '原生 createApp 文档配置只支持静态字面量表达式');
}

/** Returns undefined only for the legacy plain-class fixture format. */
export function composeNativeScreen(
  entry: string,
  config: ResolvedConfig,
  onSourcePaths?: (paths: readonly string[]) => void
): NativeScreen | undefined {
  const index = createComponentIndex({
    root: config.root,
    entrypoints: [entry],
    platform: config.platform,
    ...config.components,
  });
  onSourcePaths?.(index.sources.map((source) => source.fileName));
  const source = index.sources.find(
    (s) => realpathSync(s.fileName) === realpathSync(entry)
  );
  if (!source) throw nativeError(entry, '源文件不存在');
  const compiler = new NativeComposer(index);
  const roots: { reference: ts.Expression; props?: ts.Expression }[] = [];
  const startupCalls: ts.CallExpression[] = [];
  function findStartup(node: ts.Node): void {
    if (ts.isCallExpression(node) && compiler.frameworkCall(node, 'createApp'))
      startupCalls.push(node);
    // Inspect nested declarations too: a dynamic factory must not fall back to
    // compiling an unrelated plain class just because it has no top-level call.
    ts.forEachChild(node, findStartup);
  }
  findStartup(source);

  function createdApp(
    expression: ts.Expression,
    seen = new Set<ts.Node>()
  ): boolean {
    const value = unwrap(expression);
    if (seen.has(value)) return false;
    seen.add(value);
    if (ts.isCallExpression(value))
      return compiler.frameworkCall(value, 'createApp');
    const declaration = index.symbolAt(value)?.valueDeclaration;
    return (
      !!declaration &&
      ts.isVariableDeclaration(declaration) &&
      !!declaration.initializer &&
      createdApp(declaration.initializer, seen)
    );
  }
  function rejectInstalledPlugins(node: ts.Node): void {
    // An unused ordinary helper is not native startup. Calls that actually
    // install a plugin on the app at top level are outside the native subset.
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) return;
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      const receiver = ts.isPropertyAccessExpression(callee)
        ? callee.expression
        : ts.isElementAccessExpression(callee)
          ? callee.expression
          : undefined;
      const method = ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : ts.isElementAccessExpression(callee) &&
            ts.isStringLiteralLike(callee.argumentExpression)
          ? callee.argumentExpression.text
          : undefined;
      if (
        method === 'use' &&
        receiver &&
        (createdApp(receiver) || compiler.frameworkCall(node, 'use'))
      )
        fail(node, '原生 App 不支持路由或插件安装 app.use()');
    }
    ts.forEachChild(node, rejectInstalledPlugins);
  }
  rejectInstalledPlugins(source);

  for (const call of startupCalls) {
    if (!isTopLevelStartup(call))
      fail(
        call,
        '原生 createApp 必须直接位于顶层启动语句；不支持条件、函数或动态表达式'
      );
    if (call.arguments.length !== 1)
      fail(call, '原生 createApp 只支持一个静态 options 对象');
    const options = object(call.arguments[0], 'createApp options');
    const seen = new Set<string>();
    for (const option of options.properties) {
      if (ts.isSpreadAssignment(option))
        fail(option, '原生 createApp options 不支持对象展开');
      if (
        !ts.isPropertyAssignment(option) &&
        !ts.isShorthandPropertyAssignment(option)
      )
        fail(option, '原生 createApp options 只支持静态属性');
      const key = name(option.name);
      if (seen.has(key))
        fail(option, `原生 createApp options 存在重复属性 ${key}`);
      seen.add(key);
      if (!['root', 'rootProps', 'document', 'rootElement'].includes(key))
        fail(option, `原生 createApp 不支持 options.${key}`);
      // Browser-only presentation metadata may be shared with the same entry,
      // but evaluating it must not hide arbitrary startup JavaScript.
      if (key === 'document' || key === 'rootElement')
        validateStaticMetadata(
          ts.isPropertyAssignment(option) ? option.initializer : option.name
        );
    }
    const root = property(options, 'root');
    if (!root) fail(call, 'createApp 缺少 root');
    roots.push({ reference: root, props: property(options, 'rootProps') });
  }
  if (roots.length > 1)
    fail(roots[1].reference, '原生页面只支持一个 createApp 根组件');
  let reference = roots[0] && index.resolve(roots[0].reference, source);
  if (roots.length && (!reference || !index.isComponent(reference)))
    fail(roots[0].reference, 'root 必须是可解析的静态组件引用');
  if (!reference) {
    const local = index.classes.filter(
      (c) => c.source === source && index.isComponent(c)
    );
    const logical = local.filter(
      (c) => index.metadata(c).platforms.length === 0
    );
    const candidates = logical.length ? logical : local;
    if (candidates.length > 1)
      fail(candidates[1].declaration, '多个根组件，请使用 createApp({ root })');
    reference = candidates[0];
  }
  return reference ? compiler.screen(reference, roots[0]?.props) : undefined;
}

class NativeComposer {
  private nextInstance = 0;
  private state: NativeScreen['state'] = [];
  private stack: string[] = [];
  private instances: Instance[] = [];
  private pendingButtons: Array<{
    node: Extract<NativeNode, { kind: 'button' }>;
    listeners: ts.Expression | undefined;
    instance: Instance;
  }> = [];
  private advanced = false;
  private compilingMethods = new Set<string>();
  private nextSynthetic = 0;
  private superAliases = new Map<string, string>();
  private initialValues = new Map<string, InstanceFieldValue>();
  private pendingComplexState: Array<{
    key: string;
    value: InstanceFieldValue;
    node: ts.Node;
  }> = [];
  private valueIds = new WeakMap<object, string>();
  private pooledValues: NonNullable<
    NonNullable<NativeScreen['program']>['values']
  > = [];
  private pooledSources = new Map<string, InstanceFieldValue>();
  private sharedConstMemo = new Map<
    ts.VariableDeclaration,
    InstanceFieldValue
  >();
  private runtimeOnlyProps: ts.Node[] = [];
  constructor(private index: ComponentIndex) {}
  frameworkCall(call: ts.CallExpression, expected: string): boolean {
    const symbol = this.index.symbolAt(call.expression);
    return (
      symbol?.name === expected &&
      !!symbol.declarations?.some((d) =>
        /(?:^|\/)transone\/(?:lib|dist)\//.test(
          d.getSourceFile().fileName.replace(/\\/g, '/')
        )
      )
    );
  }
  screen(reference: ClassReference, props?: ts.Expression): NativeScreen {
    const bindings = new Map<string, PropBinding>();
    const evaluator = analyzeInstanceFields([], this.fieldOptions());
    if (props)
      for (const p of object(props, 'rootProps').properties) {
        if (!ts.isPropertyAssignment(p)) fail(p, 'rootProps 只支持静态属性');
        if (name(p.name) === '__proto__') fail(p, 'rootProps 不支持原型属性');
        bindings.set(name(p.name), {
          kind: 'literal',
          value: evaluator.evaluate(p.initializer),
        });
      }
    const root = this.instance(reference, bindings);
    if (root.kind !== 'container')
      fail(reference.declaration, '根节点必须是容器节点');
    for (const { node, listeners, instance } of this.pendingButtons)
      node.action = this.advanced
        ? this.runtimeClick(listeners, instance)
        : this.click(listeners, instance);
    if (this.advanced) {
      for (const instance of this.instances)
        this.compileRuntimeMembers(instance);
      const initialState: Record<string, NativeExpression> =
        Object.create(null);
      for (const entry of this.pendingComplexState)
        initialState[entry.key] = this.dataExpression(entry.value, entry.node);
      return {
        name: reference.className,
        state: this.state,
        root,
        program: {
          instances: this.instances.map((item) => item.runtime),
          ...(this.pooledValues.length ? { values: this.pooledValues } : {}),
          ...(this.pendingComplexState.length ? { initialState } : {}),
        },
      };
    }
    // Keep the existing small native output and its static restrictions for
    // applications that do not opt into runtime component behavior.
    for (const instance of this.instances)
      this.validateLegacyHooks(instance.reference);
    for (const entry of this.pendingComplexState)
      this.nativeValue(entry.value, entry.node);
    for (const node of this.runtimeOnlyProps)
      fail(node, '动态原生 props 表达式需要组件运行时');
    this.restoreStaticText(root);
    return { name: reference.className, state: this.state, root };
  }
  private fieldOptions(props?: Readonly<Record<string, InstanceFieldValue>>) {
    return {
      resolve: (
        node:
          | ts.Identifier
          | ts.PropertyAccessExpression
          | ts.ElementAccessExpression
      ) => {
        const declaration = this.index.symbolAt(node)?.valueDeclaration;
        return declaration && ts.isVariableDeclaration(declaration)
          ? declaration
          : undefined;
      },
      sources: this.index.sources,
      sharedConstMemo: this.sharedConstMemo,
      nativeData: true,
      props,
      fail,
    };
  }
  private member(
    reference: ClassReference,
    key: string
  ): OwnedMember | undefined {
    return this.index
      .members(reference)
      .find(
        (m) =>
          m.declaration.name &&
          name(m.declaration.name) === key &&
          !(
            ts.canHaveModifiers(m.declaration) &&
            ts
              .getModifiers(m.declaration)
              ?.some(
                (modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword
              )
          )
      );
  }
  private parent(member: OwnedMember, key: string): OwnedMember {
    const parent = this.index.metadata(member.owner).parent;
    const result = parent && this.member(parent, key);
    if (!result) fail(member.declaration, `无法解析 super.${key}`);
    return result;
  }
  private literal(
    expression: ts.Expression,
    instance?: Instance,
    seen = new Set<ts.Node>(),
    initialProps = false
  ): NativeStateValue {
    const node = unwrap(expression);
    if (instance) this.rejectStateAliasRead(node, instance);
    if (instance && !initialProps) this.rejectDynamicPropsRead(node, instance);
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isNumericLiteral(node))
      return this.nativeValue(Number(node.text), node);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (
      ts.isPrefixUnaryExpression(node) &&
      (node.operator === ts.SyntaxKind.MinusToken ||
        node.operator === ts.SyntaxKind.PlusToken)
    ) {
      const value = this.literal(node.operand, instance, seen, initialProps);
      if (typeof value === 'number')
        return node.operator === ts.SyntaxKind.MinusToken ? -value : value;
    }
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
      const declaration = this.index.symbolAt(node)?.valueDeclaration;
      if (
        declaration &&
        ts.isVariableDeclaration(declaration) &&
        declaration.initializer &&
        ts.isVariableDeclarationList(declaration.parent) &&
        declaration.parent.flags & ts.NodeFlags.Const
      ) {
        if (seen.has(declaration)) fail(node, '常量引用循环');
        let scope: ts.Node | undefined = declaration.parent;
        while (scope && !ts.isSourceFile(scope) && !ts.isFunctionLike(scope))
          scope = scope.parent;
        if (scope && ts.isSourceFile(scope)) {
          const check = (child: ts.Node): void => {
            if (child.kind === ts.SyntaxKind.ThisKeyword)
              fail(child, '模块常量初始化不能读取组件 this');
            ts.forEachChild(child, check);
          };
          check(declaration.initializer);
        }
        return this.literal(
          declaration.initializer,
          instance,
          new Set([...seen, declaration]),
          initialProps
        );
      }
    }
    if (instance && (initialProps || this.readsField(node, instance)))
      return this.nativeValue(instance.fields.evaluate(node), node);
    return fail(node, `不支持的原生表达式: ${node.getText()}`);
  }
  private readsField(expression: ts.Expression, instance: Instance): boolean {
    let readsField = false;
    const visit = (node: ts.Node): void => {
      if (
        ts.isPropertyAccessExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ThisKeyword &&
        instance.fields.values.has(node.name.text)
      )
        readsField = true;
      ts.forEachChild(node, visit);
    };
    visit(expression);
    return readsField;
  }
  private stateAliasKey(
    expression: ts.Expression,
    instance: Instance
  ): string | undefined {
    const node = unwrap(expression);
    if (
      !instance.stateRoot ||
      (!ts.isPropertyAccessExpression(node) &&
        !ts.isElementAccessExpression(node)) ||
      !this.readsField(node.expression, instance) ||
      instance.fields.evaluate(node.expression) !== instance.stateRoot
    )
      return undefined;
    const key = ts.isPropertyAccessExpression(node)
      ? node.name.text
      : instance.fields.evaluate(node.argumentExpression);
    if (typeof key !== 'string' && typeof key !== 'number')
      fail(node, 'state 根对象别名只支持静态属性读取');
    const scoped = instance.state.get(String(key));
    if (!scoped) fail(node, `state 根对象别名引用未声明的属性 ${key}`);
    return scoped;
  }
  private rejectStateAliasRead(
    expression: ts.Expression,
    instance: Instance
  ): void {
    if (!instance.stateRoot) return;
    const visit = (node: ts.Node): void => {
      if (
        (ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node)) &&
        this.readsField(node, instance) &&
        (this.stateAliasKey(node, instance) ||
          instance.fields.evaluate(node) === instance.stateRoot)
      )
        fail(node, 'state 根对象别名是动态值，不能用于原生静态表达式');
      ts.forEachChild(node, visit);
    };
    visit(expression);
  }
  private fieldObject(
    expression: ts.Expression,
    instance: Instance,
    label: string,
    initialProps = false
  ): Record<string, InstanceFieldValue> {
    if (!initialProps && !this.readsField(expression, instance))
      fail(expression, `${label} 必须是静态对象或实例字段对象`);
    this.rejectStateAliasRead(expression, instance);
    if (!initialProps) this.rejectDynamicPropsRead(expression, instance);
    const value = instance.fields.evaluate(expression);
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      fail(expression, `${label} 必须是静态对象或实例字段对象`);
    return value;
  }
  private nativeValue(
    value: InstanceFieldValue,
    node: ts.Node
  ): NativeStateValue {
    if (
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    )
      return value;
    return fail(node, '原生值只支持字符串、布尔值或有限数字');
  }
  private dataExpression(
    value: InstanceFieldValue,
    node: ts.Node
  ): NativeExpression {
    if (value === undefined) return { kind: 'undefined' };
    if (value === null) return { kind: 'literal', value: null };
    if (typeof value !== 'object')
      return { kind: 'literal', value: this.nativeValue(value, node) };
    const existing = this.valueIds.get(value);
    if (existing) return { kind: 'value-ref', id: existing };
    const id = `v${this.pooledValues.length}`;
    this.valueIds.set(value, id);
    this.pooledSources.set(id, value);
    const entry: NonNullable<
      NonNullable<NativeScreen['program']>['values']
    >[number] = {
      id,
      value: { kind: 'object', entries: [] },
    };
    this.pooledValues.push(entry);
    entry.value = Array.isArray(value)
      ? {
          kind: 'array',
          items: Array.from({ length: value.length }, (_, index) =>
            Object.prototype.hasOwnProperty.call(value, index)
              ? { value: this.dataExpression(value[index], node) }
              : { hole: true }
          ),
        }
      : {
          kind: 'object',
          entries: Object.entries(value).map(([key, item]) => ({
            key: { kind: 'literal', value: key },
            value: this.dataExpression(item, node),
          })),
        };
    return { kind: 'value-ref', id };
  }
  private initialExpression(expression: NativeExpression): InstanceFieldValue {
    const evaluate = (node: NativeExpression): InstanceFieldValue =>
      this.initialExpression(node);
    switch (expression.kind) {
      case 'literal':
        return expression.value;
      case 'undefined':
        return undefined;
      case 'state':
        return this.initialValues.get(expression.key);
      case 'value-ref':
        return this.pooledSources.get(expression.id);
      case 'memo':
        return evaluate(expression.initial ?? expression.value);
      case 'prop': {
        const instance = this.instances.find(
          (item) => item.prefix === expression.instance
        )!;
        const binding = instance.props.get(expression.key);
        return binding ? this.initialProp(binding) : undefined;
      }
      case 'array': {
        const result: InstanceFieldValue[] = [];
        for (const item of expression.items) {
          if (item.hole) {
            result.length++;
            continue;
          }
          const value = item.value ? evaluate(item.value) : undefined;
          if (item.spread) {
            if (Array.isArray(value) || typeof value === 'string')
              result.push(...value);
            else throw new Error('原生数组展开只支持数组或字符串');
          } else result.push(value);
        }
        return result;
      }
      case 'object': {
        const result: Record<string, InstanceFieldValue> = {};
        for (const item of expression.entries) {
          const key = item.key ? String(evaluate(item.key)) : '';
          const value = evaluate(item.value);
          if (item.spread) {
            if (value != null)
              for (const [key, item] of Object.entries(value))
                Object.defineProperty(result, key, {
                  value: item,
                  writable: true,
                  configurable: true,
                  enumerable: true,
                });
          } else
            Object.defineProperty(result, key, {
              value,
              writable: true,
              configurable: true,
              enumerable: true,
            });
        }
        return result;
      }
      case 'member': {
        const target = evaluate(expression.target);
        if (target == null) {
          if (expression.optional) return undefined;
          throw new Error('原生初始属性读取了 null 或 undefined');
        }
        const key = String(evaluate(expression.key));
        if (
          (Array.isArray(target) || typeof target === 'string') &&
          key === 'length'
        )
          return target.length;
        return Object.prototype.hasOwnProperty.call(target, key)
          ? (target as Record<string, InstanceFieldValue>)[key]
          : undefined;
      }
      case 'conditional':
        return evaluate(expression.condition)
          ? evaluate(expression.whenTrue)
          : evaluate(expression.whenFalse);
      case 'unary': {
        const value = evaluate(expression.value);
        switch (expression.operator) {
          case '!':
            return !value;
          case 'Boolean':
            return Boolean(value);
          case 'String':
            return String(value);
          case '-':
            return -Number(value);
          default:
            return Number(value);
        }
      }
      case 'binary': {
        const left = evaluate(expression.left);
        if (expression.operator === '&&')
          return left ? evaluate(expression.right) : left;
        if (expression.operator === '||')
          return left ? left : evaluate(expression.right);
        if (expression.operator === '??')
          return left == null ? evaluate(expression.right) : left;
        const right = evaluate(expression.right);
        // Equality preserves object identity and must not ask data objects for
        // primitive values (their own toString/valueOf keys may be data).
        if (expression.operator === '===') return left === right;
        if (expression.operator === '!==') return left !== right;
        if (expression.operator === '==') return left == right;
        if (expression.operator === '!=') return left != right;
        const primitive = (value: InstanceFieldValue) =>
          value !== null && typeof value === 'object' ? String(value) : value;
        const convertsToPrimitive = ['+', '<', '<=', '>', '>='].includes(
          expression.operator
        );
        const a = convertsToPrimitive ? primitive(left) : left,
          b = convertsToPrimitive ? primitive(right) : right;
        switch (expression.operator) {
          case '+':
            return typeof a === 'string' || typeof b === 'string'
              ? String(a) + String(b)
              : Number(a) + Number(b);
          case '-':
            return Number(left) - Number(right);
          case '*':
            return Number(left) * Number(right);
          case '/':
            return Number(left) / Number(right);
          case '%':
            return Number(left) % Number(right);
          case '<':
            return typeof a === 'string' && typeof b === 'string'
              ? a < b
              : Number(a) < Number(b);
          case '<=':
            return typeof a === 'string' && typeof b === 'string'
              ? a <= b
              : Number(a) <= Number(b);
          case '>':
            return typeof a === 'string' && typeof b === 'string'
              ? a > b
              : Number(a) > Number(b);
          case '>=':
            return typeof a === 'string' && typeof b === 'string'
              ? a >= b
              : Number(a) >= Number(b);
        }
        throw new Error('不支持的原生初始运算');
      }
      default:
        throw new Error('组件 props 初始表达式不支持方法调用或局部变量');
    }
  }
  private collectRenderDependencies(
    expression: ts.Expression,
    instance: Instance,
    owner: OwnedMember
  ): void {
    const dependencies: NativeExpression[] = [];
    const identities = new Set<string>();
    const dynamic = (node: ts.Node): boolean => {
      if (
        (ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node)) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
        ['state', 'props'].includes(node.expression.name.text)
      )
        return true;
      return ts.forEachChild(node, dynamic) ?? false;
    };
    const allocates = (value: NativeExpression): boolean => {
      switch (value.kind) {
        case 'object':
        case 'array':
          return true;
        case 'member':
          return allocates(value.target) || allocates(value.key);
        case 'binary':
          return allocates(value.left) || allocates(value.right);
        case 'unary':
        case 'revision':
          return allocates(value.value);
        case 'conditional':
          return (
            allocates(value.condition) ||
            allocates(value.whenTrue) ||
            allocates(value.whenFalse)
          );
        case 'call':
          return value.args.some(allocates);
        case 'memo':
          return allocates(value.value);
        default:
          return false;
      }
    };
    const add = (value: NativeExpression, guard?: NativeExpression): void => {
      // Only sample existing reads. A literal allocated while sampling cannot
      // serve as a stable dependency; its underlying reads are visited below.
      if (allocates(value)) return;
      const dependency: NativeExpression = guard
        ? {
            kind: 'conditional',
            condition: guard,
            whenTrue: value,
            whenFalse: { kind: 'undefined' },
          }
        : value;
      const identity = JSON.stringify(dependency);
      if (!identities.has(identity)) {
        identities.add(identity);
        dependencies.push(dependency);
      }
    };
    const guarded = (
      parent: NativeExpression | undefined,
      condition: NativeExpression
    ): NativeExpression =>
      parent
        ? { kind: 'binary', operator: '&&', left: parent, right: condition }
        : condition;
    const visit = (
      node: ts.Node,
      currentOwner = owner,
      guard?: NativeExpression
    ): void => {
      if (ts.isFunctionLike(node)) return;
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.kind === ts.SyntaxKind.SuperKeyword &&
        node.expression.name.text === 'render' &&
        !node.arguments.length
      ) {
        const parent = this.parent(currentOwner, 'render');
        visit(returnValue(parent), parent, guard);
        return;
      }
      if (ts.isConditionalExpression(node)) {
        visit(node.condition, currentOwner, guard);
        const condition = this.runtimeExpression(
          node.condition,
          instance,
          currentOwner,
          new Set()
        );
        visit(node.whenTrue, currentOwner, guarded(guard, condition));
        visit(
          node.whenFalse,
          currentOwner,
          guarded(guard, { kind: 'unary', operator: '!', value: condition })
        );
        return;
      }
      if (
        ts.isBinaryExpression(node) &&
        [
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(node.operatorToken.kind)
      ) {
        visit(node.left, currentOwner, guard);
        const left = this.runtimeExpression(
          node.left,
          instance,
          currentOwner,
          new Set()
        );
        const condition: NativeExpression =
          node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
            ? left
            : node.operatorToken.kind === ts.SyntaxKind.BarBarToken
              ? { kind: 'unary', operator: '!', value: left }
              : {
                  kind: 'binary',
                  operator: '==',
                  left,
                  right: { kind: 'literal', value: null },
                };
        visit(node.right, currentOwner, guarded(guard, condition));
        return;
      }
      if (ts.isSpreadAssignment(node) || ts.isSpreadElement(node)) {
        const value = this.runtimeExpression(
          node.expression,
          instance,
          currentOwner,
          new Set()
        );
        add(
          {
            kind: 'revision',
            value,
            mode: ts.isSpreadAssignment(node) ? 'object' : 'array',
          },
          guard
        );
        visit(node.expression, currentOwner, guard);
        return;
      }
      if (ts.isComputedPropertyName(node)) {
        add(
          {
            kind: 'unary',
            operator: 'String',
            value: this.runtimeExpression(
              node.expression,
              instance,
              currentOwner,
              new Set()
            ),
          },
          guard
        );
      }
      if (
        (ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node)) &&
        dynamic(node)
      ) {
        const value = this.runtimeExpression(
          node,
          instance,
          currentOwner,
          new Set()
        );
        add(value, guard);
      }
      // Supported conversions may read array elements even when their result
      // stays equal (e.g. String([1]) after replacing 1 with '1'). Sampling the
      // operation records those reads without treating references as deep.
      if (
        (ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          ['String', 'Number', 'Boolean'].includes(node.expression.text) &&
          node.arguments.length === 1) ||
        ts.isPrefixUnaryExpression(node) ||
        ts.isBinaryExpression(node)
      ) {
        add(
          this.runtimeExpression(
            node as ts.Expression,
            instance,
            currentOwner,
            new Set()
          ),
          guard
        );
      }
      if (ts.isStringLiteralLike(node)) {
        for (const match of node.text.matchAll(/{{([^}]+)}}/g)) {
          const key = match[1].trim();
          const state = instance.state.get(key);
          const value: NativeExpression | undefined = state
            ? { kind: 'state', key: state }
            : instance.props.has(key)
              ? { kind: 'prop', instance: instance.prefix, key }
              : undefined;
          if (value) add(value, guard);
        }
      }
      ts.forEachChild(node, (child) => visit(child, currentOwner, guard));
    };
    visit(expression);
    instance.runtime.renderDependencies = dependencies;
  }
  private initialState(
    member: OwnedMember,
    instance: Instance,
    active = new Set<ts.Node>()
  ): Record<string, InstanceFieldValue> {
    if (active.has(member.declaration))
      fail(member.declaration, 'initState 循环');
    const declaration = member.declaration;
    if (
      !ts.isMethodDeclaration(declaration) ||
      !declaration.body ||
      declaration.parameters.length ||
      declaration.asteriskToken ||
      declaration.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
    )
      fail(declaration, 'initState 只支持 const 声明与静态 return 表达式');
    const locals = new Map<ts.VariableDeclaration, ts.Expression>();
    let expression: ts.Expression | undefined;
    for (const statement of declaration.body.statements) {
      if (expression) fail(statement, 'initState 必须以单个 return 表达式结束');
      if (
        ts.isVariableStatement(statement) &&
        statement.declarationList.flags & ts.NodeFlags.Const
      ) {
        for (const local of statement.declarationList.declarations) {
          if (!ts.isIdentifier(local.name) || !local.initializer)
            fail(local, 'initState 只支持有初值的 const 标识符');
          locals.set(local, local.initializer);
        }
      } else if (ts.isReturnStatement(statement) && statement.expression)
        expression = statement.expression;
      else fail(statement, 'initState 只支持 const 声明与静态 return 表达式');
    }
    if (!expression) fail(declaration, 'initState 必须以 return 表达式结束');
    active.add(declaration);
    try {
      const resolveSuper = (): InstanceFieldValue =>
        this.initialState(this.parent(member, 'initState'), instance, active);
      for (const local of locals.keys())
        instance.fields.evaluate(
          local.name as ts.Identifier,
          undefined,
          locals,
          resolveSuper
        );
      const value = instance.fields.evaluate(
        expression,
        undefined,
        locals,
        resolveSuper
      );
      if (!value || typeof value !== 'object' || Array.isArray(value))
        fail(expression, 'initState() 必须返回静态对象');
      return value;
    } finally {
      active.delete(declaration);
    }
  }
  private instance(
    logical: ClassReference,
    props: Map<string, PropBinding>,
    parent?: Instance
  ): NativeNode {
    const reference = this.index.select(logical);
    if (this.stack.includes(reference.id))
      fail(reference.declaration, `静态组件组合循环: ${reference.className}`);
    this.stack.push(reference.id);
    this.validateInstance(reference);
    const initialProps: Record<string, InstanceFieldValue> = {};
    for (const [key, binding] of props) {
      if (binding.kind === 'literal') initialProps[key] = binding.value;
      else if (binding.kind === 'expression')
        initialProps[key] = binding.initial;
      else {
        const initial = this.state.find((entry) => entry.key === binding.key);
        if (!initial)
          fail(reference.declaration, `props.${key} 无法解析初始 state`);
        initialProps[key] = this.initialValues.get(binding.key);
      }
    }
    const prefix = `c${this.nextInstance++}_`;
    const runtime: NativeRuntimeInstance = {
      id: prefix,
      ...(parent ? { parent: parent.prefix } : {}),
      props: Object.create(null),
      methods: Object.create(null),
      emitters: Object.create(null),
      watchers: [],
    };
    const instance: Instance = {
      reference,
      prefix,
      state: new Map(),
      props,
      fields: analyzeInstanceFields(
        this.index.hierarchy(reference),
        this.fieldOptions(initialProps)
      ),
      runtime,
      runtimePropKeys: new Set(),
    };
    this.instances.push(instance);
    const init = this.member(reference, 'initState');
    if (init) {
      const stateRoot = this.initialState(init, instance);
      for (const [key, value] of Object.entries(stateRoot)) {
        const scoped = `${instance.prefix}s${instance.state.size}_${key.replace(/[^A-Za-z0-9_]/g, '_')}`;
        instance.state.set(key, scoped);
        this.initialValues.set(scoped, value);
        const scalar =
          typeof value === 'string' ||
          typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value));
        if (!scalar)
          this.pendingComplexState.push({
            key: scoped,
            value,
            node: init.declaration,
          });
        this.state.push({
          key: scoped,
          value: scalar ? this.nativeValue(value, init.declaration) : 0,
        });
      }
      if (instance.fields.sharedObjects.has(stateRoot))
        fail(init.declaration, '共享模块对象不能作为原生state根');
      instance.stateRoot = stateRoot;
      const includesRoot = (value: InstanceFieldValue): boolean =>
        value === stateRoot ||
        (!!value &&
          typeof value === 'object' &&
          Object.values(value).some(includesRoot));
      instance.propsStateRoot = includesRoot(initialProps);
    }
    const styles = this.member(reference, 'initStyles');
    if (styles) this.validateStyles(styles);
    const render = this.member(reference, 'render');
    if (!render) fail(reference.declaration, '缺少 render()');
    const rendered = returnValue(render);
    let dependencyFailure: { error: unknown } | undefined;
    try {
      this.collectRenderDependencies(rendered, instance, render);
    } catch (error) {
      // Memos need dependencies before composition, but unsupported static
      // trees retain their existing diagnostics before dependency errors.
      dependencyFailure = { error };
    }
    const root = this.node(rendered, instance, render);
    if (dependencyFailure) throw dependencyFailure.error;
    this.stack.pop();
    return root;
  }
  private validateInstance(reference: ClassReference): void {
    // Constructors execute for every ancestor, even if a child overrides the
    // corresponding member. Field initialization is checked by the shared plan.
    for (const owner of this.index.hierarchy(reference)) {
      validateMethodDecoratorTargets(
        this.index,
        owner.source,
        owner.declaration
      );
      for (const member of owner.declaration.members) {
        if (ts.isConstructorDeclaration(member))
          fail(member, '原生组件不支持自定义 constructor');
        if (ts.isMethodDeclaration(member)) {
          const decorators = readMethodDecorators(
            this.index,
            owner.source,
            member
          );
          if (decorators?.schedule)
            fail(
              member,
              `原生 App 不支持 ${decorators.schedule.kind === 'delay' ? 'Delay' : 'Debounce'} 方法调度`
            );
          if (decorators?.emit || decorators?.watchProps) this.advanced = true;
          const visit = (node: ts.Node): void => {
            if (
              ts.isCallExpression(node) &&
              ts.isPropertyAccessExpression(node.expression) &&
              node.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
              node.expression.name.text === 'setProps'
            )
              this.advanced = true;
            ts.forEachChild(node, visit);
          };
          if (member.body) visit(member.body);
        }
      }
    }
    // Match the framework component lifecycle, including props updates and
    // error boundaries. Effective members preserve override and owner semantics;
    // empty hooks remain harmless, but lifecycle JavaScript has no native IR.
    for (const key of [
      'beforeUpdate',
      'onUpdated',
      'onPropsChange',
      'onErrorCaptured',
    ]) {
      const member = this.member(reference, key);
      if (
        member &&
        (!ts.isMethodDeclaration(member.declaration) ||
          member.declaration.body?.statements.length)
      )
        fail(
          member.declaration,
          `原生组件不支持生命周期 ${key} 中的 JavaScript`
        );
    }
  }
  private validateLegacyHooks(reference: ClassReference): void {
    for (const key of [
      'beforeMount',
      'onMounted',
      'beforeUnmount',
      'onUnmounted',
    ]) {
      const member = this.member(reference, key);
      if (
        member &&
        (!ts.isMethodDeclaration(member.declaration) ||
          member.declaration.body?.statements.length)
      )
        fail(
          member.declaration,
          `原生组件不支持生命周期 ${key} 中的 JavaScript`
        );
    }
  }
  private validateStyles(member: OwnedMember): void {
    const declaration = member.declaration;
    if (!ts.isMethodDeclaration(declaration) || !declaration.body)
      fail(declaration, '原生 initStyles 必须具有静态方法体');
    for (const statement of declaration.body.statements) {
      if (
        ts.isExpressionStatement(statement) &&
        ts.isCallExpression(statement.expression) &&
        ts.isPropertyAccessExpression(statement.expression.expression) &&
        statement.expression.expression.expression.kind ===
          ts.SyntaxKind.SuperKeyword &&
        statement.expression.expression.name.text === 'initStyles' &&
        !statement.expression.arguments.length
      )
        this.validateStyles(this.parent(member, 'initStyles'));
      else
        fail(
          statement,
          '原生 initStyles 不支持 CSS 规则；请使用 VNode 内联 style 或覆盖为空方法'
        );
    }
  }
  private binding(expression: ts.Expression, instance: Instance): Binding {
    const node = unwrap(expression);
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.kind === ts.SyntaxKind.ThisKeyword
    ) {
      const group = node.expression.name.text;
      const key = node.name.text;
      if (group === 'state') {
        const scoped = instance.state.get(key);
        if (!scoped) fail(node, `未声明的 state.${key}`);
        return { kind: 'state', key: scoped };
      }
      if (group === 'props') {
        const binding = instance.props.get(key);
        if (!binding) fail(node, `未提供的 props.${key}`);
        this.assertRuntimeProp(instance, key, node);
        return {
          kind: 'expression',
          value: { kind: 'prop', instance: instance.prefix, key },
        };
      }
    }
    const aliasKey = this.stateAliasKey(node, instance);
    if (aliasKey) return { kind: 'state', key: aliasKey };
    if (this.readsRuntimeValue(node))
      return {
        kind: 'expression',
        value: this.runtimeExpression(
          node,
          instance,
          this.member(instance.reference, 'render')!,
          new Set()
        ),
      };
    return { kind: 'literal', value: this.literal(node, instance) };
  }
  private readsRuntimeValue(expression: ts.Node): boolean {
    if (
      (ts.isPropertyAccessExpression(expression) ||
        ts.isElementAccessExpression(expression)) &&
      ts.isPropertyAccessExpression(expression.expression) &&
      expression.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
      ['state', 'props'].includes(expression.expression.name.text)
    )
      return true;
    return (
      ts.forEachChild(expression, (child) => this.readsRuntimeValue(child)) ??
      false
    );
  }
  private text(
    expression: ts.Expression,
    instance: Instance
  ): NativeTextPart[] {
    const value = this.binding(expression, instance);
    if (value.kind === 'state') return [value];
    if (value.kind === 'expression') return [value];
    if (typeof value.value !== 'string')
      return [{ kind: 'literal', value: String(value.value) }];
    const result: NativeTextPart[] = [];
    const matcher = /{{([^}]+)}}/g;
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = matcher.exec(value.value))) {
      if (match.index > cursor)
        result.push({
          kind: 'literal',
          value: value.value.slice(cursor, match.index),
        });
      const key = match[1].trim();
      const scoped = instance.state.get(key);
      const prop = instance.props.get(key);
      if (scoped) result.push({ kind: 'state', key: scoped });
      else if (prop) {
        this.assertRuntimeProp(instance, key, expression);
        result.push({
          kind: 'expression',
          value: { kind: 'prop', instance: instance.prefix, key },
        });
      } else
        fail(expression, `只支持已声明 state/props 的 {{key}} 绑定: ${key}`);
      cursor = matcher.lastIndex;
    }
    if (cursor < value.value.length || !result.length)
      result.push({ kind: 'literal', value: value.value.slice(cursor) });
    return result;
  }
  private props(
    node: ts.Expression | undefined,
    instance: Instance
  ): Map<string, PropBinding> {
    const result = new Map<string, PropBinding>();
    if (!node) return result;
    for (const p of object(node, '组件 props').properties) {
      if (!ts.isPropertyAssignment(p)) fail(p, '组件 props 只支持静态属性');
      if (name(p.name) === '__proto__') fail(p, '组件 props 不支持原型属性');
      const value = unwrap(p.initializer);
      const stateAlias = this.stateAliasKey(value, instance);
      if (stateAlias) {
        result.set(name(p.name), { kind: 'state', key: stateAlias });
        continue;
      }
      if (
        ts.isPropertyAccessExpression(value) &&
        ts.isPropertyAccessExpression(value.expression) &&
        value.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
        ['state', 'props'].includes(value.expression.name.text)
      ) {
        if (value.expression.name.text === 'props') {
          const binding = instance.props.get(value.name.text);
          result.set(name(p.name), {
            kind: 'expression',
            value: {
              kind: 'prop',
              instance: instance.prefix,
              key: value.name.text,
            },
            initial: binding ? this.initialProp(binding) : undefined,
          });
        } else {
          const binding = this.binding(value, instance);
          if (binding.kind === 'expression')
            fail(value, '动态 props 需要直接的 state 或 props 绑定');
          result.set(name(p.name), binding);
        }
      } else {
        const allocates = (node: ts.Node): boolean =>
          ts.isObjectLiteralExpression(node) ||
          ts.isArrayLiteralExpression(node) ||
          (ts.forEachChild(node, allocates) ?? false);
        const allocated = allocates(value);
        if (this.readsRuntimeValue(value) || allocated) {
          if (this.readsRuntimeValue(value)) this.runtimeOnlyProps.push(value);
          const compiled = this.runtimeExpression(
            value,
            instance,
            this.member(instance.reference, 'render')!,
            new Set()
          );
          let initial: InstanceFieldValue;
          try {
            initial = this.initialExpression(compiled);
          } catch (error) {
            fail(
              value,
              error instanceof Error ? error.message : '无法解析原生 props 初值'
            );
          }
          const hasAllocation = (node: NativeExpression): boolean => {
            if (node.kind === 'object' || node.kind === 'array') return true;
            if (node.kind === 'conditional')
              return (
                hasAllocation(node.whenTrue) || hasAllocation(node.whenFalse)
              );
            if (node.kind === 'binary')
              return hasAllocation(node.left) || hasAllocation(node.right);
            if (node.kind === 'unary') return hasAllocation(node.value);
            if (node.kind === 'member')
              return hasAllocation(node.target) || hasAllocation(node.key);
            return false;
          };
          result.set(name(p.name), {
            kind: 'expression',
            initial,
            value: hasAllocation(compiled)
              ? {
                  kind: 'memo',
                  owner: instance.prefix,
                  key: `${this.index.sources.indexOf(value.getSourceFile())}:${value.pos}:${this.nextSynthetic++}`,
                  value: compiled,
                  initial: this.dataExpression(initial, value),
                }
              : compiled,
          });
        } else {
          this.rejectDynamicPropsRead(value, instance);
          this.rejectStateAliasRead(value, instance);
          result.set(name(p.name), {
            kind: 'literal',
            value: instance.fields.evaluate(value),
          });
        }
      }
    }
    return result;
  }
  private rejectDynamicPropsRead(
    expression: ts.Expression,
    instance: Instance
  ): void {
    const visit = (node: ts.Node): void => {
      if (
        (ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node)) &&
        node.expression.kind === ts.SyntaxKind.ThisKeyword &&
        (ts.isPropertyAccessExpression(node)
          ? node.name.text === 'props'
          : ts.isStringLiteralLike(node.argumentExpression) &&
            node.argumentExpression.text === 'props') &&
        [...instance.props.values()].some((binding) => binding.kind === 'state')
      ) {
        const access = node.parent;
        const key =
          ts.isPropertyAccessExpression(access) && access.expression === node
            ? access.name.text
            : ts.isElementAccessExpression(access) &&
                access.expression === node &&
                (ts.isStringLiteralLike(access.argumentExpression) ||
                  ts.isNumericLiteral(access.argumentExpression))
              ? access.argumentExpression.text
              : undefined;
        if (key === undefined || instance.props.get(key)?.kind === 'state')
          fail(node, '动态 props 不能用于原生静态表达式或嵌套 props');
      }
      ts.forEachChild(node, visit);
    };
    visit(expression);
  }
  private style(
    props: ts.Expression | undefined,
    instance: Instance
  ): NativeStyle | undefined {
    if (!props) return undefined;
    const p = object(props, 'VNode props');
    for (const field of p.properties)
      if (ts.isSpreadAssignment(field) || name(field.name) !== 'style')
        fail(field, '原生 VNode props 只支持 style');
    const style = property(p, 'style');
    if (!style) return undefined;
    const out: Record<string, string | number> = {};
    const styleNode = unwrap(style);
    const entries = ts.isObjectLiteralExpression(styleNode)
      ? styleNode.properties.map((item) => {
          if (!ts.isPropertyAssignment(item))
            fail(item, '不支持的原生样式属性');
          return {
            key: name(item.name),
            value: this.literal(item.initializer, instance),
            node: item as ts.Node,
          };
        })
      : Object.entries(this.fieldObject(style, instance, 'style')).map(
          ([key, value]) => ({
            key,
            value: this.nativeValue(value, style),
            node: style as ts.Node,
          })
        );
    for (const { key, value, node } of entries) {
      if (!STYLES.has(key)) fail(node, '不支持的原生样式属性');
      if (
        ['color', 'backgroundColor', 'fontWeight', 'textAlign'].includes(key) &&
        (typeof value === 'string' || typeof value === 'number')
      )
        out[key] = value;
      else if (typeof value === 'number') out[key] = value;
      else if (typeof value === 'string' && /^\d+(\.\d+)?px$/.test(value))
        out[key] = parseFloat(value);
      else fail(node, `样式 ${key} 只支持数字或 px`);
    }
    return out as NativeStyle;
  }
  private node(
    expression: ts.Expression,
    instance: Instance,
    owner: OwnedMember
  ): NativeNode {
    const node = unwrap(expression);
    let tag: ts.Expression | undefined,
      props: ts.Expression | undefined,
      children: ts.Expression | undefined,
      listeners: ts.Expression | undefined;
    if (
      ts.isCallExpression(node) &&
      this.frameworkCall(node, 'createComponent')
    ) {
      const first = node.arguments[0];
      if (!first) fail(node, 'createComponent 缺少静态组件');
      if (ts.isObjectLiteralExpression(unwrap(first))) {
        if (node.arguments.length !== 1)
          fail(node, 'createComponent options 不支持额外参数/slots');
        return this.componentNode(
          unwrap(first) as ts.ObjectLiteralExpression,
          instance
        );
      }
      if (node.arguments.length > 2)
        fail(node, '原生组件不支持 children/slots 或额外参数');
      const reference = this.index.resolve(first, first.getSourceFile());
      if (!reference || !this.index.isComponent(reference))
        fail(node, 'createComponent 必须引用静态组件');
      return this.instance(
        reference,
        this.props(node.arguments[1], instance),
        instance
      );
    } else if (ts.isCallExpression(node) && this.frameworkCall(node, 'h')) {
      if (node.arguments.length > 4) fail(node, 'h 不支持额外参数/slots');
      [tag, props, children, listeners] = node.arguments;
    } else if (ts.isObjectLiteralExpression(node)) {
      if (property(node, 'component'))
        return this.componentNode(node, instance);
      for (const p of node.properties)
        if (
          ts.isSpreadAssignment(p) ||
          !['tag', 'props', 'children', 'listeners'].includes(name(p.name))
        )
          fail(p, '不支持的原生 VNode 属性/slots');
      tag = property(node, 'tag');
      props = property(node, 'props');
      children = property(node, 'children');
      listeners = property(node, 'listeners');
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.kind === ts.SyntaxKind.SuperKeyword &&
      node.expression.name.text === 'render' &&
      !node.arguments.length
    ) {
      const parent = this.parent(owner, 'render');
      return this.node(returnValue(parent), instance, parent);
    } else return fail(node, '只支持静态 h/createComponent/VNode 表达式');
    if (!tag) fail(node, 'VNode 缺少 tag');
    const tagName = this.literal(tag, instance);
    if (typeof tagName !== 'string') fail(tag, 'VNode tag 必须是字符串');
    const style = this.style(props, instance);
    let values: readonly ts.Expression[] = [];
    if (children) {
      const array = unwrap(children);
      if (!ts.isArrayLiteralExpression(array))
        fail(children, 'children 必须是静态数组');
      values = array.elements;
    }
    if (CONTAINERS.has(tagName)) {
      if (listeners) fail(listeners, '原生容器不支持 listeners');
      return {
        kind: 'container',
        children: values.map((child) => this.node(child, instance, owner)),
        ...(style ? { style } : {}),
      };
    }
    if (!TEXT.has(tagName) && tagName !== 'button')
      fail(tag, `不支持的原生节点: ${tagName}`);
    const parts = values.flatMap((value) => this.text(value, instance));
    if (tagName === 'button') {
      const button: Extract<NativeNode, { kind: 'button' }> = {
        kind: 'button',
        parts,
        action: { kind: 'sequence', actions: [] },
        ...(style ? { style } : {}),
      };
      this.pendingButtons.push({ node: button, listeners, instance });
      return button;
    }
    if (listeners) fail(listeners, '原生文本不支持 listeners');
    return { kind: 'text', parts, ...(style ? { style } : {}) };
  }
  private componentNode(
    options: ts.ObjectLiteralExpression,
    instance: Instance
  ): NativeNode {
    for (const p of options.properties)
      if (
        ts.isSpreadAssignment(p) ||
        !['component', 'props', 'emitters'].includes(name(p.name))
      )
        fail(p, '原生组件不支持 slots 或动态 options');
    const component = property(options, 'component');
    const reference =
      component && this.index.resolve(component, component.getSourceFile());
    if (!reference || !this.index.isComponent(reference))
      fail(options, 'createComponent 必须引用静态组件');
    const childIndex = this.instances.length;
    const child = this.instance(
      reference,
      this.props(property(options, 'props'), instance),
      instance
    );
    const childInstance = this.instances[childIndex];
    const emitters = property(options, 'emitters');
    if (emitters) {
      this.advanced = true;
      // instance() appends descendants too, so capture the new root by prefix
      // rather than assuming the last appended instance belongs to this node.
      if (!childInstance) fail(options, '无法解析原生子组件事件接收者');
      for (const emitter of object(emitters, 'emitters').properties) {
        if (!ts.isPropertyAssignment(emitter))
          fail(emitter, 'emitters 只支持静态事件名');
        childInstance.runtime.emitters[name(emitter.name)] =
          this.runtimeEmitter(emitter.initializer, instance);
      }
    }
    return child;
  }
  private initialProp(binding: PropBinding): InstanceFieldValue {
    if (binding.kind === 'literal') return binding.value;
    if (binding.kind === 'expression') return binding.initial;
    return this.initialValues.get(binding.key);
  }
  private propExpression(
    binding: PropBinding,
    node: ts.Node
  ): NativeExpression {
    if (binding.kind === 'state') return binding;
    if (binding.kind === 'expression') return binding.value;
    return this.dataExpression(binding.value, node);
  }
  private restoreStaticText(node: NativeNode): void {
    if (node.kind === 'container') {
      for (const child of node.children) this.restoreStaticText(child);
      return;
    }
    const restore = (value: NativeExpression): NativeTextPart => {
      if (value.kind === 'state') return value;
      if (value.kind === 'literal')
        return { kind: 'literal', value: String(value.value) };
      if (value.kind === 'undefined')
        return fail(
          this.instances[0].reference.declaration,
          '原生值只支持字符串、布尔值或有限数字'
        );
      if (value.kind === 'prop') {
        const instance = this.instances.find(
          (item) => item.prefix === value.instance
        )!;
        const binding = instance.props.get(value.key);
        return restore(
          binding
            ? this.propExpression(binding, instance.reference.declaration)
            : { kind: 'undefined' }
        );
      }
      return fail(
        this.instances[0].reference.declaration,
        '动态原生表达式需要组件运行时'
      );
    };
    node.parts = node.parts.map((part) =>
      part.kind === 'expression' ? restore(part.value) : part
    );
  }
  private isRuntimeProp(binding: PropBinding): boolean {
    const value = this.initialProp(binding);
    return (
      value === undefined ||
      value === null ||
      typeof value === 'object' ||
      typeof value === 'string' ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    );
  }
  private assertRuntimeProp(
    instance: Instance,
    key: string,
    node: ts.Node
  ): void {
    instance.runtimePropKeys.add(key);
    const binding = instance.props.get(key);
    if (binding && !this.isRuntimeProp(binding))
      fail(
        node,
        '原生运行时 props 只支持普通对象、数组、标量、null 或 undefined'
      );
  }
  private compileRuntimeMembers(instance: Instance): void {
    const effective = new Map(
      this.index
        .members(instance.reference)
        .filter((item) => item.declaration.name)
        .map((item) => [name(item.declaration.name!), item])
    );
    for (const owner of this.index.hierarchy(instance.reference)) {
      for (const declaration of owner.declaration.members) {
        if (!ts.isMethodDeclaration(declaration) || !declaration.body) continue;
        const key = name(declaration.name);
        if (effective.get(key)?.declaration !== declaration) continue;
        const spec = readMethodDecorators(
          this.index,
          owner.source,
          declaration
        );
        if (spec?.emit || spec?.watchProps)
          this.ensureRuntimeMethod(instance, effective.get(key)!);
        if (spec?.watchProps) {
          this.assertRuntimeProp(instance, spec.watchProps.key, declaration);
          instance.runtime.watchers.push({
            key: spec.watchProps.key,
            method: key,
            immediate: spec.watchProps.immediate,
          });
        }
      }
    }
    for (const hook of [
      'beforeMount',
      'onMounted',
      'beforeUnmount',
      'onUnmounted',
    ] as const) {
      const member = this.member(instance.reference, hook);
      if (
        member &&
        ts.isMethodDeclaration(member.declaration) &&
        member.declaration.body?.statements.length
      ) {
        instance.runtime[hook] = hook;
        this.ensureRuntimeMethod(instance, member);
      }
    }
    for (const [key, binding] of instance.props)
      if (
        this.isRuntimeProp(binding) &&
        (typeof this.initialProp(binding) !== 'object' ||
          this.initialProp(binding) === null ||
          instance.runtimePropKeys.has(key))
      )
        instance.runtime.props[key] = this.propExpression(
          binding,
          instance.reference.declaration
        );
  }
  private runtimeClick(
    listeners: ts.Expression | undefined,
    instance: Instance
  ): NativeAction {
    const options = object(listeners, 'button listeners.click');
    for (const property of options.properties)
      if (ts.isSpreadAssignment(property) || name(property.name) !== 'click')
        fail(property, '只支持 listeners.click');
    const handler = property(options, 'click');
    if (!handler) fail(options, 'button 缺少 click');
    const target = this.runtimeEmitter(handler, instance);
    return {
      kind: 'invoke',
      instance: target.instance,
      method: target.method,
      args: [],
    };
  }
  private runtimeEmitter(
    expression: ts.Expression,
    instance: Instance
  ): { instance: string; method: string } {
    const handler = unwrap(expression);
    if (
      ts.isPropertyAccessExpression(handler) &&
      handler.expression.kind === ts.SyntaxKind.ThisKeyword
    ) {
      const member = this.member(instance.reference, handler.name.text);
      if (!member) fail(handler, '原生事件方法不存在');
      this.ensureRuntimeMethod(instance, member);
      return { instance: instance.prefix, method: handler.name.text };
    }
    if (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler))
      fail(handler, '原生事件只支持实例方法或静态函数');
    if (
      handler.modifiers?.some(
        (item) => item.kind === ts.SyntaxKind.AsyncKeyword
      ) ||
      handler.asteriskToken
    )
      fail(handler, '原生事件仅支持同步函数');
    const params = this.runtimeParameters(handler.parameters, '原生事件');
    let key: string;
    do {
      key = `@event_${this.nextSynthetic++}`;
    } while (
      this.member(instance.reference, key) ||
      instance.runtime.methods[key]
    );
    const locals = new Set(params);
    const member: OwnedMember = {
      owner: instance.reference,
      declaration: handler as unknown as ts.ClassElement,
    };
    const body = ts.isBlock(handler.body)
      ? this.runtimeStatements(
          handler.body.statements,
          instance,
          member,
          locals
        )
      : [
          {
            kind: 'return' as const,
            value: this.runtimeExpression(
              handler.body,
              instance,
              member,
              locals
            ),
          },
        ];
    instance.runtime.methods[key] = { params, body };
    return { instance: instance.prefix, method: key };
  }
  private runtimeParameters(
    parameters: readonly ts.ParameterDeclaration[],
    label: string
  ): string[] {
    return parameters
      .filter(
        (parameter, index) =>
          !(
            index === 0 &&
            ts.isIdentifier(parameter.name) &&
            parameter.name.text === 'this'
          )
      )
      .map((parameter) => {
        if (
          !ts.isIdentifier(parameter.name) ||
          parameter.dotDotDotToken ||
          parameter.initializer
        )
          fail(parameter, `${label}参数只支持普通标识符`);
        return parameter.name.text;
      });
  }
  private ensureRuntimeMethod(
    instance: Instance,
    member: OwnedMember,
    key = name(member.declaration.name!),
    decorate = true
  ): string {
    const identity = `${instance.prefix}:${key}`;
    if (this.compilingMethods.has(identity))
      fail(member.declaration, '原生方法调用循环');
    if (instance.runtime.methods[key]) return key;
    const declaration = member.declaration;
    if (
      !ts.isMethodDeclaration(declaration) ||
      !declaration.body ||
      declaration.asteriskToken ||
      declaration.modifiers?.some(
        (item) => item.kind === ts.SyntaxKind.AsyncKeyword
      )
    )
      fail(declaration, '原生动作只支持同步普通方法');
    const params = this.runtimeParameters(declaration.parameters, '原生动作');
    this.compilingMethods.add(identity);
    try {
      const method: NativeMethod = {
        params,
        body: this.runtimeStatements(
          declaration.body.statements,
          instance,
          member,
          new Set(params)
        ),
      };
      const spec = decorate
        ? readMethodDecorators(this.index, member.owner.source, declaration)
        : undefined;
      if (spec?.emit) method.emit = spec.emit.eventName;
      instance.runtime.methods[key] = method;
      return key;
    } finally {
      this.compilingMethods.delete(identity);
    }
  }
  private runtimeStateKey(
    expression: ts.Expression,
    instance: Instance,
    write = false
  ): string | undefined {
    const node = unwrap(expression);
    if (
      (ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node)) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
      node.expression.name.text === 'state'
    ) {
      const property = ts.isPropertyAccessExpression(node)
        ? node.name.text
        : instance.fields.evaluate(node.argumentExpression);
      if (typeof property !== 'string' && typeof property !== 'number')
        fail(node, '原生 state 键只支持静态字符串或数字');
      const key = instance.state.get(String(property));
      if (!key) fail(node, '动作引用未声明 state');
      if (write && instance.propsStateRoot)
        fail(
          node,
          'props 对象与 state 根共享时不支持原生状态写入；请在 initState 中展开复制'
        );
      return key;
    }
    const alias = this.stateAliasKey(node, instance);
    if (write && alias && instance.propsStateRoot)
      fail(
        node,
        'props 对象与 state 根共享时不支持原生状态写入；请在 initState 中展开复制'
      );
    return alias;
  }
  private runtimeExpression(
    expression: ts.Expression,
    instance: Instance,
    owner: OwnedMember,
    locals: Set<string>
  ): NativeExpression {
    const node = unwrap(expression);
    const state = this.runtimeStateKey(node, instance);
    if (state) return { kind: 'state', key: state };
    if (ts.isIdentifier(node)) {
      if (locals.has(node.text)) return { kind: 'local', name: node.text };
      if (node.text === 'undefined') return { kind: 'undefined' };
    }
    if (node.kind === ts.SyntaxKind.NullKeyword)
      return { kind: 'literal', value: null };
    if (ts.isObjectLiteralExpression(node)) {
      return {
        kind: 'object',
        entries: node.properties.map((entry) => {
          if (ts.isSpreadAssignment(entry))
            return {
              spread: true,
              value: this.runtimeExpression(
                entry.expression,
                instance,
                owner,
                locals
              ),
            };
          if (
            !ts.isPropertyAssignment(entry) &&
            !ts.isShorthandPropertyAssignment(entry)
          )
            fail(entry, '原生对象只支持数据属性，不支持函数、方法或 getter');
          if (
            !ts.isComputedPropertyName(entry.name) &&
            name(entry.name) === '__proto__'
          )
            fail(entry, '原生对象不支持原型属性');
          const key = ts.isComputedPropertyName(entry.name)
            ? {
                kind: 'unary' as const,
                operator: 'String',
                value: this.runtimeExpression(
                  entry.name.expression,
                  instance,
                  owner,
                  locals
                ),
              }
            : { kind: 'literal' as const, value: name(entry.name) };
          return {
            key,
            value: this.runtimeExpression(
              ts.isShorthandPropertyAssignment(entry)
                ? entry.name
                : entry.initializer,
              instance,
              owner,
              locals
            ),
          };
        }),
      };
    }
    if (ts.isArrayLiteralExpression(node)) {
      return {
        kind: 'array',
        items: node.elements.map((item) =>
          ts.isOmittedExpression(item)
            ? { hole: true }
            : {
                value: this.runtimeExpression(
                  ts.isSpreadElement(item) ? item.expression : item,
                  instance,
                  owner,
                  locals
                ),
                ...(ts.isSpreadElement(item) ? { spread: true } : {}),
              }
        ),
      };
    }
    if (
      (ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node)) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
      node.expression.name.text === 'props'
    ) {
      const key = ts.isPropertyAccessExpression(node)
        ? node.name.text
        : instance.fields.evaluate(node.argumentExpression);
      if (typeof key !== 'string' && typeof key !== 'number')
        fail(node, '原生 props 键只支持静态字符串或数字');
      this.assertRuntimeProp(instance, String(key), node);
      return { kind: 'prop', instance: instance.prefix, key: String(key) };
    }
    if (
      (ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node)) &&
      node.expression.kind !== ts.SyntaxKind.ThisKeyword
    ) {
      if (
        ts.isOptionalChain(node) &&
        !node.questionDotToken &&
        ts.isOptionalChain(node.expression)
      )
        fail(node, '原生连续可选链需要在每一级显式使用 ?.');
      // Namespace constants are resolved by the shared pure evaluator, whereas
      // value properties preserve their runtime identity and read current data.
      const declaration = this.index.symbolAt(node)?.valueDeclaration;
      if (!declaration || !ts.isVariableDeclaration(declaration))
        return {
          kind: 'member',
          target: this.runtimeExpression(
            node.expression,
            instance,
            owner,
            locals
          ),
          key: ts.isPropertyAccessExpression(node)
            ? { kind: 'literal', value: node.name.text }
            : this.runtimeExpression(
                node.argumentExpression,
                instance,
                owner,
                locals
              ),
          ...(node.questionDotToken ? { optional: true } : {}),
        };
    }
    if (ts.isBinaryExpression(node)) {
      const operators: Partial<Record<ts.SyntaxKind, string>> = {
        [ts.SyntaxKind.PlusToken]: '+',
        [ts.SyntaxKind.MinusToken]: '-',
        [ts.SyntaxKind.AsteriskToken]: '*',
        [ts.SyntaxKind.SlashToken]: '/',
        [ts.SyntaxKind.PercentToken]: '%',
        [ts.SyntaxKind.EqualsEqualsEqualsToken]: '===',
        [ts.SyntaxKind.ExclamationEqualsEqualsToken]: '!==',
        [ts.SyntaxKind.EqualsEqualsToken]: '==',
        [ts.SyntaxKind.ExclamationEqualsToken]: '!=',
        [ts.SyntaxKind.LessThanToken]: '<',
        [ts.SyntaxKind.LessThanEqualsToken]: '<=',
        [ts.SyntaxKind.GreaterThanToken]: '>',
        [ts.SyntaxKind.GreaterThanEqualsToken]: '>=',
        [ts.SyntaxKind.AmpersandAmpersandToken]: '&&',
        [ts.SyntaxKind.BarBarToken]: '||',
        [ts.SyntaxKind.QuestionQuestionToken]: '??',
      };
      const operator = operators[node.operatorToken.kind];
      if (!operator) fail(node, '原生值表达式不支持赋值或此运算符');
      return {
        kind: 'binary',
        operator,
        left: this.runtimeExpression(node.left, instance, owner, locals),
        right: this.runtimeExpression(node.right, instance, owner, locals),
      };
    }
    if (
      ts.isPrefixUnaryExpression(node) &&
      [
        ts.SyntaxKind.PlusToken,
        ts.SyntaxKind.MinusToken,
        ts.SyntaxKind.ExclamationToken,
      ].includes(node.operator)
    )
      return {
        kind: 'unary',
        operator: ts.tokenToString(node.operator)!,
        value: this.runtimeExpression(node.operand, instance, owner, locals),
      };
    if (ts.isConditionalExpression(node))
      return {
        kind: 'conditional',
        condition: this.runtimeExpression(
          node.condition,
          instance,
          owner,
          locals
        ),
        whenTrue: this.runtimeExpression(
          node.whenTrue,
          instance,
          owner,
          locals
        ),
        whenFalse: this.runtimeExpression(
          node.whenFalse,
          instance,
          owner,
          locals
        ),
      };
    if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression) &&
        ['String', 'Number', 'Boolean'].includes(node.expression.text) &&
        node.arguments.length === 1
      ) {
        if (!this.builtin(node.expression))
          fail(
            node.expression,
            '原生转换只支持未被覆盖的内置 String/Number/Boolean'
          );
        return {
          kind: 'unary',
          operator: node.expression.text,
          value: this.runtimeExpression(
            node.arguments[0],
            instance,
            owner,
            locals
          ),
        };
      }
      if (ts.isPropertyAccessExpression(node.expression)) {
        const target = node.expression;
        let member: OwnedMember | undefined;
        let key = target.name.text;
        if (target.expression.kind === ts.SyntaxKind.ThisKeyword)
          member = this.member(instance.reference, key);
        else if (target.expression.kind === ts.SyntaxKind.SuperKeyword) {
          member = this.parent(owner, key);
          const identity = `${instance.prefix}:${member.owner.id}:${key}`;
          let alias = this.superAliases.get(identity);
          if (!alias) {
            do {
              alias = `@super_${this.nextSynthetic++}`;
            } while (
              this.member(instance.reference, alias) ||
              instance.runtime.methods[alias]
            );
            this.superAliases.set(identity, alias);
          }
          key = alias;
        }
        if (member) {
          this.ensureRuntimeMethod(
            instance,
            member,
            key,
            target.expression.kind !== ts.SyntaxKind.SuperKeyword
          );
          return {
            kind: 'call',
            instance: instance.prefix,
            method: key,
            args: node.arguments.map((argument) =>
              this.runtimeExpression(argument, instance, owner, locals)
            ),
          };
        }
      }
      fail(node, '原生表达式只支持同步实例方法和 String/Number/Boolean 转换');
    }
    if (
      this.readsField(node, instance) ||
      ts.isIdentifier(node) ||
      ts.isPropertyAccessExpression(node)
    ) {
      this.rejectDynamicPropsRead(node, instance);
      this.rejectStateAliasRead(node, instance);
      return this.dataExpression(instance.fields.evaluate(node), node);
    }
    return { kind: 'literal', value: this.literal(node, instance) };
  }
  private builtin(identifier: ts.Identifier): boolean {
    const symbol = this.index.symbolAt(identifier, identifier.getSourceFile());
    // Interfaces may augment a global's type (for example Bun extends Error),
    // but only the value declaration determines the constructor being called.
    const declaration = symbol?.valueDeclaration;
    if (!declaration || !ts.isVariableDeclaration(declaration)) return false;
    const source = declaration.getSourceFile();
    return (
      source.isDeclarationFile &&
      /(?:^|\/)typescript\/lib\/lib\.[\w.]+\.d\.ts$/.test(
        source.fileName.replace(/\\/g, '/')
      )
    );
  }
  private runtimeMemberWrite(
    target: ts.Expression,
    value: NativeExpression,
    operator: string | undefined,
    instance: Instance,
    owner: OwnedMember,
    locals: Set<string>,
    numeric = false
  ): NativeInstruction[] | undefined {
    const node = unwrap(target);
    if (
      !ts.isPropertyAccessExpression(node) &&
      !ts.isElementAccessExpression(node)
    )
      return undefined;
    if (node.questionDotToken) fail(node, '可选链不能作为原生赋值目标');
    const base = `@target_${this.nextSynthetic++}`;
    const key = `@key_${this.nextSynthetic++}`;
    const targetValue: NativeExpression = { kind: 'local', name: base };
    const keyValue: NativeExpression = { kind: 'local', name: key };
    const previous: NativeExpression = {
      kind: 'member',
      target: targetValue,
      key: keyValue,
    };
    return [
      {
        kind: 'local',
        name: base,
        value: this.runtimeExpression(node.expression, instance, owner, locals),
      },
      {
        kind: 'local',
        name: key,
        value: ts.isPropertyAccessExpression(node)
          ? { kind: 'literal', value: node.name.text }
          : {
              kind: 'unary',
              operator: 'String',
              value: this.runtimeExpression(
                node.argumentExpression,
                instance,
                owner,
                locals
              ),
            },
      },
      {
        kind: 'set-member',
        target: targetValue,
        key: keyValue,
        value: operator
          ? {
              kind: 'binary',
              operator,
              left: numeric
                ? { kind: 'unary', operator: 'Number', value: previous }
                : previous,
              right: value,
            }
          : value,
      },
    ];
  }
  private runtimeStatements(
    statements: readonly ts.Statement[],
    instance: Instance,
    owner: OwnedMember,
    locals: Set<string>
  ): NativeInstruction[] {
    const result: NativeInstruction[] = [];
    for (const statement of statements) {
      if (ts.isReturnStatement(statement)) {
        const expression = statement.expression && unwrap(statement.expression);
        if (expression && ts.isVoidExpression(expression)) {
          result.push(
            ...this.runtimeStatements(
              [ts.factory.createExpressionStatement(expression.expression)],
              instance,
              owner,
              locals
            ),
            { kind: 'return' }
          );
          continue;
        }
        if (
          expression &&
          ts.isCallExpression(expression) &&
          ts.isPropertyAccessExpression(expression.expression) &&
          expression.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
          ['setProps', 'setState', 'emit'].includes(
            expression.expression.name.text
          )
        ) {
          result.push(
            ...this.runtimeStatements(
              [ts.factory.createExpressionStatement(expression)],
              instance,
              owner,
              locals
            ),
            { kind: 'return' }
          );
        } else
          result.push({
            kind: 'return',
            ...(statement.expression
              ? {
                  value: this.runtimeExpression(
                    statement.expression,
                    instance,
                    owner,
                    locals
                  ),
                }
              : {}),
          });
        continue;
      }
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (
            !ts.isIdentifier(declaration.name) ||
            locals.has(declaration.name.text)
          )
            fail(declaration, '原生局部变量只支持不重名标识符');
          const value = declaration.initializer
            ? this.runtimeExpression(
                declaration.initializer,
                instance,
                owner,
                locals
              )
            : { kind: 'undefined' as const };
          locals.add(declaration.name.text);
          result.push({ kind: 'local', name: declaration.name.text, value });
        }
        continue;
      }
      if (ts.isBlock(statement)) {
        result.push(
          ...this.runtimeStatements(
            statement.statements,
            instance,
            owner,
            locals
          )
        );
        continue;
      }
      if (ts.isIfStatement(statement)) {
        const branch = (node: ts.Statement | undefined) =>
          node
            ? this.runtimeStatements(
                ts.isBlock(node) ? node.statements : [node],
                instance,
                owner,
                new Set(locals)
              )
            : [];
        result.push({
          kind: 'if',
          condition: this.runtimeExpression(
            statement.expression,
            instance,
            owner,
            locals
          ),
          then: branch(statement.thenStatement),
          otherwise: branch(statement.elseStatement),
        });
        continue;
      }
      if (ts.isThrowStatement(statement)) {
        const value = unwrap(statement.expression);
        if (
          !ts.isNewExpression(value) ||
          !ts.isIdentifier(value.expression) ||
          value.expression.text !== 'Error' ||
          !this.builtin(value.expression) ||
          value.typeArguments?.length ||
          (value.arguments?.length ?? 0) > 1
        )
          fail(
            statement,
            '原生 throw 只支持内置 new Error(message)，不支持任意抛出值'
          );
        const argument = value.arguments?.[0];
        if (!argument)
          result.push({
            kind: 'throw',
            message: { kind: 'literal', value: '' },
          });
        else {
          // Error(undefined) has an empty message. Evaluate side effects once
          // before applying that conversion, just like the constructor does.
          const local = `@error_${this.nextSynthetic++}`;
          result.push({
            kind: 'local',
            name: local,
            value: this.runtimeExpression(argument, instance, owner, locals),
          });
          result.push({
            kind: 'throw',
            message: {
              kind: 'conditional',
              condition: {
                kind: 'binary',
                operator: '===',
                left: { kind: 'local', name: local },
                right: { kind: 'undefined' },
              },
              whenTrue: { kind: 'literal', value: '' },
              whenFalse: {
                kind: 'unary',
                operator: 'String',
                value: { kind: 'local', name: local },
              },
            },
          });
        }
        continue;
      }
      if (!ts.isExpressionStatement(statement))
        fail(statement, '方法不支持原生编译');
      const expression = unwrap(statement.expression);
      if (ts.isBinaryExpression(expression)) {
        const key = this.runtimeStateKey(expression.left, instance, true);
        if (key) {
          const value = this.runtimeExpression(
            expression.right,
            instance,
            owner,
            locals
          );
          const operator = expression.operatorToken.kind;
          if (operator === ts.SyntaxKind.EqualsToken)
            result.push({ kind: 'assign', key, value });
          else if (
            [
              ts.SyntaxKind.PlusEqualsToken,
              ts.SyntaxKind.MinusEqualsToken,
              ts.SyntaxKind.AsteriskEqualsToken,
              ts.SyntaxKind.SlashEqualsToken,
            ].includes(operator)
          )
            result.push({
              kind: 'assign',
              key,
              value: {
                kind: 'binary',
                operator: ts.tokenToString(operator)!.slice(0, -1),
                left: { kind: 'state', key },
                right: value,
              },
            });
          else fail(expression, '原生状态不支持此赋值运算符');
          continue;
        }
        const operator = expression.operatorToken.kind;
        const assignments: Partial<Record<ts.SyntaxKind, string>> = {
          [ts.SyntaxKind.PlusEqualsToken]: '+',
          [ts.SyntaxKind.MinusEqualsToken]: '-',
          [ts.SyntaxKind.AsteriskEqualsToken]: '*',
          [ts.SyntaxKind.SlashEqualsToken]: '/',
          [ts.SyntaxKind.PercentEqualsToken]: '%',
          [ts.SyntaxKind.AmpersandAmpersandEqualsToken]: '&&',
          [ts.SyntaxKind.BarBarEqualsToken]: '||',
          [ts.SyntaxKind.QuestionQuestionEqualsToken]: '??',
        };
        if (operator === ts.SyntaxKind.EqualsToken || assignments[operator]) {
          const value = this.runtimeExpression(
            expression.right,
            instance,
            owner,
            locals
          );
          const update = this.runtimeMemberWrite(
            expression.left,
            value,
            assignments[operator],
            instance,
            owner,
            locals
          );
          if (update) {
            result.push(...update);
            continue;
          }
          if (
            ts.isIdentifier(expression.left) &&
            locals.has(expression.left.text)
          ) {
            result.push({
              kind: 'local',
              name: expression.left.text,
              value: assignments[operator]
                ? {
                    kind: 'binary',
                    operator: assignments[operator]!,
                    left: { kind: 'local', name: expression.left.text },
                    right: value,
                  }
                : value,
            });
            continue;
          }
        }
      }
      if (
        (ts.isPrefixUnaryExpression(expression) ||
          ts.isPostfixUnaryExpression(expression)) &&
        [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(
          expression.operator
        )
      ) {
        const key = this.runtimeStateKey(expression.operand, instance, true);
        if (!key) {
          const update = this.runtimeMemberWrite(
            expression.operand,
            { kind: 'literal', value: 1 },
            expression.operator === ts.SyntaxKind.PlusPlusToken ? '+' : '-',
            instance,
            owner,
            locals,
            true
          );
          if (update) {
            result.push(...update);
            continue;
          }
          fail(expression, '原生增减只支持 state 或对象属性');
        }
        result.push({
          kind: 'assign',
          key,
          value: {
            kind: 'binary',
            operator:
              expression.operator === ts.SyntaxKind.PlusPlusToken ? '+' : '-',
            left: {
              kind: 'unary',
              operator: 'Number',
              value: { kind: 'state', key },
            },
            right: { kind: 'literal', value: 1 },
          },
        });
        continue;
      }
      if (
        ts.isCallExpression(expression) &&
        ts.isPropertyAccessExpression(expression.expression) &&
        expression.expression.expression.kind === ts.SyntaxKind.ThisKeyword
      ) {
        const key = expression.expression.name.text;
        if (key === 'setState' || key === 'setProps') {
          if (key === 'setState' && instance.propsStateRoot)
            fail(
              expression,
              'props 对象与 state 根共享时不支持原生状态写入；请在 initState 中展开复制'
            );
          if (expression.arguments.length !== 1)
            fail(expression, `${key} 需要一个静态对象参数`);
          const values: Record<string, NativeExpression> = Object.create(null);
          const ordered: Array<[string, NativeExpression]> = [];
          for (const entry of object(expression.arguments[0], key).properties) {
            if (
              !ts.isPropertyAssignment(entry) &&
              !ts.isShorthandPropertyAssignment(entry)
            )
              fail(entry, `${key} 只支持静态属性`);
            const propertyKey = name(entry.name);
            if (
              propertyKey === '__proto__' ||
              propertyKey.startsWith('__transone_')
            )
              fail(entry, `${key} 不支持框架保留属性`);
            if (Object.prototype.hasOwnProperty.call(values, propertyKey))
              fail(
                entry,
                `${key} 不支持重复属性 ${propertyKey}，以免丢失初始化表达式的副作用`
              );
            values[propertyKey] = this.runtimeExpression(
              ts.isPropertyAssignment(entry) ? entry.initializer : entry.name,
              instance,
              owner,
              locals
            );
            ordered.push([propertyKey, values[propertyKey]]);
          }
          if (key === 'setProps') {
            const packet: Record<string, NativeExpression> =
              Object.create(null);
            for (const [propertyKey, value] of ordered) {
              const local = `@props_${this.nextSynthetic++}`;
              result.push({ kind: 'local', name: local, value });
              packet[propertyKey] = { kind: 'local', name: local };
            }
            result.push({
              kind: 'set-props',
              instance: instance.prefix,
              values: packet,
            });
          } else {
            const temporary: Record<string, string> = Object.create(null);
            for (const [propertyKey, value] of ordered) {
              const local = `@state_${this.nextSynthetic++}`;
              temporary[propertyKey] = local;
              result.push({ kind: 'local', name: local, value });
            }
            for (const [propertyKey, local] of Object.entries(temporary)) {
              const scoped = instance.state.get(propertyKey);
              if (!scoped)
                fail(expression, `动作引用未声明 state.${propertyKey}`);
              result.push({
                kind: 'assign',
                key: scoped,
                value: { kind: 'local', name: local },
              });
            }
          }
          continue;
        }
        if (key === 'emit') {
          if (!expression.arguments.length)
            fail(expression, 'emit 需要静态事件名');
          const event = this.literal(expression.arguments[0], instance);
          if (typeof event !== 'string')
            fail(expression, 'emit 需要静态事件名');
          result.push({
            kind: 'emit',
            instance: instance.prefix,
            event,
            args: expression.arguments
              .slice(1)
              .map((argument) =>
                this.runtimeExpression(argument, instance, owner, locals)
              ),
          });
          continue;
        }
      }
      result.push({
        kind: 'expression',
        value: this.runtimeExpression(expression, instance, owner, locals),
      });
    }
    return result;
  }
  private click(
    listeners: ts.Expression | undefined,
    instance: Instance
  ): NativeAction {
    const options = object(listeners, 'button listeners.click');
    for (const p of options.properties)
      if (ts.isSpreadAssignment(p) || name(p.name) !== 'click')
        fail(p, '只支持 listeners.click');
    const handler = property(options, 'click');
    if (!handler || !ts.isArrowFunction(handler) || handler.parameters.length)
      fail(options, 'click 只支持 () => this.method()');
    const body = handler.body;
    const call =
      ts.isBlock(body) &&
      body.statements.length === 1 &&
      ts.isExpressionStatement(body.statements[0])
        ? body.statements[0].expression
        : body;
    if (
      !ts.isCallExpression(call) ||
      !ts.isPropertyAccessExpression(call.expression) ||
      call.expression.expression.kind !== ts.SyntaxKind.ThisKeyword ||
      call.arguments.length
    )
      fail(handler, 'click 只支持调用 this.method()');
    const member = this.member(instance.reference, call.expression.name.text);
    if (!member) fail(call, 'click 方法不存在');
    return this.action(member, instance, new Set());
  }
  private action(
    member: OwnedMember,
    instance: Instance,
    active: Set<ts.Node>
  ): NativeAction {
    if (active.has(member.declaration))
      fail(member.declaration, '原生方法调用循环');
    const declaration = member.declaration;
    if (
      !ts.isMethodDeclaration(declaration) ||
      !declaration.body ||
      declaration.parameters.length ||
      declaration.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
    )
      fail(declaration, '原生动作只支持同步无参数方法');
    const next = new Set([...active, declaration]);
    const actions: NativeAction[] = [];
    for (const statement of declaration.body.statements) {
      if (!ts.isExpressionStatement(statement))
        fail(statement, '方法不支持原生编译');
      const expression = unwrap(statement.expression);
      if (
        ts.isCallExpression(expression) &&
        ts.isPropertyAccessExpression(expression.expression) &&
        !expression.arguments.length
      ) {
        const target = expression.expression;
        let called: OwnedMember | undefined;
        if (target.expression.kind === ts.SyntaxKind.SuperKeyword)
          called = this.parent(member, target.name.text);
        else if (target.expression.kind === ts.SyntaxKind.ThisKeyword)
          called = this.member(instance.reference, target.name.text);
        if (!called) fail(expression, '方法不支持原生编译');
        actions.push(this.action(called, instance, next));
        continue;
      }
      if (
        ts.isBinaryExpression(expression) &&
        ts.isPropertyAccessExpression(expression.left) &&
        ts.isPropertyAccessExpression(expression.left.expression) &&
        expression.left.expression.expression.kind ===
          ts.SyntaxKind.ThisKeyword &&
        expression.left.expression.name.text === 'state'
      ) {
        const key = instance.state.get(expression.left.name.text);
        if (!key) fail(expression.left, '动作引用未声明 state');
        if (instance.propsStateRoot)
          fail(
            expression.left,
            'props 对象与 state 根共享时不支持原生状态写入；请在 initState 中展开复制'
          );
        const value = this.literal(expression.right, instance);
        const operator = expression.operatorToken.kind;
        const initial = this.state.find((s) => s.key === key)!.value;
        if (
          (operator === ts.SyntaxKind.PlusEqualsToken ||
            operator === ts.SyntaxKind.MinusEqualsToken) &&
          typeof value === 'number' &&
          typeof initial === 'number'
        )
          actions.push({
            kind: 'increment',
            key,
            by: operator === ts.SyntaxKind.MinusEqualsToken ? -value : value,
          });
        else if (
          operator === ts.SyntaxKind.EqualsToken &&
          typeof value === typeof initial
        )
          actions.push({ kind: 'set-literal', key, value });
        else fail(expression, '原生动作只支持同类型赋值或数值增减');
        continue;
      }
      fail(expression, '方法不支持原生编译');
    }
    if (!actions.length) fail(declaration, '原生动作不能为空');
    return actions.length === 1 ? actions[0] : { kind: 'sequence', actions };
  }
}
