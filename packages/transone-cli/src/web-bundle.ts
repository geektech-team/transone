import { createWebStylesPlugin } from './web-styles';
import { buildOutputPath } from './output-transaction';
import { createBundleInputTracker } from './bundle-inputs';
import type { WebComponentContext } from './components/web';

/** Persist only the final bundle, retaining runtime cascade for shared selectors. */
export async function buildWebBundle(
  options: Parameters<typeof Bun.build>[0] & { outdir: string },
  components?: WebComponentContext
) {
  // Omitting outdir is Bun's supported in-memory build mode.
  const { outdir, ...inMemoryOptions } = options;
  const inputs = createBundleInputTracker();
  let stylesPlugin = createWebStylesPlugin(new Set(), components?.transform);
  const buildOptions = {
    ...inMemoryOptions,
    metafile: true,
    ...(components?.active ? { entrypoints: [components.entrypoint] } : {}),
  };
  const plugins = () => [
    inputs.plugin,
    ...(inMemoryOptions.plugins ?? []),
    ...(components?.active ? [components.plugin] : []),
    stylesPlugin,
  ];
  let result = await Bun.build({ ...buildOptions, plugins: plugins() });
  if (
    result.success &&
    stylesPlugin.styles.size &&
    stylesPlugin.runtimeFiles.size
  ) {
    stylesPlugin = createWebStylesPlugin(
      stylesPlugin.runtimeFiles,
      components?.transform
    );
    result = await Bun.build({ ...buildOptions, plugins: plugins() });
  }
  const outputs: { path: string; kind: string; type: string }[] = [];
  if (result.success) {
    for (const output of result.outputs) {
      const path = buildOutputPath(outdir, output.path);
      const contents = await output.arrayBuffer();
      await Bun.write(path, contents);
      outputs.push({ path, kind: output.kind, type: output.type });
    }
  }
  return {
    result: { success: result.success, logs: result.logs, outputs },
    styles: stylesPlugin.styles,
    inputPaths: inputs.paths(result),
  };
}
