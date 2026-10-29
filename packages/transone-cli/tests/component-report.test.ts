import { afterEach, describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import * as publicApi from '../src';
import { parseCliArgs } from '../src/cli';

const roots: string[] = [];
const framework = resolve(import.meta.dir, '../../transone/lib/index.ts');
function project(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'transone-report-')));
  roots.push(root);
  for (const [name, content] of Object.entries({
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        paths: {
          transone: [framework],
          'transone/platform': [
            resolve(dirname(framework), 'platform/index.ts'),
          ],
        },
      },
    }),
    ...files,
  })) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  return root;
}
const source = `import { BaseComponent } from 'transone';
export class Card extends BaseComponent { initState(){return {}} initStyles(){} render(){return {}} }
export class Plain extends BaseComponent { initState(){return {}} initStyles(){} render(){return {}} }
export abstract class Unused extends BaseComponent { initState(){return {}} initStyles(){} }
export class Ordinary {}`;
const variants = {
  'src/main.ts': source,
  'src/family.ts': `import {Miniprogram, Web} from 'transone'; import {Card} from './main';
@Miniprogram() export class MiniCard extends Card {}
@Web() export class WebOnly extends Card {}`,
  'src/exact.ts': `import {MiniprogramWeixin, Web, BaseComponent} from 'transone'; import {Card} from './main';
@MiniprogramWeixin() export class WeixinCard extends Card {}
@Web() export class ExplicitOnly extends BaseComponent { initState(){return {}} initStyles(){} render(){return {}} }`,
};
afterEach(() => {
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe('component selection report', () => {
  it('reports normalized exact, family, base and missing decisions with portable source locations', async () => {
    const root = project(variants);
    const report = await publicApi.reportComponents({
      root,
      target: 'mp-weixin',
    });
    expect(report).toMatchObject({
      platform: 'miniprogram-weixin',
      scope: 'discovered-logical-components',
      components: [
        {
          component: {
            source: 'src/main.ts',
            className: 'Card',
            line: 2,
            column: 1,
          },
          implementation: { source: 'src/exact.ts', className: 'WeixinCard' },
          reason: 'exact',
        },
        {
          component: { className: 'Plain' },
          implementation: { className: 'Plain' },
          reason: 'base',
        },
        {
          component: { className: 'Unused' },
          implementation: null,
          reason: 'missing',
        },
      ],
    });
    const family = await publicApi.reportComponents({
      root,
      target: 'miniprogram-alipay',
    });
    expect(family.components[0]).toMatchObject({
      implementation: { className: 'MiniCard' },
      reason: 'family',
    });
    const base = await publicApi.reportComponents({ root, target: 'app-ios' });
    expect(base.components[0]).toMatchObject({
      implementation: { className: 'Card' },
      reason: 'base',
    });
    expect(report.components[0].candidates).toEqual([
      {
        source: 'src/exact.ts',
        className: 'WeixinCard',
        line: 2,
        column: 1,
        platforms: [publicApi.Platform.MiniprogramWeixin],
      },
      {
        source: 'src/family.ts',
        className: 'MiniCard',
        line: 2,
        column: 1,
        platforms: ['miniprogram'],
      },
      {
        source: 'src/family.ts',
        className: 'WebOnly',
        line: 3,
        column: 1,
        platforms: ['web'],
      },
    ]);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    expect(JSON.stringify(report)).not.toContain(root);
  });

  it('rejects same-priority conflicts through the shared matcher', async () => {
    const root = project({
      'src/main.ts': `${source}\nimport {WebMobile} from 'transone';
@WebMobile() export class First extends Card {}
@WebMobile() export class Second extends Card {}`,
    });
    await expect(
      publicApi.reportComponents({ root, target: 'web-mobile' })
    ).rejects.toThrow(/Conflicting implementations.*Card/);
  });

  it('reads sources without evaluating component modules or changing existing build output', async () => {
    const root = project({ 'src/main.ts': source });
    const marker = join(root, 'executed');
    writeFileSync(
      join(root, 'src/main.ts'),
      `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'executed'); throw new Error('user module executed');\n${source}`
    );
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist/keep.txt'), 'unchanged');
    const report = await publicApi.reportComponents({ root });
    expect(report.components).toHaveLength(3);
    expect(existsSync(marker)).toBe(false);
    expect(readFileSync(join(root, 'dist/keep.txt'), 'utf8')).toBe('unchanged');
    expect(existsSync(join(root, 'dist/build'))).toBe(false);
  });

  it('honors the resolved target pages and explicit include/exclude scan configuration', async () => {
    const root = project({
      'src/main.ts': 'export const unusedEntry = true;',
      'pages/native.ts': source,
      'variants/native.ts': `import {App} from 'transone'; import {Card} from '../pages/native'; @App() export class AppCard extends Card {}`,
      'variants/ignored.ts': `import {App} from 'transone'; import {Card} from '../pages/native'; @App() export class Ignored extends Card {}`,
    });
    const report = await publicApi.reportComponents({
      root,
      config: {
        target: 'app-android',
        app: { pages: { '/': 'pages/native.ts' } },
        components: {
          include: ['variants/**/*.ts'],
          exclude: ['variants/ignored.ts'],
        },
      },
    });
    expect(report).toMatchObject({
      platform: 'app-android',
      components: [
        {
          entrypoints: ['pages/native.ts'],
          component: { source: 'pages/native.ts', className: 'Card' },
          implementation: {
            source: 'variants/native.ts',
            className: 'AppCard',
          },
          reason: 'family',
        },
        { component: { className: 'Plain' }, reason: 'base' },
        { component: { className: 'Unused' }, reason: 'missing' },
      ],
    });
  });

  it('reports Web mappings in each page entry context instead of borrowing another page implementation', async () => {
    const root = project({
      'pages/home.ts': `import {Component, Div, createApp, createComponent} from 'transone';
export class Card extends Component {initState(){return {}} initStyles(){} render(){return Div({children:['home-base-marker']})}}
export const app = createApp({document:{body:createComponent(Card)}});`,
      'pages/other.ts': `import {Web, Div, createApp, createComponent} from 'transone'; import {Card} from './home';
@Web() export class WebCard extends Card {render(){return Div({children:['other-web-marker']})}}
export const app = createApp({document:{body:createComponent(Card)}});`,
    });
    const options = {
      root,
      config: { entry: 'pages/home.ts', pages: { '/other': 'pages/other.ts' } },
    };
    const build = await publicApi.build(options);
    expect(readFileSync(join(build.outDir, 'index.html'), 'utf8')).toContain(
      'home-base-marker'
    );
    expect(readFileSync(join(build.outDir, 'other.html'), 'utf8')).toContain(
      'other-web-marker'
    );
    const report = await publicApi.reportComponents(options);
    expect(report.components).toMatchObject([
      {
        entrypoints: ['pages/home.ts'],
        component: { source: 'pages/home.ts', className: 'Card' },
        implementation: { source: 'pages/home.ts', className: 'Card' },
        reason: 'base',
        candidates: [],
      },
      {
        entrypoints: ['pages/other.ts'],
        component: { source: 'pages/home.ts', className: 'Card' },
        implementation: { source: 'pages/other.ts', className: 'WebCard' },
        reason: 'exact',
      },
    ]);
    const output = publicApi.formatComponentSelectionReport(report);
    expect(output).toContain('Entrypoints: pages/home.ts');
    expect(output).toContain('Entrypoints: pages/other.ts');
  }, 20_000);

  it('allows different Web implementations in independent page entry contexts without a spurious conflict', async () => {
    const root = project({
      'shared/card.ts': `import {Component, Div} from 'transone';
export class Card extends Component {initState(){return {}} initStyles(){} render(){return Div({children:['base-marker']})}}`,
      'pages/home.ts': `import {Web, Div, createApp, createComponent} from 'transone'; import {Card} from '../shared/card';
@Web() export class HomeCard extends Card {render(){return Div({children:['home-web-marker']})}}
export const app = createApp({document:{body:createComponent(Card)}});`,
      'pages/other.ts': `import {Web, Div, createApp, createComponent} from 'transone'; import {Card} from '../shared/card';
@Web() export class OtherCard extends Card {render(){return Div({children:['other-web-marker']})}}
export const app = createApp({document:{body:createComponent(Card)}});`,
    });
    const options = {
      root,
      config: { entry: 'pages/home.ts', pages: { '/other': 'pages/other.ts' } },
    };
    const build = await publicApi.build(options);
    expect(readFileSync(join(build.outDir, 'index.html'), 'utf8')).toContain(
      'home-web-marker'
    );
    expect(readFileSync(join(build.outDir, 'other.html'), 'utf8')).toContain(
      'other-web-marker'
    );
    const report = await publicApi.reportComponents(options);
    expect(report.components).toMatchObject([
      {
        entrypoints: ['pages/home.ts'],
        component: { source: 'shared/card.ts', className: 'Card' },
        implementation: { source: 'pages/home.ts', className: 'HomeCard' },
        reason: 'exact',
      },
      {
        entrypoints: ['pages/other.ts'],
        component: { source: 'shared/card.ts', className: 'Card' },
        implementation: { source: 'pages/other.ts', className: 'OtherCard' },
        reason: 'exact',
      },
    ]);
  }, 20_000);

  it('retains the shared MiniProgram page index and records all of its entrypoints', async () => {
    const root = project({
      'shared/card.ts': `import {BaseComponent, h} from 'transone';
export class Card extends BaseComponent {render(){return h('p', {}, ['base'])}}`,
      'pages/home.ts': `import {createApp} from 'transone'; import {Card} from '../shared/card'; export const app=createApp({root:Card});`,
      'pages/other.ts': `import {Miniprogram, h, createApp} from 'transone'; import {Card} from '../shared/card';
@Miniprogram() export class MiniCard extends Card {render(){return h('p', {}, ['shared-mini'])}}
export const app=createApp({root:Card});`,
    });
    const report = await publicApi.reportComponents({
      root,
      target: 'mp-weixin',
      config: {
        entry: 'pages/home.ts',
        mp: { pages: { '/': 'pages/home.ts', '/other': 'pages/other.ts' } },
      },
    });
    expect(report.components).toMatchObject([
      {
        entrypoints: ['pages/home.ts', 'pages/other.ts'],
        component: { source: 'shared/card.ts', className: 'Card' },
        implementation: { source: 'pages/other.ts', className: 'MiniCard' },
        reason: 'family',
      },
    ]);
  });

  it('renders a scope warning and useful human mapping and candidate details', async () => {
    const root = project(variants);
    const report = await publicApi.reportComponents({
      root,
      target: 'mp-weixin',
    });
    const output = publicApi.formatComponentSelectionReport(report);
    expect(output).toContain('miniprogram-weixin');
    expect(output).toMatch(/discovered logical component mappings/i);
    expect(output).toMatch(/runtime constructor usage.*not analyzed/i);
    expect(output).toContain(
      'Card (src/main.ts:2:1) -> WeixinCard (src/exact.ts:2:1) [exact]'
    );
    expect(output).toContain('Unused (src/main.ts:4:1) -> (missing) [missing]');
    expect(output).toContain('MiniCard (src/family.ts:2:1)');
  });
});

describe('CLI component report flag', () => {
  it('opts build into component reports without changing default build arguments or target aliases', () => {
    expect(
      parseCliArgs(['build', '--report-components', '--target=mp-weixin'])
    ).toEqual({
      command: 'build',
      reportComponents: true,
      target: 'mp-weixin',
    });
    expect(parseCliArgs(['build'])).toEqual({ command: 'build' });
  });
  it.each(
    [
      ['dev', '--report-components'],
      ['create', '--report-components'],
      ['build', '--report-components', '--library'],
      ['build', '--report-components=false'],
      ['build', '--report-components', '--report-components'],
      ['build', '--report-components', '--target=app'],
      ['build', '--report-components', '--target=miniprogram'],
    ].map((argv) => ({ argv }))
  )('rejects incompatible or invalid report arguments: %j', ({ argv }) => {
    expect(() => parseCliArgs(argv)).toThrow();
  });

  it('prints the report before building and leaves normal build output unchanged', async () => {
    const root = project({
      'src/main.ts': `import {BaseComponent, createApp, h} from 'transone';
export class Card extends BaseComponent {render(){return h('p', {}, ['base']);}}
export const app = createApp({root: Card});`,
      'src/mini.ts': `import {Miniprogram, h} from 'transone'; import {Card} from './main';
@Miniprogram() export class MiniCard extends Card {render(){return h('p', {}, ['chosen']);}}`,
    });
    const cliPath = resolve(import.meta.dir, '../src/cli.ts');
    const run = async (args: string[]) => {
      const child = Bun.spawn(
        [
          process.execPath,
          '--eval',
          `import {runCli} from ${JSON.stringify(cliPath)}; await runCli(${JSON.stringify(args)});`,
        ],
        { cwd: root, stdout: 'pipe', stderr: 'pipe' }
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
      return stdout;
    };
    const reported = await run([
      'build',
      '--target=mp-weixin',
      '--report-components',
    ]);
    expect(reported).toContain(
      'TransOne component selection: miniprogram-weixin'
    );
    expect(reported).toContain(
      'Card (src/main.ts:2:1) -> MiniCard (src/mini.ts:2:1) [family]'
    );
    expect(reported.indexOf('TransOne build completed:')).toBeGreaterThan(
      reported.indexOf('[family]')
    );
    expect(
      readFileSync(
        join(root, 'dist/build/mp-weixin/pages/index/index.wxml'),
        'utf8'
      )
    ).toContain('chosen');
    const normal = await run(['build', '--target=mp-weixin']);
    expect(normal).toContain('TransOne build completed:');
    expect(normal).not.toContain('component selection');
  });

  it('shares one resolved target and component scan snapshot between report and build', async () => {
    const root = project({
      'src/main.ts': `import {BaseComponent, createApp, h} from 'transone';
export class Card extends BaseComponent {render(){return h('p', {}, ['base']);}}
export const app = createApp({root: Card});`,
      'variants/first.ts': `import {Miniprogram, h} from 'transone'; import {Card} from '../src/main';
@Miniprogram() export class FirstCard extends Card {render(){return h('p', {}, ['first-snapshot']);}}`,
      'variants/second.ts': `import {Miniprogram, h} from 'transone'; import {Card} from '../src/main';
@Miniprogram() export class SecondCard extends Card {render(){return h('p', {}, ['second-snapshot']);}}`,
    });
    const reread = join(root, 'config-reread');
    writeFileSync(
      join(root, 'transone.config.ts'),
      `import {writeFileSync} from 'node:fs';
export default {
  get target() { return globalThis.__componentReportPrinted ? 'mp-alipay' : 'mp-weixin'; },
  get components() {
    if (globalThis.__componentReportPrinted) writeFileSync(${JSON.stringify(reread)}, 'reread');
    return {include: [globalThis.__componentReportPrinted ? 'variants/second.ts' : 'variants/first.ts']};
  }
};`
    );
    const cliPath = resolve(import.meta.dir, '../src/cli.ts');
    const child = Bun.spawn(
      [
        process.execPath,
        '--eval',
        `import {runCli} from ${JSON.stringify(cliPath)};
const log = console.log;
console.log = (...args) => {
  log(...args);
  if (String(args[0]).startsWith('TransOne component selection:')) globalThis.__componentReportPrinted = true;
};
await runCli(['build', '--report-components', '--out-dir=release/shared']);`,
      ],
      { cwd: root, stdout: 'pipe', stderr: 'pipe' }
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
    expect(stdout).toContain(
      'TransOne component selection: miniprogram-weixin'
    );
    expect(stdout).toContain('FirstCard (variants/first.ts:2:1) [family]');
    expect(existsSync(reread)).toBe(false);
    expect(
      readFileSync(join(root, 'release/shared/pages/index/index.wxml'), 'utf8')
    ).toContain('first-snapshot');
    expect(
      existsSync(join(root, 'release/shared/pages/index/index.axml'))
    ).toBe(false);
  });
});
