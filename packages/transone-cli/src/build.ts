import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type * as TypeScript from 'typescript';
import { loadTypescript } from './mp/ts-loader';
import { createBundleInputTracker } from './bundle-inputs';
import { buildInputPaths, withBuildOutput } from './output-transaction';
import { resolveConfig } from './config';
import { targetRegistry } from './target/registry';
import type { BuildOptions, BuildResult, ResolvedConfig } from './types';

/**
 * TransOne 构建入口：解析配置后按 Target 分发到对应编译目标。
 *
 * 同一个入口文档，`transone build --target <端>` 产出对应平台原生产物
 * （positioning 1：一份源码，多端原生产物，零运行时桥接）。
 */
export async function build(options: BuildOptions = {}): Promise<BuildResult> {
  return buildConfigured(await resolveConfig(options), options);
}

/** Use the same resolved configuration for inspection and output generation. */
export async function buildConfigured(
  config: ResolvedConfig,
  options: BuildOptions = {}
): Promise<BuildResult> {
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

  const declarations = library.dts
    ? await Promise.all(library.tsconfigs.map(loadDeclarationProject))
    : [];
  const protectedPaths = buildInputPaths(
    config,
    [library.entry],
    [...library.tsconfigs, ...declarations.flatMap((project) => project.inputs)]
  );
  return withBuildOutput(
    {
      root: config.root,
      outDir: library.outDir,
      protectedPaths,
    },
    async (outDir) => {
      const declarationAssets = declarations.flatMap((project) =>
        emitDeclarations(project, library.outDir, outDir)
      );
      const minify = library.minify ?? process.env.TRANSONE_MINIFY !== '0';
      const inputs = createBundleInputTracker();
      const result = await Bun.build({
        entrypoints: [library.entry],
        outdir: outDir,
        metafile: true,
        plugins: [inputs.plugin],
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

      protectedPaths.push(...inputs.paths(result));
      const assetsBuilt = [
        ...declarationAssets,
        ...result.outputs.map((output) => resolve(output.path)),
      ];
      return {
        root: config.root,
        outDir,
        assetsBuilt: [...new Set(assetsBuilt)],
      };
    }
  );
}

interface DeclarationProject {
  ts: typeof TypeScript;
  program: TypeScript.Program;
  diagnostics: readonly TypeScript.Diagnostic[];
  inputs: string[];
  configFile: string;
}

async function loadDeclarationProject(
  configFile: string
): Promise<DeclarationProject> {
  const ts = await loadTypescript();
  const inputs = new Set<string>();
  const diagnostics: TypeScript.Diagnostic[] = [];
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configFile,
    {},
    {
      ...ts.sys,
      readFile: (path) => {
        inputs.add(resolve(path));
        return ts.sys.readFile(path);
      },
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        diagnostics.push(diagnostic);
      },
    }
  );
  if (!parsed) throw declarationError(ts, configFile, diagnostics);
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences,
  });
  for (const source of program.getSourceFiles())
    inputs.add(resolve(source.fileName));
  return {
    ts,
    program,
    diagnostics: [...diagnostics, ...parsed.errors],
    inputs: [...inputs],
    configFile,
  };
}

function emitDeclarations(
  project: DeclarationProject,
  finalOutDir: string,
  staging: string
): string[] {
  const { ts, program, configFile } = project;
  const diagnostics = [
    ...project.diagnostics,
    ...ts.getPreEmitDiagnostics(program),
  ];
  if (
    diagnostics.some(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
    )
  ) {
    throw declarationError(ts, configFile, diagnostics);
  }
  const assets: string[] = [];
  // Keep the compiler's original output paths when generating source/declaration
  // maps, but redirect the actual writes. Moving a sibling staging directory to
  // its destination then preserves both configured layout and relative sources.
  const emitted = program.emit(undefined, (file, content, byteOrderMark) => {
    const path = relative(finalOutDir, resolve(file));
    if (
      path === '' ||
      path === '..' ||
      path.startsWith(`..${sep}`) ||
      isAbsolute(path)
    ) {
      throw new Error(
        `TypeScript output must be inside library.outDir for recoverable publication: ${file} (${configFile})`
      );
    }
    const target = resolve(staging, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${byteOrderMark ? '\uFEFF' : ''}${content}`);
    assets.push(target);
  });
  if (
    emitted.emitSkipped ||
    emitted.diagnostics.some(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
    )
  ) {
    throw declarationError(ts, configFile, emitted.diagnostics);
  }
  return assets;
}

function declarationError(
  ts: typeof TypeScript,
  configFile: string,
  diagnostics: readonly TypeScript.Diagnostic[]
): Error {
  return new Error(
    `TypeScript compilation failed for ${configFile}:\n${ts.formatDiagnostics(
      diagnostics,
      {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => dirname(configFile),
        getNewLine: () => '\n',
      }
    )}`
  );
}
