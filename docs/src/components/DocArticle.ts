import {
  Component,
  createComponent,
  type ComponentConstructor,
  type VNode,
} from 'transone';
import { demoRegistry } from '../demos';
import type {
  DocBlock,
  InlineNode,
} from '../content/types';
import { withDocBasePath } from '../base';

function isInlineArray(value: InlineNode[] | DocBlock): value is InlineNode[] {
  return Array.isArray(value);
}

/**
 * 把内容 DSL（DocBlock[]）渲染为 VNode。
 * 页面标题与描述由 DocsPage 布局渲染，因此正文开头的 heading(1)
 * 会被跳过（避免重复标题），其余 heading 依次降级为 h2/h3/h4。
 */
interface DocArticleState {
  /** 已展开源码的 demo id 集合。 */
  expanded: Record<string, boolean>;
}

export class DocArticle extends Component<
  { blocks: DocBlock[] },
  DocArticleState
> {
  protected initState(): DocArticleState {
    return { expanded: {} };
  }

  protected initStyles(): void {}

  protected render(): VNode {
    const blocks = this.props.blocks;
    const first = blocks[0];
    const body =
      first && first.type === 'heading' && first.level === 1
        ? blocks.slice(1)
        : blocks;

    return {
      tag: 'div',
      children: body.map((block) => this.renderBlock(block)),
    };
  }

  private renderBlock(block: DocBlock): VNode {
    switch (block.type) {
      case 'heading': {
        const tag = block.level === 3 ? 'h4' : block.level === 2 ? 'h3' : 'h2';
        return { tag, children: [block.text] };
      }

      case 'paragraph':
        return { tag: 'p', children: this.renderInline(block.content) };

      case 'demo': {
        const Demo = demoRegistry[block.id] as ComponentConstructor | undefined;
        const expanded = !!this.state.expanded[block.id];
        return {
          tag: 'div',
          props: { className: 'doc-demo' },
          children: [
            Demo ? (createComponent(Demo) as VNode) : { tag: 'div' },
            ...(block.source
              ? [
                  {
                    tag: 'button',
                    props: {
                      className: 'doc-demo-toggle',
                      onClick: () =>
                        this.setState({
                          expanded: {
                            ...this.state.expanded,
                            [block.id]: !expanded,
                          },
                        }),
                    },
                    children: [expanded ? '收起源代码' : '查看源代码'],
                  },
                  ...(expanded
                    ? [
                        {
                          tag: 'pre',
                          props: { className: 'doc-demo-source' },
                          children: [
                            { tag: 'code', children: [block.source] },
                          ],
                        },
                      ]
                    : []),
                ]
              : []),
          ],
        };
      }

      case 'code':
        return {
          tag: 'div',
          props: { className: 'doc-code' },
          children: [
            {
              tag: 'div',
              props: { className: 'doc-code-lang' },
              children: [block.lang],
            },
            {
              tag: 'pre',
              props: { className: 'doc-code-pre' },
              children: [{ tag: 'code', children: [block.code] }],
            },
          ],
        };

      case 'list': {
        const tag = block.ordered ? 'ol' : 'ul';
        return {
          tag,
          children: block.items.map((item) => ({
            tag: 'li',
            children: isInlineArray(item)
              ? this.renderInline(item)
              : [this.renderBlock(item)],
          })),
        };
      }

      case 'table':
        return this.renderTable(
          undefined,
          block.headers,
          block.rows.map((row) =>
            row.map((cell) => ({ cell, code: false }))
          )
        );

      case 'api-table':
        return this.renderTable(
          block.caption,
          ['名称', '类型', '说明'],
          block.rows.map((row) => [
            { cell: row.name, code: true },
            { cell: row.type, code: true },
            { cell: row.description, code: false },
          ])
        );

      case 'callout':
        return {
          tag: 'div',
          props: { className: `doc-callout doc-callout-${block.variant}` },
          children: [
            ...(block.title
              ? [
                  {
                    tag: 'div',
                    props: { className: 'doc-callout-title' },
                    children: [block.title],
                  },
                ]
              : []),
            ...this.renderInline(block.content),
          ],
        };

      case 'link-grid':
        return {
          tag: 'div',
          props: { className: 'doc-link-grid' },
          children: block.items.map((item) =>
            this.renderCard(item.title, item.description, item.href)
          ),
        };

      case 'hero':
        return {
          tag: 'div',
          props: { className: 'doc-hero' },
          children: [
            {
              tag: 'div',
              props: { className: 'doc-hero-badge' },
              children: [block.badge],
            },
            {
              tag: 'h1',
              props: { className: 'doc-hero-title' },
              children: [block.title],
            },
            {
              tag: 'p',
              props: { className: 'doc-hero-subtitle' },
              children: [block.subtitle],
            },
            {
              tag: 'div',
              props: { className: 'doc-hero-actions' },
              children: block.actions.map((action) =>
                this.renderButton(action.label, action.href, action.primary)
              ),
            },
          ],
        };

      case 'feature-grid':
        return {
          tag: 'div',
          props: { className: 'doc-feature-grid' },
          children: block.items.map((feature) => ({
            tag: 'div',
            props: { className: 'doc-feature' },
            children: [
              {
                tag: 'div',
                props: { className: 'doc-feature-title' },
                children: [feature.title],
              },
              {
                tag: 'p',
                props: { className: 'doc-feature-desc' },
                children: [feature.description],
              },
            ],
          })),
        };
    }
  }

  private renderTable(
    caption: string | undefined,
    headers: string[],
    rows: Array<Array<{ cell: string; code: boolean }>>
  ): VNode {
    return {
      tag: 'div',
      props: { className: 'doc-table-wrap' },
      children: [
        ...(caption
          ? [
              {
                tag: 'div',
                props: { className: 'doc-table-caption' },
                children: [caption],
              },
            ]
          : []),
        {
          tag: 'table',
          props: { className: 'doc-table' },
          children: [
            {
              tag: 'thead',
              children: [
                {
                  tag: 'tr',
                  children: headers.map((header) => ({
                    tag: 'th',
                    children: [header],
                  })),
                },
              ],
            },
            {
              tag: 'tbody',
              children: rows.map((row) => ({
                tag: 'tr',
                children: row.map(({ cell, code }) => ({
                  tag: 'td',
                  children: code
                    ? [
                        {
                          tag: 'code',
                          props: { className: 'doc-inline-code' },
                          children: [cell],
                        },
                      ]
                    : [cell],
                })),
              })),
            },
          ],
        },
      ],
    };
  }

  private renderInline(nodes: InlineNode[]): Array<VNode | string> {
    return nodes.map((node) => {
      if (typeof node === 'string') {
        return node;
      }
      switch (node.kind) {
        case 'code':
          return {
            tag: 'code',
            props: { className: 'doc-inline-code' },
            children: [node.text],
          };
        case 'strong':
          return { tag: 'strong', children: [node.text] };
        case 'link':
          return this.renderLink(node.text, node.href);
      }
    });
  }

  private renderLink(text: string, href: string): VNode {
    if (href.startsWith('./')) {
      // 站点相对链接：指向部署子路径下的其他子站（主站 ./cli/，CLI 子站 ./ 为主站根）
      return {
        tag: 'a',
        props: { href: withDocBasePath(href.slice(1)), className: 'doc-external' },
        children: [text],
      };
    }
    if (href.startsWith('/')) {
      // 站内链接：普通 <a> + base 前缀（同 TSone 文档站，SSR 无 router 注入）
      return {
        tag: 'a',
        props: { href: withDocBasePath(href) },
        children: [text],
      };
    }
    return {
      tag: 'a',
      props: { href, target: '_blank', rel: 'noopener noreferrer' },
      children: [text],
    };
  }

  private renderCard(
    title: string,
    description: string,
    href: string
  ): VNode {
    const children: Array<VNode | string> = [
      {
        tag: 'div',
        props: { className: 'doc-link-card-title' },
        children: [title],
      },
      {
        tag: 'p',
        props: { className: 'doc-link-card-desc' },
        children: [description],
      },
    ];

    if (href.startsWith('/')) {
      return {
        tag: 'a',
        props: { href: withDocBasePath(href), className: 'doc-link-card' },
        children,
      };
    }
    if (href.startsWith('./')) {
      return {
        tag: 'a',
        props: { href: withDocBasePath(href.slice(1)), className: 'doc-link-card' },
        children,
      };
    }
    return {
      tag: 'a',
      props: {
        href,
        className: 'doc-link-card',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      children,
    };
  }

  private renderButton(
    label: string,
    href: string,
    primary?: boolean
  ): VNode {
    const className = primary ? 'doc-btn doc-btn-primary' : 'doc-btn';
    if (href.startsWith('/')) {
      return {
        tag: 'a',
        props: { href: withDocBasePath(href), className },
        children: [label],
      };
    }
    if (href.startsWith('./')) {
      return {
        tag: 'a',
        props: { href: withDocBasePath(href.slice(1)), className },
        children: [label],
      };
    }
    return {
      tag: 'a',
      props: {
        href,
        className,
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      children: [label],
    };
  }
}
