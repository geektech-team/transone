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
import { analyzeNativeScreen } from '../src/app/analyze';
import { resolveConfig } from '../src/config';
import { build } from '../src/build';

const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true }))
);
function fixture(decorators = '', extra = ''): string {
  const root = mkdtempSync(join(tmpdir(), 'transone-method-app-'));
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
  writeFileSync(join(root, 'src/main.ts'), source(decorators, extra));
  return root;
}
function source(decorators: string, extra: string): string {
  return `import {BaseComponent,h,Bind,Delay,Debounce} from 'transone';
  export class App extends BaseComponent {
    initState(){return {count:0};} initStyles(){}
    ${decorators} increment(){this.state.count+=1;}
    ${extra}
    render(){return h('main',{},[h('button',{},['+'],{click:()=>this.increment()})]);}
  }`;
}
it.each(['app-ios', 'app-android', 'app-harmony'] as const)(
  'consumes Bind without altering native %s actions',
  async (target) => {
    const root = fixture('@Bind()');
    const config = await resolveConfig({ root, target });
    const screen = await analyzeNativeScreen(join(root, 'src/main.ts'), config);
    expect(
      screen.root.kind === 'container' && screen.root.children[0]
    ).toMatchObject({ kind: 'button', action: { kind: 'increment', by: 1 } });
  }
);
it.each(['Delay(10)', 'Debounce(10)'])(
  'rejects unsupported native @%s with source position and keeps previous output',
  async (decorator) => {
    const root = fixture();
    const result = await build({ root, target: 'app-ios' });
    const output = result.assetsBuilt.find((path) =>
      path.endsWith('ContentView.swift')
    )!;
    const before = readFileSync(output, 'utf8');
    writeFileSync(join(root, 'src/main.ts'), source(`@${decorator}`, ''));
    await expect(build({ root, target: 'app-ios' })).rejects.toThrow(
      /main\.ts:\s*\d+:\d+.*(?:App|原生).*(?:Delay|Debounce|调度)/
    );
    expect(readFileSync(output, 'utf8')).toBe(before);
  }
);
it.each([
  ['unknown method decorator', '@Other()', '', /未知|不支持.*装饰器/],
  ['decorated uncalled method', '', '@Delay(1) unused(){}', /App|原生/],
  ['decorated lifecycle', '', '@Bind() onMounted(){}', /生命周期|onMounted/],
  [
    'decorated accessor',
    '',
    '@Bind() get value(){return 1}',
    /方法|accessor|访问器/,
  ],
  ['decorated field', '', '@Bind() value=1;', /方法|字段/],
  ['decorated static method', '', '@Bind() static helper(){}', /static|静态/],
] as const)(
  'diagnoses %s in a selected native class',
  async (_label, decorator, extra, error) => {
    const root = fixture(decorator, extra);
    const config = await resolveConfig({ root, target: 'app-ios' });
    await expect(
      analyzeNativeScreen(join(root, 'src/main.ts'), config)
    ).rejects.toThrow(error);
  }
);

it.each(['@Delay(1)', '@Debounce(1)', '@Unknown()'])(
  'diagnoses %s in the legacy standalone native path',
  async (decorator) => {
    const root = fixture();
    writeFileSync(
      join(root, 'src/main.ts'),
      `import {Bind,Delay,Debounce} from 'transone';
    export class App {
      initState(){return {count:0};}
      ${decorator} increment(){this.state.count+=1;}
      render(){return {tag:'main',children:[{tag:'button',children:['+'],listeners:{click:()=>this.increment()}}]};}
    }`
    );
    await expect(
      analyzeNativeScreen(join(root, 'src/main.ts'))
    ).rejects.toThrow(/main\.ts:\s*\d+:\d+.*(?:装饰器|App|原生)/);
  }
);

it('consumes Bind in the legacy standalone native path', async () => {
  const root = fixture();
  writeFileSync(
    join(root, 'src/main.ts'),
    `import {Bind} from 'transone';
  export class App {
    initState(){return {count:0};}
    @Bind() increment(){this.state.count+=1;}
    render(){return {tag:'main',children:[{tag:'button',children:['+'],listeners:{click:()=>this.increment()}}]};}
  }`
  );
  const screen = await analyzeNativeScreen(join(root, 'src/main.ts'));
  expect(
    screen.root.kind === 'container' && screen.root.children[0]
  ).toMatchObject({ kind: 'button', action: { kind: 'increment', by: 1 } });
});
