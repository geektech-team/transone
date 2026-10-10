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
  },
  mp: {
    // host: 'https://api.example.com', // 默认接口地址，平台配置可覆盖
    navigationBarTitleText: 'TransOne 演练',
    'mp-weixin': {
      appId: 'wx5ce4dae29058e087',
    },
  },
  app: {
    // host: 'https://api.example.com', // 写入原生工程配置
    appName: 'TransOne Counter',
    bundleId: 'com.geektech.transone.counter',
    pages: {
      '/': 'src/app.ts',
    },
  },
});
