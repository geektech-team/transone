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
it.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true],
] as const)(
  'restores same native binding after real parent renders (dynamic=%s, failures=%s)',
  async (dynamic, failures) => {
    const root = mkdtempSync(join(tmpdir(), 'transone-forward-override-'));
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
    const source = `import {BaseComponent,Emit,WatchProps,h,createComponent,createApp} from 'transone';
 class Leaf extends BaseComponent {initState(){return {draft:1,count:0};}initStyles(){}
 @Emit('log') log(value){return value;} @Emit('none') poke(value){this.setProps({value,local:9});}
 @WatchProps('value') watch(next,old){this.state.draft=next;this.state.count++;this.log(String(next)+':'+String(old)+';');${failures ? "if(next===2||next===3)throw new Error('local failed');" : ''}}
 render(){return h('view',{},[h('text',{},[String(this.state.draft)])]);}}
 class App extends BaseComponent {initState(){return{binding:1,unused:0,trace:''};}initStyles(){}
 log(value){this.state.trace+=value;} @Emit('none') refresh(value){this.setProps({tick:value});} @Emit('none') unrelated(){this.state.unused++;}
 render(){return h('view',{},[h('text',{},[String(this.props.tick)]),createComponent({component:Leaf,props:{value:${dynamic ? 'this.state.binding' : '1'}},emitters:{log:(value)=>this.log(value)}})]);}}
 createApp({root:App,rootProps:{tick:0}}).mount();`;
    const entry = join(root, 'src/main.ts');
    writeFileSync(entry, source);
    const screen = await analyzeNativeScreen(
      entry,
      await resolveConfig({ root, target: 'app-harmony' })
    );
    const [app, leaf] = screen.program!.instances;
    const trace = screen.state.find((s) => s.key.endsWith('_trace'))!.key;
    const count = screen.state.find((s) => s.key.endsWith('_count'))!.key;
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
          .replace(
            'createApp({root:App,rootProps:{tick:0}}).mount();',
            'export {App};'
          )
      );
      const { App } = await import(file);
      core = new App({ tick: 0 });
      core.mount(document.createElement('main'));
      flushSync();
      const child = [...core.childComponents][0] as any;
      for (const next of [2, 3]) {
        if (failures) expect(() => child.poke(next)).toThrow('local failed');
        else child.poke(next);
        flushSync();
      }
      core.unrelated();
      flushSync();
      expect(child.props.value).toBe(3);
      core.refresh(1);
      flushSync();
      expect(child.props.value).toBe(1);
      expect(child.props.local).toBe(9);
      expect(child.state.count).toBe(3);
      expect(core.state.trace).toBe('2:1;3:2;1:3;');
      expect(core.props.tick).toBe(1);
      child.poke(4);
      core.refresh(1);
      flushSync();
      expect(child.props.value).toBe(1);
      expect(child.props.local).toBe(9);
      expect(child.state.count).toBe(5);
      expect(core.state.trace).toBe('2:1;3:2;1:3;4:1;1:4;');
    } finally {
      core?.unmount();
      flushSync();
      restore();
    }
    const oracle = new NativeRuntime(screen);
    oracle.mount();
    for (const next of [2, 3]) {
      if (failures)
        expect(() => oracle.invoke(leaf.id, 'poke', [next])).toThrow(
          'local failed'
        );
      else oracle.invoke(leaf.id, 'poke', [next]);
    }
    oracle.invoke(app.id, 'unrelated');
    expect(oracle.props(leaf.id).value).toBe(3);
    oracle.invoke(app.id, 'refresh', [1]);
    expect(oracle.props(leaf.id).value).toBe(1);
    expect(oracle.props(leaf.id).local).toBe(9);
    expect(oracle.state[count]).toBe(3);
    expect(oracle.state[trace]).toBe('2:1;3:2;1:3;');
    expect(oracle.props(app.id).tick).toBe(1);
    oracle.invoke(leaf.id, 'poke', [4]);
    oracle.invoke(app.id, 'refresh', [1]);
    expect(oracle.props(leaf.id).value).toBe(1);
    expect(oracle.props(leaf.id).local).toBe(9);
    expect(oracle.state[count]).toBe(5);
    expect(oracle.state[trace]).toBe('2:1;3:2;1:3;4:1;1:4;');
    const code = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      nativeRuntimeSource(screen, 'ark')
    );
    const { TnRuntime, TnValue } = new Function(
      code + '\nreturn {TnRuntime,TnValue};'
    )();
    const native = new TnRuntime();
    native.mount();
    for (const next of [2, 3]) {
      if (failures)
        expect(() =>
          native.invoke(leaf.id, 'poke', [TnValue.num(next)])
        ).toThrow('local failed');
      else native.invoke(leaf.id, 'poke', [TnValue.num(next)]);
    }
    native.invoke(app.id, 'unrelated', []);
    expect(native.prop(leaf.id, 'value').number).toBe(3);
    native.invoke(app.id, 'refresh', [TnValue.num(1)]);
    expect(native.prop(leaf.id, 'value').number).toBe(1);
    expect(native.prop(leaf.id, 'local').number).toBe(9);
    expect(native.getState(count).number).toBe(3);
    expect(native.string(native.getState(trace))).toBe('2:1;3:2;1:3;');
    expect(native.prop(app.id, 'tick').number).toBe(1);
    native.invoke(leaf.id, 'poke', [TnValue.num(4)]);
    native.invoke(app.id, 'refresh', [TnValue.num(1)]);
    expect(native.prop(leaf.id, 'value').number).toBe(1);
    expect(native.prop(leaf.id, 'local').number).toBe(9);
    expect(native.getState(count).number).toBe(5);
    expect(native.string(native.getState(trace))).toBe('2:1;3:2;1:3;4:1;1:4;');
  }
);
