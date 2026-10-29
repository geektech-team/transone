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
import type { ResolvedConfig } from '../types';
import { nativeError } from './errors';
import type {
  NativeAction,
  NativeNode,
  NativeScreen,
  NativeStateValue,
  NativeStyle,
  NativeTextPart,
} from './types';

type Binding =
  { kind: 'literal'; value: NativeStateValue } | { kind: 'state'; key: string };
type PropBinding =
  | { kind: 'literal'; value: InstanceFieldValue }
  | { kind: 'state'; key: string };
interface Instance {
  reference: ClassReference;
  prefix: string;
  state: Map<string, string>;
  props: Map<string, PropBinding>;
  fields: InstanceFieldPlan;
  stateRoot?: Record<string, InstanceFieldValue>;
  propsStateRoot?: boolean;
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
  private initialState(
    member: OwnedMember,
    instance: Instance,
    active = new Set<ts.Node>()
  ): Map<string, NativeStateValue> {
    if (active.has(member.declaration))
      fail(member.declaration, 'initState 循环');
    active.add(member.declaration);
    const expression = returnValue(member);
    const node = unwrap(expression);
    const values = new Map<string, NativeStateValue>();
    if (!ts.isObjectLiteralExpression(node)) {
      for (const [key, value] of Object.entries(
        this.fieldObject(expression, instance, 'initState()', true)
      ))
        values.set(key, this.nativeValue(value, expression));
      active.delete(member.declaration);
      return values;
    }
    const value = node;
    for (const p of value.properties) {
      if (ts.isSpreadAssignment(p)) {
        const call = unwrap(p.expression);
        if (
          ts.isCallExpression(call) &&
          ts.isPropertyAccessExpression(call.expression) &&
          call.expression.expression.kind === ts.SyntaxKind.SuperKeyword &&
          call.expression.name.text === 'initState' &&
          !call.arguments.length
        ) {
          for (const [key, value] of this.initialState(
            this.parent(member, 'initState'),
            instance,
            active
          ))
            values.set(key, value);
        } else {
          for (const [key, value] of Object.entries(
            this.fieldObject(p.expression, instance, 'state 展开', true)
          ))
            values.set(key, this.nativeValue(value, p.expression));
        }
      } else if (ts.isPropertyAssignment(p))
        values.set(
          name(p.name),
          this.literal(p.initializer, instance, new Set(), true)
        );
      else fail(p, 'state 必须使用静态属性');
    }
    active.delete(member.declaration);
    return values;
  }
  private instance(
    logical: ClassReference,
    props: Map<string, PropBinding>
  ): NativeNode {
    const reference = this.index.select(logical);
    if (this.stack.includes(reference.id))
      fail(reference.declaration, `静态组件组合循环: ${reference.className}`);
    this.stack.push(reference.id);
    this.validateInstance(reference);
    const initialProps: Record<string, InstanceFieldValue> = {};
    for (const [key, binding] of props) {
      if (binding.kind === 'literal') initialProps[key] = binding.value;
      else {
        const initial = this.state.find((entry) => entry.key === binding.key);
        if (!initial)
          fail(reference.declaration, `props.${key} 无法解析初始 state`);
        initialProps[key] = initial.value;
      }
    }
    const instance: Instance = {
      reference,
      prefix: `c${this.nextInstance++}_`,
      state: new Map(),
      props,
      fields: analyzeInstanceFields(
        this.index.hierarchy(reference),
        this.fieldOptions(initialProps)
      ),
    };
    const init = this.member(reference, 'initState');
    if (init) {
      for (const [key, value] of this.initialState(init, instance)) {
        const scoped = `${instance.prefix}s${instance.state.size}_${key.replace(/[^A-Za-z0-9_]/g, '_')}`;
        instance.state.set(key, scoped);
        this.state.push({ key: scoped, value });
      }
      const expression = returnValue(init);
      // Only the final returned root aliases state. A parent return copied by
      // a child object spread keeps its original fields independent of state.
      if (!ts.isObjectLiteralExpression(unwrap(expression))) {
        const stateRoot = this.fieldObject(
          expression,
          instance,
          'initState()',
          true
        );
        if (instance.fields.sharedObjects.has(stateRoot))
          fail(expression, '共享模块对象不能作为原生state根');
        instance.stateRoot = stateRoot;
        const includesRoot = (value: InstanceFieldValue): boolean =>
          value === stateRoot ||
          (!!value &&
            typeof value === 'object' &&
            Object.values(value).some(includesRoot));
        instance.propsStateRoot = includesRoot(initialProps);
      }
    }
    const styles = this.member(reference, 'initStyles');
    if (styles) this.validateStyles(styles);
    const render = this.member(reference, 'render');
    if (!render) fail(reference.declaration, '缺少 render()');
    const root = this.node(returnValue(render), instance, render);
    this.stack.pop();
    return root;
  }
  private validateInstance(reference: ClassReference): void {
    // Constructors execute for every ancestor, even if a child overrides the
    // corresponding member. Field initialization is checked by the shared plan.
    for (const owner of this.index.hierarchy(reference))
      for (const member of owner.declaration.members) {
        if (ts.isConstructorDeclaration(member))
          fail(member, '原生组件不支持自定义 constructor');
      }
    // Match the framework component lifecycle, including props updates and
    // error boundaries. Effective members preserve override and owner semantics;
    // empty hooks remain harmless, but lifecycle JavaScript has no native IR.
    for (const key of [
      'beforeMount',
      'onMounted',
      'beforeUpdate',
      'onUpdated',
      'onPropsChange',
      'beforeUnmount',
      'onUnmounted',
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
        return binding.kind === 'state'
          ? binding
          : { kind: 'literal', value: this.nativeValue(binding.value, node) };
      }
    }
    const aliasKey = this.stateAliasKey(node, instance);
    if (aliasKey) return { kind: 'state', key: aliasKey };
    return { kind: 'literal', value: this.literal(node, instance) };
  }
  private text(
    expression: ts.Expression,
    instance: Instance
  ): NativeTextPart[] {
    const value = this.binding(expression, instance);
    if (value.kind === 'state') return [value];
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
      else if (prop)
        result.push(
          prop.kind === 'state'
            ? prop
            : {
                kind: 'literal',
                value: String(this.nativeValue(prop.value, expression)),
              }
        );
      else fail(expression, `只支持已声明 state/props 的 {{key}} 绑定: ${key}`);
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
        if (value.expression.name.text === 'props')
          result.set(
            name(p.name),
            instance.props.get(value.name.text) ?? {
              kind: 'literal',
              value: undefined,
            }
          );
        else result.set(name(p.name), this.binding(value, instance));
      } else {
        this.rejectDynamicPropsRead(value, instance);
        this.rejectStateAliasRead(value, instance);
        result.set(name(p.name), {
          kind: 'literal',
          value: instance.fields.evaluate(value),
        });
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
      return this.instance(reference, this.props(node.arguments[1], instance));
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
    if (tagName === 'button')
      return {
        kind: 'button',
        parts,
        action: this.click(listeners, instance),
        ...(style ? { style } : {}),
      };
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
        !['component', 'props'].includes(name(p.name))
      )
        fail(p, '原生组件不支持 slots、emitters 或动态 options');
    const component = property(options, 'component');
    const reference =
      component && this.index.resolve(component, component.getSourceFile());
    if (!reference || !this.index.isComponent(reference))
      fail(options, 'createComponent 必须引用静态组件');
    return this.instance(
      reference,
      this.props(property(options, 'props'), instance)
    );
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
