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
    // 按平台分组：--target mp-weixin / mp-alipay / mp-bytedance 时各取对应配置
    'mp-weixin': {
      appId: 'wx5ce4dae29058e087',
      navigationBarTitleText: 'TransOne 演练',
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
