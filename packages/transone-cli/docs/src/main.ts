import {
  Component,
  createApp,
  createComponent,
  renderHtmlDocument,
  type AppDocumentRenderOptions,
  type VNode,
} from '@geektech/tsone';
import { docRoutes, findPage, normalizeDocPath } from './content';
import { deriveDocBase, setDocBasePath } from './base';
import { DocsPage } from './components/DocsPage';
import { docsStyles } from './styles';

interface DocsAppState {
  path: string;
}

/**
 * 根组件：根据当前 URL 渲染对应文档页。
 * 与主文档站同构：纯静态多页形态，页面路径由模块作用域
 * 的 window.location.pathname 反推，SSR 与客户端一致。
 */
class DocsApp extends Component<Record<string, never>, DocsAppState> {
  protected initState(): DocsAppState {
    return { path: currentDocPath };
  }

  protected initStyles(): void {}

  protected render(): VNode {
    // ComponentNode<P> 在框架类型上是不变的，带具体 props 的组件节点
    // 需显式断言为 VNode（与 TSone 文档站的用法一致）。
    return createComponent(DocsPage, { path: this.state.path }) as VNode;
  }
}

// 与主文档站同构：模块作用域用 pathname 反推部署 base，再反推当前文档路径。
const currentPath =
  typeof window !== 'undefined' ? window.location.pathname : '/';
const base = deriveDocBase(currentPath, docRoutes);
setDocBasePath(base);

/** 去掉部署 base 后的文档路径（如 /transone/cli/guide/x → /guide/x）。 */
const currentDocPath = normalizeDocPath(
  base && currentPath.startsWith(base) ? currentPath.slice(base.length) : currentPath
);

const oneApp = createApp({
  root: DocsApp,
  document: {
    lang: 'zh-CN',
    title: 'TransOne CLI 文档',
    description:
      'Bun-native 多端编译器：Target 抽象、CLI 命令与配置参考 —— TransOne CLI 文档。',
  },
});

if (typeof document !== 'undefined') {
  const rootEl = document.getElementById('app');
  rootEl?.replaceChildren();
}
oneApp.mount();

export const app = {
  renderHtmlDocument(options: AppDocumentRenderOptions): string {
    const page = findPage(currentDocPath);
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
