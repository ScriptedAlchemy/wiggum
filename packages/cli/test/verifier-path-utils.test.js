import { describe, test, expect } from '@rstest/core';
import {
  ensureEnvObject,
  ensureNonEmptyRootPath,
  normalizeEnvPathOverride,
  readEnvPathOverride,
} from '../scripts/verifier-path-utils.mjs';

describe('verifier path utility helpers', () => {
  test('normalizeEnvPathOverride returns undefined for undefined value', () => {
    expect(normalizeEnvPathOverride(undefined)).toBeUndefined();
  });

  test('normalizeEnvPathOverride trims values and returns undefined for blank strings', () => {
    expect(normalizeEnvPathOverride('  /repo/custom  ')).toBe('/repo/custom');
    expect(normalizeEnvPathOverride('   ')).toBeUndefined();
  });

  test('ensureEnvObject rejects null and arrays', () => {
    expect(() => ensureEnvObject(null)).toThrow('env must be an object');
    expect(() => ensureEnvObject([])).toThrow('env must be an object');
    expect(() => ensureEnvObject('invalid')).toThrow('env must be an object');
  });

  test('ensureNonEmptyRootPath validates string root values', () => {
    expect(ensureNonEmptyRootPath(' /repo ', 'fallbackRoot')).toBe('/repo');
    expect(() => ensureNonEmptyRootPath(123, 'fallbackRoot')).toThrow(
      'fallbackRoot must be a string path',
    );
    expect(() => ensureNonEmptyRootPath('', 'fallbackRoot')).toThrow(
      'fallbackRoot must be a non-empty string path',
    );
  });

  test('readEnvPathOverride returns undefined for missing key', () => {
    expect(readEnvPathOverride({}, 'WIGGUM_RUNNER_VERIFY_ROOT')).toBeUndefined();
  });

  test('readEnvPathOverride validates non-string values and trims strings', () => {
    expect(() =>
      readEnvPathOverride({ WIGGUM_RUNNER_VERIFY_ROOT: 42 }, 'WIGGUM_RUNNER_VERIFY_ROOT'),
    ).toThrow('WIGGUM_RUNNER_VERIFY_ROOT must be a string when provided');
    expect(
      readEnvPathOverride(
        { WIGGUM_RUNNER_VERIFY_ROOT: ' /repo/override ' },
        'WIGGUM_RUNNER_VERIFY_ROOT',
      ),
    ).toBe('/repo/override');
    expect(
      readEnvPathOverride(
        { WIGGUM_RUNNER_VERIFY_ROOT: '   ' },
        'WIGGUM_RUNNER_VERIFY_ROOT',
      ),
    ).toBeUndefined();
  });
});
