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

async function resolveWorkspaceDirect(options) {
  const { resolveRunnerWorkspace } = await import('../dist/runner.js');
  return resolveRunnerWorkspace(options);
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
    expect(result.stdout).toContain('Supported runner config files: wiggum.config.json');
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

    const result = runCLI(['--autofix', 'projects', '--help'], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: wiggum projects [list|graph] [runner options]');
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
    expect(result.stdout).toContain('Supported runner config files: wiggum.config.json');
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

    const result = runCLI(['projects', 'graph', '--help'], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: wiggum projects [list|graph] [runner options]');
    expect(result.stdout).toContain('Supported runner config files: wiggum.config.json');
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

    const result = runCLI(['projects', '--json', 'help'], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: wiggum projects [list|graph] [runner options]');
  });

  test('projects rejects unknown subcommand token in first position', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['projects', 'unknown-subcommand'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown projects subcommand: unknown-subcommand');
  });

  test('projects rejects conflicting list/graph subcommands', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['projects', '--json', 'list', 'graph'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Conflicting projects subcommands: list and graph');
  });

  test('projects rejects unknown positional token before explicit subcommand', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['projects', '--json', 'deploy', 'list'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown projects subcommand: deploy');
  });

  test('projects rejects unknown positional token in option-first form', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['projects', '--json', 'deploy'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown projects subcommand: deploy');
  });

  test('projects keeps unknown first token error even with trailing help token', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['projects', 'deploy', 'help'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown projects subcommand: deploy');
  });

  test('projects keeps unknown option-first token error with trailing help token', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['projects', '--json', 'deploy', 'help'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown projects subcommand: deploy');
  });

  test('projects rejects duplicate subcommand tokens', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['projects', '--json', 'graph', 'graph'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Duplicate projects subcommand token: graph');
  });

  test('projects does not treat -h as help when used as missing --project value', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['projects', 'list', '--project', '-h'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing value for --project');
  });

  test('projects does not treat -h as help when used as missing --config value', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['projects', 'list', '--config', '-h'], root);
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

    const result = runCLI(
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

    const result = runCLI(['run', '--help'], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: wiggum run <task> [runner options] [-- task args]');
    expect(result.stdout).toContain('Supported tasks:');
    expect(result.stdout).toContain('--ai-prompt');
    expect(result.stdout).toContain('--autofix');
    expect(result.stdout).toContain('-p <pattern>');
    expect(result.stdout).toContain('cannot be combined with --dry-run');
    expect(result.stdout).toContain('Supported runner config files: wiggum.config.json');
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

    const result = runCLI(['--autofix', 'run', '--help'], root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: wiggum run <task> [runner options] [-- task args]');
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
    expect(result.stdout).toContain('Supported runner config files: wiggum.config.json');
    expect(result.stdout).toContain('WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES');
  });

  test('run --dry-run help prints runner run usage', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['run', '--dry-run', 'help'], root);
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

    const result = runCLI(
      ['run', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--dry-run', '--json', 'build'],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.task).toBe('build');
    expect(payload.plan.map((entry) => entry.project)).toEqual(['@scope/app']);
  });

  test('resolveRunnerWorkspace rejects unsupported wiggum.config.ts path', async () => {
    const root = makeTempWorkspace();
    fs.writeFileSync(
      path.join(root, 'wiggum.config.ts'),
      "export default { projects: ['packages/*'] };\n",
    );

    let caughtError;
    try {
      await resolveWorkspaceDirect({
        rootDir: root,
        configPath: path.join(root, 'wiggum.config.ts'),
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeDefined();
    expect(String(caughtError.message || caughtError)).toContain(
      'Unsupported runner config file "wiggum.config.ts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
  });

  test('resolveRunnerWorkspace rejects unsupported wiggum.config.mts path', async () => {
    const root = makeTempWorkspace();
    fs.writeFileSync(
      path.join(root, 'wiggum.config.mts'),
      "export default { projects: ['packages/*'] };\n",
    );

    let caughtError;
    try {
      await resolveWorkspaceDirect({
        rootDir: root,
        configPath: path.join(root, 'wiggum.config.mts'),
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeDefined();
    expect(String(caughtError.message || caughtError)).toContain(
      'Unsupported runner config file "wiggum.config.mts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
  });

  test('resolveRunnerWorkspace rejects unsupported wiggum.config.cts path', async () => {
    const root = makeTempWorkspace();
    fs.writeFileSync(
      path.join(root, 'wiggum.config.cts'),
      "export default { projects: ['packages/*'] };\n",
    );

    let caughtError;
    try {
      await resolveWorkspaceDirect({
        rootDir: root,
        configPath: path.join(root, 'wiggum.config.cts'),
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeDefined();
    expect(String(caughtError.message || caughtError)).toContain(
      'Unsupported runner config file "wiggum.config.cts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
  });

  test('projects list reports unsupported auto-detected wiggum.config.ts', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'unsupported-config-workspace',
      private: true,
    });
    fs.writeFileSync(
      path.join(root, 'wiggum.config.ts'),
      "export default { projects: ['packages/*'] };\n",
    );

    const result = runCLI(['projects', 'list', '--root', root], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'Unsupported runner config file "wiggum.config.ts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
  });

  test('projects list reports unsupported auto-detected wiggum.config.mts', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'unsupported-config-workspace',
      private: true,
    });
    fs.writeFileSync(
      path.join(root, 'wiggum.config.mts'),
      "export default { projects: ['packages/*'] };\n",
    );

    const result = runCLI(['projects', 'list', '--root', root], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'Unsupported runner config file "wiggum.config.mts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
  });

  test('run reports unsupported explicit wiggum.config.ts path', () => {
    const root = makeTempWorkspace();
    fs.writeFileSync(
      path.join(root, 'wiggum.config.ts'),
      "export default { projects: ['packages/*'] };\n",
    );

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.ts'), '--dry-run'],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'Unsupported runner config file "wiggum.config.ts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
  });

  test('projects list prefers supported runner config over unsupported ts variant', () => {
    const root = makeTempWorkspace();
    fs.writeFileSync(
      path.join(root, 'wiggum.config.ts'),
      "export default { projects: ['broken/**'] };\n",
    );
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(['projects', 'list', '--root', root, '--json'], root);
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/app']);
  });

  test('projects list rejects unsupported nested wiggum.config.ts files', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    fs.mkdirSync(path.join(root, 'packages/app'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/wiggum.config.ts'),
      "export default { projects: ['src/*'] };\n",
    );

    const result = runCLI(['projects', 'list', '--root', root, '--json'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'Unsupported runner config file "wiggum.config.ts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
  });

  test('resolveRunnerWorkspace rejects unsupported object entry config path', async () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: [
        {
          root: 'packages/app',
          config: 'wiggum.config.ts',
        },
      ],
    });
    fs.mkdirSync(path.join(root, 'packages/app'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/wiggum.config.ts'),
      "export default { projects: ['src/*'] };\n",
    );

    let caughtError;
    try {
      await resolveWorkspaceDirect({
        rootDir: root,
        configPath: path.join(root, 'wiggum.config.json'),
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeDefined();
    expect(String(caughtError.message || caughtError)).toContain(
      'Unsupported runner config file "wiggum.config.ts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
  });

  test('resolveRunnerWorkspace rejects duplicate package names across distinct project entries', async () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: [
        {
          name: 'alpha-app',
          root: 'packages/alpha',
        },
        {
          name: 'beta-app',
          root: 'packages/beta',
        },
      ],
    });
    writeJson(path.join(root, 'packages/alpha/package.json'), {
      name: '@scope/shared',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/beta/package.json'), {
      name: '@scope/shared',
      version: '1.0.0',
    });

    let caughtError;
    try {
      await resolveWorkspaceDirect({
        rootDir: root,
        configPath: path.join(root, 'wiggum.config.json'),
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeDefined();
    expect(String(caughtError.message || caughtError)).toContain(
      'Duplicate package name "@scope/shared" across projects "alpha-app"',
    );
    expect(String(caughtError.message || caughtError)).toContain('"beta-app"');
  });

  test('resolveRunnerWorkspace duplicate package-name guard still applies when import inference is disabled', async () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: [
        {
          name: 'alpha-app',
          root: 'packages/alpha',
        },
        {
          name: 'beta-app',
          root: 'packages/beta',
        },
      ],
    });
    writeJson(path.join(root, 'packages/alpha/package.json'), {
      name: '@scope/shared',
      version: '1.0.0',
      dependencies: {
        react: '^19.0.0',
      },
    });
    writeJson(path.join(root, 'packages/beta/package.json'), {
      name: '@scope/shared',
      version: '1.0.0',
      dependencies: {
        react: '^19.0.0',
      },
    });

    let caughtError;
    try {
      await resolveWorkspaceDirect({
        rootDir: root,
        configPath: path.join(root, 'wiggum.config.json'),
        includeInferredImports: false,
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeDefined();
    expect(String(caughtError.message || caughtError)).toContain(
      'Duplicate package name "@scope/shared" across projects "alpha-app"',
    );
    expect(String(caughtError.message || caughtError)).toContain('"beta-app"');
  });

  test('projects list reports duplicate package names across explicit project entries', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: [
        {
          name: 'alpha-app',
          root: 'packages/alpha',
        },
        {
          name: 'beta-app',
          root: 'packages/beta',
        },
      ],
    });
    writeJson(path.join(root, 'packages/alpha/package.json'), {
      name: '@scope/shared',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/beta/package.json'), {
      name: '@scope/shared',
      version: '1.0.0',
    });

    const result = runCLI(['projects', 'list', '--root', root], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Duplicate package name "@scope/shared" across projects "alpha-app"');
    expect(result.stderr).toContain('"beta-app"');
  });

  test('resolveRunnerWorkspace supports inferImportMaxFiles option', async () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages/app/src/000.no-import.ts'), 'export const noop = 1;\n');
    fs.writeFileSync(
      path.join(root, 'packages/app/src/001.with-import.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
    );

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
      inferImportMaxFiles: 1,
    });

    expect(workspace.projects.map((project) => project.name)).toEqual(['@scope/app', '@scope/shared']);
    expect(workspace.graph.edges.some((edge) => edge.reason === 'inferred-import')).toBe(false);
  });

  test('resolveRunnerWorkspace rejects invalid inferImportMaxFiles option', async () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    let caughtError;
    try {
      await resolveWorkspaceDirect({
        rootDir: root,
        configPath: path.join(root, 'wiggum.config.json'),
        inferImportMaxFiles: 0,
      });
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeDefined();
    expect(String(caughtError.message || caughtError)).toContain(
      'inferImportMaxFiles must be a positive integer, got 0',
    );
  });

  test('resolveRunnerWorkspace rejects unsafe inferImportMaxFiles option', async () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    let caughtError;
    try {
      await resolveWorkspaceDirect({
        rootDir: root,
        configPath: path.join(root, 'wiggum.config.json'),
        inferImportMaxFiles: 9_007_199_254_740_992,
      });
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeDefined();
    expect(String(caughtError.message || caughtError)).toContain(
      'inferImportMaxFiles must be a positive integer, got 9007199254740992',
    );
  });

  test('resolveRunnerWorkspace rejects non-integer inferImportMaxFiles option', async () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    let caughtError;
    try {
      await resolveWorkspaceDirect({
        rootDir: root,
        configPath: path.join(root, 'wiggum.config.json'),
        inferImportMaxFiles: 1.5,
      });
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeDefined();
    expect(String(caughtError.message || caughtError)).toContain(
      'inferImportMaxFiles must be a positive integer, got 1.5',
    );
  });

  test('resolveRunnerWorkspace rejects non-numeric inferImportMaxFiles option', async () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    let caughtError;
    try {
      await resolveWorkspaceDirect({
        rootDir: root,
        configPath: path.join(root, 'wiggum.config.json'),
        inferImportMaxFiles: 'abc',
      });
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeDefined();
    expect(String(caughtError.message || caughtError)).toContain(
      'inferImportMaxFiles must be a positive integer, got abc',
    );
  });

  test('resolveRunnerWorkspace ignores inferImportMaxFiles when includeInferredImports is false', async () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/src/index.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
    );

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
      includeInferredImports: false,
      inferImportMaxFiles: 0,
    });

    expect(workspace.projects.map((project) => project.name)).toEqual(['@scope/app', '@scope/shared']);
    expect(workspace.graph.edges.some((edge) => edge.reason === 'inferred-import')).toBe(false);
  });

  test('resolveRunnerWorkspace ignores invalid env scan budget when includeInferredImports is false', async () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/src/index.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
    );

    const previousValue = process.env.WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES;
    process.env.WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES = 'invalid';
    try {
      const workspace = await resolveWorkspaceDirect({
        rootDir: root,
        configPath: path.join(root, 'wiggum.config.json'),
        includeInferredImports: false,
      });

      expect(workspace.projects.map((project) => project.name)).toEqual(['@scope/app', '@scope/shared']);
      expect(workspace.graph.edges.some((edge) => edge.reason === 'inferred-import')).toBe(false);
    } finally {
      if (previousValue === undefined) {
        delete process.env.WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES;
      } else {
        process.env.WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES = previousValue;
      }
    }
  });

  test('run rejects unsupported task token after runner options', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['run', '--dry-run', 'deploy'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unsupported runner task: deploy');
  });

  test('run rejects unsupported positional token before selected task', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['run', '--dry-run', '--json', 'deploy', 'build'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unsupported runner task: deploy');
  });

  test('run keeps unsupported positional error even with trailing help token', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['run', '--dry-run', 'deploy', 'help'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unsupported runner task: deploy');
  });

  test('run keeps missing task message when only options are provided', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['run', '--dry-run'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing task name.');
  });

  test('run does not treat --project value as task token', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['run', '--project', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--dry-run'],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing task name.');
  });

  test('run does not treat --project help value as command help', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/help/package.json'), {
      name: 'help',
      version: '1.0.0',
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--project', 'help', '--dry-run', '--json'],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['help']);
  });

  test('run forwards additional task-like positional args before delimiter', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['run', 'build', '--dry-run', '--json', 'test'], root);
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.plan).toHaveLength(1);
    expect(payload.plan[0].args).toContain('test');
  });

  test('run forwards duplicate task-like positional args before delimiter', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['run', 'build', '--dry-run', '--json', 'build'], root);
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.plan).toHaveLength(1);
    expect(payload.plan[0].args).toContain('build');
  });

  test('run allows task-like passthrough args after delimiter', () => {
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
        'test',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.plan).toHaveLength(1);
    expect(payload.plan[0].args).toContain('test');
  });

  test('run does not treat -h as help when used as missing --project value', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['run', 'build', '--project', '-h'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing value for --project');
  });

  test('run does not treat -h as help when used as missing --parallel value', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'help-project',
      private: true,
    });

    const result = runCLI(['run', 'build', '--parallel', '-h'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing value for --parallel');
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

  test('projects defaults to list when runner options come first', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'single-project',
      private: true,
    });

    const result = runCLI(['projects', '--root', root, '--json'], root);
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects).toHaveLength(1);
    expect(payload.projects[0].name).toBe('single-project');
  });

  test('projects supports graph subcommand after runner options', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'single-project',
      private: true,
    });

    const result = runCLI(['projects', '--json', 'graph', '--root', root], root);
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects).toHaveLength(1);
    expect(payload.graph).toBeDefined();
    expect(Array.isArray(payload.graph.topologicalOrder)).toBe(true);
  });

  test('projects does not treat --project value as subcommand token', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/graph/package.json'), {
      name: 'graph',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/other/package.json'), {
      name: 'other',
      version: '1.0.0',
    });

    const result = runCLI(
      ['projects', 'list', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--project', 'graph', '--json'],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['graph']);
  });

  test('projects does not treat --project help value as command help', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/help/package.json'), {
      name: 'help',
      version: '1.0.0',
    });

    const result = runCLI(
      ['projects', 'list', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--project', 'help', '--json'],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['help']);
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

  test('run preserves tool -p argument after passthrough delimiter', () => {
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
        '-p',
        '4000',
      ],
      root,
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.plan).toHaveLength(1);
    expect(payload.plan[0].args).toEqual(expect.arrayContaining(['-p', '4000']));
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

  test('projects supports short -p <pattern> project filters', () => {
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
        '-p',
        '@scope/b',
        '--json',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/b']);
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

  test('run supports short -p <pattern> project filters', () => {
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
        '-p',
        '@scope/b',
        '--dry-run',
        '--json',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/b']);
    expect(payload.plan.map((entry) => entry.project)).toEqual(['@scope/b']);
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

  test('resolveRunnerWorkspace links local manifest dependencies declared via npm alias specifiers', async () => {
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
        'shared-alias': 'npm:@scope/shared@workspace:*',
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual(['@scope/shared']);
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('run --dry-run honors manifest dependency order when package links use npm aliases', () => {
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
        'shared-alias': 'npm:@scope/shared@workspace:*',
      },
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--dry-run', '--json'],
      root,
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.plan.map((entry) => entry.project)).toEqual(['@scope/shared', '@scope/app']);
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('resolveRunnerWorkspace resolves npm alias links from dev/peer/optional dependency fields', async () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/dev-lib/package.json'), {
      name: '@scope/dev-lib',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/peer-lib/package.json'), {
      name: '@scope/peer-lib',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/optional-lib/package.json'), {
      name: '@scope/optional-lib',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
      devDependencies: {
        'dev-lib-alias': 'npm:@scope/dev-lib@workspace:*',
      },
      peerDependencies: {
        'peer-lib-alias': 'npm:@scope/peer-lib@workspace:*',
      },
      optionalDependencies: {
        'optional-lib-alias': 'npm:@scope/optional-lib@workspace:*',
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual([
      '@scope/dev-lib',
      '@scope/optional-lib',
      '@scope/peer-lib',
    ]);
  });

  test('resolveRunnerWorkspace links local manifest dependencies for unscoped npm aliases', async () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/shared/package.json'), {
      name: 'shared',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: 'app',
      version: '1.0.0',
      dependencies: {
        'shared-local': 'npm:shared@workspace:*',
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === 'app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual(['shared']);
    expect(workspace.graph.edges).toContainEqual({
      from: 'shared',
      to: 'app',
      reason: 'manifest',
    });
  });

  test('resolveRunnerWorkspace resolves local links from bundleDependencies and bundledDependencies arrays', async () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/shared-a/package.json'), {
      name: '@scope/shared-a',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/shared-b/package.json'), {
      name: '@scope/shared-b',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
      bundleDependencies: ['@scope/shared-a'],
      bundledDependencies: ['@scope/shared-b'],
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual(['@scope/shared-a', '@scope/shared-b']);
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared-a',
      to: '@scope/app',
      reason: 'manifest',
    });
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared-b',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('resolveRunnerWorkspace links local manifest dependencies declared via workspace alias specifiers', async () => {
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
        'shared-alias': 'workspace:@scope/shared@*',
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual(['@scope/shared']);
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('resolveRunnerWorkspace resolves workspace/npm alias targets when specifiers include query/hash suffixes', async () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/shared-npm/package.json'), {
      name: '@scope/shared-npm',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/shared-workspace/package.json'), {
      name: '@scope/shared-workspace',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
      dependencies: {
        'npm-alias': 'npm:@scope/shared-npm@workspace:*?tag=latest#ignored',
        'workspace-alias': 'workspace:@scope/shared-workspace@*?tag=latest#ignored',
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual([
      '@scope/shared-npm',
      '@scope/shared-workspace',
    ]);
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared-npm',
      to: '@scope/app',
      reason: 'manifest',
    });
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared-workspace',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('resolveRunnerWorkspace ignores workspace/npm alias specifiers without explicit package alias targets', async () => {
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
        'shared-alias': 'workspace:*',
      },
      devDependencies: {
        'shared-alias-dev': 'workspace:packages/shared',
      },
      optionalDependencies: {
        'shared-alias-optional': 'npm:packages/shared@1.0.0',
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual([]);
    expect(workspace.graph.edges).not.toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('resolveRunnerWorkspace resolves local links from file/link/portal/workspace path dependency specifiers', async () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/shared-file/package.json'), {
      name: '@scope/shared-file',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/shared-link/package.json'), {
      name: '@scope/shared-link',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/shared-workspace/package.json'), {
      name: '@scope/shared-workspace',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/shared-portal/package.json'), {
      name: '@scope/shared-portal',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
      dependencies: {
        'file-shared': 'file:../shared-file',
      },
      devDependencies: {
        'link-shared': 'link:../shared-link',
      },
      optionalDependencies: {
        'workspace-shared': 'workspace:../shared-workspace',
      },
      peerDependencies: {
        'portal-shared': 'portal:../shared-portal',
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual([
      '@scope/shared-file',
      '@scope/shared-link',
      '@scope/shared-portal',
      '@scope/shared-workspace',
    ]);
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared-file',
      to: '@scope/app',
      reason: 'manifest',
    });
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared-link',
      to: '@scope/app',
      reason: 'manifest',
    });
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared-workspace',
      to: '@scope/app',
      reason: 'manifest',
    });
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared-portal',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('resolveRunnerWorkspace resolves local links from workspace-wrapped file/link/portal path dependency specifiers', async () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/shared-file/package.json'), {
      name: '@scope/shared-file',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/shared-link/package.json'), {
      name: '@scope/shared-link',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/shared-portal/package.json'), {
      name: '@scope/shared-portal',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
      dependencies: {
        'workspace-file-shared': 'workspace:file:../shared-file',
      },
      devDependencies: {
        'workspace-link-shared': 'workspace:link:../shared-link',
      },
      optionalDependencies: {
        'workspace-portal-shared': 'workspace:portal:../shared-portal',
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual([
      '@scope/shared-file',
      '@scope/shared-link',
      '@scope/shared-portal',
    ]);
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared-file',
      to: '@scope/app',
      reason: 'manifest',
    });
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared-link',
      to: '@scope/app',
      reason: 'manifest',
    });
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared-portal',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('resolveRunnerWorkspace resolves workspace-wrapped path protocols with query/hash suffixes', async () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/shared-file/package.json'), {
      name: '@scope/shared-file',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/shared-link/package.json'), {
      name: '@scope/shared-link',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/shared-portal/package.json'), {
      name: '@scope/shared-portal',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
      dependencies: {
        'workspace-file-shared': 'workspace:file:../shared-file?foo=1#bar',
      },
      devDependencies: {
        'workspace-link-shared': 'workspace:link:../shared-link?foo=1#bar',
      },
      optionalDependencies: {
        'workspace-portal-shared': 'workspace:portal:../shared-portal?foo=1#bar',
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual([
      '@scope/shared-file',
      '@scope/shared-link',
      '@scope/shared-portal',
    ]);
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared-file',
      to: '@scope/app',
      reason: 'manifest',
    });
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared-link',
      to: '@scope/app',
      reason: 'manifest',
    });
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared-portal',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('resolveRunnerWorkspace supports file path dependency specifiers with query/hash suffixes', async () => {
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
        'shared-file-suffix': 'file:../shared?workspace=true#local',
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual(['@scope/shared']);
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('resolveRunnerWorkspace supports file path dependency specifiers pointing to package.json files', async () => {
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
        'shared-file': 'file:../shared/package.json',
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual(['@scope/shared']);
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('resolveRunnerWorkspace supports portal path dependency specifiers pointing to package.json files', async () => {
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
        'shared-portal': 'portal:../shared/package.json?workspace=true#local',
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual(['@scope/shared']);
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('resolveRunnerWorkspace supports absolute file path dependency specifiers', async () => {
    const root = makeTempWorkspace();
    const sharedDir = path.join(root, 'packages/shared');
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(sharedDir, 'package.json'), {
      name: '@scope/shared',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
      dependencies: {
        'shared-absolute-file': `file:${sharedDir}`,
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual(['@scope/shared']);
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('resolveRunnerWorkspace supports absolute portal path dependency specifiers', async () => {
    const root = makeTempWorkspace();
    const sharedDir = path.join(root, 'packages/shared');
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(sharedDir, 'package.json'), {
      name: '@scope/shared',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
      dependencies: {
        'shared-absolute-portal': `portal:${sharedDir}`,
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual(['@scope/shared']);
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('resolveRunnerWorkspace supports absolute link path dependency specifiers', async () => {
    const root = makeTempWorkspace();
    const sharedDir = path.join(root, 'packages/shared');
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(sharedDir, 'package.json'), {
      name: '@scope/shared',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
      dependencies: {
        'shared-absolute-link': `link:${sharedDir}`,
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual(['@scope/shared']);
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('resolveRunnerWorkspace supports workspace-wrapped absolute file path dependency specifiers', async () => {
    const root = makeTempWorkspace();
    const sharedDir = path.join(root, 'packages/shared');
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(sharedDir, 'package.json'), {
      name: '@scope/shared',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
      dependencies: {
        'shared-absolute-workspace-file': `workspace:file:${sharedDir}`,
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual(['@scope/shared']);
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('resolveRunnerWorkspace supports workspace-wrapped absolute link path dependency specifiers', async () => {
    const root = makeTempWorkspace();
    const sharedDir = path.join(root, 'packages/shared');
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(sharedDir, 'package.json'), {
      name: '@scope/shared',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
      dependencies: {
        'shared-absolute-workspace-link': `workspace:link:${sharedDir}`,
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual(['@scope/shared']);
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('resolveRunnerWorkspace supports workspace-wrapped absolute portal path dependency specifiers', async () => {
    const root = makeTempWorkspace();
    const sharedDir = path.join(root, 'packages/shared');
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(sharedDir, 'package.json'), {
      name: '@scope/shared',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
      dependencies: {
        'shared-absolute-workspace-portal': `workspace:portal:${sharedDir}`,
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual(['@scope/shared']);
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('resolveRunnerWorkspace ignores non-string manifest specifiers without dropping valid dependencies', async () => {
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
        '@scope/shared': 123,
      },
      devDependencies: {
        'shared-alias': 'npm:@scope/shared@workspace:*',
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual(['@scope/shared']);
    expect(workspace.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('run --dry-run honors manifest dependency order for local path protocol dependencies', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/shared-file/package.json'), {
      name: '@scope/shared-file',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/shared-link/package.json'), {
      name: '@scope/shared-link',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
      dependencies: {
        'shared-file': 'file:../shared-file',
      },
      devDependencies: {
        'shared-link': 'link:../shared-link',
      },
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--dry-run', '--json'],
      root,
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.plan.map((entry) => entry.project)).toEqual([
      '@scope/shared-file',
      '@scope/shared-link',
      '@scope/app',
    ]);
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/shared-file',
      to: '@scope/app',
      reason: 'manifest',
    });
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/shared-link',
      to: '@scope/app',
      reason: 'manifest',
    });
  });

  test('resolveRunnerWorkspace ignores missing local path dependency targets', async () => {
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
        'missing-file-target': 'file:../missing-shared',
      },
    });

    const workspace = await resolveWorkspaceDirect({
      rootDir: root,
      configPath: path.join(root, 'wiggum.config.json'),
    });
    const appProject = workspace.projects.find((project) => project.name === '@scope/app');
    expect(appProject).toBeDefined();
    expect(appProject.dependencies).toEqual([]);
    expect(workspace.graph.edges).not.toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'manifest',
    });
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

  test('includes inferred dependencies from dynamic import specifiers', () => {
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
      "export async function load() {\n  return import('@scope/b/runtime');\n}\n",
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
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/b',
      to: '@scope/a',
      reason: 'inferred-import',
    });
  });

  test('includes inferred dependencies from dynamic import specifiers with inline comments', () => {
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
      "export async function load() {\n  return import(/* chunk: \"b\" */ '@scope/b/runtime');\n}\n",
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
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/b',
      to: '@scope/a',
      reason: 'inferred-import',
    });
  });

  test('includes inferred dependencies from dynamic import specifiers with line comments', () => {
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
      "export async function load() {\n  return import(\n    // chunk: b\n    '@scope/b/runtime'\n  );\n}\n",
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
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/b',
      to: '@scope/a',
      reason: 'inferred-import',
    });
  });

  test('includes inferred dependencies from require specifiers', () => {
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
      "const runtime = require('@scope/b/runtime');\nexport default runtime;\n",
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
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/b',
      to: '@scope/a',
      reason: 'inferred-import',
    });
  });

  test('includes inferred dependencies from require specifiers with inline comments', () => {
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
      "const runtime = require(/* chunk: \"b\" */ '@scope/b/runtime');\nexport default runtime;\n",
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
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/b',
      to: '@scope/a',
      reason: 'inferred-import',
    });
  });

  test('includes inferred dependencies from require specifiers with line comments', () => {
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
      "const runtime = require(\n  // chunk: b\n  '@scope/b/runtime'\n);\nexport default runtime;\n",
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
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/b',
      to: '@scope/a',
      reason: 'inferred-import',
    });
  });

  test('includes inferred dependencies from require.resolve specifiers', () => {
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
      "const runtimePath = require.resolve('@scope/b/runtime');\nexport default runtimePath;\n",
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
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/b',
      to: '@scope/a',
      reason: 'inferred-import',
    });
  });

  test('includes inferred dependencies from require.resolve specifiers with inline comments', () => {
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
      "const runtimePath = require.resolve(/* chunk: \"b\" */ '@scope/b/runtime');\nexport default runtimePath;\n",
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
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/b',
      to: '@scope/a',
      reason: 'inferred-import',
    });
  });

  test('includes inferred dependencies from require.resolve specifiers with line comments', () => {
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
      "const runtimePath = require.resolve(\n  // chunk: b\n  '@scope/b/runtime'\n);\nexport default runtimePath;\n",
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
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/b',
      to: '@scope/a',
      reason: 'inferred-import',
    });
  });

  test('includes inferred dependencies from import.meta.resolve specifiers', () => {
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
      "const runtimePath = import.meta.resolve('@scope/b/runtime');\nexport default runtimePath;\n",
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
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/b',
      to: '@scope/a',
      reason: 'inferred-import',
    });
  });

  test('includes inferred dependencies from import.meta.resolve specifiers with inline comments', () => {
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
      "const runtimePath = import.meta.resolve(/* chunk: \"b\" */ '@scope/b/runtime');\nexport default runtimePath;\n",
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
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/b',
      to: '@scope/a',
      reason: 'inferred-import',
    });
  });

  test('includes inferred dependencies from import.meta.resolve specifiers with line comments', () => {
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
      "const runtimePath = import.meta.resolve(\n  // chunk: b\n  '@scope/b/runtime'\n);\nexport default runtimePath;\n",
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
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/b',
      to: '@scope/a',
      reason: 'inferred-import',
    });
  });

  test('includes inferred dependencies for unscoped package subpath specifiers', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/shared/package.json'), {
      name: 'shared',
      version: '1.0.0',
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: 'app',
      version: '1.0.0',
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/src/index.ts'),
      "import 'shared/runtime';\nexport const value = 1;\n",
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
        'app',
        '--dry-run',
        '--json',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['app', 'shared']);
    expect(payload.graph.edges).toContainEqual({
      from: 'shared',
      to: 'app',
      reason: 'inferred-import',
    });
  });

  test('includes inferred dependencies from export-from specifiers', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/src/index.ts'),
      "export { runtime } from '@scope/shared/runtime';\n",
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
        '@scope/app',
        '--dry-run',
        '--json',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/app', '@scope/shared']);
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'inferred-import',
    });
  });

  test('includes inferred dependencies from .mts source files', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/src/index.mts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
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
        '@scope/app',
        '--dry-run',
        '--json',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/app', '@scope/shared']);
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'inferred-import',
    });
  });

  test('includes inferred dependencies from .cts source files', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/src/index.cts'),
      "const runtime = require('@scope/shared/runtime');\nmodule.exports = runtime;\n",
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
        '@scope/app',
        '--dry-run',
        '--json',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/app', '@scope/shared']);
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'inferred-import',
    });
  });

  test('includes inferred dependencies from __tests__ source files', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/__tests__'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/__tests__/graph.test.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
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
        '@scope/app',
        '--dry-run',
        '--json',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/app', '@scope/shared']);
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'inferred-import',
    });
  });

  test('includes inferred dependencies from tests source files', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/tests'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/tests/graph.test.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
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
        '@scope/app',
        '--dry-run',
        '--json',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/app', '@scope/shared']);
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'inferred-import',
    });
  });

  test('includes inferred dependencies from spec source files', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/spec'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/spec/graph.spec.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
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
        '@scope/app',
        '--dry-run',
        '--json',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/app', '@scope/shared']);
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'inferred-import',
    });
  });

  test('includes inferred dependencies from specs source files', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/specs'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/specs/graph.spec.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
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
        '@scope/app',
        '--dry-run',
        '--json',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/app', '@scope/shared']);
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'inferred-import',
    });
  });

  test('deduplicates inferred dependencies across multiple source files', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'packages/app/tests'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/src/index.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
    );
    fs.writeFileSync(
      path.join(root, 'packages/app/tests/index.test.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
    );

    const result = runCLI(
      ['projects', 'graph', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--json'],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    const appNode = payload.graph.nodes.find((node) => node.name === '@scope/app');
    expect(appNode?.inferredDependencies).toEqual(['@scope/shared']);
    const inferredEdges = payload.graph.edges.filter(
      (edge) => edge.from === '@scope/shared' && edge.to === '@scope/app' && edge.reason === 'inferred-import',
    );
    expect(inferredEdges).toHaveLength(1);
  });

  test('run --no-infer-imports disables inferred dependency closure', () => {
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
        '--no-infer-imports',
        '--dry-run',
        '--json',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/a']);
    expect(payload.graph.edges.some((edge) => edge.reason === 'inferred-import')).toBe(false);
  });

  test('projects graph includes inferred import edges by default', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/src/index.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
    );

    const result = runCLI(
      ['projects', 'graph', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--json'],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'inferred-import',
    });
  });

  test('projects graph --no-infer-imports removes inferred import edges', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/src/index.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
    );

    const result = runCLI(
      [
        'projects',
        'graph',
        '--root',
        root,
        '--config',
        path.join(root, 'wiggum.config.json'),
        '--no-infer-imports',
        '--json',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.graph.edges.some((edge) => edge.reason === 'inferred-import')).toBe(false);
    const appNode = payload.graph.nodes.find((node) => node.name === '@scope/app');
    expect(appNode?.inferredDependencies).toEqual([]);
  });

  test('projects list --no-infer-imports removes inferred dependency summaries', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/src/index.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
    );

    const result = runCLI(
      [
        'projects',
        'list',
        '--root',
        root,
        '--config',
        path.join(root, 'wiggum.config.json'),
        '--no-infer-imports',
        '--json',
      ],
      root,
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    const appProject = payload.projects.find((project) => project.name === '@scope/app');
    expect(appProject?.inferredDependencies).toEqual([]);
  });

  test('run honors WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES scan cap', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages/app/src/000.no-import.ts'), 'export const noop = 1;\n');
    fs.writeFileSync(
      path.join(root, 'packages/app/src/001.with-import.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
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
        '@scope/app',
        '--dry-run',
        '--json',
      ],
      root,
      {
        WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES: '1',
      },
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/app']);
    expect(payload.graph.edges.some((edge) => edge.reason === 'inferred-import')).toBe(false);
  });

  test('run trims whitespace around WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages/app/src/000.no-import.ts'), 'export const noop = 1;\n');
    fs.writeFileSync(
      path.join(root, 'packages/app/src/001.with-import.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
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
        '@scope/app',
        '--dry-run',
        '--json',
      ],
      root,
      {
        WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES: '  1  ',
      },
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/app']);
    expect(payload.graph.edges.some((edge) => edge.reason === 'inferred-import')).toBe(false);
  });

  test('run scan cap uses deterministic lexicographic file ordering', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    // Create the import file first so filesystem order could differ from lexical ordering.
    fs.writeFileSync(
      path.join(root, 'packages/app/src/zzz.with-import.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
    );
    fs.writeFileSync(
      path.join(root, 'packages/app/src/aaa.no-import.ts'),
      'export const noop = 1;\n',
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
        '@scope/app',
        '--dry-run',
        '--json',
      ],
      root,
      {
        WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES: '1',
      },
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/app']);
    expect(payload.graph.edges.some((edge) => edge.reason === 'inferred-import')).toBe(false);
  });

  test('run rejects invalid WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES values', () => {
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
        WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES: 'invalid',
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Runner failed:');
    expect(result.stderr).toContain('Invalid WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES value "invalid"');
  });

  test('run --no-infer-imports ignores invalid WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/src/index.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
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
        '@scope/app',
        '--no-infer-imports',
        '--dry-run',
        '--json',
      ],
      root,
      {
        WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES: 'invalid',
      },
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/app']);
    expect(payload.graph.edges.some((edge) => edge.reason === 'inferred-import')).toBe(false);
  });

  test('run rejects zero WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES values', () => {
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
        WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES: '0',
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Runner failed:');
    expect(result.stderr).toContain('Invalid WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES value "0"');
  });

  test('run rejects unsafe integer WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES values', () => {
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
        WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES: '9007199254740992',
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Runner failed:');
    expect(result.stderr).toContain('Invalid WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES value "9007199254740992"');
  });

  test('run ignores blank WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES values', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/src/index.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
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
        '@scope/app',
        '--dry-run',
        '--json',
      ],
      root,
      {
        WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES: '   ',
      },
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects.map((project) => project.name)).toEqual(['@scope/app', '@scope/shared']);
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'inferred-import',
    });
  });

  test('projects graph rejects invalid WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES values', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['projects', 'graph', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--json'],
      root,
      {
        WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES: 'invalid',
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Failed to resolve projects:');
    expect(result.stderr).toContain('Invalid WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES value "invalid"');
  });

  test('projects graph rejects unsafe WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES values', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['projects', 'graph', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--json'],
      root,
      {
        WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES: '9007199254740992',
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Failed to resolve projects:');
    expect(result.stderr).toContain('Invalid WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES value "9007199254740992"');
  });

  test('projects graph honors WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES scan cap', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages/app/src/000.no-import.ts'), 'export const noop = 1;\n');
    fs.writeFileSync(
      path.join(root, 'packages/app/src/001.with-import.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
    );

    const result = runCLI(
      ['projects', 'graph', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--json'],
      root,
      {
        WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES: '1',
      },
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.graph.edges.some((edge) => edge.reason === 'inferred-import')).toBe(false);
  });

  test('projects graph ignores blank WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES values', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/src/index.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
    );

    const result = runCLI(
      ['projects', 'graph', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--json'],
      root,
      {
        WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES: '   ',
      },
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.graph.edges).toContainEqual({
      from: '@scope/shared',
      to: '@scope/app',
      reason: 'inferred-import',
    });
  });

  test('projects graph trims whitespace around WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages/app/src/000.no-import.ts'), 'export const noop = 1;\n');
    fs.writeFileSync(
      path.join(root, 'packages/app/src/001.with-import.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
    );

    const result = runCLI(
      ['projects', 'graph', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--json'],
      root,
      {
        WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES: '  1  ',
      },
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.graph.edges.some((edge) => edge.reason === 'inferred-import')).toBe(false);
  });

  test('projects list rejects invalid WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES values', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['projects', 'list', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--json'],
      root,
      {
        WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES: 'invalid',
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Failed to resolve projects:');
    expect(result.stderr).toContain('Invalid WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES value "invalid"');
  });

  test('projects list rejects unsafe WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES values', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['projects', 'list', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--json'],
      root,
      {
        WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES: '9007199254740992',
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Failed to resolve projects:');
    expect(result.stderr).toContain('Invalid WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES value "9007199254740992"');
  });

  test('projects graph --no-infer-imports ignores invalid WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/src/index.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
    );

    const result = runCLI(
      [
        'projects',
        'graph',
        '--root',
        root,
        '--config',
        path.join(root, 'wiggum.config.json'),
        '--no-infer-imports',
        '--json',
      ],
      root,
      {
        WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES: 'invalid',
      },
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.graph.edges.some((edge) => edge.reason === 'inferred-import')).toBe(false);
  });

  test('projects list --no-infer-imports ignores invalid WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/src/index.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
    );

    const result = runCLI(
      [
        'projects',
        'list',
        '--root',
        root,
        '--config',
        path.join(root, 'wiggum.config.json'),
        '--no-infer-imports',
        '--json',
      ],
      root,
      {
        WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES: 'invalid',
      },
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    const appProject = payload.projects.find((project) => project.name === '@scope/app');
    expect(appProject?.inferredDependencies).toEqual([]);
  });

  test('projects list honors WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES scan cap', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages/app/src/000.no-import.ts'), 'export const noop = 1;\n');
    fs.writeFileSync(
      path.join(root, 'packages/app/src/001.with-import.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
    );

    const result = runCLI(
      ['projects', 'list', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--json'],
      root,
      {
        WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES: '1',
      },
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    const appProject = payload.projects.find((project) => project.name === '@scope/app');
    expect(appProject?.inferredDependencies).toEqual([]);
  });

  test('projects list ignores blank WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES values', () => {
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
    });
    fs.mkdirSync(path.join(root, 'packages/app/src'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'packages/app/src/index.ts'),
      "import '@scope/shared/runtime';\nexport const value = 1;\n",
    );

    const result = runCLI(
      ['projects', 'list', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--json'],
      root,
      {
        WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES: '   ',
      },
    );

    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    const appProject = payload.projects.find((project) => project.name === '@scope/app');
    expect(appProject?.inferredDependencies).toEqual(['@scope/shared']);
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

  test('projects rejects global --autofix option', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'single-project',
      private: true,
    });

    const result = runCLI(['projects', 'list', '--root', root, '--autofix'], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'Global option --autofix is not supported for "wiggum projects".',
    );
  });

  test('projects rejects global --autofix option when provided before command token', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'package.json'), {
      name: 'single-project',
      private: true,
    });

    const result = runCLI(['--autofix', 'projects', 'list', '--root', root], root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'Global option --autofix is not supported for "wiggum projects".',
    );
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

  test('run rejects global --autofix with --dry-run when provided before command token', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['--autofix', 'run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--dry-run'],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--autofix cannot be used with --dry-run');
  });

  test('run supports leading global --autofix when execution succeeds', () => {
    const root = makeTempWorkspace();
    const configPath = path.join(root, 'wiggum.config.json');
    writeJson(configPath, {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const binDir = path.join(root, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    const fakeRsbuildPath = path.join(binDir, 'rsbuild');
    fs.writeFileSync(
      fakeRsbuildPath,
      '#!/usr/bin/env bash\necho "fake-rsbuild:$@"\nexit 0\n',
      { mode: 0o755 },
    );
    fs.chmodSync(fakeRsbuildPath, 0o755);

    const result = runCLI(
      ['--autofix', 'run', 'build', '--root', root, '--config', configPath],
      root,
      {
        PATH: `${binDir}:${process.env.PATH || ''}`,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[runner] build -> @scope/app');
    expect(result.stdout).toContain('fake-rsbuild:');
    expect(result.stdout).not.toContain('[autofix]');
  });

  test('run supports inline global --autofix when execution succeeds', () => {
    const root = makeTempWorkspace();
    const configPath = path.join(root, 'wiggum.config.json');
    writeJson(configPath, {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const binDir = path.join(root, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    const fakeRsbuildPath = path.join(binDir, 'rsbuild');
    fs.writeFileSync(
      fakeRsbuildPath,
      '#!/usr/bin/env bash\necho "fake-rsbuild:$@"\nexit 0\n',
      { mode: 0o755 },
    );
    fs.chmodSync(fakeRsbuildPath, 0o755);

    const result = runCLI(
      ['run', 'build', '--autofix', '--root', root, '--config', configPath],
      root,
      {
        PATH: `${binDir}:${process.env.PATH || ''}`,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[runner] build -> @scope/app');
    expect(result.stdout).toContain('fake-rsbuild:');
    expect(result.stdout).not.toContain('[autofix]');
  });

  test('run keeps delimiter-passed tool args with leading global --autofix', () => {
    const root = makeTempWorkspace();
    const configPath = path.join(root, 'wiggum.config.json');
    writeJson(configPath, {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const binDir = path.join(root, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    const fakeRsbuildPath = path.join(binDir, 'rsbuild');
    fs.writeFileSync(
      fakeRsbuildPath,
      '#!/usr/bin/env bash\necho "fake-rsbuild:$@"\nexit 0\n',
      { mode: 0o755 },
    );
    fs.chmodSync(fakeRsbuildPath, 0o755);

    const result = runCLI(
      ['--autofix', 'run', 'build', '--root', root, '--config', configPath, '--', '--autofix'],
      root,
      {
        PATH: `${binDir}:${process.env.PATH || ''}`,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[runner] build -> @scope/app');
    expect(result.stdout).toContain('fake-rsbuild:--autofix');
    expect(result.stdout).not.toContain('[autofix] Prompt-only mode enabled.');
  });

  test('run keeps delimiter-passed tool args with inline global --autofix', () => {
    const root = makeTempWorkspace();
    const configPath = path.join(root, 'wiggum.config.json');
    writeJson(configPath, {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const binDir = path.join(root, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    const fakeRsbuildPath = path.join(binDir, 'rsbuild');
    fs.writeFileSync(
      fakeRsbuildPath,
      '#!/usr/bin/env bash\necho "fake-rsbuild:$@"\nexit 0\n',
      { mode: 0o755 },
    );
    fs.chmodSync(fakeRsbuildPath, 0o755);

    const result = runCLI(
      ['run', 'build', '--autofix', '--root', root, '--config', configPath, '--', '--autofix'],
      root,
      {
        PATH: `${binDir}:${process.env.PATH || ''}`,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('[runner] build -> @scope/app');
    expect(result.stdout).toContain('fake-rsbuild:--autofix');
    expect(result.stdout).not.toContain('[autofix] Prompt-only mode enabled.');
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

  test('projects ignores invalid WIGGUM_RUNNER_PARALLEL env value', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['projects', 'list', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--json'],
      root,
      {
        WIGGUM_RUNNER_PARALLEL: '2abc',
      },
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects).toHaveLength(1);
    expect(payload.projects[0].name).toBe('@scope/app');
  });

  test('projects ignores zero WIGGUM_RUNNER_PARALLEL env value', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['projects', 'list', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--json'],
      root,
      {
        WIGGUM_RUNNER_PARALLEL: '0',
      },
    );
    expect(result.exitCode).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.projects).toHaveLength(1);
    expect(payload.projects[0].name).toBe('@scope/app');
  });

  test('run rejects zero WIGGUM_RUNNER_PARALLEL env value', () => {
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
        WIGGUM_RUNNER_PARALLEL: '0',
      },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid WIGGUM_RUNNER_PARALLEL value "0"');
  });

  test('run rejects unsafe-integer WIGGUM_RUNNER_PARALLEL env value', () => {
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
        WIGGUM_RUNNER_PARALLEL: '9007199254740992',
      },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid WIGGUM_RUNNER_PARALLEL value "9007199254740992"');
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

  test('run rejects zero --parallel values', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--parallel', '0', '--dry-run'],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid --parallel value "0"');
  });

  test('run rejects unsafe-integer --parallel values', () => {
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
        '9007199254740992',
        '--dry-run',
      ],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid --parallel value "9007199254740992"');
  });

  test('run rejects empty --parallel= value', () => {
    const root = makeTempWorkspace();
    writeJson(path.join(root, 'wiggum.config.json'), {
      projects: ['packages/*'],
    });
    writeJson(path.join(root, 'packages/app/package.json'), {
      name: '@scope/app',
      version: '1.0.0',
    });

    const result = runCLI(
      ['run', 'build', '--root', root, '--config', path.join(root, 'wiggum.config.json'), '--parallel=', '--dry-run'],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing value for --parallel');
  });

  test('run rejects empty --concurrency= value', () => {
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
        '--concurrency=',
        '--dry-run',
      ],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing value for --concurrency');
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

  test('run rejects zero --concurrency= values', () => {
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
        '--concurrency=0',
        '--dry-run',
      ],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid --concurrency value "0"');
  });

  test('run rejects unsafe-integer --concurrency= values', () => {
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
        '--concurrency=9007199254740992',
        '--dry-run',
      ],
      root,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid --concurrency value "9007199254740992"');
  });
});
