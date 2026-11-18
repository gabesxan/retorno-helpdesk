import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 4178,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3340',
        changeOrigin: false,
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4178,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3340',
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
