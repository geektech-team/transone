import { cp, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { BuildResult, ResolvedConfig } from '../types';
import { nativeError } from './errors';
import { analyzeNativeScreen } from './analyze';
import type { NativeDialect, NativeScreen } from './types';
import {
  buildInputPaths,
  buildOutputPath,
  withBuildOutput,
} from '../output-transaction';

export async function buildNativeApp(
  config: ResolvedConfig,
  dialect: NativeDialect
): Promise<BuildResult> {
  if (!config.app) throw new Error('Native app build requires config.app');
  const entries = Object.values(config.app.pages);
  if (entries.length !== 1)
    throw nativeError(config.entry, '首期原生 App 只支持一个页面');
  const sourcePaths: string[] = [];
  const screen = await analyzeNativeScreen(entries[0], config, (paths) =>
    sourcePaths.push(...paths)
  );
  return withBuildOutput(
    {
      root: config.root,
      outDir: config.app.outDir,
      protectedPaths: buildInputPaths(config, entries, [
        config.app.publicDir,
        ...sourcePaths,
      ]),
    },
    (outDir) => generateNativeApp(config, dialect, outDir, screen)
  );
}

async function generateNativeApp(
  config: ResolvedConfig,
  dialect: NativeDialect,
  outDir: string,
  screen: NativeScreen
): Promise<BuildResult> {
  const app = config.app!;
  const files = dialect.generateProject(screen, app);
  if (app.host !== undefined) {
    files[`${dialect.resourceDirectory}/transone.config.json`] =
      `${JSON.stringify({ host: app.host }, null, 2)}\n`;
  }
  const assetsBuilt: string[] = [];
  for (const [relative, content] of Object.entries(files).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const target = buildOutputPath(outDir, relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
    assetsBuilt.push(target);
  }
  if (existsSync(app.publicDir))
    await cp(
      app.publicDir,
      buildOutputPath(outDir, dialect.resourceDirectory),
      { recursive: true }
    );
  return { root: config.root, outDir: resolve(outDir), assetsBuilt };
}
