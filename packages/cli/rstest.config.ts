import { defineConfig } from '@rstest/core';

export default defineConfig({
  // Test include patterns
  include: [
    'test/**/*.test.js',
    'test/**/*.test.mjs',
    'test/**/*.test.ts'
  ],
  
  // Test environment for Node.js
  testEnvironment: 'node',
  
  // Global test timeout
  testTimeout: 10000
});