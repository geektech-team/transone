import { Component, createComponent, type VNode } from '@geektech/tsone';
import { findPage } from '../content';
import { withDocBasePath, withSiteRootPath } from '../base';
import { DocArticle } from './DocArticle';
import { DocsNav } from './DocsNav';

export interface DocsPageProps {
  path: string;
}

const GITHUB_URL = 'https://github.com/geektech-team/transone';

/**
 * CLI 文档站整体布局。部署在主文档站子路径 /transone/cli/，
 * 顶栏的「核心框架」链接指向主文档站（base 的父级路径）。
 *
 * 与 TSone 文档站一致：站内链接使用带 base 前缀的普通 <a>。
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
                children: ['CLI'],
              },
              { tag: 'span', children: ['TransOne CLI'] },
            ], 'doc-brand'),
            {
              tag: 'nav',
              props: { className: 'doc-header-nav' },
              children: [
                this.link('/guide/getting-started', '快速开始', 'doc-header-link'),
                this.link('/guide/commands', '命令', 'doc-header-link'),
                this.link('/guide/config', '配置', 'doc-header-link'),
                this.link('/guide/targets', '目标端', 'doc-header-link'),
              ],
            },
            {
              tag: 'a',
              props: {
                // 主文档站根路径（部署时 /transone/）
                href: withSiteRootPath('/'),
                className: 'doc-header-external',
              },
              children: ['核心框架'],
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
    const isHome = page.path === '/';
    const article = createComponent(DocArticle, { blocks: page.body }) as VNode;

    return {
      tag: 'main',
      props: { className: isHome ? 'doc-layout doc-home' : 'doc-layout' },
      children: isHome
        ? [article]
        : [
            createComponent(DocsNav, { currentPath: page.path }) as VNode,
            {
              tag: 'div',
              props: { className: 'doc-content' },
              children: [
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
        '© 2026 @geektech · TransOne CLI（Bun-native 多端编译器）· ',
        {
          tag: 'a',
          props: {
            href: GITHUB_URL,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          children: ['GitHub'],
        },
        ' · 本站由 @geektech/tsone 构建（tsone build）',
      ],
    };
  }
}
