import type { DocPage, DocSection } from './types';
import { homePage } from './home';
import {
  transoneLandingPage,
  gettingStartedPage,
  coreConceptsPage,
  apiOverviewPage,
} from './transone';
import {
  transoneApplicationPage,
  transoneReactivityPage,
  transoneRendererPage,
  transoneRouterPage,
  transoneStylePage,
  transoneSsrPage,
} from './transone-modules';
import {
  cliLandingPage,
  cliGettingStartedPage,
  cliCommandsPage,
  cliConfigPage,
  cliTargetsPage,
  cliBuildPage,
  cliApiPage,
} from './cli';
import {
  uiLandingPage,
  uiGettingStartedPage,
  uiThemePage,
  uiButtonPage,
  uiSwitchPage,
  uiTagPage,
  uiProgressPage,
  uiInputPage,
  uiPopupPage,
  uiToastPage,
  uiModalPage,
  uiActionSheetPage,
  uiCheckboxPage,
  uiRadioPage,
  uiSearchBarPage,
  uiBadgePage,
  uiCellPage,
  uiEmptyPage,
  uiTabsPage,
  uiNavbarPage,
} from './transone-ui-modules';
import {
  chartLandingPage,
  chartGettingStartedPage,
  chartArchitecturePage,
  chartChartsPage,
  chartLinePage,
  chartBarPage,
  chartPiePage,
  chartRadarPage,
  chartCrossPlatformPage,
} from './transone-chart';
import {
  projectLandingPage,
  positioningPage,
  targetsPage,
  roadmapPage,
} from './project';

/**
 * 全部文档页。
 *
 * 按子包拆分为独立分区，主页（/）只做入口：
 * - 主页（/）：各子包入口卡片，不展示任何子包内容
 * - transone（/transone/）：核心框架 —— 快速开始、核心概念、六个模块、API 概览
 * - transone-cli（/cli/）：多端编译器 —— 快速开始、命令、配置、目标端、构建、API
 * - transone-ui（/ui/）：UI 组件库 —— 快速上手、主题定制、17 个组件
 * - transone-chart（/transone-chart/）：图表库 —— 快速开始、架构、图表总览、折线 / 柱状 / 饼图 / 雷达、跨端集成
 * - 项目（/project/）：定位与设计、目标端矩阵、路线图
 */
export const docsPages: DocPage[] = [
  // ---- 主页（/）：子包入口 ----
  homePage,
  // ---- transone 核心框架（父菜单 /transone/）----
  transoneLandingPage,
  gettingStartedPage,
  coreConceptsPage,
  transoneApplicationPage,
  transoneReactivityPage,
  transoneRendererPage,
  transoneRouterPage,
  transoneStylePage,
  transoneSsrPage,
  apiOverviewPage,
  // ---- transone-cli 编译器（父菜单 /cli/）----
  cliLandingPage,
  cliGettingStartedPage,
  cliCommandsPage,
  cliConfigPage,
  cliTargetsPage,
  cliBuildPage,
  cliApiPage,
  // ---- transone-ui 组件库（父菜单 /ui/）----
  uiLandingPage,
  uiGettingStartedPage,
  uiThemePage,
  uiButtonPage,
  uiSwitchPage,
  uiTagPage,
  uiProgressPage,
  uiInputPage,
  uiPopupPage,
  uiToastPage,
  uiModalPage,
  uiActionSheetPage,
  uiCheckboxPage,
  uiRadioPage,
  uiSearchBarPage,
  uiBadgePage,
  uiCellPage,
  uiEmptyPage,
  uiTabsPage,
  uiNavbarPage,
  // ---- transone-chart 图表库（父菜单 /transone-chart/）----
  chartLandingPage,
  chartGettingStartedPage,
  chartArchitecturePage,
  chartChartsPage,
  chartLinePage,
  chartBarPage,
  chartPiePage,
  chartRadarPage,
  chartCrossPlatformPage,
  // ---- 项目（父菜单 /project/）----
  projectLandingPage,
  positioningPage,
  targetsPage,
  roadmapPage,
];

/** 顶栏 / 侧边栏父菜单顺序（home 只在主页展示，不参与分区导航）。 */
export const SECTION_ORDER: DocSection[] = [
  'transone',
  'cli',
  'ui',
  'chart',
  'project',
];

/** 父菜单标题（即落地页链接文案）。 */
export const SECTION_TITLES: Record<DocSection, string> = {
  home: '主页',
  transone: 'transone',
  cli: 'transone-cli',
  ui: 'transone-ui',
  chart: 'transone-chart',
  project: '项目',
};

/** 父菜单落地页路由（不含部署 base）。 */
export const SECTION_PATHS: Record<DocSection, string> = {
  home: '/',
  transone: '/transone',
  cli: '/cli',
  ui: '/ui',
  chart: '/transone-chart',
  project: '/project',
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

/**
 * 分区内全部页面（含分区落地页），按 order 排序。
 * 落地页 order 为 -1，恒排最前，侧边栏渲染为父菜单项。
 */
export function pagesOfSection(section: DocSection): DocPage[] {
  return docsPages
    .filter((page) => page.section === section)
    .sort((a, b) => a.order - b.order);
}

/** 供 transone.config.ts 生成 pages 映射。 */
export const docRoutes: string[] = docsPages.map((page) => page.path);
