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
const REQUIRED_WORKFLOW_RUNS = [
  /pnpm run test:runner/,
  /pnpm run verify:runner:coverage/,
  /pnpm run verify:runner:workflow/,
  /name:\s*Check types[\s\S]*?run:\s*pnpm -r exec tsc --noEmit/,
];
const FORBIDDEN_WORKFLOW_PATTERNS = [
  /name:\s*Check types[\s\S]*?continue-on-error:\s*true/,
  /name:\s*Check types[\s\S]*?run:\s*pnpm -r exec tsc --noEmit\s*\|\|\s*true/,
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

function verifyPackageScripts() {
  const content = readUtf8(PACKAGE_JSON_PATH);
  const pkg = JSON.parse(content);
  const scripts = pkg.scripts || {};
  const missing = REQUIRED_PACKAGE_SCRIPTS.filter((scriptName) => !(scriptName in scripts));
  if (missing.length > 0) {
    fail(`Missing required package scripts: ${missing.join(', ')}`);
  }
}

function verifyWorkflow() {
  const workflow = readUtf8(WORKFLOW_PATH);
  for (const expectedPattern of REQUIRED_WORKFLOW_RUNS) {
    if (!expectedPattern.test(workflow)) {
      fail(`Workflow ${WORKFLOW_PATH} is missing run command matching ${expectedPattern}`);
    }
  }
  for (const forbiddenPattern of FORBIDDEN_WORKFLOW_PATTERNS) {
    if (forbiddenPattern.test(workflow)) {
      fail(`Workflow ${WORKFLOW_PATH} contains forbidden pattern ${forbiddenPattern}`);
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
