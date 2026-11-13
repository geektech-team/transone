import { describe, expect, it } from 'bun:test';
import ts from 'typescript';
import { Component } from '../../transone/lib/index';
import {
  analyzeInstanceFields,
  type InstanceFieldValue,
} from '../src/components/instance-fields';

function fixture(text: string, props?: Record<string, InstanceFieldValue>) {
  const source = ts.createSourceFile(
    'fields.ts',
    text,
    ts.ScriptTarget.Latest,
    true
  );
  const owners = source.statements
    .filter(ts.isClassDeclaration)
    .map((declaration) => ({ source, declaration }));
  const plan = analyzeInstanceFields(owners, {
    props,
    resolve() {
      return undefined;
    },
    sources: [source],
    fail(node, message): never {
      throw new Error(`${node.getSourceFile().fileName}: ${message}`);
    },
  });
  const runtime = ts.transpileModule(`${text}\nreturn new Leaf(props);`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const web = new Function('Component', 'props', runtime)(
    Component,
    props
  ) as Component<object, Record<string, unknown>>;
  return { plan, web };
}

describe('shared instance field semantics', () => {
  for (const [expression, props, expected] of [
    ['this.props.config?.nested.count ?? 5', {}, 5],
    ['this.props.config?.nested.count ?? 5', { config: null }, 5],
    [
      'this.props.config?.nested.count ?? 5',
      { config: { nested: { count: 0 } } },
      0,
    ],
    ['this.props.rows?.[0].count ?? 5', {}, 5],
    ['this.props.config?.nested!.count ?? 5', {}, 5],
    ['this.props.config?.nested?.count ?? 5', { config: {} }, 5],
  ] as const) {
    it(`matches Web optional-chain short circuit for ${expression} with ${JSON.stringify(props)}`, () => {
      const { plan, web } = fixture(
        `class Leaf extends Component { seed=${expression}; initState(){return {count:this.seed};}initStyles(){}render(){return {tag:'div'};} }`,
        props
      );
      expect(plan.values.get('seed')).toBe(expected);
      expect(web.state).toEqual({ count: expected });
      web.unmount();
    });
  }

  for (const [expression, props] of [
    ['this.props.config?.nested.count ?? 5', { config: {} }],
    ['this.props.config?.nested.count ?? 5', { config: { nested: null } }],
    ['(this.props.config?.nested).count ?? 5', {}],
    ['this.props.config?.getCount() ?? 5', {}],
  ] as const) {
    it(`keeps invalid optional-chain continuation or calls rejected: ${expression}`, () => {
      expect(() =>
        fixture(
          `class Leaf extends Component { seed=${expression}; initState(){return {count:this.seed};}initStyles(){}render(){return {tag:'div'};} }`,
          props
        )
      ).toThrow();
    });
  }

  it('does not cache a rejected mutable module object across repeated evaluations', () => {
    const source = ts.createSourceFile(
      'retry.ts',
      'const CONFIG={step:2};CONFIG.step=9;CONFIG.step;const SAFE=3;SAFE;',
      ts.ScriptTarget.Latest,
      true
    );
    const plan = analyzeInstanceFields([], {
      sources: [source],
      resolve() {
        return undefined;
      },
      fail(_node, message): never {
        throw new Error(message);
      },
    });
    const expressions = source.statements
      .filter(ts.isExpressionStatement)
      .map((statement) => statement.expression);
    for (let attempt = 0; attempt < 3; attempt++)
      expect(() => plan.evaluate(expressions[1])).toThrow('模块对象常量');
    expect(plan.evaluate(expressions[2])).toBe(3);
  });
  it('matches Web declaration order, final overrides, declare and uninitialized fields', () => {
    const { plan, web } = fixture(`
      class Base extends Component {
        seed = 2; first = this.seed; erased = 9; kept = 4;
        ahead = this.later; later = 8;
        initState() { return {seed: this.seed, first: this.first, erased: this.erased ?? -1, kept: this.kept, ahead: this.ahead ?? -1}; }
        initStyles() {} render() { return {tag:'div'}; }
      }
      class Leaf extends Base { seed = 7; erased: number; declare kept: number; }
    `);
    const method = plan.entries[0].owner.declaration.members.find(
      (member) =>
        ts.isMethodDeclaration(member) && member.name.getText() === 'initState'
    ) as ts.MethodDeclaration;
    const expression = (method.body!.statements[0] as ts.ReturnStatement)
      .expression!;
    expect(plan.evaluate(expression)).toEqual({
      seed: 7,
      first: 2,
      erased: -1,
      kept: 4,
      ahead: -1,
    });
    expect(web.state).toEqual({
      seed: 7,
      first: 2,
      erased: -1,
      kept: 4,
      ahead: -1,
    });
    web.unmount();
  });

  it('preserves aliases, short-circuit expressions and numeric addition without sharing instances', () => {
    const text = `class Leaf extends Component {
      seed=2+3; list=[this.seed]; alias=this.list; object={color:'teal'};
      initState(){return {seed:this.seed, same:this.list===this.alias, color:this.object.color, safe:this.missing?.value ?? 'none'};}
      missing=undefined;
      initStyles(){} render(){return {tag:'div'};}
    }`;
    const first = fixture(text),
      second = fixture(text);
    expect(first.plan.values.get('seed')).toBe(5);
    expect(first.plan.values.get('list')).toBe(first.plan.values.get('alias'));
    expect(first.plan.values.get('list')).not.toBe(
      second.plan.values.get('list')
    );
    expect(first.web.state).toEqual({
      seed: 5,
      same: true,
      color: 'teal',
      safe: 'none',
    });
    first.web.unmount();
    second.web.unmount();
  });

  for (const member of [
    'seed = sideEffect();',
    'seed = new Map();',
    'seed = this.state.count;',
    'seed = this.props.value;',
    'state = {};',
    'constructor(){super();}',
    'seed = {}.toString === undefined;',
  ]) {
    it(`rejects unsupported field initialization without executing it: ${member}`, () => {
      expect(() =>
        fixture(
          `class Leaf extends Component { ${member} initState(){return {}} initStyles(){} render(){return {tag:'div'}} }`
        )
      ).toThrow();
    });
  }
  for (const mutation of [
    'CONFIG.step=9;',
    'consume(CONFIG);',
    'const alias=CONFIG;',
    'CONFIG.touch();',
    'let alias;alias=CONFIG;',
    'let alias;alias=(CONFIG);',
    'const alias=(CONFIG as object);',
    'const wrapped={config:CONFIG};wrapped.config.step=9;',
    'let alias;alias=CONFIG||{};alias.step=9;',
  ]) {
    it(`rejects mutable or escaped module object snapshots: ${mutation}`, () => {
      expect(() =>
        fixture(
          `const CONFIG={step:2}; ${mutation} class Leaf extends Component {seed=CONFIG.step;initState(){return {}}initStyles(){}render(){return {tag:'div'}}}`
        )
      ).toThrow('模块对象常量');
    });
  }
  it('rejects module constant temporal dead zones instead of changing their value', () => {
    expect(() =>
      fixture(
        `const FIRST=SECOND;const SECOND=2;class Leaf extends Component {value=FIRST;initState(){return {}}initStyles(){}render(){return {tag:'div'}}}`
      )
    ).toThrow('实例字段');
  });
  for (const key of ['state', 'props'])
    it(`rejects early ${key} despite a declare-only override`, () => {
      expect(() =>
        fixture(
          `class Leaf extends Component{declare ${key}:object;value=this.${key};initState(){return {}}initStyles(){}render(){return {tag:'div'}}}`
        )
      ).toThrow();
    });
});
