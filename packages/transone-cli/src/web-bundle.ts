import { createWebStylesPlugin } from './web-styles';
import { resolve } from 'node:path';

/** Persist only the final bundle, retaining runtime cascade for shared selectors. */
export async function buildWebBundle(
  options: Parameters<typeof Bun.build>[0] & { outdir: string }
) {
  // Omitting outdir is Bun's supported in-memory build mode.
  const { outdir, ...inMemoryOptions } = options;
  let stylesPlugin = createWebStylesPlugin();
  let result = await Bun.build({ ...inMemoryOptions, plugins: [stylesPlugin] });
  if (
    result.success &&
    stylesPlugin.styles.size &&
    stylesPlugin.runtimeFiles.size
  ) {
    stylesPlugin = createWebStylesPlugin(stylesPlugin.runtimeFiles);
    result = await Bun.build({ ...inMemoryOptions, plugins: [stylesPlugin] });
  }
  const outputs: { path: string; kind: string; type: string }[] = [];
  if (result.success) {
    for (const output of result.outputs) {
      const path = resolve(outdir, output.path);
      const contents = await output.arrayBuffer();
      await Bun.write(path, contents);
      outputs.push({ path, kind: output.kind, type: output.type });
    }
  }
  return {
    result: { success: result.success, logs: result.logs, outputs },
    styles: stylesPlugin.styles,
  };
}
