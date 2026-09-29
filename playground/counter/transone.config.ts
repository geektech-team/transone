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
    navigationBarTitleText: 'TransOne 演练',
    'mp-weixin': {
      appId: 'wx5ce4dae29058e087',
    },
  },
  app: {
    appName: 'TransOne Counter',
    bundleId: 'com.geektech.transone.counter',
    pages: {
      '/': 'src/app.ts',
    },
  },
});
