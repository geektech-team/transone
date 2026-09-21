import type * as tsTypes from 'typescript';
import { toBinding, BindingScope } from './binding';
import {
  foldExpression,
  FoldedValue,
  isThisExpression,
  unwrapParentheses,
} from './fold';
import { mpError } from './errors';
import { ClassSource, CompileContext, warn } from './types';
import { resolveClassReference, isComponentSubclass } from './analyze';

/** 一个组件调用点通过 emitters 绑定的自定义事件。 */
export interface EmitterUsage {
  event: string;
  method: string;
  passArgs: boolean;
  /** 页面/组件 JS 中的包装方法名（按出现顺序唯一，避免同名事件冲突）。 */
  key: string;
}

/** 模板编译期间收集的产物信息。 */
export interface TemplateBuilder {
  /** 模板绑定的事件处理方法名。 */
  handlers: Set<string>;
  /** 用到的自定义组件（tag -> 类来源）。 */
  usedComponents: Map<string, ClassSource>;
  /** 本模板中引用到的 props 名（组件需要声明 properties）。 */
  propsReferenced: Set<string>;
  /** 本模板的组件通过 triggerEvent 触发的事件名。 */
  customEvents: Set<string>;
  /** 父级需要生成的 emitters 包装方法。 */
  emitters: EmitterUsage[];
}

interface TemplateEnv {
  builder: TemplateBuilder;
  scope: BindingScope;
  indent: number;
  extraAttrs: string[];
  /** 本地名 -> transone 原始导出名（处理 import 别名）。 */
  origins: Map<string, string>;
  /** 存在 hover 样式的选择器集合（'.card'），用于生成 hover-class。 */
  hoverSelectors: Set<string>;
}

export interface CompiledTemplate {
  template: string;
  builder: TemplateBuilder;
}

/** TSone 元素快捷方式（含 h/Tag），未从 transone 导入的同名调用也按工厂识别。 */
const ELEMENT_FACTORIES = new Set([
  'h',
  'Tag',
  'Div',
  'Span',
  'P',
  'Button',
  'Input',
  'Section',
  'Main',
  'Header',
  'Footer',
  'Nav',
  'Article',
  'Aside',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'Strong',
  'Em',
  'Small',
  'Pre',
  'Code',
  'Blockquote',
  'Ul',
  'Ol',
  'Li',
  'A',
  'Img',
  'Form',
  'Label',
  'Textarea',
  'Select',
  'Option',
  'Table',
  'Thead',
  'Tbody',
  'Tr',
  'Th',
  'Td',
]);

const SPECIAL_CALLS = new Set(['createComponent', 'each', 'slot']);

/** HTML 标签 -> WXML 标签映射（WXML 只提供有限的基础组件）。 */
const TAG_MAP: Record<string, string> = {
  div: 'view',
  section: 'view',
  main: 'view',
  header: 'view',
  footer: 'view',
  article: 'view',
  aside: 'view',
  nav: 'view',
  ul: 'view',
  ol: 'view',
  li: 'view',
  blockquote: 'view',
  pre: 'view',
  code: 'view',
  table: 'view',
  thead: 'view',
  tbody: 'view',
  tr: 'view',
  th: 'view',
  td: 'view',
  p: 'view',
  form: 'form',
  label: 'label',
  h1: 'view',
  h2: 'view',
  h3: 'view',
  h4: 'view',
  h5: 'view',
  h6: 'view',
  span: 'text',
  strong: 'text',
  em: 'text',
  small: 'text',
  button: 'button',
  input: 'input',
  textarea: 'textarea',
  img: 'image',
  a: 'navigator',
  // —— 小程序专有组件（标签名即 WXML 标签）——
  view: 'view',
  text: 'text',
  image: 'image',
  navigator: 'navigator',
  'scroll-view': 'scroll-view',
  swiper: 'swiper',
  'swiper-item': 'swiper-item',
  picker: 'picker',
  'picker-view': 'picker-view',
  'picker-view-column': 'picker-view-column',
  switch: 'switch',
  checkbox: 'checkbox',
  'checkbox-group': 'checkbox-group',
  radio: 'radio',
  'radio-group': 'radio-group',
  slider: 'slider',
  progress: 'progress',
  icon: 'icon',
  'rich-text': 'rich-text',
  video: 'video',
  camera: 'camera',
  'live-player': 'live-player',
  'live-pusher': 'live-pusher',
  map: 'map',
  canvas: 'canvas',
  'cover-view': 'cover-view',
  'cover-image': 'cover-image',
  'movable-view': 'movable-view',
  'movable-area': 'movable-area',
  'web-view': 'web-view',
  ad: 'ad',
  'official-account': 'official-account',
  'open-data': 'open-data',
  // camelCase 别名（宽松接受）
  scrollView: 'scroll-view',
  swiperItem: 'swiper-item',
  pickerView: 'picker-view',
  pickerViewColumn: 'picker-view-column',
  checkboxGroup: 'checkbox-group',
  radioGroup: 'radio-group',
  richText: 'rich-text',
  coverView: 'cover-view',
  coverImage: 'cover-image',
  movableView: 'movable-view',
  movableArea: 'movable-area',
  webView: 'web-view',
  livePlayer: 'live-player',
  officialAccount: 'official-account',
  openData: 'open-data',
};

/** TSone 事件名 -> WXML 事件名（click 在 WXML 中是 tap）。 */
const EVENT_MAP: Record<string, string> = {
  click: 'tap',
  tap: 'tap',
  longpress: 'longpress',
  longtap: 'longtap',
  input: 'input',
  change: 'change',
  cancel: 'cancel',
  submit: 'submit',
  focus: 'focus',
  blur: 'blur',
  confirm: 'confirm',
  load: 'load',
  error: 'error',
  scroll: 'scroll',
  scrolltoupper: 'scrolltoupper',
  scrolltolower: 'scrolltolower',
  scrollToUpper: 'scrolltoupper',
  scrollToLower: 'scrolltolower',
  refresherrefresh: 'refresherrefresh',
  refresherpulldown: 'refresherpulldown',
  refresherrestore: 'refresherrestore',
  refresherabort: 'refresherabort',
  touchstart: 'touchstart',
  touchmove: 'touchmove',
  touchend: 'touchend',
  touchcancel: 'touchcancel',
  touchforcechange: 'touchforcechange',
  transitionend: 'transitionend',
  animationfinish: 'animationfinish',
  animationfail: 'animationfail',
  getphonenumber: 'getphonenumber',
  getuserinfo: 'getuserinfo',
  getcontact: 'getcontact',
  openshare: 'openshare',
  launchapp: 'launchapp',
  message: 'message',
};

const TAG_KEYS = new Set([
  'props',
  'children',
  'listeners',
  'key',
  'directions',
]);


/** 显式传入的 undefined 字面量视为参数缺省（与 TS 运行时语义一致）。 */
function notUndefined(
  ts: typeof tsTypes,
  expression: tsTypes.Expression | undefined
): boolean {
  return (
    expression !== undefined &&
    !(ts.isIdentifier(expression) && expression.text === 'undefined')
  );
}

function isEventProp(key: string): boolean {
  return /^on[A-Z]/.test(key) || /^on[a-z]/.test(key);
}

function eventNameFromProp(key: string): string {
  return key.slice(2).toLowerCase();
}

export function compileTemplate(
  context: CompileContext,
  classSource: ClassSource,
  _kind: 'page' | 'component',
  hoverSelectors: Set<string> = new Set()
): CompiledTemplate {
  const { ts } = context;
  const renderMethod = findMethod(context, classSource, 'render');
  if (!renderMethod) {
    throw mpError(
      classSource.filePath,
      `组件 ${classSource.className} 缺少 render() 方法`
    );
  }
  const body = renderMethod.body;
  if (!body) {
    throw mpError(classSource.filePath, 'render() 缺少方法体');
  }

  const locals = new Map<string, tsTypes.Expression>();
  let returnStatement: tsTypes.ReturnStatement | undefined;
  for (const statement of body.statements) {
    if (ts.isVariableStatement(statement)) {
      const isConst = statement.declarationList.flags & ts.NodeFlags.Const;
      if (!isConst) {
        throw mpError(
          classSource.filePath,
          'render() 内只支持 const 局部变量（小程序模板是静态编译的）'
        );
      }
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          locals.set(declaration.name.text, declaration.initializer);
        }
      }
      continue;
    }
    if (ts.isReturnStatement(statement)) {
      returnStatement = statement;
      continue;
    }
    throw mpError(
      classSource.filePath,
      `render() 内不支持的语句（只支持 const 声明与 return）: ${statement.getText().slice(0, 60)}`
    );
  }
  if (!returnStatement?.expression) {
    throw mpError(classSource.filePath, 'render() 必须以 return 表达式结束');
  }

  const consts = collectModuleConsts(context, classSource);
  const builder: TemplateBuilder = {
    handlers: new Set(),
    usedComponents: new Map(),
    propsReferenced: new Set(),
    customEvents: new Set(),
    emitters: [],
  };
  const env: TemplateEnv = {
    builder,
    scope: { params: new Set(), locals, consts },
    indent: 0,
    extraAttrs: [],
    origins: collectFactoryOrigins(ts, classSource.source),
    hoverSelectors,
  };

  const lines = buildNodeLines(
    context,
    classSource,
    returnStatement.expression,
    env
  );
  const header = `<!-- 由 transone build --target ${context.dialect.id} 生成，请勿手动编辑 -->`;
  return {
    template: [header, ...lines].join('\n') + '\n',
    builder,
  };
}

function buildNodeLines(
  context: CompileContext,
  classSource: ClassSource,
  node: tsTypes.Node,
  env: TemplateEnv,
  depth = 0
): string[] {
  if (depth > 64) {
    throw mpError(classSource.filePath, '模板嵌套过深（可能是标识符循环引用）');
  }
  const { ts } = context;
  node = unwrapParentheses(ts, node);
  // 模板中常见 `{ ... } as VNode` 类型断言：类型信息在编译期即被丢弃
  node = unwrapTypeAssertions(ts, node);

  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return [];
  }

  if (ts.isCallExpression(node)) {
    const localName = callName(ts, node.expression);
    const name = (localName && env.origins.get(localName)) ?? localName;
    if (name === 'createComponent') {
      return compileComponentCall(context, classSource, node, env, depth);
    }
    if (name === 'each') {
      return compileEach(context, classSource, node, env, depth);
    }
    if (name === 'slot') {
      return compileSlot(context, classSource, node, env);
    }
    if (name && ELEMENT_FACTORIES.has(name)) {
      return compileElementCall(context, classSource, node, env, depth);
    }
    throw mpError(
      classSource.filePath,
      `不支持的渲染调用 "${name ?? '?'}"（仅支持 h/Tag/元素快捷方式/createComponent/each/slot）`
    );
  }

  if (ts.isIdentifier(node)) {
    if (env.scope.params.has(node.text)) {
      return [indent(env.indent) + `{{${node.text}}}`];
    }
    const replacement = resolveIdentifierExpression(
      context,
      classSource,
      node,
      env
    );
    if (replacement) {
      return buildNodeLines(context, classSource, replacement, env, depth + 1);
    }
    throw mpError(classSource.filePath, `无法解析模板标识符 "${node.text}"`);
  }

  if (ts.isObjectLiteralExpression(node)) {
    const componentProp = objectProperty(ts, node, 'component');
    if (componentProp) {
      return compileComponentObject(context, classSource, node, env, depth);
    }
    throw mpError(
      classSource.filePath,
      `render() 中不支持的对象字面量: ${node.getText().slice(0, 60)}`
    );
  }

  if (ts.isConditionalExpression(node)) {
    return compileConditional(context, classSource, node, env, depth);
  }

  if (ts.isBinaryExpression(node)) {
    if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      return compileLogicalAnd(context, classSource, node, env, depth);
    }
    throw mpError(
      classSource.filePath,
      `render() 中不支持的表达式（条件渲染请用三元或 &&）: ${node.getText().slice(0, 60)}`
    );
  }

  if (ts.isArrayLiteralExpression(node)) {
    const lines: string[] = [];
    for (const element of node.elements) {
      if (ts.isSpreadElement(element)) {
        throw mpError(classSource.filePath, 'children 中不支持展开运算符');
      }
      lines.push(...buildNodeLines(context, classSource, element, env, depth));
    }
    return lines;
  }

  if (isTextNode(ts, node)) {
    return [indent(env.indent) + textContent(context, classSource, node, env)];
  }

  if (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node)
  ) {
    return [
      indent(env.indent) +
        `{{${toBinding(bindingContext(context, classSource, env), node)}}}`,
    ];
  }

  throw mpError(
    classSource.filePath,
    `render() 中不支持的节点: ${node.getText().slice(0, 60)}`
  );
}

function compileElementCall(
  context: CompileContext,
  classSource: ClassSource,
  node: tsTypes.CallExpression,
  env: TemplateEnv,
  depth: number
): string[] {
  const { ts } = context;
  const localName = callName(ts, node.expression)!;
  const name = env.origins.get(localName) ?? localName;
  const args = node.arguments;

  let tagExpr: tsTypes.Expression;
  let propsExpr: tsTypes.Expression | undefined;
  let childrenExpr: tsTypes.Expression | undefined;
  let listenersExpr: tsTypes.Expression | undefined;
  let directionsExpr: tsTypes.Expression | undefined;

  if (name === 'h' || name === 'Tag') {
    if (args.length === 0) {
      throw mpError(classSource.filePath, `${name}() 缺少标签参数`);
    }
    tagExpr = args[0];
    if (
      name === 'Tag' &&
      args.length >= 2 &&
      ts.isObjectLiteralExpression(args[1])
    ) {
      const options = args[1];
      propsExpr = objectProperty(ts, options, 'props');
      childrenExpr = objectProperty(ts, options, 'children');
      listenersExpr = objectProperty(ts, options, 'listeners');
      directionsExpr = objectProperty(ts, options, 'directions');
    } else {
      propsExpr = args[1];
      childrenExpr = args[2];
      listenersExpr = notUndefined(ts, args[3]) ? args[3] : undefined;
      directionsExpr = notUndefined(ts, args[5]) ? args[5] : undefined;
    }
  } else {
    // 元素快捷方式：Div({ props, children, ... })
    tagExpr = ts.factory.createStringLiteral(kebabCase(name));
    const options = args[0];
    if (options && ts.isObjectLiteralExpression(options)) {
      propsExpr = objectProperty(ts, options, 'props');
      childrenExpr = objectProperty(ts, options, 'children');
      listenersExpr = objectProperty(ts, options, 'listeners');
      directionsExpr = objectProperty(ts, options, 'directions');
      const directProps = options.properties.filter(
        (property) =>
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name) &&
          !TAG_KEYS.has(property.name.text)
      );
      if (directProps.length > 0) {
        propsExpr = ts.factory.createObjectLiteralExpression([
          ...(propsExpr && ts.isObjectLiteralExpression(propsExpr)
            ? propsExpr.properties
            : []),
          ...directProps,
        ]);
      }
    }
  }

  if (!ts.isStringLiteral(tagExpr)) {
    throw mpError(classSource.filePath, '元素标签必须是字符串字面量');
  }
  return compileElement(
    context,
    classSource,
    tagExpr.text,
    propsExpr,
    childrenExpr,
    listenersExpr,
    directionsExpr,
    env,
    depth
  );
}

function compileElement(
  context: CompileContext,
  classSource: ClassSource,
  tagName: string,
  propsExpr: tsTypes.Expression | undefined,
  childrenExpr: tsTypes.Expression | undefined,
  listenersExpr: tsTypes.Expression | undefined,
  directionsExpr: tsTypes.Expression | undefined,
  env: TemplateEnv,
  depth: number
): string[] {
  const { ts } = context;
  const wxmlTag = TAG_MAP[tagName];
  if (!wxmlTag) {
    throw mpError(
      classSource.filePath,
      `不支持的 HTML 标签 "${tagName}"（WXML 仅支持基础组件）`
    );
  }

  const attrs: string[] = [...env.extraAttrs];

  if (propsExpr !== undefined) {
    if (!ts.isObjectLiteralExpression(propsExpr)) {
      throw mpError(classSource.filePath, `元素 props 必须是对象字面量`);
    }
    for (const property of propsExpr.properties) {
      if (
        !ts.isPropertyAssignment(property) ||
        !ts.isIdentifier(property.name)
      ) {
        throw mpError(classSource.filePath, `元素 props 只支持静态属性名`);
      }
      const key = property.name.text;
      const value = property.initializer;
      if (key === 'key') {
        // key 仅用于 DOM diff，小程序无对应属性
        continue;
      }
      if (key === 'class' || key === 'className') {
        attrs.push(compileClassAttr(context, classSource, value, env));
        continue;
      }
      if (key === 'style') {
        attrs.push(compileStyleAttr(context, classSource, value, env));
        continue;
      }
      if (key === 'slot') {
        attrs.push(
          `slot="${compileLiteralString(context, classSource, value, 'slot 名称')}"`
        );
        continue;
      }
      if (isEventProp(key)) {
        const event = eventNameFromProp(key);
        attrs.push(compileListener(context, classSource, event, value, env));
        continue;
      }
      attrs.push(compileGenericAttr(context, classSource, key, value, env));
    }
  }

  if (listenersExpr !== undefined) {
    if (!ts.isObjectLiteralExpression(listenersExpr)) {
      throw mpError(classSource.filePath, 'listeners 必须是对象字面量');
    }
    for (const property of listenersExpr.properties) {
      if (
        !ts.isPropertyAssignment(property) ||
        !ts.isIdentifier(property.name)
      ) {
        throw mpError(classSource.filePath, 'listeners 只支持静态事件名');
      }
      const event = property.name.text.split('.')[0];
      const hasModifiers = property.name.text !== event;
      if (hasModifiers) {
        warn(
          context,
          `${classSource.filePath}: 事件修饰符 "${property.name.text}" 在小程序中不生效`
        );
      }
      attrs.push(
        compileListener(context, classSource, event, property.initializer, env)
      );
    }
  }

  if (directionsExpr !== undefined) {
    if (!ts.isObjectLiteralExpression(directionsExpr)) {
      throw mpError(classSource.filePath, 'directions 必须是对象字面量');
    }
    const ifExpr = objectProperty(ts, directionsExpr, 'if');
    if (ifExpr) {
      const folded = foldExpression(ts, ifExpr, env.scope.consts);
      if (folded === false) {
        return [];
      }
      if (folded !== true) {
        attrs.push(
          `${context.dialect.directivePrefix}if="{{${toBinding(bindingContext(context, classSource, env), ifExpr)}}}"`
        );
      }
    }
    const showExpr = objectProperty(ts, directionsExpr, 'show');
    if (showExpr) {
      const folded = foldExpression(ts, showExpr, env.scope.consts);
      if (folded === false) {
        attrs.push('hidden');
      } else if (folded !== true) {
        const binding = toBinding(
          bindingContext(context, classSource, env),
          showExpr
        );
        attrs.push(`hidden="{{!(${binding})}}"`);
      }
    }
    if (objectProperty(ts, directionsExpr, 'model')) {
      throw mpError(
        classSource.filePath,
        'directions.model 双向绑定暂不支持编译到小程序，请改用 value + bindinput'
      );
    }
  }

  const openTag =
    attrs.length > 0 ? `<${wxmlTag} ${attrs.join(' ')}>` : `<${wxmlTag}>`;
  const lines = [indent(env.indent) + openTag];
  const childLines = buildNodeLines(
    context,
    classSource,
    childrenExpr ?? ts.factory.createArrayLiteralExpression([]),
    {
      ...env,
      indent: env.indent + 1,
    },
    depth + 1
  );
  lines.push(...childLines);
  lines.push(indent(env.indent) + `</${wxmlTag}>`);
  return lines;
}

function compileConditional(
  context: CompileContext,
  classSource: ClassSource,
  node: tsTypes.ConditionalExpression,
  env: TemplateEnv,
  depth: number
): string[] {
  const condition = toBinding(
    bindingContext(context, classSource, env),
    node.condition
  );
  const whenTrue = buildNodeLines(
    context,
    classSource,
    node.whenTrue,
    env,
    depth + 1
  );
  const whenFalse = buildNodeLines(
    context,
    classSource,
    node.whenFalse,
    env,
    depth + 1
  );
  const lines = [indent(env.indent) + `<block ${context.dialect.directivePrefix}if="{{${condition}}}">`];
  lines.push(...whenTrue.map((line) => indent(env.indent + 1) + line));
  lines.push(indent(env.indent) + '</block>');
  if (whenFalse.length > 0) {
    lines.push(indent(env.indent) + `<block ${context.dialect.directivePrefix}else>`);
    lines.push(...whenFalse.map((line) => indent(env.indent + 1) + line));
    lines.push(indent(env.indent) + '</block>');
  }
  return lines;
}

function compileLogicalAnd(
  context: CompileContext,
  classSource: ClassSource,
  node: tsTypes.BinaryExpression,
  env: TemplateEnv,
  depth: number
): string[] {
  const condition = toBinding(
    bindingContext(context, classSource, env),
    node.left
  );
  const inner = buildNodeLines(
    context,
    classSource,
    node.right,
    env,
    depth + 1
  );
  return [
    indent(env.indent) + `<block ${context.dialect.directivePrefix}if="{{${condition}}}">`,
    ...inner.map((line) => indent(env.indent + 1) + line),
    indent(env.indent) + '</block>',
  ];
}

function compileEach(
  context: CompileContext,
  classSource: ClassSource,
  node: tsTypes.CallExpression,
  env: TemplateEnv,
  depth: number
): string[] {
  const { ts } = context;
  const [itemsExpr, renderExpr, keyExpr] = node.arguments;
  if (!itemsExpr || !renderExpr) {
    throw mpError(classSource.filePath, 'each(items, render, key) 缺少参数');
  }
  if (!ts.isArrowFunction(renderExpr)) {
    throw mpError(classSource.filePath, 'each 的 render 参数必须是箭头函数');
  }

  const paramNames: string[] = [];
  for (const parameter of renderExpr.parameters) {
    if (!ts.isIdentifier(parameter.name)) {
      throw mpError(
        classSource.filePath,
        'each 的参数必须是 (item, index) 标识符'
      );
    }
    paramNames.push(parameter.name.text);
  }
  if (paramNames.length > 2) {
    throw mpError(classSource.filePath, 'each 最多接受 (item, index) 两个参数');
  }

  const itemsBinding = toBinding(
    bindingContext(context, classSource, env),
    itemsExpr
  );
  const itemName = paramNames[0] ?? 'item';
  const indexName = paramNames[1] ?? 'index';
  const childScope: BindingScope = {
    ...env.scope,
    params: new Set([...env.scope.params, itemName, indexName]),
  };

  let keyAttr = '';
  if (keyExpr) {
    const keyBinding = eachKeyBinding(
      context,
      classSource,
      keyExpr,
      itemName,
      indexName
    );
    if (keyBinding) {
      keyAttr = ` ${context.dialect.directivePrefix}key="${keyBinding}"`;
    }
  }
  const inner = buildNodeLines(
    context,
    classSource,
    renderExpr.body,
    {
      ...env,
      scope: childScope,
      indent: env.indent + 1,
    },
    depth + 1
  );

  return [
    indent(env.indent) +
      `<block ${context.dialect.directivePrefix}for="{{${itemsBinding}}}" ${context.dialect.directivePrefix}for-item="${itemName}" ${context.dialect.directivePrefix}for-index="${indexName}"${keyAttr}>`,
    ...inner,
    indent(env.indent) + '</block>',
  ];
}

function eachKeyBinding(
  context: CompileContext,
  classSource: ClassSource,
  keyExpr: tsTypes.Node,
  itemName: string,
  indexName: string
): string | undefined {
  const { ts } = context;
  keyExpr = unwrapParentheses(ts, keyExpr);
  // 框架签名 each(items, render, key)，key 是 (item) => item.xxx 箭头函数
  if (ts.isArrowFunction(keyExpr)) {
    const body = arrowBodyExpression(ts, keyExpr);
    if (body === undefined) {
      throw mpError(
        classSource.filePath,
        'each 的 key 必须是 (item) => item.xxx 或 (item, index) => index'
      );
    }
    keyExpr = body;
  }
  if (ts.isIdentifier(keyExpr)) {
    if (keyExpr.text === indexName) {
      return undefined;
    }
    if (keyExpr.text === itemName) {
      throw mpError(
        classSource.filePath,
        '列表 key 不能直接使用 item，请取 item 的成员'
      );
    }
  }
  if (
    ts.isPropertyAccessExpression(keyExpr) &&
    ts.isIdentifier(keyExpr.expression)
  ) {
    const base = keyExpr.expression.text;
    if (base === itemName) {
      return keyExpr.name.text;
    }
  }
  const nested = eachKeyPath(ts, keyExpr, itemName);
  if (nested) {
    return nested;
  }
  throw mpError(
    classSource.filePath,
    'each 的 key 必须是 (item) => item.xxx 或 (item, index) => index'
  );
}

function arrowBodyExpression(
  ts: typeof tsTypes,
  arrow: tsTypes.ArrowFunction
): tsTypes.Expression | undefined {
  const body = arrow.body;
  if (ts.isBlock(body)) {
    const statements = body.statements.filter(
      (statement) => !ts.isEmptyStatement(statement)
    );
    if (
      statements.length === 1 &&
      ts.isReturnStatement(statements[0]) &&
      statements[0].expression
    ) {
      return statements[0].expression;
    }
    return undefined;
  }
  return body;
}

function eachKeyPath(
  ts: typeof tsTypes,
  node: tsTypes.Node,
  itemName: string
): string | undefined {
  node = unwrapParentheses(ts, node);
  if (!ts.isPropertyAccessExpression(node)) {
    return undefined;
  }
  let current: tsTypes.Expression = node;
  const parts: string[] = [];
  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = current.expression;
  }
  if (ts.isIdentifier(current) && current.text === itemName) {
    return parts.join('.');
  }
  return undefined;
}

function compileComponentCall(
  context: CompileContext,
  classSource: ClassSource,
  node: tsTypes.CallExpression,
  env: TemplateEnv,
  depth: number
): string[] {
  const { ts } = context;
  const first = unwrapParentheses(ts, node.arguments[0]);
  // 对象形态：createComponent({ component, props, children, emitters, directions })
  if (
    ts.isObjectLiteralExpression(first) &&
    objectProperty(ts, first, 'component')
  ) {
    return compileComponentObject(context, classSource, first, env, depth);
  }
  const [classExpr, propsExpr, childrenExpr] = node.arguments;
  if (!classExpr) {
    throw mpError(classSource.filePath, 'createComponent 缺少组件类参数');
  }
  const directionsExpr = node.arguments[4];
  return compileComponent(
    context,
    classSource,
    classExpr,
    propsExpr,
    childrenExpr,
    undefined,
    directionsExpr,
    env,
    depth
  );
}

function compileComponentObject(
  context: CompileContext,
  classSource: ClassSource,
  node: tsTypes.ObjectLiteralExpression,
  env: TemplateEnv,
  depth: number
): string[] {
  return compileComponent(
    context,
    classSource,
    objectProperty(context.ts, node, 'component')!,
    objectProperty(context.ts, node, 'props'),
    objectProperty(context.ts, node, 'children'),
    objectProperty(context.ts, node, 'emitters'),
    objectProperty(context.ts, node, 'directions'),
    env,
    depth
  );
}

function compileComponent(
  context: CompileContext,
  classSource: ClassSource,
  classExpr: tsTypes.Expression,
  propsExpr: tsTypes.Expression | undefined,
  childrenExpr: tsTypes.Expression | undefined,
  emittersExpr: tsTypes.Expression | undefined,
  directionsExpr: tsTypes.Expression | undefined,
  env: TemplateEnv,
  depth: number
): string[] {
  const { ts } = context;
  const target = resolveClassReference(context, classSource, classExpr);
  if (!isComponentSubclass(context, target)) {
    throw mpError(
      classSource.filePath,
      `createComponent 只接受 Component 子类: ${target.className}`
    );
  }
  const tag = kebabCase(target.className);
  env.builder.usedComponents.set(tag, target);

  const attrs: string[] = [...env.extraAttrs];
  const callSiteProps: Record<string, string> = {};

  if (propsExpr !== undefined) {
    if (!ts.isObjectLiteralExpression(propsExpr)) {
      throw mpError(
        classSource.filePath,
        'createComponent 的 props 必须是对象字面量'
      );
    }
    for (const property of propsExpr.properties) {
      if (
        !ts.isPropertyAssignment(property) ||
        !ts.isIdentifier(property.name)
      ) {
        throw mpError(classSource.filePath, '组件 props 只支持静态属性名');
      }
      const key = property.name.text;
      const value = property.initializer;
      if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
        throw mpError(
          classSource.filePath,
          `组件 props 传函数（${key}）暂不支持编译到小程序，请改用 emitters + this.emit 模式`
        );
      }
      callSiteProps[key] = inferPropType(context, classSource, value, env);
      const folded = foldExpression(ts, value, env.scope.consts);
      if (folded !== undefined && folded !== null) {
        attrs.push(`${key}="${escapeAttr(literalToString(folded))}"`);
      } else {
        const binding = toBinding(
          bindingContext(context, classSource, env),
          value
        );
        attrs.push(`${key}="{{${binding}}}"`);
      }
    }
    const existing = context.callSites.get(tag) ?? [];
    existing.push(callSiteProps);
    context.callSites.set(tag, existing);
  }

  if (emittersExpr !== undefined) {
    if (!ts.isObjectLiteralExpression(emittersExpr)) {
      throw mpError(classSource.filePath, 'emitters 必须是对象字面量');
    }
    for (const property of emittersExpr.properties) {
      if (!ts.isPropertyAssignment(property)) {
        throw mpError(classSource.filePath, 'emitters 只支持静态事件名');
      }
      const eventName =
        ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
          ? property.name.text
          : undefined;
      if (eventName === undefined) {
        throw mpError(classSource.filePath, 'emitters 只支持静态事件名');
      }
      const usage = compileEmitterHandler(
        context,
        classSource,
        property.initializer
      );
      if (!usage) {
        throw mpError(
          classSource.filePath,
          'emitters 处理器只支持 () => this.method() 或 (value) => this.method(value)'
        );
      }
      usage.event = eventName;
      const key = `__transone_emitter_${eventName}_${env.builder.emitters.length}`;
      usage.key = key;
      env.builder.emitters.push(usage);
      attrs.push(`bind:${eventName}="${key}"`);
    }
  }

  if (directionsExpr !== undefined) {
    if (!ts.isObjectLiteralExpression(directionsExpr)) {
      throw mpError(classSource.filePath, 'directions 必须是对象字面量');
    }
    const ifExpr = objectProperty(ts, directionsExpr, 'if');
    if (ifExpr) {
      const folded = foldExpression(ts, ifExpr, env.scope.consts);
      if (folded === false) {
        return [];
      }
      if (folded !== true) {
        attrs.push(
          `${context.dialect.directivePrefix}if="{{${toBinding(bindingContext(context, classSource, env), ifExpr)}}}"`
        );
      }
    }
  }

  const openTag = attrs.length > 0 ? `<${tag} ${attrs.join(' ')}>` : `<${tag}>`;
  const lines = [indent(env.indent) + openTag];
  const childLines = buildNodeLines(
    context,
    classSource,
    childrenExpr ?? ts.factory.createArrayLiteralExpression([]),
    {
      ...env,
      indent: env.indent + 1,
    },
    depth + 1
  );
  lines.push(...childLines);
  lines.push(indent(env.indent) + `</${tag}>`);
  return lines;
}

function compileSlot(
  context: CompileContext,
  classSource: ClassSource,
  node: tsTypes.CallExpression,
  env: TemplateEnv
): string[] {
  const nameExpr = node.arguments[0];
  if (!nameExpr) {
    return [indent(env.indent) + '<slot/>'];
  }
  const name = compileLiteralString(
    context,
    classSource,
    nameExpr,
    'slot 名称'
  );
  // TransOne 统一以 slot('default') 表示默认插槽；小程序模板中默认插槽
  // 必须省略 name，否则调用侧未声明 slot="default" 的普通子节点不会被投影。
  if (name === 'default') {
    return [indent(env.indent) + '<slot/>'];
  }
  return [indent(env.indent) + `<slot name="${name}"/>`];
}

function compileListener(
  context: CompileContext,
  classSource: ClassSource,
  eventName: string,
  handlerExpr: tsTypes.Expression,
  env: TemplateEnv
): string {
  const wxmlEvent = EVENT_MAP[eventName];
  if (!wxmlEvent) {
    throw mpError(
      classSource.filePath,
      `不支持的小程序事件 "${eventName}"（支持: ${Object.keys(EVENT_MAP).join('/')}）`
    );
  }
  const method = compileHandlerMethod(context, classSource, handlerExpr);
  env.builder.handlers.add(method);
  return `${context.dialect.bindEvent(wxmlEvent)}="${method}"`;
}

function compileHandlerMethod(
  context: CompileContext,
  classSource: ClassSource,
  handlerExpr: tsTypes.Expression
): string {
  const { ts } = context;
  handlerExpr = unwrapParentheses(ts, handlerExpr);

  if (
    ts.isPropertyAccessExpression(handlerExpr) &&
    isThisExpression(ts, handlerExpr.expression)
  ) {
    return handlerExpr.name.text;
  }

  if (ts.isArrowFunction(handlerExpr)) {
    const call = singleMethodCall(ts, handlerExpr.body);
    if (call && call.args.length === 0) {
      return call.method;
    }
    // (e) => this.method(e)：透传事件对象，方法里通过 e.currentTarget.dataset 取数；
    // 实参上的 TS 类型断言（e as TapEvent）不影响运行时语义，直接剥掉再匹配
    const arg =
      call && call.args.length === 1
        ? unwrapTypeAssertions(ts, call.args[0])
        : undefined;
    if (
      call &&
      call.args.length === 1 &&
      handlerExpr.parameters.length === 1 &&
      ts.isIdentifier(handlerExpr.parameters[0].name) &&
      arg !== undefined &&
      ts.isIdentifier(arg) &&
      handlerExpr.parameters[0].name.text === arg.text
    ) {
      return call.method;
    }
  }
  throw mpError(
    classSource.filePath,
    '事件处理器必须是 () => this.method()、this.method 或 (e) => this.method(e) 形式'
  );
}

function compileEmitterHandler(
  context: CompileContext,
  _classSource: ClassSource,
  handlerExpr: tsTypes.Expression
): EmitterUsage | undefined {
  const { ts } = context;
  handlerExpr = unwrapParentheses(ts, handlerExpr);

  if (
    ts.isPropertyAccessExpression(handlerExpr) &&
    isThisExpression(ts, handlerExpr.expression)
  ) {
    return { event: 'pending', method: handlerExpr.name.text, passArgs: true, key: '' };
  }
  if (!ts.isArrowFunction(handlerExpr)) {
    return undefined;
  }
  const call = singleMethodCall(ts, handlerExpr.body);
  if (!call) {
    return undefined;
  }
  if (call.args.length === 0) {
    return { event: 'pending', method: call.method, passArgs: false, key: '' };
  }
  const arg =
    call.args.length === 1 ? unwrapTypeAssertions(ts, call.args[0]) : undefined;
  if (
    call.args.length === 1 &&
    handlerExpr.parameters.length === 1 &&
    ts.isIdentifier(handlerExpr.parameters[0].name) &&
    arg !== undefined &&
    ts.isIdentifier(arg) &&
    handlerExpr.parameters[0].name.text === arg.text
  ) {
    return { event: 'pending', method: call.method, passArgs: true, key: '' };
  }
  return undefined;
}

function singleMethodCall(
  ts: typeof tsTypes,
  body: tsTypes.ConciseBody
): { method: string; args: tsTypes.NodeArray<tsTypes.Expression> } | undefined {
  let callExpr: tsTypes.CallExpression | undefined;
  if (ts.isCallExpression(body)) {
    callExpr = body;
  } else if (ts.isBlock(body)) {
    const statements = body.statements.filter(
      (statement) => !ts.isEmptyStatement(statement)
    );
    if (statements.length !== 1 || !ts.isExpressionStatement(statements[0])) {
      return undefined;
    }
    const expression = statements[0].expression;
    if (!ts.isCallExpression(expression)) {
      return undefined;
    }
    callExpr = expression;
  } else {
    return undefined;
  }
  const callee = callExpr.expression;
  if (
    !ts.isPropertyAccessExpression(callee) ||
    !isThisExpression(ts, callee.expression)
  ) {
    return undefined;
  }
  return { method: callee.name.text, args: callExpr.arguments };
}

/** 剥掉表达式上的 TS 类型断言（as T / <T> / 非空断言），用于参数透传匹配。 */
function unwrapTypeAssertions(
  ts: typeof tsTypes,
  expression: tsTypes.Node
): tsTypes.Node {
  let node = expression;
  for (;;) {
    if (ts.isAsExpression(node)) {
      node = node.expression;
      continue;
    }
    if (ts.isTypeAssertionExpression(node)) {
      node = node.expression;
      continue;
    }
    if (ts.isNonNullExpression(node)) {
      node = node.expression;
      continue;
    }
    return node;
  }
}

function compileClassAttr(
  context: CompileContext,
  classSource: ClassSource,
  value: tsTypes.Expression,
  env: TemplateEnv
): string {
  const { ts } = context;
  const folded = foldExpression(ts, value, env.scope.consts);
  if (typeof folded === 'string') {
    // 静态 class 命中 hover 样式时挂 hover-class（WXSS 无 :hover 伪类）
    const hoverClass = hoverClassName(folded, env.hoverSelectors);
    return hoverClass
      ? `class="${escapeAttr(folded)}" hover-class="${hoverClass}"`
      : `class="${escapeAttr(folded)}"`;
  }
  // 折叠结果为 null 表示显式空 class（如某个 const 值为 null）；折叠失败
  // （依赖 each 参数/state 的动态表达式）则回退为模板绑定。
  if (folded === null) {
    return '';
  }
  const text = rawTemplateText(ts, value);
  if (text !== undefined) {
    const hoverClass = hoverClassName(text, env.hoverSelectors);
    return hoverClass
      ? `class="${escapeAttr(text)}" hover-class="${hoverClass}"`
      : `class="${escapeAttr(text)}"`;
  }
  return `class="{{${toBinding(bindingContext(context, classSource, env), value)}}}"`;
}

/** 选择器 '.card' 命中 hover 样式时，返回微信 hover-class 类名（'card-hover'）。 */
function hoverClassName(
  className: string,
  hoverSelectors: Set<string>
): string | undefined {
  for (const single of className.split(/\s+/)) {
    if (single === '') {
      continue;
    }
    if (hoverSelectors.has(single) || hoverSelectors.has(`.${single}`)) {
      return `${single.replace(/^\./, '')}-hover`;
    }
  }
  return undefined;
}

function compileStyleAttr(
  context: CompileContext,
  classSource: ClassSource,
  value: tsTypes.Expression,
  env: TemplateEnv
): string {
  const { ts } = context;
  const options = unwrapParentheses(ts, value);
  if (!ts.isObjectLiteralExpression(options)) {
    throw mpError(classSource.filePath, 'style 属性必须是对象字面量');
  }
  const declarations: string[] = [];
  for (const property of options.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) {
      throw mpError(classSource.filePath, 'style 属性只支持静态键');
    }
    const cssKey = property.name.text.replace(/([A-Z])/g, '-$1').toLowerCase();
    const folded = foldExpression(ts, property.initializer, env.scope.consts);
    if (typeof folded === 'string' || typeof folded === 'number') {
      declarations.push(`${cssKey}: ${String(folded)};`);
    } else {
      // 动态值：识别 `表达式 + '单位'`（如 item.width + '%'）拆成标准插值
      // style="width: {{item.width}}%;"（微信官方推荐，比表达式拼接更可靠）
      const unitSplit = splitUnitExpression(ts, property.initializer);
      if (unitSplit) {
        declarations.push(
          `${cssKey}: {{${toBinding(bindingContext(context, classSource, env), unitSplit.expr)}}}${unitSplit.unit};`
        );
      } else {
        declarations.push(
          `${cssKey}: {{${toBinding(bindingContext(context, classSource, env), property.initializer)}}};`
        );
      }
    }
  }
  return `style="${escapeAttr(declarations.join(' '))}"`;
}

/**
 * 识别 `表达式 + '单位'` 形态（item.width + '%' / p.x + 'px'），返回表达式与单位；
 * 仅当右侧为纯单位字符串字面量时拆解，其他动态表达式原样走 {{expr}}。
 */
function splitUnitExpression(
  ts: typeof tsTypes,
  expr: tsTypes.Expression
): { expr: tsTypes.Expression; unit: string } | undefined {
  expr = unwrapParentheses(ts, expr);
  if (!ts.isBinaryExpression(expr)) {
    return undefined;
  }
  if (expr.operatorToken.kind !== ts.SyntaxKind.PlusToken) {
    return undefined;
  }
  const right = unwrapParentheses(ts, expr.right);
  if (!ts.isStringLiteral(right)) {
    return undefined;
  }
  const unit = right.text;
  if (!/^[a-z%]+$/i.test(unit)) {
    return undefined;
  }
  return { expr: expr.left, unit };
}

function compileGenericAttr(
  context: CompileContext,
  classSource: ClassSource,
  key: string,
  value: tsTypes.Expression,
  env: TemplateEnv
): string {
  const { ts } = context;
  const attrName = wxmlAttrName(key);
  const folded = foldExpression(ts, value, env.scope.consts);
  if (folded !== undefined) {
    if (folded === false || folded === null) {
      return '';
    }
    if (folded === true) {
      return attrName;
    }
    return `${attrName}="${escapeAttr(literalToString(folded))}"`;
  }
  const text = rawTemplateText(ts, value);
  if (text !== undefined) {
    return `${attrName}="${escapeAttr(text)}"`;
  }
  return `${attrName}="{{${toBinding(bindingContext(context, classSource, env), value)}}}"`;
}

/** 需要 kebab-case 输出的微信组件属性（如 scrollX -> scroll-x）。 */
const KEBAB_ATTRS: Record<string, string> = {
  scrollX: 'scroll-x',
  scrollY: 'scroll-y',
  scrollIntoView: 'scroll-into-view',
  scrollWithAnimation: 'scroll-with-animation',
  scrollAnchoring: 'scroll-anchoring',
  enableFlex: 'enable-flex',
  enableScroll: 'enable-scroll',
  enableZoom: 'enable-zoom',
  enablePassive: 'enable-passive',
  autoFocus: 'auto-focus',
  confirmType: 'confirm-type',
  confirmHold: 'confirm-hold',
  cursorSpacing: 'cursor-spacing',
  selectionStart: 'selection-start',
  selectionEnd: 'selection-end',
  showConfirmBar: 'show-confirm-bar',
  adjustPosition: 'adjust-position',
  holdKeyboard: 'hold-keyboard',
  disableDefaultPadding: 'disable-default-padding',
  disableAutoPush: 'disable-auto-push',
  disableBeforeInput: 'disable-before-input',
  showMarker: 'show-marker',
  enablePublish: 'enable-publish',
  markerCluster: 'marker-cluster',
  showLocation: 'show-location',
  showCompass: 'show-compass',
  enableSatellite: 'enable-satellite',
  enableTraffic: 'enable-traffic',
  enableBuilding: 'enable-building',
  enableRotate: 'enable-rotate',
  enableOverlooking: 'enable-overlooking',
  subKey: 'sub-key',
  enableLazy: 'enable-lazy',
  showMenuByLongpress: 'show-menu-by-longpress',
  openType: 'open-type',
  formType: 'form-type',
  unitId: 'unit-id',
  hoverClass: 'hover-class',
  hoverStartTime: 'hover-start-time',
  hoverStayTime: 'hover-stay-time',
  hoverStopPropagation: 'hover-stop-propagation',
  plain: 'plain',
  loading: 'loading',
  disabled: 'disabled',
  size: 'size',
};

/**
 * 属性名转 WXML：href -> url；data 前缀（dataId）转 data-id（dataset）；
 * 白名单内 camelCase 转 kebab（scrollX -> scroll-x）；其余原样输出。
 */
function wxmlAttrName(key: string): string {
  if (key === 'href') {
    return 'url';
  }
  if (key.startsWith('data') && key.length > 4) {
    return `data${key
      .slice(4)
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()}`;
  }
  return KEBAB_ATTRS[key] ?? key;
}

function compileLiteralString(
  context: CompileContext,
  classSource: ClassSource,
  value: tsTypes.Expression,
  what: string
): string {
  const { ts } = context;
  const folded = foldExpression(ts, value, new Map());
  if (typeof folded !== 'string') {
    throw mpError(classSource.filePath, `${what}必须是字符串字面量`);
  }
  return folded;
}

function textContent(
  context: CompileContext,
  classSource: ClassSource,
  node: tsTypes.Node,
  env: TemplateEnv
): string {
  const { ts } = context;
  node = unwrapParentheses(ts, node);
  if (ts.isStringLiteral(node)) {
    return escapeXml(node.text);
  }
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text.includes('{{') ? node.text : escapeXml(node.text);
  }
  if (ts.isTemplateExpression(node)) {
    return `{{${toBinding(bindingContext(context, classSource, env), node)}}}`;
  }
  if (ts.isIdentifier(node)) {
    if (env.scope.params.has(node.text)) {
      return `{{${node.text}}}`;
    }
    const replacement = resolveIdentifierExpression(
      context,
      classSource,
      node,
      env
    );
    if (replacement) {
      return textContent(context, classSource, replacement, env);
    }
    throw mpError(classSource.filePath, `无法解析模板标识符 "${node.text}"`);
  }
  if (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node)
  ) {
    return `{{${toBinding(bindingContext(context, classSource, env), node)}}}`;
  }
  throw mpError(
    classSource.filePath,
    `不支持的文本节点: ${node.getText().slice(0, 60)}`
  );
}

function isTextNode(ts: typeof tsTypes, node: tsTypes.Node): boolean {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node)
  );
}

function resolveIdentifierExpression(
  _context: CompileContext,
  _classSource: ClassSource,
  node: tsTypes.Identifier,
  env: TemplateEnv
): tsTypes.Expression | undefined {
  if (env.scope.locals.has(node.text)) {
    return env.scope.locals.get(node.text)!;
  }
  if (env.scope.consts.has(node.text)) {
    return env.scope.consts.get(node.text)!;
  }
  return undefined;
}

function bindingContext(
  context: CompileContext,
  classSource: ClassSource,
  env: TemplateEnv
) {
  return {
    ts: context.ts,
    scope: env.scope,
    filePath: classSource.filePath,
    onProp: (name: string) => env.builder.propsReferenced.add(name),
  };
}

function callName(
  ts: typeof tsTypes,
  expression: tsTypes.Expression
): string | undefined {
  expression = unwrapParentheses(ts, expression);
  if (ts.isIdentifier(expression)) {
    return expression.text;
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  return undefined;
}

function objectProperty(
  ts: typeof tsTypes,
  object: tsTypes.ObjectLiteralExpression,
  key: string
): tsTypes.Expression | undefined {
  for (const property of object.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === key
    ) {
      return property.initializer;
    }
  }
  return undefined;
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

/** 收集从 transone 导入的本地名 -> 原始导出名（处理别名）。 */
function collectFactoryOrigins(
  ts: typeof tsTypes,
  source: tsTypes.SourceFile
): Map<string, string> {
  const origins = new Map<string, string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }
    const specifier = statement.moduleSpecifier.getText().replace(/['"]/g, '');
    if (!specifier.includes('transone')) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) {
      continue;
    }
    for (const element of bindings.elements) {
      const local = element.name.text;
      const original = element.propertyName?.text ?? local;
      if (ELEMENT_FACTORIES.has(original) || SPECIAL_CALLS.has(original)) {
        origins.set(local, original);
      }
    }
  }
  return origins;
}

function inferPropType(
  context: CompileContext,
  _classSource: ClassSource,
  value: tsTypes.Expression,
  env: TemplateEnv
): string {
  const { ts } = context;
  const folded = foldExpression(ts, value, env.scope.consts);
  if (typeof folded === 'string') {
    return 'String';
  }
  if (typeof folded === 'number') {
    return 'Number';
  }
  if (typeof folded === 'boolean') {
    return 'Boolean';
  }
  if (Array.isArray(folded)) {
    return 'Array';
  }
  if (folded !== undefined && typeof folded === 'object') {
    return 'Object';
  }
  return 'null';
}

function rawTemplateText(
  ts: typeof tsTypes,
  node: tsTypes.Node
): string | undefined {
  node = unwrapParentheses(ts, node);
  if (ts.isNoSubstitutionTemplateLiteral(node) && node.text.includes('{{')) {
    return node.text;
  }
  return undefined;
}

function literalToString(value: FoldedValue): string {
  return typeof value === 'string' ? value : String(value);
}

function kebabCase(name: string): string {
  const kebab = name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9-]/g, '')
    .toLowerCase();
  if (!kebab) {
    throw new Error(`无法从类名 "${name}" 生成组件标签名`);
  }
  return kebab;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeXml(value).replace(/"/g, '&quot;');
}

function indent(level: number): string {
  return '  '.repeat(level);
}

export function findMethod(
  context: CompileContext,
  classSource: ClassSource,
  name: string
): tsTypes.MethodDeclaration | undefined {
  const { ts } = context;
  return classSource.declaration.members.find(
    (member): member is tsTypes.MethodDeclaration =>
      ts.isMethodDeclaration(member) && member.name.getText() === name
  );
}

export { kebabCase };
