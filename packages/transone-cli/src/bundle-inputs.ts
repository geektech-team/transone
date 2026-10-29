import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { BunPlugin, BuildOutput } from 'bun';

/** Observe the real bundler graph, including JS, styles, assets and side effects. */
export function createBundleInputTracker() {
  const inputs = new Set<string>();
  const plugin: BunPlugin = {
    name: 'transone-build-inputs',
    setup(build) {
      // Returning undefined lets the platform/style loaders continue unchanged.
      // This also captures file inputs on Bun versions without metafile support.
      build.onLoad({ filter: /.*/, namespace: 'file' }, ({ path }) => {
        inputs.add(resolve(path));
        return undefined;
      });
    },
  };
  return {
    plugin,
    paths(result: Pick<BuildOutput, 'metafile'>): string[] {
      for (const [path, input] of Object.entries(
        result.metafile?.inputs ?? {}
      )) {
        const file = resolve(path);
        // Virtual platform modules have namespace keys rather than file paths.
        if (!existsSync(file)) continue;
        inputs.add(file);
        for (const dependency of input.imports) {
          const resolved = resolve(dependency.path);
          if (existsSync(resolved)) inputs.add(resolved);
          // Bun records unused named imports as unresolved/external entries even
          // when they are local files. Protect those known sources as well.
          try {
            const imported = Bun.resolveSync(
              dependency.original ?? dependency.path,
              dirname(file)
            );
            if (existsSync(imported)) inputs.add(imported);
          } catch {
            // Builtins and genuinely external imports do not identify local inputs.
          }
        }
      }
      if (!result.metafile) {
        // Older Bun versions lack metadata and may skip loading unused imports.
        // Scan only files already observed by the bundler; no second TS program.
        for (const file of [...inputs]) {
          if (!/\.[cm]?[jt]sx?$/i.test(file)) continue;
          const loader = file.endsWith('.tsx')
            ? 'tsx'
            : file.endsWith('.jsx')
              ? 'jsx'
              : /\.[cm]?ts$/.test(file)
                ? 'ts'
                : 'js';
          try {
            for (const dependency of new Bun.Transpiler({ loader }).scanImports(
              readFileSync(file, 'utf8')
            )) {
              try {
                const path = Bun.resolveSync(dependency.path, dirname(file));
                if (existsSync(path)) inputs.add(path);
              } catch {
                /* Builtins/external imports do not identify local files. */
              }
            }
          } catch {
            /* Platform loaders may have transformed the original syntax. */
          }
        }
      }
      return [...inputs];
    },
  };
}
