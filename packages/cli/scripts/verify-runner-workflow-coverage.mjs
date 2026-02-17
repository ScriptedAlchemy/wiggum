#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ensureEnvObject,
  ensureNonEmptyRootPath,
  readEnvPathOverride,
} from './verifier-path-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT = path.resolve(__dirname, '../../..');

export function resolveWorkflowVerifierPathsFromEnv({
  env = process.env,
  fallbackRoot = DEFAULT_ROOT,
} = {}) {
  const normalizedEnv = ensureEnvObject(env);
  const rootOverride = readEnvPathOverride(normalizedEnv, 'WIGGUM_RUNNER_WORKFLOW_VERIFY_ROOT');
  const packageJsonPathOverride = readEnvPathOverride(normalizedEnv, 'WIGGUM_RUNNER_WORKFLOW_VERIFY_PACKAGE_JSON_PATH');
  const workflowPathOverride = readEnvPathOverride(normalizedEnv, 'WIGGUM_RUNNER_WORKFLOW_VERIFY_WORKFLOW_PATH');
  const normalizedFallbackRoot = ensureNonEmptyRootPath(fallbackRoot, 'fallbackRoot');

  const rootDir = rootOverride
    ? path.resolve(rootOverride)
    : path.resolve(normalizedFallbackRoot);
  const packageJsonPath = packageJsonPathOverride
    ? path.resolve(rootDir, packageJsonPathOverride)
    : path.join(rootDir, 'package.json');
  const workflowPath = workflowPathOverride
    ? path.resolve(rootDir, workflowPathOverride)
    : path.join(rootDir, '.github/workflows/ci.yml');

  return {
    rootDir,
    packageJsonPath,
    workflowPath,
  };
}

const PACKAGE_JSON_PATH = path.join(DEFAULT_ROOT, 'package.json');
const WORKFLOW_PATH = path.join(DEFAULT_ROOT, '.github/workflows/ci.yml');

export const REQUIRED_PACKAGE_SCRIPTS = [
  'ci:validate',
  'lint',
  'publint',
  'setup:demo:playwright',
  'test:demo:e2e',
  'test:demo:widget-api',
  'test:runner',
  'typecheck',
  'verify:runner:coverage',
  'verify:runner:workflow',
];
export const REQUIRED_PACKAGE_SCRIPT_PATTERNS = {
  'ci:validate': /^pnpm\s+build\s+&&\s+pnpm\s+test\s+&&\s+pnpm\s+run\s+lint\s+&&\s+pnpm\s+run\s+verify:runner:all\s+&&\s+pnpm\s+run\s+publint\s+&&\s+pnpm\s+run\s+test:demo:e2e\s+&&\s+pnpm\s+run\s+typecheck$/,
  'lint': /^pnpm\s+-r\s+--if-present\s+run\s+lint$/,
  'publint': /^pnpm\s+-r\s+publint$/,
  'setup:demo:playwright': /^pnpm\s+--filter\s+\.\/packages\/demo-app\s+exec\s+playwright\s+install\s+chromium$/,
  'test:demo:e2e': /^pnpm\s+--filter\s+\.\/packages\/demo-app\s+test:e2e$/,
  'test:demo:widget-api': /^pnpm\s+--filter\s+\.\/packages\/demo-app\s+test:e2e:widget-api$/,
  'test:runner': /^pnpm\s+-F\s+@wiggum\/cli\s+test$/,
  'typecheck': /^pnpm\s+-r\s+exec\s+tsc\s+--noEmit$/,
  'verify:runner:coverage': /^node\s+\.\/packages\/cli\/scripts\/verify-runner-coverage\.mjs$/,
  'verify:runner:workflow': /^node\s+\.\/packages\/cli\/scripts\/verify-runner-workflow-coverage\.mjs$/,
};
export const REQUIRED_WORKFLOW_STEPS = [
  {
    name: 'Build all packages',
    requiredJob: 'build-and-test',
    requiredRunCommand: 'pnpm build',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm build\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Run tests',
    requiredJob: 'build-and-test',
    requiredRunCommand: 'pnpm test',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm test\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Install Playwright Chromium (demo widget smoke)',
    requiredJob: 'build-and-test',
    requiredRunCommand: 'pnpm run setup:demo:playwright',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm run setup:demo:playwright\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Run widget API e2e smoke',
    requiredJob: 'build-and-test',
    requiredRunCommand: 'pnpm run test:demo:widget-api',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm run test:demo:widget-api\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Run full demo app e2e suite',
    requiredJob: 'build-and-test',
    requiredRunCommand: 'pnpm run test:demo:e2e',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm run test:demo:e2e\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Run runner-focused CLI tests',
    requiredJob: 'build-and-test',
    requiredRunCommand: 'pnpm run test:runner',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm run test:runner\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Verify runner project coverage',
    requiredJob: 'build-and-test',
    requiredRunCommand: 'pnpm run verify:runner:coverage',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm run verify:runner:coverage\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Verify runner workflow coverage',
    requiredJob: 'build-and-test',
    requiredRunCommand: 'pnpm run verify:runner:workflow',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm run verify:runner:workflow\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Build workspace (required for lint commands)',
    requiredJob: 'lint',
    requiredRunCommand: 'pnpm build',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm build\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Run linting',
    requiredJob: 'lint',
    requiredRunCommand: 'pnpm run lint',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm run lint\s*\|\|\s*true/,
      /run:\s*pnpm -r --if-present run lint/,
      /run:\s*pnpm -r run lint/,
    ],
  },
  {
    name: 'Run publint',
    requiredJob: 'lint',
    requiredRunCommand: 'pnpm run publint',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm run publint\s*\|\|\s*true/,
    ],
  },
  {
    name: 'Check types',
    requiredJob: 'build-and-test',
    requiredRunCommand: 'pnpm run typecheck',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm run typecheck\s*\|\|\s*true/,
    ],
  },
];

const REQUIRED_WORKFLOW_CONTENT_PATTERNS = [
  {
    description: 'build-and-test job must target ubuntu-latest',
    pattern: /build-and-test:\s*\n\s*runs-on:\s*ubuntu-latest/,
  },
  {
    description: 'lint job must target ubuntu-latest',
    pattern: /lint:\s*\n\s*runs-on:\s*ubuntu-latest/,
  },
  {
    description: 'push trigger branches must include main and develop',
    pattern: /push:\s*\n\s*branches:\s*\[\s*main\s*,\s*develop\s*\]/,
  },
  {
    description: 'pull_request trigger branches must include main and develop',
    pattern: /pull_request:\s*\n\s*branches:\s*\[\s*main\s*,\s*develop\s*\]/,
  },
  {
    description: 'build-and-test node matrix must run on 20.x',
    pattern: /matrix:\s*\n\s*node-version:\s*\[\s*20\.x\s*\]/,
  },
  {
    description: 'lint job node setup must run on 20.x',
    pattern: /lint:\s*\n[\s\S]*?- name:\s*Setup Node\.js[\s\S]*?node-version:\s*20\.x/,
  },
];

function readUtf8(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        throw new Error(`Path must be a file: ${filePath}`);
      }
    }
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

function getEnclosingJobName(lines, lineIndex) {
  for (let i = lineIndex; i >= 0; i--) {
    const line = lines[i];
    const match = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*$/);
    if (!match) {
      continue;
    }
    const [, key] = match;
    if (key === 'jobs') {
      return undefined;
    }
    return key;
  }
  return undefined;
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

    blocks.push({
      content: lines.slice(i, end).join('\n'),
      startLine: i + 1,
      jobName: getEnclosingJobName(lines, i),
    });
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

function normalizeCommandWhitespace(command) {
  return command.trim().replace(/\s+/g, ' ');
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

function verifyPackageScriptsContent(packageJsonContent, packageJsonPath = PACKAGE_JSON_PATH) {
  let pkg;
  try {
    pkg = JSON.parse(packageJsonContent);
  } catch (error) {
    throw new Error(`Failed to parse ${packageJsonPath}: ${error instanceof Error ? error.message : String(error)}`);
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
  const previousStepByJob = new Map();
  for (const requiredStep of REQUIRED_WORKFLOW_STEPS) {
    const stepBlocks = extractStepBlocks(workflow, requiredStep.name);
    if (stepBlocks.length === 0) {
      throw new Error(`Workflow ${workflowPath} is missing required step "${requiredStep.name}"`);
    }
    if (stepBlocks.length > 1) {
      throw new Error(`Workflow ${workflowPath} contains duplicate required step "${requiredStep.name}"`);
    }
    const [stepBlock] = stepBlocks;
    if (requiredStep.requiredJob && stepBlock.jobName !== requiredStep.requiredJob) {
      const detectedJob = stepBlock.jobName ?? 'unknown';
      throw new Error(
        `Step "${requiredStep.name}" must be defined in job "${requiredStep.requiredJob}" (found in "${detectedJob}")`,
      );
    }
    const stepJobName = stepBlock.jobName ?? '__unknown_job__';
    const previousStep = previousStepByJob.get(stepJobName);
    if (previousStep && stepBlock.startLine <= previousStep.startLine) {
      const jobLabel = stepBlock.jobName ?? 'unknown';
      throw new Error(
        `Step "${requiredStep.name}" must appear after "${previousStep.name}" in workflow order within job "${jobLabel}"`,
      );
    }
    previousStepByJob.set(stepJobName, {
      name: requiredStep.name,
      startLine: stepBlock.startLine,
    });
    const { runCommand, runCount } = extractRunCommand(stepBlock.content);
    if (runCount !== 1) {
      throw new Error(`Step "${requiredStep.name}" must declare exactly one run command`);
    }
    const normalizedRunCommand = typeof runCommand === 'string'
      ? normalizeCommandWhitespace(runCommand)
      : undefined;
    const normalizedRequiredCommand = normalizeCommandWhitespace(requiredStep.requiredRunCommand);
    if (normalizedRunCommand !== normalizedRequiredCommand) {
      throw new Error(
        `Step "${requiredStep.name}" must run "${requiredStep.requiredRunCommand}"`,
      );
    }

    for (const forbiddenPattern of requiredStep.forbiddenPatterns) {
      if (forbiddenPattern.test(stepBlock.content)) {
        throw new Error(
          `Step "${requiredStep.name}" contains forbidden pattern ${forbiddenPattern}`,
        );
      }
    }
  }

  for (const requiredPattern of REQUIRED_WORKFLOW_CONTENT_PATTERNS) {
    if (!requiredPattern.pattern.test(workflow)) {
      throw new Error(
        `Workflow ${workflowPath} missing required content: ${requiredPattern.description}`,
      );
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
  packageJsonPath = PACKAGE_JSON_PATH,
  workflowContent,
  workflowPath = WORKFLOW_PATH,
}) {
  const normalizedPackageJsonContent = ensureNonEmptyString(packageJsonContent, 'packageJsonContent');
  const normalizedPackageJsonPath = ensureNonEmptyString(packageJsonPath, 'packageJsonPath');
  const normalizedWorkflowContent = ensureNonEmptyString(workflowContent, 'workflowContent');
  const normalizedWorkflowPath = ensureNonEmptyString(workflowPath, 'workflowPath');
  const packageScriptResult = verifyPackageScriptsContent(
    normalizedPackageJsonContent,
    normalizedPackageJsonPath,
  );
  const workflowResult = verifyWorkflowContent(normalizedWorkflowContent, normalizedWorkflowPath);
  return {
    ...packageScriptResult,
    ...workflowResult,
  };
}

function main() {
  const { packageJsonPath, workflowPath } = resolveWorkflowVerifierPathsFromEnv();
  const packageJsonContent = readUtf8(packageJsonPath);
  const workflowContent = readUtf8(workflowPath);
  const result = verifyRunnerWorkflowCoverage({
    packageJsonContent,
    packageJsonPath,
    workflowContent,
    workflowPath,
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
