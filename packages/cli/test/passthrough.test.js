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

    test('--autofix without command shows usage error', () => {
      const result = runCLI('--autofix');
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('Usage: wiggum <command> [options]');
    });

    test('--autofix --version should still show wiggum version', () => {
      const result = runCLI('--autofix --version');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('wiggum v');
    });

    test('--autofix --help should still show wiggum help', () => {
      const result = runCLI('--autofix --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage: wiggum <command> [options]');
      expect(result.stdout).toContain('--autofix');
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

    test('leading global --autofix still allows agent --help', () => {
      const result = runCLI('--autofix agent --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Wiggum Agent - OpenCode Integration');
      expect(result.stdout).toContain('wiggum agent [command] [options]');
    });

    test('leading global --autofix still allows agent serve --help', () => {
      const result = runCLI('--autofix agent serve --help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage: wiggum agent serve');
      expect(result.stdout).toContain('--port <port>');
      expect(result.stdout).toContain('--hostname <host>');
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

    test('agent command preserves --autofix token when placed after command token', () => {
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

      const result = runCLI('agent --autofix run session', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Running: opencode --autofix run session');
      expect(result.stdout).toContain('fake-opencode:--autofix run session');
    });

    test('agent run consumes leading global --autofix but preserves trailing token', () => {
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

      const result = runCLI('--autofix agent run session --autofix', {
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

    test('agent run preserves delimiter passthrough args with leading global --autofix', () => {
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

      const result = runCLI('--autofix agent run session -- --autofix', {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH || ''}`,
        },
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Running: opencode session -- --autofix');
      expect(result.stdout).toContain('fake-opencode:session -- --autofix');
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

    test('agent default command still requires interactive terminal with leading global --autofix', () => {
      const root = makeTempDir();
      const binDir = path.join(root, 'bin');
      fs.mkdirSync(binDir, { recursive: true });
      const fakeOpenCodePath = path.join(binDir, 'opencode');
      fs.writeFileSync(fakeOpenCodePath, '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
      fs.chmodSync(fakeOpenCodePath, 0o755);

      const result = runCLI('--autofix agent', {
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

});