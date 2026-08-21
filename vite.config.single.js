import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/* 单文件构建：全部 JS/CSS/字体内联进一个 index.html，供静态托管/海报二维码演示 */
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  build: {
    outDir: 'dist-single',
    assetsInlineLimit: 100 * 1024 * 1024,
  },
});
