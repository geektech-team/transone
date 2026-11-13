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
import { build } from '../src/build';
import { resolveConfig } from '../src/config';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function source(decorator = '', inherited = false): string {
  return `import {BaseComponent,createApp,h,Emit,WatchProps} from 'transone';
    class Parent extends BaseComponent {
      initState(){return {count:0};} initStyles(){}
      ${inherited ? decorator : ''} unused(){}
      increment(){this.state.count+=1;}
      render(){return h('main',{},[h('button',{},['+'],{click:()=>this.increment()})]);}
    }
    export class App extends Parent { ${inherited ? '' : `${decorator} unused(){}`} }
    createApp({root:App}).mount();`;
}
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'transone-emit-watch-app-'));
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
  writeFileSync(join(root, 'src/main.ts'), source());
  return root;
}

it.each(['app-ios', 'app-android', 'app-harmony'] as const)(
  'keeps native %s output when decorated methods contain unsupported expressions',
  async (target) => {
    const root = fixture();
    const before = await build({ root, target });
    const output = before.assetsBuilt.find((path) =>
      /(?:ContentView\.swift|MainActivity\.kt|Index\.ets)$/.test(path)
    )!;
    expect(output).toBeDefined();
    const previous = readFileSync(output, 'utf8');
    for (const decorator of [
      '@Emit("change")',
      '@WatchProps("value")',
    ] as const) {
      writeFileSync(
        join(root, 'src/main.ts'),
        source(decorator).replace(/unused\(\)\{\}/g, 'unused(){Date.now();}')
      );
      await expect(build({ root, target })).rejects.toThrow(
        /main\.ts:\s*\d+:\d+.*原生表达式/
      );
      expect(readFileSync(output, 'utf8')).toBe(previous);
    }
  }
);

it.each(['@Emit("change")', '@WatchProps("value")'])(
  'honors effective overrides for inherited uncalled methods decorated with %s',
  async (decorator) => {
    const root = fixture();
    writeFileSync(
      join(root, 'src/main.ts'),
      source(decorator, true).replace(
        'extends Parent {',
        'extends Parent { unused(){}'
      )
    );
    const config = await resolveConfig({ root, target: 'app-ios' });
    const screen = await analyzeNativeScreen(join(root, 'src/main.ts'), config);
    expect(screen.program?.instances).toHaveLength(1);
    expect(screen.program!.instances[0].watchers).toEqual([]);
    expect(screen.program!.instances[0].methods.unused).toBeUndefined();
  }
);

it.each(['@Emit("change")', '@WatchProps("value")'])(
  'keeps the standalone native analyzer from erasing %s',
  async (decorator) => {
    const root = fixture();
    writeFileSync(
      join(root, 'src/main.ts'),
      `import {Emit,WatchProps} from 'transone';
      export class App {
        initState(){return {count:0};}
        ${decorator} unused(){}
        increment(){this.state.count+=1;}
        render(){return {tag:'main',children:[{tag:'button',children:['+'],listeners:{click:()=>this.increment()}}]};}
      }`
    );
    await expect(
      analyzeNativeScreen(join(root, 'src/main.ts'))
    ).rejects.toThrow(
      /main\.ts:\s*\d+:\d+.*传统独立类分析不支持 (?:Emit|WatchProps)/
    );
  }
);
