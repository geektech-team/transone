import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { scaffoldFiles } from './scaffold';

export interface CreateProjectOptions {
  /** Target directory; defaults to the current working directory. */
  root?: string;
  /** Package name; defaults to the target directory basename. */
  name?: string;
}

export interface CreateProjectResult {
  root: string;
  files: string[];
}

/** Framework version required by the generated component-family example. */
export const TRANSONE_FRAMEWORK_VERSION = '0.8.0';
/** CLI version required by generated platform scripts. */
export const TRANSONE_CLI_VERSION = '0.8.0';

export const GITHUB_URL = 'https://github.com/geektech-team/transone';

export function createProject(
  options: CreateProjectOptions = {}
): CreateProjectResult {
  const root = options.root ?? process.cwd();
  const name = options.name ?? basename(root);
  const files = scaffoldFiles(
    name,
    TRANSONE_FRAMEWORK_VERSION,
    TRANSONE_CLI_VERSION
  );

  const existing = files.filter((file) => existsSync(join(root, file.path)));
  if (existing.length > 0) {
    throw new Error(
      `Refusing to overwrite existing TransOne project files: ${existing
        .map((file) => file.path)
        .join(', ')}`
    );
  }

  mkdirSync(join(root, 'src'), { recursive: true });
  const created: string[] = [];
  for (const file of files) {
    mkdirSync(dirname(join(root, file.path)), { recursive: true });
    writeFileSync(join(root, file.path), file.content, {
      encoding: 'utf8',
      flag: 'wx',
    });
    created.push(file.path);
  }

  return { root, files: created };
}
