import { Component, createApp, createComponent, type VNode } from 'transone';
import { ChartDemoPage } from './pages/home';

/** 根组件：承载图表 Demo 页。 */
class App extends Component<Record<string, never>, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('chart-demo-body', {
      selector: 'body',
      properties: {
        background: '#f5f6f8',
        color: '#0f172a',
        fontFamily:
          '-apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
        margin: 0,
      },
    });
  }

  protected render(): VNode {
    return createComponent({ component: ChartDemoPage }) as VNode;
  }
}

export const app = createApp({
  root: App,
  document: {
    lang: 'zh-CN',
    title: 'TransOne 图表 Demo',
    description: 'transone-chart 跨端图表库演示',
  },
});
app.mount();
