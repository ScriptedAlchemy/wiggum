import { expect, test, describe, afterEach } from '@rstest/core';
import {
  createTempDirManager,
  runCliCommand as runCLI,
} from './helpers/cli-test-helpers.js';

const SEMVER_OR_RSPACK_VERSION = /^(?:\d+\.\d+\.\d+|rspack\/\d+\.\d+\.\d+(?:\s+.+)?)$/;
const tempDirManager = createTempDirManager('wiggum-cli-test-');

afterEach(() => {
  tempDirManager.cleanup();
});

describe('Wiggum CLI Passthrough Tests', () => {
  describe('--version flag passthrough', () => {
    test('pack --version should return rspack version', () => {
      const result = runCLI('pack --version');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(SEMVER_OR_RSPACK_VERSION);
    });

    test('doc --version should return rspress version', () => {
      const result = runCLI('doc --version');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Rspress');
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    test('lib --version should return rslib version', () => {
      const result = runCLI('lib --version');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Rslib');
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    test('test --version should return rstest version', () => {
      const result = runCLI('test --version');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('rstest');
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    test('build --version should return rsbuild version', () => {
      const result = runCLI('build --version');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Rsbuild');
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('--help flag passthrough', () => {
    test('pack --help should return rspack help', () => {
      const result = runCLI('pack --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('rspack');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('Options:');
    });

    test('doc --help should return rspress help', () => {
      const result = runCLI('doc --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('rspress');
      expect(result.stdout).toContain('Usage:');
    });

    test('build --help should return rsbuild help', () => {
      const result = runCLI('build --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('rsbuild');
      expect(result.stdout).toContain('Usage:');
    });

    test('lib --help should return rslib help', () => {
      const result = runCLI('lib --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('rslib');
      expect(result.stdout).toContain('Usage:');
    });

    test('test --help should return rstest help', () => {
      const result = runCLI('test --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('rstest');
      expect(result.stdout).toContain('Usage:');
    });
  });

  describe('-v flag passthrough (short version)', () => {
    test('pack -v should return rspack version', () => {
      const result = runCLI('pack -v');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(SEMVER_OR_RSPACK_VERSION);
    });

    test('doc -v should return rspress version', () => {
      const result = runCLI('doc -v');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Rspress');
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    test('lib -v should return rslib version', () => {
      const result = runCLI('lib -v');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Rslib');
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    test('test -v should return rstest version', () => {
      const result = runCLI('test -v');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('rstest');
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    test('build -v should return rsbuild version', () => {
      const result = runCLI('build -v');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Rsbuild');
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe('-h flag passthrough (short help)', () => {
    test('pack -h should return rspack help', () => {
      const result = runCLI('pack -h');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('rspack');
      expect(result.stdout).toContain('Commands:');
    });

    test('doc -h should return rspress help', () => {
      const result = runCLI('doc -h');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('rspress');
      expect(result.stdout).toContain('Usage:');
    });

    test('lib -h should return rslib help', () => {
      const result = runCLI('lib -h');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('rslib');
      expect(result.stdout).toContain('Usage:');
    });

    test('test -h should return rstest help', () => {
      const result = runCLI('test -h');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('rstest');
      expect(result.stdout).toContain('Usage:');
    });

    test('build -h should return rsbuild help', () => {
      const result = runCLI('build -h');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('rsbuild');
      expect(result.stdout).toContain('Usage:');
    });
  });
});
