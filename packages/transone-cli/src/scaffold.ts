export interface ScaffoldFile {
  path: string;
  content: string;
}

interface CardView {
  className: string;
  decorator: string;
  label: string;
  background: string;
}

const cardViews: CardView[] = [
  {
    className: 'CardWebComponent',
    decorator: 'Web',
    label: 'Web Card',
    background: '#eff6ff',
  },
  {
    className: 'CardMiniprogramComponent',
    decorator: 'Miniprogram',
    label: 'Miniprogram Card',
    background: '#f0fdf4',
  },
  {
    className: 'CardAppComponent',
    decorator: 'App',
    label: 'App Card',
    background: '#f8fafc',
  },
  {
    className: 'CardMobileComponent',
    decorator: 'WebMobile',
    label: 'Mobile Web Card',
    background: '#f0fdf4',
  },
  {
    className: 'CardPcComponent',
    decorator: 'WebPc',
    label: 'PC Web Card',
    background: '#eef2ff',
  },
  {
    className: 'CardWeixinComponent',
    decorator: 'MiniprogramWeixin',
    label: 'Weixin Card',
    background: '#f0fdf4',
  },
  {
    className: 'CardAlipayComponent',
    decorator: 'MiniprogramAlipay',
    label: 'Alipay Card',
    background: '#eff6ff',
  },
  {
    className: 'CardIosComponent',
    decorator: 'AppIos',
    label: 'iOS Card',
    background: '#f8fafc',
  },
  {
    className: 'CardAndroidComponent',
    decorator: 'AppAndroid',
    label: 'Android Card',
    background: '#f0fdf4',
  },
];

function cardRender(label: string, background = '#ffffff'): string {
  return `  protected render(): VNode {
    return h('main', {
      style: { padding: '16px', borderRadius: '12px', backgroundColor: '${background}' },
    }, [
      h('h1', { style: { fontSize: '20px' } }, [this.props.title]),
      h('p', {}, ['${label}']),
      h('p', {}, ['Count: {{count}}']),
      h('button', {}, ['+1'], { click: () => this.increment() }),
    ]);
  }`;
}

/** Sources shared by create and its consumer-build verification. */
export function scaffoldFiles(
  name: string,
  frameworkVersion: string,
  cliVersion: string
): ScaffoldFile[] {
  return [
    {
      path: 'package.json',
      content:
        JSON.stringify(
          {
            name,
            private: true,
            type: 'module',
            scripts: {
              dev: 'transone dev',
              'dev:mobile': 'transone dev --target web-mobile',
              'dev:pc': 'transone dev --target web-pc',
              build: 'transone build',
              'build:web': 'transone build --target web',
              'build:mobile': 'transone build --target web-mobile',
              'build:pc': 'transone build --target web-pc',
              'build:weixin': 'transone build --target miniprogram-weixin',
              'build:alipay': 'transone build --target miniprogram-alipay',
              'build:bytedance':
                'transone build --target miniprogram-bytedance',
              'build:xiaohongshu':
                'transone build --target miniprogram-xiaohongshu',
              'build:ios': 'transone build --target app-ios',
              'build:android': 'transone build --target app-android',
              'build:harmony': 'transone build --target app-harmony',
              typecheck: 'bunx tsc --noEmit',
            },
            dependencies: { transone: `^${frameworkVersion}` },
            devDependencies: {
              'transone-cli': `^${cliVersion}`,
              typescript: '^5.3.3',
            },
          },
          null,
          2
        ) + '\n',
    },
    {
      path: 'transone.config.ts',
      content: `import { Platform } from 'transone';
import { defineConfig } from 'transone-cli';

export default defineConfig({
  entry: 'src/main.ts',
  target: Platform.Web,
});
`,
    },
    {
      path: 'tsconfig.json',
      content:
        JSON.stringify(
          {
            compilerOptions: {
              target: 'ESNext',
              module: 'ESNext',
              moduleResolution: 'Bundler',
              lib: ['ESNext', 'DOM', 'DOM.Iterable'],
              strict: true,
              noEmit: true,
              skipLibCheck: true,
              verbatimModuleSyntax: true,
            },
            include: ['src/**/*', 'transone.config.ts'],
          },
          null,
          2
        ) + '\n',
    },
    { path: '.gitignore', content: 'node_modules/\ndist/\n' },
    {
      path: 'src/main.ts',
      content: `import { createApp } from 'transone';
import { AppComponent } from './AppComponent';

export const app = createApp({
  root: AppComponent,
  document: { title: 'TransOne component variants' },
});
app.mount();
`,
    },
    {
      path: 'src/AppComponent.ts',
      content: `import { BaseComponent, createComponent, h, type VNode } from 'transone';
import { CardComponent } from './components/card/CardComponent';

export class AppComponent extends BaseComponent<object, object> {
  protected initState(): object { return {}; }
  protected initStyles(): void {}

  protected render(): VNode {
    return h('main', { style: { padding: '16px' } }, [
      h('h1', {}, ['TransOne component variants']),
      createComponent({
        component: CardComponent,
        props: { title: 'Shared business, platform view' },
      }),
    ]);
  }
}
`,
    },
    {
      path: 'src/components/card/CardComponent.ts',
      content: `import { BaseComponent, h, type VNode } from 'transone';

export interface CardProps { title: string; }
export interface CardState { count: number; }

/** Shared state and business methods; pages only import this class. */
export class CardComponent extends BaseComponent<CardProps, CardState> {
  protected initState(): CardState { return { count: 0 }; }
  protected initStyles(): void {}
  protected increment(): void { this.state.count += 1; }

${cardRender('Shared Card')}
}
`,
    },
    ...cardViews.map((view) => ({
      path: `src/components/card/${view.className}.ts`,
      content: `import { ${view.decorator}, h, type VNode } from 'transone';
import { CardComponent } from './CardComponent';

@${view.decorator}()
export class ${view.className} extends CardComponent {
${cardRender(view.label, view.background)}
}
`,
    })),
  ];
}
