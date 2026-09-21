import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { build } from '../src/build';

const roots: string[] = [];
const frameworkEntryPath = join(
  import.meta.dir,
  '..',
  '..',
  'transone',
  'lib',
  'index.ts'
);

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'transone-cli-mp-'));
  roots.push(root);

  mkdirSync(join(root, 'src'));
  writeFileSync(
    join(root, 'src', 'main.ts'),
    `
      import { createApp, Component, h, each } from '${frameworkEntryPath}';
      import { Badge } from './components/Badge';

      export class App extends Component {
        initState() {
          return { list: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }], title: 'TransOne MP' };
        }
        initStyles() {
          this.styleManager.addStyle('base', { selector: 'body', properties: { margin: '0' } });
          this.styleManager.addStyle('card', { selector: '.card', properties: { color: '#333' } });
        }
        render() {
          return h('div', { class: 'card', onClick: () => this.onTap() }, [
            h('span', {}, this.state.title),
            each(this.state.list, (item) => h('span', {}, item.name)),
            createComponent({ component: Badge, props: { label: 'badge' } }),
          ]);
        }
        onTap() {
          this.setState({ title: 'tapped' });
        }
      }

      export const app = createApp({ root: App });
    `
  );

  mkdirSync(join(root, 'src', 'components'));
  writeFileSync(
    join(root, 'src', 'components', 'Badge.ts'),
    `
      import { Component, h, slot } from '${frameworkEntryPath}';

      export class Badge extends Component {
        render() {
          return h('div', {}, [this.props.label, slot('default')]);
        }
      }
    `
  );

  writeFileSync(
    join(root, 'transone.config.ts'),
    `
      export default {
        entry: 'src/main.ts',
        mp: {
          appId: 'wx1234567890',
          navigationBarTitleText: 'MP App',
          pages: { '/': 'src/main.ts', '/about': 'src/main.ts' },
        },
      };
    `
  );

  return root;
}

describe('mp build', () => {
  afterEach(() => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
    roots.length = 0;
  });

  it('transone build --mp-weixin 生成原生小程序工程', async () => {
    const root = makeRoot();
    const result = await build({ root, target: 'mp-weixin' });
    const out = join(root, 'dist', 'build', 'mp-weixin');
    expect(result.outDir).toBe(out);
    expect(result.assetsBuilt.length).toBeGreaterThan(0);

    // app.json：页面清单 + 全局导航栏
    const appJson = JSON.parse(readFileSync(join(out, 'app.json'), 'utf8'));
    expect(appJson.pages).toEqual(['pages/index/index', 'pages/about/about']);
    expect(appJson.window.navigationBarTitleText).toBe('MP App');

    // project.config.json：appid
    const projectConfig = JSON.parse(
      readFileSync(join(out, 'project.config.json'), 'utf8')
    );
    expect(projectConfig.appid).toBe('wx1234567890');

    // 页面四件套
    for (const file of ['index.wxml', 'index.wxss', 'index.js', 'index.json']) {
      expect(existsSync(join(out, 'pages', 'index', file))).toBe(true);
    }
    const wxml = readFileSync(
      join(out, 'pages', 'index', 'index.wxml'),
      'utf8'
    );
    expect(wxml).toContain('wx:for="{{list}}"');
    expect(wxml).toContain('<badge label="badge">');
    expect(wxml).toContain('{{title}}');
    expect(wxml).toContain('bindtap="onTap"');

    const pageJs = readFileSync(
      join(out, 'pages', 'index', 'index.js'),
      'utf8'
    );
    expect(pageJs).toContain('Page({');
    expect(pageJs).toContain("this.setData({ title: 'tapped' })");
    expect(pageJs).toContain('"title": "TransOne MP"');

    const pageJson = JSON.parse(
      readFileSync(join(out, 'pages', 'index', 'index.json'), 'utf8')
    );
    expect(pageJson.usingComponents.badge).toBe('/components/badge/badge');

    // 组件四件套
    for (const file of ['badge.wxml', 'badge.wxss', 'badge.js', 'badge.json']) {
      expect(existsSync(join(out, 'components', 'badge', file))).toBe(true);
    }
    const badgeJs = readFileSync(
      join(out, 'components', 'badge', 'badge.js'),
      'utf8'
    );
    expect(badgeJs).toContain('Component({');
    expect(badgeJs).toContain('properties: {');
    expect(badgeJs).toContain('"label": { type: String, value: \'\' }');
    const badgeJson = JSON.parse(
      readFileSync(join(out, 'components', 'badge', 'badge.json'), 'utf8')
    );
    expect(badgeJson.component).toBe(true);
    const badgeWxml = readFileSync(
      join(out, 'components', 'badge', 'badge.wxml'),
      'utf8'
    );
    expect(badgeWxml).toContain('<slot/>');
    expect(badgeWxml).not.toContain('<slot name="default"/>');

    // 全局样式合并进 app.wxss（body -> page）
    const appWxss = readFileSync(join(out, 'app.wxss'), 'utf8');
    expect(appWxss).toContain('page {');
  });

  it('mp 配置缺失时 --mp-weixin 走默认值（touristappid）', async () => {
    const root = mkdtempSync(join(tmpdir(), 'transone-cli-mp-default-'));
    roots.push(root);
    mkdirSync(join(root, 'src'));
    writeFileSync(
      join(root, 'src', 'main.ts'),
      `
        import { createApp, Component } from '${frameworkEntryPath}';
        export class App extends Component {
          render() {
            return 'hi';
          }
        }
        export const app = createApp({ root: App });
      `
    );

    const result = await build({ root, target: 'mp-weixin' });
    const out = join(root, 'dist', 'build', 'mp-weixin');
    const projectConfig = JSON.parse(
      readFileSync(join(out, 'project.config.json'), 'utf8')
    );
    expect(projectConfig.appid).toBe('touristappid');
    expect(result.assetsBuilt).toContain(
      join(out, 'pages', 'index', 'index.js')
    );
  });

  it('mp 扩展配置：window/tabBar/pageExtra/public/globalData 写入产物', async () => {
    const root = mkdtempSync(join(tmpdir(), 'transone-cli-mp-ext-'));
    roots.push(root);

    mkdirSync(join(root, 'src'));
    writeFileSync(
      join(root, 'src', 'main.ts'),
      `
        import { createApp, Component, h } from '${frameworkEntryPath}';
        import { Badge } from './components/Badge';

        export class App extends Component {
          render() {
            return h('div', {}, createComponent({ component: Badge, props: { label: 'x' } }));
          }
        }
        export const app = createApp({ root: App });
      `
    );
    mkdirSync(join(root, 'src', 'components'));
    writeFileSync(
      join(root, 'src', 'components', 'Badge.ts'),
      `
        import { Component, h } from '${frameworkEntryPath}';
        export class Badge extends Component {
          render() {
            return h('div', {}, this.props.label);
          }
        }
      `
    );
    // public 静态资源目录
    mkdirSync(join(root, 'public', 'assets'), { recursive: true });
    writeFileSync(join(root, 'public', 'assets', 'logo.png'), 'png');
    writeFileSync(
      join(root, 'transone.config.ts'),
      `
        export default {
          entry: 'src/main.ts',
          mp: {
            appId: 'wx1234567890',
            pages: { '/': 'src/main.ts' },
            window: { navigationBarBackgroundColor: '#1c2333' },
            tabBar: { color: '#333', selectedColor: '#1c2333', list: [{ pagePath: 'pages/index/index', text: '首页' }] },
            appExtra: { lazyCodeLoading: 'requiredComponents' },
            pageExtra: { '/': { enablePullDownRefresh: true, navigationBarTitleText: '首页' } },
            globalData: { version: '1.0.0' },
          },
        };
      `
    );

    const result = await build({ root, target: 'mp-weixin' });
    const out = join(root, 'dist', 'build', 'mp-weixin');

    const appJson = JSON.parse(readFileSync(join(out, 'app.json'), 'utf8'));
    expect(appJson.window.navigationBarBackgroundColor).toBe('#1c2333');
    expect(appJson.tabBar.list).toEqual([
      { pagePath: 'pages/index/index', text: '首页' },
    ]);
    expect(appJson.lazyCodeLoading).toBe('requiredComponents');

    const appJs = readFileSync(join(out, 'app.js'), 'utf8');
    expect(appJs).toContain('globalData');
    expect(appJs).toContain('"version":"1.0.0"');

    const pageJson = JSON.parse(
      readFileSync(join(out, 'pages', 'index', 'index.json'), 'utf8')
    );
    expect(pageJson.enablePullDownRefresh).toBe(true);
    expect(pageJson.navigationBarTitleText).toBe('首页');

    const badgeJson = JSON.parse(
      readFileSync(join(out, 'components', 'badge', 'badge.json'), 'utf8')
    );
    expect(badgeJson.component).toBe(true);
    expect(badgeJson.multipleSlots).toBe(true);

    expect(existsSync(join(out, 'assets', 'logo.png'))).toBe(true);
    expect(result.assetsBuilt).not.toContain(join(out, 'assets', 'logo.png'));
  });

  it('mp-alipay 产物使用 AXML/ACSS/a: 指令/on 事件/mini.project.json', async () => {
    const root = makeRoot();
    const result = await build({ root, target: 'mp-alipay' });
    const out = join(root, 'dist', 'build', 'mp-alipay');
    expect(result.outDir).toBe(out);

    // app.json：defaultTitle（阿里 window 字段名）
    const appJson = JSON.parse(readFileSync(join(out, 'app.json'), 'utf8'));
    expect(appJson.pages).toEqual(['pages/index/index', 'pages/about/about']);
    expect(appJson.window.defaultTitle).toBe('MP App');
    expect(appJson.window.navigationBarTitleText).toBeUndefined();

    // 工程配置：mini.project.json（component2 模式），无 sitemap.json
    const projectConfig = JSON.parse(
      readFileSync(join(out, 'mini.project.json'), 'utf8')
    );
    expect(projectConfig.component2).toBe(true);
    expect(existsSync(join(out, 'sitemap.json'))).toBe(false);

    // 页面：axml + acss，a: 指令与 on 事件绑定
    const axml = readFileSync(join(out, 'pages', 'index', 'index.axml'), 'utf8');
    expect(axml).toContain('a:for="{{list}}"');
    expect(axml).toContain('onTap="onTap"');
    expect(axml).not.toContain('wx:');
    expect(existsSync(join(out, 'pages', 'index', 'index.acss'))).toBe(true);
    expect(existsSync(join(out, 'app.acss'))).toBe(true);

    // 组件：axml 产物；组件 json 无 multipleSlots
    const badgeJson = JSON.parse(
      readFileSync(join(out, 'components', 'badge', 'badge.json'), 'utf8')
    );
    expect(badgeJson.component).toBe(true);
    expect(badgeJson.multipleSlots).toBeUndefined();
  });

  it('mp-bytedance 产物使用 TTML/TTSS/tt: 指令/工程配置', async () => {
    const root = makeRoot();
    const result = await build({ root, target: 'mp-bytedance' });
    const out = join(root, 'dist', 'build', 'mp-bytedance');
    expect(result.outDir).toBe(out);

    const ttml = readFileSync(join(out, 'pages', 'index', 'index.ttml'), 'utf8');
    expect(ttml).toContain('tt:for="{{list}}"');
    expect(ttml).toContain('bindtap="onTap"');
    expect(ttml).not.toContain('wx:');
    expect(existsSync(join(out, 'pages', 'index', 'index.ttss'))).toBe(true);
    expect(existsSync(join(out, 'app.ttss'))).toBe(true);
    expect(existsSync(join(out, 'sitemap.json'))).toBe(false);

    const projectConfig = JSON.parse(
      readFileSync(join(out, 'project.config.json'), 'utf8')
    );
    expect(projectConfig.appid).toBe('wx1234567890');
    expect(projectConfig.miniprogramRoot).toBe('./');

    const badgeJson = JSON.parse(
      readFileSync(join(out, 'components', 'badge', 'badge.json'), 'utf8')
    );
    expect(badgeJson.component).toBe(true);
    expect(badgeJson.multipleSlots).toBeUndefined();
  });
  it('mp-alipay 产物使用 AXML/ACSS/a: 指令/on 事件/mini.project.json', async () => {
    const root = makeRoot();
    const result = await build({ root, target: 'mp-alipay' });
    const out = join(root, 'dist', 'build', 'mp-alipay');
    expect(result.outDir).toBe(out);

    // app.json：defaultTitle（阿里 window 字段名）
    const appJson = JSON.parse(readFileSync(join(out, 'app.json'), 'utf8'));
    expect(appJson.pages).toEqual(['pages/index/index', 'pages/about/about']);
    expect(appJson.window.defaultTitle).toBe('MP App');
    expect(appJson.window.navigationBarTitleText).toBeUndefined();

    // 工程配置：mini.project.json（component2 模式），无 sitemap.json
    const projectConfig = JSON.parse(
      readFileSync(join(out, 'mini.project.json'), 'utf8')
    );
    expect(projectConfig.component2).toBe(true);
    expect(existsSync(join(out, 'sitemap.json'))).toBe(false);

    // 页面：axml + acss，a: 指令与 on 事件绑定
    const axml = readFileSync(join(out, 'pages', 'index', 'index.axml'), 'utf8');
    expect(axml).toContain('a:for="{{list}}"');
    expect(axml).toContain('onTap="onTap"');
    expect(axml).not.toContain('wx:');
    expect(existsSync(join(out, 'pages', 'index', 'index.acss'))).toBe(true);
    expect(existsSync(join(out, 'app.acss'))).toBe(true);

    // 组件：axml 产物；组件 json 无 multipleSlots
    const badgeJson = JSON.parse(
      readFileSync(join(out, 'components', 'badge', 'badge.json'), 'utf8')
    );
    expect(badgeJson.component).toBe(true);
    expect(badgeJson.multipleSlots).toBeUndefined();
  });

  it('mp-bytedance 产物使用 TTML/TTSS/tt: 指令/工程配置', async () => {
    const root = makeRoot();
    const result = await build({ root, target: 'mp-bytedance' });
    const out = join(root, 'dist', 'build', 'mp-bytedance');
    expect(result.outDir).toBe(out);

    const ttml = readFileSync(join(out, 'pages', 'index', 'index.ttml'), 'utf8');
    expect(ttml).toContain('tt:for="{{list}}"');
    expect(ttml).toContain('bindtap="onTap"');
    expect(ttml).not.toContain('wx:');
    expect(existsSync(join(out, 'pages', 'index', 'index.ttss'))).toBe(true);
    expect(existsSync(join(out, 'app.ttss'))).toBe(true);
    expect(existsSync(join(out, 'sitemap.json'))).toBe(false);

    const projectConfig = JSON.parse(
      readFileSync(join(out, 'project.config.json'), 'utf8')
    );
    expect(projectConfig.appid).toBe('wx1234567890');
    expect(projectConfig.miniprogramRoot).toBe('./');

    const badgeJson = JSON.parse(
      readFileSync(join(out, 'components', 'badge', 'badge.json'), 'utf8')
    );
    expect(badgeJson.component).toBe(true);
    expect(badgeJson.multipleSlots).toBeUndefined();
  });

});
