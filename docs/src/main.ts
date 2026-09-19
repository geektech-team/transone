import {
  Component,
  createApp,
  createComponent,
  renderHtmlDocument,
  type AppDocumentRenderOptions,
  type VNode,
} from 'transone';
import { docRoutes, findPage, normalizeDocPath } from './content';
import { deriveDocBase, setDocBasePath } from './base';
import { DocsPage } from './components/DocsPage';
import { docsStyles } from './styles';

interface DocsAppState {
  path: string;
}

/**
 * 根组件：根据当前 URL 渲染对应文档页。
 * 文档站是纯静态多页形态（链接为普通 <a>，无 SPA 路由），
 * 页面路径直接由模块作用域的 window.location.pathname 反推，
 * SSR 与客户端同构，不依赖任何注入链。
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

// ---- 入口接线 ----
//
// 部署形态：站点挂在 GitHub Pages 子路径（如 /transone/）。transone build 的
// --base 只影响 SSR 时注入的 window URL，因此这里在模块作用域读取 pathname，
// 用路由表反推 base，再反推当前文档路径——SSR 与客户端同一套逻辑。

const currentPath =
  typeof window !== 'undefined' ? window.location.pathname : '/';
const base = deriveDocBase(currentPath, docRoutes);
setDocBasePath(base);

/** 去掉部署 base 后的文档路径（如 /transone/cli/commands → /cli/commands）。 */
const currentDocPath = normalizeDocPath(
  base && currentPath.startsWith(base) ? currentPath.slice(base.length) : currentPath
);

const oneApp = createApp({
  root: DocsApp,
  document: {
    lang: 'zh-CN',
    title: 'TransOne 文档',
    description:
      '一套 TypeScript 源码，多端原生产物 —— TransOne 跨端前端框架文档。',
  },
});

// 客户端挂载前清空 SSR 渲染的 #app 内容，避免重复渲染。
if (typeof document !== 'undefined') {
  const rootEl = document.getElementById('app');
  rootEl?.replaceChildren();
}
oneApp.mount();

/**
 * CLI 约定的入口导出：`app` 必须提供 renderHtmlDocument(options)。
 * SSR 时按当前路径渲染文档正文（含内联样式与脚本），标题 / 描述按页定制。
 */
export const app = {
  renderHtmlDocument(options: AppDocumentRenderOptions): string {
    const page = findPage(currentDocPath);
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
