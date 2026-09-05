import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 20_000,
    include: ['src/tests/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['src/tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/core/**', 'src/policies/**', 'src/events/**', 'src/services/**', 'src/adapters/**'],
    },
  },
});
