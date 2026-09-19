import { defineConfig } from 'transone-cli';
import { docRoutes } from './src/content';

/**
 * TransOne 主文档站配置。
 *
 * 站点由 transone 构建：一份源码经
 * `transone build` 静态转换为多页 HTML，可部署到
 * GitHub Pages 子路径（CI 通过 `--base /transone/` 注入，本地开发留空）。
 *
 * 所有路由共用同一个入口 `src/main.ts`：入口在模块作用域读取
 * `window.location.pathname` 推导 base 与当前路由，SSR 与客户端同构。
 */
export default defineConfig({
  entry: 'src/main.ts',
  pages: Object.fromEntries(
    docRoutes
      .filter((route) => route !== '/')
      .map((route) => [route, 'src/main.ts'])
  ),
  server: {
    port: 52313,
  },
  build: {
    outDir: 'dist',
    basePath: '',
    directoryPages: true,
  },
});
