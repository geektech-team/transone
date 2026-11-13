import { afterEach, expect, it } from 'bun:test';
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
import { createDomWindow, installDomGlobals } from '../../transone/lib/dom';
import { flushSync } from '../../transone/lib';
import { analyzeNativeScreen } from '../src/app/analyze';
import { NativeRuntime } from '../src/app/runtime';
import { nativeRuntimeSource } from '../src/app/runtime-codegen';
import { resolveConfig } from '../src/config';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const mountSource = 'createApp({root:App,rootProps:{tick:0}}).mount();';
function source(failing: boolean): string {
  return `import {BaseComponent,Emit,WatchProps,h,createComponent,createApp} from 'transone';
class Leaf extends BaseComponent {
 initState(){return{};}initStyles(){}
 @Emit('log') log(value){return value;}
 @Emit('none') poke2(){this.setProps({value:2,local:9});}
 @Emit('none') poke3(){this.setProps({value:3});}
 @Emit('none') localUndefined(){this.setProps({local:undefined});}
 @Emit('none') localNull(){this.setProps({local:null});}
 @Emit('none') shared(){this.setProps({local:this.props.value});}
 @Emit('none') valueUndefined(){this.setProps({value:undefined});}
 @Emit('none') empty(){this.setProps({});}
 @WatchProps('value') first(next,old){
   this.log('a'+String(next)+':'+String(old)+';');
   ${failing ? "if(next===2||next===3){this.setProps({local:undefined});throw new Error('watch failed');}" : ''}
 }
 @WatchProps('local') local(next,old){this.log('l'+String(next)+':'+String(old)+';');}
 @WatchProps('value') second(next,old){this.log('b'+String(next)+':'+String(old)+';');}
 render(){return h('view',{},[h('text',{},[String(this.props.value)+String(this.props.local)])]);}
}
class App extends BaseComponent {
 initState(){return{binding:1,unused:0,trace:'',shared:{n:1}};}initStyles(){}
 log(value){this.state.trace+=value;}
 @Emit('none') quiet(){this.state.unused++;}
 @Emit('none') refresh(){this.setProps({tick:this.props.tick+1});}
 @Emit('none') bindingOne(){this.state.binding=1;}
 @Emit('none') bindingUndefined(){this.state.binding=undefined;}
 @Emit('none') bindingNull(){this.state.binding=null;}
 @Emit('none') bindingShared(){this.state.binding=this.state.shared;}
 @Emit('none') bindingNew(){this.state.binding={n:1};}
 render(){return h('view',{},[h('text',{},[String(this.props.tick)]),createComponent({component:Leaf,props:{value:this.state.binding},emitters:{log:(value)=>this.log(value)}})]);}
}
${mountSource}`;
}

const cycle = [
  'bindingOne',
  'poke2',
  'poke3',
  'quiet',
  'localNull',
  'refresh',
  'bindingShared',
  'shared',
  'quiet',
  'empty',
  'refresh',
  'bindingUndefined',
  'localUndefined',
  'bindingNull',
  'localNull',
  'valueUndefined',
  'quiet',
  'refresh',
  'bindingShared',
  'shared',
  'bindingNew',
  'refresh',
];
const actions = [...cycle, ...cycle];
function isParentAction(method: string): boolean {
  return (
    method.startsWith('binding') || method === 'quiet' || method === 'refresh'
  );
}
type Snapshot = {
  method: string;
  failed: boolean;
  value: string;
  local: string;
  alias: boolean;
  trace: string;
};

async function fixture(
  failing: boolean,
  target: 'app-harmony' | 'app-ios' = 'app-harmony'
) {
  const root = mkdtempSync(join(tmpdir(), 'transone-partial-props-'));
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
  const program = source(failing);
  const entry = join(root, 'src/main.ts');
  writeFileSync(entry, program);
  const screen = await analyzeNativeScreen(
    entry,
    await resolveConfig({ root, target })
  );
  const [app, leaf] = screen.program!.instances;
  const trace = screen.state.find((state) => state.key.endsWith('_trace'))!.key;
  return { root, program, screen, app, leaf, trace };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

// Core executes the original source independently of the native machines.
async function coreSnapshots(f: Fixture): Promise<Snapshot[]> {
  const restore = installDomGlobals(
    createDomWindow({ url: 'http://localhost/' })
  );
  let app: any;
  try {
    const entry = join(f.root, 'src/core.ts');
    writeFileSync(
      entry,
      f.program
        .replace(
          "from 'transone'",
          `from '${resolve(import.meta.dir, '../../transone/lib/index.ts')}'`
        )
        .replace(mountSource, 'export {App};')
    );
    const { App } = await import(entry);
    app = new App({ tick: 0 });
    app.mount(document.createElement('main'));
    flushSync();
    const leaf = [...app.childComponents][0] as any;
    let previousTrace = '';
    return actions.map((method) => {
      let failed = false;
      try {
        (isParentAction(method) ? app : leaf)[method]();
      } catch (error) {
        expect(String(error)).toContain('watch failed');
        failed = true;
      }
      flushSync();
      const trace = app.state.trace as string;
      const snapshot = {
        method,
        failed,
        value: String(leaf.props.value),
        local: String(leaf.props.local),
        alias: leaf.props.value === leaf.props.local,
        trace: trace.slice(previousTrace.length),
      };
      previousTrace = trace;
      return snapshot;
    });
  } finally {
    app?.unmount();
    flushSync();
    restore();
  }
}

function assertKeySnapshots(rows: Snapshot[], failing: boolean): void {
  // Both failing batches commit before throwing, so the second old value is 2.
  expect(rows[1]).toMatchObject({
    failed: failing,
    value: '2',
    local: failing ? 'undefined' : '9',
    trace: failing ? 'a2:1;' : 'a2:1;l9:undefined;b2:1;',
  });
  expect(rows[2]).toMatchObject({
    failed: failing,
    value: '3',
    trace: failing ? 'a3:2;' : 'a3:2;b3:2;',
  });
  expect(rows[3].trace).toBe(''); // The parent did not read its changed state.
  expect(rows[4].trace).toBe(failing ? 'lnull:undefined;' : 'lnull:9;');
  expect(rows[5]).toMatchObject({
    value: '1',
    local: 'null',
    trace: 'a1:3;b1:3;',
  });
  for (const offset of [0, cycle.length]) {
    // A real parent render restores provided keys, preserving local extras.
    expect(rows[offset + 10]).toMatchObject({
      value: '[object Object]',
      local: '[object Object]',
      alias: true,
      trace: '',
    });
    expect(rows[offset + 11]).toMatchObject({
      value: 'undefined',
      local: '[object Object]',
      alias: false,
    });
    expect(rows[offset + 12]).toMatchObject({
      value: 'undefined',
      local: 'undefined',
      trace: 'lundefined:[object Object];',
    });
    expect(rows[offset + 15]).toMatchObject({
      value: 'undefined',
      local: 'null',
    });
    expect(rows[offset + 16]).toMatchObject({ value: 'undefined', trace: '' });
    expect(rows[offset + 17]).toMatchObject({
      value: 'null',
      local: 'null',
      trace: 'anull:undefined;bnull:undefined;',
    });
    expect(rows[offset + 19].alias).toBe(true);
    // Structurally equal replacement objects must retain distinct identities.
    expect(rows[offset + 20]).toMatchObject({
      value: '[object Object]',
      local: '[object Object]',
      alias: false,
    });
    expect(rows[offset + 21]).toMatchObject({ alias: false, trace: '' });
  }
}

it.each([false, true])(
  'matches Core through partial prop cycles (failing reentry=%s)',
  async (failing) => {
    const f = await fixture(failing);
    const expected = await coreSnapshots(f);
    assertKeySnapshots(expected, failing);
    const oracle = new NativeRuntime(f.screen);
    oracle.mount();
    let previousTrace = '';
    const actual = actions.map((method): Snapshot => {
      let failed = false;
      try {
        oracle.invoke(isParentAction(method) ? f.app.id : f.leaf.id, method);
      } catch (error) {
        expect(String(error)).toContain('watch failed');
        failed = true;
      }
      const props = oracle.props(f.leaf.id);
      const trace = String(oracle.state[f.trace]);
      const row = {
        method,
        failed,
        value: String(props.value),
        local: String(props.local),
        alias: props.value === props.local,
        trace: trace.slice(previousTrace.length),
      };
      previousTrace = trace;
      return row;
    });
    expect(actual).toEqual(expected);

    const code = new Bun.Transpiler({ loader: 'ts' }).transformSync(
      nativeRuntimeSource(f.screen, 'ark')
    );
    const { TnRuntime } = new Function(code + '\nreturn {TnRuntime};')();
    const ark = new TnRuntime();
    ark.mount();
    previousTrace = '';
    const generated = actions.map((method): Snapshot => {
      let failed = false;
      try {
        ark.invoke(isParentAction(method) ? f.app.id : f.leaf.id, method, []);
      } catch (error) {
        expect(String(error)).toContain('watch failed');
        failed = true;
      }
      const value = ark.prop(f.leaf.id, 'value');
      const local = ark.prop(f.leaf.id, 'local');
      const trace = ark.string(ark.getState(f.trace)) as string;
      const row = {
        method,
        failed,
        value: ark.string(value),
        local: ark.string(local),
        alias: ark.same(value, local),
        trace: trace.slice(previousTrace.length),
      };
      previousTrace = trace;
      return row;
    });
    expect(generated).toEqual(expected);
  }
);

it.skipIf(!existsSync('/usr/bin/swift'))(
  'matches Core through Swift partial prop cycles after consecutive failing reentry',
  async () => {
    const f = await fixture(true, 'app-ios');
    const expected = await coreSnapshots(f);
    assertKeySnapshots(expected, true);
    const file = join(f.root, 'runtime.swift');
    writeFileSync(
      file,
      nativeRuntimeSource(f.screen, 'swift') +
        `
let r=TnRuntime()
try r.mount()
var previousTrace=""
for method in [${actions.map((method) => JSON.stringify(method)).join(',')}] {
  var failed=false
  let parent=method.hasPrefix("binding") || method == "quiet" || method == "refresh"
  do { _ = try r.invoke(parent ? "${f.app.id}" : "${f.leaf.id}",method,[]) } catch { failed=true }
  let value=r.prop("${f.leaf.id}","value")
  let local=r.prop("${f.leaf.id}","local")
  let trace=r.string(r.getState("${f.trace}"))
  let delta=String(trace.dropFirst(previousTrace.count))
  previousTrace=trace
  print([method,String(failed),r.string(value),r.string(local),String(r.same(value,local)),delta].joined(separator:"|"))
}
`
    );
    const run = Bun.spawnSync({
      cmd: [
        '/usr/bin/swift',
        '-module-cache-path',
        join(f.root, 'cache'),
        file,
      ],
      env: { ...process.env, CLANG_MODULE_CACHE_PATH: join(f.root, 'cache') },
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 50_000,
    });
    expect(run.exitCode, run.stderr.toString()).toBe(0);
    const actual = run.stdout
      .toString()
      .trim()
      .split('\n')
      .map((line): Snapshot => {
        const [method, failed, value, local, alias, trace] = line.split('|');
        return {
          method,
          failed: failed === 'true',
          value,
          local,
          alias: alias === 'true',
          trace,
        };
      });
    expect(actual).toEqual(expected);
  },
  60_000
);
