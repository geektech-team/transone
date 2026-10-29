import { lstat, mkdir, mkdtemp, realpath, rename, rm } from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { assertSafeSubdirectory, canonicalizePotentialPath } from './safe-path';
import type { BuildResult, ResolvedConfig } from './types';
import { transoneConfigInputs, typeScriptConfigInputs } from './config-inputs';

interface BuildOutputOptions {
  root: string;
  outDir: string;
  protectedPaths?: readonly string[];
  requireProjectSubdirectory?: boolean;
}

// Only publication operations are injectable: generation and path validation always
// use the real filesystem. This also allows reliable recovery fault tests on OSes
// where rename failures cannot otherwise be induced without a timing race.
interface PublicationFileSystem {
  rename: typeof rename;
  rm: typeof rm;
}
const publicationFileSystem: PublicationFileSystem = { rename, rm };
const outputQueues = new Map<string, Promise<void>>();

/** Build privately, then replace the destination; never clean another build's files. */
export async function withBuildOutput(
  options: BuildOutputOptions,
  generate: (stagingDirectory: string) => Promise<BuildResult>,
  fileSystem: PublicationFileSystem = publicationFileSystem
): Promise<BuildResult> {
  await assertSafeBuildOutput(options);
  const key = await canonicalizePotentialPath(resolve(options.outDir));
  const previous = outputQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const active = new Promise<void>((done) => {
    release = done;
  });
  const queued = previous.then(() => active);
  outputQueues.set(key, queued);
  await previous;
  let staging: string | undefined;
  try {
    // Recheck after waiting: a previous build or external editor may have changed it.
    await assertSafeBuildOutput(options);
    const outDir = resolve(options.outDir);
    await mkdir(dirname(outDir), { recursive: true });
    staging = await mkdtemp(
      join(dirname(outDir), `.${basename(outDir)}.transone-`)
    );
    const result = await generate(staging);
    const assetsBuilt = result.assetsBuilt.map((asset) => {
      const path = relative(staging!, resolve(asset));
      if (path === '' || !isWithin(staging!, resolve(asset))) {
        throw new Error(
          `Build asset must be inside the staging directory: ${asset}`
        );
      }
      return resolve(outDir, path);
    });
    await assertSafeBuildOutput(options);
    await publish(staging, outDir, fileSystem);
    return { ...result, outDir, assetsBuilt };
  } finally {
    try {
      if (staging) await cleanOwnedPath(staging, fileSystem);
    } finally {
      release();
      if (outputQueues.get(key) === queued) outputQueues.delete(key);
    }
  }
}

/** Resolve an artifact before writing: malformed routes/generator paths cannot escape. */
export function buildOutputPath(outDir: string, path: string): string {
  const target = resolve(outDir, path);
  if (
    isAbsolute(path) ||
    target === resolve(outDir) ||
    !isWithin(resolve(outDir), target)
  ) {
    throw new Error(`Build file must be inside the output directory: ${path}`);
  }
  return target;
}

/** Include source directories as well as entries so output cannot erase siblings. */
export function buildInputPaths(
  config: ResolvedConfig,
  entries: readonly string[],
  additional: readonly string[] = []
): string[] {
  return [
    ...new Set([
      ...entries,
      ...entries
        .map(dirname)
        .filter((directory) => resolve(directory) !== resolve(config.root)),
      join(config.root, 'src'),
      join(config.root, 'public'),
      config.configFile ?? join(config.root, 'transone.config.ts'),
      join(config.root, 'tsconfig.json'),
      ...additional,
      ...transoneConfigInputs(config.configFile),
      ...typeScriptConfigInputs(
        config.root,
        [...entries, ...additional],
        config.library?.tsconfigs
      ),
    ]),
  ];
}

async function assertSafeBuildOutput(
  options: BuildOutputOptions
): Promise<void> {
  const outDir = resolve(options.outDir);
  const metadata = await existingMetadata(outDir);
  if (metadata?.isSymbolicLink()) {
    throw new Error(`Build output must not be a symbolic link: ${outDir}`);
  }
  const canonicalOutput = await canonicalizePotentialPath(outDir);
  const canonicalRoot = await realpath(options.root);
  if (options.requireProjectSubdirectory) {
    await assertSafeSubdirectory(
      options.root,
      outDir,
      'Build output must be a subdirectory of the project root'
    );
  }
  if (
    dirname(canonicalOutput) === canonicalOutput ||
    isWithin(outDir, resolve(options.root)) ||
    isWithin(canonicalOutput, canonicalRoot)
  ) {
    throw new Error(
      `Build output must not replace a filesystem or project root: ${outDir}`
    );
  }
  const inputs = options.protectedPaths ?? [];
  for (const input of new Set([
    ...inputs,
    ...typeScriptConfigInputs(options.root, inputs),
  ])) {
    const lexicalInput = resolve(input);
    const canonicalInput = await canonicalizePotentialPath(lexicalInput);
    if (
      isWithin(outDir, lexicalInput) ||
      isWithin(lexicalInput, outDir) ||
      isWithin(canonicalOutput, canonicalInput) ||
      isWithin(canonicalInput, canonicalOutput)
    ) {
      throw new Error(
        `Build output must not overlap source, public, or configuration paths: ${outDir} (${input})`
      );
    }
  }
}

async function publish(
  staging: string,
  outDir: string,
  fileSystem: PublicationFileSystem
): Promise<void> {
  const backup = `${staging}.previous`;
  const hadPrevious = (await existingMetadata(outDir)) !== undefined;
  if (hadPrevious) await fileSystem.rename(outDir, backup);
  try {
    await fileSystem.rename(staging, outDir);
  } catch (publicationError) {
    if (hadPrevious) {
      try {
        await fileSystem.rename(backup, outDir);
      } catch (rollbackError) {
        const failure = new Error(
          `Failed to publish build output and restore the previous output. Recover previous output from ${backup}. ` +
            `Publication: ${String(publicationError)}. Rollback: ${String(rollbackError)}`
        );
        Object.assign(failure, { errors: [publicationError, rollbackError] });
        throw failure;
      }
    }
    throw publicationError;
  }
  // Publication has succeeded. A cleanup problem must not report a failed build
  // with changed live output; keep the recoverable backup and name it explicitly.
  if (hadPrevious) await cleanOwnedPath(backup, fileSystem);
}

async function cleanOwnedPath(
  path: string,
  fileSystem: PublicationFileSystem
): Promise<void> {
  try {
    await fileSystem.rm(path, { recursive: true, force: true });
  } catch (error) {
    try {
      console.warn(
        `[transone build] Output published or build stopped, but temporary output could not be removed: ${path}`,
        error
      );
    } catch {
      // Diagnostic hooks must not turn a published build into a failed one.
    }
  }
}

async function existingMetadata(
  path: string
): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    )
      return undefined;
    throw error;
  }
}
function isWithin(parent: string, path: string): boolean {
  const child = relative(parent, path);
  return (
    child === '' ||
    (child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child))
  );
}
