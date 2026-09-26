import { defineConfig } from 'vitest/config';
export default defineConfig({ define: { __APP_VERSION__: '"x"' }, test: { include: ['tests/probe/**/*.test.ts'], environment: 'node' } });
