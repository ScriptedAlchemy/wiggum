import { defineConfig } from '@rstest/core';

export default defineConfig({
  // Test include patterns
  include: [
    '**/__tests__/**/*.(test|spec).ts',
    '**/?(*.)(test|spec).ts'
  ],
  
  // Test environment
  testEnvironment: 'jsdom',
  
  // Setup files
  setupFiles: [
    './tests/setup.ts'
  ],
  
  // Global test timeout
  testTimeout: 10000
});