import { describe, expect, it } from 'bun:test';
import type { CompileContext, ClassSource } from '../src/mp/types';
import { loadTypescript } from '../src/mp/ts-loader';
import { compileUnit, finalizeComponentProperties } from '../src/mp/compile';
import { MP_WEIXIN_DIALECT } from '../src/mp/dialect';

type TsType = CompileContext['ts'];

function makeClassSource(
  ts: TsType,
  sourceText: string,
  className: string,
  fileName = 'test.ts'
): ClassSource {
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
  const target = source.statements.find(
    (statement) =>
      ts.isClassDeclaration(statement) && statement.name?.text === className
  );
  if (!target || !ts.isClassDeclaration(target)) {
    throw new Error(`no class "${className}" in fixture:\n${sourceText}`);
  }
  return {
    filePath: fileName,
    source,
    declaration: target,
    className: target.name!.text,
  };
}

function makeContext(ts: TsType): CompileContext {
  return {
    ts,
    root: '/',
    files: new Map(),
    dialect: MP_WEIXIN_DIALECT,
    components: new Map(),
    compiling: new Set(),
    callSites: new Map(),
    lengthUnit: 'px',
    warnings: [],
  };
}

async function compile(
  kind: 'page' | 'component',
  name: string,
  sourceText: string,
  className = 'App',
  fileName = 'test.ts',
  lengthUnit: 'px' | 'rpx' = 'px'
) {
  const ts = await loadTypescript();
  const context = makeContext(ts);
  context.lengthUnit = lengthUnit;
  const classSource = makeClassSource(ts, sourceText, className, fileName);
  const unit = compileUnit(context, classSource, { kind, name });
  finalizeComponentProperties(context);
  return { unit, context };
}

describe('mp compile: 页面模板', () => {
  it('编译 h/文本/属性/事件为 WXML', async () => {
    const { unit } = await compile(
      'page',
      'index',
      `
      import { Component, h } from 'transone';
      const GREETING = 'hi';
      export class App extends Component {
        initState() {
          return { count: 0, title: GREETING };
        }
        initStyles() {
          this.styleManager.addStyle('card', {
            selector: '.card',
            properties: { color: 'red', fontSize: '14px' },
          });
        }
        render() {
          return h('div', { class: 'card', onClick: () => this.onTap() }, [
            h('p', {}, this.state.title),
          ]);
        }
        onTap() {
          this.setState({ count: this.state.count + 1 });
        }
      }`
    );

    expect(unit.template).toContain('<view class="card" bindtap="onTap">');
    expect(unit.template).toContain('{{title}}');
    expect(unit.template).not.toContain('{{GREETING}}');
    expect(unit.data).toContain('"count": 0');
    expect(unit.data).toContain('"title": "hi"');
    expect(unit.style).toContain('.card {');
    expect(unit.style).toContain('  color: red;');
    expect(unit.style).toContain('  font-size: 14px;');
    const methods = unit.methods.map((entry) => entry.key).join(',');
    expect(methods).toContain('onTap');
    const onTap = unit.methods.find((entry) => entry.key === 'onTap')!;
    expect(onTap.fn).toContain('this.setData({ count: this.data.count + 1 })');
  });

  it('编译 each 循环与 wx:key', async () => {
    const { unit } = await compile(
      'page',
      'index',
      `
      import { Component, h, each } from 'transone';
      export class App extends Component {
        initState() {
          return { list: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }] };
        }
        render() {
          return each(
            this.state.list,
            (item, index) => h('span', { key: index }, item.name),
            (item) => item.id
          );
        }
      }`
    );

    expect(unit.template).toContain(
      '<block wx:for="{{list}}" wx:for-item="item" wx:for-index="index" wx:key="id">'
    );
    expect(unit.template).toContain('{{item.name}}');
    expect(unit.template).not.toContain(' key=');
  });

  it('编译三元条件与 && 条件渲染', async () => {
    const { unit } = await compile(
      'page',
      'index',
      `
      import { Component, h } from 'transone';
      export class App extends Component {
        initState() {
          return { loading: true, ok: false };
        }
        render() {
          return [
            this.state.loading ? h('div', {}, 'loading') : h('div', {}, 'done'),
            this.state.ok && h('div', {}, 'ok-marker'),
          ];
        }
      }`
    );

    expect(unit.template).toContain('<block wx:if="{{loading}}">');
    expect(unit.template).toContain('<block wx:else>');
    expect(unit.template).toContain('<block wx:if="{{ok}}">');
    expect(unit.template).toContain('ok-marker');
  });

  it('编译元素快捷方式与组件对象形态（props + emitters）', async () => {
    const { unit, context } = await compile(
      'page',
      'index',
      `
      import { Component, createComponent, Div } from 'transone';
      export class Badge extends Component {
        initState() {
          return { label: 'x' };
        }
        render() {
          return Div({
            props: { text: this.props.text },
            onClick: () => this.onTap(),
            children: [this.state.label],
          });
        }
        onTap() {
          this.emit('picked', 1, 'two');
        }
      }
      export class App extends Component {
        render() {
          return createComponent({
            component: Badge,
            props: { text: 'hello' },
            emitters: { picked: (payload) => this.handlePick(payload) },
          });
        }
        handlePick(payload: unknown) {
          this.setState({ picked: 1 });
        }
      }`
    );

    // 页面：使用 badge 组件 + emitters 包装方法（key 带序号，支持同名事件多实例）
    expect(unit.template).toContain(
      '<badge text="hello" bind:picked="__transone_emitter_picked_0">'
    );
    expect(unit.usingComponents['badge']).toBe('/components/badge/badge');
    const wrapper = unit.methods.find(
      (entry) => entry.key === '__transone_emitter_picked_0'
    )!;
    expect(wrapper.fn).toContain('this.handlePick(...e.detail.args)');

    // 组件：properties 聚合 + triggerEvent
    const badge = context.components.get('badge')!;
    expect(badge.properties).toEqual({ text: 'String' });
    expect(badge.template).toContain('<view text="{{text}}" bindtap="onTap">');
    expect(badge.template).toContain('{{label}}');
    const onTap = badge.methods.find((entry) => entry.key === 'onTap')!;
    expect(onTap.fn).toContain(
      "this.triggerEvent('picked', { args: [1, 'two'] })"
    );
  });

  it('把 this.state 赋值改写为 setData 路径', async () => {
    const { unit } = await compile(
      'page',
      'index',
      `
      import { Component } from 'transone';
      export class App extends Component {
        initState() {
          return { form: { name: '' }, items: ['a'] };
        }
        render() {
          return h('div', { onClick: () => this.update() }, 'x');
        }
        update() {
          this.state.form.name = 'x';
          this.state.items[0] = 'b';
        }
      }`
    );

    const update = unit.methods.find((entry) => entry.key === 'update')!;
    expect(update.fn).toContain('this.setData({ "form.name": \'x\' })');
    expect(update.fn).toContain('this.setData({ "items[0]": \'b\' })');
  });

  it('body 样式归入全局并转为 page 选择器', async () => {
    const { unit } = await compile(
      'page',
      'index',
      `
      import { Component } from 'transone';
      export class App extends Component {
        initStyles() {
          this.styleManager.addStyle('base', {
            selector: 'body',
            properties: { margin: '0' },
          });
        }
        render() {
          return 'x';
        }
      }`
    );

    expect(unit.globalStyle).toContain('page {');
    expect(unit.globalStyle).toContain('  margin: 0;');
    expect(unit.style).toBe('');
  });

  it('不可静态编译的 render 报中文错误', async () => {
    await expect(
      compile(
        'page',
        'index',
        `
        import { Component, h } from 'transone';
        export class App extends Component {
          render() {
            return h('div', {}, this.format(this.state.count));
          }
          format(n: number) { return String(n); }
        }`
      )
    ).rejects.toThrow(/不支持的渲染调用/);
  });

  it('页面组件使用 this.emit 报错', async () => {
    await expect(
      compile(
        'page',
        'index',
        `
        import { Component } from 'transone';
        export class App extends Component {
          render() {
            return h('div', { onClick: () => this.go() }, 'x');
          }
          go() {
            this.emit('nope', 1);
          }
        }`
      )
    ).rejects.toThrow(/页面组件不能使用 this\.emit/);
  });

  it('动态 className 编译为模板绑定而非静默丢弃', async () => {
    const { unit } = await compile(
      'page',
      'index',
      `
      import { Component, h, each } from 'transone';
      export class App extends Component {
        initState() {
          return { list: [{ id: 1, hot: true }, { id: 2, hot: false }] };
        }
        render() {
          return each(this.state.list, (item) =>
            h('span', {
              className: item.hot ? 'row hot' : 'row',
            }, [item.id])
          );
        }
      }`
    );
    expect(unit.template).toContain(
      `class="{{(item.hot ? 'row hot' : 'row')}}"`
    );
    expect(unit.template).not.toContain('<span >');
  });

  it('列表项事件透传事件对象并输出 data-id dataset', async () => {
    const { unit } = await compile(
      'page',
      'index',
      `
      import { Component, h, each } from 'transone';
      export class App extends Component {
        initState() {
          return { list: [{ id: 1, score: 88 }] };
        }
        render() {
          return each(this.state.list, (item) =>
            h('div', { class: 'row', dataId: item.id, onClick: (e) => this.select(e) }, [item.score])
          );
        }
        select(e: unknown) {}
      }`
    );
    expect(unit.template).toContain(`bindtap="select"`);
    expect(unit.template).toContain(`data-id="{{item.id}}"`);
    expect(unit.methods.some((entry) => entry.key === 'select')).toBe(true);
  });

  it('事件透传兼容实参上的 TS 类型断言（e as TapEvent）', async () => {
    const { unit } = await compile(
      'page',
      'index',
      `
      import { Component, h } from 'transone';
      interface TapEvent { currentTarget: { dataset: Record<string, unknown> } }
      export class App extends Component {
        render() {
          return h('div', { onClick: (e) => this.select(e as unknown as TapEvent) }, 'x');
        }
        select(e: TapEvent) {}
      }`
    );
    expect(unit.template).toContain(`bindtap="select"`);
  });

  it('页面生命周期 onShow/onPullDownRefresh/onShareAppMessage 映射到 Page', async () => {
    const { unit } = await compile(
      'page',
      'index',
      `
      import { Component, h } from 'transone';
      export class App extends Component {
        render() {
          return h('div', {}, 'x');
        }
        onShow() {}
        onPullDownRefresh() {
          this.setState({ refreshed: true });
        }
        onShareAppMessage() {
          return { title: '城市指数' };
        }
      }`
    );
    const keys = unit.lifecycle.map((entry) => entry.key);
    expect(keys).toContain('onShow');
    expect(keys).toContain('onPullDownRefresh');
    expect(keys).toContain('onShareAppMessage');
    const refresh = unit.lifecycle.find((e) => e.key === 'onPullDownRefresh')!;
    expect(refresh.fn).toContain('this.setData({ refreshed: true })');
  });

  it('样式数字值按 px 输出，0 与无单位属性不加单位', async () => {
    const { unit } = await compile(
      'page',
      'index',
      `
      import { Component, h } from 'transone';
      export class App extends Component {
        initStyles() {
          this.styleManager.addStyle('card', {
            selector: '.card',
            properties: { fontSize: 28, margin: 0, opacity: 0.5, lineHeight: 1.4 },
          });
        }
        render() {
          return h('div', { class: 'card' }, 'x');
        }
      }`
    );
    expect(unit.style).toContain('  font-size: 28px;');
    expect(unit.style).toContain('  margin: 0;');
    expect(unit.style).toContain('  opacity: 0.5;');
    expect(unit.style).toContain('  line-height: 1.4;');
  });

  it('lengthUnit=rpx 时数字长度按 1px=2rpx 换算', async () => {
    const { unit } = await compile(
      'page',
      'index',
      `
      import { Component, h } from 'transone';
      export class App extends Component {
        initStyles() {
          this.styleManager.addStyle('card', {
            selector: '.card',
            properties: { fontSize: 14, opacity: 0.5 },
          });
        }
        render() {
          return h('div', { class: 'card' }, 'x');
        }
      }`,
      'App',
      'test.ts',
      'rpx'
    );
    expect(unit.style).toContain('  font-size: 28rpx;');
    expect(unit.style).toContain('  opacity: 0.5;');
  });

  it('hover 样式输出 hover-class 块并映射到元素', async () => {
    const { unit } = await compile(
      'page',
      'index',
      `
      import { Component, h } from 'transone';
      export class App extends Component {
        initStyles() {
          this.styleManager.addStyle('card', {
            selector: '.card',
            properties: { backgroundColor: '#fff' },
            hover: { backgroundColor: '#eee' },
          });
        }
        render() {
          return h('div', { class: 'card' }, 'x');
        }
      }`
    );
    expect(unit.style).toContain('.card-hover {');
    expect(unit.style).not.toContain(':hover');
    expect(unit.template).toContain(`class="card" hover-class="card-hover"`);
  });

  it('小程序专有组件与 kebab 属性可用', async () => {
    const { unit } = await compile(
      'page',
      'index',
      `
      import { Component, h } from 'transone';
      export class App extends Component {
        render() {
          return h('scroll-view', { scrollX: true, onScrollToLower: () => this.loadMore() }, [
            h('view', {}, 'content'),
            h('ad', { unitId: 'adunit-xxx' }, []),
          ]);
        }
        loadMore() {}
      }`
    );
    expect(unit.template).toContain('<scroll-view scroll-x');
    expect(unit.template).toContain('bindscrolltolower="loadMore"');
    expect(unit.template).toContain('<ad unit-id="adunit-xxx"');
    expect(unit.template).toContain('<view>');
  });

  it('模板内函数调用报中文错误并提示预计算', async () => {
    await expect(
      compile(
        'page',
        'index',
        `
        import { Component, h, each } from 'transone';
        export class App extends Component {
          initState() {
            return { list: [{ score: 88.123 }] };
          }
          render() {
            return each(this.state.list, (item) =>
              h('div', { className: item.score.toFixed(1) }, 'x')
            );
          }
        }`
      )
    ).rejects.toThrow(/模板表达式不支持函数调用/);
  });
});

describe('mp compile: 相对模块内联', () => {
  it('页面方法体引用的普通模块被内联进产物 JS', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'transone-inline-'));

    const helperSource = `
      export interface Entry { city: string; score: number }
      export const api = {
        ranking: (code: string) => '/api/rankings/' + code,
      };
      export const RANKINGS = ['air', 'metro'];
      export function fmtScore(n: number): string {
        return n + ' 分';
      }
    `;
    const pageSource = `
      import { Component, h } from 'transone';
      import { api, RANKINGS, fmtScore } from './helper.ts';
      export class App extends Component {
        initState() {
          return { title: 'x' };
        }
        loadTitle() {
          return api.ranking(RANKINGS[0]);
        }
        initStyles() {}
        loadScore() {
          return fmtScore(66);
        }
        render() {
          return h('view', {}, ['x']);
        }
      }
    `;

    try {
      await writeFile(join(dir, 'helper.ts'), helperSource, 'utf8');
      await writeFile(join(dir, 'page.ts'), pageSource, 'utf8');

      const ts = await loadTypescript();
      const context = makeContext(ts);
      const classSource = makeClassSource(
        ts,
        pageSource,
        'App',
        join(dir, 'page.ts')
      );
      const unit = compileUnit(context, classSource, { kind: 'page', name: 'index' });

      expect(unit.inlineModules.length).toBeGreaterThan(0);
      const { generatePageJs } = await import('../src/mp/jsgen');
      const js = generatePageJs(unit, MP_WEIXIN_DIALECT);
      expect(js).toContain('const api');
      expect(js).toContain('RANKINGS');
      expect(js).toContain('fmtScore');
      // 类型与模块边界不应残留
      expect(js).not.toContain('interface Entry');
      expect(js).not.toContain('import {');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
