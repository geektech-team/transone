import ts from 'typescript';

export type InstanceFieldValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | InstanceFieldValue[]
  | { [key: string]: InstanceFieldValue };
export interface InstanceFieldOwner {
  source: ts.SourceFile;
  declaration: ts.ClassLikeDeclaration;
}
export interface InstanceFieldPlan {
  entries: readonly {
    owner: InstanceFieldOwner;
    declaration: ts.PropertyDeclaration;
    name: string;
    value: InstanceFieldValue;
  }[];
  values: ReadonlyMap<string, InstanceFieldValue>;
  sharedObjects: ReadonlySet<object>;
  deferred: ReadonlySet<string>;
  propsReferenced: ReadonlySet<string>;
  readonly usesProps: boolean;
  evaluate(
    expression: ts.Expression,
    values?: ReadonlyMap<string, InstanceFieldValue>,
    locals?: ReadonlyMap<ts.VariableDeclaration, ts.Expression>,
    resolveSuper?: (call: ts.CallExpression) => InstanceFieldValue
  ): InstanceFieldValue;
}
interface Options {
  props?: Readonly<Record<string, InstanceFieldValue>>;
  deferProps?: boolean;
  resolve(
    node:
      ts.Identifier | ts.PropertyAccessExpression | ts.ElementAccessExpression
  ): ts.VariableDeclaration | undefined;
  sources?: readonly ts.SourceFile[];
  /** Native composition shares module identities across separately analyzed instances. */
  sharedConstMemo?: Map<ts.VariableDeclaration, InstanceFieldValue>;
  /** Native data IR can retain sparse arrays and statically evaluated computed keys. */
  nativeData?: boolean;
  fail(node: ts.Node, message: string): never;
}
export class DeferredInitialProps extends Error {
  constructor() {
    super('Initial props are supplied by the host at runtime');
  }
}
export function referencesProps(node: ts.Node): boolean {
  let result = false;
  walk(node, (current) => {
    if (
      (ts.isPropertyAccessExpression(current) &&
        current.expression.kind === ts.SyntaxKind.ThisKeyword &&
        current.name.text === 'props') ||
      (ts.isElementAccessExpression(current) &&
        current.expression.kind === ts.SyntaxKind.ThisKeyword &&
        ts.isStringLiteralLike(current.argumentExpression) &&
        current.argumentExpression.text === 'props')
    )
      result = true;
  });
  return result;
}
const RESERVED = new Set([
  'state',
  'props',
  'styleManager',
  'mounted',
  'el',
  'mount',
  'mountToNode',
  'unmount',
  'update',
  'setState',
  'setProps',
  'on',
  'off',
  'emit',
  'onDispose',
  'guardCallback',
  'provide',
  'inject',
  'getElement',
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
  'data',
  'properties',
  'setData',
  'triggerEvent',
  'setAppContext',
  'setParentComponent',
]);
function modifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return !!(
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((m) => m.kind === kind)
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
export function outerTransparent(node: ts.Node): ts.Node {
  while (
    node.parent &&
    (ts.isParenthesizedExpression(node.parent) ||
      ts.isAsExpression(node.parent) ||
      ts.isNonNullExpression(node.parent) ||
      ts.isSatisfiesExpression(node.parent)) &&
    node.parent.expression === node
  )
    node = node.parent;
  return node;
}
function staticName(node: ts.PropertyName): string | undefined {
  return ts.isIdentifier(node) ||
    ts.isStringLiteralLike(node) ||
    ts.isNumericLiteral(node)
    ? node.text
    : undefined;
}
function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/** Pure, non-executing field evaluation shared by the MP and native backends. */
export function analyzeInstanceFields(
  owners: readonly InstanceFieldOwner[],
  options: Options
): InstanceFieldPlan {
  function fail(node: ts.Node, message: string): never {
    return options.fail(node, `实例字段: ${message}`);
  }
  const fields = new Set<string>();
  const deferred = new Set<string>();
  const propsReferenced = new Set<string>();
  let usesProps = false;
  const trackProps = (expression: ts.Node): void => {
    walk(expression, (node) => {
      if (!referencesPropsDirect(node)) return;
      usesProps = true;
      const parent = outerTransparent(node).parent;
      if (ts.isPropertyAccessExpression(parent))
        propsReferenced.add(parent.name.text);
      else if (
        ts.isElementAccessExpression(parent) &&
        ts.isStringLiteralLike(parent.argumentExpression)
      )
        propsReferenced.add(parent.argumentExpression.text);
    });
  };
  const referencesPropsDirect = (node: ts.Node): boolean =>
    (ts.isPropertyAccessExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ThisKeyword &&
      node.name.text === 'props') ||
    (ts.isElementAccessExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ThisKeyword &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      node.argumentExpression.text === 'props');
  const ownFieldDeclarations = new Set(
    owners.flatMap((owner) =>
      owner.declaration.members.filter(ts.isPropertyDeclaration)
    )
  );
  const methods = new Set(RESERVED);
  for (const owner of owners)
    for (const member of owner.declaration.members) {
      if (modifier(member, ts.SyntaxKind.StaticKeyword)) continue;
      if (ts.isConstructorDeclaration(member))
        fail(member, '暂不支持自定义 constructor');
      if (
        member.name &&
        (ts.isMethodDeclaration(member) || ts.isAccessor(member))
      ) {
        const key = staticName(member.name);
        if (key) methods.add(key);
      }
      if (ts.isPropertyDeclaration(member)) {
        if (owner.source.isDeclarationFile)
          fail(
            member,
            '声明文件无法提供字段初始化，请提供可分析的 TypeScript 实现源码'
          );
        const key = staticName(member.name);
        if (!key || key.startsWith('__transone_'))
          fail(member, '只支持非保留的静态字段名');
        fields.add(key);
      }
    }
  const constants =
    options.sharedConstMemo ??
    new Map<ts.VariableDeclaration, InstanceFieldValue>();
  const active = new Set<ts.VariableDeclaration>();
  const checked = new Set<ts.VariableDeclaration>();
  const sharedObjects = new Set<object>();
  let localInitializers:
    ReadonlyMap<ts.VariableDeclaration, ts.Expression> | undefined;
  let localConstants = new Map<ts.VariableDeclaration, InstanceFieldValue>();
  let superInitializer:
    ((call: ts.CallExpression) => InstanceFieldValue) | undefined;
  const isSuperInitializer = (node: ts.Node): node is ts.CallExpression =>
    ts.isCallExpression(node) &&
    !node.questionDotToken &&
    node.arguments.length === 0 &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.expression.kind === ts.SyntaxKind.SuperKeyword &&
    node.expression.name.text === 'initState';
  const declarationOf = (
    node:
      ts.Identifier | ts.PropertyAccessExpression | ts.ElementAccessExpression
  ) => {
    const resolved = options.resolve(node);
    if (resolved) return resolved;
    if (!ts.isIdentifier(node)) return undefined;
    for (
      let parent: ts.Node | undefined = node.parent;
      parent && !ts.isSourceFile(parent);
      parent = parent.parent
    ) {
      if (!ts.isFunctionLike(parent) || !('body' in parent) || !parent.body)
        continue;
      let local: ts.VariableDeclaration | undefined;
      walk(parent.body, (item) => {
        if (
          ts.isVariableDeclaration(item) &&
          ts.isIdentifier(item.name) &&
          item.name.text === node.text
        )
          local = item;
      });
      if (local) return local;
    }
    return node
      .getSourceFile()
      .statements.filter(ts.isVariableStatement)
      .flatMap((s) => [...s.declarationList.declarations])
      .find((d) => ts.isIdentifier(d.name) && d.name.text === node.text);
  };
  // A const binding does not make an object immutable. Refuse writes/escapes
  // rather than freezing a stale snapshot of mutable module initialization.
  const checkObject = (declaration: ts.VariableDeclaration): void => {
    if (checked.has(declaration)) return;
    checked.add(declaration);
    try {
      for (const source of options.sources ??
        owners.map((owner) => owner.source)) {
        if (source.isDeclarationFile) continue;
        walk(source, (node) => {
          const bindingParent = node.parent;
          if (
            ts.isIdentifier(node) &&
            bindingParent &&
            (((ts.isPropertyAccessExpression(bindingParent) ||
              ts.isPropertyAssignment(bindingParent) ||
              ts.isPropertyDeclaration(bindingParent) ||
              ts.isMethodDeclaration(bindingParent) ||
              ts.isVariableDeclaration(bindingParent) ||
              ts.isParameter(bindingParent) ||
              ts.isBindingElement(bindingParent) ||
              ts.isFunctionDeclaration(bindingParent) ||
              ts.isClassDeclaration(bindingParent)) &&
              bindingParent.name === node) ||
              ts.isImportSpecifier(bindingParent) ||
              ts.isImportClause(bindingParent) ||
              ts.isNamespaceImport(bindingParent) ||
              ts.isExportSpecifier(bindingParent) ||
              ts.isTypeNode(bindingParent))
          )
            return;
          if (
            !ts.isIdentifier(node) ||
            node === declaration.name ||
            declarationOf(node) !== declaration
          )
            return;
          let access: ts.Node = outerTransparent(node);
          while (
            (ts.isPropertyAccessExpression(access.parent) ||
              ts.isElementAccessExpression(access.parent)) &&
            access.parent.expression === access
          )
            access = outerTransparent(access.parent);
          const parent = access.parent;
          const referent = evaluate(access as ts.Expression, new Map());
          if (referent && typeof referent === 'object') {
            let field: ts.Node | undefined = access.parent;
            while (
              field &&
              !ts.isPropertyDeclaration(field) &&
              !ts.isStatement(field)
            )
              field = field.parent;
            const ownField =
              field &&
              ts.isPropertyDeclaration(field) &&
              ownFieldDeclarations.has(field) &&
              !modifier(field, ts.SyntaxKind.StaticKeyword);
            const comparison =
              ts.isBinaryExpression(parent) &&
              [
                ts.SyntaxKind.EqualsEqualsEqualsToken,
                ts.SyntaxKind.ExclamationEqualsEqualsToken,
              ].includes(parent.operatorToken.kind);
            const booleanRead =
              (ts.isPrefixUnaryExpression(parent) &&
                parent.operator === ts.SyntaxKind.ExclamationToken) ||
              ts.isTypeOfExpression(parent) ||
              (ts.isConditionalExpression(parent) &&
                parent.condition === access) ||
              ((ts.isIfStatement(parent) || ts.isWhileStatement(parent)) &&
                parent.expression === access);
            const declarationOnly =
              ts.isImportSpecifier(parent) ||
              ts.isImportClause(parent) ||
              ts.isNamespaceImport(parent) ||
              ts.isExportSpecifier(parent);
            if (!ownField && !comparison && !booleanRead && !declarationOnly)
              fail(node, '模块对象常量存在无法证明安全的对象引用或逃逸');
          }
          let wrapped = access;
          while (
            wrapped.parent &&
            ((ts.isPropertyAssignment(wrapped.parent) &&
              wrapped.parent.initializer === wrapped) ||
              ts.isShorthandPropertyAssignment(wrapped.parent) ||
              ts.isSpreadAssignment(wrapped.parent) ||
              ts.isSpreadElement(wrapped.parent) ||
              ts.isArrayLiteralExpression(wrapped.parent) ||
              ts.isObjectLiteralExpression(wrapped.parent))
          )
            wrapped = outerTransparent(wrapped.parent);
          const container = wrapped.parent;
          if (
            wrapped !== access &&
            (ts.isVariableDeclaration(container) ||
              ts.isReturnStatement(container) ||
              ((ts.isCallExpression(container) ||
                ts.isNewExpression(container)) &&
                container.arguments?.includes(wrapped as ts.Expression)) ||
              (ts.isBinaryExpression(container) &&
                container.right === wrapped &&
                container.operatorToken.kind === ts.SyntaxKind.EqualsToken))
          )
            fail(node, '模块对象常量存在嵌套别名逃逸，无法静态初始化');
          if (
            (ts.isBinaryExpression(parent) &&
              parent.left === access &&
              parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
              parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) ||
            ts.isDeleteExpression(parent) ||
            ts.isPostfixUnaryExpression(parent) ||
            (ts.isPrefixUnaryExpression(parent) &&
              [
                ts.SyntaxKind.PlusPlusToken,
                ts.SyntaxKind.MinusMinusToken,
              ].includes(parent.operator)) ||
            ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
              (parent.expression === access ||
                parent.arguments?.includes(access as ts.Expression))) ||
            (ts.isBinaryExpression(parent) &&
              parent.right === access &&
              parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) ||
            (ts.isVariableDeclaration(parent) && parent.initializer === access)
          )
            fail(node, '模块对象常量存在写入或逃逸，无法静态初始化');
        });
      }
    } catch (error) {
      checked.delete(declaration);
      throw error;
    }
  };
  const optionalShortCircuit = Symbol('optional-chain-short-circuit');
  type AccessResult = InstanceFieldValue | typeof optionalShortCircuit;
  const isAccessChain = (
    node: ts.Node
  ): node is ts.PropertyAccessChain | ts.ElementAccessChain | ts.NonNullChain =>
    ts.isOptionalChain(node) && !ts.isCallExpression(node);
  const evaluateAccess = (
    node:
      | ts.PropertyAccessExpression
      | ts.ElementAccessExpression
      | ts.NonNullExpression,
    values: ReadonlyMap<string, InstanceFieldValue>
  ): AccessResult => {
    if (ts.isNonNullExpression(node))
      return isAccessChain(node.expression)
        ? evaluateAccess(node.expression, values)
        : evaluate(node.expression, values);
    if (
      referencesPropsDirect(node) ||
      (ts.isPropertyAccessExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ThisKeyword)
    )
      return evaluate(node, values);
    if (node.expression.kind === ts.SyntaxKind.ThisKeyword)
      fail(node, '不支持动态 this 字段读取');
    const declaration = declarationOf(node);
    if (declaration) return constant(declaration, node, values);
    // A short circuit propagates through one continuous optional chain only.
    // Parentheses turn it back into ordinary undefined before the next access.
    const base =
      isAccessChain(node) && isAccessChain(node.expression)
        ? evaluateAccess(node.expression, values)
        : evaluate(node.expression, values);
    if (base === optionalShortCircuit) return optionalShortCircuit;
    if ((base === undefined || base === null) && node.questionDotToken)
      return optionalShortCircuit;
    if (base === undefined || base === null)
      fail(node, '读取了尚未初始化的字段属性');
    const key = ts.isPropertyAccessExpression(node)
      ? node.name.text
      : evaluate(node.argumentExpression, values);
    if (
      (typeof key !== 'string' && typeof key !== 'number') ||
      (typeof base !== 'object' && typeof base !== 'string')
    )
      fail(node, '只支持静态对象/数组属性读取');
    if (key === 'length' && (Array.isArray(base) || typeof base === 'string'))
      return base.length;
    if (!Object.prototype.hasOwnProperty.call(base, key) && key in Object(base))
      fail(node, '不支持读取对象原型成员');
    return Object.prototype.hasOwnProperty.call(base, key)
      ? (base as Record<string, InstanceFieldValue>)[String(key)]
      : undefined;
  };
  const evaluate = (
    expression: ts.Expression,
    values: ReadonlyMap<string, InstanceFieldValue>
  ): InstanceFieldValue => {
    const node = unwrap(expression);
    if (superInitializer && isSuperInitializer(node))
      return superInitializer(node);
    if (referencesPropsDirect(node)) {
      usesProps = true;
      if (options.props !== undefined)
        return options.props as Record<string, InstanceFieldValue>;
      if (options.deferProps) throw new DeferredInitialProps();
      fail(node, 'this.props 需要显式初始 props 上下文');
    }
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isNumericLiteral(node)) {
      const value = Number(node.text);
      if (!Number.isFinite(value)) fail(node, '数字必须为有限值');
      return value;
    }
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isVoidExpression(node)) {
      evaluate(node.expression, values);
      return undefined;
    }
    if (
      ts.isIdentifier(node) &&
      node.text === 'undefined' &&
      !declarationOf(node)
    )
      return undefined;
    if (
      ts.isPropertyAccessExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ThisKeyword
    ) {
      if (methods.has(node.name.text) || !fields.has(node.name.text))
        fail(
          node,
          `不支持读取 this.${node.name.text}（state/props 等动态值不能用于静态字段）`
        );
      if (!values.has(node.name.text) && node.name.text in Object.prototype)
        fail(node, '未初始化字段会读取原型成员，无法静态表示');
      if (deferred.has(node.name.text)) throw new DeferredInitialProps();
      return values.get(node.name.text);
    }
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const value = evaluateAccess(node, values);
      return value === optionalShortCircuit ? undefined : value;
    }
    if (ts.isIdentifier(node)) {
      const declaration = declarationOf(node);
      if (declaration) return constant(declaration, node, values);
      return fail(node, `无法静态解析常量 ${node.text}`);
    }
    if (ts.isArrayLiteralExpression(node)) {
      const result: InstanceFieldValue[] = [];
      for (const item of node.elements) {
        if (ts.isOmittedExpression(item)) {
          if (!options.nativeData) fail(item, '暂不支持稀疏数组');
          result.length++;
          continue;
        }
        const value = evaluate(
          ts.isSpreadElement(item) ? item.expression : item,
          values
        );
        if (ts.isSpreadElement(item)) {
          if (
            !Array.isArray(value) &&
            !(options.nativeData && typeof value === 'string')
          )
            fail(item, '数组展开必须为数组或字符串');
          result.push(...value);
        } else result.push(value);
      }
      return result;
    }
    if (ts.isObjectLiteralExpression(node)) {
      const result: Record<string, InstanceFieldValue> = {};
      for (const item of node.properties) {
        if (ts.isSpreadAssignment(item)) {
          const value = evaluate(item.expression, values);
          if (
            (value !== null && typeof value === 'object') ||
            (options.nativeData && typeof value === 'string')
          ) {
            if (options.nativeData) {
              for (const [key, item] of Object.entries(value))
                Object.defineProperty(result, key, {
                  value: item,
                  writable: true,
                  configurable: true,
                  enumerable: true,
                });
            } else Object.assign(result, value);
          } else if (value !== undefined && value !== null)
            fail(item, '对象展开必须为对象');
        } else {
          if (
            !ts.isPropertyAssignment(item) &&
            !ts.isShorthandPropertyAssignment(item)
          )
            fail(item, '只支持对象数据属性');
          const computed =
            options.nativeData && ts.isComputedPropertyName(item.name);
          const key = computed
            ? String(evaluate(item.name.expression, values))
            : staticName(item.name);
          if (key === undefined || (!computed && key === '__proto__'))
            fail(item, '不支持动态或原型属性');
          const value = evaluate(
            ts.isShorthandPropertyAssignment(item)
              ? item.name
              : item.initializer,
            values
          );
          if (options.nativeData)
            Object.defineProperty(result, key, {
              value,
              writable: true,
              configurable: true,
              enumerable: true,
            });
          else result[key] = value;
        }
      }
      return result;
    }
    if (ts.isConditionalExpression(node))
      return evaluate(
        evaluate(node.condition, values) ? node.whenTrue : node.whenFalse,
        values
      );
    if (ts.isTemplateExpression(node)) {
      let result = node.head.text;
      for (const span of node.templateSpans)
        result += String(evaluate(span.expression, values)) + span.literal.text;
      return result;
    }
    if (ts.isPrefixUnaryExpression(node)) {
      const value = evaluate(node.operand, values);
      if (node.operator === ts.SyntaxKind.ExclamationToken) return !value;
      if (
        typeof value === 'number' &&
        node.operator === ts.SyntaxKind.MinusToken
      )
        return -value;
      if (
        typeof value === 'number' &&
        node.operator === ts.SyntaxKind.PlusToken
      )
        return value;
    }
    if (ts.isBinaryExpression(node)) {
      const left = evaluate(node.left, values),
        op = node.operatorToken.kind;
      if (op === ts.SyntaxKind.QuestionQuestionToken)
        return left == null ? evaluate(node.right, values) : left;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken)
        return left ? evaluate(node.right, values) : left;
      if (op === ts.SyntaxKind.BarBarToken)
        return left ? left : evaluate(node.right, values);
      const right = evaluate(node.right, values);
      if (op === ts.SyntaxKind.EqualsEqualsEqualsToken) return left === right;
      if (op === ts.SyntaxKind.ExclamationEqualsEqualsToken)
        return left !== right;
      if (
        op === ts.SyntaxKind.PlusToken &&
        (typeof left === 'string' || typeof right === 'string')
      )
        return String(left) + String(right);
      if (typeof left === 'number' && typeof right === 'number') {
        let value: number | undefined;
        switch (op) {
          case ts.SyntaxKind.PlusToken:
            value = left + right;
            break;
          case ts.SyntaxKind.MinusToken:
            value = left - right;
            break;
          case ts.SyntaxKind.AsteriskToken:
            value = left * right;
            break;
          case ts.SyntaxKind.SlashToken:
            value = left / right;
            break;
          case ts.SyntaxKind.PercentToken:
            value = left % right;
            break;
          case ts.SyntaxKind.AsteriskAsteriskToken:
            value = left ** right;
            break;
          case ts.SyntaxKind.LessThanToken:
            return left < right;
          case ts.SyntaxKind.LessThanEqualsToken:
            return left <= right;
          case ts.SyntaxKind.GreaterThanToken:
            return left > right;
          case ts.SyntaxKind.GreaterThanEqualsToken:
            return left >= right;
        }
        if (value !== undefined && Number.isFinite(value)) return value;
      }
    }
    return fail(node, `不支持的初始化表达式 ${node.getText()}`);
  };
  const constant = (
    declaration: ts.VariableDeclaration,
    at: ts.Node,
    values: ReadonlyMap<string, InstanceFieldValue>
  ): InstanceFieldValue => {
    if (
      !declaration.initializer ||
      !ts.isVariableDeclarationList(declaration.parent) ||
      !(declaration.parent.flags & ts.NodeFlags.Const)
    )
      fail(at, '只支持 const 模块常量');
    if (active.has(declaration)) fail(at, '常量引用循环');
    for (const outer of active) {
      if (
        outer.getSourceFile() === declaration.getSourceFile() &&
        outer.initializer &&
        at.pos >= outer.initializer.pos &&
        at.end <= outer.initializer.end &&
        declaration.pos > at.pos
      )
        fail(at, '常量在初始化前被引用（暂时性死区）');
    }
    let local = false;
    for (
      let parent: ts.Node | undefined = declaration.parent;
      parent && !ts.isSourceFile(parent);
      parent = parent.parent
    )
      if (ts.isFunctionLike(parent)) local = true;
    const cache = local ? localConstants : constants;
    if (cache.has(declaration)) {
      const value = cache.get(declaration);
      if (!local && value && typeof value === 'object') {
        checkObject(declaration);
        const collect = (item: InstanceFieldValue): void => {
          if (item && typeof item === 'object' && !sharedObjects.has(item)) {
            sharedObjects.add(item);
            Object.values(item).forEach(collect);
          }
        };
        collect(value);
      }
      return value;
    }
    if (!local) {
      let hasThis = false;
      walk(declaration.initializer, (node) => {
        if (node.kind === ts.SyntaxKind.ThisKeyword) hasThis = true;
      });
      if (hasThis) fail(at, '模块常量初始化不能读取组件 this');
    }
    let value: InstanceFieldValue;
    active.add(declaration);
    try {
      value = evaluate(
        localInitializers?.get(declaration) ?? declaration.initializer,
        local ? values : new Map()
      );
    } finally {
      active.delete(declaration);
    }
    cache.set(declaration, value);
    try {
      if (!local && value !== null && typeof value === 'object') {
        checkObject(declaration);
        if (!local) {
          const collect = (value: InstanceFieldValue): void => {
            if (
              value &&
              typeof value === 'object' &&
              !sharedObjects.has(value)
            ) {
              sharedObjects.add(value);
              Object.values(value).forEach(collect);
            }
          };
          collect(value);
        }
      }
    } catch (error) {
      cache.delete(declaration);
      throw error;
    }
    return value;
  };
  const entries: InstanceFieldPlan['entries'][number][] = [];
  const validateConstantScope = (declaration: ts.VariableDeclaration): void => {
    let parent: ts.Node | undefined = declaration.parent;
    while (parent && !ts.isSourceFile(parent) && !ts.isFunctionLike(parent))
      parent = parent.parent;
    if (parent && ts.isSourceFile(parent) && declaration.initializer) {
      walk(declaration.initializer, (node) => {
        if (node.kind === ts.SyntaxKind.ThisKeyword)
          fail(node, '模块常量初始化不能读取组件 this');
      });
    }
  };
  // Unknown host props must not conceal an impure conditional branch. Validate
  // the complete expression before deferring its value to instance creation.
  const validatePure = (
    expression: ts.Expression,
    active = new Set<ts.VariableDeclaration>()
  ): void => {
    const node = unwrap(expression);
    if (superInitializer && isSuperInitializer(node)) {
      // Props may defer the selected branch, but must not conceal an impure
      // ancestor initializer that the generated host could later execute.
      try {
        superInitializer(node);
      } catch (error) {
        if (!(error instanceof DeferredInitialProps)) throw error;
      }
      return;
    }
    if (referencesPropsDirect(node)) return;
    if (
      ts.isStringLiteralLike(node) ||
      ts.isNumericLiteral(node) ||
      [
        ts.SyntaxKind.TrueKeyword,
        ts.SyntaxKind.FalseKeyword,
        ts.SyntaxKind.NullKeyword,
      ].includes(node.kind)
    )
      return;
    if (ts.isIdentifier(node)) {
      const declaration = declarationOf(node);
      if (node.text === 'undefined' && !declaration) return;
      if (
        !declaration?.initializer ||
        !ts.isVariableDeclarationList(declaration.parent) ||
        !(declaration.parent.flags & ts.NodeFlags.Const)
      )
        fail(node, '初始表达式只支持 const 与字段/props');
      validateConstantScope(declaration);
      if (active.has(declaration)) fail(node, '常量引用循环');
      validatePure(
        localInitializers?.get(declaration) ?? declaration.initializer,
        new Set([...active, declaration])
      );
      return;
    }
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      if (node.expression.kind === ts.SyntaxKind.ThisKeyword) {
        const key = ts.isPropertyAccessExpression(node)
          ? node.name.text
          : ts.isStringLiteralLike(node.argumentExpression)
            ? node.argumentExpression.text
            : undefined;
        if (!key || methods.has(key) || !fields.has(key))
          fail(node, '不支持初始表达式中的 this/state 访问');
        return;
      }
      const declaration = declarationOf(node);
      if (declaration?.initializer) {
        validateConstantScope(declaration);
        if (active.has(declaration)) fail(node, '常量引用循环');
        validatePure(
          declaration.initializer,
          new Set([...active, declaration])
        );
        return;
      }
      validatePure(node.expression, active);
      if (ts.isElementAccessExpression(node))
        validatePure(node.argumentExpression, active);
      return;
    }
    if (ts.isArrayLiteralExpression(node)) {
      for (const item of node.elements) {
        if (ts.isOmittedExpression(item)) {
          if (!options.nativeData) fail(item, '暂不支持稀疏数组');
          continue;
        }
        validatePure(ts.isSpreadElement(item) ? item.expression : item, active);
      }
      return;
    }
    if (ts.isObjectLiteralExpression(node)) {
      for (const item of node.properties) {
        if (ts.isSpreadAssignment(item)) validatePure(item.expression, active);
        else if (ts.isShorthandPropertyAssignment(item))
          validatePure(item.name, active);
        else if (
          ts.isPropertyAssignment(item) &&
          ((options.nativeData && ts.isComputedPropertyName(item.name)) ||
            (staticName(item.name) !== undefined &&
              staticName(item.name) !== '__proto__'))
        ) {
          if (ts.isComputedPropertyName(item.name))
            validatePure(item.name.expression, active);
          validatePure(item.initializer, active);
        } else fail(item, '只支持静态对象数据属性');
      }
      return;
    }
    if (ts.isTemplateExpression(node)) {
      for (const span of node.templateSpans)
        validatePure(span.expression, active);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      validatePure(node.condition, active);
      validatePure(node.whenTrue, active);
      validatePure(node.whenFalse, active);
      return;
    }
    if (ts.isVoidExpression(node)) {
      validatePure(node.expression, active);
      return;
    }
    if (
      ts.isPrefixUnaryExpression(node) &&
      [
        ts.SyntaxKind.PlusToken,
        ts.SyntaxKind.MinusToken,
        ts.SyntaxKind.ExclamationToken,
      ].includes(node.operator)
    ) {
      validatePure(node.operand, active);
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.PlusToken,
        ts.SyntaxKind.MinusToken,
        ts.SyntaxKind.AsteriskToken,
        ts.SyntaxKind.SlashToken,
        ts.SyntaxKind.PercentToken,
        ts.SyntaxKind.AsteriskAsteriskToken,
        ts.SyntaxKind.QuestionQuestionToken,
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.LessThanToken,
        ts.SyntaxKind.LessThanEqualsToken,
        ts.SyntaxKind.GreaterThanToken,
        ts.SyntaxKind.GreaterThanEqualsToken,
      ].includes(node.operatorToken.kind)
    ) {
      validatePure(node.left, active);
      validatePure(node.right, active);
      return;
    }
    fail(node, `不支持的初始表达式 ${node.getText()}`);
  };
  const values = new Map<string, InstanceFieldValue>();
  for (const owner of owners)
    for (const declaration of owner.declaration.members) {
      if (
        !ts.isPropertyDeclaration(declaration) ||
        modifier(declaration, ts.SyntaxKind.StaticKeyword) ||
        modifier(declaration, ts.SyntaxKind.DeclareKeyword) ||
        modifier(declaration, ts.SyntaxKind.AbstractKeyword)
      )
        continue;
      const key = staticName(declaration.name)!;
      if (methods.has(key)) fail(declaration, `不能覆盖框架或方法成员 ${key}`);
      let value: InstanceFieldValue;
      if (declaration.initializer) {
        trackProps(declaration.initializer);
        if (options.deferProps) validatePure(declaration.initializer);
        try {
          value = evaluate(declaration.initializer, values);
          deferred.delete(key);
        } catch (error) {
          if (!(error instanceof DeferredInitialProps)) throw error;
          deferred.add(key);
        }
      } else deferred.delete(key);
      values.set(key, value);
      entries.push({ owner, declaration, name: key, value });
    }
  return {
    entries,
    values,
    sharedObjects,
    deferred,
    propsReferenced,
    get usesProps() {
      return usesProps;
    },
    evaluate: (expression, snapshot = values, locals, resolveSuper) => {
      const previous = localInitializers;
      const previousConstants = localConstants;
      const previousSuper = superInitializer;
      localInitializers = locals;
      localConstants = new Map();
      superInitializer = resolveSuper;
      try {
        trackProps(expression);
        if (options.deferProps) validatePure(expression);
        return evaluate(expression, snapshot);
      } finally {
        localInitializers = previous;
        localConstants = previousConstants;
        superInitializer = previousSuper;
      }
    },
  };
}

/** Convert a validated value to source without JSON dropping undefined fields. */
export function fieldValueNode(value: InstanceFieldValue): ts.Expression {
  if (value === undefined) return ts.factory.createVoidZero();
  if (value === null) return ts.factory.createNull();
  if (typeof value === 'string') return ts.factory.createStringLiteral(value);
  if (typeof value === 'boolean')
    return value ? ts.factory.createTrue() : ts.factory.createFalse();
  if (typeof value === 'number')
    return value < 0
      ? ts.factory.createPrefixUnaryExpression(
          ts.SyntaxKind.MinusToken,
          ts.factory.createNumericLiteral(-value)
        )
      : ts.factory.createNumericLiteral(value);
  if (Array.isArray(value))
    return ts.factory.createArrayLiteralExpression(value.map(fieldValueNode));
  return ts.factory.createObjectLiteralExpression(
    Object.entries(value).map(([key, item]) =>
      ts.factory.createPropertyAssignment(
        ts.factory.createStringLiteral(key),
        fieldValueNode(item)
      )
    )
  );
}
