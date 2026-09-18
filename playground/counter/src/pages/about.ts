import { Component, createApp, h, type VNode } from 'transone';

/** 关于页：独立页面入口（Web 多页面 / 小程序多页面共用）。 */
export class AboutPage extends Component<Record<string, never>, object> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {
    this.styleManager.addStyle('about-shell', {
      selector: '.about-shell',
      properties: {
        alignItems: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '32px 16px',
      },
    });
    this.styleManager.addStyle('about-title', {
      selector: '.about-title',
      properties: {
        fontSize: '24px',
        fontWeight: '700',
        margin: '0',
      },
    });
    this.styleManager.addStyle('about-text', {
      selector: '.about-text',
      properties: {
        color: '#475569',
        fontSize: '15px',
        lineHeight: '1.7',
        margin: '0',
        textAlign: 'center',
      },
    });
  }

  protected render(): VNode {
    return h('section', { className: 'about-shell' }, [
      h('h1', { className: 'about-title' }, ['关于 TransOne']),
      h('p', { className: 'about-text' }, [
        '一份 TypeScript 源码，编译期静态转换为 Web 与多端小程序原生产物，产物不携带框架运行时。',
      ]),
      h('p', { className: 'about-text' }, [
        '路线图：Web（M1）→ 微信小程序（M2）→ 阿里 / 字节小程序（M3）→ 原生 App（远期）。',
      ]),
    ]);
  }
}

export const app = createApp({
  root: AboutPage,
  document: {
    lang: 'zh-CN',
    title: '关于 TransOne',
    description: 'TransOne 跨端框架关于页',
  },
});
app.mount();
