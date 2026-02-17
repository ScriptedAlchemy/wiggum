import { describe, test, expect, afterEach } from '@rstest/core';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  REQUIRED_PACKAGE_SCRIPTS,
  REQUIRED_WORKFLOW_STEPS,
  resolveWorkflowVerifierPathsFromEnv,
  verifyRunnerWorkflowCoverage,
} from '../scripts/verify-runner-workflow-coverage.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, 'package.json');
const WORKFLOW_PATH = path.join(REPO_ROOT, '.github/workflows/ci.yml');
const WORKFLOW_VERIFIER_SCRIPT_PATH = path.resolve(__dirname, '../scripts/verify-runner-workflow-coverage.mjs');
const SCRIPT_FIXTURE_SOURCE_DIR = path.resolve(__dirname, '../scripts');
const tempFixtureRoots = new Set();

function readCurrentInputs() {
  return {
    packageJsonContent: fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'),
    workflowContent: fs.readFileSync(WORKFLOW_PATH, 'utf8'),
  };
}

function replaceOrThrow(content, searchValue, replacementValue) {
  if (!content.includes(searchValue)) {
    throw new Error(`Expected token not found: ${searchValue}`);
  }
  return content.replace(searchValue, replacementValue);
}

function createWorkflowVerifierFixture({
  packageJsonContent,
  workflowContent,
}) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-verifier-fixture-'));
  tempFixtureRoots.add(fixtureRoot);
  const workflowDir = path.join(fixtureRoot, '.github', 'workflows');
  const scriptDir = path.join(fixtureRoot, 'packages', 'cli', 'scripts');
  const cliDir = path.join(fixtureRoot, 'packages', 'cli');
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.mkdirSync(cliDir, { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, 'package.json'), packageJsonContent);
  fs.writeFileSync(path.join(workflowDir, 'ci.yml'), workflowContent);
  fs.cpSync(SCRIPT_FIXTURE_SOURCE_DIR, scriptDir, { recursive: true });
  return {
    rootDir: fixtureRoot,
    scriptPath: path.join(scriptDir, 'verify-runner-workflow-coverage.mjs'),
  };
}

function cleanupWorkflowVerifierFixture(fixture) {
  if (!fixture || typeof fixture.rootDir !== 'string') {
    return;
  }
  fs.rmSync(fixture.rootDir, { recursive: true, force: true });
  tempFixtureRoots.delete(fixture.rootDir);
}

afterEach(() => {
  for (const fixtureRoot of tempFixtureRoots) {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
  tempFixtureRoots.clear();
});

describe('runner workflow coverage verifier', () => {
  test('rejects non-string packageJsonContent input', () => {
    const { workflowContent } = readCurrentInputs();
    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: null,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('packageJsonContent must be a string');
  });

  test('rejects blank workflowContent input', () => {
    const { packageJsonContent } = readCurrentInputs();
    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: '   ',
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('workflowContent must be a non-empty string');
  });

  test('rejects blank workflowPath input', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent,
        workflowPath: '',
      }),
    ).toThrow('workflowPath must be a non-empty string');
  });

  test('rejects blank packageJsonPath input', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        packageJsonPath: '   ',
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('packageJsonPath must be a non-empty string');
  });

  test('reports custom packageJsonPath when parsing package content fails', () => {
    const { workflowContent } = readCurrentInputs();
    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: '{ invalid json',
        packageJsonPath: '/tmp/custom-package.json',
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Failed to parse /tmp/custom-package.json');
  });

  test('resolveWorkflowVerifierPathsFromEnv resolves relative overrides from root', () => {
    const result = resolveWorkflowVerifierPathsFromEnv({
      env: {
        WIGGUM_RUNNER_WORKFLOW_VERIFY_ROOT: '/repo',
        WIGGUM_RUNNER_WORKFLOW_VERIFY_PACKAGE_JSON_PATH: 'configs/package.custom.json',
        WIGGUM_RUNNER_WORKFLOW_VERIFY_WORKFLOW_PATH: 'configs/ci.custom.yml',
      },
    });

    expect(result).toEqual({
      rootDir: path.resolve('/repo'),
      packageJsonPath: path.resolve('/repo', 'configs/package.custom.json'),
      workflowPath: path.resolve('/repo', 'configs/ci.custom.yml'),
    });
  });

  test('resolveWorkflowVerifierPathsFromEnv accepts absolute package and workflow overrides', () => {
    const result = resolveWorkflowVerifierPathsFromEnv({
      env: {
        WIGGUM_RUNNER_WORKFLOW_VERIFY_ROOT: '/repo',
        WIGGUM_RUNNER_WORKFLOW_VERIFY_PACKAGE_JSON_PATH: '/opt/configs/package.custom.json',
        WIGGUM_RUNNER_WORKFLOW_VERIFY_WORKFLOW_PATH: '/opt/configs/ci.custom.yml',
      },
    });

    expect(result).toEqual({
      rootDir: path.resolve('/repo'),
      packageJsonPath: path.resolve('/opt/configs/package.custom.json'),
      workflowPath: path.resolve('/opt/configs/ci.custom.yml'),
    });
  });

  test('resolveWorkflowVerifierPathsFromEnv ignores blank overrides and uses fallback root', () => {
    const result = resolveWorkflowVerifierPathsFromEnv({
      env: {
        WIGGUM_RUNNER_WORKFLOW_VERIFY_ROOT: ' ',
        WIGGUM_RUNNER_WORKFLOW_VERIFY_PACKAGE_JSON_PATH: '',
        WIGGUM_RUNNER_WORKFLOW_VERIFY_WORKFLOW_PATH: '   ',
      },
      fallbackRoot: '/repo/fallback',
    });

    expect(result).toEqual({
      rootDir: path.resolve('/repo/fallback'),
      packageJsonPath: path.resolve('/repo/fallback', 'package.json'),
      workflowPath: path.resolve('/repo/fallback', '.github/workflows/ci.yml'),
    });
  });

  test('resolveWorkflowVerifierPathsFromEnv rejects non-string fallbackRoot', () => {
    expect(() =>
      resolveWorkflowVerifierPathsFromEnv({
        env: {},
        fallbackRoot: null,
      }),
    ).toThrow('fallbackRoot must be a string path');
  });

  test('resolveWorkflowVerifierPathsFromEnv rejects non-object env values', () => {
    expect(() =>
      resolveWorkflowVerifierPathsFromEnv({
        env: null,
      }),
    ).toThrow('env must be an object');
  });

  test('resolveWorkflowVerifierPathsFromEnv rejects array env values', () => {
    expect(() =>
      resolveWorkflowVerifierPathsFromEnv({
        env: [],
      }),
    ).toThrow('env must be an object');
  });

  test('resolveWorkflowVerifierPathsFromEnv rejects primitive string env values', () => {
    expect(() =>
      resolveWorkflowVerifierPathsFromEnv({
        env: 'invalid-env',
      }),
    ).toThrow('env must be an object');
  });

  test('resolveWorkflowVerifierPathsFromEnv rejects non-string override values', () => {
    expect(() =>
      resolveWorkflowVerifierPathsFromEnv({
        env: {
          WIGGUM_RUNNER_WORKFLOW_VERIFY_ROOT: 42,
        },
      }),
    ).toThrow('WIGGUM_RUNNER_WORKFLOW_VERIFY_ROOT must be a string when provided');
  });

  test('resolveWorkflowVerifierPathsFromEnv rejects non-string workflow-path override values', () => {
    expect(() =>
      resolveWorkflowVerifierPathsFromEnv({
        env: {
          WIGGUM_RUNNER_WORKFLOW_VERIFY_WORKFLOW_PATH: 42,
        },
      }),
    ).toThrow('WIGGUM_RUNNER_WORKFLOW_VERIFY_WORKFLOW_PATH must be a string when provided');
  });

  test('resolveWorkflowVerifierPathsFromEnv rejects non-string package-path override values', () => {
    expect(() =>
      resolveWorkflowVerifierPathsFromEnv({
        env: {
          WIGGUM_RUNNER_WORKFLOW_VERIFY_PACKAGE_JSON_PATH: 42,
        },
      }),
    ).toThrow('WIGGUM_RUNNER_WORKFLOW_VERIFY_PACKAGE_JSON_PATH must be a string when provided');
  });

  test('resolveWorkflowVerifierPathsFromEnv rejects blank fallbackRoot', () => {
    expect(() =>
      resolveWorkflowVerifierPathsFromEnv({
        env: {},
        fallbackRoot: '   ',
      }),
    ).toThrow('fallbackRoot must be a non-empty string path');
  });

  test('accepts the current repository workflow and scripts', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).not.toThrow();
  });

  test('returns summary counts for current repository workflow and scripts', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const result = verifyRunnerWorkflowCoverage({
      packageJsonContent,
      workflowContent,
      workflowPath: WORKFLOW_PATH,
    });

    expect(result).toEqual({
      requiredScriptCount: REQUIRED_PACKAGE_SCRIPTS.length,
      requiredStepCount: REQUIRED_WORKFLOW_STEPS.length,
    });
  });

  test('fails when a required workflow step is renamed away', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '- name: Run tests',
      '- name: Run smoke tests',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('is missing required step "Run tests"');
  });

  test('fails when push workflow branches drop develop', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      'branches: [ main, develop ]',
      'branches: [ main ]',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('missing required content: push trigger branches must include main and develop');
  });

  test('fails when lint job no longer targets ubuntu-latest', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '  lint:\n    runs-on: ubuntu-latest',
      '  lint:\n    runs-on: ubuntu-22.04',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('missing required content: lint job must target ubuntu-latest');
  });

  test('fails when build-and-test checkout action drifts from v4', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '      - name: Checkout repository\n        uses: actions/checkout@v4',
      '      - name: Checkout repository\n        uses: actions/checkout@v3',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('missing required content: build-and-test checkout step must use actions/checkout@v4');
  });

  test('fails when lint setup-pnpm action drifts from v2', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '  lint:\n    runs-on: ubuntu-latest\n    \n    steps:\n      - name: Checkout repository\n        uses: actions/checkout@v4\n        \n      - name: Setup pnpm\n        uses: pnpm/action-setup@v2',
      '  lint:\n    runs-on: ubuntu-latest\n    \n    steps:\n      - name: Checkout repository\n        uses: actions/checkout@v4\n        \n      - name: Setup pnpm\n        uses: pnpm/action-setup@v1',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('missing required content: lint setup-pnpm step must use pnpm/action-setup@v2');
  });

  test('fails when build-and-test job no longer targets ubuntu-latest', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '  build-and-test:\n    runs-on: ubuntu-latest',
      '  build-and-test:\n    runs-on: ubuntu-22.04',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('missing required content: build-and-test job must target ubuntu-latest');
  });

  test('fails when build-and-test node matrix drifts from 20.x', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      'node-version: [20.x]',
      'node-version: [22.x]',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('missing required content: build-and-test node matrix must run on 20.x');
  });

  test('fails when build-and-test setup-node cache drifts from pnpm', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '      - name: Setup Node.js ${{ matrix.node-version }}\n        uses: actions/setup-node@v4\n        with:\n          node-version: ${{ matrix.node-version }}\n          cache: \'pnpm\'',
      '      - name: Setup Node.js ${{ matrix.node-version }}\n        uses: actions/setup-node@v4\n        with:\n          node-version: ${{ matrix.node-version }}\n          cache: \'npm\'',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('missing required content: build-and-test setup-node must enable pnpm cache');
  });

  test('fails when pull_request workflow branches drop develop', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      'pull_request:\n    branches: [ main, develop ]',
      'pull_request:\n    branches: [ main ]',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('missing required content: pull_request trigger branches must include main and develop');
  });

  test('fails when lint job node setup drifts from 20.x', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '      - name: Setup Node.js\n        uses: actions/setup-node@v4\n        with:\n          node-version: 20.x',
      '      - name: Setup Node.js\n        uses: actions/setup-node@v4\n        with:\n          node-version: 22.x',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('missing required content: lint job node setup must run on 20.x');
  });

  test('fails when lint setup-node cache drifts from pnpm', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '      - name: Setup Node.js\n        uses: actions/setup-node@v4\n        with:\n          node-version: 20.x\n          cache: \'pnpm\'',
      '      - name: Setup Node.js\n        uses: actions/setup-node@v4\n        with:\n          node-version: 20.x\n          cache: \'npm\'',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('missing required content: lint setup-node must enable pnpm cache');
  });

  test('fails when widget API smoke workflow step is renamed away', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '- name: Run widget API e2e smoke',
      '- name: Run widget browser smoke',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('is missing required step "Run widget API e2e smoke"');
  });

  test('fails when full demo e2e workflow step is renamed away', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '- name: Run full demo app e2e suite',
      '- name: Run full demo browser tests',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('is missing required step "Run full demo app e2e suite"');
  });

  test('fails when required workflow step order is inverted', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '      - name: Run widget API e2e smoke\n        run: pnpm run test:demo:widget-api\n\n      - name: Run full demo app e2e suite\n        run: pnpm run test:demo:e2e',
      '      - name: Run full demo app e2e suite\n        run: pnpm run test:demo:e2e\n\n      - name: Run widget API e2e smoke\n        run: pnpm run test:demo:widget-api',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Step "Run full demo app e2e suite" must appear after "Run widget API e2e smoke" in workflow order within job "build-and-test"');
  });

  test('fails when lint job required step order is inverted', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '      - name: Run linting\n        run: pnpm run lint\n\n      - name: Run publint\n        run: pnpm run publint',
      '      - name: Run publint\n        run: pnpm run publint\n\n      - name: Run linting\n        run: pnpm run lint',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Step "Run publint" must appear after "Run linting" in workflow order within job "lint"');
  });

  test('fails when required workflow step is moved into the wrong job', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      replaceOrThrow(
        workflowContent,
        '      - name: Check types\n        run: pnpm run typecheck',
        '      - name: Run publint\n        run: pnpm run publint',
      ),
      '      - name: Run linting\n        run: pnpm run lint\n\n      - name: Run publint\n        run: pnpm run publint',
      '      - name: Run linting\n        run: pnpm run lint\n\n      - name: Check types\n        run: pnpm run typecheck',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('is missing required step "Run publint" in job "lint"');
  });

  test('fails when build-and-test install dependencies command is rewired', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '      - name: Install dependencies\n        run: pnpm install --frozen-lockfile\n        \n      - name: Build all packages',
      '      - name: Install dependencies\n        run: pnpm install\n        \n      - name: Build all packages',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Step "Install dependencies" must run "pnpm install --frozen-lockfile"');
  });

  test('fails when lint install dependencies step is renamed away', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '      - name: Install dependencies\n        run: pnpm install --frozen-lockfile\n      \n      - name: Build workspace (required for lint commands)',
      '      - name: Install workspace dependencies\n        run: pnpm install --frozen-lockfile\n      \n      - name: Build workspace (required for lint commands)',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('is missing required step "Install dependencies" in job "lint"');
  });

  test('fails when publint workflow step is renamed away', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '- name: Run publint',
      '- name: Run package lint',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('is missing required step "Run publint"');
  });

  test('fails when full demo e2e workflow step command is rewired', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      'run: pnpm run test:demo:e2e',
      'run: pnpm run test:demo:e2e -- --grep widget-api',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Step "Run full demo app e2e suite" must run "pnpm run test:demo:e2e"');
  });

  test('fails when full demo e2e workflow step uses no-fail fallback', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      'run: pnpm run test:demo:e2e',
      'run: pnpm run test:demo:e2e || true',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Step "Run full demo app e2e suite" must run "pnpm run test:demo:e2e"');
  });

  test('fails when publint workflow step command is rewired', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      'run: pnpm run publint',
      'run: pnpm -r publint',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Step "Run publint" must run "pnpm run publint"');
  });

  test('fails when publint workflow step uses no-fail fallback', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      'run: pnpm run publint',
      'run: pnpm run publint || true',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Step "Run publint" must run "pnpm run publint"');
  });

  test('fails when Playwright Chromium install step command is rewired', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      'run: pnpm run setup:demo:playwright',
      'run: pnpm --filter ./packages/demo-app exec playwright install',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow(
      'Step "Install Playwright Chromium (demo widget smoke)" must run "pnpm run setup:demo:playwright"',
    );
  });

  test('fails when a required workflow step is duplicated', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '      - name: Run tests\n        run: pnpm test\n\n      - name: Install Playwright Chromium (demo widget smoke)',
      '      - name: Run tests\n        run: pnpm test\n\n      - name: Run tests\n        run: pnpm test\n\n      - name: Install Playwright Chromium (demo widget smoke)',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('contains duplicate required step "Run tests" in job "build-and-test"');
  });

  test('fails when a required package script command is rewired', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    parsedPackage.scripts['test:runner'] = 'pnpm -r test';
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: mutatedPackageJson,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Package script "test:runner" does not match expected command pattern');
  });

  test('fails when widget API smoke package script is missing', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    delete parsedPackage.scripts['test:demo:widget-api'];
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: mutatedPackageJson,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Missing required package scripts: test:demo:widget-api');
  });

  test('fails when Playwright setup package script is missing', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    delete parsedPackage.scripts['setup:demo:playwright'];
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: mutatedPackageJson,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Missing required package scripts: setup:demo:playwright');
  });

  test('fails when full demo e2e package script is missing', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    delete parsedPackage.scripts['test:demo:e2e'];
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: mutatedPackageJson,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Missing required package scripts: test:demo:e2e');
  });

  test('fails when publint package script is missing', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    delete parsedPackage.scripts.publint;
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: mutatedPackageJson,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Missing required package scripts: publint');
  });

  test('fails when lint package script is missing', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    delete parsedPackage.scripts.lint;
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: mutatedPackageJson,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Missing required package scripts: lint');
  });

  test('fails when ci:validate package script is missing', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    delete parsedPackage.scripts['ci:validate'];
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: mutatedPackageJson,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Missing required package scripts: ci:validate');
  });

  test('fails when full demo e2e package script command is rewired', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    parsedPackage.scripts['test:demo:e2e'] = 'pnpm --filter ./packages/demo-app test:e2e -- --grep widget-api';
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: mutatedPackageJson,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Package script "test:demo:e2e" does not match expected command pattern');
  });

  test('fails when publint package script command is rewired', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    parsedPackage.scripts.publint = 'pnpm -r lint';
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: mutatedPackageJson,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Package script "publint" does not match expected command pattern');
  });

  test('fails when lint package script command is rewired', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    parsedPackage.scripts.lint = 'pnpm -r run lint';
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: mutatedPackageJson,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Package script "lint" does not match expected command pattern');
  });

  test('fails when ci:validate package script command is rewired', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    parsedPackage.scripts['ci:validate'] = 'pnpm test && pnpm run verify:runner:all';
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: mutatedPackageJson,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Package script "ci:validate" does not match expected command pattern');
  });

  test('fails when ci:validate package script omits lint stage', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    parsedPackage.scripts['ci:validate'] = 'pnpm build && pnpm test && pnpm run verify:runner:all && pnpm run publint && pnpm run test:demo:e2e && pnpm run typecheck';
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: mutatedPackageJson,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Package script "ci:validate" does not match expected command pattern');
  });

  test('fails when typecheck package script is missing', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    delete parsedPackage.scripts.typecheck;
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: mutatedPackageJson,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Missing required package scripts: typecheck');
  });

  test('fails when typecheck package script command is rewired', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    parsedPackage.scripts.typecheck = 'tsc --noEmit';
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: mutatedPackageJson,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Package script "typecheck" does not match expected command pattern');
  });

  test('fails when Playwright setup package script command is rewired', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    parsedPackage.scripts['setup:demo:playwright'] = 'pnpm --filter ./packages/demo-app exec playwright install';
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: mutatedPackageJson,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Package script "setup:demo:playwright" does not match expected command pattern');
  });

  test('fails when required package script adds trailing command arguments', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    parsedPackage.scripts['test:runner'] = 'pnpm -F @wiggum/cli test -- --watch';
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: mutatedPackageJson,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Package script "test:runner" does not match expected command pattern');
  });

  test('fails when package scripts container is not an object', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    parsedPackage.scripts = [];
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: mutatedPackageJson,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('package.json "scripts" field must be an object');
  });

  test('fails when required package script command is blank', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    parsedPackage.scripts['test:runner'] = '   ';
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: mutatedPackageJson,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Package script "test:runner" must be a non-empty string command');
  });

  test('fails when required package script command is not a string', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    parsedPackage.scripts['test:runner'] = 42;
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent: mutatedPackageJson,
        workflowContent,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Package script "test:runner" must be a non-empty string command');
  });

  test('fails when runner test step uses no-fail shell fallback', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      'run: pnpm run test:runner',
      'run: pnpm run test:runner || true',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Step "Run runner-focused CLI tests"');
  });

  test('fails when lint step bypasses the root lint script command', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      'run: pnpm run lint',
      'run: pnpm -r run lint',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Step "Run linting"');
  });

  test('fails when check types step is marked continue-on-error', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '      - name: Check types\n        run: pnpm run typecheck',
      '      - name: Check types\n        run: pnpm run typecheck\n        continue-on-error: true',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('contains forbidden pattern');
  });

  test('fails when check types step command is rewired', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      'run: pnpm run typecheck',
      'run: pnpm -r exec tsc --noEmit',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Step "Check types" must run "pnpm run typecheck"');
  });

  test('fails when a required workflow command is replaced with suffixed variant', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      'run: pnpm test',
      'run: pnpm test:runner',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Step "Run tests" must run "pnpm test"');
  });

  test('fails when a required workflow step uses multiline run syntax', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      'run: pnpm test',
      'run: |\n          pnpm test',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Step "Run tests" must run "pnpm test"');
  });

  test('fails when a required workflow step declares multiple run commands', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '      - name: Run tests\n        run: pnpm test',
      '      - name: Run tests\n        run: pnpm test\n        run: pnpm test',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('Step "Run tests" must declare exactly one run command');
  });

  test('accepts required step names when quoted in workflow yaml', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '- name: Run tests',
      '- name: "Run tests"',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).not.toThrow();
  });

  test('fails when required job identities are swapped', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const swappedJobsWorkflow = replaceOrThrow(
      replaceOrThrow(
        replaceOrThrow(
          workflowContent,
          '  build-and-test:',
          '  __temp_build_and_test_job__:',
        ),
        '  lint:',
        '  build-and-test:',
      ),
      '  __temp_build_and_test_job__:',
      '  lint:',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: swappedJobsWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('is missing required step "Build all packages" in job "build-and-test"');
  });

  test('accepts required step names with inline comments', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '- name: Run tests',
      '- name: Run tests # core gate',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).not.toThrow();
  });

  test('accepts quoted run command values for required steps', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      'run: pnpm test',
      'run: "pnpm test"',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).not.toThrow();
  });

  test('accepts run commands with inline comments for required steps', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      'run: pnpm test',
      'run: pnpm test # required gate',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).not.toThrow();
  });

  test('accepts run commands with expanded internal whitespace for required steps', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      'run: pnpm test',
      'run:   pnpm    test   ',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).not.toThrow();
  });

  test('workflow verifier CLI entrypoint succeeds on current repository state', () => {
    const result = spawnSync(process.execPath, [WORKFLOW_VERIFIER_SCRIPT_PATH], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: process.env,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[verify-runner-workflow-coverage] Verified runner checks in package scripts and CI workflow');
    expect(result.stdout).toContain(
      `(${REQUIRED_PACKAGE_SCRIPTS.length} scripts, ${REQUIRED_WORKFLOW_STEPS.length} steps).`,
    );
  });

  test('workflow verifier CLI entrypoint reports prefixed error on invalid workflow', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      '- name: Run tests',
      '- name: Run smoke tests',
    );
    const fixture = createWorkflowVerifierFixture({
      packageJsonContent,
      workflowContent: mutatedWorkflow,
    });
    try {
      const result = spawnSync(process.execPath, [fixture.scriptPath], {
        cwd: fixture.rootDir,
        encoding: 'utf8',
        env: process.env,
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('[verify-runner-workflow-coverage]');
      expect(result.stderr).toContain('is missing required step "Run tests"');
    } finally {
      cleanupWorkflowVerifierFixture(fixture);
    }
  });

  test('workflow verifier CLI entrypoint reports prefixed error on rewired package script', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const parsedPackage = JSON.parse(packageJsonContent);
    parsedPackage.scripts['test:runner'] = 'pnpm -r test';
    const mutatedPackageJson = JSON.stringify(parsedPackage, null, 2);
    const fixture = createWorkflowVerifierFixture({
      packageJsonContent: mutatedPackageJson,
      workflowContent,
    });
    try {
      const result = spawnSync(process.execPath, [fixture.scriptPath], {
        cwd: fixture.rootDir,
        encoding: 'utf8',
        env: process.env,
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('[verify-runner-workflow-coverage]');
      expect(result.stderr).toContain('Package script "test:runner" does not match expected command pattern');
    } finally {
      cleanupWorkflowVerifierFixture(fixture);
    }
  });

  test('workflow verifier CLI entrypoint reports prefixed error on invalid package json', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const fixture = createWorkflowVerifierFixture({
      packageJsonContent,
      workflowContent,
    });
    fs.writeFileSync(path.join(fixture.rootDir, 'package.json'), '{ invalid json');
    try {
      const result = spawnSync(process.execPath, [fixture.scriptPath], {
        cwd: fixture.rootDir,
        encoding: 'utf8',
        env: process.env,
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('[verify-runner-workflow-coverage]');
      expect(result.stderr).toContain('Failed to parse');
      expect(result.stderr).toContain(path.join(fixture.rootDir, 'package.json'));
    } finally {
      cleanupWorkflowVerifierFixture(fixture);
    }
  });

  test('workflow verifier CLI entrypoint reports prefixed error on missing workflow file', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const fixture = createWorkflowVerifierFixture({
      packageJsonContent,
      workflowContent,
    });
    fs.rmSync(path.join(fixture.rootDir, '.github', 'workflows', 'ci.yml'), { force: true });
    try {
      const result = spawnSync(process.execPath, [fixture.scriptPath], {
        cwd: fixture.rootDir,
        encoding: 'utf8',
        env: process.env,
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('[verify-runner-workflow-coverage]');
      expect(result.stderr).toContain('Failed to read');
    } finally {
      cleanupWorkflowVerifierFixture(fixture);
    }
  });

  test('workflow verifier CLI entrypoint reports prefixed error on missing package json file', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const fixture = createWorkflowVerifierFixture({
      packageJsonContent,
      workflowContent,
    });
    fs.rmSync(path.join(fixture.rootDir, 'package.json'), { force: true });
    try {
      const result = spawnSync(process.execPath, [fixture.scriptPath], {
        cwd: fixture.rootDir,
        encoding: 'utf8',
        env: process.env,
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('[verify-runner-workflow-coverage]');
      expect(result.stderr).toContain('Failed to read');
      expect(result.stderr).toContain(path.join(fixture.rootDir, 'package.json'));
    } finally {
      cleanupWorkflowVerifierFixture(fixture);
    }
  });

  test('workflow verifier CLI entrypoint reports overridden missing workflow path', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const fixture = createWorkflowVerifierFixture({
      packageJsonContent,
      workflowContent,
    });
    const missingWorkflowPath = path.join(fixture.rootDir, 'custom-workflows', 'missing.ci.yml');

    try {
      const result = spawnSync(process.execPath, [WORKFLOW_VERIFIER_SCRIPT_PATH], {
        cwd: fixture.rootDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          WIGGUM_RUNNER_WORKFLOW_VERIFY_ROOT: fixture.rootDir,
          WIGGUM_RUNNER_WORKFLOW_VERIFY_WORKFLOW_PATH: missingWorkflowPath,
        },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('[verify-runner-workflow-coverage]');
      expect(result.stderr).toContain(`Failed to read ${missingWorkflowPath}`);
    } finally {
      cleanupWorkflowVerifierFixture(fixture);
    }
  });

  test('workflow verifier CLI entrypoint reports overridden workflow directory path', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const fixture = createWorkflowVerifierFixture({
      packageJsonContent,
      workflowContent,
    });
    const workflowDirectoryPath = path.join(fixture.rootDir, 'custom-workflows', 'directory-ci.yml');
    fs.mkdirSync(workflowDirectoryPath, { recursive: true });

    try {
      const result = spawnSync(process.execPath, [WORKFLOW_VERIFIER_SCRIPT_PATH], {
        cwd: fixture.rootDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          WIGGUM_RUNNER_WORKFLOW_VERIFY_ROOT: fixture.rootDir,
          WIGGUM_RUNNER_WORKFLOW_VERIFY_WORKFLOW_PATH: workflowDirectoryPath,
        },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('[verify-runner-workflow-coverage]');
      expect(result.stderr).toContain(`Path must be a file: ${workflowDirectoryPath}`);
    } finally {
      cleanupWorkflowVerifierFixture(fixture);
    }
  });

  test('workflow verifier CLI entrypoint reports overridden missing package path', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const fixture = createWorkflowVerifierFixture({
      packageJsonContent,
      workflowContent,
    });
    const missingPackagePath = path.join(fixture.rootDir, 'custom-packages', 'missing.package.json');

    try {
      const result = spawnSync(process.execPath, [WORKFLOW_VERIFIER_SCRIPT_PATH], {
        cwd: fixture.rootDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          WIGGUM_RUNNER_WORKFLOW_VERIFY_ROOT: fixture.rootDir,
          WIGGUM_RUNNER_WORKFLOW_VERIFY_PACKAGE_JSON_PATH: missingPackagePath,
        },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('[verify-runner-workflow-coverage]');
      expect(result.stderr).toContain(`Failed to read ${missingPackagePath}`);
    } finally {
      cleanupWorkflowVerifierFixture(fixture);
    }
  });

  test('workflow verifier CLI entrypoint reports overridden package directory path', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const fixture = createWorkflowVerifierFixture({
      packageJsonContent,
      workflowContent,
    });
    const packageDirectoryPath = path.join(fixture.rootDir, 'custom-packages', 'directory-package.json');
    fs.mkdirSync(packageDirectoryPath, { recursive: true });

    try {
      const result = spawnSync(process.execPath, [WORKFLOW_VERIFIER_SCRIPT_PATH], {
        cwd: fixture.rootDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          WIGGUM_RUNNER_WORKFLOW_VERIFY_ROOT: fixture.rootDir,
          WIGGUM_RUNNER_WORKFLOW_VERIFY_PACKAGE_JSON_PATH: packageDirectoryPath,
        },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('[verify-runner-workflow-coverage]');
      expect(result.stderr).toContain(`Path must be a file: ${packageDirectoryPath}`);
    } finally {
      cleanupWorkflowVerifierFixture(fixture);
    }
  });

  test('workflow verifier CLI entrypoint supports env path overrides', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const invalidDefaultWorkflow = replaceOrThrow(
      workflowContent,
      '- name: Run tests',
      '- name: Run smoke tests',
    );
    const fixture = createWorkflowVerifierFixture({
      packageJsonContent,
      workflowContent: invalidDefaultWorkflow,
    });
    const customDir = path.join(fixture.rootDir, 'custom-verifier-inputs');
    fs.mkdirSync(customDir, { recursive: true });
    const customPackagePath = path.join(customDir, 'package.custom.json');
    const customWorkflowPath = path.join(customDir, 'ci.custom.yml');
    fs.writeFileSync(customPackagePath, packageJsonContent);
    fs.writeFileSync(customWorkflowPath, workflowContent);

    try {
      const result = spawnSync(process.execPath, [WORKFLOW_VERIFIER_SCRIPT_PATH], {
        cwd: fixture.rootDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          WIGGUM_RUNNER_WORKFLOW_VERIFY_ROOT: fixture.rootDir,
          WIGGUM_RUNNER_WORKFLOW_VERIFY_PACKAGE_JSON_PATH: 'custom-verifier-inputs/package.custom.json',
          WIGGUM_RUNNER_WORKFLOW_VERIFY_WORKFLOW_PATH: 'custom-verifier-inputs/ci.custom.yml',
        },
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[verify-runner-workflow-coverage] Verified runner checks in package scripts and CI workflow');
    } finally {
      cleanupWorkflowVerifierFixture(fixture);
    }
  });

  test('workflow verifier CLI entrypoint supports absolute env path overrides', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const fixture = createWorkflowVerifierFixture({
      packageJsonContent,
      workflowContent,
    });
    const customDir = path.join(fixture.rootDir, 'custom-verifier-inputs-abs');
    fs.mkdirSync(customDir, { recursive: true });
    const customPackagePath = path.join(customDir, 'package.custom.abs.json');
    const customWorkflowPath = path.join(customDir, 'ci.custom.abs.yml');
    fs.writeFileSync(customPackagePath, packageJsonContent);
    fs.writeFileSync(customWorkflowPath, workflowContent);

    try {
      const result = spawnSync(process.execPath, [WORKFLOW_VERIFIER_SCRIPT_PATH], {
        cwd: fixture.rootDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          WIGGUM_RUNNER_WORKFLOW_VERIFY_ROOT: fixture.rootDir,
          WIGGUM_RUNNER_WORKFLOW_VERIFY_PACKAGE_JSON_PATH: customPackagePath,
          WIGGUM_RUNNER_WORKFLOW_VERIFY_WORKFLOW_PATH: customWorkflowPath,
        },
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[verify-runner-workflow-coverage] Verified runner checks in package scripts and CI workflow');
    } finally {
      cleanupWorkflowVerifierFixture(fixture);
    }
  });

  test('workflow verifier CLI entrypoint ignores blank env path overrides', () => {
    const result = spawnSync(process.execPath, [WORKFLOW_VERIFIER_SCRIPT_PATH], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        WIGGUM_RUNNER_WORKFLOW_VERIFY_ROOT: ' ',
        WIGGUM_RUNNER_WORKFLOW_VERIFY_PACKAGE_JSON_PATH: '',
        WIGGUM_RUNNER_WORKFLOW_VERIFY_WORKFLOW_PATH: '   ',
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('[verify-runner-workflow-coverage] Verified runner checks in package scripts and CI workflow');
  });
});
