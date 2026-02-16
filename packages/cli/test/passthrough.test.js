import { expect, test, describe, afterEach } from '@rstest/core';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import stripAnsi from 'strip-ansi';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the CLI script
const CLI_PATH = path.join(__dirname, '../bin/cli.js');
const SEMVER_OR_RSPACK_VERSION = /^(?:\d+\.\d+\.\d+|rspack\/\d+\.\d+\.\d+(?:\s+.+)?)$/;
const tempDirs = [];

// Helper function to run CLI commands
function runCLI(args, options = {}) {
  try {
    const result = execSync(`"${process.execPath}" "${CLI_PATH}" ${args}`, {
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

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wiggum-cli-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
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

  describe('Wiggum-specific flags', () => {
    test('--help should show wiggum help', () => {
      const result = runCLI('--help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage: wiggum <command> [options]');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('passthrough CLI');
      expect(result.stdout).toContain('--autofix');
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
      expect(result.stdout).toContain('serve | server');
      expect(result.stdout).toContain('-p <port>');
      expect(result.stdout).toContain('-p=<port>');
      expect(result.stdout).toContain('--host=<host>');
    });

    test('agent run reports missing OpenCode binary', () => {
      const root = makeTempDir();
      const emptyPathDir = path.join(root, 'empty-bin');
      fs.mkdirSync(emptyPathDir, { recursive: true });

      const result = runCLI('agent run status', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${path.dirname(process.execPath)}:${emptyPathDir}`,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('OpenCode is not installed');
    });

    test('agent run forwards command to opencode binary', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(
        fakeOpenCodePath,
        '#!/usr/bin/env bash\necho \"fake-opencode:$@\"\nexit 0\n',
        { mode: 0o755 },
      );
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent run status', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Running: opencode status');
      expect(result.stdout).toContain('fake-opencode:status');
    });

    test('agent run preserves --autofix as command argument', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(
        fakeOpenCodePath,
        '#!/usr/bin/env bash\necho \"fake-opencode:$@\"\nexit 0\n',
        { mode: 0o755 },
      );
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent run session --autofix', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Running: opencode session --autofix');
      expect(result.stdout).toContain('fake-opencode:session --autofix');
    });

    test('agent command still runs when global --autofix precedes command token', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(
        fakeOpenCodePath,
        '#!/usr/bin/env bash\necho \"fake-opencode:$@\"\nexit 0\n',
        { mode: 0o755 },
      );
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('--autofix agent run session', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Running: opencode session');
      expect(result.stdout).toContain('fake-opencode:session');
    });

    test('agent chat requires interactive terminal', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(fakeOpenCodePath, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent chat', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('requires an interactive terminal');
    });

    test('agent default command requires interactive terminal', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(fakeOpenCodePath, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('requires an interactive terminal');
    });

    test('agent serve forwards port and hostname flags', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(
        fakeOpenCodePath,
        '#!/usr/bin/env bash\necho \"fake-opencode:$@\"\nexit 0\n',
        { mode: 0o755 },
      );
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent serve --port 4096 --hostname 127.0.0.1', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Starting OpenCode server...');
      expect(result.stdout).toContain('Command: opencode serve --port 4096 --hostname 127.0.0.1');
      expect(result.stdout).toContain('fake-opencode:serve --port 4096 --hostname 127.0.0.1');
    });

    test('agent server alias forwards port and hostname flags', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(
        fakeOpenCodePath,
        '#!/usr/bin/env bash\necho \"fake-opencode:$@\"\nexit 0\n',
        { mode: 0o755 },
      );
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent server --port 4010 --hostname 127.0.0.1', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Command: opencode serve --port 4010 --hostname 127.0.0.1');
      expect(result.stdout).toContain('fake-opencode:serve --port 4010 --hostname 127.0.0.1');
    });

    test('agent serve --help does not require OpenCode binary', () => {
      const root = makeTempDir();
      const emptyPathDir = path.join(root, 'empty-bin');
      fs.mkdirSync(emptyPathDir, { recursive: true });

      const result = runCLI('agent serve --help', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${path.dirname(process.execPath)}:${emptyPathDir}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage: wiggum agent serve');
      expect(result.stdout).toContain('--port <port>');
      expect(result.stdout).toContain('-p <port>');
      expect(result.stdout).toContain('--host <host>');
      expect(result.stdout).toContain('--port=<port>');
      expect(result.stdout).toContain('-p=<port>');
      expect(result.stdout).toContain('--host=<host>');
    });

    test('agent serve -h does not require OpenCode binary', () => {
      const root = makeTempDir();
      const emptyPathDir = path.join(root, 'empty-bin');
      fs.mkdirSync(emptyPathDir, { recursive: true });

      const result = runCLI('agent serve -h', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${path.dirname(process.execPath)}:${emptyPathDir}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage: wiggum agent serve');
      expect(result.stdout).toContain('--hostname <host>');
      expect(result.stdout).toContain('-H <host>');
      expect(result.stdout).toContain('-H=<host>');
    });

    test('agent server --help does not require OpenCode binary', () => {
      const root = makeTempDir();
      const emptyPathDir = path.join(root, 'empty-bin');
      fs.mkdirSync(emptyPathDir, { recursive: true });

      const result = runCLI('agent server --help', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${path.dirname(process.execPath)}:${emptyPathDir}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage: wiggum agent serve');
      expect(result.stderr).not.toContain('OpenCode is not installed');
    });

    test('agent serve help ignores trailing invalid flags', () => {
      const root = makeTempDir();
      const emptyPathDir = path.join(root, 'empty-bin');
      fs.mkdirSync(emptyPathDir, { recursive: true });

      const result = runCLI('agent serve --help --mystery', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${path.dirname(process.execPath)}:${emptyPathDir}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage: wiggum agent serve');
      expect(result.stderr).not.toContain('Unknown serve option');
    });

    test('agent serve accepts --port= and --hostname= forms', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(
        fakeOpenCodePath,
        '#!/usr/bin/env bash\necho \"fake-opencode:$@\"\nexit 0\n',
        { mode: 0o755 },
      );
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent serve --port=4500 --hostname=0.0.0.0', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Command: opencode serve --port 4500 --hostname 0.0.0.0');
      expect(result.stdout).toContain('fake-opencode:serve --port 4500 --hostname 0.0.0.0');
    });

    test('agent serve accepts --host alias for hostname', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(
        fakeOpenCodePath,
        '#!/usr/bin/env bash\necho \"fake-opencode:$@\"\nexit 0\n',
        { mode: 0o755 },
      );
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent serve --port 4500 --host 127.0.0.1', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Command: opencode serve --port 4500 --hostname 127.0.0.1');
      expect(result.stdout).toContain('fake-opencode:serve --port 4500 --hostname 127.0.0.1');
    });

    test('agent serve accepts --host= alias form', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(
        fakeOpenCodePath,
        '#!/usr/bin/env bash\necho \"fake-opencode:$@\"\nexit 0\n',
        { mode: 0o755 },
      );
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent serve --port 4500 --host=127.0.0.1', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Command: opencode serve --port 4500 --hostname 127.0.0.1');
      expect(result.stdout).toContain('fake-opencode:serve --port 4500 --hostname 127.0.0.1');
    });

    test('agent serve accepts short aliases for port and hostname', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(
        fakeOpenCodePath,
        '#!/usr/bin/env bash\necho \"fake-opencode:$@\"\nexit 0\n',
        { mode: 0o755 },
      );
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent serve -p 4300 -H localhost', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Command: opencode serve --port 4300 --hostname localhost');
      expect(result.stdout).toContain('fake-opencode:serve --port 4300 --hostname localhost');
    });

    test('agent serve accepts short alias equals forms', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(
        fakeOpenCodePath,
        '#!/usr/bin/env bash\necho \"fake-opencode:$@\"\nexit 0\n',
        { mode: 0o755 },
      );
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent serve -p=4400 -H=127.0.0.1', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Command: opencode serve --port 4400 --hostname 127.0.0.1');
      expect(result.stdout).toContain('fake-opencode:serve --port 4400 --hostname 127.0.0.1');
    });

    test('agent serve validates invalid port values', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(fakeOpenCodePath, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent serve --port=99999', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid --port value "99999"');
    });

    test('agent serve rejects non-numeric port values', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(fakeOpenCodePath, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent serve --port=abc', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid --port value "abc"');
    });

    test('agent serve rejects partially numeric port values', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(fakeOpenCodePath, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent serve --port=123abc', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid --port value "123abc"');
    });

    test('agent serve requires value for --port', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(fakeOpenCodePath, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent serve --port', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Missing value for --port');
    });

    test('agent serve requires value for short -p alias', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(fakeOpenCodePath, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent serve -p', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Missing value for --port');
    });

    test('agent serve requires value for --hostname', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(fakeOpenCodePath, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent serve --hostname', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Missing value for --hostname');
    });

    test('agent serve requires value for --host alias', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(fakeOpenCodePath, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent serve --host', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Missing value for --hostname');
    });

    test('agent serve requires value for short -H alias', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(fakeOpenCodePath, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent serve -H', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Missing value for --hostname');
    });

    test('agent serve rejects empty hostname values', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(fakeOpenCodePath, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent serve --hostname=', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid --hostname value');
    });

    test('agent serve rejects empty --host alias values', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(fakeOpenCodePath, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent serve --host=', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Invalid --hostname value');
    });

    test('agent serve rejects unknown options', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(fakeOpenCodePath, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('agent serve --mystery 1', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown serve option: --mystery');
    });

    test('agent serve rejects unexpected positional arguments', () => {
      const root = makeTempDir();
      const emptyPathDir = path.join(root, 'empty-bin');
      fs.mkdirSync(emptyPathDir, { recursive: true });

      const result = runCLI('agent serve localhost', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${path.dirname(process.execPath)}:${emptyPathDir}`,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unexpected serve argument: localhost');
    });

    test('agent serve rejects duplicate port options', () => {
      const root = makeTempDir();
      const emptyPathDir = path.join(root, 'empty-bin');
      fs.mkdirSync(emptyPathDir, { recursive: true });

      const result = runCLI('agent serve --port 3000 --port 4000', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${path.dirname(process.execPath)}:${emptyPathDir}`,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Duplicate --port option provided.');
    });

    test('agent serve rejects duplicate hostname options', () => {
      const root = makeTempDir();
      const emptyPathDir = path.join(root, 'empty-bin');
      fs.mkdirSync(emptyPathDir, { recursive: true });

      const result = runCLI('agent serve -H localhost --hostname 0.0.0.0', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${path.dirname(process.execPath)}:${emptyPathDir}`,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Duplicate --hostname option provided.');
    });

    test('agent serve rejects duplicate hostname aliases', () => {
      const root = makeTempDir();
      const emptyPathDir = path.join(root, 'empty-bin');
      fs.mkdirSync(emptyPathDir, { recursive: true });

      const result = runCLI('agent serve --host localhost --hostname 0.0.0.0', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${path.dirname(process.execPath)}:${emptyPathDir}`,
        },
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Duplicate --hostname option provided.');
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

    test('should handle invalid commands gracefully', () => {
      const result = runCLI('nonexistent --version');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown command: nonexistent');
    });
  });
});