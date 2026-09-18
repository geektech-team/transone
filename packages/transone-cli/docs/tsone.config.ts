import { defineConfig } from '@geektech/tsone-cli';
import { docRoutes } from './src/content';

/**
 * TransOne CLI 文档子站配置。
 *
 * 与主文档站同构，由 @geektech/tsone 构建；部署在 GitHub Pages 子路径
 * /transone/cli/（CI 通过 `--base /transone/cli/` 注入，本地开发留空）。
 */
export default defineConfig({
  entry: 'src/main.ts',
  pages: Object.fromEntries(
    docRoutes
      .filter((route) => route !== '/')
      .map((route) => [route, 'src/main.ts'])
  ),
  server: {
    port: 52314,
  },
  build: {
    outDir: 'dist',
    basePath: '',
    directoryPages: true,
  },
});
