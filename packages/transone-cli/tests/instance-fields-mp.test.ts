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
import { generateComponentJs, generatePageJs } from '../src/mp/jsgen';
import { MP_WEIXIN_DIALECT } from '../src/mp/dialect';
import type { CompileContext, CompiledUnit } from '../src/mp/types';
import { build } from '../src/build';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function compile(text: string, kind: 'page' | 'component' = 'component') {
  const source = ts.createSourceFile(
    'fields.ts',
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
    dialect: MP_WEIXIN_DIALECT,
    warnings: [],
  };
  return compileUnit(
    context,
    { filePath: 'fields.ts', source, declaration, className: 'Card' },
    { kind, name: 'card' }
  );
}

function load(unit: CompiledUnit): Record<string, any> {
  let definition: Record<string, any> = {};
  const code =
    unit.kind === 'page'
      ? generatePageJs(unit, MP_WEIXIN_DIALECT)
      : generateComponentJs(unit, MP_WEIXIN_DIALECT);
  new Function('Page', 'Component', code)(
    (value: typeof definition) => {
      definition = value;
    },
    (value: typeof definition) => {
      definition = value;
    }
  );
  return definition;
}

function instance(definition: Record<string, any>, kind: 'page' | 'component') {
  const host: Record<string, any> = {
    ...(kind === 'page' ? definition : definition.methods),
    data: structuredClone(definition.data),
    setData(values: object) {
      Object.assign(this.data, values);
    },
  };
  (kind === 'page'
    ? definition.onLoad
    : (definition.onInit ?? definition.lifetimes.attached)
  ).call(host);
  return host;
}

const card = `class Card {
  private seed = 3;
  private options = {step: this.seed + 2, color: 'teal'};
  private values = [this.seed];
  initState() { return {count: this.options.step}; }
  initStyles() { this.styleManager.addStyle('card', {selector: '.card', properties: {color: this.options.color}}); }
  beforeMount() { this.setState({count: this.state.count + this.values[0]}); }
  tap() { this.values.push(9); this.setState({count: this.state.count + this.options.step}); }
  render() { return h('button', {className: 'card', onClick: () => this.tap()}, [this.state.count]); }
}`;

describe('mini program instance fields', () => {
  it('uses static fields as VNode tags, whole inline styles and class names', () => {
    const unit = compile(
      `class Card{tag='button';label='card';theme={color:'teal'};initState(){return {count:1}}initStyles(){this.styleManager.addStyle('card',{selector:'.card',properties:this.theme,hover:{color:'red'}});}render(){return h(this.tag,{className:this.label,style:this.theme},[this.label,this.state.count]);}}`
    );
    expect(unit.template).toContain('<button');
    expect(unit.template).toContain('class="card" hover-class="card-hover"');
    expect(unit.template).toContain('style="color: teal;"');
  });
  it('preserves state root aliases and class-field define semantics', () => {
    const unit = compile(`class Card {
      __proto__={safe:true}; defaults={count:1};
      initState(){return this.defaults}initStyles(){}
      tap(){this.state.count+=1;}
      render(){return h('button',{onClick:()=>this.tap()},[this.defaults.count,this.state.count]);}
    }`);
    expect(unit.template).toContain('{{count}}');
    const host = instance(load(unit), 'component');
    host.tap();
    expect(host.defaults.count).toBe(2);
    expect(Object.prototype.hasOwnProperty.call(host, '__proto__')).toBe(true);
    expect(host.__proto__).toEqual({ safe: true });
    expect(Object.getPrototypeOf(host)).toBe(Object.prototype);
  });
  for (const action of [
    "const alias=this.options;alias.color='blue';",
    "const alias=(this.options as any);alias.color='blue';",
    "const alias=this.options||{};alias.color='blue';",
    'delete this.options.color;',
    "Object.assign(this.options,{color:'blue'});",
  ]) {
    it(`rejects runtime mutation of statically rendered fields: ${action}`, () => {
      expect(() =>
        compile(
          `class Card{options={color:'red'};initState(){return{count:1}}initStyles(){}tap(){${action}this.setState({count:2});}render(){return h('button',{onClick:()=>this.tap()},[this.options.color,this.state.count]);}}`
        )
      ).toThrow('实例字段');
    });
  }
  it('rejects field-side mutations even when the template reads a state object alias', () => {
    expect(() =>
      compile(
        `class Card{options={color:'red'};initState(){return{count:0,options:this.options}}initStyles(){}tap(){this.options.color='blue';this.setState({count:1});}render(){return h('button',{onClick:()=>this.tap()},[this.options.color,this.state.count]);}}`
      )
    ).toThrow('实例字段');
  });
  it('does not mistake a pure unary field read for mutation', () => {
    const unit = compile(
      `class Card{enabled=true;initState(){return{count:1}}initStyles(){}tap(){this.setState({count:!this.enabled?1:2});}render(){return h('button',{onClick:()=>this.tap()},[this.enabled,this.state.count]);}}`
    );
    const host = instance(load(unit), 'component');
    host.tap();
    expect(host.data.count).toBe(2);
  });
  for (const kind of ['page', 'component'] as const) {
    it(`initializes fields before state and beforeMount with fresh arrays for each ${kind}`, () => {
      const unit = compile(card, kind);
      expect(unit.style).toContain('color: teal;');
      const definition = load(unit);
      const first = instance(definition, kind);
      const second = instance(definition, kind);
      expect(first.data.count).toBe(8);
      expect(second.data.count).toBe(8);
      first.tap();
      expect(first.data.count).toBe(13);
      expect(second.data.count).toBe(8);
      expect(first.values).toEqual([3, 9]);
      expect(second.values).toEqual([3]);
    });
  }
  it('skips early and initialization observers, then exposes initialized fields on props changes', () => {
    const unit = compile(
      card.replace(
        'tap() {',
        'onPropsChange() { this.observed = this.seed; } tap() {'
      )
    );
    unit.properties = { count: 'Number' };
    const definition = load(unit);
    const host: Record<string, any> = {
      ...definition.methods,
      data: structuredClone(definition.data),
      observations: [],
      setData(values: object) {
        Object.assign(this.data, values);
        definition.observers.count.call(this);
        this.observations.push(this.observed);
      },
    };
    definition.observers.count.call(host);
    expect(host.observed).toBeUndefined();
    definition.lifetimes.attached.call(host);
    expect(host.data.count).toBe(8);
    expect(host.observations).toEqual([undefined, 3]);
    definition.observers.count.call(host);
    expect(host.observed).toBe(3);
  });
  for (const target of [
    'mp-weixin',
    'mp-alipay',
    'mp-bytedance',
    'mp-xiaohongshu',
  ] as const) {
    it(`${target} preserves inherited field order, module owners and aliases in generated instances`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'mp-instance-fields-'));
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
        join(root, 'src/Base.ts'),
        `import {BaseComponent,h} from 'transone';
        const START=2;
        export class Card extends BaseComponent {
          seed=START; captured=this.seed; erased=9; kept=4;
          items=[this.seed]; alias=this.items; config={step:this.seed+1}; theme={color:'teal'}; label='base';
          initState(){return {count:this.seed,captured:this.captured,erased:this.erased??-1,kept:this.kept,same:this.items===this.alias,list:this.items};}
          initStyles(){this.styleManager.addStyle('card',{selector:'.card',properties:this.theme});}
          beforeMount(){this.setState({ready:this.seed});}
          tap(){this.items.push(5);this.state.count+=this.config.step;}
          render(){return h('button',{className:'card',onClick:()=>this.tap()},[this.label,this.state.count]);}
        }`
      );
      writeFileSync(
        join(root, 'src/Variant.ts'),
        `import {Miniprogram} from 'transone';import {Card} from './Base';
        const START=7;
        @Miniprogram() export class Chosen extends Card {
          seed=START; erased:number; declare kept:number; label='chosen'; theme={color:'tomato'};
          initState(){return {...super.initState(),extra:this.seed+1};}
        }`
      );
      writeFileSync(
        join(root, 'src/main.ts'),
        `import {BaseComponent,createApp,createComponent,h} from 'transone';import {Card} from './Base';
        class App extends BaseComponent{initState(){return {}}initStyles(){}render(){return h('main',{},[createComponent(Card)]);}}
        createApp({root:App});`
      );
      const result = await build({ root, target });
      const jsPath = result.assetsBuilt.find((p) =>
        p.endsWith('/components/card/card.js')
      )!;
      let definition: Record<string, any> = {};
      new Function('Component', readFileSync(jsPath, 'utf8'))(
        (value: typeof definition) => {
          definition = value;
        }
      );
      const first = instance(definition, 'component'),
        second = instance(definition, 'component');
      expect(first.data).toMatchObject({
        count: 7,
        captured: 2,
        erased: -1,
        kept: 4,
        same: true,
        extra: 8,
        ready: 7,
      });
      expect(first.items).toBe(first.alias);
      expect(first.items).toBe(first.data.list);
      first.tap();
      expect(first.data.count).toBe(10);
      expect(first.items).toEqual([2, 5]);
      expect(second.items).toEqual([2]);
      expect(second.data.count).toBe(7);
      const css = result.assetsBuilt.find(
        (p) =>
          p.includes('/components/card/card.') &&
          /\.(wxss|acss|ttss|css)$/.test(p)
      )!;
      expect(readFileSync(css, 'utf8')).toContain('tomato');
    });
  }
});
