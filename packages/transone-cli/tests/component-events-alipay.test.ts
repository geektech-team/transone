import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from '../src/build';

// Alipay passes on-prefixed function props; its Component host has no triggerEvent.
function load(source: string) {
  let definition: Record<string, any> = {};
  new Function('Component', source)((value: typeof definition) => {
    definition = value;
  });
  const value: Record<string, any> = {
    ...definition.methods,
    data: structuredClone(definition.data),
    props: { ...definition.props },
    setData(patch: Record<string, unknown>, callback?: () => void) {
      Object.assign(this.data, patch);
      callback?.();
    },
  };
  definition.onInit?.call(value);
  definition.didMount?.call(value);
  return { value, definition };
}

describe('Alipay native custom component event callbacks', () => {
  let root: string;
  let outDir: string;
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'transone-alipay-events-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(
      join(root, 'transone.config.ts'),
      `export default {entry:'src/main.ts',outDir:'dist'};`
    );
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          paths: {
            transone: [resolve(import.meta.dir, '../../transone/lib/index.ts')],
          },
        },
      })
    );
    writeFileSync(
      join(root, 'src/Leaf.ts'),
      `import {Component,h,Emit,Bind} from 'transone';
      export class Leaf extends Component {
        initState(){return {};}initStyles(){}render(){return h('view');}
        @Emit('foo') lower(value:string){return value;}
        @Emit('Foo') upper(value:string){return value;}
        @Emit('void') voidResult(value:number,suffix:string):void{}
        @Emit('array') arrayResult(value:unknown[]){return value;}
        @Emit('object') objectResult(value:object){return value;}
        @Emit('has space') spaced(){return 4;}
        @Bind() raw():void{this.emit('raw',5,'six');}
        @Emit('returnRaw') returnRaw(value:number){return this.emit('raw',value,'tail');}
        @Bind() keys(){return Object.keys(this.props);}
      }`
    );
    writeFileSync(
      join(root, 'src/Branch.ts'),
      `import {Component,createComponent,Emit} from 'transone';import {Leaf} from './Leaf';
      export class Branch extends Component {
        initState(){return {};}initStyles(){}
        render(){return createComponent({component:Leaf,emitters:{foo:this.forward,Foo:this.forward,void:this.forward,array:this.forward,object:this.forward,'has space':this.forward,raw:this.forward,returnRaw:this.forward}});}
        @Emit('branch') forward(...args:unknown[]):void{}
      }`
    );
    writeFileSync(
      join(root, 'src/Top.ts'),
      `import {Component,createComponent,Emit} from 'transone';import {Branch} from './Branch';
      export class Top extends Component {
        initState(){return {};}initStyles(){}
        render(){return createComponent({component:Branch,emitters:{branch:this.forward}});}
        @Emit('top') forward(...args:unknown[]):void{}
      }`
    );
    writeFileSync(
      join(root, 'src/main.ts'),
      `import {Component,createApp,createComponent} from 'transone';import {Top} from './Top';
      class App extends Component {initState(){return {};}initStyles(){}render(){return createComponent(Top);}}
      createApp({root:App});`
    );
    outDir = (await build({ root, target: 'mp-alipay' })).outDir;
  });
  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });
  const read = (name: string, extension: string) =>
    readFileSync(
      join(outDir, `components/${name}/${name}.${extension}`),
      'utf8'
    );

  it('binds distinct callback props for case-sensitive event names in AXML', () => {
    const template = read('branch', 'axml');
    expect(template).toContain(
      'onTransoneEvent_0066_006f_006f="__transone_emitter_foo_0"'
    );
    expect(template).toContain(
      'onTransoneEvent_0046_006f_006f="__transone_emitter_Foo_1"'
    );
    expect(template).not.toContain('bind:');
  });

  it('forwards original arguments and single return payloads through three props-only native hosts', () => {
    const leaf = load(read('leaf', 'js'));
    const branch = load(read('branch', 'js'));
    const top = load(read('top', 'js'));
    const received: unknown[][] = [];
    const bind = (
      child: Record<string, any>,
      parent: Record<string, any>,
      template: string
    ) => {
      for (const [, prop, handler] of template.matchAll(
        /\b(onTransoneEvent(?:_[0-9a-f]{4})+)="([^"]+)"/g
      ))
        child.props[prop] = parent[handler].bind(parent);
    };
    bind(leaf.value, branch.value, read('branch', 'axml'));
    bind(branch.value, top.value, read('top', 'axml'));
    top.value.props.onTransoneEvent_0074_006f_0070 = (...args: unknown[]) => {
      received.push(args);
      return 'native callback return';
    };
    expect(leaf.value.lower('lower')).toBe('lower');
    expect(leaf.value.upper('upper')).toBe('upper');
    leaf.value.voidResult(1, 'two');
    const array = [1, 2];
    const object = { value: 3 };
    expect(leaf.value.arrayResult(array)).toBe(array);
    expect(leaf.value.objectResult(object)).toBe(object);
    expect(leaf.value.spaced()).toBe(4);
    leaf.value.raw();
    expect(leaf.value.returnRaw(8)).toBeUndefined();
    expect(received).toEqual([
      ['lower'],
      ['upper'],
      [1, 'two'],
      [[1, 2]],
      [{ value: 3 }],
      [4],
      [5, 'six'],
      [8, 'tail'],
      [8],
    ]);
    expect(received[3]![0]).toBe(array);
    expect(received[4]![0]).toBe(object);
    expect(leaf.value.keys()).toEqual([]);
    expect(typeof leaf.definition.props.onTransoneEvent_0066_006f_006f).toBe(
      'function'
    );
    delete leaf.value.props.onTransoneEvent_0066_006f_006f;
    expect(leaf.value.lower('unhandled')).toBe('unhandled');
    expect(received).toHaveLength(9);
  });
});
