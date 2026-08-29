import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const apiTarget = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@zamanushka/game-engine': fileURLToPath(
        new URL('../../packages/game-engine/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    proxy: {
      '/api': apiTarget,
      '/health': apiTarget,
      '/ready': apiTarget,
    },
  },
  test: { environment: 'jsdom', setupFiles: './src/test-setup.ts' },
});
