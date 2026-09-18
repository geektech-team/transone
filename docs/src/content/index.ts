import type { DocPage, DocSection } from './types';
import { homePage } from './home';
import {
  coreConceptsPage,
  gettingStartedPage,
  positioningPage,
  roadmapPage,
  targetsPage,
} from './guide';
import {
  packagesOverviewPage,
  transoneCliPackagePage,
  transonePackagePage,
} from './packages';
import { apiOverviewPage } from './reference';

/** 全部文档页（首页排最前，其余按 section + order 排序）。 */
export const docsPages: DocPage[] = [
  homePage,
  gettingStartedPage,
  coreConceptsPage,
  positioningPage,
  targetsPage,
  roadmapPage,
  packagesOverviewPage,
  transonePackagePage,
  transoneCliPackagePage,
  apiOverviewPage,
];

/** 侧边栏分组顺序。 */
export const SECTION_ORDER: DocSection[] = ['guide', 'packages', 'reference'];

export const SECTION_TITLES: Record<DocSection, string> = {
  guide: '指南',
  packages: '子包文档',
  reference: '参考',
};

export function findPage(path: string): DocPage | undefined {
  const normalized = normalizeDocPath(path);
  return docsPages.find((page) => page.path === normalized);
}

/** 路径归一化：去掉尾斜杠（路由系统与浏览器 URL 的斜杠形态可能不一致）。 */
export function normalizeDocPath(path: string): string {
  if (path === '/' || path === '') {
    return '/';
  }
  return path.replace(/\/+$/, '');
}

export function pagesOfSection(section: DocSection): DocPage[] {
  return docsPages
    .filter((page) => page.section === section && page.path !== '/')
    .sort((a, b) => a.order - b.order);
}

/** 供 transone.config.ts 生成 pages 映射。 */
export const docRoutes: string[] = docsPages.map((page) => page.path);
