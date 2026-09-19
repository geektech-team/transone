import { Component, type VNode } from 'transone';
import { withDocBasePath } from '../base';
import {
  SECTION_ORDER,
  SECTION_PATHS,
  SECTION_TITLES,
  findPage,
  pagesOfSection,
} from '../content';

/**
 * 侧边栏导航：父子菜单。
 * 父菜单 = 分区（transone / transone-cli / transone-ui / 项目），
 * 链接到分区落地页；子菜单 = 分区内除落地页外的全部页面，
 * 详细介绍包的模块 / 功能 / 组件。当前页高亮，父菜单随所在分区高亮。
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
    const sections: VNode[] = [];

    for (const section of SECTION_ORDER) {
      const pages = pagesOfSection(section);
      if (pages.length === 0) {
        continue;
      }
      const landingPath = SECTION_PATHS[section];
      const parentActive = currentPage?.section === section;

      sections.push({
        tag: 'div',
        props: { className: 'doc-nav-section' },
        children: [
          {
            tag: 'a',
            props: {
              href: withDocBasePath(landingPath),
              className: parentActive
                ? 'doc-nav-parent active'
                : 'doc-nav-parent',
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
      });
    }

    return { tag: 'nav', props: { className: 'doc-sidebar' }, children: sections };
  }
}
