import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const rudderTarget = 'http://127.0.0.1:41789';

export default defineConfig({
  root: 'frontend',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../dist/frontend',
    emptyOutDir: false,
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': rudderTarget,
      '/events': rudderTarget,
      '/icon.svg': rudderTarget,
    },
  },
});
