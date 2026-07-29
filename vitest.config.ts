import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec,property}.ts', '**/*.{test,spec,property}.ts'],
    exclude: ['node_modules', 'dist', 'infrastructure'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist', 'infrastructure', 'tests'],
    },
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared/src'),
      '@backend': resolve(__dirname, 'backend/src'),
      '@frontend': resolve(__dirname, 'frontend/src'),
    },
  },
});
