import { RendererContext } from './renderer';
import type { ComponentInstance, Renderable } from './renderer/types';
import { TemplateEngine } from './template';
import { renderStyleSheet, type StyleSheet } from '../style/sheet';

export {
  renderStyleSheet,
  type StyleAtRule,
  type StyleProperties,
  type StyleRule,
  type StyleSheet,
  type StyleSheetEntry,
  type StyleValue,
} from '../style/sheet';

export type HtmlAttributeValue = string | number | boolean | null | undefined;

export type HtmlAttributes = Record<string, HtmlAttributeValue>;

export type HtmlDocumentBody = Renderable | Renderable[];

export interface HtmlHeadElement {
  tag: string;
  attributes?: HtmlAttributes;
  text?: string;
}

export interface HtmlScript {
  src: string;
  type?: string;
  async?: boolean;
  defer?: boolean;
  attributes?: HtmlAttributes;
}

export interface HtmlDocumentOptions {
  title: string;
  body: HtmlDocumentBody;
  lang?: string;
  charset?: string;
  viewport?: string;
  description?: string;
  htmlAttributes?: HtmlAttributes;
  bodyAttributes?: HtmlAttributes;
  head?: HtmlHeadElement[];
  styles?: StyleSheet;
  scripts?: HtmlScript[];
}

const VOID_HEAD_TAGS = new Set(['base', 'link', 'meta']);

export function renderHtmlDocument(options: HtmlDocumentOptions): string {
  const lang = options.lang ?? 'en';
  const charset = options.charset ?? 'utf-8';
  const viewport = options.viewport ?? 'width=device-width, initial-scale=1';
  const htmlAttributes = renderAttributes({
    lang,
    ...(options.htmlAttributes ?? {}),
  });
  const bodyAttributes = renderAttributes(options.bodyAttributes);
  const bodyHtml = renderDocumentBody(options.body);

  return [
    '<!doctype html>',
    `<html${htmlAttributes}>`,
    '<head>',
    `  <meta charset="${escapeHtml(charset)}">`,
    `  <meta name="viewport" content="${escapeHtml(viewport)}">`,
    `  <title>${escapeHtml(options.title)}</title>`,
    options.description
      ? `  <meta name="description" content="${escapeHtml(
          options.description
        )}">`
      : '',
    ...(options.head ?? []).map((element) => `  ${renderHeadElement(element)}`),
    options.styles && options.styles.length > 0
      ? `  <style>${renderStyleSheet(options.styles)}</style>`
      : '',
    '</head>',
    `<body${bodyAttributes}>`,
    bodyHtml,
    ...(options.scripts ?? []).map((script) => `  ${renderScript(script)}`),
    '</body>',
    '</html>',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

function renderDocumentBody(body: HtmlDocumentBody): string {
  if (typeof document === 'undefined') {
    throw new Error('renderHtmlDocument requires a DOM-like document');
  }

  const container = document.createElement('div');
  const renderer = new RendererContext();
  const mountedComponents = new Set<ComponentInstance>();
  const renderables = Array.isArray(body) ? body : [body];
  const context = {
    templateEngine: new TemplateEngine({}),
    renderer,
    slots: { default: [] },
    registerChild: (component: ComponentInstance) => {
      mountedComponents.add(component);
    },
    unregisterChild: (component: ComponentInstance) => {
      mountedComponents.delete(component);
    },
  };

  renderables.forEach((renderable) => {
    container.appendChild(renderer.mount(renderable, context));
  });

  const html = container.innerHTML;
  mountedComponents.forEach((component) => {
    component.unmount();
  });

  return html;
}

function renderHeadElement(element: HtmlHeadElement): string {
  const attributes = renderAttributes(element.attributes);
  if (VOID_HEAD_TAGS.has(element.tag) && !element.text) {
    return `<${element.tag}${attributes}>`;
  }

  return `<${element.tag}${attributes}>${escapeHtml(
    element.text ?? ''
  )}</${element.tag}>`;
}

function renderScript(script: HtmlScript): string {
  const attributes = renderAttributes({
    type: script.type,
    src: script.src,
    async: script.async,
    defer: script.defer,
    ...(script.attributes ?? {}),
  });

  return `<script${attributes}></script>`;
}

function renderAttributes(attributes: HtmlAttributes = {}): string {
  const rendered = Object.entries(attributes)
    .flatMap(([name, value]) => {
      if (value === false || value === null || value === undefined) {
        return [];
      }

      return value === true
        ? [name]
        : [`${name}="${escapeHtml(String(value))}"`];
    })
    .join(' ');

  return rendered ? ` ${rendered}` : '';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
