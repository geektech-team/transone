import { describe, expect, it } from 'bun:test';
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
import { compileUnit } from '../src/mp/compile';
import { MP_DIALECTS } from '../src/mp/dialect';
import { generateComponentJs, generatePageJs } from '../src/mp/jsgen';
import { loadTypescript } from '../src/mp/ts-loader';
import type { CompiledUnit, CompileContext, UnitKind } from '../src/mp/types';

const targets = [
  'mp-weixin',
  'mp-alipay',
  'mp-bytedance',
  'mp-xiaohongshu',
] as const;

async function compile(
  sourceText: string,
  kind: UnitKind = 'component',
  target = 'mp-weixin'
) {
  const ts = await loadTypescript();
  const source = ts.createSourceFile(
    '/test.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
  const declaration = source.statements.find((statement) =>
    ts.isClassDeclaration(statement)
  )!;
  if (!ts.isClassDeclaration(declaration)) throw new Error('missing class');
  const context: CompileContext = {
    ts,
    root: '/',
    files: new Map(),
    components: new Map(),
    compiling: new Set(),
    callSites: new Map(),
    lengthUnit: 'px',
    dialect: MP_DIALECTS[target]!,
    warnings: [],
  };
  return compileUnit(
    context,
    {
      filePath: source.fileName,
      source,
      declaration,
      className: declaration.name!.text,
    },
    { kind, name: 'card' }
  );
}

function execute(
  unit: CompiledUnit,
  target = 'mp-weixin',
  generatedSource?: string,
  onClear?: () => void
) {
  const dialect = MP_DIALECTS[target]!;
  const pending = new Map<number, () => void>();
  let counter = 0;
  const errors: unknown[] = [];
  let definition: Record<string, any> = {};
  const source =
    generatedSource ??
    (unit.kind === 'page'
      ? generatePageJs(unit, dialect)
      : generateComponentJs(unit, dialect));
  new Function(
    'Page',
    'Component',
    'setTimeout',
    'clearTimeout',
    'console',
    source
  )(
    (value: typeof definition) => (definition = value),
    (value: typeof definition) => (definition = value),
    (callback: () => void) => {
      const key = ++counter;
      pending.set(key, callback);
      return key;
    },
    (key: number) => {
      pending.delete(key);
      onClear?.();
    },
    { error: (error: unknown) => errors.push(error) }
  );
  const createInstance = (): Record<string, any> => ({
    ...(unit.kind === 'page' ? definition : definition.methods),
    data: structuredClone(definition.data),
    properties: {},
    props: {},
    calls: [],
    setData(patch: object, callback?: () => void) {
      Object.assign(this.data, patch);
      callback?.();
    },
    triggerEvent(name: string, args: unknown) {
      this.calls.push([name, args]);
    },
  });
  const value = createInstance();
  const hooks =
    unit.kind === 'page'
      ? definition
      : dialect.id === 'mp-alipay'
        ? definition
        : definition.lifetimes;
  const mount = (instance = value) => {
    hooks[
      unit.kind === 'page'
        ? 'onLoad'
        : dialect.id === 'mp-alipay'
          ? 'onInit'
          : 'attached'
    ]?.call(instance);
    hooks[unit.kind === 'page' ? 'onReady' : 'didMount']?.call(instance);
  };
  const detach = (instance = value) =>
    hooks[
      unit.kind === 'page'
        ? 'onUnload'
        : dialect.id === 'mp-alipay'
          ? 'didUnmount'
          : 'detached'
    ]?.call(instance);
  const flush = () => {
    for (const [key, callback] of [...pending]) {
      pending.delete(key);
      callback();
    }
  };
  return {
    value,
    createInstance,
    hooks,
    mount,
    detach,
    pending,
    flush,
    errors,
  };
}

const program = `import {Component,h,Bind,Delay,Debounce} from 'transone';
class Card extends Component {
 initState(){return {count:0};} initStyles(){} render(){return h('button',{onClick:this.bound},this.state.count);}
 @Bind() bound(value:number){this.state.count += value; return this.state.count;}
 @Delay(10) later(value:number):void{this.state.count += value;}
 @Delay(10,{replace:true}) replace(value:number):void{this.state.count += value;}
 @Debounce(10) @Bind() first(value:number):void{this.state.count += value;}
 @Bind() @Debounce(10) second(value:number):void{this.state.count += value;}
}`;

describe('mini-program method decorator lowering', () => {
  it('recovers a partially installed host without wrapping successful bindings again', async () => {
    for (const key of ['later', 'replace']) {
      const runtime = execute(await compile(program));
      const implementation = runtime.value[key];
      runtime.value[key] = null;
      expect(runtime.mount).toThrow('装饰方法必须为函数: ' + key);
      expect(runtime.value.__transone_mount_phase).toBeUndefined();
      const bound = runtime.value.bound;
      const installedGetter = Object.getOwnPropertyDescriptor(
        runtime.value,
        'later'
      )?.get;
      const failedCallback = installedGetter ? runtime.value.later : undefined;
      runtime.value[key] = implementation;
      runtime.mount();
      expect(runtime.value.bound).toBe(bound);
      if (installedGetter)
        expect(
          Object.getOwnPropertyDescriptor(runtime.value, 'later')?.get
        ).toBe(installedGetter);
      failedCallback?.(100);
      const later = runtime.value.later;
      later(2);
      runtime.value.first(3);
      expect(runtime.pending.size).toBe(2);
      expect(runtime.value.data.count).toBe(0);
      runtime.flush();
      expect(runtime.value.data.count).toBe(5);
    }
  });
  it('uses string literal method names as property keys for scheduled callbacks', async () => {
    const unit = await compile(`import {Component,h,Debounce} from 'transone';
      class Card extends Component {
        initState(){return {count:0};}initStyles(){}
        render(){return h('view',{},this.state.count);}
        beforeMount(){this.close();}
        @Debounce(0) 'close'():void{this.state.count++;}
      }`);
    expect(unit.decoratedMethods?.[0]?.key).toBe('close');
    const runtime = execute(unit);
    runtime.mount();
    expect(runtime.value.data.count).toBe(0);
    runtime.flush();
    expect(runtime.value.data.count).toBe(1);
  });
  for (const target of targets)
    for (const kind of ['page', 'component'] as const) {
      it(`${target} ${kind} binds return values and owns independent scheduled work without user hooks`, async () => {
        const unit = await compile(program, kind, target);
        expect(unit.decoratedMethods?.map((entry) => entry.key)).toEqual([
          'bound',
          'later',
          'replace',
          'first',
          'second',
        ]);
        const { value, mount, detach, pending, flush } = execute(unit, target);
        mount();
        const bound = value.bound;
        expect(bound(2)).toBe(2);
        value.later(1);
        value.later(2);
        value.replace(50);
        value.replace(3);
        value.first(50);
        value.first(4);
        value.second(50);
        value.second(5);
        expect(value.data.count).toBe(2);
        expect(pending.size).toBe(5);
        flush();
        expect(value.data.count).toBe(17);
        value.later(100);
        detach();
        expect(pending.size).toBe(0);
        expect(bound(100)).toBe(117);
      });
      it(`${target} ${kind} invalidates old references across failed mount and three remounts`, async () => {
        const unit = await compile(
          program.replace(
            'initStyles(){}',
            `initStyles(){} beforeMount(){this.later(1);if(this.state.count===99)throw new Error('failed');} onUnmounted(){if(this.state.count===98)throw new Error('cleanup');}`
          ),
          kind,
          target
        );
        const { value, mount, detach, pending, flush } = execute(unit, target);
        for (let cycle = 0; cycle < 3; cycle++) {
          mount();
          const old = value.later;
          value.data.count = 98;
          expect(detach).toThrow('cleanup');
          expect(pending.size).toBe(0);
          value.data.count = 99;
          expect(mount).toThrow('failed');
          const failed = value.later;
          expect(pending.size).toBe(0);
          value.data.count = 0;
          mount();
          old(100);
          failed(100);
          expect(pending.size).toBe(1);
          flush();
          expect(value.data.count).toBe(1);
          detach();
        }
      });
    }
  it('installs accessors before field initializers and beforeMount use method references', async () => {
    const unit = await compile(`import {Component,h,Bind,Delay} from 'transone';
   class Card extends Component {
    marker=1;
    initState(){return {count:0};} initStyles(){} render(){return h('view',{},this.state.count);}
    beforeMount(){const callback=this.later;callback(2);const retained=this.retained;retained(3);const direct=this.bound;if(direct(4)!==4)throw new Error('return');}
    @Bind() bound(value:number){this.state.count+=value;return this.state.count;}
    @Delay(0) later(value:number):void{this.state.count+=value;}
   }`);
    // Source-level function fields remain unsupported. This synthetic runtime
    // initializer verifies installation order independently of that restriction.
    unit.initialization =
      'function(){this.retained=this.later;return {count:0};}';
    const { value, mount, flush } = execute(unit);
    mount();
    flush();
    expect(value.data.count).toBe(9);
  });
  it('retains state and emit rewrites inside scheduled implementations and isolates hosts', async () => {
    const unit = await compile(`import {Component,h,Delay} from 'transone';
   class Card extends Component {initState(){return {count:0};}initStyles(){}render(){return h('view',{},this.state.count);}
   @Delay(0) later(value:number):void{this.state.count+=value;this.emit('change',this.state.count);}}`);
    const runtime = execute(unit),
      first = runtime.value,
      second = runtime.createInstance();
    runtime.mount();
    runtime.mount(second);
    first.later(2);
    second.later(3);
    runtime.detach();
    runtime.flush();
    expect(first.calls).toEqual([]);
    expect(second.calls).toEqual([['change', { args: [3] }]]);
  });
  it('does not swallow active timer exceptions', async () => {
    const unit = await compile(
      `import {Component,h,Delay} from 'transone';class Card extends Component {initState(){return{};}initStyles(){}render(){return h('view');}@Delay(0) fail():void{throw new Error('timer failed');}}`
    );
    const runtime = execute(unit);
    runtime.mount();
    runtime.value.fail();
    expect(runtime.flush).toThrow('timer failed');
    expect(runtime.pending.size).toBe(0);
  });
  for (const phase of ['body', 'then getter'] as const)
    it(`discards a synchronous ${phase} error after the scheduled method replaces its scope`, async () => {
      const unit = await compile(program);
      unit.methods.find((entry) => entry.key === 'later')!.fn =
        phase === 'body'
          ? `function(){this.cycle();throw new Error('obsolete body');}`
          : `function(){const host=this;return {get then(){host.cycle();throw new Error('obsolete getter');}};}`;
      const runtime = execute(unit);
      runtime.value.cycle = () => {
        runtime.detach();
        runtime.mount();
      };
      runtime.mount();
      runtime.value.later();
      expect(runtime.flush).not.toThrow();
      expect(runtime.value.data.count).toBe(0);
      expect(runtime.pending.size).toBe(0);
    });
  it('preserves an active scheduled result then getter exception', async () => {
    const unit = await compile(program);
    unit.methods.find((entry) => entry.key === 'later')!.fn =
      `function(){return {get then(){throw new Error('active getter');}};}`;
    const runtime = execute(unit);
    runtime.mount();
    runtime.value.later();
    expect(runtime.flush).toThrow('active getter');
  });
  it('defensively consumes scheduled JavaScript promise rejections and reports only active failures', async () => {
    const unit: CompiledUnit = {
      kind: 'page',
      name: 'page',
      template: '',
      style: '',
      globalStyle: '',
      data: '{}',
      properties: {},
      methods: [
        { key: 'later', fn: 'function(value){return Promise.reject(value);}' },
      ],
      lifecycle: [],
      customEvents: [],
      propsReferenced: new Set(),
      usingComponents: {},
      inlineModules: [],
      decoratedMethods: [
        {
          key: 'later',
          bind: false,
          schedule: { kind: 'delay', milliseconds: 0, replace: false },
        },
      ],
    };
    const runtime = execute(unit);
    runtime.mount();
    runtime.value.later('active');
    runtime.flush();
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.errors).toEqual(['active']);
    runtime.value.later('stale');
    runtime.flush();
    runtime.detach();
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.errors).toEqual(['active']);
  });
  it('reads the then getter of a scheduled JavaScript result only once', async () => {
    const unit = await compile(program);
    unit.methods.find((entry) => entry.key === 'later')!.fn =
      `function(){const host=this;return {get then(){host.reads=(host.reads||0)+1;return host.reads===1 ? resolve=>resolve(3) : ()=>{throw new Error('read twice');};}};}`;
    const runtime = execute(unit);
    runtime.mount();
    runtime.value.later();
    runtime.flush();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(runtime.value.reads).toBe(1);
    expect(runtime.errors).toEqual([]);
  });
  it('allows replacing a decorated method with an ordinary own method', async () => {
    const runtime = execute(await compile(program));
    runtime.mount();
    const replaced = function () {
      return 'replacement';
    };
    expect(() => {
      runtime.value.later = replaced;
      runtime.value.bound = replaced;
    }).not.toThrow();
    expect(runtime.value.later).toBe(replaced);
    expect(runtime.value.later()).toBe('replacement');
    expect(runtime.pending.size).toBe(0);
    runtime.detach();
    runtime.mount();
    expect(runtime.value.later).toBe(replaced);
  });
  it('ignores queued timer callbacks captured by a host before clearTimeout', async () => {
    const unit = await compile(program);
    const runtime = execute(unit);
    runtime.mount();
    runtime.value.later(10);
    const queued = [...runtime.pending.values()];
    runtime.detach();
    runtime.mount();
    queued.forEach((callback) => callback());
    expect(runtime.value.data.count).toBe(0);
  });
  it('keeps Bind-only references stable across mount scopes without acting as a callback guard', async () => {
    const runtime = execute(await compile(program));
    runtime.mount();
    const bound = runtime.value.bound;
    runtime.detach();
    expect(bound(2)).toBe(2);
    runtime.mount();
    expect(runtime.value.bound).toBe(bound);
    expect(bound(3)).toBe(5);
  });
  it('blocks mounting reentered by native timer cancellation during detach and failed mounting', async () => {
    const unit = await compile(
      program.replace(
        'initStyles(){}',
        `initStyles(){} beforeMount(){this.later(1);if(this.state.count===99)throw new Error('failed');}`
      )
    );
    let reenter = () => {};
    const runtime = execute(unit, 'mp-weixin', undefined, () => reenter());
    reenter = runtime.mount;
    runtime.mount();
    runtime.detach();
    expect(runtime.pending.size).toBe(0);
    expect(runtime.value.__transone_mount_phase.cancelled).toBe(true);
    runtime.value.data.count = 99;
    expect(runtime.mount).toThrow('failed');
    expect(runtime.pending.size).toBe(0);
    expect(runtime.value.__transone_mount_phase).toBeUndefined();
    runtime.value.data.count = 0;
    runtime.mount();
    runtime.flush();
    expect(runtime.value.data.count).toBe(1);
  });
  it('keeps the latest debounce call when native cancellation reenters the same method', async () => {
    let reenter = () => {};
    const runtime = execute(
      await compile(program),
      'mp-weixin',
      undefined,
      () => reenter()
    );
    runtime.mount();
    runtime.value.first(1);
    reenter = () => {
      reenter = () => {};
      runtime.value.first(3);
    };
    runtime.value.first(2);
    expect(runtime.pending.size).toBe(1);
    runtime.flush();
    expect(runtime.value.data.count).toBe(3);
  });
  it('diagnoses unsupported and unknown decorators even on methods absent from templates', async () => {
    for (const method of [
      '@Other() unused(){}',
      '@Delay(1) unused(){return 3;}',
      '@Bind() beforeMount(){}',
      '@Bind() static unused(){}',
      '@Bind() get unused(){return 1;}',
    ]) {
      await expect(
        compile(
          `import {Component,h,Bind,Delay} from 'transone';class Card extends Component {initState(){return{};}initStyles(){}render(){return h('view');}${method}}`
        )
      ).rejects.toThrow();
    }
  });
  it('rejects decorators on native page lifecycle hooks', async () => {
    for (const name of [
      'onLoad',
      'onShow',
      'onHide',
      'onReady',
      'onUnload',
      'onPullDownRefresh',
    ]) {
      await expect(
        compile(
          `import {Component,h,Bind} from 'transone';class Card extends Component {initState(){return{};}initStyles(){}render(){return h('view');}@Bind() ${name}(){}}`,
          'page'
        )
      ).rejects.toThrow(/生命周期|lifecycle/);
    }
  });
  for (const target of targets)
    it(`${target} builds real framework imports with inheritance, overrides and scheduled super rewrites`, async () => {
      const root = mkdtempSync(join(tmpdir(), 'transone-method-decorators-'));
      try {
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
          join(root, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              paths: {
                transone: [
                  resolve(import.meta.dir, '../../transone/lib/index.ts'),
                ],
                'transone/platform': [
                  resolve(
                    import.meta.dir,
                    '../../transone/lib/platform/index.ts'
                  ),
                ],
              },
            },
          })
        );
        writeFileSync(
          join(root, 'src/Base.ts'),
          `import {BaseComponent,Bind} from 'transone';export class Base extends BaseComponent {
    initState(){return {count:0};}initStyles(){}
    @Bind() bound(value:number){this.state.count+=value;return this.state.count;}
    @Bind() plain(value:number){this.state.count+=value;return this.state.count;}
    'bump'(value:number):void{this.state.count+=value;}
   }`
        );
        writeFileSync(
          join(root, 'src/main.ts'),
          `import {h,createApp,Bind,Debounce} from 'transone';import {Base} from './Base';
    class App extends Base {
     render(){return h('view',{},[h('button',{onClick:this.bound},this.state.count)]);}
     plain(value:number){return super.plain(value)+1;}
     @Debounce(0) @Bind() 'later'(value:number):void{super.bump(value);this.state.count+=1;}
     beforeMount(){this.later(1);this.plain(2);}
    }createApp({root:App});`
        );
        const result = await build({ root, target });
        const runtime = execute(
          { kind: 'page' } as CompiledUnit,
          target,
          readFileSync(join(result.outDir, 'pages/index/index.js'), 'utf8')
        );
        runtime.mount();
        const bound = runtime.value.bound;
        expect(bound(3)).toBe(5);
        runtime.value.later(7);
        runtime.flush();
        expect(runtime.value.data.count).toBe(13);
        expect(
          Object.getOwnPropertyDescriptor(runtime.value, 'plain')?.get
        ).toBeUndefined();
        expect(runtime.value.plain(1)).toBe(15);
        runtime.detach();
        expect(bound(100)).toBe(114);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
});
