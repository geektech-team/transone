import { Component, type VNode } from '@geektech/tsone';
import { withDocBasePath } from '../base';
import {
  SECTION_ORDER,
  SECTION_TITLES,
  pagesOfSection,
} from '../content';

/**
 * 侧边栏导航：按 section 分组（指南 / 子包文档 / 参考），
 * 每个分组内按 order 排列，当前页高亮。
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
    const sections: VNode[] = [];
    for (const section of SECTION_ORDER) {
      const pages = pagesOfSection(section);
      if (pages.length === 0) {
        continue;
      }
      sections.push({
        tag: 'div',
        props: { className: 'doc-nav-section' },
        children: [
          {
            tag: 'div',
            props: { className: 'doc-nav-title' },
            children: [SECTION_TITLES[section]],
          },
          ...pages.map((page) => {
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
