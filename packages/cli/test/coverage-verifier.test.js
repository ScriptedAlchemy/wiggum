import { describe, test, expect } from '@rstest/core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  listExpectedProjectRoots,
  verifyRunnerCoverage,
  verifyRunnerCoverageData,
} from '../scripts/verify-runner-coverage.mjs';

describe('runner coverage verifier', () => {
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

  test('rejects invalid minimum expected project count', () => {
    expect(() =>
      verifyRunnerCoverageData({
        expectedProjectRoots: ['/repo/packages/cli'],
        resolvedProjectRoots: ['/repo/packages/cli'],
        minExpectedProjects: 0,
        rootDir: '/repo',
      }),
    ).toThrow('MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS must be >= 1');
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
});
