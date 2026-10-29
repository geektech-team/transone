import { afterEach, describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { compileUnit } from '../src/mp/compile';
import { generateComponentJs } from '../src/mp/jsgen';
import {
  MP_WEIXIN_DIALECT,
  MP_ALIPAY_DIALECT,
  MP_BYTEDANCE_DIALECT,
  MP_XIAOHONGSHU_DIALECT,
} from '../src/mp/dialect';
import type {
  ClassSource,
  CompileContext,
  CompiledUnit,
} from '../src/mp/types';
import { build } from '../src/build';
import type { TargetInput } from '../src/types';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const sourceText = `class Card {
  seed=this.props.start??7; label=this.props.label??'fallback'; enabled=this.props.enabled??true;
  config=this.props.config??{step:2}; root=this.props;
  initState(){return {count:this.seed,direct:this.props.direct??1};}
  initStyles(){}
  beforeMount(){this.order=['before',this.seed,this.state.count];}
  onMounted(){this.order.push('mounted');}
  onPropsChange(){this.changed=(this.changed??0)+1;}
  tap(){this.setState({count:this.state.count+this.config.step});}
  render(){return h('button',{onClick:()=>this.tap()},[this.label,this.state.count,this.props.label]);}
}`;
function compile(text = sourceText, dialect = MP_WEIXIN_DIALECT): CompiledUnit {
  const source = ts.createSourceFile(
    'props.ts',
    text,
    ts.ScriptTarget.Latest,
    true
  );
  const declaration = source.statements.find(ts.isClassDeclaration)!;
  const context: CompileContext = {
    ts,
    root: '/',
    files: new Map(),
    components: new Map(),
    compiling: new Set(),
    callSites: new Map(),
    lengthUnit: 'px',
    dialect,
    warnings: [],
  };
  const owner: ClassSource = {
    filePath: 'props.ts',
    source,
    declaration,
    className: 'Card',
  };
  const unit = compileUnit(context, owner, { kind: 'component', name: 'card' });
  unit.properties = {
    start: 'Number',
    label: 'String',
    enabled: 'Boolean',
    config: 'Object',
    direct: 'Number',
  };
  return unit;
}
function define(
  unit: CompiledUnit,
  dialect = MP_WEIXIN_DIALECT
): Record<string, any> {
  let value: Record<string, any> = {};
  new Function('Component', generateComponentJs(unit, dialect))(
    (definition: typeof value) => {
      value = definition;
    }
  );
  return value;
}
function host(definition: Record<string, any>, dialect = MP_WEIXIN_DIALECT) {
  let mounted = false;
  const instance: Record<string, any> = {
    ...definition.methods,
    data: structuredClone(definition.data),
    properties: { start: 0, label: '', enabled: false, direct: 0 },
    props: {},
    setData(patch: object) {
      if (!mounted) throw new Error('created cannot setData');
      Object.assign(this.data, patch);
    },
  };
  definition.lifetimes?.created?.call(instance);
  return {
    instance,
    mount(props: object) {
      mounted = true;
      const bag = {
        start: 0,
        label: '',
        enabled: false,
        direct: 0,
        __transone_props: props,
      };
      if (dialect.id === 'mp-alipay') instance.props = bag;
      else if (dialect.id === 'mp-xiaohongshu')
        Object.assign(instance.data, bag);
      else instance.properties = bag;
      (dialect.id === 'mp-alipay'
        ? definition.onInit
        : definition.lifetimes.attached
      ).call(instance);
      if (dialect.id === 'mp-alipay') definition.didMount?.call(instance);
    },
  };
}

describe('props-based mini program initialization', () => {
  for (const dialect of [
    MP_WEIXIN_DIALECT,
    MP_ALIPAY_DIALECT,
    MP_BYTEDANCE_DIALECT,
    MP_XIAOHONGSHU_DIALECT,
  ])
    it(`${dialect.id} snapshots real initial props after created and retains state on later props`, () => {
      const unit = compile(sourceText, dialect),
        definition = define(unit, dialect),
        h = host(definition, dialect);
      h.mount({
        start: 0,
        label: '',
        enabled: false,
        config: { step: 3 },
        direct: 0,
      });
      const instance = h.instance;
      expect(instance.seed).toBe(0);
      expect(instance.label).toBe('');
      expect(instance.enabled).toBe(false);
      expect(instance.data.count).toBe(0);
      expect(instance.data.direct).toBe(0);
      expect(instance.order).toEqual(['before', 0, 0, 'mounted']);
      const replacement = {
        start: 99,
        label: 'new',
        enabled: true,
        config: { step: 100 },
      };
      if (dialect.id === 'mp-alipay')
        instance.props.__transone_props = replacement;
      else if (dialect.id === 'mp-xiaohongshu')
        instance.data.__transone_props = replacement;
      else instance.properties.__transone_props = replacement;
      Object.values(definition.observers ?? {}).forEach((observer: any) =>
        observer.call(instance)
      );
      definition.didUpdate?.call(instance);
      instance.tap();
      expect(instance.seed).toBe(0);
      expect(instance.label).toBe('');
      expect(instance.root.start).toBe(0);
      expect(instance.data.count).toBe(3);
      expect(instance.data.direct).toBe(0);
      expect(instance.data.__transone_initial_fields.label).toBe('');
      expect(unit.template).toContain('__transone_initial_fields');
    });
  it('distinguishes absent props from native Number/Boolean/String defaults', () => {
    const definition = define(compile());
    const h = host(definition);
    h.mount({});
    expect(h.instance.seed).toBe(7);
    expect(h.instance.label).toBe('fallback');
    expect(h.instance.enabled).toBe(true);
    expect(h.instance.data.direct).toBe(1);
  });
  it('supports props-based initState even without instance fields', () => {
    const unit = compile(
      `class Card{initState(){return{count:this.props.start??3};}initStyles(){}render(){return h('text',{},[this.state.count]);}}`
    );
    const definition = define(unit),
      h = host(definition);
    h.mount({ start: 4 });
    expect(h.instance.data.count).toBe(4);
  });
  it('supports chained local constants derived from props in initial state', () => {
    const unit = compile(
      `class Card{initState(){const seed=this.props.start??3;const initial={count:seed};return initial;}initStyles(){}render(){return h('text',{},[this.state.count]);}}`
    );
    const definition = define(unit),
      h = host(definition);
    h.mount({ start: 0 });
    expect(h.instance.data.count).toBe(0);
  });
  it('supports bracketed props in fields, initial state and methods without serializing unused undefined fields', () => {
    const unit = compile(
      `class Card{seed=this['props']['start']??3;missing=this.props.absent;initState(){return{count:this['props']['start']??3};}initStyles(){}tap(){this.setState({count:this.state.count+this['props']['step']});}render(){return h('button',{onClick:()=>this.tap()},[this.seed,this.state.count]);}}`
    );
    const definition = define(unit),
      h = host(definition);
    h.mount({ start: 0, step: 2 });
    expect(h.instance.seed).toBe(0);
    expect(h.instance.data.count).toBe(0);
    expect(h.instance.data.__transone_initial_fields).toEqual({ seed: 0 });
    h.instance.tap();
    expect(h.instance.data.count).toBe(2);
  });
  it('emits valid bracket paths for deferred nested field bindings', () => {
    const unit = compile(
      `class Card{config=this.props.config;initState(){return{count:0};}initStyles(){}render(){return h('text',{},[this.config.items[0]['title-key']]);}}`
    );
    expect(unit.template).toContain(
      "__transone_initial_fields.config.items['0']['title-key']"
    );
  });
  it('rejects an impure conditional branch instead of hiding it behind unknown props', () => {
    expect(() =>
      compile(
        `class Card{value=this.props.enabled?sideEffect():1;initState(){return{count:this.value}}initStyles(){}render(){return h('text',{},[this.state.count]);}}`
      )
    ).toThrow(/表达式|初始化/);
  });
  it('validates every local initializer after encountering deferred props', () => {
    expect(() =>
      compile(
        `class Card{initState(){const start=this.props.start;const invalid=sideEffect();return {count:start};}initStyles(){}render(){return h('text',{},[this.state.count]);}}`
      )
    ).toThrow(/表达式|初始化/);
  });
  it('rejects lexical module this hidden behind unknown props', () => {
    expect(() =>
      compile(
        `const BAD=this.props.start;class Card{value=this.props.enabled?BAD:0;initState(){return{count:this.value};}initStyles(){}render(){return h('text',{},[this.state.count]);}}`
      )
    ).toThrow(/模块|this/);
  });
  it('reports source context when props fields are used in static stylesheet rules', () => {
    expect(() =>
      compile(
        `class Card{theme=this.props.theme;initState(){return{count:0};}initStyles(){this.styleManager.addStyle('card',{selector:'.card',properties:this.theme});}render(){return h('text',{},[this.state.count]);}}`
      )
    ).toThrow('props.ts');
  });
  for (const dialect of [
    MP_WEIXIN_DIALECT,
    MP_ALIPAY_DIALECT,
    MP_BYTEDANCE_DIALECT,
    MP_XIAOHONGSHU_DIALECT,
  ])
    it(`${dialect.id} carries typed props through generated parent templates and rootProps into pages`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'mp-props-build-'));
      roots.push(root);
      mkdirSync(join(root, 'src'));
      writeFileSync(
        join(root, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            paths: {
              transone: [
                resolve(import.meta.dir, '../../transone/lib/index.ts'),
              ],
            },
          },
        })
      );
      writeFileSync(
        join(root, 'transone.config.ts'),
        `export default {entry:'src/main.ts',mp:{pages:{'/':'src/main.ts'}}};`
      );
      writeFileSync(
        join(root, 'src/main.ts'),
        `import{BaseComponent,createApp,createComponent,h}from'transone';
      class Parent extends BaseComponent{seed=this.props.start??7;initState(){return{count:this.seed};}initStyles(){}}
      class Card extends Parent{label=this.props.label??'fallback';flag=this.props.flag??true;config=this.props.config;unused=this.props.missing;initState(){return{...super.initState(),flag:this.flag,step:this.config.step};}render(){return h('text',{},[this.label,this.state.count,this.props.label]);}}
      class App extends BaseComponent{initState(){return{count:0};}initStyles(){}render(){return h('main',{},[this.props.title,createComponent(Card,{start:this.state.count,label:'',flag:false,config:{step:3}}),createComponent(Card,{start:5,label:'second',flag:true,config:{step:8}})]);}}
      createApp({root:App,rootProps:{title:'root-title'}});`
      );
      const result = await build({ root, target: dialect.id as TargetInput });
      const pageJs = result.assetsBuilt.find(
        (p) => p.includes('/pages/') && p.endsWith('.js')
      )!;
      let page: Record<string, any> = {};
      new Function('Page', readFileSync(pageJs, 'utf8'))((v: typeof page) => {
        page = v;
      });
      const pageHost: Record<string, any> = {
        ...page,
        data: structuredClone(page.data),
        setData(values: object) {
          Object.assign(this.data, values);
        },
      };
      page.onLoad.call(pageHost);
      expect(pageHost.data.__transone_props).toEqual({ title: 'root-title' });
      const pageTemplate = readFileSync(
        pageJs.replace(/\.js$/, `.${dialect.templateExt}`),
        'utf8'
      );
      expect(pageTemplate).toContain('__transone_props.title');
      const packets = [
        ...pageTemplate.matchAll(
          /__transone_props="\{\{\s*([\s\S]*?)\s*\}\}"/g
        ),
      ].map((match) => {
        const expression = match[1]
          .replace(/&quot;/g, '"')
          .replace(/&#39;|&apos;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&');
        return new Function('count', `return (${expression});`)(
          pageHost.data.count
        );
      });
      expect(packets).toEqual([
        { start: 0, label: '', flag: false, config: { step: 3 } },
        { start: 5, label: 'second', flag: true, config: { step: 8 } },
      ]);
      const cardJs = result.assetsBuilt.find((p) =>
        p.endsWith('/components/card/card.js')
      )!;
      let card: Record<string, any> = {};
      new Function('Component', readFileSync(cardJs, 'utf8'))(
        (v: typeof card) => {
          card = v;
        }
      );
      const first = host(card, dialect),
        second = host(card, dialect);
      first.mount(packets[0]);
      second.mount(packets[1]);
      expect(first.instance.data).toMatchObject({
        count: 0,
        flag: false,
        step: 3,
      });
      expect(second.instance.data).toMatchObject({
        count: 5,
        flag: true,
        step: 8,
      });
      expect(first.instance.unused).toBeUndefined();
      expect(first.instance.data.__transone_initial_fields).toEqual({
        label: '',
      });
      const template = readFileSync(
        cardJs.replace(/\.js$/, `.${dialect.templateExt}`),
        'utf8'
      );
      expect(template).toContain('__transone_props.label');
      expect(template).not.toContain('props.__transone_props');
    });
});
