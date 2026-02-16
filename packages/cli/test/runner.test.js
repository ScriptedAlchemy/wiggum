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
});
