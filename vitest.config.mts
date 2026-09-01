import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './'),
      'server-only': path.resolve(import.meta.dirname, './__tests__/mocks/server-only.ts'),
    },
  },
});
