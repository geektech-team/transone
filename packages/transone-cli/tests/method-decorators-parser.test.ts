import { afterEach, describe, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';
import { Platform } from 'transone/platform';
import { createComponentIndex } from '../src/components';
import {
  readMethodDecorators,
  validateMethodDecoratorTargets,
} from '../src/components/method-decorators';
const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true }))
);
function standalone(text: string) {
  const source = ts.createSourceFile(
    '/fixture/component.ts',
    text,
    ts.ScriptTarget.Latest,
    true
  );
  const component = source.statements.find(ts.isClassDeclaration)!;
  return {
    source,
    component,
    method: component.members.find(ts.isMethodDeclaration)!,
  };
}
function parse(text: string) {
  const { source, method } = standalone(text);
  return readMethodDecorators(undefined, source, method);
}
function indexed(
  text: string,
  files: Record<string, string> = {},
  declarationPackage?: string
) {
  const root = mkdtempSync(join(tmpdir(), 'transone-method-parser-'));
  roots.push(root);
  mkdirSync(join(root, 'node_modules'));
  if (declarationPackage) {
    mkdirSync(join(root, 'node_modules/transone'));
    writeFileSync(
      join(root, 'node_modules/transone/package.json'),
      JSON.stringify({ name: 'transone', types: 'index.d.ts' })
    );
    writeFileSync(
      join(root, 'node_modules/transone/index.d.ts'),
      declarationPackage
    );
  } else
    symlinkSync(
      resolve(import.meta.dir, '../../transone'),
      join(root, 'node_modules/transone'),
      'dir'
    );
  if (!declarationPackage)
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
  for (const [name, content] of Object.entries({
    'src/main.ts': text,
    ...files,
  })) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  const index = createComponentIndex({
    root,
    entrypoints: [join(root, 'src/main.ts')],
    platform: Platform.MiniprogramWeixin,
  });
  const source = index.sources.find((s) =>
    s.fileName.endsWith('/src/main.ts')
  )!;
  const component = source.statements.find(ts.isClassDeclaration)!;
  return {
    index,
    source,
    component,
    method: component.members.find(ts.isMethodDeclaration)!,
  };
}
describe('shared component method decorator parsing', () => {
  it('leaves undecorated methods alone', () =>
    expect(parse('class Test { method(){return 4} }')).toBeUndefined());
  it.each([
    [
      '@Bound() @Later(10)',
      {
        bind: true,
        schedule: { kind: 'delay', milliseconds: 10, replace: false },
      },
    ],
    [
      '@Later(0,{replace:true}) @Bound()',
      {
        bind: true,
        schedule: { kind: 'delay', milliseconds: 0, replace: true },
      },
    ],
    [
      '@Debounce(5)',
      {
        bind: false,
        schedule: { kind: 'debounce', milliseconds: 5, replace: true },
      },
    ],
  ] as const)(
    'normalizes %s from standalone import aliases',
    (decorator, want) => {
      expect(
        parse(
          `import {Bind as Bound,Delay as Later,Debounce} from 'transone';class Test{${decorator} method():void{}}`
        )
      ).toEqual(want);
    }
  );
  it('recognizes namespace imports and folds local constants without executing code', () => {
    expect(
      parse(
        `import * as T from 'transone';const MS=2*5;class Test{@T.Delay(MS,{replace:false}) method(){if(true)return;}}`
      )
    ).toEqual({
      bind: false,
      schedule: { kind: 'delay', milliseconds: 10, replace: false },
    });
  });
  it('resolves re-exported framework identities and imported duration constants', () => {
    const data = indexed(
      `import {Bound,Later} from './api';import * as C from './constants';class Test{@Bound() @Later(C.MS) method(){}}`,
      {
        'src/api.ts': `export {Bind as Bound,Delay as Later} from 'transone';`,
        'src/constants.ts': 'export const MS=2*6;',
      }
    );
    expect(readMethodDecorators(data.index, data.source, data.method)).toEqual({
      bind: true,
      schedule: { kind: 'delay', milliseconds: 12, replace: false },
    });
  });
  it('does not identify same named local decorators as framework APIs', () => {
    const data = indexed(
      'function Bind(){return ()=>{}}class Test{@Bind() method(){}}'
    );
    expect(() =>
      readMethodDecorators(data.index, data.source, data.method)
    ).toThrow(/未知|不支持.*装饰器/);
  });
  it('retains symbol identity through declaration-only package re-exports', () => {
    const data = indexed(
      `import {Bound} from './api';class Test{@Bound() method(){}}`,
      {
        'src/api.ts': `export {Bind as Bound} from 'transone';`,
      },
      'export declare function Bind(): unknown;'
    );
    expect(readMethodDecorators(data.index, data.source, data.method)).toEqual({
      bind: true,
    });
  });
  it('recognizes decorator variables in bundled package declarations', () => {
    const data = indexed(
      `import {Bind as Bound} from 'transone';class Test{@Bound() method(){}}`,
      {},
      'export declare const Bind: () => unknown;'
    );
    expect(readMethodDecorators(data.index, data.source, data.method)).toEqual({
      bind: true,
    });
  });
  it('recognizes a directly imported namespace with the component index', () => {
    const data = indexed(
      `import * as T from 'transone';class Test{@T.Delay(7) method(){}}`,
      {},
      'export declare function Delay(ms:number): unknown;'
    );
    expect(readMethodDecorators(data.index, data.source, data.method)).toEqual({
      bind: false,
      schedule: { kind: 'delay', milliseconds: 7, replace: false },
    });
  });
  it('allows TypeScript private and protected methods', () => {
    expect(
      parse(
        `import {Bind} from 'transone';class Test{@Bind() protected method(){return 1}}`
      )
    ).toEqual({ bind: true });
    expect(
      parse(
        `import {Bind} from 'transone';class Test{@Bind() private method(){return 1}}`
      )
    ).toEqual({ bind: true });
  });
  it.each(['undefined', '{replace:undefined}'])(
    'uses the default Delay policy for optional options %s',
    (options) => {
      expect(
        parse(
          `import {Delay} from 'transone';class Test{@Delay(1,${options}) method(){}}`
        )
      ).toEqual({
        bind: false,
        schedule: { kind: 'delay', milliseconds: 1, replace: false },
      });
    }
  );
  it('does not identify a shadowed direct-import alias without an index', () => {
    const source = ts.createSourceFile(
      '/fixture/component.ts',
      `import {Bind} from 'transone';function outer(){const Bind=()=>()=>{};class Test{@Bind() method(){}}}`,
      ts.ScriptTarget.Latest,
      true
    );
    let method: ts.MethodDeclaration | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isMethodDeclaration(node)) method = node;
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(() => readMethodDecorators(undefined, source, method!)).toThrow(
      /未知|不支持.*装饰器/
    );
  });
  it.each([
    ['@Delay(-1)', 'method(){}', /有限|非负|duration|milliseconds/],
    ['@Delay(Infinity)', 'method(){}', /常量|有限|静态/],
    ['@Delay(0\/0)', 'method(){}', /有限|静态|表达式/],
    ['@Delay(calculate())', 'method(){}', /静态|表达式/],
    ['@Delay("2")', 'method(){}', /数字|number/],
    ['@Delay(1,{leading:true})', 'method(){}', /replace|options/],
    ['@Delay(1,{replace:1})', 'method(){}', /boolean|布尔/],
    ['@Delay(1,{replace:true,replace:false})', 'method(){}', /重复|duplicate/],
    ['@Bind(1)', 'method(){}', /参数|argument/],
    ['@Delay()', 'method(){}', /参数|argument/],
    ['@Debounce(1,{replace:false})', 'method(){}', /参数|argument/],
    ['@Bind() @Bind()', 'method(){}', /重复|duplicate/],
    ['@Delay(1) @Debounce(1)', 'method(){}', /重复|调度|schedule/],
    ['@Bind()', 'static method(){}', /static|静态/],
    ['@Bind()', '#method(){}', /private|私有/],
    ['@Bind()', 'render(){}', /生命周期|render/],
    ['@Bind()', 'onMounted(){}', /生命周期|onMounted/],
    ['@Bind()', 'onLoad(){}', /生命周期|onLoad/],
    ['@Delay(1)', 'onPageScroll(){}', /生命周期|onPageScroll/],
    ['@Bind()', 'attached(){}', /生命周期|attached/],
    ['@Delay(1)', 'async method(){}', /async|异步/],
    ['@Delay(1)', 'method():number{return 1}', /void|返回/],
    ['@Delay(1)', 'method(){return 1}', /void|返回/],
    ['@Delay(1)', 'method():void{return calculate()}', /void|返回/],
  ] as const)('rejects %s on %s', (decorator, method, error) => {
    expect(() =>
      parse(
        `import {Bind,Delay,Debounce} from 'transone';class Test{${decorator} ${method}}`
      )
    ).toThrow(error);
  });
  it.each(['@Bind() value=1;', '@Bind() get value(){return 1}'])(
    'rejects non-method decoration %s',
    (member) => {
      const { source, component } = standalone(
        `import {Bind} from 'transone';class Test{${member}}`
      );
      expect(() =>
        validateMethodDecoratorTargets(undefined, source, component)
      ).toThrow(/方法|method/);
    }
  );
  it('allows early void returns and ignores returns from nested functions', () => {
    expect(
      parse(
        `import {Delay} from 'transone';class Test{@Delay(1) method():void {const fn=()=>{return 5};if(fn())return;}}`
      )
    ).toEqual({
      bind: false,
      schedule: { kind: 'delay', milliseconds: 1, replace: false },
    });
  });
  it.each(['Delay(1)', 'Debounce(1)'])(
    'rejects overload signatures for scheduled @%s methods',
    (decorator) => {
      const { source, component } =
        standalone(`import {Delay,Debounce} from 'transone';
      class Test {
        method(value:number):void;
        method(value:string):void;
        @${decorator} method(value:unknown):void {}
      }`);
      const method = component.members.find(
        (member): member is ts.MethodDeclaration =>
          ts.isMethodDeclaration(member) && !!member.body
      )!;
      expect(() => readMethodDecorators(undefined, source, method)).toThrow(
        /重载|overload/
      );
    }
  );
  it('preserves overloaded Bind methods', () => {
    const { source, component } = standalone(`import {Bind} from 'transone';
    class Test {
      method(value:number):number;
      method(value:string):string;
      @Bind() method(value:number|string):number|string {return value;}
    }`);
    const method = component.members.find(
      (member): member is ts.MethodDeclaration =>
        ts.isMethodDeclaration(member) && !!member.body
    )!;
    expect(readMethodDecorators(undefined, source, method)).toEqual({
      bind: true,
    });
  });
  it.each(["'method'", "['method']"])(
    'recognizes an overload signature with the same static key %s',
    (key) => {
      const { source, component } =
        standalone(`import {Delay} from 'transone';class Test {
        ${key}(value:number):void;
        @Delay(1) method(value:unknown):void {}
      }`);
      const method = component.members.find(
        (member): member is ts.MethodDeclaration =>
          ts.isMethodDeclaration(member) && !!member.body
      )!;
      expect(() => readMethodDecorators(undefined, source, method)).toThrow(
        /重载|overload/
      );
    }
  );
  it('distinguishes unrelated static overloads from a scheduled instance method', () => {
    const { source, component } =
      standalone(`import {Delay} from 'transone';class Test {
      static method(value:number):void;
      static method(value:unknown):void {}
      @Delay(1) method():void {}
    }`);
    const method = component.members.find(
      (member): member is ts.MethodDeclaration =>
        ts.isMethodDeclaration(member) && !!ts.getDecorators(member)?.length
    )!;
    expect(readMethodDecorators(undefined, source, method)).toEqual({
      bind: false,
      schedule: { kind: 'delay', milliseconds: 1, replace: false },
    });
  });
});
