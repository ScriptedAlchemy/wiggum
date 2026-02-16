import { expect, test, describe } from '@rstest/core';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import stripAnsi from 'strip-ansi';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the CLI script
const CLI_PATH = path.join(__dirname, '../bin/cli.js');
const SEMVER_OR_RSPACK_VERSION = /^(?:\d+\.\d+\.\d+|rspack\/\d+\.\d+\.\d+(?:\s+.+)?)$/;

// Helper function to run CLI commands
function runCLI(args, options = {}) {
  try {
    const result = execSync(`node ${CLI_PATH} ${args}`, {
      encoding: 'utf8',
      timeout: 30000, // 30 second timeout
      env: {
        ...process.env,
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        CLICOLOR: '0',
        CLICOLOR_FORCE: '0'
      },
      ...options
    });
    return { stdout: stripAnsi(result), stderr: '', exitCode: 0 };
  } catch (error) {
    return {
      stdout: stripAnsi(error.stdout || ''),
      stderr: stripAnsi(error.stderr || ''),
      exitCode: error.status || 1
    };
  }
}

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

  describe('Wiggum-specific flags', () => {
    test('--help should show wiggum help', () => {
      const result = runCLI('--help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage: wiggum <command> [options]');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('passthrough CLI');
    });

    test('-h should show wiggum help', () => {
      const result = runCLI('-h');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage: wiggum <command> [options]');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('passthrough CLI');
    });

    test('--version should show wiggum version', () => {
      const result = runCLI('--version');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('wiggum v');
    });

    test('agent --help should show agent command help', () => {
      const result = runCLI('agent --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Wiggum Agent - OpenCode Integration');
      expect(result.stdout).toContain('wiggum agent [command] [options]');
    });
  });

  describe('Complex flag combinations', () => {
    test('build --mode production --help should forward all flags', () => {
      const result = runCLI('build --mode production --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('rsbuild');
      expect(result.stdout).toContain('Usage:');
    });

    test('pack --config webpack.config.js --version should forward all flags', () => {
      const result = runCLI('pack --config webpack.config.js --version');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toMatch(SEMVER_OR_RSPACK_VERSION);
    });

    test('should handle invalid commands gracefully', () => {
      const result = runCLI('nonexistent --version');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown command: nonexistent');
    });
  });
});