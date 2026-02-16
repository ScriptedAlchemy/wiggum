import { describe, test, expect } from '@rstest/core';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  extractResolvedProjectRoots,
  findDuplicatePaths,
  listExpectedProjectRoots,
  ensureNonEmptyPathString,
  parseMinimumExpectedProjects,
  verifyRunnerCoverage,
  verifyRunnerCoverageData,
} from '../scripts/verify-runner-coverage.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const COVERAGE_SCRIPT_PATH = path.resolve(__dirname, '../scripts/verify-runner-coverage.mjs');

describe('runner coverage verifier', () => {
  test('parseMinimumExpectedProjects returns default when value is undefined', () => {
    expect(parseMinimumExpectedProjects(undefined)).toBe(4);
  });

  test('parseMinimumExpectedProjects accepts whitespace-padded integer values', () => {
    expect(parseMinimumExpectedProjects(' 7 ')).toBe(7);
  });

  test('parseMinimumExpectedProjects rejects non-numeric values', () => {
    expect(() => parseMinimumExpectedProjects('7abc')).toThrow(
      'MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS must be a positive integer',
    );
  });

  test('parseMinimumExpectedProjects rejects zero', () => {
    expect(() => parseMinimumExpectedProjects('0')).toThrow(
      'MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS must be >= 1, got 0',
    );
  });

  test('findDuplicatePaths returns sorted unique duplicates', () => {
    expect(
      findDuplicatePaths([
        '/repo/packages/cli',
        '/repo/packages/agent',
        '/repo/packages/cli',
        '/repo/packages/demo',
        '/repo/packages/agent',
      ]),
    ).toEqual([
      '/repo/packages/agent',
      '/repo/packages/cli',
    ]);
  });

  test('ensureNonEmptyPathString trims and returns normalized path token', () => {
    expect(ensureNonEmptyPathString('  /repo/packages  ', 'packagesDir')).toBe('/repo/packages');
  });

  test('ensureNonEmptyPathString rejects non-string values', () => {
    expect(() => ensureNonEmptyPathString(null, 'rootDir')).toThrow('rootDir must be a string path');
  });

  test('ensureNonEmptyPathString rejects blank strings', () => {
    expect(() => ensureNonEmptyPathString('   ', 'configPath')).toThrow(
      'configPath must be a non-empty string path',
    );
  });

  test('extractResolvedProjectRoots rejects missing projects container', () => {
    expect(() => extractResolvedProjectRoots({})).toThrow(
      'resolveRunnerWorkspace must return an object with a projects array',
    );
  });

  test('extractResolvedProjectRoots rejects invalid project root entries', () => {
    expect(() =>
      extractResolvedProjectRoots({
        projects: [{ root: '/repo/packages/cli' }, { root: '' }],
      }),
    ).toThrow('resolveRunnerWorkspace returned invalid project root at index 1');
  });

  test('returns summary when all expected projects are resolved', () => {
    const rootDir = '/repo';
    const expectedProjectRoots = [
      path.join(rootDir, 'packages', 'agent'),
      path.join(rootDir, 'packages', 'cli'),
    ];
    const resolvedProjectRoots = [
      path.join(rootDir, 'packages', 'cli'),
      path.join(rootDir, 'packages', 'agent'),
      path.join(rootDir, 'packages', 'extra'),
    ];

    const result = verifyRunnerCoverageData({
      expectedProjectRoots,
      resolvedProjectRoots,
      minExpectedProjects: 2,
      rootDir,
    });

    expect(result).toEqual({
      expectedCount: 2,
      resolvedCount: 3,
    });
  });

  test('rejects invalid expectedProjectRoots container type', () => {
    expect(() =>
      verifyRunnerCoverageData({
        expectedProjectRoots: null,
        resolvedProjectRoots: ['/repo/packages/cli'],
        minExpectedProjects: 1,
        rootDir: '/repo',
      }),
    ).toThrow('expectedProjectRoots must be an array of project root paths');
  });

  test('rejects invalid resolvedProjectRoots container type', () => {
    expect(() =>
      verifyRunnerCoverageData({
        expectedProjectRoots: ['/repo/packages/cli'],
        resolvedProjectRoots: null,
        minExpectedProjects: 1,
        rootDir: '/repo',
      }),
    ).toThrow('resolvedProjectRoots must be an array of project root paths');
  });

  test('rejects non-string project root entries', () => {
    expect(() =>
      verifyRunnerCoverageData({
        expectedProjectRoots: ['/repo/packages/cli', 42],
        resolvedProjectRoots: ['/repo/packages/cli'],
        minExpectedProjects: 1,
        rootDir: '/repo',
      }),
    ).toThrow('expectedProjectRoots[1] must be a string path');
  });

  test('rejects whitespace-only project root entries', () => {
    expect(() =>
      verifyRunnerCoverageData({
        expectedProjectRoots: ['/repo/packages/cli', '   '],
        resolvedProjectRoots: ['/repo/packages/cli'],
        minExpectedProjects: 1,
        rootDir: '/repo',
      }),
    ).toThrow('expectedProjectRoots[1] must be a non-empty string path');
  });

  test('accepts whitespace-padded project root entries', () => {
    const result = verifyRunnerCoverageData({
      expectedProjectRoots: ['  /repo/packages/cli  '],
      resolvedProjectRoots: ['/repo/packages/cli'],
      minExpectedProjects: 1,
      rootDir: '/repo',
    });
    expect(result).toEqual({
      expectedCount: 1,
      resolvedCount: 1,
    });
  });

  test('rejects empty rootDir value', () => {
    expect(() =>
      verifyRunnerCoverageData({
        expectedProjectRoots: ['/repo/packages/cli'],
        resolvedProjectRoots: ['/repo/packages/cli'],
        minExpectedProjects: 1,
        rootDir: '',
      }),
    ).toThrow('rootDir must be a non-empty string path');
  });

  test('rejects invalid minimum expected project count', () => {
    expect(() =>
      verifyRunnerCoverageData({
        expectedProjectRoots: ['/repo/packages/cli'],
        resolvedProjectRoots: ['/repo/packages/cli'],
        minExpectedProjects: 0,
        rootDir: '/repo',
      }),
    ).toThrow('MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS must be an integer >= 1');
  });

  test('rejects non-integer minimum expected project count', () => {
    expect(() =>
      verifyRunnerCoverageData({
        expectedProjectRoots: ['/repo/packages/cli'],
        resolvedProjectRoots: ['/repo/packages/cli'],
        minExpectedProjects: 1.5,
        rootDir: '/repo',
      }),
    ).toThrow('MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS must be an integer >= 1');
  });

  test('rejects duplicate expected project roots', () => {
    expect(() =>
      verifyRunnerCoverageData({
        expectedProjectRoots: ['/repo/packages/cli', '/repo/packages/cli'],
        resolvedProjectRoots: ['/repo/packages/cli'],
        minExpectedProjects: 1,
        rootDir: '/repo',
      }),
    ).toThrow('expectedProjectRoots contains duplicate project root path(s):\n- /repo/packages/cli');
  });

  test('rejects duplicate resolved project roots', () => {
    expect(() =>
      verifyRunnerCoverageData({
        expectedProjectRoots: ['/repo/packages/cli'],
        resolvedProjectRoots: ['/repo/packages/cli', '/repo/packages/cli'],
        minExpectedProjects: 1,
        rootDir: '/repo',
      }),
    ).toThrow('resolvedProjectRoots contains duplicate project root path(s):\n- /repo/packages/cli');
  });

  test('rejects when expected package roots are lower than minimum threshold', () => {
    expect(() =>
      verifyRunnerCoverageData({
        expectedProjectRoots: ['/repo/packages/cli'],
        resolvedProjectRoots: ['/repo/packages/cli'],
        minExpectedProjects: 3,
        rootDir: '/repo',
      }),
    ).toThrow('Expected at least 3 package projects, found 1.');
  });

  test('rejects when workspace resolution omits expected package roots', () => {
    const rootDir = '/repo';
    expect(() =>
      verifyRunnerCoverageData({
        expectedProjectRoots: [
          path.join(rootDir, 'packages', 'agent'),
          path.join(rootDir, 'packages', 'cli'),
        ],
        resolvedProjectRoots: [path.join(rootDir, 'packages', 'cli')],
        minExpectedProjects: 1,
        rootDir,
      }),
    ).toThrow('Runner config is missing 1 package project(s):\n- packages/agent');
  });

  test('lists expected package roots sorted and package-json filtered', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-coverage-list-'));
    const packagesDir = path.join(tempRoot, 'packages');
    fs.mkdirSync(packagesDir, { recursive: true });
    fs.mkdirSync(path.join(packagesDir, 'zebra'));
    fs.mkdirSync(path.join(packagesDir, 'alpha'));
    fs.mkdirSync(path.join(packagesDir, 'docs'));
    fs.writeFileSync(path.join(packagesDir, 'zebra', 'package.json'), '{}');
    fs.writeFileSync(path.join(packagesDir, 'alpha', 'package.json'), '{}');
    fs.writeFileSync(path.join(packagesDir, 'README.md'), 'not-a-package');

    const result = listExpectedProjectRoots(packagesDir);
    expect(result).toEqual([
      path.resolve(path.join(packagesDir, 'alpha')),
      path.resolve(path.join(packagesDir, 'zebra')),
    ]);
  });

  test('listExpectedProjectRoots rejects missing packages directory', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-coverage-list-missing-'));
    const missingPackagesDir = path.join(tempRoot, 'packages');
    expect(() => listExpectedProjectRoots(missingPackagesDir)).toThrow(
      `Packages directory not found at ${missingPackagesDir}`,
    );
  });

  test('listExpectedProjectRoots rejects non-directory packages path', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-coverage-list-file-'));
    const notDirectoryPath = path.join(tempRoot, 'packages');
    fs.writeFileSync(notDirectoryPath, 'not-a-directory');
    expect(() => listExpectedProjectRoots(notDirectoryPath)).toThrow(
      `Packages path must be a directory: ${notDirectoryPath}`,
    );
  });

  test('verifyRunnerCoverage rejects when config file is missing', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-coverage-config-'));
    const packagesDir = path.join(tempRoot, 'packages');
    fs.mkdirSync(packagesDir, { recursive: true });

    await expect(
      verifyRunnerCoverage({
        rootDir: tempRoot,
        configPath: path.join(tempRoot, 'wiggum.config.json'),
        packagesDir,
        minExpectedProjects: 1,
      }),
    ).rejects.toThrow('Runner config not found');
  });

  test('verifyRunnerCoverage passes expected options to workspace resolver', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-coverage-resolve-'));
    const configPath = path.join(tempRoot, 'wiggum.config.json');
    const packagesDir = path.join(tempRoot, 'packages');
    fs.mkdirSync(path.join(packagesDir, 'cli'), { recursive: true });
    fs.writeFileSync(configPath, '{"projects":["packages/*"]}');
    fs.writeFileSync(path.join(packagesDir, 'cli', 'package.json'), '{"name":"@wiggum/cli"}');

    const resolverCalls = [];
    const originalLog = console.log;
    const logMessages = [];
    console.log = (...args) => {
      logMessages.push(args.join(' '));
    };
    try {
      await verifyRunnerCoverage({
        rootDir: tempRoot,
        configPath,
        packagesDir,
        minExpectedProjects: 1,
        resolveWorkspace: async (options) => {
          resolverCalls.push(options);
          return {
            projects: [{ root: path.join(packagesDir, 'cli') }],
          };
        },
      });
    } finally {
      console.log = originalLog;
    }

    expect(resolverCalls).toHaveLength(1);
    expect(resolverCalls[0]).toEqual({
      rootDir: tempRoot,
      configPath,
      includeDependenciesForFiltered: false,
      includeInferredImports: false,
    });
    expect(logMessages[0]).toContain('[verify-runner-coverage] Verified 1 projects covering 1 package roots.');
  });

  test('verifyRunnerCoverage uses env minimum when argument is omitted', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-coverage-env-min-'));
    const configPath = path.join(tempRoot, 'wiggum.config.json');
    const packagesDir = path.join(tempRoot, 'packages');
    fs.mkdirSync(path.join(packagesDir, 'cli'), { recursive: true });
    fs.writeFileSync(configPath, '{"projects":["packages/*"]}');
    fs.writeFileSync(path.join(packagesDir, 'cli', 'package.json'), '{"name":"@wiggum/cli"}');

    const originalValue = process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS;
    process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS = '1';
    try {
      await expect(
        verifyRunnerCoverage({
          rootDir: tempRoot,
          configPath,
          packagesDir,
          resolveWorkspace: async () => ({
            projects: [{ root: path.join(packagesDir, 'cli') }],
          }),
        }),
      ).resolves.toBeUndefined();
    } finally {
      if (originalValue === undefined) {
        delete process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS;
      } else {
        process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS = originalValue;
      }
    }
  });

  test('verifyRunnerCoverage rejects invalid env minimum when argument is omitted', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-coverage-env-invalid-'));
    const configPath = path.join(tempRoot, 'wiggum.config.json');
    const packagesDir = path.join(tempRoot, 'packages');
    fs.mkdirSync(path.join(packagesDir, 'cli'), { recursive: true });
    fs.writeFileSync(configPath, '{"projects":["packages/*"]}');
    fs.writeFileSync(path.join(packagesDir, 'cli', 'package.json'), '{"name":"@wiggum/cli"}');

    const originalValue = process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS;
    process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS = 'abc';
    try {
      await expect(
        verifyRunnerCoverage({
          rootDir: tempRoot,
          configPath,
          packagesDir,
          resolveWorkspace: async () => ({
            projects: [{ root: path.join(packagesDir, 'cli') }],
          }),
        }),
      ).rejects.toThrow('MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS must be a positive integer');
    } finally {
      if (originalValue === undefined) {
        delete process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS;
      } else {
        process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS = originalValue;
      }
    }
  });

  test('verifyRunnerCoverage rejects malformed resolver payload without projects array', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-coverage-bad-workspace-'));
    const configPath = path.join(tempRoot, 'wiggum.config.json');
    const packagesDir = path.join(tempRoot, 'packages');
    fs.mkdirSync(path.join(packagesDir, 'cli'), { recursive: true });
    fs.writeFileSync(configPath, '{"projects":["packages/*"]}');
    fs.writeFileSync(path.join(packagesDir, 'cli', 'package.json'), '{"name":"@wiggum/cli"}');

    await expect(
      verifyRunnerCoverage({
        rootDir: tempRoot,
        configPath,
        packagesDir,
        minExpectedProjects: 1,
        resolveWorkspace: async () => ({}),
      }),
    ).rejects.toThrow('resolveRunnerWorkspace must return an object with a projects array');
  });

  test('verifyRunnerCoverage rejects non-function resolveWorkspace option', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-coverage-non-function-resolver-'));
    const configPath = path.join(tempRoot, 'wiggum.config.json');
    const packagesDir = path.join(tempRoot, 'packages');
    fs.mkdirSync(path.join(packagesDir, 'cli'), { recursive: true });
    fs.writeFileSync(configPath, '{"projects":["packages/*"]}');
    fs.writeFileSync(path.join(packagesDir, 'cli', 'package.json'), '{"name":"@wiggum/cli"}');

    await expect(
      verifyRunnerCoverage({
        rootDir: tempRoot,
        configPath,
        packagesDir,
        minExpectedProjects: 1,
        resolveWorkspace: null,
      }),
    ).rejects.toThrow('resolveWorkspace must be a function');
  });

  test('verifyRunnerCoverage rejects blank path options', async () => {
    await expect(
      verifyRunnerCoverage({
        rootDir: '  ',
        configPath: '/tmp/wiggum.config.json',
        packagesDir: '/tmp/packages',
        minExpectedProjects: 1,
        resolveWorkspace: async () => ({ projects: [] }),
      }),
    ).rejects.toThrow('rootDir must be a non-empty string path');
  });

  test('verifyRunnerCoverage rejects malformed resolver project root entries', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-coverage-bad-project-root-'));
    const configPath = path.join(tempRoot, 'wiggum.config.json');
    const packagesDir = path.join(tempRoot, 'packages');
    fs.mkdirSync(path.join(packagesDir, 'cli'), { recursive: true });
    fs.writeFileSync(configPath, '{"projects":["packages/*"]}');
    fs.writeFileSync(path.join(packagesDir, 'cli', 'package.json'), '{"name":"@wiggum/cli"}');

    await expect(
      verifyRunnerCoverage({
        rootDir: tempRoot,
        configPath,
        packagesDir,
        minExpectedProjects: 1,
        resolveWorkspace: async () => ({
          projects: [{ root: path.join(packagesDir, 'cli') }, { root: '' }],
        }),
      }),
    ).rejects.toThrow('resolveRunnerWorkspace returned invalid project root at index 1');
  });

  test('coverage verifier CLI exits with prefixed error for invalid env minimum', () => {
    const result = spawnSync(process.execPath, [COVERAGE_SCRIPT_PATH], {
      cwd: path.resolve(__dirname, '../../..'),
      encoding: 'utf8',
      env: {
        ...process.env,
        MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS: 'abc',
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[verify-runner-coverage]');
    expect(result.stderr).toContain('MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS must be a positive integer');
  });

  test('coverage verifier CLI succeeds with valid env minimum', () => {
    const result = spawnSync(process.execPath, [COVERAGE_SCRIPT_PATH], {
      cwd: path.resolve(__dirname, '../../..'),
      encoding: 'utf8',
      env: {
        ...process.env,
        MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS: '1',
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[verify-runner-coverage] Verified');
  });
});
