import { describe, test, expect } from '@rstest/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { verifyRunnerWorkflowCoverage } from '../scripts/verify-runner-workflow-coverage.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, 'package.json');
const WORKFLOW_PATH = path.join(REPO_ROOT, '.github/workflows/ci.yml');

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

  test('fails when a required workflow step is duplicated', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const duplicateStep = '\n      - name: Run tests\n        run: pnpm test\n';
    const mutatedWorkflow = `${workflowContent}${duplicateStep}`;

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('contains duplicate required step "Run tests"');
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

  test('fails when lint step drops --if-present safety flag', () => {
    const { packageJsonContent, workflowContent } = readCurrentInputs();
    const mutatedWorkflow = replaceOrThrow(
      workflowContent,
      'run: pnpm -r --if-present run lint',
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
      '      - name: Check types\n        run: pnpm -r exec tsc --noEmit',
      '      - name: Check types\n        run: pnpm -r exec tsc --noEmit\n        continue-on-error: true',
    );

    expect(() =>
      verifyRunnerWorkflowCoverage({
        packageJsonContent,
        workflowContent: mutatedWorkflow,
        workflowPath: WORKFLOW_PATH,
      }),
    ).toThrow('contains forbidden pattern');
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
    ).toThrow('Step "Run tests" is missing expected run command pattern');
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
});
