import { expect, test, describe, afterEach } from '@rstest/core';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import stripAnsi from 'strip-ansi';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_PATH = path.join(__dirname, '../bin/cli.js');

const tempDirs = [];

function makeTempWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wiggum-runner-'));
  tempDirs.push(root);
  return root;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function runCLI(args, cwd, envOverrides = {}) {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30000,
    env: {
      ...process.env,
      ...envOverrides,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
      CLICOLOR: '0',
      CLICOLOR_FORCE: '0',
    },
  });
  return {
    exitCode: result.status ?? 1,
    stdout: stripAnsi(result.stdout || ''),
    stderr: stripAnsi(result.stderr || ''),
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('Wiggum runner workspace graph', () => {
  test('projects --help prints runner projects usage', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['projects', '--help'], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: wiggum projects [list|graph] [runner options]');
    expect(result.stdout).toContain('--project <pattern>');
    expect(result.stdout).toContain('-p <pattern>');
  });

  test('projects list --help prints runner projects usage', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['projects', 'list', '--help'], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: wiggum projects [list|graph] [runner options]');
  });

  test('run --help prints runner run usage', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['run', '--help'], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: wiggum run <task> [runner options] [-- task args]');
    expect(result.stdout).toContain('Supported tasks:');
    expect(result.stdout).toContain('--ai-prompt');
    expect(result.stdout).toContain('--autofix');
    expect(result.stdout).toContain('-p <pattern>');
    expect(result.stdout).toContain('cannot be combined with --dry-run');
  });

  test('run build --help prints runner run usage', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['run', 'build', '--help'], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: wiggum run <task> [runner options] [-- task args]');
    expect(result.stdout).toContain('--parallel <count>');
  });

  test('projects list --json resolves a single implicit project', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'single-project',
      private: true,
    });

    const result = runCLI(['projects', 'list', '--root', root, '--json'], root);
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects).toHaveLength(1);
    expect(payload.projects[0].name).toBe('single-project');
  });

  test('run build --dry-run --json calculates topological order', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/shared/package.json'), {
      name: '@scope/shared',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
      dependencies: {
        '@scope/shared': 'workspace:*',
      },
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--dry-run', '--json'],
      root,
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.graph.topologicalOrder).toEqual(['@scope/shared', '@scope/app']);
    expect(payload.graph.levels).toEqual([['@scope/shared'], ['@scope/app']]);
    expect(payload.plan.map((entry) => entry.project)).toEqual(['@scope/shared', '@scope/app']);
  });

  test('run preserves tool --autofix argument after passthrough delimiter', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      [
        'run',
        'build',
        '--root',
        root,
        '--config',
        path.join(root, 'wiggum.config.json'),
        '--dry-run',
        '--json',
        '--',
        '--autofix',
      ],
      root,
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.plan).toHaveLength(1);
    expect(payload.plan[0].args).toContain('--autofix');
  });

  test('run preserves tool --help argument after passthrough delimiter', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      [
        'run',
        'build',
        '--root',
        root,
        '--config',
        path.join(root, 'wiggum.config.json'),
        '--dry-run',
        '--json',
        '--',
        '--help',
      ],
      root,
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.plan).toHaveLength(1);
    expect(payload.plan[0].args).toContain('--help');
  });

  test('run with --project includes local dependencies for ordering', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/shared/package.json'), {
      name: '@scope/shared',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
      dependencies: {
        '@scope/shared': 'workspace:*',
      },
    });

    const result = runCLI(
      [
        'run',
        'build',
        '--root',
        root,
        '--config',
        path.join(root, 'wiggum.config.json'),
        '--project',
        '@scope/app',
        '--dry-run',
        '--json',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/app', '@scope/shared']);
    expect(payload.plan.map((entry) => entry.project)).toEqual(['@scope/shared', '@scope/app']);
  });

  test('run supports include and exclude project filters', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/a/package.json'), {
      name: '@scope/a',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/b/package.json'), {
      name: '@scope/b',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/c/package.json'), {
      name: '@scope/c',
      version: '1.0.0',
    });

    const result = runCLI(
      [
        'run',
        'build',
        '--root',
        root,
        '--config',
        path.join(root, 'wiggum.config.json'),
        '--project',
        '@scope/*,!@scope/b',
        '--dry-run',
        '--json',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/a', '@scope/c']);
    expect(payload.plan.map((entry) => entry.project)).toEqual(['@scope/a', '@scope/c']);
  });

  test('projects supports short -p=<pattern> project filters', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/a/package.json'), {
      name: '@scope/a',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/b/package.json'), {
      name: '@scope/b',
      version: '1.0.0',
    });

    const result = runCLI(
      [
        'projects',
        'list',
        '--root',
        root,
        '--config',
        path.join(root, 'wiggum.config.json'),
        '-p=@scope/a',
        '--json',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/a']);
  });

  test('run supports short -p=<pattern> project filters', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/a/package.json'), {
      name: '@scope/a',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/b/package.json'), {
      name: '@scope/b',
      version: '1.0.0',
    });

    const result = runCLI(
      [
        'run',
        'build',
        '--root',
        root,
        '--config',
        path.join(root, 'wiggum.config.json'),
        '-p=@scope/a',
        '--dry-run',
        '--json',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/a']);
    expect(payload.plan.map((entry) => entry.project)).toEqual(['@scope/a']);
  });

  test('run fails when graph has dependency cycles', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/a/package.json'), {
      name: '@scope/a',
      version: '1.0.0',
      dependencies: {
        '@scope/b': 'workspace:*',
      },
    });
    writeJson(path.join(root, 'packages/b/package.json'), {
      name: '@scope/b',
      version: '1.0.0',
      dependencies: {
        '@scope/a': 'workspace:*',
      },
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--dry-run'],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Circular project dependencies detected');
  });

  test('run surfaces project command context on execution failure', () => {
    const root = makeTempWorkspace();
    const binDir = path.join(root, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    const fakeToolPath = path.join(binDir, 'rsbuild');
    fs.writeFileSync(
      fakeToolPath,
      '#!/usr/bin/env bash\necho \"runner stdout\"\necho \"runner stderr\" 1>&2\nexit 2\n',
      { mode: 0o755 },
    );
    fs.chmodSync(fakeToolPath, 0o755);

    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json')],
      root,
      {
        PATH: `${binDir}:${process.env.PATH || ''}`,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('[runner] build -> @scope/app');
    expect(result.stdout).toContain('runner stdout');
    expect(result.stderr).toContain('runner stderr');
    expect(result.stderr).toContain('@scope/app: Command "rsbuild" failed with exit code 2.');
    expect(result.stderr).toContain('command: rsbuild');
  });

  test('run --ai-prompt prints remediation prompt on failure', () => {
    const root = makeTempWorkspace();
    const binDir = path.join(root, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    const fakeToolPath = path.join(binDir, 'rsbuild');
    fs.writeFileSync(
      fakeToolPath,
      '#!/usr/bin/env bash\necho \"ai stdout\"\necho \"ai stderr\" 1>&2\nexit 2\n',
      { mode: 0o755 },
    );
    fs.chmodSync(fakeToolPath, 0o755);

    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--ai-prompt'],
      root,
      {
        PATH: `${binDir}:${process.env.PATH || ''}`,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('[runner] AI remediation prompt:');
    expect(result.stderr).toContain('Failure diagnostics by project:');
    expect(result.stderr).toContain('Project: @scope/app');
    expect(result.stderr).toContain('Captured stdout:\nai stdout');
    expect(result.stderr).toContain('Captured stderr:\nai stderr');
  });

  test('run --ai-prompt lists failed projects in execution order', () => {
    const root = makeTempWorkspace();
    const binDir = path.join(root, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    const fakeToolPath = path.join(binDir, 'rsbuild');
    fs.writeFileSync(
      fakeToolPath,
      '#!/usr/bin/env bash\necho \"multi stderr\" 1>&2\nexit 2\n',
      { mode: 0o755 },
    );
    fs.chmodSync(fakeToolPath, 0o755);

    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/a/package.json'), {
      name: '@scope/a',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/b/package.json'), {
      name: '@scope/b',
      version: '1.0.0',
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--ai-prompt'],
      root,
      {
        PATH: `${binDir}:${process.env.PATH || ''}`,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Failed projects (2): @scope/a, @scope/b');
    const failureListIndex = result.stderr.indexOf('Failed projects (2): @scope/a, @scope/b');
    const firstProjectIndex = result.stderr.indexOf('Project: @scope/a');
    const secondProjectIndex = result.stderr.indexOf('Project: @scope/b');
    expect(failureListIndex).toBeGreaterThan(-1);
    expect(firstProjectIndex).toBeGreaterThan(-1);
    expect(secondProjectIndex).toBeGreaterThan(firstProjectIndex);
  });

  test('run --autofix supports prompt-only mode without launching tui', () => {
    const root = makeTempWorkspace();
    const binDir = path.join(root, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    const fakeToolPath = path.join(binDir, 'rsbuild');
    fs.writeFileSync(
      fakeToolPath,
      '#!/usr/bin/env bash\necho \"autofix stdout\"\necho \"autofix stderr\" 1>&2\nexit 2\n',
      { mode: 0o755 },
    );
    fs.chmodSync(fakeToolPath, 0o755);

    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--autofix'],
      root,
      {
        PATH: `${binDir}:${process.env.PATH || ''}`,
        WIGGUM_AUTOFIX_MODE: 'prompt',
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('[autofix] Prompt-only mode enabled.');
    expect(result.stdout).toContain('Runner command failed: wiggum run build');
    expect(result.stdout).toContain('Captured stderr:\nautofix stderr');
  });

  test('run --autofix auto-falls back in non-interactive terminals', () => {
    const root = makeTempWorkspace();
    const binDir = path.join(root, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    const fakeToolPath = path.join(binDir, 'rsbuild');
    fs.writeFileSync(
      fakeToolPath,
      '#!/usr/bin/env bash\necho \"tty stdout\"\necho \"tty stderr\" 1>&2\nexit 2\n',
      { mode: 0o755 },
    );
    fs.chmodSync(fakeToolPath, 0o755);

    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--autofix'],
      root,
      {
        PATH: `${binDir}:${process.env.PATH || ''}`,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain(
      '[autofix] Non-interactive terminal detected; printing prompt instead of launching TUI.',
    );
    expect(result.stdout).toContain('Captured stderr:\ntty stderr');
  });

  test('supports nested object project entries without temp files', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: [
        {
          root: 'packages',
          args: ['--mode', 'production'],
          projects: ['*'],
        },
      ],
    });
    writeJson(path.join(root, 'packages/a/package.json'), {
      name: '@scope/a',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/b/package.json'), {
      name: '@scope/b',
      version: '1.0.0',
      dependencies: {
        '@scope/a': 'workspace:*',
      },
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--dry-run', '--json'],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/a', '@scope/b']);
    expect(payload.plan[0].args).toContain('--mode');
    expect(payload.plan[0].args).toContain('production');
    expect(payload.plan.map((entry) => entry.project)).toEqual(['@scope/a', '@scope/b']);
  });

  test('includes inferred import dependencies for filtered runs', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/b/package.json'), {
      name: '@scope/b',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/a/package.json'), {
      name: '@scope/a',
      version: '1.0.0',
    });
    fs.mkdirSync(path.join(root, 'packages/a/src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/a/src/index.ts'),
      "import '@scope/b';\nexport const value = 1;\n",
    );

    const result = runCLI(
      [
        'run',
        'build',
        '--root',
        root,
        '--config',
        path.join(root, 'wiggum.config.json'),
        '--project',
        '@scope/a',
        '--dry-run',
        '--json',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/a', '@scope/b']);
    expect(payload.graph.edges.some((edge) => edge.reason === 'inferred-import')).toBe(true);
  });

  test('projects rejects run-only flags', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'single-project',
      private: true,
    });

    const result = runCLI(
      ['projects', 'list', '--root', root, '--ai-prompt', '--dry-run', '--parallel', '2'],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'Run-only option(s) are not supported for "wiggum projects"',
    );
    expect(result.stderr).toContain('--ai-prompt');
    expect(result.stderr).toContain('--dry-run');
    expect(result.stderr).toContain('--parallel');
  });

  test('run rejects --ai-prompt with --dry-run', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--ai-prompt', '--dry-run'],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--ai-prompt cannot be used with --dry-run');
  });

  test('run rejects --autofix with --dry-run', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--dry-run', '--autofix'],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--autofix cannot be used with --dry-run');
  });

  test('run rejects empty --project= value', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--project=', '--dry-run'],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing value for --project');
  });

  test('run rejects empty --config= value', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(['run', 'build', '--root', root, '--config=', '--dry-run'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing value for --config');
  });

  test('run rejects invalid WIGGUM_RUNNER_PARALLEL env value', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--dry-run'],
      root,
      {
        WIGGUM_RUNNER_PARALLEL: '2abc',
      },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid WIGGUM_RUNNER_PARALLEL value "2abc"');
  });

  test('run accepts trimmed WIGGUM_RUNNER_PARALLEL env value', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--dry-run', '--json'],
      root,
      {
        WIGGUM_RUNNER_PARALLEL: ' 3 ',
      },
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.plan).toHaveLength(1);
    expect(payload.plan[0].project).toBe('@scope/app');
  });

  test('run accepts whitespace-padded --parallel value', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      [
        'run',
        'build',
        '--root',
        root,
        '--config',
        path.join(root, 'wiggum.config.json'),
        '--parallel',
        ' 2 ',
        '--dry-run',
        '--json',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.plan).toHaveLength(1);
    expect(payload.plan[0].project).toBe('@scope/app');
  });

  test('run accepts whitespace-padded --config= value', () => {
    const root = makeTempWorkspace();
    const configPath = path.join(root, 'wiggum.config.json');
    writeJson(configPath, {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['run', 'build', '--root', root, `--config=  ${configPath}  `, '--dry-run', '--json'],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects).toHaveLength(1);
    expect(payload.projects[0].name).toBe('@scope/app');
  });

  test('run fails when runner config resolves zero projects', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: [],
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--dry-run'],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No runner projects were resolved for execution');
  });

  test('projects rejects blank --project list values', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['projects', 'list', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--project', ', ,'],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing value for --project');
  });

  test('projects rejects empty -p= filter values', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['projects', 'list', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '-p='],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing value for -p');
  });

  test('projects rejects empty --root= value', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['projects', 'list', '--root=', '--config', path.join(root, 'wiggum.config.json')],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing value for --root');
  });

  test('projects fails when runner config resolves zero projects', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: [],
    });

    const result = runCLI(
      ['projects', 'list', '--root', root, '--config', path.join(root, 'wiggum.config.json')],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No runner projects were resolved. Check your config and filters.');
  });

  test('run rejects partially numeric --parallel values', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--parallel', '2abc', '--dry-run'],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid --parallel value "2abc"');
  });

  test('run rejects partially numeric --concurrency= values', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      [
        'run',
        'build',
        '--root',
        root,
        '--config',
        path.join(root, 'wiggum.config.json'),
        '--concurrency=3xyz',
        '--dry-run',
      ],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid --concurrency value "3xyz"');
  });
});
