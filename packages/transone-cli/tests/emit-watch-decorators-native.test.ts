import { afterEach, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { analyzeNativeScreen } from '../src/app/analyze';
import { resolveConfig } from '../src/config';
import { NativeRuntime } from '../src/app/runtime';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
async function analyze(
  source: string,
  target: 'app-ios' | 'app-android' | 'app-harmony' = 'app-ios'
) {
  const root = mkdtempSync(join(tmpdir(), 'transone-emit-native-'));
  roots.push(root);
  mkdirSync(join(root, 'node_modules'));
  mkdirSync(join(root, 'src'));
  symlinkSync(
    resolve(import.meta.dir, '../../transone'),
    join(root, 'node_modules/transone'),
    'dir'
  );
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        moduleResolution: 'Bundler',
        module: 'ESNext',
        baseUrl: root,
        paths: {
          transone: [resolve(import.meta.dir, '../../transone/lib/index.ts')],
        },
      },
    })
  );
  writeFileSync(join(root, 'src/main.ts'), source);
  return analyzeNativeScreen(
    join(root, 'src/main.ts'),
    await resolveConfig({ root, target })
  );
}
const program = `import {BaseComponent,Bind,Emit,WatchProps,h,createComponent,createApp} from 'transone';
class Editor extends BaseComponent<{value:number}> {
 initState(){return {draft:0};} initStyles(){}
 @Emit('change') commit(value:number){this.state.draft=value;return value+1;}
 choose(){this.commit(this.props.value);}
 @WatchProps('value',{immediate:true}) receive(next:number,previous:number|undefined):void {this.state.draft=next;}
 render(){return h('view',{},[h('text',{},[this.props.value]),h('button',{},['choose'],{click:()=>this.choose()})]);}
}
class App extends BaseComponent {
 initState(){return {value:2};} initStyles(){}
 @Bind() changed(value:number):void{this.state.value=value;}
 render(){return h('view',{},[createComponent({component:Editor,props:{value:this.state.value},emitters:{change:this.changed}})]);}
}
createApp({root:App}).mount();`;

it.each(['app-ios', 'app-android', 'app-harmony'] as const)(
  'compiles native %s event payloads and dynamic prop watchers',
  async (target) => {
    const screen = await analyze(program, target);
    expect(screen.program?.instances).toHaveLength(2);
    const [app, editor] = screen.program!.instances;
    expect(editor.props.value).toMatchObject({
      kind: 'state',
      key: screen.state[0].key,
    });
    expect(editor.methods.commit).toMatchObject({
      params: ['value'],
      emit: 'change',
    });
    expect(editor.emitters.change).toEqual({
      instance: app.id,
      method: 'changed',
    });
    expect(editor.watchers).toEqual([
      { key: 'value', method: 'receive', immediate: true },
    ]);
    expect(editor.methods.receive.body).toMatchObject([
      {
        kind: 'assign',
        key: screen.state[1].key,
        value: { kind: 'local', name: 'next' },
      },
    ]);
    expect(editor.methods.choose.body).toMatchObject([
      {
        kind: 'expression',
        value: {
          kind: 'call',
          instance: editor.id,
          method: 'commit',
          args: [{ kind: 'prop', instance: editor.id, key: 'value' }],
        },
      },
    ]);
  }
);

it('retains lifecycle ordering and immediate old-value availability in native metadata', async () => {
  const screen = await analyze(
    program.replace(
      'choose(){',
      'beforeMount(){this.state.draft=1;} onMounted(){this.state.draft+=1;} choose(){'
    )
  );
  expect(screen.program!.instances[1]).toMatchObject({
    beforeMount: 'beforeMount',
    onMounted: 'onMounted',
  });
});

it('supports scalar expressions and native setProps without replaying initial state', async () => {
  const screen = await analyze(
    program.replace(
      'choose(){this.commit(this.props.value);}',
      `choose(){this.setProps({value:this.props.value+1});this.commit(this.props.value);}`
    )
  );
  expect(
    screen.program!.instances[1].methods.choose.body.slice(0, 2)
  ).toMatchObject([
    { kind: 'local', value: { kind: 'binary', operator: '+' } },
    { kind: 'set-props', values: { value: { kind: 'local' } } },
  ]);
});

it('executes native event payloads, parent prop updates, and remount snapshots', async () => {
  const screen = await analyze(program);
  const runtime = new NativeRuntime(screen);
  const [app, editor] = screen.program!.instances;
  runtime.mount();
  expect(Object.values(runtime.state)).toEqual([2, 2]);
  expect(runtime.invoke(editor.id, 'commit', [4])).toBe(5);
  expect(Object.values(runtime.state)).toEqual([5, 5]);
  const retained = runtime.callback(editor.id, 'choose');
  runtime.unmount();
  runtime.mount();
  retained();
  expect(Object.values(runtime.state)).toEqual([5, 5]);
  runtime.invoke(app.id, 'changed', [9]);
  expect(Object.values(runtime.state)).toEqual([9, 9]);
});

it('commits setProps synchronously, then returns to new parent bindings', async () => {
  const screen = await analyze(
    program.replace(
      'choose(){this.commit(this.props.value);}',
      `choose(){this.setProps({value:this.props.value+1});}`
    )
  );
  const runtime = new NativeRuntime(screen);
  const [app, editor] = screen.program!.instances;
  runtime.mount();
  runtime.invoke(editor.id, 'choose');
  expect(Object.values(runtime.state)).toEqual([2, 3]);
  runtime.invoke(app.id, 'changed', [7]);
  expect(Object.values(runtime.state)).toEqual([7, 7]);
});

it('consumes a failed native watcher batch and recovers on the next update', async () => {
  const screen = await analyze(
    program.replace(
      'this.state.draft=next;',
      `if(next===3)throw new Error('watch failed');this.state.draft=next;`
    )
  );
  const runtime = new NativeRuntime(screen);
  const [app] = screen.program!.instances;
  runtime.mount();
  expect(() => runtime.invoke(app.id, 'changed', [3])).toThrow('watch failed');
  runtime.invoke(app.id, 'changed', [4]);
  expect(Object.values(runtime.state)).toEqual([4, 4]);
});

it('forwards void arguments and preserves scalar falsy and null returns', async () => {
  const screen = await analyze(
    program
      .replace(
        "@Emit('change') commit(value:number){this.state.draft=value;return value+1;}",
        "@Emit('change') commit(value:number,extra:number):void{this.state.draft=value;} @Emit('unhandled') result(value:unknown){return value;}"
      )
      .replace(
        'changed(value:number):void{this.state.value=value;}',
        'changed(value:number,extra:number):void{this.state.value=value+extra;}'
      )
  );
  const runtime = new NativeRuntime(screen);
  const editor = screen.program!.instances[1];
  runtime.mount();
  expect(runtime.invoke(editor.id, 'commit', [3, 4])).toBeUndefined();
  expect(Object.values(runtime.state)).toEqual([7, 7]);
  for (const value of [false, 0, '', null] as const)
    expect(runtime.invoke(editor.id, 'result', [value])).toBe(value);
});

it('queues reentrant native setProps with the same new and old snapshot for every watcher', async () => {
  const screen = await analyze(
    program
      .replace(
        'initState(){return {draft:0};}',
        "initState(){return {draft:0,trace:''};}"
      )
      .replace(
        "@WatchProps('value',{immediate:true}) receive(next:number,previous:number|undefined):void {this.state.draft=next;}",
        `@WatchProps('value') receive(next:number,previous:number):void {this.state.trace+='a'+String(next)+':'+String(previous)+';';if(next===3)this.setProps({value:4});} @WatchProps('value') second(next:number,previous:number):void {this.state.trace+='b'+String(next)+':'+String(previous)+';';}`
      )
  );
  const runtime = new NativeRuntime(screen);
  const app = screen.program!.instances[0];
  runtime.mount();
  runtime.invoke(app.id, 'changed', [3]);
  expect(Object.values(runtime.state)).toEqual([3, 0, 'a3:2;b3:2;a4:3;b4:3;']);
});

it('retains native state and recovers after an immediate mount watcher throws', async () => {
  const screen = await analyze(
    program
      .replace(
        'initState(){return {draft:0};}',
        'initState(){return {draft:0,attempts:0};}'
      )
      .replace(
        'this.state.draft=next;',
        "this.state.attempts++;if(this.state.attempts===1)throw new Error('first mount');this.state.draft=next;"
      )
  );
  const runtime = new NativeRuntime(screen);
  expect(() => runtime.mount()).toThrow('first mount');
  runtime.mount();
  expect(Object.values(runtime.state)).toEqual([2, 2, 2]);
});

it('rejects custom instance event payloads with a source location', async () => {
  await expect(
    analyze(program.replace('return value+1;', 'return new Date();'))
  ).rejects.toThrow(/main\.ts:\s*\d+:\d+.*原生表达式/);
});

it('treats absent prototype-named watched native props as undefined', async () => {
  const screen = await analyze(
    program
      .replace(
        'initState(){return {draft:0};}',
        "initState(){return {draft:0,trace:''};}"
      )
      .replace(
        'choose(){this.commit(this.props.value);}',
        'choose(){this.setProps({constructor:3});}'
      )
      .replace(
        "@WatchProps('value',{immediate:true}) receive(next:number,previous:number|undefined):void {this.state.draft=next;}",
        "@WatchProps('constructor',{immediate:true}) receive(next:number|undefined,previous:number|undefined):void {this.state.draft=next??0;this.state.trace+=String(previous)+';';}"
      )
  );
  const runtime = new NativeRuntime(screen);
  const editor = screen.program!.instances[1];
  runtime.mount();
  runtime.invoke(editor.id, 'choose');
  expect(Object.values(runtime.state)).toEqual([2, 3, 'undefined;undefined;']);
});

it('keeps native watcher order base-to-leaf and suppresses overridden declarations', async () => {
  const screen = await analyze(
    program
      .replace(
        'class Editor extends BaseComponent<{value:number}> {',
        `class EditorBase extends BaseComponent<{value:number}> {
   @WatchProps('value') first():void{this.state.trace+='base-first;';}
   @WatchProps('value') second():void{this.state.trace+='base-second;';}
 }
 class Editor extends EditorBase { first():void{this.state.trace+='plain;';}`
      )
      .replace(
        'initState(){return {draft:0};}',
        "initState(){return {draft:0,trace:''};}"
      )
      .replace(
        "@WatchProps('value',{immediate:true}) receive(next:number,previous:number|undefined):void {this.state.draft=next;}",
        "@WatchProps('value') receive(next:number,previous:number):void {this.state.trace+='leaf;';}"
      )
  );
  const editor = screen.program!.instances[1];
  expect(editor.watchers.map((watch) => watch.method)).toEqual([
    'second',
    'receive',
  ]);
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  runtime.invoke(screen.program!.instances[0].id, 'changed', [3]);
  expect(Object.values(runtime.state)).toEqual([3, 0, 'base-second;leaf;']);
});

it('reuses a native super method body without an extra ancestor emission', async () => {
  const screen = await analyze(
    program
      .replace(
        'class Editor extends BaseComponent<{value:number}> {',
        `class EditorBase extends BaseComponent<{value:number}> { @Emit('change') commit(value:number){return value+1;} }
 class Editor extends EditorBase {`
      )
      .replace(
        "@Emit('change') commit(value:number){this.state.draft=value;return value+1;}",
        "@Emit('change') commit(value:number){return super.commit(value)+1;}"
      )
  );
  const editor = screen.program!.instances[1];
  const aliases = Object.values(editor.methods).filter(
    (method) => method.params[0] === 'value' && method !== editor.methods.commit
  );
  expect(aliases).toHaveLength(1);
  expect(aliases[0].emit).toBeUndefined();
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  expect(runtime.invoke(editor.id, 'commit', [4])).toBe(6);
  expect(Object.values(runtime.state)).toEqual([6, 6]);
});

it('evaluates setState values before applying writes and supports void bridge returns', async () => {
  const screen = await analyze(
    program
      .replace(
        'initState(){return {draft:0};}',
        'initState(){return {draft:0,other:9};}'
      )
      .replace(
        "@Emit('change') commit(value:number){this.state.draft=value;return value+1;}",
        "@Emit('unhandled') commit(value:number):void{return this.setState({draft:this.state.other,other:this.state.draft});}"
      )
  );
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  runtime.invoke(screen.program!.instances[1].id, 'commit', [4]);
  expect(Object.values(runtime.state)).toEqual([2, 9, 2]);
});

it.each(['setState', 'setProps'] as const)(
  'rejects duplicate %s keys before discarding initializer side effects',
  async (bridge) => {
    const key = bridge === 'setState' ? 'draft' : 'value';
    const source = program.replace(
      'choose(){this.commit(this.props.value);}',
      `next(){this.state.draft++;return this.state.draft;} choose(){this.${bridge}({${key}:this.next(),${key}:this.next()});}`
    );
    await expect(analyze(source)).rejects.toThrow(
      /main\.ts:\s*\d+:\d+.*(?:重复|duplicate)/
    );
  }
);

it.each(['String', 'Number', 'Boolean'] as const)(
  'does not treat a shadowed %s function as a builtin conversion',
  async (builtin) => {
    const source = program
      .replace(
        'class Editor extends',
        `function ${builtin}(value:number){return value+10;} class Editor extends`
      )
      .replace('return value+1;', `return ${builtin}(value);`);
    await expect(analyze(source)).rejects.toThrow(
      /main\.ts:\s*\d+:\d+.*(?:内置|builtin|转换)/
    );
  }
);

it('rejects primitive throws instead of silently changing the thrown value', async () => {
  await expect(
    analyze(program.replace('return value+1;', `throw 'sentinel';`))
  ).rejects.toThrow(/main\.ts:\s*\d+:\d+.*throw.*new Error/);
});

it('preserves scalar union state assignments in the native runtime value container', async () => {
  const screen =
    await analyze(`import {BaseComponent,Emit,h,createApp} from 'transone';
 class App extends BaseComponent<object,{count:number|string|null|undefined}>{
   initState():{count:number|string|null|undefined}{return{count:1};} initStyles(){}
   @Emit('result') change(value:number|string|null|undefined){this.state.count=value;return value;}
   render(){return h('view',{},[h('text',{},[this.state.count])]);}
 }createApp({root:App}).mount();`);
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  const app = screen.program!.instances[0];
  for (const value of ['word', null, undefined, 2] as const) {
    expect(runtime.invoke(app.id, 'change', [value])).toBe(value);
    expect(Object.values(runtime.state)).toEqual([value]);
  }
});

it('preserves both a native mount failure and a failing cleanup hook', async () => {
  const screen = await analyze(
    program
      .replace(
        'choose(){',
        "onUnmounted(){throw new Error('cleanup failed');} choose(){"
      )
      .replace('this.state.draft=next;', "throw new Error('mount failed');")
  );
  const runtime = new NativeRuntime(screen);
  let failure: unknown;
  try {
    runtime.mount();
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({
    name: 'AggregateError',
    errors: [{ message: 'mount failed' }, { message: 'cleanup failed' }],
  });
});

it('rejects a shadowed Error constructor without changing its thrown semantics', async () => {
  const source = program
    .replace(
      'class Editor extends',
      'class Error { constructor(message:string){} } class Editor extends'
    )
    .replace('return value+1;', "throw new Error('custom');");
  await expect(analyze(source)).rejects.toThrow(
    /main\.ts:\s*\d+:\d+.*throw.*new Error/
  );
});

it.each(['new Error()', 'new Error(undefined)'] as const)(
  'keeps an empty native error message for %s',
  async (expression) => {
    const screen = await analyze(
      program.replace('return value+1;', `throw ${expression};`)
    );
    const runtime = new NativeRuntime(screen);
    runtime.mount();
    let failure: unknown;
    try {
      runtime.invoke(screen.program!.instances[1].id, 'commit', [1]);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('');
  }
);

it('runs native sibling mount and cleanup hooks in depth-first source order', async () => {
  const source = `import {BaseComponent,WatchProps,h,createComponent,createApp} from 'transone';
 class Child extends BaseComponent<{value:number,step:number}>{
 initState(){return{};}initStyles(){}
 beforeMount(){this.emit('trace',this.props.step);}
 @WatchProps('value',{immediate:true}) changed():void{this.emit('trace',this.props.step+1);}
 onMounted(){this.emit('trace',this.props.step+2);}
 beforeUnmount(){throw new Error('child-before-'+String(this.props.step));}onUnmounted(){throw new Error('child-after-'+String(this.props.step));}
 render(){return h('view',{},[]);}}
 class App extends BaseComponent{initState(){return{trace:''};}initStyles(){}
 trace(step:number){this.state.trace+=String(step);}
 beforeMount(){this.state.trace+='0';}onMounted(){this.state.trace+='7';}
 beforeUnmount(){throw new Error('root-before');}onUnmounted(){throw new Error('root-after');}
 render(){return h('view',{},[createComponent({component:Child,props:{value:1,step:1},emitters:{trace:(step:number)=>this.trace(step)}}),createComponent({component:Child,props:{value:1,step:4},emitters:{trace:(step:number)=>this.trace(step)}})]);}}
 createApp({root:App}).mount();`;
  const screen = await analyze(source);
  expect(screen.program!.instances.map((instance) => instance.parent)).toEqual([
    undefined,
    'c0_',
    'c0_',
  ]);
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  expect(Object.values(runtime.state)).toEqual(['01234567']);
  let failure: unknown;
  try {
    runtime.unmount();
  } catch (error) {
    failure = error;
  }
  expect(
    (failure as Error & { errors: Error[] }).errors.map(
      (error) => error.message
    )
  ).toEqual([
    'root-before',
    'child-before-1',
    'child-after-1',
    'child-before-4',
    'child-after-4',
    'root-after',
  ]);
});

it('preserves side effects and void forwarding when returning void expressions', async () => {
  const screen = await analyze(
    program
      .replace(
        'initState(){return {draft:0};}',
        'initState(){return {draft:0,calls:0};}'
      )
      .replace('return value+1;', 'return void this.bump();')
      .replace(
        'choose(){',
        'bump(){this.state.calls++;return this.state.calls;} choose(){'
      )
  );
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  expect(
    runtime.invoke(screen.program!.instances[1].id, 'commit', [4])
  ).toBeUndefined();
  expect(Object.values(runtime.state)).toEqual([4, 4, 1]);
});

it('preserves static object props used only by native initialization alongside Emit', async () => {
  const screen =
    await analyze(`import {BaseComponent,Emit,h,createApp} from 'transone';
 class App extends BaseComponent<{config:{start:number}}>{
   config=this.props.config; initState(){return{count:this.config.start};}initStyles(){}
   @Emit('result') read(){return this.state.count;}
   render(){return h('view',{},[h('text',{},[this.state.count])]);}
 }createApp({root:App,rootProps:{config:{start:5}}}).mount();`);
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  expect(runtime.invoke(screen.program!.instances[0].id, 'read')).toBe(5);
  expect(screen.program!.instances[0].props).toEqual({});
});

it('permits readonly native state when initial object props share the state root', async () => {
  const source = `import {BaseComponent,Emit,h,createApp} from 'transone';
 class App extends BaseComponent<{shared:{count:number}}>{
   shared=this.props.shared; initState(){return this.shared;}initStyles(){}
   @Emit('result') read(){return this.state.count;}
   render(){return h('view',{},[h('text',{},[this.state.count])]);}
 }createApp({root:App,rootProps:{shared:{count:5}}}).mount();`;
  const screen = await analyze(source);
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  expect(runtime.invoke(screen.program!.instances[0].id, 'read')).toBe(5);
  await expect(
    analyze(
      source.replace(
        'return this.state.count;',
        'this.state.count=6;return this.state.count;'
      )
    )
  ).rejects.toThrow(/共享.*写入/);
});

it('keeps a remounted native queue independent from the host callback that replaced it', async () => {
  const screen = await analyze(
    program
      .replace(
        'initState(){return {draft:0};}',
        "initState(){return {draft:0,trace:''};}"
      )
      .replace(
        "@WatchProps('value',{immediate:true}) receive(next:number,previous:number|undefined):void {this.state.draft=next;}",
        "@WatchProps('value',{immediate:true}) receive(next:number,previous:number|undefined):void {this.state.trace+='a'+String(next)+':'+String(previous)+';';} @WatchProps('value') second(next:number,previous:number):void {this.state.trace+='b'+String(next)+':'+String(previous)+';';} onMounted(){if(this.props.value===3)this.setProps({value:4});}"
      )
  );
  class HostRuntime extends NativeRuntime {
    private replaced = false;
    override invoke(
      instance: string,
      method: string,
      args: Parameters<NativeRuntime['invoke']>[2] = []
    ) {
      const result = super.invoke(instance, method, args);
      if (
        method === 'receive' &&
        args?.[0] === 3 &&
        args[1] === 2 &&
        !this.replaced
      ) {
        this.replaced = true;
        this.unmount();
        this.mount();
      }
      return result;
    }
  }
  const runtime = new HostRuntime(screen);
  runtime.mount();
  runtime.invoke(screen.program!.instances[0].id, 'changed', [3]);
  expect(Object.values(runtime.state)).toEqual([
    3,
    0,
    'a2:undefined;a3:2;a3:undefined;a4:3;b4:3;',
  ]);
});

it('skips native cleanup hooks for siblings that never entered a failed mount', async () => {
  const source = `import {BaseComponent,WatchProps,h,createComponent,createApp}from'transone';
 class Child extends BaseComponent<{value:number}>{initState(){return{cleaned:0};}initStyles(){}
 @WatchProps('value',{immediate:true}) changed():void{if(this.props.value===1)throw new Error('first child');}
 onUnmounted(){this.state.cleaned++;}render(){return h('view',{},[]);}}
 class App extends BaseComponent{initState(){return{};}initStyles(){}render(){return h('view',{},[createComponent({component:Child,props:{value:1}}),createComponent({component:Child,props:{value:2}})]);}}
 createApp({root:App}).mount();`;
  const screen = await analyze(source);
  const runtime = new NativeRuntime(screen);
  expect(() => runtime.mount()).toThrow('first child');
  expect(Object.values(runtime.state)).toEqual([1, 0]);
});

it('does not start a replacement native mount from inside a cleanup callback', async () => {
  const screen =
    await analyze(`import{BaseComponent,Emit,h,createApp}from'transone';class App extends BaseComponent{
 initState(){return{count:0};}initStyles(){}onMounted(){this.state.count++;}onUnmounted(){this.state.count=100;}
 @Emit('value') read(){return this.state.count;}render(){return h('view',{},[]);}}createApp({root:App}).mount();`);
  const runtime = new NativeRuntime(screen);
  const key = screen.state[0].key;
  let value = runtime.state[key];
  Object.defineProperty(runtime.state, key, {
    enumerable: true,
    configurable: true,
    get() {
      return value;
    },
    set(next) {
      value = next;
      if (next === 100) runtime.mount();
    },
  });
  runtime.mount();
  runtime.unmount();
  expect(runtime.state[key]).toBe(100);
  expect(
    runtime.invoke(screen.program!.instances[0].id, 'read')
  ).toBeUndefined();
  runtime.mount();
  expect(runtime.state[key]).toBe(101);
});

it.each(['setState', 'setProps'] as const)(
  'evaluates numeric %s keys in source order before object enumeration',
  async (bridge) => {
    const screen =
      await analyze(`import{BaseComponent,Emit,h,createApp}from'transone';class App extends BaseComponent{
 initState(){return{1:0,2:0,trace:''};}initStyles(){}step(value:number){this.state.trace+=String(value);return value;}
 @Emit('result') change(){this.${bridge}({'2':this.step(2),'1':this.step(1)});return this.state.trace;}
 render(){return h('view',{},[]);}}createApp({root:App}).mount();`);
    const runtime = new NativeRuntime(screen);
    runtime.mount();
    expect(runtime.invoke(screen.program!.instances[0].id, 'change')).toBe(
      '21'
    );
  }
);

it('applies numeric coercion before native incrementing a scalar union state', async () => {
  const screen =
    await analyze(`import{BaseComponent,Emit,h,createApp}from'transone';class App extends BaseComponent<object,{value:number|string}>{
 initState():{value:number|string}{return{value:0};}initStyles(){}
 @Emit('result') change(){this.state.value='1';(this.state.value as any)++;return this.state.value;}
 render(){return h('view',{},[]);}}createApp({root:App}).mount();`);
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  expect(runtime.invoke(screen.program!.instances[0].id, 'change')).toBe(2);
});

it('erases an explicit TypeScript this parameter from native instance methods', async () => {
  const screen = await analyze(
    program.replace('commit(value:number)', 'commit(this:Editor,value:number)')
  );
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  const editor = screen.program!.instances[1];
  expect(editor.methods.commit.params).toEqual(['value']);
  expect(runtime.invoke(editor.id, 'commit', [4])).toBe(5);
  expect(Object.values(runtime.state)).toEqual([5, 5]);
});

it('erases an explicit TypeScript this parameter from native event callback functions', async () => {
  const screen = await analyze(
    program.replace(
      'change:this.changed',
      'change:function(this:App,value:number){this.changed(value);}'
    )
  );
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  expect(runtime.invoke(screen.program!.instances[1].id, 'commit', [4])).toBe(
    5
  );
  expect(Object.values(runtime.state)).toEqual([5, 5]);
});

it('defers parent state-derived prop notifications past an unrelated native setProps', async () => {
  const screen = await analyze(
    program
      .replace(
        'initState(){return {value:2};}',
        "initState(){return {value:2,trace:''};}"
      )
      .replace(
        'changed(value:number):void{this.state.value=value;}',
        "changed(value:number):void{this.state.value=value;this.setProps({unrelated:1});this.state.trace+='after;';} observed(){this.state.trace+='watch;';}"
      )
      .replace(
        "@WatchProps('value',{immediate:true}) receive(next:number,previous:number|undefined):void {this.state.draft=next;}",
        "@WatchProps('value') receive(next:number,previous:number):void {this.state.draft=next;this.emit('observed');}"
      )
      .replace(
        'change:this.changed',
        'change:this.changed,observed:()=>this.observed()'
      )
  );
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  runtime.invoke(screen.program!.instances[0].id, 'changed', [3]);
  expect(Object.values(runtime.state)).toEqual([3, 'after;watch;', 3]);
});

it('notifies native manual child props before committing the pending parent binding', async () => {
  const screen = await analyze(
    program
      .replace(
        'initState(){return {draft:0};}',
        "initState(){return {draft:0,trace:''};}"
      )
      .replace(
        'choose(){this.commit(this.props.value);}',
        "choose(){this.emit('change',3);this.setProps({value:9});}"
      )
      .replace(
        "@WatchProps('value',{immediate:true}) receive(next:number,previous:number|undefined):void {this.state.draft=next;}",
        "@WatchProps('value') receive(next:number,previous:number):void {this.state.trace+=String(next)+';';}"
      )
  );
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  runtime.invoke(screen.program!.instances[1].id, 'choose');
  expect(Object.values(runtime.state)).toEqual([3, 0, '9;3;']);
});

it('refreshes native props from preserved cleanup state before a new mount baseline', async () => {
  const screen = await analyze(
    program
      .replace(
        ' @Bind() changed(',
        ' onUnmounted(){this.state.value=7;} @Bind() changed('
      )
      .replace(
        'initState(){return {draft:0};}',
        "initState(){return {draft:0,trace:''};}"
      )
      .replace(
        'this.state.draft=next;',
        "this.state.draft=next;this.state.trace+=String(next)+';';"
      )
  );
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  runtime.unmount();
  expect(Object.values(runtime.state)).toEqual([7, 2, '2;']);
  runtime.mount();
  expect(Object.values(runtime.state)).toEqual([7, 7, '2;7;']);
});

it('keeps pending parent state bindings out of the rest of the current native watch batch', async () => {
  const screen = await analyze(
    program
      .replace(
        'initState(){return {draft:0};}',
        "initState(){return {draft:0,trace:''};}"
      )
      .replace(
        "@WatchProps('value',{immediate:true}) receive(next:number,previous:number|undefined):void {this.state.draft=next;}",
        "@WatchProps('value') receive(next:number):void {this.state.trace+='a'+String(next)+';';if(next===3)this.emit('change',4);} @WatchProps('value') second(next:number):void {this.state.trace+='b'+String(next)+':'+String(this.props.value)+';';}"
      )
  );
  const runtime = new NativeRuntime(screen);
  runtime.mount();
  runtime.invoke(screen.program!.instances[0].id, 'changed', [3]);
  expect(Object.values(runtime.state)).toEqual([4, 0, 'a3;b3:3;a4;b4:4;']);
});
