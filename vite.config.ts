import { defineConfig, type Plugin } from 'vitest/config';

// Unique per build: commit SHA on CI (GitHub Actions), timestamp otherwise.
const APP_VERSION = process.env.GITHUB_SHA ?? `local-${Date.now()}`;

/** Emits dist/version.json so running clients can detect a newer deploy. */
const versionFile = (): Plugin => ({
  name: 'rr-version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) });
  },
});

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [versionFile()],
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
