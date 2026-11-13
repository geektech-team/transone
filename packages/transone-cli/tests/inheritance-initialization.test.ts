import { afterEach, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from '../src/build';
import { analyzeNativeScreen } from '../src/app/analyze';
import { resolveConfig } from '../src/config';
import { MP_DIALECTS } from '../src/mp/dialect';
import type { NativeNode } from '../src/app/types';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture(): string {
  const root = mkdtempSync(
    join(tmpdir(), 'transone-inheritance-initialization-')
  );
  roots.push(root);
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'node_modules'));
  symlinkSync(
    resolve(import.meta.dir, '../../transone'),
    join(root, 'node_modules/transone'),
    'dir'
  );
  writeFileSync(
    join(root, 'transone.config.ts'),
    `export default {entry:'src/main.ts',mp:{pages:{'/':'src/main.ts'}}};`
  );
  writeFileSync(
    join(root, 'src/Base.ts'),
    `import{BaseComponent,h}from'transone';
    const INITIAL=2;
    export class Base extends BaseComponent {
      seed=INITIAL;captured=this.seed;defaults={count:INITIAL};
      initState(){return this.defaults;}initStyles(){}
      tap(){this.state.count+=1;}
      render(){return h('main',{},[h('text',{},['card:',this.defaults.count,':',this.state.count,':',this.seed,':',this.captured]),h('button',{},['+'],{click:()=>this.tap()})]);}
    }
    export class FreshBase extends BaseComponent {initState(){const value={nested:{count:INITIAL}};return value;}initStyles(){}}
    export class PropsBase extends BaseComponent {initState(){return{count:this.props.start??3};}initStyles(){}}
  `
  );
  writeFileSync(
    join(root, 'src/Cards.ts'),
    `import{h}from'transone';import{Base,FreshBase,PropsBase}from'./Base';
    const INITIAL=99;
    class Middle extends Base{}
    export class Card extends Middle {seed=7;declare defaults:{count:number};initState(){return super.initState();}}
    export class Spread extends Middle {initState(){return{...super.initState()};}render(){return h('main',{},[h('text',{},['spread:',this.defaults.count,':',this.state.count]),h('button',{},['+'],{click:()=>this.tap()})]);}}
    class FreshMiddle extends FreshBase{}
    export class Fresh extends FreshMiddle {initState(){const first=super.initState();const second=super.initState();const copy={...first};return{same:first===second,nestedSame:first.nested===second.nested,within:first===first,copiedRoot:copy===first,copiedNested:copy.nested===first.nested};}render(){return h('main',{},[h('text',{},[this.state.same,this.state.nestedSame,this.state.within])]);}}
    class PropsMiddle extends PropsBase{}
    export class Deferred extends PropsMiddle {initState(){return super.initState();}render(){return h('main',{},[h('text',{},[this.state.count])]);}}
  `
  );
  writeFileSync(
    join(root, 'src/main.ts'),
    `import{BaseComponent,createApp,createComponent,h}from'transone';import{Card,Spread,Fresh,Deferred}from'./Cards';
    class App extends BaseComponent {initState(){return{}}initStyles(){}render(){return h('main',{},[createComponent(Card),createComponent(Spread),createComponent(Fresh),createComponent(Deferred,{start:0})]);}}
    createApp({root:App});
  `
  );
  return root;
}

it('rejects impure ancestor initializers hidden by deferred props before emitting mini program code', async () => {
  const root = fixture();
  writeFileSync(
    join(root, 'src/main.ts'),
    `import{BaseComponent,createApp,createComponent,h}from'transone';
    class Parent extends BaseComponent{initState(){return{count:sideEffect()};}initStyles(){}}
    class Child extends Parent{initState(){return this.props.useParent?super.initState():{count:0};}render(){return h('text',{},[this.state.count]);}}
    class App extends BaseComponent{initState(){return{}}initStyles(){}render(){return h('main',{},[createComponent(Child,{useParent:true})]);}}
    createApp({root:App});`
  );
  await expect(build({ root, target: 'mp-weixin' })).rejects.toThrow(
    /表达式|静态|initState/
  );
});

for (const target of [
  'mp-weixin',
  'mp-alipay',
  'mp-bytedance',
  'mp-xiaohongshu',
] as const) {
  it(`${target} preserves inherited state identity, copied roots and fresh super invocations`, async () => {
    const root = fixture(),
      dialect = MP_DIALECTS[target]!;
    const result = await build({ root, target });
    const component = (name: string, props: object = {}) => {
      const path = result.assetsBuilt.find((p) =>
        p.endsWith(`/components/${name}/${name}.js`)
      )!;
      let definition: Record<string, any> = {};
      new Function('Component', readFileSync(path, 'utf8'))(
        (v: typeof definition) => {
          definition = v;
        }
      );
      const value: Record<string, any> = {
        ...definition.methods,
        data: structuredClone(definition.data),
        properties: { __transone_props: props },
        props: { __transone_props: props },
        setData(patch: object) {
          Object.assign(this.data, patch);
        },
      };
      if (target === 'mp-xiaohongshu') value.data.__transone_props = props;
      (target === 'mp-alipay'
        ? definition.onInit
        : definition.lifetimes?.attached
      )?.call(value);
      return {
        value,
        template: readFileSync(
          path.replace(/\.js$/, `.${dialect.templateExt}`),
          'utf8'
        ),
      };
    };
    const card = component('card');
    expect(card.template.match(/\{\{count\}\}/g)).toHaveLength(2);
    expect(card.value.seed).toBe(7);
    expect(card.value.captured).toBe(2);
    card.value.tap();
    expect(card.value.data.count).toBe(3);
    expect(card.value.defaults.count).toBe(3);
    const spread = component('spread');
    spread.value.tap();
    expect(spread.value.data.count).toBe(3);
    expect(spread.value.defaults.count).toBe(2);
    expect(spread.template).toContain('{{2}}');
    expect(component('fresh').value.data).toMatchObject({
      same: false,
      nestedSame: false,
      within: true,
      copiedRoot: false,
      copiedNested: true,
    });
    expect(component('deferred', { start: 0 }).value.data.count).toBe(0);
  });
}

function text(node: NativeNode): Extract<NativeNode, { kind: 'text' }> {
  if (node.kind === 'text') return node;
  if (node.kind === 'container')
    for (const child of node.children) {
      try {
        return text(child);
      } catch {}
    }
  throw new Error('missing text node');
}

for (const target of ['app-ios', 'app-android', 'app-harmony'] as const) {
  it(`${target} binds a directly inherited state root and preserves pure super call allocation`, async () => {
    const root = fixture(),
      config = await resolveConfig({ root, target });
    const screen = await analyzeNativeScreen(join(root, 'src/main.ts'), config);
    expect(screen.state.map((entry) => entry.value)).toEqual([
      2,
      2,
      false,
      false,
      true,
      false,
      true,
      0,
    ]);
    expect(screen.root.kind).toBe('container');
    if (screen.root.kind !== 'container') throw new Error('expected root');
    const card = text(screen.root.children[0]);
    const bindings = card.parts.filter((part) => part.kind === 'state');
    expect(bindings).toHaveLength(2);
    expect(bindings[0]).toEqual(bindings[1]);
    expect(card.parts).toContainEqual({ kind: 'literal', value: '7' });
    expect(card.parts).toContainEqual({ kind: 'literal', value: '2' });
    const spread = text(screen.root.children[1]);
    expect(spread.parts).toContainEqual({ kind: 'literal', value: '2' });
    expect(spread.parts.filter((part) => part.kind === 'state')).toHaveLength(
      1
    );
  });
}
