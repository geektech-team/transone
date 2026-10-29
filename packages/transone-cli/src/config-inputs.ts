import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

/** Read config inheritance/references without enumerating sources or making a checker. */
export function typeScriptConfigInputs(
  root: string,
  sources: readonly string[],
  explicitConfigs: readonly string[] = []
): string[] {
  const inputs = new Set<string>();
  const visited = new Set<string>();
  const directories = new Set([resolve(root)]);
  for (const source of sources) {
    if (/\.[cm]?[jt]sx?$/i.test(source) && !/\.d\.[cm]?ts$/i.test(source)) {
      directories.add(dirname(resolve(source)));
    }
  }
  function visit(path: string): void {
    if (!existsSync(path)) return;
    const identity = realpathSync(path);
    if (visited.has(identity)) return;
    visited.add(identity);
    const parsed = ts.getParsedCommandLineOfConfigFile(
      path,
      {},
      {
        ...ts.sys,
        // Only option-file reads matter here; source discovery belongs to the build.
        readDirectory: () => [],
        readFile(file) {
          const source = ts.sys.readFile(file);
          if (source !== undefined) inputs.add(resolve(file));
          return source;
        },
        onUnRecoverableConfigFileDiagnostic() {
          // Build/config loading retains responsibility for reporting config errors.
        },
      }
    );
    for (const reference of parsed?.projectReferences ?? []) {
      visit(ts.resolveProjectReferencePath(reference));
    }
  }
  for (const config of explicitConfigs) visit(resolve(config));
  for (const directory of directories) {
    const config = ts.findConfigFile(directory, ts.sys.fileExists);
    if (config) visit(config);
  }
  return [...inputs];
}

/** Statically declared config modules are inputs too; never import/re-execute them. */
export function transoneConfigInputs(configFile: string | undefined): string[] {
  if (!configFile) return [];
  const inputs = new Set<string>();
  const pending = [configFile];
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (!existsSync(file)) continue;
    const path = realpathSync(file);
    if (inputs.has(path)) continue;
    inputs.add(path);
    if (!/\.[cm]?[jt]sx?$/i.test(path)) continue;
    const loader = path.endsWith('.tsx')
      ? 'tsx'
      : path.endsWith('.jsx')
        ? 'jsx'
        : /\.[cm]?ts$/.test(path)
          ? 'ts'
          : 'js';
    for (const dependency of new Bun.Transpiler({ loader }).scanImports(
      readFileSync(path, 'utf8')
    )) {
      try {
        const imported = Bun.resolveSync(dependency.path, dirname(path));
        if (existsSync(imported)) pending.push(imported);
      } catch {
        // Builtins and unresolved external imports do not identify local files.
      }
    }
  }
  return [...inputs];
}
