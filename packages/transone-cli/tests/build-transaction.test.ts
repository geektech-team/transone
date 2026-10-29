import { afterEach, describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { build } from '../src/build';
import { buildNativeApp } from '../src/app/build-app';
import { resolveConfig } from '../src/config';

const roots: string[] = [];
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'transone-output-'));
  roots.push(root);
  mkdirSync(join(root, 'src'));
  return root;
}
function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}
function seed(root: string, out = 'output'): string {
  write(root, `${out}/keep.txt`, 'previous good bytes');
  return join(root, out);
}
function web(
  root: string,
  body = "return '<html><head></head><body>ok</body></html>';"
): void {
  write(
    root,
    'src/main.ts',
    `export const app = { renderHtmlDocument(options = {}) { ${body} } };`
  );
}
function native(root: string): void {
  write(
    root,
    'src/main.ts',
    `import { Component, h } from '${join(import.meta.dir, '../../transone/lib/index.ts')}'; export class App extends Component { render() { return h('div', {}, []); } }`
  );
}
function leftovers(root: string): string[] {
  return readdirSync(root).filter((name) =>
    name.startsWith('.output.transone-')
  );
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe('recoverable build output', () => {
  it('keeps good Web output when browser bundling fails after document preflight', async () => {
    const root = fixture();
    web(root);
    write(
      root,
      'src/main.ts',
      readFileSync(join(root, 'src/main.ts'), 'utf8') +
        `\nexport function browserOnly() { return import('missing-transone-browser-module'); }`
    );
    const out = seed(root);
    await expect(build({ root, outDir: out })).rejects.toThrow(
      /Failed to build/
    );
    expect(readFileSync(join(out, 'keep.txt'), 'utf8')).toBe(
      'previous good bytes'
    );
    expect(leftovers(root)).toEqual([]);
  });

  it.each([true, false])(
    'keeps Web output atomic when final document rendering fails (old output: %s)',
    async (existing) => {
      const root = fixture();
      web(
        root,
        `if (options.scripts) throw new Error('final-render-failed'); return '<html></html>';`
      );
      const out = existing ? seed(root) : join(root, 'output');
      await expect(build({ root, outDir: out })).rejects.toThrow(
        'final-render-failed'
      );
      if (existing)
        expect(readFileSync(join(out, 'keep.txt'), 'utf8')).toBe(
          'previous good bytes'
        );
      else expect(existsSync(out)).toBe(false);
      expect(leftovers(root)).toEqual([]);
    }
  );

  it('keeps Web output when a generated HTML parent conflicts with another page file', async () => {
    const root = fixture();
    web(root);
    const out = seed(root);
    await expect(
      build({
        root,
        outDir: out,
        config: {
          pages: {
            '/about': 'src/main.ts',
            '/about.html/child': 'src/main.ts',
          },
        },
      })
    ).rejects.toThrow();
    expect(readFileSync(join(out, 'keep.txt'), 'utf8')).toBe(
      'previous good bytes'
    );
    expect(leftovers(root)).toEqual([]);
  });

  it.each([
    'mp-weixin',
    'mp-alipay',
    'mp-bytedance',
    'mp-xiaohongshu',
    'app-ios',
    'app-android',
    'app-harmony',
  ] as const)('keeps %s output when public copying fails', async (target) => {
    const root = fixture();
    native(root);
    const out = seed(root);
    // A regular file used as a public directory fails after generated files are written.
    write(root, 'public', 'invalid static directory');
    await expect(
      build({
        root,
        target,
        outDir: out,
        config: { app: { host: 'https://api.test' } },
      })
    ).rejects.toThrow(
      /ENOTDIR|non-directory|not a directory|cannot overwrite/i
    );
    expect(readFileSync(join(out, 'keep.txt'), 'utf8')).toBe(
      'previous good bytes'
    );
    expect(leftovers(root)).toEqual([]);
  });

  it.each(['web', 'mp-weixin', 'app-ios'] as const)(
    'replaces stale %s output and returns usable final paths',
    async (target) => {
      const root = fixture();
      if (target === 'web') web(root);
      else native(root);
      const out = seed(root);
      write(root, 'sibling/keep.txt', 'other target');
      const result = await build({ root, target, outDir: out });
      expect(result.outDir).toBe(out);
      expect(existsSync(join(out, 'keep.txt'))).toBe(false);
      expect(result.assetsBuilt.length).toBeGreaterThan(0);
      for (const path of result.assetsBuilt) {
        expect(relative(out, path).startsWith('..')).toBe(false);
        expect(existsSync(path)).toBe(true);
      }
      expect(readFileSync(join(root, 'sibling/keep.txt'), 'utf8')).toBe(
        'other target'
      );
      expect(leftovers(root)).toEqual([]);
    }
  );

  it.each(['mp-weixin', 'app-ios'] as const)(
    'supports an explicit external %s destination',
    async (target) => {
      const root = fixture();
      native(root);
      const external = fixture();
      const out = seed(external);
      const result = await build({ root, target, outDir: out });
      expect(result.outDir).toBe(out);
      expect(
        result.assetsBuilt.every(
          (path) => path.startsWith(out) && existsSync(path)
        )
      ).toBe(true);
      expect(existsSync(join(out, 'keep.txt'))).toBe(false);
      expect(leftovers(external)).toEqual([]);
    }
  );

  it.each(['web', 'mp-weixin'] as const)(
    'rejects %s traversal routes before writing outside its staging directory',
    async (target) => {
      const root = fixture();
      if (target === 'web') web(root);
      else native(root);
      const out = seed(root);
      const source = readFileSync(join(root, 'src/main.ts'), 'utf8');
      const config =
        target === 'web'
          ? { pages: { '/../escaped': 'src/main.ts' } }
          : { mp: { pages: { '/../../escaped': 'src/main.ts' } } };
      await expect(
        build({ root, target, outDir: out, config })
      ).rejects.toThrow(/inside.*output directory/);
      expect(readFileSync(join(out, 'keep.txt'), 'utf8')).toBe(
        'previous good bytes'
      );
      expect(readFileSync(join(root, 'src/main.ts'), 'utf8')).toBe(source);
      expect(existsSync(join(root, 'escaped.html'))).toBe(false);
      expect(existsSync(join(root, 'escaped'))).toBe(false);
    }
  );

  it.each(['../escaped', '/absolute-file'] as const)(
    'rejects generated App file path %s before writing it',
    async (path) => {
      const root = fixture();
      write(
        root,
        'src/main.ts',
        `export class App {render(){return {tag:'main',children:[]};}}`
      );
      const out = seed(root);
      const config = await resolveConfig({
        root,
        target: 'app-ios',
        outDir: out,
      });
      const file = path.startsWith('/') ? join(root, 'absolute-file') : path;
      await expect(
        buildNativeApp(config, {
          id: 'app-ios',
          label: 'fixture',
          resourceDirectory: 'assets',
          generateProject: () => ({ [file]: 'new content' }),
        })
      ).rejects.toThrow(/inside.*output directory/);
      expect(readFileSync(join(out, 'keep.txt'), 'utf8')).toBe(
        'previous good bytes'
      );
      expect(existsSync(join(root, 'escaped'))).toBe(false);
      expect(existsSync(join(root, 'absolute-file'))).toBe(false);
    }
  );
  it('rejects an absolute App resource destination before copying public files', async () => {
    const root = fixture();
    write(
      root,
      'src/main.ts',
      `export class App {render(){return {tag:'main',children:[]};}}`
    );
    write(root, 'public/static.txt', 'static bytes');
    const out = seed(root);
    const config = await resolveConfig({
      root,
      target: 'app-ios',
      outDir: out,
    });
    await expect(
      buildNativeApp(config, {
        id: 'app-ios',
        label: 'fixture',
        resourceDirectory: join(root, 'absolute-resources'),
        generateProject: () => ({ 'nested/main.txt': 'new content' }),
      })
    ).rejects.toThrow(/inside.*output directory/);
    expect(readFileSync(join(out, 'keep.txt'), 'utf8')).toBe(
      'previous good bytes'
    );
    expect(existsSync(join(root, 'absolute-resources'))).toBe(false);
  });

  it.each(['web', 'mp-weixin', 'app-ios'] as const)(
    'protects an imported shared source directory from %s publication',
    async (target) => {
      const root = fixture();
      write(
        root,
        'shared/helper.ts',
        `export const label = 'source must survive';`
      );
      if (target === 'web') {
        write(
          root,
          'tsconfig.json',
          JSON.stringify({
            compilerOptions: {
              baseUrl: root,
              paths: {
                transone: [
                  join(import.meta.dir, '../../transone/lib/index.ts'),
                ],
              },
            },
          })
        );
        write(
          root,
          'src/main.ts',
          `import {label} from '../shared/helper'; export const app = {renderHtmlDocument() { return '<html><body>' + label + '</body></html>'; }};`
        );
      } else if (target === 'app-ios') {
        write(
          root,
          'src/main.ts',
          `import {label} from '../shared/helper'; export class App {render(){return {tag:'main',children:[]};}}`
        );
      } else {
        write(
          root,
          'src/main.ts',
          `import {Component,h} from '${join(import.meta.dir, '../../transone/lib/index.ts')}'; import {label} from '../shared/helper'; export class App extends Component {render(){return h('div',{},[]);}}`
        );
      }
      const before = readFileSync(join(root, 'shared/helper.ts'), 'utf8');
      await expect(build({ root, target, outDir: 'shared' })).rejects.toThrow(
        /Build output/
      );
      expect(readFileSync(join(root, 'shared/helper.ts'), 'utf8')).toBe(before);
      expect(readdirSync(join(root, 'shared'))).toEqual(['helper.ts']);
    }
  );

  it.each([
    ['side-effect TypeScript', 'helper.ts', `import '../shared/helper';`],
    [
      'named JavaScript',
      'helper.js',
      `import {value} from '../shared/helper.js';`,
    ],
    ['stylesheet', 'theme.css', `import '../shared/theme.css';`],
    ['static asset', 'icon.svg', `import icon from '../shared/icon.svg';`],
  ])(
    'protects actual Web bundle inputs: %s',
    async (_name, file, dependency) => {
      const root = fixture();
      const content = file.endsWith('.css')
        ? 'body { color: red; }'
        : file.endsWith('.svg')
          ? '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
          : `export const value = 7;`;
      write(root, `shared/${file}`, content);
      write(
        root,
        'src/main.ts',
        dependency +
          `export const app = {renderHtmlDocument(){return '<html><body>safe</body></html>';}};`
      );
      write(
        root,
        'tsconfig.json',
        JSON.stringify({
          compilerOptions: {
            baseUrl: root,
            paths: {
              transone: [join(import.meta.dir, '../../transone/lib/index.ts')],
            },
          },
        })
      );
      await expect(build({ root, outDir: 'shared' })).rejects.toThrow(
        /Build output/
      );
      expect(readFileSync(join(root, 'shared', file), 'utf8')).toBe(content);
      expect(readdirSync(join(root, 'shared'))).toEqual([file]);
    }
  );

  it.each(['web', 'mp-weixin', 'app-ios'] as const)(
    'rejects dangerous %s final destinations before making staging directories',
    async (target) => {
      const root = fixture();
      if (target === 'web') web(root);
      else native(root);
      const source = readFileSync(join(root, 'src/main.ts'), 'utf8');
      for (const out of [root, join(root, 'src'), join(root, 'public')]) {
        mkdirSync(join(root, 'public'), { recursive: true });
        await expect(build({ root, target, outDir: out })).rejects.toThrow(
          /Build output/
        );
        expect(readFileSync(join(root, 'src/main.ts'), 'utf8')).toBe(source);
        expect(existsSync(join(root, 'public'))).toBe(true);
      }
      const realOut = seed(root, 'actual');
      symlinkSync(realOut, join(root, 'output'));
      await expect(build({ root, target, outDir: 'output' })).rejects.toThrow(
        /Build output/
      );
      expect(readFileSync(join(realOut, 'keep.txt'), 'utf8')).toBe(
        'previous good bytes'
      );
      expect(leftovers(root)).toEqual([]);
    }
  );
});

describe('library output transaction', () => {
  function library(root: string, valid = true) {
    write(
      root,
      'src/index.ts',
      valid
        ? 'export const value: number = 7;'
        : "export const value: number = 'wrong';"
    );
    write(
      root,
      'tsconfig.build.json',
      JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          declaration: true,
          emitDeclarationOnly: true,
          rootDir: 'src',
          outDir: 'output/types',
          declarationMap: true,
          strict: true,
          skipLibCheck: true,
        },
        include: ['src'],
      })
    );
    return {
      root,
      library: true,
      config: {
        library: {
          entry: 'src/index.ts',
          outDir: 'output',
          tsconfigs: ['tsconfig.build.json'],
        },
      },
    };
  }
  it('keeps old library output when declaration compilation fails', async () => {
    const root = fixture();
    const options = library(root, false);
    const out = seed(root);
    await expect(build(options)).rejects.toThrow(/tsc|TypeScript/);
    expect(readFileSync(join(out, 'keep.txt'), 'utf8')).toBe(
      'previous good bytes'
    );
    expect(leftovers(root)).toEqual([]);
  }, 20000);
  it('publishes declarations at their configured nested layout and reports final paths', async () => {
    const root = fixture();
    const options = library(root);
    const out = seed(root);
    const before = readFileSync(join(root, 'tsconfig.build.json'), 'utf8');
    const result = await build(options);
    expect(readFileSync(join(out, 'types/index.d.ts'), 'utf8')).toContain(
      'value: number'
    );
    expect(result.assetsBuilt).toContain(join(out, 'types/index.d.ts'));
    expect(result.assetsBuilt).toContain(join(out, 'index.js'));
    for (const mapFile of result.assetsBuilt.filter((path) =>
      path.endsWith('.map')
    )) {
      const source = readFileSync(mapFile, 'utf8');
      expect(source).not.toContain('.transone-');
      for (const path of JSON.parse(source).sources ?? []) {
        expect(existsSync(resolve(dirname(mapFile), path))).toBe(true);
      }
    }
    expect(
      result.assetsBuilt.every(
        (path) => existsSync(path) && !path.includes('.transone-')
      )
    ).toBe(true);
    expect(existsSync(join(out, 'keep.txt'))).toBe(false);
    expect(readFileSync(join(root, 'tsconfig.build.json'), 'utf8')).toBe(
      before
    );
    expect(leftovers(root)).toEqual([]);
  }, 20000);
  it('keeps old library output if bundling fails after successful declaration generation', async () => {
    const root = fixture();
    const options = library(root);
    const out = seed(root);
    write(
      root,
      'src/index.ts',
      `export const value = 7;\n// @ts-ignore\nexport const broken = () => import('missing-library-bundle-module');`
    );
    await expect(build(options)).rejects.toThrow(
      /Failed to build TransOne library/
    );
    expect(readFileSync(join(out, 'keep.txt'), 'utf8')).toBe(
      'previous good bytes'
    );
    expect(existsSync(join(out, 'types/index.d.ts'))).toBe(false);
    expect(leftovers(root)).toEqual([]);
  }, 20000);
  it('supports an explicit external library destination without declarations', async () => {
    const root = fixture();
    library(root);
    const external = fixture();
    const out = seed(external);
    const result = await build({
      root,
      library: true,
      config: { library: { entry: 'src/index.ts', outDir: out, dts: false } },
    });
    expect(result.outDir).toBe(out);
    expect(result.assetsBuilt).toContain(join(out, 'index.js'));
    expect(
      result.assetsBuilt.every(
        (path) => existsSync(path) && !path.includes('.transone-')
      )
    ).toBe(true);
    expect(existsSync(join(out, 'keep.txt'))).toBe(false);
  });
  it('rejects declaration output outside the transactional library directory without touching either output', async () => {
    const root = fixture();
    const options = library(root);
    const out = seed(root);
    const configPath = join(root, 'tsconfig.build.json');
    const tsconfig = JSON.parse(readFileSync(configPath, 'utf8'));
    tsconfig.compilerOptions.declarationDir = 'separate-types';
    write(root, 'tsconfig.build.json', JSON.stringify(tsconfig));
    write(root, 'separate-types/index.d.ts', 'old external declaration');
    await expect(build(options)).rejects.toThrow(
      /TypeScript output must be inside library.outDir/
    );
    expect(readFileSync(join(out, 'keep.txt'), 'utf8')).toBe(
      'previous good bytes'
    );
    expect(readFileSync(join(root, 'separate-types/index.d.ts'), 'utf8')).toBe(
      'old external declaration'
    );
    expect(leftovers(root)).toEqual([]);
  }, 20000);

  it.each(['ts', 'js'])(
    'protects imported %s inputs when library declarations are disabled',
    async (extension) => {
      const root = fixture();
      write(root, `shared/helper.${extension}`, 'export const value = 7;');
      write(
        root,
        'src/index.ts',
        `export {value} from '../shared/helper.${extension}';`
      );
      await expect(
        build({
          root,
          library: true,
          config: {
            library: { entry: 'src/index.ts', outDir: 'shared', dts: false },
          },
        })
      ).rejects.toThrow(/Build output/);
      expect(
        readFileSync(join(root, `shared/helper.${extension}`), 'utf8')
      ).toBe('export const value = 7;');
      expect(readdirSync(join(root, 'shared'))).toEqual([
        `helper.${extension}`,
      ]);
    }
  );
});

describe('build configuration input protection', () => {
  it.each(['web', 'library'] as const)(
    'protects the nested tsconfig extends chain in %s builds',
    async (mode) => {
      const root = fixture();
      web(root);
      write(
        root,
        'tsconfig.json',
        JSON.stringify({ extends: './configs/tsconfig.base.json' })
      );
      write(
        root,
        'configs/tsconfig.base.json',
        JSON.stringify({
          extends: './tsconfig.shared.json',
          compilerOptions: { target: 'ES2020' },
        })
      );
      write(
        root,
        'configs/tsconfig.shared.json',
        JSON.stringify({ compilerOptions: { strict: true } })
      );
      const before = readFileSync(
        join(root, 'configs/tsconfig.shared.json'),
        'utf8'
      );
      const options =
        mode === 'web'
          ? { root, outDir: 'configs' }
          : {
              root,
              library: true,
              config: {
                library: {
                  entry: 'src/main.ts',
                  outDir: 'configs',
                  dts: false,
                },
              },
            };
      await expect(build(options)).rejects.toThrow(/Build output/);
      expect(
        readFileSync(join(root, 'configs/tsconfig.shared.json'), 'utf8')
      ).toBe(before);
      expect(existsSync(join(root, 'configs/tsconfig.base.json'))).toBe(true);
    }
  );

  it.each(['web', 'library'] as const)(
    'protects referenced project configurations in %s builds',
    async (mode) => {
      const root = fixture();
      web(root);
      write(
        root,
        'tsconfig.json',
        JSON.stringify({ references: [{ path: './configs/project' }] })
      );
      write(
        root,
        'configs/project/tsconfig.json',
        JSON.stringify({ compilerOptions: { composite: true }, files: [] })
      );
      const before = readFileSync(
        join(root, 'configs/project/tsconfig.json'),
        'utf8'
      );
      const options =
        mode === 'web'
          ? { root, outDir: 'configs' }
          : {
              root,
              library: true,
              config: {
                library: {
                  entry: 'src/main.ts',
                  outDir: 'configs',
                  dts: false,
                },
              },
            };
      await expect(build(options)).rejects.toThrow(/Build output/);
      expect(
        readFileSync(join(root, 'configs/project/tsconfig.json'), 'utf8')
      ).toBe(before);
    }
  );

  it('protects re-exported TransOne configuration helpers without executing them again', async () => {
    const root = fixture();
    web(root);
    write(
      root,
      'transone.config.ts',
      `export {default} from './config-bridge';`
    );
    write(
      root,
      'config-bridge.ts',
      `export {default} from './configs/settings';`
    );
    write(
      root,
      'configs/settings.ts',
      `globalThis.__transoneConfigProtectionLoads = (globalThis.__transoneConfigProtectionLoads ?? 0) + 1; export default {build:{outDir:'configs'}};`
    );
    const before = readFileSync(join(root, 'configs/settings.ts'), 'utf8');
    const previous = (globalThis as Record<string, unknown>)
      .__transoneConfigProtectionLoads;
    try {
      (globalThis as Record<string, unknown>).__transoneConfigProtectionLoads =
        0;
      await expect(build({ root })).rejects.toThrow(/Build output/);
      expect(readFileSync(join(root, 'configs/settings.ts'), 'utf8')).toBe(
        before
      );
      expect(
        (globalThis as Record<string, unknown>).__transoneConfigProtectionLoads
      ).toBe(1);
    } finally {
      if (previous === undefined)
        delete (globalThis as Record<string, unknown>)
          .__transoneConfigProtectionLoads;
      else
        (
          globalThis as Record<string, unknown>
        ).__transoneConfigProtectionLoads = previous;
    }
  });

  it('protects an imported external configuration directory in a library build without declarations', async () => {
    const root = fixture();
    web(root);
    const external = fixture();
    const settings = join(external, 'configs/settings.ts');
    write(
      external,
      'configs/settings.ts',
      `export default {library:{entry:${JSON.stringify(join(root, 'src/main.ts'))},outDir:${JSON.stringify(join(external, 'configs'))},dts:false}};`
    );
    write(
      root,
      'transone.config.ts',
      `export {default} from ${JSON.stringify(settings)};`
    );
    const before = readFileSync(settings, 'utf8');
    await expect(build({ root, library: true })).rejects.toThrow(
      /Build output/
    );
    expect(readFileSync(settings, 'utf8')).toBe(before);
  });
});
