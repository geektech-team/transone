import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { Platform } from 'transone/platform';
import { createComponentIndex } from '../src/components';
import { readMethodDecorators } from '../src/components/method-decorators';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture(member: string, declarations = '') {
  const source = ts.createSourceFile(
    '/fixture/emit-watch.ts',
    `import { Bind, Delay, Debounce, Emit, WatchProps } from 'transone';
${declarations}
class Example { ${member} }`,
    ts.ScriptTarget.Latest,
    true
  );
  const declaration = source.statements.find(ts.isClassDeclaration)!;
  const method = declaration.members.find(
    (node): node is ts.MethodDeclaration =>
      ts.isMethodDeclaration(node) && !!node.body
  )!;
  return { source, method };
}

function parse(member: string, declarations = '') {
  const { source, method } = fixture(member, declarations);
  return readMethodDecorators(undefined, source, method);
}

describe('Emit and WatchProps decorator parsing', () => {
  it('uses the explicit event name without changing significant spaces', () => {
    expect(
      parse(
        '@Emit(EVENT) changed(value: number) { return value * 2; }',
        "const EVENT=' value:changed ';"
      )
    ).toEqual({ bind: false, emit: { eventName: ' value:changed ' } });
  });

  it.each(['@Bind() @Emit("change")', '@Emit("change") @Bind()'])(
    'accepts bound emitters in either order: %s',
    (decorators) => {
      expect(parse(`${decorators} changed() { return { ok: true }; }`)).toEqual(
        {
          bind: true,
          emit: { eventName: 'change' },
        }
      );
    }
  );

  it.each([
    '',
    ', undefined',
    ', { immediate: undefined }',
    ', { immediate: false }',
  ])('defaults optional immediate policy for options %s', (options) => {
    expect(
      parse(
        `@WatchProps('value'${options}) changed(value: number, old?: number): void {}`
      )
    ).toEqual({ bind: false, watchProps: { key: 'value', immediate: false } });
  });

  it('folds pure watch options and keeps ordinary early void returns', () => {
    expect(
      parse(
        '@WatchProps(KEY, {immediate: IMMEDIATE}) changed(): void { const nested = () => 1; if (nested()) return; }',
        "const KEY='value'; const IMMEDIATE=true;"
      )
    ).toEqual({ bind: false, watchProps: { key: 'value', immediate: true } });
  });

  it('allows synchronous payload objects that contain promises as data', () => {
    expect(
      parse(
        '@Emit("change") changed(): { deferred: Promise<number> } { return { deferred: Promise.resolve(1) }; }'
      )
    ).toEqual({ bind: false, emit: { eventName: 'change' } });
  });

  it.each(['Promise', 'PromiseLike'])(
    'does not mistake a synchronous local %s payload type for a thenable',
    (name) => {
      expect(
        parse(
          `@Emit("change") changed(): ${name} { return { value: 1 }; }`,
          `type ${name} = { value: number };`
        )
      ).toEqual({ bind: false, emit: { eventName: 'change' } });
    }
  );

  it('does not mistake a namespace payload named Promise for a thenable', () => {
    expect(
      parse(
        '@Emit("change") changed(): Payload.Promise { return { value: 1 }; }',
        'namespace Payload { export type Promise = { value: number }; }'
      )
    ).toEqual({ bind: false, emit: { eventName: 'change' } });
  });

  it.each([
    'method():Promise<number>{return Promise.resolve(1)}',
    'method():number | PromiseLike<number>{return 1}',
  ])('leaves semantic return-type checking to the API for %s', (method) => {
    expect(parse(`@Emit("change") ${method}`)).toEqual({
      bind: false,
      emit: { eventName: 'change' },
    });
  });

  it('allows Bind with a watcher independently of decorator order', () => {
    expect(parse("@WatchProps('value') @Bind() changed(): void {}")).toEqual({
      bind: true,
      watchProps: { key: 'value', immediate: false },
    });
  });

  it('resolves aliases and namespace APIs from the framework package only', () => {
    const source = ts.createSourceFile(
      '/fixture/alias.ts',
      `
      import {Emit as Notify} from 'transone';
      import * as T from 'transone';
      class Example {
        @Notify('change') change(){return 1;}
        @T.WatchProps('value', {immediate:true}) changed():void{}
      }
    `,
      ts.ScriptTarget.Latest,
      true
    );
    const declaration = source.statements.find(ts.isClassDeclaration)!;
    const methods = declaration.members.filter(ts.isMethodDeclaration);
    expect(readMethodDecorators(undefined, source, methods[0])).toEqual({
      bind: false,
      emit: { eventName: 'change' },
    });
    expect(readMethodDecorators(undefined, source, methods[1])).toEqual({
      bind: false,
      watchProps: { key: 'value', immediate: true },
    });
  });

  it('recognizes published declaration identities through re-exports', () => {
    const root = mkdtempSync(join(tmpdir(), 'transone-emit-watch-parser-'));
    roots.push(root);
    mkdirSync(join(root, 'node_modules/transone'), { recursive: true });
    writeFileSync(
      join(root, 'node_modules/transone/package.json'),
      JSON.stringify({ name: 'transone', types: 'index.d.ts' })
    );
    writeFileSync(
      join(root, 'node_modules/transone/index.d.ts'),
      'export declare function Emit(name:string):unknown; export declare function WatchProps(key:string):unknown;'
    );
    writeFileSync(
      join(root, 'api.ts'),
      "export {Emit as Notify, WatchProps as Observe} from 'transone'; export const KEY='value';"
    );
    writeFileSync(
      join(root, 'main.ts'),
      "import {Notify, Observe, KEY} from './api'; class Example { @Notify('change') change(){return 1} @Observe(KEY) changed():void{} }"
    );
    const index = createComponentIndex({
      root,
      entrypoints: [join(root, 'main.ts')],
      platform: Platform.MiniprogramWeixin,
    });
    const source = index.sources.find((item) =>
      item.fileName.endsWith('/main.ts')
    )!;
    const methods = source.statements
      .find(ts.isClassDeclaration)!
      .members.filter(ts.isMethodDeclaration);
    expect(readMethodDecorators(index, source, methods[0])).toEqual({
      bind: false,
      emit: { eventName: 'change' },
    });
    expect(readMethodDecorators(index, source, methods[1])).toEqual({
      bind: false,
      watchProps: { key: 'value', immediate: false },
    });
  });

  it.each([
    ['@Emit()', 'method(){}', /参数数量/],
    ['@Emit("", 1)', 'method(){}', /参数数量/],
    ['@Emit("")', 'method(){}', /非空.*字符串/],
    ['@Emit("  ")', 'method(){}', /非空.*字符串/],
    ['@Emit(1)', 'method(){}', /非空.*字符串/],
    ['@WatchProps()', 'method(){}', /参数数量/],
    ['@WatchProps("")', 'method(){}', /非空.*字符串/],
    ['@WatchProps("value", true)', 'method(){}', /options/],
    ['@WatchProps("value", null)', 'method(){}', /options/],
    ['@WatchProps("value", [])', 'method(){}', /options/],
    [
      '@WatchProps("value", {get immediate(){return true}})',
      'method(){}',
      /options/,
    ],
    ['@WatchProps("value", {deep:true})', 'method(){}', /immediate/],
    ['@WatchProps("value", {immediate:1})', 'method(){}', /boolean|布尔/],
    [
      '@WatchProps("value", {immediate:true,immediate:false})',
      'method(){}',
      /重复/,
    ],
    ['@Emit("change") @Emit("other")', 'method(){}', /重复/],
    ['@WatchProps("value") @WatchProps("other")', 'method(){}', /重复/],
    ['@Emit("change") @WatchProps("value")', 'method(){}', /组合/],
    ['@WatchProps("value") @Emit("change")', 'method(){}', /组合/],
    ['@Emit("change") @Delay(1)', 'method(){}', /组合/],
    ['@Delay(1) @Emit("change")', 'method(){}', /组合/],
    ['@WatchProps("value") @Debounce(1)', 'method(){}', /组合/],
    ['@Debounce(1) @WatchProps("value")', 'method(){}', /组合/],
    ['@Emit("change")', 'async method(){}', /async|异步/],
    ['@Emit("change")', '*method(){yield 1}', /generator/],
    ['@WatchProps("value")', 'async method(){}', /async|异步/],
    ['@WatchProps("value")', 'method():number{return 1}', /void|返回/],
    ['@WatchProps("value")', 'method(){return 1}', /void|返回/],
    ['@Emit("change")', 'static method(){}', /static|静态/],
    ['@WatchProps("value")', '#method(){}', /private|私有/],
    ['@WatchProps("value")', 'onPropsChange(){}', /生命周期/],
  ] as const)('diagnoses %s on %s', (decorators, method, error) => {
    const { source, method: target } = fixture(`${decorators} ${method}`);
    expect(() => readMethodDecorators(undefined, source, target)).toThrow(
      error
    );
    expect(() => readMethodDecorators(undefined, source, target)).toThrow(
      /emit-watch\.ts:\d+:\d+/
    );
  });

  it.each(['@Emit("change")', '@WatchProps("value")'])(
    'rejects overloaded %s methods',
    (decorators) => {
      expect(() =>
        parse(
          `method(value: number): void; ${decorators} method(value: unknown): void {}`
        )
      ).toThrow(/重载|overload/);
    }
  );

  it('does not execute calls while evaluating decorator arguments', () => {
    let calls = 0;
    (globalThis as Record<string, unknown>).__transoneDecoratorProbe = () => {
      calls++;
      return 'change';
    };
    try {
      expect(() =>
        parse('@Emit(globalThis.__transoneDecoratorProbe()) method(){}')
      ).toThrow(/纯静态值/);
      expect(calls).toBe(0);
    } finally {
      delete (globalThis as Record<string, unknown>).__transoneDecoratorProbe;
    }
  });

  it('rejects a same-named local implementation instead of dropping its behavior', () => {
    const source = ts.createSourceFile(
      '/fixture/local.ts',
      'function Emit(){return ()=>{}} class Example { @Emit() method(){} }',
      ts.ScriptTarget.Latest,
      true
    );
    const method = source.statements
      .find(ts.isClassDeclaration)!
      .members.find(ts.isMethodDeclaration)!;
    expect(() => readMethodDecorators(undefined, source, method)).toThrow(
      /未知|不支持的方法装饰器/
    );
  });
});
