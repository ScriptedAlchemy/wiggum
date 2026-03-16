import { expect, test, describe, afterEach } from '@rstest/core';
import fs from 'fs';
import path from 'path';
import {
  createTempDirManager,
  runCliSpawn,
  writeJson,
} from './helpers/cli-test-helpers.js';

const tempDirManager = createTempDirManager('wiggum-runner-');

function makeTempWorkspace() {
  return tempDirManager.makeTempDir();
}

afterEach(() => {
  tempDirManager.cleanup();
});

describe('Wiggum runner workspace graph', () => {
  test('projects --help prints runner projects usage', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCliSpawn(['projects', '--help'], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: wiggum projects [list|graph] [runner options]');
    expect(result.stdout).toContain('--project <pattern>');
    expect(result.stdout).toContain('-p <pattern>');
    expect(result.stdout).toContain('Supported runner config files: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json.');
    expect(result.stdout).toContain('WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES');
    expect(result.stdout).toContain('default: 400');
    expect(result.stdout).toContain('ignored when --no-infer-imports is enabled');
  });

  test('leading global --autofix still allows projects --help', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCliSpawn(['--autofix', 'projects', '--help'], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: wiggum projects [list|graph] [runner options]');
  });

  test('projects list --help prints runner projects usage', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCliSpawn(['projects', 'list', '--help'], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: wiggum projects [list|graph] [runner options]');
    expect(result.stdout).toContain('Supported runner config files: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json.');
    expect(result.stdout).toContain('WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES');
    expect(result.stdout).toContain('default: 400');
    expect(result.stdout).toContain('ignored when --no-infer-imports is enabled');
  });

  test('projects graph --help prints runner projects usage', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCliSpawn(['projects', 'graph', '--help'], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: wiggum projects [list|graph] [runner options]');
    expect(result.stdout).toContain('Supported runner config files: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json.');
    expect(result.stdout).toContain('WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES');
    expect(result.stdout).toContain('default: 400');
    expect(result.stdout).toContain('ignored when --no-infer-imports is enabled');
  });

  test('projects --json help prints runner projects usage', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCliSpawn(['projects', '--json', 'help'], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: wiggum projects [list|graph] [runner options]');
  });

  test('projects rejects unknown subcommand token in first position', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCliSpawn(['projects', 'unknown-subcommand'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown projects subcommand: unknown-subcommand');
  });

  test('projects rejects conflicting list/graph subcommands', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCliSpawn(['projects', '--json', 'list', 'graph'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Conflicting projects subcommands: list and graph');
  });

  test('projects rejects unknown positional token before explicit subcommand', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCliSpawn(['projects', '--json', 'deploy', 'list'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown projects subcommand: deploy');
  });

  test('projects rejects unknown positional token in option-first form', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCliSpawn(['projects', '--json', 'deploy'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown projects subcommand: deploy');
  });

  test('projects keeps unknown first token error even with trailing help token', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCliSpawn(['projects', 'deploy', 'help'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown projects subcommand: deploy');
  });

  test('projects keeps unknown option-first token error with trailing help token', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCliSpawn(['projects', '--json', 'deploy', 'help'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown projects subcommand: deploy');
  });

  test('projects rejects duplicate subcommand tokens', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCliSpawn(['projects', '--json', 'graph', 'graph'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Duplicate projects subcommand token: graph');
  });

  test('projects does not treat -h as help when used as missing --project value', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCliSpawn(['projects', 'list', '--project', '-h'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing value for --project');
  });

  test('projects does not treat -h as help when used as missing --config value', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCliSpawn(['projects', 'list', '--config', '-h'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing value for --config');
  });

  test('projects does not treat passthrough --help as command help', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCliSpawn(
      ['projects', 'list', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--', '--help'],
      root,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown projects option(s): --help');
  });

  test('run --help prints runner run usage', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCliSpawn(['run', '--help'], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: wiggum run <task> [runner options] [-- task args]');
    expect(result.stdout).toContain('Supported tasks:');
    expect(result.stdout).toContain('--ai-prompt');
    expect(result.stdout).toContain('--autofix');
    expect(result.stdout).toContain('-p <pattern>');
    expect(result.stdout).toContain('cannot be combined with --dry-run');
    expect(result.stdout).toContain('Supported runner config files: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json.');
    expect(result.stdout).toContain('WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES');
    expect(result.stdout).toContain('default: 400');
    expect(result.stdout).toContain('ignored when --no-infer-imports is enabled');
  });

  test('leading global --autofix still allows run --help', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCliSpawn(['--autofix', 'run', '--help'], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: wiggum run <task> [runner options] [-- task args]');
  });

  test('run build --help prints runner run usage', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCliSpawn(['run', 'build', '--help'], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: wiggum run <task> [runner options] [-- task args]');
    expect(result.stdout).toContain('--parallel <count>');
    expect(result.stdout).toContain('Supported runner config files: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json.');
    expect(result.stdout).toContain('WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES');
  });

  test('run --dry-run help prints runner run usage', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCliSpawn(['run', '--dry-run', 'help'], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: wiggum run <task> [runner options] [-- task args]');
  });

  test('run supports task token after runner options', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCliSpawn(
      ['run', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--dry-run', '--json', 'build'],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.task).toBe('build');
    expect(payload.plan.map((entry) => entry.project)).toEqual(['@scope/app']);
  });
});
