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

// 与主文档站同构：模块作用域用 pathname 反推部署 base（SSR 与客户端一致）。
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
    title: 'TransOne CLI 文档',
    description:
      'Bun-native 多端编译器：Target 抽象、CLI 命令与配置参考 —— TransOne CLI 文档。',
  },
});

router.install(oneApp);

if (typeof document !== 'undefined') {
  const rootEl = document.getElementById('app');
  rootEl?.replaceChildren();
}
oneApp.mount();

export const app = {
  renderHtmlDocument(options: AppDocumentRenderOptions): string {
    const page = findPage(router.getCurrentRoute()?.path ?? '/');
    return renderHtmlDocument({
      lang: 'zh-CN',
      title:
        page && page.path !== '/'
          ? `${page.title} - TransOne CLI 文档`
          : 'TransOne CLI 文档',
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
