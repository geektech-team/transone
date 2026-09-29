import { defineConfig } from 'transone-cli';

export default defineConfig({
  entry: 'src/main.ts',
  server: {
    port: 52331,
  },
  build: {
    outDir: 'dist/web',
  },
  mp: {
    // host: 'https://api.example.com', // 默认接口地址，平台配置可覆盖
    navigationBarTitleText: 'TransOne 图表 Demo',
    'mp-weixin': {
      appId: 'wx5ce4dae29058e087',
    },
  },
});
