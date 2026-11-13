import { expect, it } from 'bun:test';
import ts from 'typescript';
import { compileUnit } from '../src/mp/compile';
import { MP_DIALECTS } from '../src/mp/dialect';
import { generateComponentJs } from '../src/mp/jsgen';
import type { CompileContext } from '../src/mp/types';

for (const target of [
  'mp-weixin',
  'mp-bytedance',
  'mp-xiaohongshu',
  'mp-alipay',
] as const) {
  it(`${target} generated code rolls back unrendered fields and retries its first native patch`, () => {
    const dialect = MP_DIALECTS[target]!;
    const source = ts.createSourceFile(
      'recovery.ts',
      `class Card {
      seed=this.props.start??7; untouched=this.props.name; options=this.props.config??{step:2};
      initState(){return{count:this.seed};}initStyles(){}
      render(){return h('text',{},[this.state.count]);}
    }`,
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
    const unit = compileUnit(
      context,
      { filePath: 'recovery.ts', source, declaration, className: 'Card' },
      { kind: 'component', name: 'card' }
    );
    expect(unit.initializationKeys).toEqual(['seed', 'untouched', 'options']);
    expect(unit.initializationFields).toEqual([]);
    let definition: Record<string, any> = {};
    new Function('Component', generateComponentJs(unit, dialect))(
      (value: typeof definition) => {
        definition = value;
      }
    );
    const failure = new Error('initial native bridge failed');
    let calls = 0;
    const value: Record<string, any> = {
      ...definition.methods,
      data: { nativeMarker: 'kept' },
      properties: {},
      props: {},
      failNative: true,
      setData(patch: Record<string, any>) {
        calls++;
        Object.assign(this.data, structuredClone(patch));
        if (this.failNative) {
          this.failNative = false;
          throw failure;
        }
      },
    };
    const install = (start: number) => {
      const bag = {
        __transone_props: { start, name: 'parent', config: { step: 3 } },
      };
      if (target === 'mp-xiaohongshu') Object.assign(value.data, bag);
      else value[target === 'mp-alipay' ? 'props' : 'properties'] = bag;
    };
    install(2);
    const data = value.data;
    const setData = value.setData;
    const initialize =
      target === 'mp-alipay'
        ? definition.onInit
        : definition.lifetimes.attached;
    expect(() => initialize.call(value)).toThrow(failure);
    for (const key of [
      'seed',
      'untouched',
      'options',
      '__transone_state',
      '__transone_initial_props',
      '__transone_fields_ready',
      '__transone_initializing',
    ])
      expect(Object.prototype.hasOwnProperty.call(value, key)).toBe(false);
    expect(value.data).toBe(data);
    expect(value.data.nativeMarker).toBe('kept');
    expect(Object.prototype.hasOwnProperty.call(value.data, 'count')).toBe(
      false
    );
    expect(
      Object.prototype.hasOwnProperty.call(
        value.data,
        '__transone_initial_fields'
      )
    ).toBe(false);
    expect(value.setData).toBe(setData);
    install(6);
    initialize.call(value);
    expect(value.data.count).toBe(6);
    expect(value.seed).toBe(6);
    expect(value.untouched).toBe('parent');
    value.setData({ count: 9 });
    expect(value.data.count).toBe(9);
    expect(calls).toBe(3);
  });
}
