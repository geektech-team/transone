import { Component, createComponent, type VNode } from 'transone';
import { findPage, SECTION_ORDER, SECTION_PATHS, SECTION_TITLES } from '../content';
import { withDocBasePath } from '../base';
import { DocArticle } from './DocArticle';
import { DocsNav } from './DocsNav';

export interface DocsPageProps {
  path: string;
}

const GITHUB_URL = 'https://github.com/geektech-team/transone';

/**
 * 文档站整体布局：顶栏 +（侧边栏 + 正文）+ 页脚。
 * 侧边栏为父子菜单（父 = 包 / 项目，子 = 模块 / 组件页）；
 * 分区落地页（hero + 卡片）与子页共用同一布局，只省略页首标题区。
 *
 * 与 TSone 文档站一致：站内链接使用带 base 前缀的普通 <a>
 * （SSR 渲染文档体时无 app 上下文，RouterLink 的注入链不可用）。
 */
export class DocsPage extends Component<DocsPageProps, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {}

  protected render(): VNode {
    const page = findPage(this.props.path);

    return {
      tag: 'div',
      children: [
        this.renderHeader(),
        page === undefined ? this.renderNotFound() : this.renderBody(page),
        this.renderFooter(),
      ],
    };
  }

  private link(
    href: string,
    text: string | VNode[],
    className?: string
  ): VNode {
    return {
      tag: 'a',
      props: { href: withDocBasePath(href), className },
      children: Array.isArray(text) ? text : [text],
    };
  }

  private renderHeader(): VNode {
    const currentSection = findPage(this.props.path)?.section;

    return {
      tag: 'header',
      props: { className: 'doc-header' },
      children: [
        {
          tag: 'div',
          props: { className: 'doc-header-inner' },
          children: [
            this.link('/', [
              {
                tag: 'span',
                props: { className: 'doc-brand-mark' },
                children: ['T1'],
              },
              { tag: 'span', children: ['TransOne'] },
            ], 'doc-brand'),
            {
              tag: 'nav',
              props: { className: 'doc-header-nav' },
              children: SECTION_ORDER.map((section) =>
                this.link(
                  SECTION_PATHS[section],
                  SECTION_TITLES[section],
                  currentSection === section
                    ? 'doc-header-link active'
                    : 'doc-header-link'
                )
              ),
            },
            {
              tag: 'a',
              props: {
                href: GITHUB_URL,
                className: 'doc-header-external',
                target: '_blank',
                rel: 'noopener noreferrer',
              },
              children: ['GitHub'],
            },
          ],
        },
      ],
    };
  }

  private renderBody(page: NonNullable<ReturnType<typeof findPage>>): VNode {
    const article = createComponent(DocArticle, { blocks: page.body }) as VNode;
    const isLanding = page.order === -1;

    return {
      tag: 'main',
      props: { className: 'doc-layout' },
      children: [
        createComponent(DocsNav, { currentPath: page.path }) as VNode,
        {
          tag: 'div',
          props: { className: 'doc-content' },
          children: isLanding
            ? [article]
            : [
                {
                  tag: 'h1',
                  props: { className: 'doc-article-title' },
                  children: [page.title],
                },
                {
                  tag: 'p',
                  props: { className: 'doc-article-desc' },
                  children: [page.description],
                },
                article,
              ],
        },
      ],
    };
  }

  private renderNotFound(): VNode {
    return {
      tag: 'main',
      props: { className: 'doc-layout' },
      children: [
        {
          tag: 'div',
          props: { className: 'doc-404' },
          children: [
            {
              tag: 'div',
              props: { className: 'doc-404-title' },
              children: ['页面未找到'],
            },
            {
              tag: 'p',
              children: ['该地址不存在，或文档仍在建设中。'],
            },
            this.link('/', '返回首页', 'doc-btn doc-btn-primary'),
          ],
        },
      ],
    };
  }

  private renderFooter(): VNode {
    return {
      tag: 'footer',
      props: { className: 'doc-footer' },
      children: [
        '© 2026 @geektech · TransOne（一套 TypeScript 源码，多端原生产物）· ',
        {
          tag: 'a',
          props: {
            href: GITHUB_URL,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          children: ['GitHub'],
        },
        ' · 本站由 transone 构建（transone build）',
      ],
    };
  }
}
