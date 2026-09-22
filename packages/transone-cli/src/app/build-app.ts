import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { BuildResult, ResolvedConfig } from '../types';
import { nativeError } from './errors';
import { analyzeNativeScreen } from './analyze';
import type { NativeDialect } from './types';

export async function buildNativeApp(config: ResolvedConfig, dialect: NativeDialect): Promise<BuildResult> {
  if (!config.app) throw new Error('Native app build requires config.app');
  const entries = Object.values(config.app.pages);
  if (entries.length !== 1) throw nativeError(config.entry, '首期原生 App 只支持一个页面');
  const screen = await analyzeNativeScreen(entries[0]);
  const files = dialect.generateProject(screen, config.app);
  await rm(config.app.outDir, { recursive: true, force: true });
  const assetsBuilt: string[] = [];
  for (const [relative, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const target = join(config.app.outDir, relative); await mkdir(dirname(target), { recursive: true }); await writeFile(target, content, 'utf8'); assetsBuilt.push(target);
  }
  if (existsSync(config.app.publicDir)) await cp(config.app.publicDir, join(config.app.outDir, dialect.resourceDirectory), { recursive: true });
  return { root: config.root, outDir: resolve(config.app.outDir), assetsBuilt };
}
