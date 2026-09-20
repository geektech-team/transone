import { Component, type VNode } from 'transone';
import { withDocBasePath } from '../base';
import {
  SECTION_PATHS,
  SECTION_TITLES,
  findPage,
  pagesOfSection,
} from '../content';

/**
 * 侧边栏导航：只展示当前分区（子包）自己的内容。
 * 进入某子包后，侧边栏仅显示该分区的父菜单（落地页）与其子页，
 * 不再罗列其他子包的内容——各子包内容相互独立。
 * 当前页高亮，父菜单随所在分区高亮。
 *
 * 与 TSone 文档站一致：内部链接使用带 base 前缀的普通 <a>，
 * 不依赖 RouterLink 的注入链（SSR 渲染文档体时无 app 上下文）。
 */
export class DocsNav extends Component<{ currentPath: string }, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {}

  protected render(): VNode {
    const currentPage = findPage(this.props.currentPath);
    const section = currentPage?.section;
    if (!section || section === 'home') {
      // 主页无侧边栏（由 DocsPage 用 doc-home 全宽布局承载）
      return { tag: 'nav', props: { className: 'doc-sidebar' }, children: [] };
    }

    const pages = pagesOfSection(section);
    const landingPath = SECTION_PATHS[section];

    return {
      tag: 'nav',
      props: { className: 'doc-sidebar' },
      children: [
        {
          tag: 'div',
          props: { className: 'doc-nav-section' },
          children: [
            {
              tag: 'a',
              props: {
                href: withDocBasePath(landingPath),
                className: 'doc-nav-parent active',
              },
              children: [SECTION_TITLES[section]],
            },
            ...pages
              .filter((page) => page.path !== landingPath)
              .map((page) => {
                const isActive = page.path === this.props.currentPath;
                return {
                  tag: 'a',
                  props: {
                    href: withDocBasePath(page.path),
                    className: isActive
                      ? 'doc-nav-link active'
                      : 'doc-nav-link',
                  },
                  children: [page.title],
                };
              }),
          ],
        },
      ],
    };
  }
}
