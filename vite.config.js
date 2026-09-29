import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_BFF_TARGET || 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
