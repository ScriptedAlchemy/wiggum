import { describe, test, expect, afterEach } from '@rstest/core';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  detectSupportedRunnerConfigPath,
  ensureFileSystemContract,
  extractResolvedProjectRoots,
  findDuplicatePaths,
  listExpectedProjectRoots,
  ensureNonEmptyPathString,
  resolveVerifierPathsFromEnv,
  resolvePathOption,
  parseMinimumExpectedProjects,
  verifyRunnerCoverage,
  verifyRunnerCoverageData,
} from '../scripts/verify-runner-coverage.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const COVERAGE_SCRIPT_PATH = path.resolve(__dirname, '../scripts/verify-runner-coverage.mjs');
const tempDirs = new Set();

function makeTempDir(prefix) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.add(tempDir);
  return tempDir;
}

function createCoverageVerifierFixture({
  configContent,
  createPackagesDir = true,
  packageNames = [],
} = {}) {
  const fixtureRoot = makeTempDir('coverage-verifier-fixture-');

  if (configContent !== undefined) {
    fs.writeFileSync(path.join(fixtureRoot, 'wiggum.config.json'), configContent);
  }

  if (createPackagesDir) {
    const packagesDir = path.join(fixtureRoot, 'packages');
    fs.mkdirSync(packagesDir, { recursive: true });
    for (const packageName of packageNames) {
      const packageDir = path.join(packagesDir, packageName);
      fs.mkdirSync(packageDir, { recursive: true });
      fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: `@fixture/${packageName}` }));
    }
  }

  return {
    rootDir: fixtureRoot,
  };
}

afterEach(() => {
  for (const tempDir of tempDirs) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  tempDirs.clear();
});

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

  test('parseMinimumExpectedProjects rejects non-string values', () => {
    expect(() => parseMinimumExpectedProjects(7)).toThrow(
      'MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS must be a string when provided',
    );
  });

  test('parseMinimumExpectedProjects rejects values above max safe integer', () => {
    expect(() => parseMinimumExpectedProjects('9007199254740992')).toThrow(
      `MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS must be <= ${Number.MAX_SAFE_INTEGER}`,
    );
  });

  test('parseMinimumExpectedProjects rejects zero', () => {
    expect(() => parseMinimumExpectedProjects('0')).toThrow(
      'MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS must be >= 1, got 0',
    );
  });

  test('resolveVerifierPathsFromEnv resolves relative overrides from root', () => {
    const result = resolveVerifierPathsFromEnv({
      env: {
        WIGGUM_RUNNER_VERIFY_ROOT: '/repo',
        WIGGUM_RUNNER_VERIFY_CONFIG_PATH: 'configs/wiggum.custom.json',
        WIGGUM_RUNNER_VERIFY_PACKAGES_DIR: 'custom-packages',
      },
    });

    expect(result).toEqual({
      rootDir: path.resolve('/repo'),
      configPath: path.resolve('/repo', 'configs/wiggum.custom.json'),
      packagesDir: path.resolve('/repo', 'custom-packages'),
    });
  });

  test('resolveVerifierPathsFromEnv accepts absolute config and packages overrides', () => {
    const result = resolveVerifierPathsFromEnv({
      env: {
        WIGGUM_RUNNER_VERIFY_ROOT: '/repo',
        WIGGUM_RUNNER_VERIFY_CONFIG_PATH: '/opt/configs/wiggum.custom.json',
        WIGGUM_RUNNER_VERIFY_PACKAGES_DIR: '/srv/workspace/packages',
      },
    });

    expect(result).toEqual({
      rootDir: path.resolve('/repo'),
      configPath: path.resolve('/opt/configs/wiggum.custom.json'),
      packagesDir: path.resolve('/srv/workspace/packages'),
    });
  });

  test('resolveVerifierPathsFromEnv ignores blank overrides and uses fallback root', () => {
    const result = resolveVerifierPathsFromEnv({
      env: {
        WIGGUM_RUNNER_VERIFY_ROOT: '   ',
        WIGGUM_RUNNER_VERIFY_CONFIG_PATH: '',
        WIGGUM_RUNNER_VERIFY_PACKAGES_DIR: ' ',
      },
      fallbackRoot: '/fallback/workspace',
    });

    expect(result).toEqual({
      rootDir: path.resolve('/fallback/workspace'),
      configPath: path.resolve('/fallback/workspace', 'wiggum.config.json'),
      packagesDir: path.resolve('/fallback/workspace', 'packages'),
    });
  });

  test('detectSupportedRunnerConfigPath prefers existing supported config files', () => {
    const tempRoot = makeTempDir('verify-coverage-detect-config-');
    fs.writeFileSync(path.join(tempRoot, 'wiggum.config.mjs'), 'export default {};');

    const result = detectSupportedRunnerConfigPath(tempRoot);
    expect(result).toBe(path.join(tempRoot, 'wiggum.config.mjs'));
  });

  test('detectSupportedRunnerConfigPath follows runner precedence when multiple supported files exist', () => {
    const tempRoot = makeTempDir('verify-coverage-detect-config-order-');
    fs.writeFileSync(path.join(tempRoot, 'wiggum.config.json'), '{}');
    fs.writeFileSync(path.join(tempRoot, 'wiggum.config.mjs'), 'export default {};');

    const result = detectSupportedRunnerConfigPath(tempRoot);
    expect(result).toBe(path.join(tempRoot, 'wiggum.config.mjs'));
  });

  test('detectSupportedRunnerConfigPath falls back to json path when no supported files exist', () => {
    const tempRoot = makeTempDir('verify-coverage-detect-config-fallback-');

    const result = detectSupportedRunnerConfigPath(tempRoot);
    expect(result).toBe(path.join(tempRoot, 'wiggum.config.json'));
  });

  test('detectSupportedRunnerConfigPath rejects unsupported ts config when no supported files exist', () => {
    const tempRoot = makeTempDir('verify-coverage-detect-config-unsupported-ts-');
    fs.writeFileSync(path.join(tempRoot, 'wiggum.config.ts'), 'export default {};');

    expect(() => detectSupportedRunnerConfigPath(tempRoot)).toThrow(
      'Unsupported runner config file "wiggum.config.ts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
  });

  test('detectSupportedRunnerConfigPath rejects unsupported mts config when no supported files exist', () => {
    const tempRoot = makeTempDir('verify-coverage-detect-config-unsupported-mts-');
    fs.writeFileSync(path.join(tempRoot, 'wiggum.config.mts'), 'export default {};');

    expect(() => detectSupportedRunnerConfigPath(tempRoot)).toThrow(
      'Unsupported runner config file "wiggum.config.mts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
  });

  test('detectSupportedRunnerConfigPath rejects unsupported cts config when no supported files exist', () => {
    const tempRoot = makeTempDir('verify-coverage-detect-config-unsupported-cts-');
    fs.writeFileSync(path.join(tempRoot, 'wiggum.config.cts'), 'export default {};');

    expect(() => detectSupportedRunnerConfigPath(tempRoot)).toThrow(
      'Unsupported runner config file "wiggum.config.cts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
  });

  test('detectSupportedRunnerConfigPath prefers supported config even when unsupported ts config exists', () => {
    const tempRoot = makeTempDir('verify-coverage-detect-config-supported-with-unsupported-');
    fs.writeFileSync(path.join(tempRoot, 'wiggum.config.ts'), 'export default {};');
    fs.writeFileSync(path.join(tempRoot, 'wiggum.config.cjs'), 'module.exports = {};');

    const result = detectSupportedRunnerConfigPath(tempRoot);
    expect(result).toBe(path.join(tempRoot, 'wiggum.config.cjs'));
  });

  test('detectSupportedRunnerConfigPath rejects invalid rootDir values', () => {
    expect(() => detectSupportedRunnerConfigPath('   ')).toThrow(
      'rootDir must be a non-empty string path',
    );
  });

  test('detectSupportedRunnerConfigPath rejects invalid fileSystem contract', () => {
    const tempRoot = makeTempDir('verify-coverage-detect-config-bad-fs-');
    expect(() => detectSupportedRunnerConfigPath(tempRoot, {})).toThrow(
      'fileSystem is missing required function(s): existsSync, statSync, readdirSync',
    );
  });

  test('resolveVerifierPathsFromEnv auto-detects supported non-json config files', () => {
    const tempRoot = makeTempDir('verify-coverage-env-detect-config-');
    fs.writeFileSync(path.join(tempRoot, 'wiggum.config.cjs'), 'module.exports = {};');

    const result = resolveVerifierPathsFromEnv({
      env: {
        WIGGUM_RUNNER_VERIFY_ROOT: tempRoot,
      },
    });

    expect(result).toEqual({
      rootDir: path.resolve(tempRoot),
      configPath: path.resolve(tempRoot, 'wiggum.config.cjs'),
      packagesDir: path.resolve(tempRoot, 'packages'),
    });
  });

  test('resolveVerifierPathsFromEnv surfaces unsupported ts runner config files', () => {
    const tempRoot = makeTempDir('verify-coverage-env-detect-unsupported-ts-');
    fs.writeFileSync(path.join(tempRoot, 'wiggum.config.ts'), 'export default {};');

    expect(() =>
      resolveVerifierPathsFromEnv({
        env: {
          WIGGUM_RUNNER_VERIFY_ROOT: tempRoot,
        },
      }),
    ).toThrow(
      'Unsupported runner config file "wiggum.config.ts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
  });

  test('resolveVerifierPathsFromEnv rejects unsupported explicit config path overrides', () => {
    const tempRoot = makeTempDir('verify-coverage-env-override-unsupported-ts-');
    const configPath = path.join(tempRoot, 'configs', 'wiggum.config.ts');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, 'export default {};');

    expect(() =>
      resolveVerifierPathsFromEnv({
        env: {
          WIGGUM_RUNNER_VERIFY_ROOT: tempRoot,
          WIGGUM_RUNNER_VERIFY_CONFIG_PATH: configPath,
        },
      }),
    ).toThrow(
      'Unsupported runner config file "wiggum.config.ts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
  });

  test('resolveVerifierPathsFromEnv rejects unsupported explicit mts config path overrides', () => {
    const tempRoot = makeTempDir('verify-coverage-env-override-unsupported-mts-');
    const configPath = path.join(tempRoot, 'configs', 'wiggum.config.mts');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, 'export default {};');

    expect(() =>
      resolveVerifierPathsFromEnv({
        env: {
          WIGGUM_RUNNER_VERIFY_ROOT: tempRoot,
          WIGGUM_RUNNER_VERIFY_CONFIG_PATH: configPath,
        },
      }),
    ).toThrow(
      'Unsupported runner config file "wiggum.config.mts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
  });

  test('resolveVerifierPathsFromEnv rejects unsupported explicit cts config path overrides', () => {
    const tempRoot = makeTempDir('verify-coverage-env-override-unsupported-cts-');
    const configPath = path.join(tempRoot, 'configs', 'wiggum.config.cts');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, 'export default {};');

    expect(() =>
      resolveVerifierPathsFromEnv({
        env: {
          WIGGUM_RUNNER_VERIFY_ROOT: tempRoot,
          WIGGUM_RUNNER_VERIFY_CONFIG_PATH: configPath,
        },
      }),
    ).toThrow(
      'Unsupported runner config file "wiggum.config.cts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
  });

  test('resolveVerifierPathsFromEnv rejects non-string fallbackRoot', () => {
    expect(() =>
      resolveVerifierPathsFromEnv({
        env: {},
        fallbackRoot: null,
      }),
    ).toThrow('fallbackRoot must be a string path');
  });

  test('resolveVerifierPathsFromEnv rejects non-object env values', () => {
    expect(() =>
      resolveVerifierPathsFromEnv({
        env: null,
      }),
    ).toThrow('env must be an object');
  });

  test('resolveVerifierPathsFromEnv rejects invalid fileSystem option', () => {
    expect(() =>
      resolveVerifierPathsFromEnv({
        env: {},
        fileSystem: {},
      }),
    ).toThrow('fileSystem is missing required function(s): existsSync, statSync, readdirSync');
  });

  test('resolveVerifierPathsFromEnv rejects array env values', () => {
    expect(() =>
      resolveVerifierPathsFromEnv({
        env: [],
      }),
    ).toThrow('env must be an object');
  });

  test('resolveVerifierPathsFromEnv rejects non-string override values', () => {
    expect(() =>
      resolveVerifierPathsFromEnv({
        env: {
          WIGGUM_RUNNER_VERIFY_ROOT: 42,
        },
      }),
    ).toThrow('WIGGUM_RUNNER_VERIFY_ROOT must be a string when provided');
  });

  test('resolveVerifierPathsFromEnv rejects non-string config-path override values', () => {
    expect(() =>
      resolveVerifierPathsFromEnv({
        env: {
          WIGGUM_RUNNER_VERIFY_CONFIG_PATH: 42,
        },
      }),
    ).toThrow('WIGGUM_RUNNER_VERIFY_CONFIG_PATH must be a string when provided');
  });

  test('resolveVerifierPathsFromEnv rejects non-string packages-dir override values', () => {
    expect(() =>
      resolveVerifierPathsFromEnv({
        env: {
          WIGGUM_RUNNER_VERIFY_PACKAGES_DIR: 42,
        },
      }),
    ).toThrow('WIGGUM_RUNNER_VERIFY_PACKAGES_DIR must be a string when provided');
  });

  test('resolveVerifierPathsFromEnv rejects blank fallbackRoot', () => {
    expect(() =>
      resolveVerifierPathsFromEnv({
        env: {},
        fallbackRoot: '   ',
      }),
    ).toThrow('fallbackRoot must be a non-empty string path');
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

  test('resolvePathOption resolves relative path against provided base directory', () => {
    expect(resolvePathOption('packages/cli', 'packagesDir', '/repo')).toBe('/repo/packages/cli');
  });

  test('ensureFileSystemContract rejects missing required methods', () => {
    expect(() => ensureFileSystemContract({ existsSync: () => true })).toThrow(
      'fileSystem is missing required function(s): statSync, readdirSync',
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

  test('resolves relative project roots against rootDir', () => {
    const result = verifyRunnerCoverageData({
      expectedProjectRoots: ['packages/cli'],
      resolvedProjectRoots: ['packages/cli'],
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

  test('rejects unsafe integer minimum expected project count', () => {
    expect(() =>
      verifyRunnerCoverageData({
        expectedProjectRoots: ['/repo/packages/cli'],
        resolvedProjectRoots: ['/repo/packages/cli'],
        minExpectedProjects: 9007199254740992,
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
    const tempRoot = makeTempDir('verify-coverage-list-');
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
    const tempRoot = makeTempDir('verify-coverage-list-missing-');
    const missingPackagesDir = path.join(tempRoot, 'packages');
    expect(() => listExpectedProjectRoots(missingPackagesDir)).toThrow(
      `Packages directory not found at ${missingPackagesDir}`,
    );
  });

  test('listExpectedProjectRoots rejects non-directory packages path', () => {
    const tempRoot = makeTempDir('verify-coverage-list-file-');
    const notDirectoryPath = path.join(tempRoot, 'packages');
    fs.writeFileSync(notDirectoryPath, 'not-a-directory');
    expect(() => listExpectedProjectRoots(notDirectoryPath)).toThrow(
      `Packages path must be a directory: ${notDirectoryPath}`,
    );
  });

  test('listExpectedProjectRoots rejects invalid fileSystem option', () => {
    const tempRoot = makeTempDir('verify-coverage-list-fs-contract-');
    const packagesDir = path.join(tempRoot, 'packages');
    expect(() => listExpectedProjectRoots(packagesDir, {})).toThrow(
      'fileSystem is missing required function(s): existsSync, statSync, readdirSync',
    );
  });

  test('verifyRunnerCoverage rejects when config file is missing', async () => {
    const tempRoot = makeTempDir('verify-coverage-config-');
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

  test('verifyRunnerCoverage rejects unsupported explicit config path before resolver execution', async () => {
    const tempRoot = makeTempDir('verify-coverage-config-unsupported-explicit-');
    const packagesDir = path.join(tempRoot, 'packages');
    const unsupportedConfigPath = path.join(tempRoot, 'wiggum.config.ts');
    fs.mkdirSync(packagesDir, { recursive: true });
    fs.writeFileSync(unsupportedConfigPath, 'export default {};');

    let resolveWorkspaceCalls = 0;
    await expect(
      verifyRunnerCoverage({
        rootDir: tempRoot,
        configPath: unsupportedConfigPath,
        packagesDir,
        minExpectedProjects: 1,
        resolveWorkspace: async () => {
          resolveWorkspaceCalls += 1;
          return { projects: [] };
        },
      }),
    ).rejects.toThrow(
      'Unsupported runner config file "wiggum.config.ts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
    expect(resolveWorkspaceCalls).toBe(0);
  });

  test('verifyRunnerCoverage rejects unsupported explicit mts config path before resolver execution', async () => {
    const tempRoot = makeTempDir('verify-coverage-config-unsupported-explicit-mts-');
    const packagesDir = path.join(tempRoot, 'packages');
    const unsupportedConfigPath = path.join(tempRoot, 'wiggum.config.mts');
    fs.mkdirSync(packagesDir, { recursive: true });
    fs.writeFileSync(unsupportedConfigPath, 'export default {};');

    let resolveWorkspaceCalls = 0;
    await expect(
      verifyRunnerCoverage({
        rootDir: tempRoot,
        configPath: unsupportedConfigPath,
        packagesDir,
        minExpectedProjects: 1,
        resolveWorkspace: async () => {
          resolveWorkspaceCalls += 1;
          return { projects: [] };
        },
      }),
    ).rejects.toThrow(
      'Unsupported runner config file "wiggum.config.mts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
    expect(resolveWorkspaceCalls).toBe(0);
  });

  test('verifyRunnerCoverage rejects unsupported explicit cts config path before resolver execution', async () => {
    const tempRoot = makeTempDir('verify-coverage-config-unsupported-explicit-cts-');
    const packagesDir = path.join(tempRoot, 'packages');
    const unsupportedConfigPath = path.join(tempRoot, 'wiggum.config.cts');
    fs.mkdirSync(packagesDir, { recursive: true });
    fs.writeFileSync(unsupportedConfigPath, 'export default {};');

    let resolveWorkspaceCalls = 0;
    await expect(
      verifyRunnerCoverage({
        rootDir: tempRoot,
        configPath: unsupportedConfigPath,
        packagesDir,
        minExpectedProjects: 1,
        resolveWorkspace: async () => {
          resolveWorkspaceCalls += 1;
          return { projects: [] };
        },
      }),
    ).rejects.toThrow(
      'Unsupported runner config file "wiggum.config.cts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
    expect(resolveWorkspaceCalls).toBe(0);
  });

  test('verifyRunnerCoverage passes expected options to workspace resolver', async () => {
    const tempRoot = makeTempDir('verify-coverage-resolve-');
    const configPath = path.join(tempRoot, 'wiggum.config.json');
    const packagesDir = path.join(tempRoot, 'packages');
    fs.mkdirSync(path.join(packagesDir, 'cli'), { recursive: true });
    fs.writeFileSync(configPath, '{"projects":["packages/*"]}');
    fs.writeFileSync(path.join(packagesDir, 'cli', 'package.json'), '{"name":"@wiggum/cli"}');

    const resolverCalls = [];
    const originalLog = console.log;
    const logMessages = [];
    let result;
    console.log = (...args) => {
      logMessages.push(args.join(' '));
    };
    try {
      result = await verifyRunnerCoverage({
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
    expect(result).toEqual({
      expectedCount: 1,
      resolvedCount: 1,
    });
    expect(resolverCalls[0]).toEqual({
      rootDir: tempRoot,
      configPath,
      includeDependenciesForFiltered: false,
      includeInferredImports: false,
    });
    expect(logMessages[0]).toContain('[verify-runner-coverage] Verified 1 projects covering 1 package roots.');
  });

  test('verifyRunnerCoverage auto-detects supported runner config when configPath is omitted', async () => {
    const tempRoot = makeTempDir('verify-coverage-detect-runner-config-');
    const configPath = path.join(tempRoot, 'wiggum.config.mjs');
    const packagesDir = path.join(tempRoot, 'packages');
    fs.mkdirSync(path.join(packagesDir, 'cli'), { recursive: true });
    fs.writeFileSync(configPath, 'export default { projects: ["packages/*"] };');
    fs.writeFileSync(path.join(packagesDir, 'cli', 'package.json'), '{"name":"@wiggum/cli"}');

    const resolverCalls = [];
    const originalLog = console.log;
    console.log = () => {};
    try {
      await expect(
        verifyRunnerCoverage({
          rootDir: tempRoot,
          packagesDir,
          minExpectedProjects: 1,
          resolveWorkspace: async (options) => {
            resolverCalls.push(options);
            return {
              projects: [{ root: path.join(packagesDir, 'cli') }],
            };
          },
        }),
      ).resolves.toEqual({
        expectedCount: 1,
        resolvedCount: 1,
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
  });

  test('verifyRunnerCoverage resolves relative root/config/packages paths', async () => {
    const tempRoot = makeTempDir('verify-coverage-relative-options-');
    const configPath = path.join(tempRoot, 'wiggum.config.json');
    const packagesDir = path.join(tempRoot, 'packages');
    fs.mkdirSync(path.join(packagesDir, 'cli'), { recursive: true });
    fs.writeFileSync(configPath, '{"projects":["packages/*"]}');
    fs.writeFileSync(path.join(packagesDir, 'cli', 'package.json'), '{"name":"@wiggum/cli"}');

    const relativeRootDir = path.relative(process.cwd(), tempRoot);
    const resolverCalls = [];
    const originalLog = console.log;
    console.log = () => {};
    try {
      await verifyRunnerCoverage({
        rootDir: relativeRootDir,
        configPath: 'wiggum.config.json',
        packagesDir: 'packages',
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
      configPath: path.join(tempRoot, 'wiggum.config.json'),
      includeDependenciesForFiltered: false,
      includeInferredImports: false,
    });
  });

  test('verifyRunnerCoverage ignores env default-path failures when explicit paths are provided', async () => {
    const explicitRoot = makeTempDir('verify-coverage-explicit-paths-');
    const explicitConfigPath = path.join(explicitRoot, 'wiggum.config.mjs');
    const explicitPackagesDir = path.join(explicitRoot, 'packages');
    fs.mkdirSync(path.join(explicitPackagesDir, 'cli'), { recursive: true });
    fs.writeFileSync(explicitConfigPath, 'export default { projects: ["packages/*"] };');
    fs.writeFileSync(path.join(explicitPackagesDir, 'cli', 'package.json'), '{"name":"@wiggum/cli"}');

    const envRootWithUnsupportedConfig = makeTempDir('verify-coverage-env-unsupported-');
    fs.writeFileSync(path.join(envRootWithUnsupportedConfig, 'wiggum.config.ts'), 'export default {};');

    const previousRoot = process.env.WIGGUM_RUNNER_VERIFY_ROOT;
    process.env.WIGGUM_RUNNER_VERIFY_ROOT = envRootWithUnsupportedConfig;
    const resolverCalls = [];
    const originalLog = console.log;
    console.log = () => {};
    try {
      await expect(
        verifyRunnerCoverage({
          rootDir: explicitRoot,
          configPath: explicitConfigPath,
          packagesDir: explicitPackagesDir,
          minExpectedProjects: 1,
          resolveWorkspace: async (options) => {
            resolverCalls.push(options);
            return {
              projects: [{ root: path.join(explicitPackagesDir, 'cli') }],
            };
          },
        }),
      ).resolves.toEqual({
        expectedCount: 1,
        resolvedCount: 1,
      });
    } finally {
      console.log = originalLog;
      if (previousRoot === undefined) {
        delete process.env.WIGGUM_RUNNER_VERIFY_ROOT;
      } else {
        process.env.WIGGUM_RUNNER_VERIFY_ROOT = previousRoot;
      }
    }

    expect(resolverCalls).toHaveLength(1);
    expect(resolverCalls[0]).toEqual({
      rootDir: explicitRoot,
      configPath: explicitConfigPath,
      includeDependenciesForFiltered: false,
      includeInferredImports: false,
    });
  });

  test('verifyRunnerCoverage uses env minimum when argument is omitted', async () => {
    const tempRoot = makeTempDir('verify-coverage-env-min-');
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
      ).resolves.toEqual({
        expectedCount: 1,
        resolvedCount: 1,
      });
    } finally {
      if (originalValue === undefined) {
        delete process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS;
      } else {
        process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS = originalValue;
      }
    }
  });

  test('verifyRunnerCoverage uses runtime env path overrides when path options are omitted', async () => {
    const tempRoot = makeTempDir('verify-coverage-env-paths-');
    const customConfigDir = path.join(tempRoot, 'configs');
    const customPackagesDir = path.join(tempRoot, 'custom-packages');
    const customConfigPath = path.join(customConfigDir, 'wiggum.custom.json');
    const customProjectRoot = path.join(customPackagesDir, 'cli');
    fs.mkdirSync(customConfigDir, { recursive: true });
    fs.mkdirSync(customProjectRoot, { recursive: true });
    fs.writeFileSync(customConfigPath, '{"root":"..","projects":["custom-packages/*"]}');
    fs.writeFileSync(path.join(customProjectRoot, 'package.json'), '{"name":"@wiggum/cli"}');

    const originalRoot = process.env.WIGGUM_RUNNER_VERIFY_ROOT;
    const originalConfigPath = process.env.WIGGUM_RUNNER_VERIFY_CONFIG_PATH;
    const originalPackagesDir = process.env.WIGGUM_RUNNER_VERIFY_PACKAGES_DIR;
    const originalMinimum = process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS;
    process.env.WIGGUM_RUNNER_VERIFY_ROOT = tempRoot;
    process.env.WIGGUM_RUNNER_VERIFY_CONFIG_PATH = 'configs/wiggum.custom.json';
    process.env.WIGGUM_RUNNER_VERIFY_PACKAGES_DIR = 'custom-packages';
    process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS = '1';
    let resolverOptions;
    try {
      await expect(
        verifyRunnerCoverage({
          resolveWorkspace: async (options) => {
            resolverOptions = options;
            return {
              projects: [{ root: customProjectRoot }],
            };
          },
        }),
      ).resolves.toEqual({
        expectedCount: 1,
        resolvedCount: 1,
      });

      expect(resolverOptions).toEqual({
        rootDir: tempRoot,
        configPath: customConfigPath,
        includeDependenciesForFiltered: false,
        includeInferredImports: false,
      });
    } finally {
      if (originalRoot === undefined) {
        delete process.env.WIGGUM_RUNNER_VERIFY_ROOT;
      } else {
        process.env.WIGGUM_RUNNER_VERIFY_ROOT = originalRoot;
      }
      if (originalConfigPath === undefined) {
        delete process.env.WIGGUM_RUNNER_VERIFY_CONFIG_PATH;
      } else {
        process.env.WIGGUM_RUNNER_VERIFY_CONFIG_PATH = originalConfigPath;
      }
      if (originalPackagesDir === undefined) {
        delete process.env.WIGGUM_RUNNER_VERIFY_PACKAGES_DIR;
      } else {
        process.env.WIGGUM_RUNNER_VERIFY_PACKAGES_DIR = originalPackagesDir;
      }
      if (originalMinimum === undefined) {
        delete process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS;
      } else {
        process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS = originalMinimum;
      }
    }
  });

  test('verifyRunnerCoverage rejects invalid env minimum when argument is omitted', async () => {
    const tempRoot = makeTempDir('verify-coverage-env-invalid-');
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

  test('verifyRunnerCoverage validates env minimum before resolving workspace', async () => {
    const tempRoot = makeTempDir('verify-coverage-env-order-');
    const configPath = path.join(tempRoot, 'wiggum.config.json');
    const packagesDir = path.join(tempRoot, 'packages');
    fs.mkdirSync(path.join(packagesDir, 'cli'), { recursive: true });
    fs.writeFileSync(configPath, '{"projects":["packages/*"]}');
    fs.writeFileSync(path.join(packagesDir, 'cli', 'package.json'), '{"name":"@wiggum/cli"}');

    const originalValue = process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS;
    process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS = 'abc';
    let resolveWorkspaceCalls = 0;
    try {
      await expect(
        verifyRunnerCoverage({
          rootDir: tempRoot,
          configPath,
          packagesDir,
          resolveWorkspace: async () => {
            resolveWorkspaceCalls += 1;
            return {
              projects: [{ root: path.join(packagesDir, 'cli') }],
            };
          },
        }),
      ).rejects.toThrow('MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS must be a positive integer');
      expect(resolveWorkspaceCalls).toBe(0);
    } finally {
      if (originalValue === undefined) {
        delete process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS;
      } else {
        process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS = originalValue;
      }
    }
  });

  test('verifyRunnerCoverage rejects malformed resolver payload without projects array', async () => {
    const tempRoot = makeTempDir('verify-coverage-bad-workspace-');
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
    const tempRoot = makeTempDir('verify-coverage-non-function-resolver-');
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

  test('verifyRunnerCoverage rejects invalid fileSystem option', async () => {
    const tempRoot = makeTempDir('verify-coverage-invalid-fs-');
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
        fileSystem: {},
        minExpectedProjects: 1,
        resolveWorkspace: async () => ({ projects: [{ root: path.join(packagesDir, 'cli') }] }),
      }),
    ).rejects.toThrow('fileSystem is missing required function(s): existsSync, statSync, readdirSync');
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
    const tempRoot = makeTempDir('verify-coverage-bad-project-root-');
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
      cwd: REPO_ROOT,
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
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS: '1',
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[verify-runner-coverage] Verified');
  });

  test('coverage verifier CLI fails when minimum exceeds discovered packages', () => {
    const result = spawnSync(process.execPath, [COVERAGE_SCRIPT_PATH], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS: '9999',
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[verify-runner-coverage]');
    expect(result.stderr).toContain('Expected at least 9999 package projects');
  });

  test('coverage verifier CLI reports prefixed error when config is missing', () => {
    const fixture = createCoverageVerifierFixture({
      createPackagesDir: true,
      packageNames: ['cli'],
    });

    const result = spawnSync(process.execPath, [COVERAGE_SCRIPT_PATH], {
      cwd: fixture.rootDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        WIGGUM_RUNNER_VERIFY_ROOT: fixture.rootDir,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[verify-runner-coverage]');
    expect(result.stderr).toContain(`Runner config not found at ${path.join(fixture.rootDir, 'wiggum.config.json')}`);
  });

  test('coverage verifier CLI reports prefixed error when packages directory is missing', () => {
    const fixture = createCoverageVerifierFixture({
      configContent: '{"projects":["packages/*"]}',
      createPackagesDir: false,
    });

    const result = spawnSync(process.execPath, [COVERAGE_SCRIPT_PATH], {
      cwd: fixture.rootDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        WIGGUM_RUNNER_VERIFY_ROOT: fixture.rootDir,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[verify-runner-coverage]');
    expect(result.stderr).toContain(`Packages directory not found at ${path.join(fixture.rootDir, 'packages')}`);
  });

  test('coverage verifier CLI reports overridden missing config path in error output', () => {
    const fixture = createCoverageVerifierFixture({
      configContent: '{"projects":["packages/*"]}',
      createPackagesDir: true,
      packageNames: ['cli'],
    });
    const missingConfigPath = path.join(fixture.rootDir, 'configs', 'missing.runner.json');

    const result = spawnSync(process.execPath, [COVERAGE_SCRIPT_PATH], {
      cwd: fixture.rootDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        WIGGUM_RUNNER_VERIFY_ROOT: fixture.rootDir,
        WIGGUM_RUNNER_VERIFY_CONFIG_PATH: missingConfigPath,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[verify-runner-coverage]');
    expect(result.stderr).toContain(`Runner config not found at ${missingConfigPath}`);
  });

  test('coverage verifier CLI reports unsupported overridden config path in error output', () => {
    const fixture = createCoverageVerifierFixture({
      configContent: '{"projects":["packages/*"]}',
      createPackagesDir: true,
      packageNames: ['cli'],
    });
    const unsupportedConfigPath = path.join(fixture.rootDir, 'configs', 'wiggum.config.ts');
    fs.mkdirSync(path.dirname(unsupportedConfigPath), { recursive: true });
    fs.writeFileSync(unsupportedConfigPath, 'export default {};');

    const result = spawnSync(process.execPath, [COVERAGE_SCRIPT_PATH], {
      cwd: fixture.rootDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        WIGGUM_RUNNER_VERIFY_ROOT: fixture.rootDir,
        WIGGUM_RUNNER_VERIFY_CONFIG_PATH: unsupportedConfigPath,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[verify-runner-coverage]');
    expect(result.stderr).toContain(
      'Unsupported runner config file "wiggum.config.ts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
  });

  test('coverage verifier CLI reports unsupported overridden mts config path in error output', () => {
    const fixture = createCoverageVerifierFixture({
      configContent: '{"projects":["packages/*"]}',
      createPackagesDir: true,
      packageNames: ['cli'],
    });
    const unsupportedConfigPath = path.join(fixture.rootDir, 'configs', 'wiggum.config.mts');
    fs.mkdirSync(path.dirname(unsupportedConfigPath), { recursive: true });
    fs.writeFileSync(unsupportedConfigPath, 'export default {};');

    const result = spawnSync(process.execPath, [COVERAGE_SCRIPT_PATH], {
      cwd: fixture.rootDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        WIGGUM_RUNNER_VERIFY_ROOT: fixture.rootDir,
        WIGGUM_RUNNER_VERIFY_CONFIG_PATH: unsupportedConfigPath,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[verify-runner-coverage]');
    expect(result.stderr).toContain(
      'Unsupported runner config file "wiggum.config.mts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
  });

  test('coverage verifier CLI reports unsupported overridden cts config path in error output', () => {
    const fixture = createCoverageVerifierFixture({
      configContent: '{"projects":["packages/*"]}',
      createPackagesDir: true,
      packageNames: ['cli'],
    });
    const unsupportedConfigPath = path.join(fixture.rootDir, 'configs', 'wiggum.config.cts');
    fs.mkdirSync(path.dirname(unsupportedConfigPath), { recursive: true });
    fs.writeFileSync(unsupportedConfigPath, 'export default {};');

    const result = spawnSync(process.execPath, [COVERAGE_SCRIPT_PATH], {
      cwd: fixture.rootDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        WIGGUM_RUNNER_VERIFY_ROOT: fixture.rootDir,
        WIGGUM_RUNNER_VERIFY_CONFIG_PATH: unsupportedConfigPath,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[verify-runner-coverage]');
    expect(result.stderr).toContain(
      'Unsupported runner config file "wiggum.config.cts". Use one of: wiggum.config.mjs, wiggum.config.js, wiggum.config.cjs, wiggum.config.json',
    );
  });

  test('coverage verifier CLI reports overridden missing packages path in error output', () => {
    const fixture = createCoverageVerifierFixture({
      configContent: '{"projects":["packages/*"]}',
      createPackagesDir: true,
      packageNames: ['cli'],
    });
    const missingPackagesPath = path.join(fixture.rootDir, 'custom-packages', 'missing');

    const result = spawnSync(process.execPath, [COVERAGE_SCRIPT_PATH], {
      cwd: fixture.rootDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        WIGGUM_RUNNER_VERIFY_ROOT: fixture.rootDir,
        WIGGUM_RUNNER_VERIFY_PACKAGES_DIR: missingPackagesPath,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[verify-runner-coverage]');
    expect(result.stderr).toContain(`Packages directory not found at ${missingPackagesPath}`);
  });

  test('coverage verifier CLI supports config and packages path overrides', () => {
    const fixture = createCoverageVerifierFixture({
      createPackagesDir: false,
    });
    const customPackagesDir = path.join(fixture.rootDir, 'custom-packages');
    const customConfigDir = path.join(fixture.rootDir, 'configs');
    fs.mkdirSync(path.join(customPackagesDir, 'cli'), { recursive: true });
    fs.mkdirSync(customConfigDir, { recursive: true });
    fs.writeFileSync(
      path.join(customConfigDir, 'wiggum.custom.json'),
      '{"root":"..","projects":["custom-packages/*"]}',
    );
    fs.writeFileSync(
      path.join(customPackagesDir, 'cli', 'package.json'),
      '{"name":"@fixture/cli"}',
    );

    const result = spawnSync(process.execPath, [COVERAGE_SCRIPT_PATH], {
      cwd: fixture.rootDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        WIGGUM_RUNNER_VERIFY_ROOT: fixture.rootDir,
        WIGGUM_RUNNER_VERIFY_CONFIG_PATH: 'configs/wiggum.custom.json',
        WIGGUM_RUNNER_VERIFY_PACKAGES_DIR: 'custom-packages',
        MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS: '1',
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[verify-runner-coverage] Verified 1 projects covering 1 package roots.');
  });

  test('coverage verifier CLI supports absolute config and packages overrides', () => {
    const fixture = createCoverageVerifierFixture({
      createPackagesDir: false,
    });
    const customPackagesDir = path.join(fixture.rootDir, 'custom-packages-abs');
    const customConfigDir = path.join(fixture.rootDir, 'configs-abs');
    fs.mkdirSync(path.join(customPackagesDir, 'cli'), { recursive: true });
    fs.mkdirSync(customConfigDir, { recursive: true });
    const customConfigPath = path.join(customConfigDir, 'wiggum.custom.abs.json');
    fs.writeFileSync(
      customConfigPath,
      '{"root":"..","projects":["custom-packages-abs/*"]}',
    );
    fs.writeFileSync(
      path.join(customPackagesDir, 'cli', 'package.json'),
      '{"name":"@fixture/cli-abs"}',
    );

    const result = spawnSync(process.execPath, [COVERAGE_SCRIPT_PATH], {
      cwd: fixture.rootDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        WIGGUM_RUNNER_VERIFY_ROOT: fixture.rootDir,
        WIGGUM_RUNNER_VERIFY_CONFIG_PATH: customConfigPath,
        WIGGUM_RUNNER_VERIFY_PACKAGES_DIR: customPackagesDir,
        MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS: '1',
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[verify-runner-coverage] Verified 1 projects covering 1 package roots.');
  });

  test('coverage verifier CLI ignores blank override environment paths', () => {
    const result = spawnSync(process.execPath, [COVERAGE_SCRIPT_PATH], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        WIGGUM_RUNNER_VERIFY_ROOT: '   ',
        WIGGUM_RUNNER_VERIFY_CONFIG_PATH: '',
        WIGGUM_RUNNER_VERIFY_PACKAGES_DIR: ' ',
        MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS: '1',
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[verify-runner-coverage] Verified');
  });
});
