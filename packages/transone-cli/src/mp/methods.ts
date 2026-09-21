import type * as tsTypes from 'typescript';
import { foldExpression, FoldedValue, isThisExpression } from './fold';
import { mpError } from './errors';
import { ClassSource, CompileContext, FunctionEntry, UnitKind } from './types';

const PAGE_LIFECYCLE: Record<string, string> = {
  beforeMount: 'onLoad',
  onLoad: 'onLoad',
  onMounted: 'onReady',
  onUnmounted: 'onUnload',
  // 小程序页面独有生命周期：同名方法直接映射（下拉刷新/触底加载/分享等）
  onShow: 'onShow',
  onHide: 'onHide',
  onPullDownRefresh: 'onPullDownRefresh',
  onReachBottom: 'onReachBottom',
  onShareAppMessage: 'onShareAppMessage',
  onPageScroll: 'onPageScroll',
  onResize: 'onResize',
};

const COMPONENT_LIFECYCLE: Record<string, string> = {
  beforeMount: 'created',
  onMounted: 'attached',
  onUnmounted: 'detached',
};

export interface CompiledMethods {
  methods: FunctionEntry[];
  lifecycle: FunctionEntry[];
}

/**
 * 编译事件方法与小程序的 data 语义桥：
 * - this.state.x -> this.data.x
 * - this.setState(obj) -> this.setData(obj)
 * - this.state.a.b = expr / += -> this.setData({ 'a.b': expr })
 * - 组件内 this.emit('name', args) -> this.triggerEvent('name', { args })
 * - 方法体中的模块常量原地折叠为字面量
 */
export function compileMethods(
  context: CompileContext,
  classSource: ClassSource,
  usedNames: Set<string>,
  kind: UnitKind,
  customEvents: Set<string>
): CompiledMethods {
  const { ts } = context;
  const methods = new Map<string, tsTypes.MethodDeclaration>();
  for (const member of classSource.declaration.members) {
    if (
      ts.isMethodDeclaration(member) &&
      ts.isIdentifier(member.name) &&
      !isStatic(ts, member)
    ) {
      methods.set(member.name.text, member);
    }
  }

  const lifecycleMap = kind === 'page' ? PAGE_LIFECYCLE : COMPONENT_LIFECYCLE;
  const seed = new Set(usedNames);
  for (const hook of Object.keys(lifecycleMap)) {
    if (methods.has(hook)) {
      seed.add(hook);
    }
  }
  // props 变化观察钩子：组件类定义了 onPropsChange 时纳入编译，
  // jsgen 据此生成 observers（properties 变化触发），否则该钩子会被跳过。
  if (methods.has('onPropsChange')) {
    seed.add('onPropsChange');
  }

  const queue = [...seed];
  const visited = new Set<string>();
  const entries: FunctionEntry[] = [];
  const lifecycleEntries: FunctionEntry[] = [];
  const emittedKeys = new Set<string>();

  while (queue.length > 0) {
    const name = queue.shift()!;
    if (visited.has(name)) {
      continue;
    }
    visited.add(name);
    const declaration = methods.get(name);
    if (!declaration) {
      throw mpError(classSource.filePath, `未找到事件处理方法 "${name}"`);
    }

    const lifecycleKey = lifecycleMap[name];
    const key = lifecycleKey ?? name;
    if (emittedKeys.has(key)) {
      throw mpError(
        classSource.filePath,
        `方法名 "${key}" 与小程序生命周期钩子冲突`
      );
    }
    emittedKeys.add(key);

    const fn = compileMethod(
      context,
      classSource,
      declaration,
      kind,
      customEvents,
      queue
    );
    if (lifecycleKey) {
      lifecycleEntries.push({ key, fn });
    } else {
      entries.push({ key, fn });
    }
  }

  return { methods: entries, lifecycle: lifecycleEntries };
}

function compileMethod(
  context: CompileContext,
  classSource: ClassSource,
  declaration: tsTypes.MethodDeclaration,
  kind: UnitKind,
  customEvents: Set<string>,
  referencedMethods: string[]
): string {
  const { ts } = context;
  if (!declaration.body) {
    throw mpError(
      classSource.filePath,
      `方法 ${declaration.name.getText()} 缺少方法体`
    );
  }

  const params = declaration.parameters.map((parameter) =>
    ts.factory.createParameterDeclaration(
      undefined,
      parameter.dotDotDotToken,
      parameter.name,
      undefined,
      undefined,
      parameter.initializer
    )
  );
  const modifiers = isAsync(ts, declaration)
    ? [ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)]
    : undefined;

  const functionExpression = ts.factory.createFunctionExpression(
    modifiers,
    undefined,
    undefined,
    undefined,
    params,
    undefined,
    declaration.body
  );

  const consts = collectModuleConsts(context, classSource);
  const locals = new Set<string>();
  const transformerFactory: tsTypes.TransformerFactory<
    tsTypes.FunctionExpression
  > = (transformContext) => {
    return (root) =>
      visit(context, classSource, root, {
        transformContext,
        kind,
        customEvents,
        consts,
        locals,
        referencedMethods,
      }) as tsTypes.FunctionExpression;
  };
  const result = ts.transform(functionExpression, [transformerFactory]);
  const transformed = result.transformed[0] as tsTypes.FunctionExpression;
  result.dispose();

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const printed = printer.printNode(
    ts.EmitHint.Expression,
    transformed,
    classSource.source
  );
  // ts.transform 只运行自定义 transformer，不会做类型擦除；
  // 方法体源码里残留的 TS 类型注解 / as 断言必须经 transpileModule 移除，
  // 否则生成的小程序 JS 无法被解析。
  const transpiled = ts.transpileModule(printed, {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.None },
    reportDiagnostics: false,
  });
  return transpiled.outputText.trim();
}

interface VisitState {
  transformContext: tsTypes.TransformationContext;
  kind: UnitKind;
  customEvents: Set<string>;
  consts: Map<string, tsTypes.Expression>;
  locals: Set<string>;
  referencedMethods: string[];
}

function visit(
  context: CompileContext,
  classSource: ClassSource,
  node: tsTypes.Node,
  state: VisitState
): tsTypes.Node {
  const { ts } = context;

  if (ts.isFunctionLike(node)) {
    for (const parameter of node.parameters) {
      if (ts.isIdentifier(parameter.name)) {
        state.locals.add(parameter.name.text);
      }
    }
  }

  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    state.locals.add(node.name.text);
  }

  // 赋值：this.state.path = expr / += ... -> this.setData({ path: ... })
  if (
    ts.isBinaryExpression(node) &&
    isAssignmentOperator(ts, node.operatorToken.kind)
  ) {
    if (isWholeStateAssignment(ts, node.left)) {
      throw mpError(
        classSource.filePath,
        '不支持替换整个 this.state，请改用 this.setState({ ... })'
      );
    }
    const path = statePath(ts, node.left);
    if (path !== undefined) {
      const assignment = buildStateAssignment(ts, node, classSource.filePath);
      return ts.visitEachChild(
        assignment,
        (child) => visit(context, classSource, child, state),
        state.transformContext
      );
    }
  }

  // this.setState(obj) -> this.setData(obj)
  if (ts.isCallExpression(node) && isThisMemberCall(ts, node, 'setState')) {
    const call = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createThis(),
        'setData'
      ),
      undefined,
      node.arguments
    );
    return ts.visitEachChild(
      call,
      (child) => visit(context, classSource, child, state),
      state.transformContext
    );
  }

  // this.emit('name', args) -> this.triggerEvent('name', { args })
  if (ts.isCallExpression(node) && isThisMemberCall(ts, node, 'emit')) {
    if (state.kind !== 'component') {
      throw mpError(
        classSource.filePath,
        '页面组件不能使用 this.emit（组件间事件仅自定义组件支持）'
      );
    }
    const eventName = node.arguments[0];
    if (!ts.isStringLiteral(eventName)) {
      throw mpError(
        classSource.filePath,
        'this.emit 的事件名必须是字符串字面量'
      );
    }
    state.customEvents.add(eventName.text);
    const args = ts.factory.createArrayLiteralExpression(
      node.arguments.slice(1)
    );
    const payload = ts.factory.createObjectLiteralExpression([
      ts.factory.createPropertyAssignment('args', args),
    ]);
    const call = ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(
        ts.factory.createThis(),
        'triggerEvent'
      ),
      undefined,
      [eventName, payload]
    );
    return ts.visitEachChild(
      call,
      (child) => visit(context, classSource, child, state),
      state.transformContext
    );
  }

  // this.<method>(...) 调用收集（用于传递依赖；排除框架桥接方法）
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    isThisExpression(ts, node.expression.expression)
  ) {
    const methodName = node.expression.name.text;
    if (!BRIDGE_METHODS.has(methodName)) {
      state.referencedMethods.push(methodName);
    }
  }

  // this.state -> this.data；this.props -> this.properties
  if (
    ts.isPropertyAccessExpression(node) &&
    isThisExpression(ts, node.expression)
  ) {
    if (node.name.text === 'state') {
      return ts.factory.createPropertyAccessExpression(
        ts.factory.createThis(),
        'data'
      );
    }
    if (node.name.text === 'props') {
      if (state.kind !== 'component') {
        throw mpError(classSource.filePath, '页面组件不能访问 this.props');
      }
      return ts.factory.createPropertyAccessExpression(
        ts.factory.createThis(),
        'properties'
      );
    }
  }

  // 方法体中的模块常量折叠为字面量
  if (
    ts.isIdentifier(node) &&
    !state.locals.has(node.text) &&
    state.consts.has(node.text)
  ) {
    const folded = foldExpression(
      ts,
      state.consts.get(node.text)!,
      state.consts
    );
    if (folded === undefined) {
      throw mpError(
        classSource.filePath,
        `方法中引用了无法静态求值的模块常量 "${node.text}"`
      );
    }
    return valueToNode(ts, folded);
  }

  return ts.visitEachChild(
    node,
    (child) => visit(context, classSource, child, state),
    state.transformContext
  );
}

const BRIDGE_METHODS = new Set(['emit', 'setState', 'setData', 'triggerEvent']);

/**
 * 把 this.state.path 赋值表达式改写为 this.setData({ path: value })。
 * 返回的节点带原始子节点，由调用方在 transform 管线内统一转换。
 */
function buildStateAssignment(
  ts: typeof tsTypes,
  node: tsTypes.BinaryExpression,
  filePath: string
): tsTypes.Expression {
  const path = statePath(ts, node.left);
  if (path === undefined) {
    throw new Error('internal: state assignment without state path');
  }
  const operator = node.operatorToken.kind;
  const isCompound = operator !== ts.SyntaxKind.EqualsToken;

  let value: tsTypes.Expression;
  if (isCompound) {
    const operatorText = compoundOperatorText(ts, operator);
    if (!operatorText) {
      throw new Error(
        `不支持的复合赋值: ${node.operatorToken.getText()} (${filePath})`
      );
    }
    value = ts.factory.createBinaryExpression(
      node.left,
      operatorText as tsTypes.BinaryOperator,
      node.right
    );
  } else {
    value = node.right;
  }

  const key = ts.factory.createStringLiteral(path);
  const object = ts.factory.createObjectLiteralExpression([
    ts.factory.createPropertyAssignment(key, value),
  ]);
  return ts.factory.createCallExpression(
    ts.factory.createPropertyAccessExpression(
      ts.factory.createThis(),
      'setData'
    ),
    undefined,
    [object]
  );
}

/**
 * 提取 this.state 赋值路径：this.state.a.b[0].c -> "a.b[0].c"。
 * 非 this.state 赋值返回 undefined；不支持整体替换 this.state。
 */
function statePath(
  ts: typeof tsTypes,
  left: tsTypes.Expression
): string | undefined {
  const tokens: string[] = [];
  let current: tsTypes.Expression = left;
  for (;;) {
    if (ts.isPropertyAccessExpression(current)) {
      if (
        isThisExpression(ts, current.expression) &&
        current.name.text === 'state'
      ) {
        if (tokens.length === 0) {
          return undefined;
        }
        return tokens
          .reverse()
          .map((token) => (token.startsWith('[') ? token : `.${token}`))
          .join('')
          .slice(1);
      }
      tokens.push(current.name.text);
      current = current.expression;
      continue;
    }
    if (ts.isElementAccessExpression(current)) {
      const argument = current.argumentExpression;
      if (!ts.isStringLiteral(argument) && !ts.isNumericLiteral(argument)) {
        return undefined;
      }
      tokens.push(`[${argument.text}]`);
      current = current.expression;
      continue;
    }
    return undefined;
  }
}

function isAssignmentOperator(
  ts: typeof tsTypes,
  kind: tsTypes.SyntaxKind
): boolean {
  return (
    kind === ts.SyntaxKind.EqualsToken ||
    kind === ts.SyntaxKind.PlusEqualsToken ||
    kind === ts.SyntaxKind.MinusEqualsToken ||
    kind === ts.SyntaxKind.AsteriskEqualsToken ||
    kind === ts.SyntaxKind.SlashEqualsToken ||
    kind === ts.SyntaxKind.PercentEqualsToken ||
    kind === ts.SyntaxKind.LessThanLessThanEqualsToken ||
    kind === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken ||
    kind === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken ||
    kind === ts.SyntaxKind.AmpersandEqualsToken ||
    kind === ts.SyntaxKind.BarEqualsToken ||
    kind === ts.SyntaxKind.CaretEqualsToken ||
    kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken ||
    kind === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
    kind === ts.SyntaxKind.BarBarEqualsToken ||
    kind === ts.SyntaxKind.QuestionQuestionEqualsToken
  );
}

function isWholeStateAssignment(
  ts: typeof tsTypes,
  left: tsTypes.Expression
): boolean {
  return (
    ts.isPropertyAccessExpression(left) &&
    isThisExpression(ts, left.expression) &&
    left.name.text === 'state'
  );
}

function compoundOperatorText(
  ts: typeof tsTypes,
  kind: tsTypes.SyntaxKind
): tsTypes.SyntaxKind | undefined {
  switch (kind) {
    case ts.SyntaxKind.PlusEqualsToken:
      return ts.SyntaxKind.PlusToken;
    case ts.SyntaxKind.MinusEqualsToken:
      return ts.SyntaxKind.MinusToken;
    case ts.SyntaxKind.AsteriskEqualsToken:
      return ts.SyntaxKind.AsteriskToken;
    case ts.SyntaxKind.SlashEqualsToken:
      return ts.SyntaxKind.SlashToken;
    case ts.SyntaxKind.PercentEqualsToken:
      return ts.SyntaxKind.PercentToken;
    default:
      return undefined;
  }
}

function isThisMemberCall(
  ts: typeof tsTypes,
  node: tsTypes.CallExpression,
  name: string
): boolean {
  return (
    ts.isPropertyAccessExpression(node.expression) &&
    isThisExpression(ts, node.expression.expression) &&
    node.expression.name.text === name
  );
}

function isStatic(
  ts: typeof tsTypes,
  declaration: tsTypes.MethodDeclaration
): boolean {
  return (declaration.modifiers ?? []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword
  );
}

function isAsync(
  ts: typeof tsTypes,
  declaration: tsTypes.MethodDeclaration
): boolean {
  return (declaration.modifiers ?? []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword
  );
}

function valueToNode(
  ts: typeof tsTypes,
  value: FoldedValue
): tsTypes.Expression {
  if (typeof value === 'string') {
    return ts.factory.createStringLiteral(value);
  }
  if (typeof value === 'number') {
    return ts.factory.createNumericLiteral(String(value));
  }
  if (typeof value === 'boolean') {
    return value ? ts.factory.createTrue() : ts.factory.createFalse();
  }
  if (value === null) {
    return ts.factory.createNull();
  }
  if (Array.isArray(value)) {
    return ts.factory.createArrayLiteralExpression(
      value.map((item) => valueToNode(ts, item))
    );
  }
  return ts.factory.createObjectLiteralExpression(
    Object.entries(value).map(([key, item]) =>
      ts.factory.createPropertyAssignment(
        ts.factory.createStringLiteral(key),
        valueToNode(ts, item)
      )
    )
  );
}

function collectModuleConsts(
  context: CompileContext,
  classSource: ClassSource
): Map<string, tsTypes.Expression> {
  const consts = new Map<string, tsTypes.Expression>();
  for (const statement of classSource.source.statements) {
    if (!context.ts.isVariableStatement(statement)) {
      continue;
    }
    const isConst =
      statement.declarationList.flags & context.ts.NodeFlags.Const;
    if (!isConst) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (
        context.ts.isIdentifier(declaration.name) &&
        declaration.initializer
      ) {
        consts.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  return consts;
}
