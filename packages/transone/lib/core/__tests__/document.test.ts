import { describe, expect, it } from 'bun:test';
import {
  Component,
  Div,
  createApp,
  renderHtmlDocument,
  type StyleSheet,
  type VNode,
} from '../../index';

interface IntroProps {
  message: string;
}

class IntroComponent extends Component<IntroProps> {
  protected initState(): object {
    return {};
  }

  protected initStyles(): void {}

  protected render(): VNode {
    return {
      tag: 'section',
      props: { className: 'intro' },
      children: [this.props.message],
    };
  }
}

describe('HTML document rendering', () => {
  it('renders a complete document from TSone body and typed style objects', () => {
    const styles: StyleSheet = [
      {
        selector: ':root',
        properties: {
          '--accent': '#2364aa',
          color: '#111111',
          maxWidth: '72rem',
        },
      },
      {
        atRule: '@media (max-width: 640px)',
        rules: [
          {
            selector: '.intro',
            properties: { padding: 12 },
          },
        ],
      },
    ];

    const html = renderHtmlDocument({
      lang: 'zh-CN',
      title: 'TSone <Docs>',
      description: 'Typed & rendered',
      htmlAttributes: { 'data-doc': 'typed' },
      bodyAttributes: { 'data-theme': 'light' },
      head: [
        {
          tag: 'meta',
          attributes: { name: 'theme-color', content: '#ffffff' },
        },
        {
          tag: 'link',
          attributes: {
            rel: 'canonical',
            href: 'https://example.test/docs',
          },
        },
      ],
      body: {
        component: IntroComponent,
        props: { message: 'Hello <TS>' },
      },
      styles,
      scripts: [{ src: '/assets/docs-client.js', type: 'module' }],
    });

    expect(html).toStartWith('<!doctype html>');
    expect(html).toContain('<html lang="zh-CN" data-doc="typed">');
    expect(html).toContain('<title>TSone &lt;Docs&gt;</title>');
    expect(html).toContain(
      '<meta name="description" content="Typed &amp; rendered">'
    );
    expect(html).toContain('<meta name="theme-color" content="#ffffff">');
    expect(html).toContain(
      '<link rel="canonical" href="https://example.test/docs">'
    );
    expect(html).toContain(':root {');
    expect(html).toContain('--accent: #2364aa;');
    expect(html).toContain('max-width: 72rem;');
    expect(html).toContain('@media (max-width: 640px) {');
    expect(html).toContain('padding: 12;');
    expect(html).toContain('<body data-theme="light">');
    expect(html).toContain('<section class="intro">Hello &lt;TS&gt;</section>');
    expect(html).toContain(
      '<script type="module" src="/assets/docs-client.js"></script>'
    );
  });

  it('treats string body content as text instead of HTML', () => {
    const html = renderHtmlDocument({
      title: 'Text body',
      body: '<main>raw html</main>',
    });

    expect(html).toContain('&lt;main&gt;raw html&lt;/main&gt;');
    expect(html).not.toContain('<main>raw html</main>');
  });

  it('builds the default mount document from createApp options', () => {
    const app = createApp({
      root: IntroComponent,
      document: {
        title: 'TSone App Shell',
        lang: 'zh-CN',
        description: 'Generated from TypeScript app options',
      },
    });

    const html = app.renderHtmlDocument({
      scripts: [{ src: '/bundle.js', type: 'module' }],
    });

    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('<title>TSone App Shell</title>');
    expect(html).toContain(
      '<meta name="description" content="Generated from TypeScript app options">'
    );
    expect(html).toContain('<div id="app"></div>');
    expect(html).toContain('<script type="module" src="/bundle.js"></script>');
  });

  it('lets createApp document options override the generated mount node', () => {
    const app = createApp({
      document: {
        title: 'Custom shell',
        body: Div({ props: { id: 'root', className: 'custom-root' } }),
      },
    });

    const html = app.renderHtmlDocument();

    expect(html).toContain('<div id="root" class="custom-root"></div>');
    expect(html).not.toContain('<div id="app"></div>');
  });
});
