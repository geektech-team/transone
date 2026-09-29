import { defineConfig } from 'transone-cli';

export default defineConfig({
  entry: 'src/main.ts',
  pages: {},
  server: {
    port: 52312,
  },
  build: {
    outDir: 'dist/web',
  },
  mp: {
    navigationBarTitleText: 'transone-ui 组件演示',
    'mp-weixin': {
      appId: 'wx5ce4dae29058e087',
    },
  },
});
