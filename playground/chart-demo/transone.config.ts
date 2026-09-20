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
    'mp-weixin': {
      appId: 'wx5ce4dae29058e087',
      navigationBarTitleText: 'TransOne 图表 Demo',
    },
  },
});
