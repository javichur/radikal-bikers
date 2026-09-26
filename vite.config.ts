import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/sim/**', 'src/input/**', 'src/content/**', 'src/ui/i18n.ts', 'src/ui/locales/**'],
      reporter: ['text', 'html'],
      thresholds: { lines: 80, functions: 80, branches: 70 },
    },
  },
});
