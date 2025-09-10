import { defineConfig } from '@rstest/core';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    testTimeout: 10000,
    globals: true,
    testEnvironment: 'node',
  },
});