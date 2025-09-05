import { defineConfig } from '@rstest/core';

export default defineConfig({
  // Test match patterns
  testMatch: [
    '**/__tests__/**/*.(test|spec).ts',
    '**/?(*.)(test|spec).ts'
  ],
  
  // Test environment
  environment: 'jsdom',
  
  // Coverage configuration
  coverage: {
    reporter: ['text', 'html', 'json'],
    reportsDirectory: './coverage',
    include: ['src/**/*.ts'],
    exclude: [
      'node_modules/',
      'build/',
      '**/*.d.ts',
      '**/*.config.ts'
    ]
  },
  
  // Setup files
  setupFiles: [
    './tests/setup.ts'
  ],
  
  // Global test timeout
  testTimeout: 10000,
  
  // Reporter configuration
  reporters: ['default'],
  
  // Watch mode settings
  watchOptions: {
    ignored: ['node_modules/**', 'build/**']
  }
});