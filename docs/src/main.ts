import {
  Component,
  createApp,
  createComponent,
  createRouter,
  renderHtmlDocument,
  type AppDocumentRenderOptions,
  type VNode,
} from 'transone';
import { docRoutes, findPage } from './content';
import { deriveDocBase, setDocBasePath } from './base';
import { DocsPage } from './components/DocsPage';
import { docsStyles } from './styles';

interface DocsAppState {
  path: string;
}

/**
 * 根组件：跟随路由变化切换当前文档页。
 * 直接闭包引用模块级 router（SSR 渲染文档体时组件注入链不可靠，
 * 而模块作用域的 router 在两种环境下都确定可用）。
 */
class DocsApp extends Component<Record<string, never>, DocsAppState> {
  private unsubscribe?: () => void;

  protected initState(): DocsAppState {
    return { path: router.getCurrentRoute()?.path ?? '/' };
  }

  protected initStyles(): void {}

  protected onMounted(): void {
    this.unsubscribe = router.onRouteChange((to) => {
      this.state.path = to.path;
    });
  }

  protected onUnmounted(): void {
    this.unsubscribe?.();
  }

  protected render(): VNode {
    return createComponent({
      component: DocsPage,
      props: { path: this.state.path },
    });
  }
}

// ---- 入口接线 ----
//
// 部署形态：站点挂在 GitHub Pages 子路径（如 /transone/）。CLI 的 --base
// 只影响 SSR 时注入的 window URL，因此这里在模块作用域读取 pathname，
// 用路由表反推 base——SSR 与客户端同构，无需额外注入。

const currentPath =
  typeof window !== 'undefined' ? window.location.pathname : '/';
const base = deriveDocBase(currentPath, docRoutes);
setDocBasePath(base);

const router = createRouter({
  routes: docRoutes.map((path) => ({ path, component: DocsApp })),
  base: base || '/',
  mode: 'history',
});

const oneApp = createApp({
  root: DocsApp,
  document: {
    lang: 'zh-CN',
    title: 'TransOne 文档',
    description:
      '一套 TypeScript 源码，多端原生产物 —— TransOne 跨端前端框架文档。',
  },
});

router.install(oneApp);

// 客户端挂载前清空 SSR 渲染的 #app 内容，避免重复渲染。
if (typeof document !== 'undefined') {
  const rootEl = document.getElementById('app');
  rootEl?.replaceChildren();
}
oneApp.mount();

/**
 * CLI 约定的入口导出：`app` 必须提供 renderHtmlDocument(options)。
 * SSR 时按当前路由渲染文档正文（含内联样式与脚本），标题 / 描述按页定制。
 */
export const app = {
  renderHtmlDocument(options: AppDocumentRenderOptions): string {
    const page = findPage(router.getCurrentRoute()?.path ?? '/');
    return renderHtmlDocument({
      lang: 'zh-CN',
      title:
        page && page.path !== '/'
          ? `${page.title} - TransOne 文档`
          : 'TransOne 文档',
      description: page?.description,
      htmlAttributes: base ? { 'data-doc-base': base } : {},
      body: {
        tag: 'div',
        props: { id: 'app' },
        children: [{ component: DocsApp }],
      },
      styles: docsStyles,
      scripts: options.scripts,
    });
  },
};
