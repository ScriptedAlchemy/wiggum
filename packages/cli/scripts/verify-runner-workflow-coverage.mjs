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

export function validateRequiredPackageScriptContracts(
  requiredScripts = REQUIRED_PACKAGE_SCRIPTS,
  requiredScriptPatterns = REQUIRED_PACKAGE_SCRIPT_PATTERNS,
) {
  if (!Array.isArray(requiredScripts)) {
    throw new Error('Required package scripts must be an array');
  }
  if (
    !requiredScriptPatterns
    || typeof requiredScriptPatterns !== 'object'
    || Array.isArray(requiredScriptPatterns)
  ) {
    throw new Error('Required package script patterns must be an object');
  }
  if (requiredScripts.length === 0) {
    throw new Error('Required package scripts must include at least one script');
  }

  const seenScripts = new Set();
  for (let index = 0; index < requiredScripts.length; index += 1) {
    const scriptName = requiredScripts[index];
    if (typeof scriptName !== 'string' || scriptName.trim().length === 0) {
      throw new Error(`Required package script at index ${index} must be a non-empty string`);
    }
    if (seenScripts.has(scriptName)) {
      throw new Error(`Duplicate required package script "${scriptName}"`);
    }
    seenScripts.add(scriptName);

    const expectedPattern = requiredScriptPatterns[scriptName];
    if (!(expectedPattern instanceof RegExp)) {
      throw new Error(
        `Required package script "${scriptName}" must have a regex command pattern`,
      );
    }
  }

  const extraPatternScripts = Object.keys(requiredScriptPatterns)
    .filter((scriptName) => !seenScripts.has(scriptName))
    .sort((a, b) => a.localeCompare(b));
  if (extraPatternScripts.length > 0) {
    throw new Error(
      `Required package script patterns contain unexpected script key(s): ${extraPatternScripts.join(', ')}`,
    );
  }
}
export const REQUIRED_WORKFLOW_STEPS = [
  {
    name: 'Install dependencies',
    requiredJob: 'build-and-test',
    requiredRunCommand: 'pnpm install --frozen-lockfile',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm install --frozen-lockfile\s*\|\|\s*true/,
    ],
  },
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
    name: 'Install dependencies',
    requiredJob: 'lint',
    requiredRunCommand: 'pnpm install --frozen-lockfile',
    forbiddenPatterns: [
      /continue-on-error:\s*true/,
      /run:\s*pnpm install --frozen-lockfile\s*\|\|\s*true/,
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

export function validateRequiredWorkflowStepContracts(
  requiredSteps = REQUIRED_WORKFLOW_STEPS,
) {
  if (!Array.isArray(requiredSteps)) {
    throw new Error('Required workflow steps must be an array');
  }

  const seenStepKeys = new Set();
  for (let index = 0; index < requiredSteps.length; index += 1) {
    const step = requiredSteps[index];
    if (!step || typeof step !== 'object') {
      throw new Error(`Required workflow step at index ${index} must be an object`);
    }
    if (typeof step.name !== 'string' || step.name.trim().length === 0) {
      throw new Error(`Required workflow step at index ${index} must include a non-empty name`);
    }
    if (
      step.requiredJob !== undefined
      && (typeof step.requiredJob !== 'string' || step.requiredJob.trim().length === 0)
    ) {
      throw new Error(`Required workflow step "${step.name}" has invalid requiredJob value`);
    }
    if (typeof step.requiredRunCommand !== 'string' || step.requiredRunCommand.trim().length === 0) {
      throw new Error(
        `Required workflow step "${step.name}" must include a non-empty requiredRunCommand`,
      );
    }
    if (!Array.isArray(step.forbiddenPatterns)) {
      throw new Error(`Required workflow step "${step.name}" must include forbiddenPatterns array`);
    }
    if (step.forbiddenPatterns.length === 0) {
      throw new Error(`Required workflow step "${step.name}" must include at least one forbidden pattern`);
    }
    for (const forbiddenPattern of step.forbiddenPatterns) {
      if (!(forbiddenPattern instanceof RegExp)) {
        throw new Error(
          `Required workflow step "${step.name}" has non-regex forbidden pattern`,
        );
      }
    }

    const stepKey = `${step.requiredJob ?? '__any_job__'}::${step.name}`;
    if (seenStepKeys.has(stepKey)) {
      const stepScope = step.requiredJob ? ` in job "${step.requiredJob}"` : '';
      throw new Error(`Duplicate required workflow step contract "${step.name}"${stepScope}`);
    }
    seenStepKeys.add(stepKey);
  }
}

export const REQUIRED_WORKFLOW_CONTENT_PATTERNS = [
  {
    description: 'build-and-test job must target ubuntu-latest',
    requiredJob: 'build-and-test',
    pattern: /^\s*runs-on:\s*ubuntu-latest\b/m,
  },
  {
    description: 'build-and-test job must not enable continue-on-error',
    requiredJob: 'build-and-test',
    verify: (jobContent) => !jobHasContinueOnErrorEnabled(jobContent),
  },
  {
    description: 'build-and-test checkout step must use actions/checkout@v4',
    requiredJob: 'build-and-test',
    pattern: /- name:\s*Checkout repository\s*\n\s*uses:\s*actions\/checkout@v4/,
  },
  {
    description: 'build-and-test setup-pnpm step must use pnpm/action-setup@v2',
    requiredJob: 'build-and-test',
    pattern: /- name:\s*Setup pnpm\s*\n\s*uses:\s*pnpm\/action-setup@v2/,
  },
  {
    description: 'build-and-test setup-node action must use actions/setup-node@v4',
    requiredJob: 'build-and-test',
    pattern: /- name:\s*Setup Node\.js \$\{\{ matrix\.node-version \}\}\s*\n\s*uses:\s*actions\/setup-node@v4/,
  },
  {
    description: 'build-and-test setup steps must remain in deterministic order',
    requiredJob: 'build-and-test',
    verify: (jobContent) =>
      jobHasStepOrder(jobContent, [
        'Checkout repository',
        'Setup pnpm',
        'Setup Node.js ${{ matrix.node-version }}',
        'Install dependencies',
      ]),
  },
  {
    description: 'build-and-test setup steps must appear exactly once',
    requiredJob: 'build-and-test',
    verify: (jobContent) =>
      jobHasUniqueNamedSteps(jobContent, [
        'Checkout repository',
        'Setup pnpm',
        'Setup Node.js ${{ matrix.node-version }}',
        'Install dependencies',
      ]),
  },
  {
    description: 'lint job must target ubuntu-latest',
    requiredJob: 'lint',
    pattern: /^\s*runs-on:\s*ubuntu-latest\b/m,
  },
  {
    description: 'lint job must not enable continue-on-error',
    requiredJob: 'lint',
    verify: (jobContent) => !jobHasContinueOnErrorEnabled(jobContent),
  },
  {
    description: 'lint checkout step must use actions/checkout@v4',
    requiredJob: 'lint',
    pattern: /- name:\s*Checkout repository\s*\n\s*uses:\s*actions\/checkout@v4/,
  },
  {
    description: 'lint setup-pnpm step must use pnpm/action-setup@v2',
    requiredJob: 'lint',
    pattern: /- name:\s*Setup pnpm\s*\n\s*uses:\s*pnpm\/action-setup@v2/,
  },
  {
    description: 'lint setup-node action must use actions/setup-node@v4',
    requiredJob: 'lint',
    pattern: /- name:\s*Setup Node\.js\s*\n\s*uses:\s*actions\/setup-node@v4/,
  },
  {
    description: 'lint setup steps must remain in deterministic order',
    requiredJob: 'lint',
    verify: (jobContent) =>
      jobHasStepOrder(jobContent, [
        'Checkout repository',
        'Setup pnpm',
        'Setup Node.js',
        'Install dependencies',
      ]),
  },
  {
    description: 'lint setup steps must appear exactly once',
    requiredJob: 'lint',
    verify: (jobContent) =>
      jobHasUniqueNamedSteps(jobContent, [
        'Checkout repository',
        'Setup pnpm',
        'Setup Node.js',
        'Install dependencies',
      ]),
  },
  {
    description: 'push trigger branches must include main and develop',
    verify: (workflow) =>
      workflowHasRequiredTriggerBranches(workflow, 'push', ['main', 'develop']),
  },
  {
    description: 'pull_request trigger branches must include main and develop',
    verify: (workflow) =>
      workflowHasRequiredTriggerBranches(workflow, 'pull_request', ['main', 'develop']),
  },
  {
    description: 'build-and-test node matrix must run on 20.x',
    requiredJob: 'build-and-test',
    pattern: /matrix:\s*\n\s*node-version:\s*\[\s*20\.x\s*\]/,
  },
  {
    description: 'build-and-test setup-node must enable pnpm cache',
    requiredJob: 'build-and-test',
    pattern: /- name:\s*Setup Node\.js \$\{\{ matrix\.node-version \}\}\s*\n\s*uses:\s*actions\/setup-node@v4\s*\n\s*with:\s*\n\s*node-version:\s*\$\{\{ matrix\.node-version \}\}\s*\n\s*cache:\s*['"]pnpm['"]/,
  },
  {
    description: 'lint job node setup must run on 20.x',
    requiredJob: 'lint',
    pattern: /- name:\s*Setup Node\.js[\s\S]*?node-version:\s*20\.x/,
  },
  {
    description: 'lint setup-node must enable pnpm cache',
    requiredJob: 'lint',
    pattern: /- name:\s*Setup Node\.js\s*\n\s*uses:\s*actions\/setup-node@v4\s*\n\s*with:\s*\n\s*node-version:\s*20\.x\s*\n\s*cache:\s*['"]pnpm['"]/,
  },
];

export function validateRequiredWorkflowContentContracts(
  contracts = REQUIRED_WORKFLOW_CONTENT_PATTERNS,
) {
  if (!Array.isArray(contracts)) {
    throw new Error('Workflow content contracts must be an array');
  }

  const seenDescriptions = new Set();
  for (let index = 0; index < contracts.length; index += 1) {
    const contract = contracts[index];
    if (!contract || typeof contract !== 'object') {
      throw new Error(`Workflow content contract at index ${index} must be an object`);
    }
    if (typeof contract.description !== 'string' || contract.description.trim().length === 0) {
      throw new Error(`Workflow content contract at index ${index} must include a non-empty description`);
    }
    if (seenDescriptions.has(contract.description)) {
      throw new Error(`Duplicate workflow content contract description "${contract.description}"`);
    }
    seenDescriptions.add(contract.description);
    if (
      contract.requiredJob !== undefined
      && (typeof contract.requiredJob !== 'string' || contract.requiredJob.trim().length === 0)
    ) {
      throw new Error(
        `Workflow content contract "${contract.description}" has invalid requiredJob value`,
      );
    }

    const hasPatternMatcher = contract.pattern instanceof RegExp;
    const hasFunctionMatcher = typeof contract.verify === 'function';
    if (hasPatternMatcher === hasFunctionMatcher) {
      throw new Error(
        `Workflow content contract "${contract.description}" must define exactly one matcher: pattern or verify`,
      );
    }
  }
}

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
    const entry = parseYamlMappingEntry(lines[i]);
    if (!entry) {
      continue;
    }
    if (entry.indent === 0 && entry.key === 'jobs') {
      return undefined;
    }
    if (entry.indent === 2) {
      return entry.key;
    }
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

function extractJobBlock(workflow, jobName) {
  const lines = workflow.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => {
    const entry = parseYamlMappingEntry(line);
    return Boolean(entry && entry.indent === 2 && entry.key === jobName);
  });
  if (startIndex === -1) {
    return undefined;
  }

  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i++) {
    const entry = parseYamlMappingEntry(lines[i]);
    if (entry && entry.indent === 2) {
      endIndex = i;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join('\n');
}

function extractStepNamesFromBlock(blockContent) {
  return blockContent
    .split(/\r?\n/)
    .map((line) => extractStepName(line))
    .filter((name) => typeof name === 'string');
}

function jobHasStepOrder(jobContent, expectedOrder) {
  const stepNames = extractStepNamesFromBlock(jobContent);
  let previousIndex = -1;
  for (const stepName of expectedOrder) {
    const currentIndex = stepNames.indexOf(stepName);
    if (currentIndex === -1 || currentIndex <= previousIndex) {
      return false;
    }
    previousIndex = currentIndex;
  }
  return true;
}

function jobHasUniqueNamedSteps(jobContent, requiredStepNames) {
  const stepNames = extractStepNamesFromBlock(jobContent);
  return requiredStepNames.every(
    (requiredStepName) => stepNames.filter((stepName) => stepName === requiredStepName).length === 1,
  );
}

function isYamlTruthy(value) {
  return /^(true|yes|on)$/i.test(value);
}

function jobHasContinueOnErrorEnabled(jobContent) {
  const lines = jobContent.split(/\r?\n/);
  const jobHeader = parseYamlMappingEntry(lines[0]);
  const jobFieldIndent = jobHeader ? jobHeader.indent + 2 : 4;
  for (const line of lines) {
    const entry = parseYamlMappingEntry(line);
    if (!entry || entry.key !== 'continue-on-error' || entry.indent !== jobFieldIndent) {
      continue;
    }
    if (isYamlTruthy(normalizeYamlScalar(entry.value))) {
      return true;
    }
  }
  return false;
}

function normalizeInlineScalar(value) {
  const trimmedValue = value.trim();
  const quotedMatch = trimmedValue.match(/^(['"])(.*?)\1(?:\s+#.*)?$/);
  if (quotedMatch) {
    return quotedMatch[2].trim();
  }
  return trimmedValue.replace(/\s+#.*$/, '').trim();
}

function normalizeYamlScalar(value) {
  const normalizedValue = value.trim().replace(/\s+#.*$/, '').trim();
  const quotedMatch = normalizedValue.match(/^(['"])(.*?)\1$/);
  if (quotedMatch) {
    return quotedMatch[2].trim();
  }
  return normalizedValue;
}

function parseYamlMappingEntry(line) {
  const match = line.match(/^(\s*)(?:(['"])(.*?)\2|([A-Za-z0-9_-]+)):\s*(.*)$/);
  if (!match) {
    return undefined;
  }
  const [, indentRaw, , quotedKey, bareKey, value] = match;
  const key = (quotedKey ?? bareKey ?? '').trim();
  if (key.length === 0) {
    return undefined;
  }
  return {
    indent: indentRaw.length,
    key,
    value,
  };
}

function parseInlineYamlList(value) {
  const normalizedValue = value.trim().replace(/\s+#.*$/, '').trim();
  if (!normalizedValue.startsWith('[') || !normalizedValue.endsWith(']')) {
    return [];
  }
  const innerValue = normalizedValue.slice(1, -1).trim();
  if (innerValue.length === 0) {
    return [];
  }
  return innerValue
    .split(',')
    .map((token) => normalizeYamlScalar(token))
    .filter((token) => token.length > 0);
}

function extractTriggerBranches(workflow, eventName) {
  const lines = workflow.split(/\r?\n/);
  const onIndex = lines.findIndex((line) => {
    const entry = parseYamlMappingEntry(line);
    return Boolean(entry && entry.indent === 0 && entry.key === 'on');
  });
  if (onIndex === -1) {
    return [];
  }

  let onBlockEnd = lines.length;
  for (let i = onIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) {
      continue;
    }
    const entry = parseYamlMappingEntry(line);
    if (entry && entry.indent === 0) {
      onBlockEnd = i;
      break;
    }
  }

  let eventStart = -1;
  for (let i = onIndex + 1; i < onBlockEnd; i++) {
    const entry = parseYamlMappingEntry(lines[i]);
    if (entry && entry.indent === 2 && entry.key === eventName) {
      eventStart = i;
      break;
    }
  }
  if (eventStart === -1) {
    return [];
  }

  let eventEnd = onBlockEnd;
  for (let i = eventStart + 1; i < onBlockEnd; i++) {
    const entry = parseYamlMappingEntry(lines[i]);
    if (entry && entry.indent === 2) {
      eventEnd = i;
      break;
    }
  }

  for (let i = eventStart + 1; i < eventEnd; i++) {
    const branchEntry = parseYamlMappingEntry(lines[i]);
    if (!branchEntry || branchEntry.key !== 'branches') {
      continue;
    }
    const branchIndent = branchEntry.indent;
    const branchValue = branchEntry.value.trim();
    if (branchValue.length > 0) {
      return parseInlineYamlList(branchValue);
    }

    const parsedBranches = [];
    for (let j = i + 1; j < eventEnd; j++) {
      const nestedLine = lines[j];
      const nestedTrimmed = nestedLine.trim();
      if (nestedTrimmed.length === 0) {
        continue;
      }
      const nestedIndent = getIndentWidth(nestedLine);
      if (nestedIndent <= branchIndent) {
        break;
      }
      if (!nestedTrimmed.startsWith('-')) {
        continue;
      }
      const branchToken = normalizeYamlScalar(nestedTrimmed.slice(1));
      if (branchToken.length > 0) {
        parsedBranches.push(branchToken);
      }
    }
    return parsedBranches;
  }

  return [];
}

function workflowHasRequiredTriggerBranches(workflow, eventName, requiredBranches) {
  const branchSet = new Set(
    extractTriggerBranches(workflow, eventName).map((branch) => branch.toLowerCase()),
  );
  return requiredBranches.every((branch) => branchSet.has(branch.toLowerCase()));
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
  validateRequiredPackageScriptContracts();
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
  validateRequiredWorkflowStepContracts();
  validateRequiredWorkflowContentContracts();
  const previousStepByJob = new Map();
  for (const requiredStep of REQUIRED_WORKFLOW_STEPS) {
    const matchingStepBlocks = extractStepBlocks(workflow, requiredStep.name);
    const stepBlocks = requiredStep.requiredJob
      ? matchingStepBlocks.filter((stepBlock) => stepBlock.jobName === requiredStep.requiredJob)
      : matchingStepBlocks;
    if (stepBlocks.length === 0) {
      if (requiredStep.requiredJob) {
        throw new Error(
          `Workflow ${workflowPath} is missing required step "${requiredStep.name}" in job "${requiredStep.requiredJob}"`,
        );
      }
      throw new Error(`Workflow ${workflowPath} is missing required step "${requiredStep.name}"`);
    }
    if (stepBlocks.length > 1) {
      if (requiredStep.requiredJob) {
        throw new Error(
          `Workflow ${workflowPath} contains duplicate required step "${requiredStep.name}" in job "${requiredStep.requiredJob}"`,
        );
      }
      throw new Error(`Workflow ${workflowPath} contains duplicate required step "${requiredStep.name}"`);
    }
    const [stepBlock] = stepBlocks;
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
    const targetContent = requiredPattern.requiredJob
      ? extractJobBlock(workflow, requiredPattern.requiredJob)
      : workflow;
    const isMatch = !targetContent
      ? false
      : typeof requiredPattern.verify === 'function'
        ? requiredPattern.verify(targetContent)
        : requiredPattern.pattern instanceof RegExp
          ? requiredPattern.pattern.test(targetContent)
          : false;
    if (!isMatch) {
      throw new Error(
        `Workflow ${workflowPath} missing required content: ${requiredPattern.description}`,
      );
    }
  }

  return {
    requiredStepCount: REQUIRED_WORKFLOW_STEPS.length,
    requiredContentPatternCount: REQUIRED_WORKFLOW_CONTENT_PATTERNS.length,
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
    `[verify-runner-workflow-coverage] Verified runner checks in package scripts and CI workflow (${result.requiredScriptCount} scripts, ${result.requiredStepCount} steps, ${result.requiredContentPatternCount} content requirements).`,
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
