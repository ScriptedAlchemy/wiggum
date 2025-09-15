import { defineConfig } from '@rstest/core';

export default defineConfig({
  include: [
    'src/__tests__/**/*.test.ts',
    'src/__tests__/**/*.test.tsx',
    'src/__tests__/**/*.spec.ts',
    'src/__tests__/**/*.spec.tsx',
    'tests/unit/**/*.test.ts',
    'tests/unit/**/*.spec.ts'
  ],
  ignore: ['tests/e2e/**'],
  testEnvironment: 'jsdom',
  testTimeout: 10000
});
