import { expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { analyzeNativeScreen } from '../src/app/analyze';
import { nativeRuntimeSource } from '../src/app/runtime-codegen';
import { resolveConfig } from '../src/config';

const source = `import {BaseComponent,Emit,WatchProps,h,createComponent,createApp} from 'transone';
class Leaf extends BaseComponent<{value:number}>{
 initState(){return{draft:1,count:0,trace:''};}initStyles(){}
 @Emit('none') poke(value:number){this.setProps({value:value});}
 @WatchProps('value') first(next:number,old:number):void {
   this.state.draft=next;this.state.count++;
   this.state.trace+='a'+String(next)+':'+String(old)+';';
 }
 @WatchProps('value') second(next:number,old:number):void {
   this.state.trace+='b'+String(next)+':'+String(old)+';';
 }
 render(){return h('view',{},[h('text',{},[String(this.state.draft)])]);}
}
class App extends BaseComponent<{tick:number}>{
 initState(){return{value:1,unread:0};}initStyles(){}
 @Emit('none') refresh(value:number){this.setProps({tick:value});}
 @Emit('none') quiet(){this.state.unread++;}
 render(){return h('view',{},[
   h('text',{},[String(this.props.tick)]),
   createComponent({component:Leaf,props:{value:1}})
 ]);}
}
createApp({root:App,rootProps:{tick:0}}).mount();`;

type Ids = {
  root: string;
  leaf: string;
  draft: string;
  count: string;
  trace: string;
};
async function execute(
  program: string,
  script: (ids: Ids) => string,
  legacy = false
): Promise<string[]> {
  const root = mkdtempSync(join(tmpdir(), 'transone-forward-override-swift-'));
  try {
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
    const entry = join(root, 'src/main.ts');
    writeFileSync(entry, program);
    const screen = await analyzeNativeScreen(
      entry,
      await resolveConfig({ root, target: 'app-ios' })
    );
    if (legacy)
      for (const instance of screen.program!.instances)
        delete instance.renderDependencies;
    const file = join(root, 'runtime.swift');
    writeFileSync(
      file,
      nativeRuntimeSource(screen, 'swift') +
        script({
          root: screen.program!.instances[0].id,
          leaf: screen.program!.instances[1].id,
          draft: screen.state.find((state) => state.key.endsWith('_draft'))!
            .key,
          count: screen.state.find((state) => state.key.endsWith('_count'))!
            .key,
          trace: screen.state.find((state) => state.key.endsWith('_trace'))!
            .key,
        })
    );
    const result = Bun.spawnSync({
      cmd: ['/usr/bin/swift', '-module-cache-path', join(root, 'cache'), file],
      env: { ...process.env, CLANG_MODULE_CACHE_PATH: join(root, 'cache') },
      timeout: 50_000,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    return result.stdout.toString().trim().split('\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

for (const binding of ['1', 'this.state.value'])
  it.skipIf(!existsSync('/usr/bin/swift'))(
    `restores unchanged Swift parent binding ${binding} after a tracked parent render`,
    async () => {
      expect(
        await execute(
          source.replace('props:{value:1}', `props:{value:${binding}}`),
          ({ root, leaf, draft, count, trace }) => `
let r=TnRuntime()
try r.mount()
_ = try r.invoke("${leaf}", "poke", [.num(2)])
_ = try r.invoke("${root}", "quiet", [])
print(r.string(r.prop("${leaf}", "value")))
_ = try r.invoke("${root}", "refresh", [.num(1)])
print(r.string(r.prop("${leaf}", "value")))
print(r.string(r.getState("${draft}")))
print(r.string(r.getState("${count}")))
print(r.string(r.prop("${root}", "tick")))
_ = try r.invoke("${root}", "refresh", [.num(2)])
print(r.string(r.getState("${trace}")))
`
        )
      ).toEqual(['2', '1', '1', '2', '1', 'a2:1;b2:1;a1:2;b1:2;']);
    },
    60_000
  );

it.skipIf(!existsSync('/usr/bin/swift'))(
  'recovers Swift parent bindings after consecutive failing local watcher batches',
  async () => {
    expect(
      await execute(
        source.replace(
          "this.state.trace+='a'+String(next)+':'+String(old)+';';",
          "this.state.trace+='a'+String(next)+':'+String(old)+';';if(next===2||next===3)throw new Error('local watch');"
        ),
        ({ root, leaf, trace }) => `
let r=TnRuntime()
try r.mount()
for value in [2.0,3.0] {
  do { _ = try r.invoke("${leaf}", "poke", [.num(value)]) } catch { print("local watch") }
  _ = try r.invoke("${root}", "quiet", [])
  print(r.string(r.prop("${leaf}", "value")))
  _ = try r.invoke("${root}", "refresh", [.num(value)])
  print(r.string(r.prop("${leaf}", "value")))
}
print(r.string(r.getState("${trace}")))
`
      )
    ).toEqual([
      'local watch',
      '2',
      '1',
      'local watch',
      '3',
      '1',
      'a2:1;a1:2;b1:2;a3:1;a1:3;b1:3;',
    ]);
  },
  60_000
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'starts a fresh Swift immediate snapshot after remount restores the parent binding',
  async () => {
    expect(
      await execute(
        source.replace(
          "@WatchProps('value') first",
          "@WatchProps('value',{immediate:true}) first"
        ),
        ({ root, leaf, trace }) => `
let r=TnRuntime()
try r.mount()
_ = try r.invoke("${root}", "refresh", [.num(1)])
_ = try r.invoke("${leaf}", "poke", [.num(2)])
let old=r.action { _ = try r.invoke("${root}", "refresh", [.num(99)]) }
try r.unmount()
try r.mount()
old()
print(r.string(r.prop("${root}", "tick")))
print(r.string(r.prop("${leaf}", "value")))
print(r.string(r.getState("${trace}")))
_ = try r.invoke("${leaf}", "poke", [.num(3)])
_ = try r.invoke("${root}", "refresh", [.num(2)])
print(r.string(r.getState("${trace}")))
`
      )
    ).toEqual([
      '1',
      '1',
      'a1:undefined;a2:1;b2:1;a1:undefined;',
      'a1:undefined;a2:1;b2:1;a1:undefined;a3:1;b3:1;a1:3;b1:3;',
    ]);
  },
  60_000
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'restores an empty Swift override once without rerendering children that have no override',
  async () => {
    const program = source
      .replace(
        'class Leaf extends',
        `class Packet extends BaseComponent<{packet:{value:number}}>{
 initState(){return{};}initStyles(){}
 @WatchProps('packet') changed():void{this.emit('packet');}
 render(){return h('view',{},[]);}}
class Leaf extends`
      )
      .replace(
        "@Emit('none') poke(value:number)",
        "packet(){this.state.count++;}@Emit('none') empty(){this.setProps({});}@Emit('none') poke(value:number)"
      )
      .replace(
        "h('text',{},[String(this.state.draft)])",
        "h('text',{},[String(this.state.draft)]),createComponent({component:Packet,props:{packet:{value:1}},emitters:{packet:()=>this.packet()}})"
      );
    expect(
      await execute(
        program,
        ({ root, leaf, count }) => `
let r=TnRuntime()
try r.mount()
print(r.string(r.getState("${count}")))
_ = try r.invoke("${root}", "refresh", [.num(1)])
print(r.string(r.getState("${count}")))
_ = try r.invoke("${leaf}", "empty", [])
print(r.string(r.getState("${count}")))
_ = try r.invoke("${root}", "refresh", [.num(2)])
print(r.string(r.getState("${count}")))
_ = try r.invoke("${root}", "refresh", [.num(3)])
print(r.string(r.getState("${count}")))
`
      )
    ).toEqual(['0', '0', '1', '2', '2']);
  },
  60_000
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'preserves unprovided Swift local props when restoring fixed parent bindings',
  async () => {
    const program = source
      .replace(
        'BaseComponent<{value:number}>',
        'BaseComponent<{value:number,local?:number}>'
      )
      .replace(
        'this.setProps({value:value})',
        'this.setProps({value:value,local:9})'
      )
      .replace(
        "@WatchProps('value') second",
        "@WatchProps('local') local(next:number,old:number):void{this.state.trace+='x'+String(next)+':'+String(old)+';';}@WatchProps('value') second"
      );
    expect(
      await execute(
        program,
        ({ root, leaf, trace }) => `
let r=TnRuntime()
try r.mount()
_ = try r.invoke("${leaf}", "poke", [.num(2)])
_ = try r.invoke("${root}", "refresh", [.num(1)])
print(r.string(r.prop("${leaf}", "value")))
print(r.string(r.prop("${leaf}", "local")))
_ = try r.invoke("${root}", "refresh", [.num(2)])
print(r.string(r.prop("${leaf}", "local")))
print(r.string(r.getState("${trace}")))
`
      )
    ).toEqual(['1', '9', '9', 'a2:1;x9:undefined;b2:1;a1:2;b1:2;']);
  },
  60_000
);

for (const [binding, method, first, second, trace] of [
  ['fixed', 'refresh', 1, 1, 'a2:1;a1:2;b1:2;a3:1;a1:3;b1:3;'],
  ['changing', 'advance', 4, 5, 'a2:1;a4:2;b4:2;a3:4;a5:3;b5:3;'],
] as const)
  it.skipIf(!existsSync('/usr/bin/swift'))(
    `preserves unprovided Swift local props through failing batches and ${binding} parent bindings`,
    async () => {
      let program = source
        .replace(
          'BaseComponent<{value:number}>',
          'BaseComponent<{value:number,local?:number}>'
        )
        .replace(
          'this.setProps({value:value})',
          'this.setProps({value:value,local:9})'
        )
        .replace(
          "this.state.trace+='a'+String(next)+':'+String(old)+';';",
          "this.state.trace+='a'+String(next)+':'+String(old)+';';if(next===2||next===3)throw new Error('local watch');"
        );
      if (binding === 'changing')
        program = program
          .replace('props:{value:1}', 'props:{value:this.state.value}')
          .replace(
            "@Emit('none') quiet()",
            "@Emit('none') advance(value:number){this.state.value=value;}@Emit('none') quiet()"
          );
      expect(
        await execute(
          program,
          ({ root, leaf, trace: traceKey }) => `
let r=TnRuntime()
try r.mount()
do { _ = try r.invoke("${leaf}", "poke", [.num(2)]) } catch { print("local watch") }
_ = try r.invoke("${root}", "${method}", [.num(${first})])
print(r.string(r.prop("${leaf}", "value")))
print(r.string(r.prop("${leaf}", "local")))
do { _ = try r.invoke("${leaf}", "poke", [.num(3)]) } catch { print("local watch") }
_ = try r.invoke("${root}", "${method}", [.num(${binding === 'fixed' ? 2 : second})])
print(r.string(r.prop("${leaf}", "value")))
print(r.string(r.prop("${leaf}", "local")))
print(r.string(r.getState("${traceKey}")))
`
        )
      ).toEqual([
        'local watch',
        String(first),
        '9',
        'local watch',
        String(second),
        '9',
        trace,
      ]);
    },
    60_000
  );

it.skipIf(!existsSync('/usr/bin/swift'))(
  'retains legacy Swift override behavior without tracked parent render metadata',
  async () => {
    expect(
      await execute(
        source,
        ({ root, leaf, trace }) => `
let r=TnRuntime()
try r.mount()
_ = try r.invoke("${leaf}", "poke", [.num(2)])
_ = try r.invoke("${root}", "refresh", [.num(1)])
print(r.string(r.prop("${leaf}", "value")))
print(r.string(r.getState("${trace}")))
`,
        true
      )
    ).toEqual(['2', 'a2:1;b2:1;']);
  },
  60_000
);
