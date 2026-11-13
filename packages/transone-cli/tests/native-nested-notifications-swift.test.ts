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
 initState(){return{};}initStyles(){}
 @Emit('log') log(value:string){return value;}
 @Emit('change') change(value:number){return value;}
 @Emit('none') poke(){this.setProps({value:2});}
 @WatchProps('value') first(next:number,old:number):void {
   this.log('lA'+String(next)+':'+String(old)+';');if(next===2)this.change(3);
 }
 @WatchProps('value') second(next:number,old:number):void {
   this.log('lB'+String(next)+':'+String(old)+';');
 }
 render(){return h('view',{},[]);}
}
class Mid extends BaseComponent<{value:number}>{
 initState(){return{mounts:0};}initStyles(){}
 @Emit('log') log(value:string){return value;}
 @Emit('change') changed(next:number){this.setProps({value:next});return next;}
 @WatchProps('value') first(next:number,old:number):void {
   this.log('mA'+String(next)+':'+String(old)+';');
 }
 @WatchProps('value') second(next:number,old:number):void {
   this.log('mB'+String(next)+':'+String(old)+';');
 }
 render(){return h('view',{},[createComponent({component:Leaf,props:{value:this.props.value},emitters:{change:(n:number)=>this.changed(n),log:(s:string)=>this.log(s)}})]);}
}
class App extends BaseComponent {
 initState(){return{value:1,trace:''};}initStyles(){}
 log(value:string){this.state.trace+=value;}
 @Emit('none') mutate(value:number){this.state.value=value;}
 changed(value:number){this.state.value=value;}
 render(){return h('view',{},[createComponent({component:Mid,props:{value:this.state.value},emitters:{change:(n:number)=>this.changed(n),log:(s:string)=>this.log(s)}})]);}
}
createApp({root:App}).mount();`;

async function execute(
  program: string,
  script: (ids: { root: string; leaf: string; trace: string }) => string
): Promise<string[]> {
  const root = mkdtempSync(join(tmpdir(), 'transone-nested-swift-'));
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
    const instances = screen.program!.instances;
    const file = join(root, 'runtime.swift');
    writeFileSync(
      file,
      nativeRuntimeSource(screen, 'swift') +
        script({
          root: instances[0].id,
          leaf: instances[2].id,
          trace: screen.state.find((entry) => entry.key.endsWith('_trace'))!
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

it.skipIf(!existsSync('/usr/bin/swift'))(
  'runs a different native component watcher synchronously during nested Emit',
  async () => {
    expect(
      await execute(
        source,
        ({ root, trace }) => `
let r = TnRuntime()
try r.mount()
_ = try r.invoke("${root}", "mutate", [.num(2)])
print(r.string(r.getState("${trace}")))
`
      )
    ).toEqual(['mA2:1;mB2:1;lA2:1;mA3:2;mB3:2;lB2:1;lA3:2;lB3:2;']);
  },
  60_000
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'keeps a completed ancestor notification when a later child watcher throws',
  async () => {
    expect(
      await execute(
        source.replace(
          "this.log('lB'+String(next)+':'+String(old)+';');",
          "this.log('lB'+String(next)+':'+String(old)+';');if(next===2)throw new Error('leaf failed');"
        ),
        ({ root, leaf, trace }) => `
let r = TnRuntime()
try r.mount()
do { _ = try r.invoke("${leaf}", "poke", []) } catch { print("leaf failed") }
print(r.string(r.getState("${trace}")))
_ = try r.invoke("${root}", "mutate", [.num(4)])
print(r.string(r.getState("${trace}")))
`
      )
    ).toEqual([
      'leaf failed',
      'lA2:1;mA3:1;mB3:1;lB2:1;lA3:2;lB3:2;',
      'lA2:1;mA3:1;mB3:1;lB2:1;lA3:2;lB3:2;mA4:3;mB4:3;lA4:3;lB4:3;',
    ]);
  },
  60_000
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'isolates replacement native owner queues from an old nested watcher failure',
  async () => {
    const program = source
      .replace(
        /@WatchProps\('value'\) first/g,
        "@WatchProps('value',{immediate:true}) first"
      )
      .replace(
        "this.log('mA'+String(next)+':'+String(old)+';');",
        "this.log('mA'+String(next)+':'+String(old)+';');if(next===3&&old===1)throw new Error('old owner failed');"
      )
      .replace(
        'initState(){return{mounts:0};}initStyles(){}',
        'initState(){return{mounts:0};}initStyles(){}onMounted(){this.state.mounts++;if(this.state.mounts===2)this.setProps({value:4});}'
      );
    expect(
      await execute(
        program,
        ({ root, leaf, trace }) => `
let r = TnRuntime()
try r.mount()
var once = true
r.changed = {
  if once && r.string(r.getState("${trace}")).hasSuffix("mA3:1;") {
    once = false
    try! r.unmount()
    try! r.mount()
  }
}
_ = try r.invoke("${leaf}", "poke", [])
print(r.string(r.getState("${trace}")))
_ = try r.invoke("${root}", "mutate", [.num(5)])
print(r.string(r.getState("${trace}")))
`
      )
    ).toEqual([
      // The parent still holds 1: remount precedes changed(3)'s emission, so its render restores the binding.
      'lA1:undefined;mA1:undefined;lA2:1;mA3:1;lA1:undefined;mA1:undefined;mA4:1;mB4:1;lA4:1;lB4:1;',
      'lA1:undefined;mA1:undefined;lA2:1;mA3:1;lA1:undefined;mA1:undefined;mA4:1;mB4:1;lA4:1;lB4:1;mA5:4;mB5:4;lA5:4;lB5:4;',
    ]);
  },
  60_000
);
