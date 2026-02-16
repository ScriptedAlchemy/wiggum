#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../..');
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json');
const WORKFLOW_PATH = path.join(ROOT, '.github/workflows/ci.yml');

const REQUIRED_PACKAGE_SCRIPTS = ['test:runner', 'verify:runner:coverage', 'verify:runner:workflow'];
const REQUIRED_PACKAGE_SCRIPT_PATTERNS = {
  'test:runner': /pnpm\s+-F\s+@wiggum\/cli\s+test/,
  'verify:runner:coverage': /node\s+\.\/packages\/cli\/scripts\/verify-runner-coverage\.mjs/,
  'verify:runner:workflow': /node\s+\.\/packages\/cli\/scripts\/verify-runner-workflow-coverage\.mjs/,
};
const REQUIRED_WORKFLOW_STEPS = [
  {
    name: 'Build all packages',
    requiredRunPattern: /run:\s*pnpm build/,
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm build\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Run tests',
    requiredRunPattern: /run:\s*pnpm test/,
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm test\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Run runner-focused CLI tests',
    requiredRunPattern: /run:\s*pnpm run test:runner/,
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm run test:runner\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Verify runner project coverage',
    requiredRunPattern: /run:\s*pnpm run verify:runner:coverage/,
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm run verify:runner:coverage\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Verify runner workflow coverage',
    requiredRunPattern: /run:\s*pnpm run verify:runner:workflow/,
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm run verify:runner:workflow\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Build workspace (required for lint commands)',
    requiredRunPattern: /run:\s*pnpm build/,
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm build\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Run linting',
    requiredRunPattern: /run:\s*pnpm -r --if-present run lint/,
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm -r --if-present run lint\s*\|\|\s*true/,
      /run:\s*pnpm -r run lint/,
    ],
  },
  {
    name: 'Check types',
    requiredRunPattern: /run:\s*pnpm -r exec tsc --noEmit/,
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm -r exec tsc --noEmit\s*\|\|\s*true/,
    ],
  },
];

function fail(message) {
  console.error(`[verify-runner-workflow-coverage] ${message}`);
  process.exit(1);
}

function readUtf8(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(`Failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function getIndentWidth(line) {
  const trimmedLength = line.trimStart().length;
  return line.length - trimmedLength;
}

function extractStepName(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('- name:')) {
    return undefined;
  }
  return trimmed.slice('- name:'.length).trim();
}

function extractStepBlocks(workflow, stepName) {
  const lines = workflow.split(/\r?\n/);
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const parsedStepName = extractStepName(lines[i]);
    if (parsedStepName !== stepName) {
      continue;
    }

    const stepIndent = getIndentWidth(lines[i]);
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        continue;
      }

      const lineIndent = getIndentWidth(line);
      if (extractStepName(line) && lineIndent === stepIndent) {
        end = j;
        break;
      }
      if (lineIndent < stepIndent) {
        end = j;
        break;
      }
    }

    blocks.push(lines.slice(i, end).join('\n'));
  }
  return blocks;
}

function verifyPackageScripts() {
  const content = readUtf8(PACKAGE_JSON_PATH);
  const pkg = JSON.parse(content);
  const scripts = pkg.scripts || {};
  const missing = REQUIRED_PACKAGE_SCRIPTS.filter((scriptName) => !(scriptName in scripts));
  if (missing.length > 0) {
    fail(`Missing required package scripts: ${missing.join(', ')}`);
  }
  for (const scriptName of REQUIRED_PACKAGE_SCRIPTS) {
    const scriptValue = String(scripts[scriptName] ?? '');
    const expectedPattern = REQUIRED_PACKAGE_SCRIPT_PATTERNS[scriptName];
    if (!expectedPattern.test(scriptValue)) {
      fail(
        `Package script "${scriptName}" does not match expected command pattern ${expectedPattern}. Found: ${scriptValue}`,
      );
    }
  }
}

function verifyWorkflow() {
  const workflow = readUtf8(WORKFLOW_PATH);
  for (const requiredStep of REQUIRED_WORKFLOW_STEPS) {
    const stepBlocks = extractStepBlocks(workflow, requiredStep.name);
    if (stepBlocks.length === 0) {
      fail(`Workflow ${WORKFLOW_PATH} is missing required step "${requiredStep.name}"`);
    }
    if (stepBlocks.length > 1) {
      fail(`Workflow ${WORKFLOW_PATH} contains duplicate required step "${requiredStep.name}"`);
    }
    const [stepBlock] = stepBlocks;

    if (!requiredStep.requiredRunPattern.test(stepBlock)) {
      fail(
        `Step "${requiredStep.name}" is missing expected run command pattern ${requiredStep.requiredRunPattern}`,
      );
    }

    for (const forbiddenPattern of requiredStep.forbiddenPatterns) {
      if (forbiddenPattern.test(stepBlock)) {
        fail(
          `Step "${requiredStep.name}" contains forbidden pattern ${forbiddenPattern}`,
        );
      }
    }
  }
}

function main() {
  verifyPackageScripts();
  verifyWorkflow();
  console.log(
    '[verify-runner-workflow-coverage] Verified runner checks in package scripts and CI workflow.',
  );
}

main();
