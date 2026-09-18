import { Component, createApp, createComponent, type VNode } from 'transone';
import { HomePage } from './pages/home';

/** 根组件：承载首页，演示嵌套组件编译。 */
class App extends Component<Record<string, never>, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('app-body', {
      selector: 'body',
      properties: {
        background: '#f8fafc',
        color: '#0f172a',
        fontFamily:
          '-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
        margin: 0,
      },
    });
  }

  protected render(): VNode {
    return createComponent({ component: HomePage }) as VNode;
  }
}

export const app = createApp({
  root: App,
  document: {
    lang: 'zh-CN',
    title: 'TransOne 演练',
    description: 'TransOne 跨端框架演练项目',
  },
});
app.mount();
