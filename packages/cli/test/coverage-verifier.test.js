import { describe, test, expect } from '@rstest/core';
import path from 'node:path';
import { verifyRunnerCoverageData } from '../scripts/verify-runner-coverage.mjs';

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
});
