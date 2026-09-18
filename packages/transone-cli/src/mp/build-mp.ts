import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import type { ResolvedConfig, BuildResult } from '../types';
import type { MpDialect } from './dialect';
import { loadTypescript } from './ts-loader';
import { CompileContext, CompiledUnit } from './types';
import { findRootClass } from './analyze';
import { compileUnit, finalizeComponentProperties } from './compile';
import { generatePageJs, generateComponentJs } from './jsgen';

const GENERATED_COMMENT = (dialectId: string): string =>
  `由 transone build --target ${dialectId} 生成，请勿手动编辑`;

/**
 * 把 TSone 应用编译为小程序原生工程（微信 / 阿里 / 字节，差异见 MpDialect）：
 * app.json / app.js / <appStyleFile> / 工程配置 + pages/<route>/<name>.* + components/<tag>/<tag>.*
 */
export async function buildMiniProgram(
  config: ResolvedConfig,
  dialect: MpDialect
): Promise<BuildResult> {
  const mp = config.mp;
  if (!mp) {
    throw new Error('Mini program build requires config.mp');
  }

  const ts = await loadTypescript();
  const context: CompileContext = {
    ts,
    root: config.root,
    files: new Map(),
    components: new Map(),
    compiling: new Set(),
    callSites: new Map(),
    lengthUnit: mp.lengthUnit,
    dialect,
    warnings: [],
  };

  const pages: Array<{ route: string; unit: CompiledUnit }> = [];
  for (const [route, entry] of Object.entries(mp.pages)) {
    const rootClass = findRootClass(context, entry);
    const location = pageLocation(route);
    const unit = compileUnit(context, rootClass, {
      kind: 'page',
      name: location.name,
    });
    pages.push({ route, unit });
  }
  finalizeComponentProperties(context);
  for (const warning of context.warnings) {
    console.warn(`[transone mp] ${warning}`);
  }

  const outDir = mp.outDir;
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  const assetsBuilt: string[] = [];
  const write = async (path: string, content: string): Promise<void> => {
    const target = join(outDir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
    assetsBuilt.push(target);
  };

  // —— 应用级文件 ——
  await write(
    dialect.projectConfigFile,
    `${JSON.stringify(
      dialect.buildProjectConfig(mp, basename(config.root)),
      null,
      2
    )}\n`
  );

  await write(
    'app.json',
    `${JSON.stringify(
      {
        pages: pages.map(({ route }) => appPagePath(route)),
        window: {
          ...dialect.windowDefaults(mp.navigationBarTitleText),
          ...mp.window,
        },
        ...(mp.tabBar !== undefined ? { tabBar: mp.tabBar } : {}),
        ...mp.appExtra,
        ...dialect.appJsonExtras(),
      },
      null,
      2
    )}\n`
  );

  await write(
    'app.js',
    `App(${JSON.stringify(
      mp.globalData !== undefined ? { globalData: mp.globalData } : {}
    )});\n`
  );
  if (dialect.sitemap) {
    await write(
      'sitemap.json',
      `${JSON.stringify(
        {
          desc: GENERATED_COMMENT(dialect.id),
          rules: [{ action: 'allow', page: '*' }],
        },
        null,
        2
      )}\n`
    );
  }

  const globalStyles = new Set<string>();
  for (const { unit } of pages) {
    if (unit.globalStyle) {
      globalStyles.add(unit.globalStyle);
    }
  }
  await write(dialect.appStyleFile, `${[...globalStyles].join('\n')}\n`);

  // —— 页面 ——
  for (const { route, unit } of pages) {
    const base = pageFileBase(route);
    await write(`pages/${base}.${dialect.templateExt}`, unit.template);
    await write(`pages/${base}.${dialect.styleExt}`, `${unit.style}\n`);
    await write(`pages/${base}.js`, generatePageJs(unit, dialect));
    await write(
      `pages/${base}.json`,
      `${JSON.stringify(
        {
          usingComponents: unit.usingComponents,
          ...mp.pageExtra?.[route],
        },
        null,
        2
      )}\n`
    );
  }

  // —— 自定义组件 ——
  for (const [tag, unit] of context.components) {
    await write(`components/${tag}/${tag}.${dialect.templateExt}`, unit.template);
    await write(`components/${tag}/${tag}.${dialect.styleExt}`, `${unit.style}\n`);
    await write(`components/${tag}/${tag}.js`, generateComponentJs(unit, dialect));
    await write(
      `components/${tag}/${tag}.json`,
      `${JSON.stringify(
        dialect.componentJson(unit.usingComponents),
        null,
        2
      )}\n`
    );
  }

  // —— 静态资源目录（public/ 默认；不存在则跳过）——
  // 上面生成文件已写完，public 仅补产物中不存在的内容：避免覆盖生成文件。
  if (existsSync(mp.publicDir)) {
    for (const file of await listFiles(mp.publicDir)) {
      const target = join(outDir, file);
      if (!existsSync(target)) {
        await cp(join(mp.publicDir, file), target, {
          recursive: true,
          force: true,
          errorOnExist: false,
        });
      }
    }
  }

  return {
    root: config.root,
    outDir: resolve(outDir),
    assetsBuilt,
  };
}

function pageLocation(route: string): { directory: string; name: string } {
  const segments = route.replace(/^\/+/, '').split('/').filter(Boolean);
  if (segments.length === 0) {
    return { directory: '', name: 'index' };
  }
  const name = segments[segments.length - 1];
  const directory = segments.slice(0, -1).join('/');
  return { directory, name };
}

/** 页面文件基名：route '/' -> 'index/index'；'/about' -> 'about/about'。 */
function pageFileBase(route: string): string {
  const location = pageLocation(route);
  const directory =
    location.directory === ''
      ? location.name
      : `${location.directory}/${location.name}`;
  return `${directory}/${location.name}`;
}

function appPagePath(route: string): string {
  return `pages/${pageFileBase(route)}`;
}

/** 递归列出目录下所有文件（相对根目录的路径）。 */
async function listFiles(root: string, dir: string = root): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFiles(root, abs)));
    } else {
      out.push(relative(root, abs));
    }
  }
  return out;
}
