import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { resolveConfig } from './config';
import { targetRegistry } from './target/registry';
import type { BuildOptions, BuildResult } from './types';

/**
 * TransOne 构建入口：解析配置后按 Target 分发到对应编译目标。
 *
 * 同一个入口文档，`transone build --target <端>` 产出对应平台原生产物
 * （positioning 1：一份源码，多端原生产物，零运行时桥接）。
 */
export async function build(options: BuildOptions = {}): Promise<BuildResult> {
  const config = await resolveConfig(options);

  // 库构建与目标端无关：直接产出可发布的 ESM bundle + .d.ts。
  if (options.library) {
    return buildLibrary(config);
  }

  const target = targetRegistry.resolve(config.target);
  return target.build(config, options);
}

async function buildLibrary(
  config: Awaited<ReturnType<typeof resolveConfig>>
): Promise<BuildResult> {
  const library = config.library;
  if (!library) {
    throw new Error('TransOne library build requires config.library');
  }

  await rm(library.outDir, { recursive: true, force: true });
  await mkdir(library.outDir, { recursive: true });

  if (library.dts) {
    for (const tsconfig of library.tsconfigs) {
      await runTsc(config.root, tsconfig);
    }
  }

  const minify = library.minify ?? process.env.TRANSONE_MINIFY !== '0';
  const result = await Bun.build({
    entrypoints: [library.entry],
    outdir: library.outDir,
    root: dirname(library.entry),
    target: 'browser',
    format: 'esm',
    sourcemap: library.sourcemap ? 'linked' : undefined,
    splitting: library.splitting,
    minify,
    external: library.external,
    throw: false,
  });

  if (!result.success || result.outputs.length === 0) {
    throw new Error(
      `Failed to build TransOne library:\n${result.logs
        .map((log) => log.message)
        .join('\n')}`
    );
  }

  const assetsBuilt = result.outputs.map((output) => resolve(output.path));
  return { root: config.root, outDir: library.outDir, assetsBuilt };
}

async function runTsc(root: string, tsconfig: string): Promise<void> {
  const proc = Bun.spawn(['bunx', 'tsc', '--project', tsconfig], {
    cwd: root,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(
      `tsc --project ${tsconfig} failed with exit code ${exitCode}`
    );
  }
}
