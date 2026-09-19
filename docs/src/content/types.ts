/**
 * 文档内容 DSL：页面由结构化块（block）组成，由 DocArticle 统一渲染。
 * 内容即数据，后续做多语言（t()）或静态校验都无需改动渲染层。
 */

export interface InlineCode {
  kind: 'code';
  text: string;
}

export interface InlineLink {
  kind: 'link';
  text: string;
  href: string;
}

export interface InlineStrong {
  kind: 'strong';
  text: string;
}

export type InlineNode = string | InlineCode | InlineLink | InlineStrong;

export interface HeadingBlock {
  type: 'heading';
  level: 1 | 2 | 3;
  text: string;
}

export interface ParagraphBlock {
  type: 'paragraph';
  content: InlineNode[];
}

export interface CodeBlock {
  type: 'code';
  lang: string;
  code: string;
}

export interface ListBlock {
  type: 'list';
  ordered: boolean;
  items: Array<InlineNode[] | DocBlock>;
}

export interface TableBlock {
  type: 'table';
  headers: string[];
  rows: string[][];
}

export interface ApiRow {
  name: string;
  type: string;
  description: string;
}

export interface ApiTableBlock {
  type: 'api-table';
  caption: string;
  rows: ApiRow[];
}

export interface CalloutBlock {
  type: 'callout';
  variant: 'info' | 'tip' | 'warn';
  title?: string;
  content: InlineNode[];
}

export interface LinkGridItem {
  title: string;
  description: string;
  href: string;
}

export interface LinkGridBlock {
  type: 'link-grid';
  items: LinkGridItem[];
}

export interface HeroBlock {
  type: 'hero';
  badge: string;
  title: string;
  subtitle: string;
  actions: Array<{ label: string; href: string; primary?: boolean }>;
}

export interface FeatureGridBlock {
  type: 'feature-grid';
  items: Array<{ title: string; description: string }>;
}

export interface DemoBlock {
  /** 对应 demos/demoRegistry 的 key（如 'button'、'switch'）。 */
  type: 'demo';
  id: string;
}

export type DocBlock =
  | HeadingBlock
  | ParagraphBlock
  | CodeBlock
  | ListBlock
  | TableBlock
  | ApiTableBlock
  | CalloutBlock
  | LinkGridBlock
  | HeroBlock
  | FeatureGridBlock
  | DemoBlock;

/**
 * 文档分区（侧边栏父菜单）：transone / transone-cli / transone-ui / 项目。
 * 每个分区有一个父级落地页（transone → /，cli → /cli，ui → /ui，project → /project），
 * 其余页面作为该分区父菜单下的子菜单。
 */
export type DocSection = 'transone' | 'cli' | 'ui' | 'project';

export interface DocPage {
  /** 站点内路由，如 /cli/commands/（不含部署 base）。 */
  path: string;
  title: string;
  description: string;
  section: DocSection;
  /** 侧边栏内排序：分区落地页为 -1，其余按序递增。 */
  order: number;
  body: DocBlock[];
}

// ---- builders ----

export function heading(level: 1 | 2 | 3, text: string): HeadingBlock {
  return { type: 'heading', level, text };
}

export function paragraph(...content: InlineNode[]): ParagraphBlock {
  return { type: 'paragraph', content };
}

export function codeBlock(lang: string, code: string): CodeBlock {
  return { type: 'code', lang, code };
}

export function ul(items: Array<InlineNode[] | DocBlock>): ListBlock {
  return { type: 'list', ordered: false, items };
}

export function ol(items: Array<InlineNode[] | DocBlock>): ListBlock {
  return { type: 'list', ordered: true, items };
}

export function table(headers: string[], rows: string[][]): TableBlock {
  return { type: 'table', headers, rows };
}

export function apiTable(caption: string, rows: ApiRow[]): ApiTableBlock {
  return { type: 'api-table', caption, rows };
}

export function callout(
  variant: CalloutBlock['variant'],
  content: InlineNode[],
  title?: string
): CalloutBlock {
  return { type: 'callout', variant, content, ...(title ? { title } : {}) };
}

export function linkGrid(items: LinkGridItem[]): LinkGridBlock {
  return { type: 'link-grid', items };
}

export function hero(
  badge: string,
  title: string,
  subtitle: string,
  actions: HeroBlock['actions']
): HeroBlock {
  return { type: 'hero', badge, title, subtitle, actions };
}

export function featureGrid(
  items: FeatureGridBlock['items']
): FeatureGridBlock {
  return { type: 'feature-grid', items };
}

export function demo(id: string): DemoBlock {
  return { type: 'demo', id };
}

export const inlineCode = (text: string): InlineCode => ({ kind: 'code', text });
export const link = (text: string, href: string): InlineLink => ({
  kind: 'link',
  text,
  href,
});
export const strong = (text: string): InlineStrong => ({
  kind: 'strong',
  text,
});
