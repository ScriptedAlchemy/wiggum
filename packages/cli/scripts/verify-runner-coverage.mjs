#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveRunnerWorkspace } from '../dist/runner.js';
import {
  ensureEnvObject,
  ensureNonEmptyRootPath,
  readEnvPathOverride,
} from './verifier-path-utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT = path.resolve(__dirname, '../../..');

export function resolveVerifierPathsFromEnv({
  env = process.env,
  fallbackRoot = DEFAULT_ROOT,
} = {}) {
  const normalizedEnv = ensureEnvObject(env);
  const rootOverride = readEnvPathOverride(normalizedEnv, 'WIGGUM_RUNNER_VERIFY_ROOT');
  const configPathOverride = readEnvPathOverride(normalizedEnv, 'WIGGUM_RUNNER_VERIFY_CONFIG_PATH');
  const packagesDirOverride = readEnvPathOverride(normalizedEnv, 'WIGGUM_RUNNER_VERIFY_PACKAGES_DIR');
  const normalizedFallbackRoot = ensureNonEmptyRootPath(fallbackRoot, 'fallbackRoot');

  const rootDir = rootOverride
    ? path.resolve(rootOverride)
    : path.resolve(normalizedFallbackRoot);
  const configPath = configPathOverride
    ? path.resolve(rootDir, configPathOverride)
    : path.join(rootDir, 'wiggum.config.json');
  const packagesDir = packagesDirOverride
    ? path.resolve(rootDir, packagesDirOverride)
    : path.join(rootDir, 'packages');

  return {
    rootDir,
    configPath,
    packagesDir,
  };
}

export function parseMinimumExpectedProjects(rawValue = process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS) {
  if (rawValue === undefined) {
    return 4;
  }

  const normalizedValue = String(rawValue).trim();
  if (!/^\d+$/.test(normalizedValue)) {
    throw new Error(
      `MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS must be a positive integer, got "${rawValue}"`,
    );
  }

  const parsedValue = Number.parseInt(normalizedValue, 10);
  if (!Number.isSafeInteger(parsedValue)) {
    throw new Error(
      `MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS must be <= ${Number.MAX_SAFE_INTEGER}, got "${rawValue}"`,
    );
  }
  if (parsedValue < 1) {
    throw new Error(
      `MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS must be >= 1, got ${parsedValue}`,
    );
  }

  return parsedValue;
}

export function ensureNonEmptyPathString(value, fieldName) {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string path`);
  }
  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string path`);
  }
  return normalizedValue;
}

export function resolvePathOption(value, fieldName, baseDir = process.cwd()) {
  const normalizedValue = ensureNonEmptyPathString(value, fieldName);
  return path.resolve(baseDir, normalizedValue);
}

export function ensureFileSystemContract(fileSystem) {
  if (!fileSystem || typeof fileSystem !== 'object') {
    throw new Error('fileSystem must provide existsSync, statSync, and readdirSync functions');
  }
  const requiredMethods = ['existsSync', 'statSync', 'readdirSync'];
  const missingMethods = [];
  for (const methodName of requiredMethods) {
    if (typeof fileSystem[methodName] !== 'function') {
      missingMethods.push(methodName);
    }
  }
  if (missingMethods.length > 0) {
    throw new Error(
      `fileSystem is missing required function(s): ${missingMethods.join(', ')}`,
    );
  }
  return fileSystem;
}

export function findDuplicatePaths(entries) {
  const seen = new Set();
  const duplicates = new Set();
  for (const entry of entries) {
    if (seen.has(entry)) {
      duplicates.add(entry);
    } else {
      seen.add(entry);
    }
  }
  return Array.from(duplicates).sort((a, b) => a.localeCompare(b));
}

export function listExpectedProjectRoots(
  packagesDir = resolveVerifierPathsFromEnv().packagesDir,
  fileSystem = fs,
) {
  const normalizedFileSystem = ensureFileSystemContract(fileSystem);
  if (!normalizedFileSystem.existsSync(packagesDir)) {
    throw new Error(`Packages directory not found at ${packagesDir}`);
  }
  const directoryStats = normalizedFileSystem.statSync(packagesDir);
  if (!directoryStats.isDirectory()) {
    throw new Error(`Packages path must be a directory: ${packagesDir}`);
  }

  const entries = normalizedFileSystem.readdirSync(packagesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesDir, entry.name))
    .filter((entryPath) => normalizedFileSystem.existsSync(path.join(entryPath, 'package.json')))
    .map((entryPath) => path.resolve(entryPath))
    .sort((a, b) => a.localeCompare(b));
}

export function verifyRunnerCoverageData({
  expectedProjectRoots,
  resolvedProjectRoots,
  minExpectedProjects,
  rootDir,
}) {
  if (!Array.isArray(expectedProjectRoots)) {
    throw new Error('expectedProjectRoots must be an array of project root paths');
  }
  if (!Array.isArray(resolvedProjectRoots)) {
    throw new Error('resolvedProjectRoots must be an array of project root paths');
  }
  const normalizedRootDir = path.resolve(ensureNonEmptyPathString(rootDir, 'rootDir'));

  const normalizedExpectedRoots = expectedProjectRoots.map((entry, index) => {
    try {
      return path.resolve(
        normalizedRootDir,
        ensureNonEmptyPathString(entry, `expectedProjectRoots[${index}]`),
      );
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : `expectedProjectRoots[${index}] must be a non-empty string path`,
      );
    }
  });
  const normalizedResolvedRoots = resolvedProjectRoots.map((entry, index) => {
    try {
      return path.resolve(
        normalizedRootDir,
        ensureNonEmptyPathString(entry, `resolvedProjectRoots[${index}]`),
      );
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : `resolvedProjectRoots[${index}] must be a non-empty string path`,
      );
    }
  });
  const duplicateExpectedRoots = findDuplicatePaths(normalizedExpectedRoots);
  if (duplicateExpectedRoots.length > 0) {
    throw new Error(
      `expectedProjectRoots contains duplicate project root path(s):\n${duplicateExpectedRoots
        .map((entry) => `- ${entry}`)
        .join('\n')}`,
    );
  }
  const duplicateResolvedRoots = findDuplicatePaths(normalizedResolvedRoots);
  if (duplicateResolvedRoots.length > 0) {
    throw new Error(
      `resolvedProjectRoots contains duplicate project root path(s):\n${duplicateResolvedRoots
        .map((entry) => `- ${entry}`)
        .join('\n')}`,
    );
  }

  if (!Number.isSafeInteger(minExpectedProjects) || minExpectedProjects < 1) {
    throw new Error(`MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS must be an integer >= 1, got ${minExpectedProjects}`);
  }
  if (normalizedExpectedRoots.length < minExpectedProjects) {
    throw new Error(
      `Expected at least ${minExpectedProjects} package projects, found ${normalizedExpectedRoots.length}.`,
    );
  }

  const resolvedRootsSet = new Set(normalizedResolvedRoots);
  const missing = normalizedExpectedRoots.filter((projectRoot) => !resolvedRootsSet.has(projectRoot));
  if (missing.length > 0) {
    throw new Error(
      `Runner config is missing ${missing.length} package project(s):\n${missing
        .map((entry) => `- ${path.relative(normalizedRootDir, entry)}`)
        .join('\n')}`,
    );
  }

  return {
    expectedCount: normalizedExpectedRoots.length,
    resolvedCount: normalizedResolvedRoots.length,
  };
}

export function extractResolvedProjectRoots(workspace) {
  if (!workspace || !Array.isArray(workspace.projects)) {
    throw new Error('resolveRunnerWorkspace must return an object with a projects array');
  }

  return workspace.projects.map((project, index) => {
    if (!project || typeof project.root !== 'string' || project.root.trim().length === 0) {
      throw new Error(`resolveRunnerWorkspace returned invalid project root at index ${index}`);
    }
    return path.resolve(project.root);
  });
}

export async function verifyRunnerCoverage(options = {}) {
  const {
    rootDir,
    configPath,
    packagesDir,
    minExpectedProjects,
    fileSystem = fs,
    resolveWorkspace = resolveRunnerWorkspace,
  } = options;
  const defaults = resolveVerifierPathsFromEnv();
  const normalizedFileSystem = ensureFileSystemContract(fileSystem);
  const normalizedRootDir = resolvePathOption(rootDir ?? defaults.rootDir, 'rootDir');
  const normalizedConfigPath = resolvePathOption(
    configPath ?? defaults.configPath,
    'configPath',
    normalizedRootDir,
  );
  const normalizedPackagesDir = resolvePathOption(
    packagesDir ?? defaults.packagesDir,
    'packagesDir',
    normalizedRootDir,
  );
  if (typeof resolveWorkspace !== 'function') {
    throw new Error('resolveWorkspace must be a function');
  }

  if (!normalizedFileSystem.existsSync(normalizedConfigPath)) {
    throw new Error(`Runner config not found at ${normalizedConfigPath}`);
  }

  const effectiveMinExpectedProjects = minExpectedProjects === undefined
    ? parseMinimumExpectedProjects()
    : minExpectedProjects;

  const expectedProjectRoots = listExpectedProjectRoots(normalizedPackagesDir, normalizedFileSystem);
  const workspace = await resolveWorkspace({
    rootDir: normalizedRootDir,
    configPath: normalizedConfigPath,
    includeDependenciesForFiltered: false,
    includeInferredImports: false,
  });
  const resolvedProjectRoots = extractResolvedProjectRoots(workspace);

  const result = verifyRunnerCoverageData({
    expectedProjectRoots,
    resolvedProjectRoots,
    minExpectedProjects: effectiveMinExpectedProjects,
    rootDir: normalizedRootDir,
  });

  console.log(
    `[verify-runner-coverage] Verified ${result.resolvedCount} projects covering ${result.expectedCount} package roots.`,
  );

  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyRunnerCoverage().catch((error) => {
    console.error(`[verify-runner-coverage] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
