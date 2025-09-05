// Test setup file for rstest
// This file runs before each test file

// Setup DOM environment
import { expect, beforeAll } from '@rstest/core';

// Configure global test environment
beforeAll(() => {
  // Setup global mocks or configurations
  console.log('🧪 Test environment initialized with rstest');
});

// Custom matchers or test utilities can be added here
export {};