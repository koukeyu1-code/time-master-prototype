import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    host: '127.0.0.1',
    proxy: {
      '/login': {
        target: process.env.VITE_BFF_TARGET || 'http://localhost:8787',
        changeOrigin: false,
      },
      '/api': {
        target: process.env.VITE_BFF_TARGET || 'http://localhost:8787',
        changeOrigin: false,
      },
    },
  },
});
