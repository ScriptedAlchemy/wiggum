#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../..');
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json');
const WORKFLOW_PATH = path.join(ROOT, '.github/workflows/ci.yml');

const REQUIRED_PACKAGE_SCRIPTS = ['test:runner', 'verify:runner:coverage', 'verify:runner:workflow'];
const REQUIRED_PACKAGE_SCRIPT_PATTERNS = {
  'test:runner': /^pnpm\s+-F\s+@wiggum\/cli\s+test$/,
  'verify:runner:coverage': /^node\s+\.\/packages\/cli\/scripts\/verify-runner-coverage\.mjs$/,
  'verify:runner:workflow': /^node\s+\.\/packages\/cli\/scripts\/verify-runner-workflow-coverage\.mjs$/,
};
const REQUIRED_WORKFLOW_STEPS = [
  {
    name: 'Build all packages',
    requiredRunCommand: 'pnpm build',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm build\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Run tests',
    requiredRunCommand: 'pnpm test',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm test\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Run runner-focused CLI tests',
    requiredRunCommand: 'pnpm run test:runner',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm run test:runner\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Verify runner project coverage',
    requiredRunCommand: 'pnpm run verify:runner:coverage',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm run verify:runner:coverage\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Verify runner workflow coverage',
    requiredRunCommand: 'pnpm run verify:runner:workflow',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm run verify:runner:workflow\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Build workspace (required for lint commands)',
    requiredRunCommand: 'pnpm build',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm build\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Run linting',
    requiredRunCommand: 'pnpm -r --if-present run lint',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm -r --if-present run lint\s*\|\|\s*true/,
      /run:\s*pnpm -r run lint/,
    ],
  },
  {
    name: 'Check types',
    requiredRunCommand: 'pnpm -r exec tsc --noEmit',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm -r exec tsc --noEmit\s*\|\|\s*true/,
    ],
  },
];

function readUtf8(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
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
  const rawName = trimmed.slice('- name:'.length).trim();
  const quotedNameMatch = rawName.match(/^(['"])(.*?)\1(?:\s+#.*)?$/);
  if (quotedNameMatch) {
    const quotedName = quotedNameMatch[2].trim();
    return quotedName.length > 0 ? quotedName : undefined;
  }

  const unquotedName = rawName.replace(/\s+#.*$/, '').trim();
  return unquotedName.length > 0 ? unquotedName : undefined;
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

function normalizeInlineScalar(value) {
  const trimmedValue = value.trim();
  const quotedMatch = trimmedValue.match(/^(['"])(.*?)\1(?:\s+#.*)?$/);
  if (quotedMatch) {
    return quotedMatch[2].trim();
  }
  return trimmedValue.replace(/\s+#.*$/, '').trim();
}

function extractRunCommand(stepBlock) {
  const lines = stepBlock.split(/\r?\n/);
  let runCount = 0;
  let runCommand;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('run:')) {
      continue;
    }
    runCount += 1;
    const value = trimmed.slice('run:'.length).trim();
    if (value.length === 0 || value.startsWith('|') || value.startsWith('>')) {
      continue;
    }
    const normalizedValue = normalizeInlineScalar(value);
    if (normalizedValue.length > 0 && runCommand === undefined) {
      runCommand = normalizedValue;
    }
  }
  return {
    runCommand,
    runCount,
  };
}

function verifyPackageScriptsContent(packageJsonContent) {
  let pkg;
  try {
    pkg = JSON.parse(packageJsonContent);
  } catch (error) {
    throw new Error(`Failed to parse ${PACKAGE_JSON_PATH}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const scriptsContainer = pkg.scripts ?? {};
  if (
    typeof scriptsContainer !== 'object'
    || scriptsContainer === null
    || Array.isArray(scriptsContainer)
  ) {
    throw new Error('package.json "scripts" field must be an object');
  }
  const scripts = scriptsContainer;
  const missing = REQUIRED_PACKAGE_SCRIPTS.filter((scriptName) => !(scriptName in scripts));
  if (missing.length > 0) {
    throw new Error(`Missing required package scripts: ${missing.join(', ')}`);
  }
  for (const scriptName of REQUIRED_PACKAGE_SCRIPTS) {
    const rawScriptValue = scripts[scriptName];
    if (typeof rawScriptValue !== 'string' || rawScriptValue.trim().length === 0) {
      throw new Error(`Package script "${scriptName}" must be a non-empty string command`);
    }
    const scriptValue = rawScriptValue.trim();
    const expectedPattern = REQUIRED_PACKAGE_SCRIPT_PATTERNS[scriptName];
    if (!expectedPattern.test(scriptValue)) {
      throw new Error(
        `Package script "${scriptName}" does not match expected command pattern ${expectedPattern}. Found: ${scriptValue}`,
      );
    }
  }

  return {
    requiredScriptCount: REQUIRED_PACKAGE_SCRIPTS.length,
  };
}

function verifyWorkflowContent(workflow, workflowPath = WORKFLOW_PATH) {
  for (const requiredStep of REQUIRED_WORKFLOW_STEPS) {
    const stepBlocks = extractStepBlocks(workflow, requiredStep.name);
    if (stepBlocks.length === 0) {
      throw new Error(`Workflow ${workflowPath} is missing required step "${requiredStep.name}"`);
    }
    if (stepBlocks.length > 1) {
      throw new Error(`Workflow ${workflowPath} contains duplicate required step "${requiredStep.name}"`);
    }
    const [stepBlock] = stepBlocks;
    const { runCommand, runCount } = extractRunCommand(stepBlock);
    if (runCount !== 1) {
      throw new Error(`Step "${requiredStep.name}" must declare exactly one run command`);
    }
    if (runCommand !== requiredStep.requiredRunCommand) {
      throw new Error(
        `Step "${requiredStep.name}" must run "${requiredStep.requiredRunCommand}"`,
      );
    }

    for (const forbiddenPattern of requiredStep.forbiddenPatterns) {
      if (forbiddenPattern.test(stepBlock)) {
        throw new Error(
          `Step "${requiredStep.name}" contains forbidden pattern ${forbiddenPattern}`,
        );
      }
    }
  }

  return {
    requiredStepCount: REQUIRED_WORKFLOW_STEPS.length,
  };
}

function ensureNonEmptyString(value, fieldName) {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value;
}

export function verifyRunnerWorkflowCoverage({
  packageJsonContent,
  workflowContent,
  workflowPath = WORKFLOW_PATH,
}) {
  const normalizedPackageJsonContent = ensureNonEmptyString(packageJsonContent, 'packageJsonContent');
  const normalizedWorkflowContent = ensureNonEmptyString(workflowContent, 'workflowContent');
  const normalizedWorkflowPath = ensureNonEmptyString(workflowPath, 'workflowPath');
  const packageScriptResult = verifyPackageScriptsContent(normalizedPackageJsonContent);
  const workflowResult = verifyWorkflowContent(normalizedWorkflowContent, normalizedWorkflowPath);
  return {
    ...packageScriptResult,
    ...workflowResult,
  };
}

function main() {
  const packageJsonContent = readUtf8(PACKAGE_JSON_PATH);
  const workflowContent = readUtf8(WORKFLOW_PATH);
  const result = verifyRunnerWorkflowCoverage({
    packageJsonContent,
    workflowContent,
    workflowPath: WORKFLOW_PATH,
  });
  console.log(
    `[verify-runner-workflow-coverage] Verified runner checks in package scripts and CI workflow (${result.requiredScriptCount} scripts, ${result.requiredStepCount} steps).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(
      `[verify-runner-workflow-coverage] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}
