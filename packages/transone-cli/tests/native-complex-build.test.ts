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

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

it.each(['app-ios', 'app-android', 'app-harmony'] as const)(
  'builds %s with nested payloads, array props and preserves output on unsupported data',
  async (target) => {
    const root = mkdtempSync(join(tmpdir(), 'transone-complex-build-'));
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
          baseUrl: root,
          paths: {
            transone: [resolve(import.meta.dir, '../../transone/lib/index.ts')],
          },
        },
      })
    );
    const source = `import {BaseComponent,Emit,WatchProps,h,createApp,createComponent} from 'transone';
    interface Payload {title:string;items:Array<{id:number}>;missing?:unknown;}
    class Editor extends BaseComponent<{payload:Payload},{title:string;count:number}> {
      initState(){return {title:'',count:0};} initStyles(){}
      @Emit('change') commit(){const current=this.props.payload;return {...current,title:'next',items:[...current.items,{id:2}],missing:undefined};}
      @WatchProps('payload',{immediate:true}) changed(value:Payload):void {this.setState({title:value.title,count:value.items.length});}
      render(){return h('view',{},[h('text',{},[this.state.title]),h('button',{},['commit'],{click:this.commit})]);}
    }
    class App extends BaseComponent<object,{payload:Payload}> {
      initState(){return {payload:{title:'first',items:[{id:1}]}};} initStyles(){}
      changed(value:unknown){this.setState({payload:value as Payload});}
      render(){return h('view',{},[createComponent({component:Editor,props:{payload:this.state.payload},emitters:{change:this.changed}})]);}
    }
    createApp({root:App}).mount();`;
    writeFileSync(join(root, 'src/main.ts'), source);
    const result = await build({ root, target });
    const path = result.assetsBuilt.find((path) =>
      /(?:ContentView\.swift|MainActivity\.kt|Index\.ets)$/.test(path)
    )!;
    const output = readFileSync(path, 'utf8');
    expect(output).toContain('makeObject');
    expect(output).toContain('makeArray');
    if (target === 'app-harmony') {
      const runtimeSource = output.slice(0, output.indexOf('@Entry'));
      const code = new Bun.Transpiler({ loader: 'ts' }).transformSync(
        runtimeSource
      );
      const { TnRuntime, TnValue } = new Function(
        code + '\nreturn {TnRuntime,TnValue};'
      )();
      const runtime = new TnRuntime();
      runtime.mount();
      const child = /case "([^":]+):change"/.exec(runtimeSource)![1];
      const initial = runtime.prop(child, 'payload');
      const value = runtime.invoke(child, 'commit', []);
      expect(runtime.same(value, runtime.prop(child, 'payload'))).toBe(true);
      expect(runtime.same(value, initial)).toBe(false);
      expect(
        runtime.member(
          runtime.member(value, TnValue.str('items')),
          TnValue.str('length')
        ).number
      ).toBe(2);
      expect(runtime.member(value, TnValue.str('missing')).kind).toBe(
        'undefined'
      );
      expect(value.collection.values.has('missing')).toBe(true);
      const texts = [...runtime.state.values()]
        .filter((value: any) => value.kind === 'string')
        .map((value: any) => value.text);
      expect(texts).toContain('next');
    }
    writeFileSync(
      join(root, 'src/main.ts'),
      source.replace(
        "return {...current,title:'next',items:[...current.items,{id:2}],missing:undefined};",
        'return new Date();'
      )
    );
    await expect(build({ root, target })).rejects.toThrow(
      /main\.ts:\s*\d+:\d+/
    );
    expect(readFileSync(path, 'utf8')).toBe(output);
  },
  30_000
);
