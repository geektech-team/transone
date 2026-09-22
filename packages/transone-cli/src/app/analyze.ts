import { existsSync, readFileSync } from 'node:fs';
import type * as tsTypes from 'typescript';
import { loadTypescript } from '../mp/ts-loader';
import { nativeError } from './errors';
import type { NativeAction, NativeNode, NativeScreen, NativeStateEntry, NativeStyle, NativeTextPart } from './types';

const CONTAINERS = new Set(['view', 'main', 'div']);
const TEXT = new Set(['text', 'span', 'p', 'h1']);
const STYLE_KEYS = new Set(['color', 'backgroundColor', 'fontSize', 'fontWeight', 'padding', 'margin', 'width', 'height', 'borderRadius', 'textAlign']);

export async function analyzeNativeScreen(entry: string): Promise<NativeScreen> {
  if (!existsSync(entry)) throw nativeError(entry, '源文件不存在');
  const ts = await loadTypescript();
  const source = ts.createSourceFile(entry, readFileSync(entry, 'utf8'), ts.ScriptTarget.Latest, true);
  const component = source.statements.find((s): s is tsTypes.ClassDeclaration => ts.isClassDeclaration(s));
  if (!component) throw nativeError(entry, '未找到 Component 类');
  const state = readState(ts, component, entry);
  const actions = new Map<string, NativeAction>();
  for (const member of component.members) if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
    const action = readAction(ts, member, entry); if (action) actions.set(member.name.text, action);
  }
  const render = component.members.find((m): m is tsTypes.MethodDeclaration => ts.isMethodDeclaration(m) && m.name.getText(source) === 'render');
  const value = render?.body?.statements.find(ts.isReturnStatement)?.expression;
  if (!value || !ts.isObjectLiteralExpression(value)) throw nativeError(entry, 'render() 必须返回静态 VNode 对象');
  const root = readNode(ts, value, entry, new Set(state.map((item) => item.key)), actions);
  if (root.kind !== 'container') throw nativeError(entry, '根节点必须是容器节点');
  return { name: component.name?.text ?? 'App', state, root };
}

function readState(ts: typeof tsTypes, component: tsTypes.ClassDeclaration, file: string): NativeStateEntry[] {
  const method = component.members.find((m): m is tsTypes.MethodDeclaration => ts.isMethodDeclaration(m) && m.name.getText() === 'initState');
  const value = method?.body?.statements.find(ts.isReturnStatement)?.expression;
  if (!value) return [];
  if (!ts.isObjectLiteralExpression(value)) throw nativeError(file, 'initState() 必须返回对象字面量');
  return value.properties.map((item) => {
    if (!ts.isPropertyAssignment(item) || !ts.isIdentifier(item.name)) throw nativeError(file, 'state 必须使用标识符属性');
    const literal = literalValue(ts, item.initializer);
    if (literal === undefined) throw nativeError(file, `state.${item.name.text} 必须是字面量`);
    return { key: item.name.text, value: literal };
  });
}

function readAction(ts: typeof tsTypes, method: tsTypes.MethodDeclaration, file: string): NativeAction | undefined {
  const expression = method.body?.statements[0];
  if (!expression || !ts.isExpressionStatement(expression) || !ts.isBinaryExpression(expression.expression)) return undefined;
  const binary = expression.expression;
  if (!ts.isPropertyAccessExpression(binary.left) || !ts.isPropertyAccessExpression(binary.left.expression) || binary.left.expression.expression.kind !== ts.SyntaxKind.ThisKeyword || binary.left.expression.name.text !== 'state') return undefined;
  const value = literalValue(ts, binary.right); const key = binary.left.name.text;
  if ((binary.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken || binary.operatorToken.kind === ts.SyntaxKind.MinusEqualsToken) && typeof value === 'number') return { kind: 'increment', key, by: binary.operatorToken.kind === ts.SyntaxKind.MinusEqualsToken ? -value : value };
  if (binary.operatorToken.kind === ts.SyntaxKind.EqualsToken && value !== undefined) return { kind: 'set-literal', key, value };
  throw nativeError(file, `方法 ${method.name.getText()} 不支持原生编译`);
}

function readNode(ts: typeof tsTypes, node: tsTypes.ObjectLiteralExpression, file: string, state: Set<string>, actions: Map<string, NativeAction>): NativeNode {
  const tag = stringValue(ts, get(ts, node, 'tag'), file, 'VNode tag');
  const style = readStyle(ts, get(ts, node, 'props'), file);
  const children = get(ts, node, 'children');
  const childNodes = children && ts.isArrayLiteralExpression(children) ? [...children.elements].filter(ts.isExpression) : [];
  if (CONTAINERS.has(tag)) return { kind: 'container', children: childNodes.map((child) => {
    if (!ts.isObjectLiteralExpression(child)) throw nativeError(file, '容器 children 只支持静态 VNode');
    return readNode(ts, child, file, state, actions);
  }), ...(style ? { style } : {}) };
  const parts = childNodes.flatMap((child) => readText(ts, child, file, state));
  if (TEXT.has(tag)) return { kind: 'text', parts, ...(style ? { style } : {}) };
  if (tag === 'button') return { kind: 'button', parts, action: readClick(ts, get(ts, node, 'listeners'), file, actions), ...(style ? { style } : {}) };
  throw nativeError(file, `不支持的原生节点: ${tag}`);
}

function readText(ts: typeof tsTypes, expression: tsTypes.Expression, file: string, state: Set<string>): NativeTextPart[] {
  const value = literalValue(ts, expression); if (typeof value !== 'string') throw nativeError(file, '文本 children 必须是字符串字面量');
  const result: NativeTextPart[] = []; const matcher = /{{([^}]+)}}/g; let cursor = 0; let match: RegExpExecArray | null;
  while ((match = matcher.exec(value))) { if (match.index > cursor) result.push({ kind: 'literal', value: value.slice(cursor, match.index) }); const key = match[1]; if (!/^[A-Za-z_$][\w$]*$/.test(key) || !state.has(key)) throw nativeError(file, '只支持已声明 state 的 {{key}} 绑定'); result.push({ kind: 'state', key }); cursor = matcher.lastIndex; }
  if (cursor < value.length || result.length === 0) result.push({ kind: 'literal', value: value.slice(cursor) }); return result;
}

function readClick(ts: typeof tsTypes, listeners: tsTypes.Expression | undefined, file: string, actions: Map<string, NativeAction>): NativeAction {
  if (!listeners || !ts.isObjectLiteralExpression(listeners)) throw nativeError(file, 'button 必须声明 listeners.click');
  const handler = get(ts, listeners, 'click');
  const body = handler && ts.isArrowFunction(handler) ? handler.body : undefined;
  const expression = body && ts.isCallExpression(body) ? body : body && ts.isBlock(body) && ts.isExpressionStatement(body.statements[0]) ? body.statements[0].expression : undefined;
  if (!expression || !ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression) || expression.expression.expression.kind !== ts.SyntaxKind.ThisKeyword) throw nativeError(file, 'click 只支持调用 this.method()');
  const action = actions.get(expression.expression.name.text); if (!action) throw nativeError(file, `click 方法 ${expression.expression.name.text} 不支持原生编译`); return action;
}

function readStyle(ts: typeof tsTypes, props: tsTypes.Expression | undefined, file: string): NativeStyle | undefined {
  if (!props || !ts.isObjectLiteralExpression(props)) return undefined; const style = get(ts, props, 'style'); if (!style || !ts.isObjectLiteralExpression(style)) return undefined;
  const out: Record<string, string | number> = {}; for (const item of style.properties) { if (!ts.isPropertyAssignment(item) || !ts.isIdentifier(item.name) || !STYLE_KEYS.has(item.name.text)) throw nativeError(file, '不支持的原生样式属性'); const value = literalValue(ts, item.initializer); const keyword = item.name.text === 'color' || item.name.text === 'backgroundColor' || item.name.text === 'fontWeight' || item.name.text === 'textAlign'; if (keyword && (typeof value === 'string' || typeof value === 'number')) { out[item.name.text] = value; continue; } if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+(\.\d+)?px$/.test(value))) throw nativeError(file, `样式 ${item.name.text} 只支持数字或 px`); out[item.name.text] = typeof value === 'string' ? Number.parseFloat(value) : value; } return out as NativeStyle;
}

function get(ts: typeof tsTypes, node: tsTypes.ObjectLiteralExpression, name: string): tsTypes.Expression | undefined { const item = node.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText().replace(/['"]/g, '') === name); return item && ts.isPropertyAssignment(item) ? item.initializer : undefined; }
function stringValue(ts: typeof tsTypes, expression: tsTypes.Expression | undefined, file: string, label: string): string { const value = expression && literalValue(ts, expression); if (typeof value !== 'string') throw nativeError(file, `${label} 必须是字符串`); return value; }
function literalValue(ts: typeof tsTypes, value: tsTypes.Expression): string | number | boolean | undefined { if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text; if (ts.isNumericLiteral(value)) return Number(value.text); if (value.kind === ts.SyntaxKind.TrueKeyword) return true; if (value.kind === ts.SyntaxKind.FalseKeyword) return false; return undefined; }
