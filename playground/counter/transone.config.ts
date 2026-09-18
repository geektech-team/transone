import { defineConfig } from 'transone-cli';

export default defineConfig({
  entry: 'src/main.ts',
  pages: {
    '/about': 'src/pages/about.ts',
  },
  server: {
    port: 52311,
  },
  build: {
    outDir: 'dist/web',
  },
  mp: {
    appId: 'wx5ce4dae29058e087',
    navigationBarTitleText: 'TransOne 演练',
  },
});
