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
import { nativeRuntimeSource } from '../src/app/runtime-codegen';
import { createDomWindow, installDomGlobals } from '../../transone/lib/dom';
import { flushSync } from '../../transone/lib';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const program =
  "import {BaseComponent,Emit,WatchProps,h,createComponent,createApp} from 'transone';\nclass Leaf extends BaseComponent<{value:number}>{initState(){return{};}initStyles(){}\n @Emit('log') log(value:string){return value;}\n @Emit('change') change(value:number){return value;}\n @WatchProps('value') first(next:number,old:number):void {this.log('lA'+String(next)+':'+String(old)+';');if(next===2)this.change(3);}\n @WatchProps('value') second(next:number,old:number):void {this.log('lB'+String(next)+':'+String(old)+';');if(next===2)throw new Error('leaf failed');}\n @Emit('none') poke(){this.setProps({value:2});}\n render(){return h('view',{},[]);}}\nclass Mid extends BaseComponent<{value:number}>{initState(){return{};}initStyles(){}\n @Emit('log') log(value:string){return value;}\n @Emit('change') changed(next:number){this.setProps({value:next});return next;}\n @WatchProps('value') first(next:number,old:number):void {this.log('mA'+String(next)+':'+String(old)+';');}\n @WatchProps('value') second(next:number,old:number):void {this.log('mB'+String(next)+':'+String(old)+';');}\n render(){return h('view',{},[createComponent({component:Leaf,props:{value:this.props.value},emitters:{change:(n:number)=>this.changed(n),log:(s:string)=>this.log(s)}})]);}}\nclass App extends BaseComponent {initState(){return{value:1,trace:''};}initStyles(){}\n log(value:string){this.state.trace+=value;}\n @Emit('unhandled') mutate(value:number){this.state.value=value;}\n changed(value:number){this.state.value=value;}\n render(){return h('view',{},[createComponent({component:Mid,props:{value:this.state.value},emitters:{change:(n:number)=>this.changed(n),log:(s:string)=>this.log(s)}})]);}}\ncreateApp({root:App}).mount();";

it.each([
  [false, false],
  [false, true],
  [true, false],
  [true, true],
] as const)(
  'notifies reentrant ancestors before a later leaf failure (inheritance=%s, throw=%s)',
  async (inherited, throwing) => {
    const root = mkdtempSync(join(tmpdir(), 'transone-nested-notifications-'));
    roots.push(root);
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'node_modules'));
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
          paths: {
            transone: [resolve(import.meta.dir, '../../transone/lib/index.ts')],
          },
        },
      })
    );
    let source = program;
    if (!throwing)
      source = source.replace(
        "if(next===2)throw new Error('leaf failed');",
        ''
      );
    if (inherited) {
      source = source.replace(
        'class Leaf extends BaseComponent<{value:number}>',
        `class LeafBase extends BaseComponent<{value:number}> {initState(){return{};}initStyles(){}
    @Emit('ancestor') change(next:number){return next;}
    @WatchProps('value') first(next:number,old:number):void{this.log('bA'+String(next)+':'+String(old)+';');}
    log(value:string){} render(){return h('view',{},[]);}}
  class LeafMiddle extends LeafBase {@Emit('middle') change(next:number){return super.change(next);}}
  class Leaf extends LeafMiddle`
      );
      source = source.replace(
        "@Emit('change') change(value:number){return value;}",
        "@Emit('change') change(value:number){return super.change(value);}"
      );
      source = source.replace(
        "first(next:number,old:number):void {this.log('lA'",
        "first(next:number,old:number):void {super.first(next,old);this.log('lA'"
      );
      source = source.replace(
        'emitters:{change:(n:number)=>this.changed(n),log:(s:string)=>this.log(s)}})]);}}',
        "emitters:{change:(n:number)=>this.changed(n),ancestor:()=>this.log('BAD'),middle:()=>this.log('BAD'),log:(s:string)=>this.log(s)}})]);}}"
      );
    }
    const entry = join(root, 'src/main.ts');
    writeFileSync(entry, source);
    const screen = await analyzeNativeScreen(
      entry,
      await resolveConfig({ root, target: 'app-harmony' })
    );
    const [app, , leaf] = screen.program!.instances;
    const trace = screen.state.find((s) => s.key.endsWith('_trace'))!.key;
    const expected = inherited
      ? 'bA2:1;lA2:1;mA3:1;mB3:1;lB2:1;bA3:2;lA3:2;lB3:2;'
      : 'lA2:1;mA3:1;mB3:1;lB2:1;lA3:2;lB3:2;';
    const recovery = inherited
      ? 'mA4:3;mB4:3;bA4:3;lA4:3;lB4:3;'
      : 'mA4:3;mB4:3;lA4:3;lB4:3;';
    const restore = installDomGlobals(
      createDomWindow({ url: 'http://localhost/' })
    );
    let core: any;
    try {
      const file = join(root, 'src/core.ts');
      writeFileSync(
        file,
        source
          .replace(
            "from 'transone'",
            `from '${resolve(import.meta.dir, '../../transone/lib/index.ts')}'`
          )
          .replace('createApp({root:App}).mount();', 'export {App};')
      );
      const { App } = await import(file);
      core = new App();
      core.mount(document.createElement('main'));
      flushSync();
      const child = [
        ...([...core.childComponents][0] as any).childComponents,
      ][0] as any;
      if (throwing) expect(() => child.poke()).toThrow('leaf failed');
      else child.poke();
      flushSync();
      expect(core.state.trace).toBe(expected);
      core.changed(4);
      flushSync();
      expect(core.state.trace).toBe(expected + recovery);
    } finally {
      core?.unmount();
      flushSync();
      restore();
    }
    const oracle = new NativeRuntime(screen);
    oracle.mount();
    if (throwing)
      expect(() => oracle.invoke(leaf.id, 'poke')).toThrow('leaf failed');
    else oracle.invoke(leaf.id, 'poke');
    expect(oracle.state[trace]).toBe(expected);
    oracle.invoke(app.id, 'changed', [4]);
    expect(oracle.state[trace]).toBe(expected + recovery);
    const code = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      nativeRuntimeSource(screen, 'ark')
    );
    const { TnRuntime, TnValue } = new Function(
      code + '\nreturn {TnRuntime,TnValue};'
    )();
    const native = new TnRuntime();
    native.mount();
    if (throwing)
      expect(() => native.invoke(leaf.id, 'poke', [])).toThrow('leaf failed');
    else native.invoke(leaf.id, 'poke', []);
    expect(native.string(native.getState(trace))).toBe(expected);
    native.invoke(app.id, 'changed', [TnValue.num(4)]);
    expect(native.string(native.getState(trace))).toBe(expected + recovery);
  }
);
