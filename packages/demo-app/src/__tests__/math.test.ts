import { expect, test, describe } from '@rstest/core';
import { add, multiply, greet } from '../utils.js';

describe('Math utilities', () => {
  test('should add numbers correctly', () => {
    expect(add(2, 3)).toBe(5);
    expect(add(-1, 1)).toBe(0);
    expect(add(0, 0)).toBe(0);
  });

  test('should multiply numbers correctly', () => {
    expect(multiply(3, 4)).toBe(12);
    expect(multiply(0, 100)).toBe(0);
    expect(multiply(-2, 3)).toBe(-6);
  });

  test('should handle edge cases', () => {
    expect(add(0.1, 0.2)).toBeCloseTo(0.3);
    expect(multiply(Infinity, 0)).toBeNaN();
  });
});

describe('String utilities', () => {
  test('should greet users correctly', () => {
    expect(greet('Alice')).toBe('Hello, Alice!');
    expect(greet('')).toBe('Hello, !');
  });
  
  test('should handle special characters in names', () => {
    expect(greet('José')).toBe('Hello, José!');
    expect(greet('王小明')).toBe('Hello, 王小明!');
  });
});