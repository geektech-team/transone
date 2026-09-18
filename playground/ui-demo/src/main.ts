import { Component, createApp, createComponent, type VNode } from 'transone';
import { injectTuTheme } from 'transone-ui';
import { UiDemoPage } from './pages/home';

/** 根组件：承载演示页，注入默认主题。 */
class App extends Component<Record<string, never>, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('app-body', {
      selector: 'body',
      properties: {
        background: 'var(--tu-background, #f7f8fa)',
        color: 'var(--tu-text, #323233)',
        fontFamily:
          '-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
        margin: 0,
      },
    });
  }

  protected render(): VNode {
    return createComponent({ component: UiDemoPage }) as VNode;
  }
}

injectTuTheme();

export const app = createApp({
  root: App,
  document: {
    lang: 'zh-CN',
    title: 'transone-ui 组件演示',
    description: 'transone-ui 跨端组件库演示（Web / 小程序同一份源码）',
  },
});
app.mount();
