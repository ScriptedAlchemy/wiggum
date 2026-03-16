import { expect, test, describe, afterEach } from '@rstest/core';
import fs from 'fs';
import path from 'path';
import {
  createTempDirManager,
  runCliCommand as runCLI,
} from './helpers/cli-test-helpers.js';

const SEMVER_OR_RSPACK_VERSION = /^(?:\d+\.\d+\.\d+|rspack\/\d+\.\d+\.\d+(?:\s+.+)?)$/;
const tempDirManager = createTempDirManager('wiggum-cli-test-');

function makeTempDir() {
  return tempDirManager.makeTempDir();
}

afterEach(() => {
  tempDirManager.cleanup();
});

describe('Wiggum CLI Passthrough Tests', () => {
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

    test('build forwards --autofix when passed after delimiter', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeRsbuildPath = path.join(binDir, 'rsbuild');
      fs.writeFileSync(
        fakeRsbuildPath,
        '#!/usr/bin/env bash\necho \"fake-rsbuild:$@\"\nexit 0\n',
        { mode: 0o755 },
      );
      fs.chmodSync(fakeRsbuildPath, 0o755);

      const result = runCLI('build -- --autofix', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('fake-rsbuild:-- --autofix');
    });

    test('global --autofix triggers prompt flow for passthrough failures', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeRsbuildPath = path.join(binDir, 'rsbuild');
      fs.writeFileSync(
        fakeRsbuildPath,
        '#!/usr/bin/env bash\necho \"pass stdout\"\necho \"pass stderr\" 1>&2\nexit 2\n',
        { mode: 0o755 },
      );
      fs.chmodSync(fakeRsbuildPath, 0o755);

      const result = runCLI('build --autofix', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
          WIGGUM_AUTOFIX_MODE: 'prompt',
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('[autofix] Prompt-only mode enabled.');
      expect(result.stdout).toContain('Command failed: wiggum rsbuild');
      expect(result.stdout).toContain('pass stdout');
      expect(result.stdout).toContain('pass stderr');
    });

    test('leading global --autofix triggers prompt flow for passthrough failures', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeRsbuildPath = path.join(binDir, 'rsbuild');
      fs.writeFileSync(
        fakeRsbuildPath,
        '#!/usr/bin/env bash\necho \"pass stdout\"\necho \"pass stderr\" 1>&2\nexit 2\n',
        { mode: 0o755 },
      );
      fs.chmodSync(fakeRsbuildPath, 0o755);

      const result = runCLI('--autofix build', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
          WIGGUM_AUTOFIX_MODE: 'prompt',
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('[autofix] Prompt-only mode enabled.');
      expect(result.stdout).toContain('Command failed: wiggum rsbuild');
      expect(result.stdout).toContain('pass stdout');
      expect(result.stdout).toContain('pass stderr');
    });

    test('leading global --autofix keeps delimiter-passed tool args', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeRsbuildPath = path.join(binDir, 'rsbuild');
      fs.writeFileSync(
        fakeRsbuildPath,
        '#!/usr/bin/env bash\necho \"pass stdout\"\necho \"pass stderr\" 1>&2\nexit 2\n',
        { mode: 0o755 },
      );
      fs.chmodSync(fakeRsbuildPath, 0o755);

      const result = runCLI('--autofix build -- --autofix', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
          WIGGUM_AUTOFIX_MODE: 'prompt',
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('[autofix] Prompt-only mode enabled.');
      expect(result.stdout).toContain('Command failed: wiggum rsbuild -- --autofix');
      expect(result.stdout).toContain('pass stdout');
      expect(result.stdout).toContain('pass stderr');
    });

    test('inline global --autofix keeps delimiter-passed tool args', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeRsbuildPath = path.join(binDir, 'rsbuild');
      fs.writeFileSync(
        fakeRsbuildPath,
        '#!/usr/bin/env bash\necho \"pass stdout\"\necho \"pass stderr\" 1>&2\nexit 2\n',
        { mode: 0o755 },
      );
      fs.chmodSync(fakeRsbuildPath, 0o755);

      const result = runCLI('build --autofix -- --autofix', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
          WIGGUM_AUTOFIX_MODE: 'prompt',
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('[autofix] Prompt-only mode enabled.');
      expect(result.stdout).toContain('Command failed: wiggum rsbuild -- --autofix');
      expect(result.stdout).toContain('pass stdout');
      expect(result.stdout).toContain('pass stderr');
    });

    test('should handle invalid commands gracefully', () => {
      const result = runCLI('nonexistent --version');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown command: nonexistent');
    });

    test('should handle invalid commands with leading global --autofix gracefully', () => {
      const result = runCLI('--autofix nonexistent --version');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown command: nonexistent');
    });
  });
});
