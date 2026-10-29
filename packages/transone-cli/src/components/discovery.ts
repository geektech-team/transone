import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import type { ComponentIndexOptions } from './types';

export function canonicalPath(path: string): string {
  const absolute = resolve(path);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

/** Discovery only reads source. Imported files are loaded by TypeScript, never executed. */
export function createComponentProgram(
  options: ComponentIndexOptions
): ts.Program {
  const root = canonicalPath(options.root);
  let compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    noEmit: true,
  };
  const configPath = ts.findConfigFile(root, ts.sys.fileExists);
  if (configPath) {
    const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
    if (loaded.error)
      throw new Error(
        ts.flattenDiagnosticMessageText(loaded.error.messageText, '\n')
      );
    const parsed = ts.parseJsonConfigFileContent(
      loaded.config,
      ts.sys,
      resolve(configPath, '..')
    );
    // An empty config file list is harmless: roots come from component discovery.
    const errors = parsed.errors.filter((error) => error.code !== 18003);
    if (errors.length)
      throw new Error(
        errors
          .map((error) =>
            ts.flattenDiagnosticMessageText(error.messageText, '\n')
          )
          .join('\n')
      );
    compilerOptions = { ...compilerOptions, ...parsed.options, noEmit: true };
  }
  const discovered = ts.sys.readDirectory(
    root,
    ['.ts', '.tsx'],
    [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.d.ts',
      ...(options.exclude ?? []),
    ],
    ['src/**/*.ts', 'src/**/*.tsx', ...(options.include ?? [])]
  );
  const roots = new Set(
    [
      ...discovered,
      ...options.entrypoints.map((path) => resolve(root, path)),
    ].map(canonicalPath)
  );
  return ts.createProgram({
    rootNames: [...roots].sort(),
    options: compilerOptions,
  });
}
