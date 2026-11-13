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
  'builds native %s source with event payloads, props bindings and scoped UI callbacks',
  async (target) => {
    const root = mkdtempSync(
      join(tmpdir(), 'transone-native-decorator-build-')
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
    writeFileSync(
      join(root, 'src/main.ts'),
      `import {BaseComponent,Emit,WatchProps,h,createApp,createComponent} from 'transone';
    class Editor extends BaseComponent<{value:number}> {
      initState(){return {draft:0};} initStyles(){}
      @Emit('change') commit(){return this.props.value+1;}
      @WatchProps('value',{immediate:true}) changed(value:number,previous:number|undefined):void {if(value===previous)return;this.setState({draft:value});}
      render(){return h('view',{},[h('text',{},[this.state.draft]),h('button',{},['this.getState \\u0000'],{click:this.commit})]);}
    }
    class App extends BaseComponent {
      initState(){return {value:1};} initStyles(){}
      changed(value:number){this.setState({value});}
      render(){return h('view',{},[createComponent({component:Editor,props:{value:this.state.value},emitters:{change:this.changed}})]);}
    }
    createApp({root:App}).mount();`
    );
    const result = await build({ root, target });
    const output = result.assetsBuilt.find((path) =>
      /(?:ContentView\.swift|MainActivity\.kt|Index\.ets)$/.test(path)
    );
    expect(output).toBeDefined();
    const source = readFileSync(output!, 'utf8');
    expect(source).toContain('TnRuntime');
    expect(source).toContain('runtime.action');
    expect(source).toContain('this.getState');
    expect(source).not.toContain('@Emit');
    if (target === 'app-harmony') {
      const runtimeSource = source.slice(0, source.indexOf('@Entry'));
      const code = new Bun.Transpiler({ loader: 'ts' }).transformSync(
        runtimeSource
      );
      const { TnRuntime } = new Function(code + '\nreturn {TnRuntime};')();
      const runtime = new TnRuntime();
      runtime.mount();
      const child = /case "([^":]+):change"/.exec(runtimeSource)![1];
      expect(runtime.invoke(child, 'commit', []).number).toBe(2);
      expect(runtime.prop(child, 'value').number).toBe(2);
      expect(
        [...runtime.state.values()].map((value: unknown) =>
          runtime.string(value)
        )
      ).toEqual(['2', '2']);
    }
  },
  30_000
);
