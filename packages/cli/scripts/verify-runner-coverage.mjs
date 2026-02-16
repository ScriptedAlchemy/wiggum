#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveRunnerWorkspace } from '../dist/runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../../..');
const CONFIG_PATH = path.join(ROOT, 'wiggum.config.json');
const PACKAGES_DIR = path.join(ROOT, 'packages');

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
  if (parsedValue < 1) {
    throw new Error(
      `MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS must be >= 1, got ${parsedValue}`,
    );
  }

  return parsedValue;
}

const MIN_EXPECTED_PROJECTS = parseMinimumExpectedProjects();

export function listExpectedProjectRoots(packagesDir = PACKAGES_DIR, fileSystem = fs) {
  if (!fileSystem.existsSync(packagesDir)) {
    throw new Error(`Packages directory not found at ${packagesDir}`);
  }
  const directoryStats = fileSystem.statSync(packagesDir);
  if (!directoryStats.isDirectory()) {
    throw new Error(`Packages path must be a directory: ${packagesDir}`);
  }

  const entries = fileSystem.readdirSync(packagesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesDir, entry.name))
    .filter((entryPath) => fileSystem.existsSync(path.join(entryPath, 'package.json')))
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
  if (typeof rootDir !== 'string' || rootDir.length === 0) {
    throw new Error('rootDir must be a non-empty string path');
  }

  const normalizedExpectedRoots = expectedProjectRoots.map((entry, index) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new Error(`expectedProjectRoots[${index}] must be a non-empty string path`);
    }
    return path.resolve(entry);
  });
  const normalizedResolvedRoots = resolvedProjectRoots.map((entry, index) => {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new Error(`resolvedProjectRoots[${index}] must be a non-empty string path`);
    }
    return path.resolve(entry);
  });

  if (!Number.isFinite(minExpectedProjects) || minExpectedProjects < 1) {
    throw new Error(`MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS must be >= 1, got ${minExpectedProjects}`);
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
        .map((entry) => `- ${path.relative(rootDir, entry)}`)
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

export async function verifyRunnerCoverage({
  rootDir = ROOT,
  configPath = CONFIG_PATH,
  packagesDir = PACKAGES_DIR,
  minExpectedProjects = MIN_EXPECTED_PROJECTS,
  fileSystem = fs,
  resolveWorkspace = resolveRunnerWorkspace,
} = {}) {
  if (!fileSystem.existsSync(configPath)) {
    throw new Error(`Runner config not found at ${configPath}`);
  }

  const expectedProjectRoots = listExpectedProjectRoots(packagesDir, fileSystem);
  const workspace = await resolveWorkspace({
    rootDir,
    configPath,
    includeDependenciesForFiltered: false,
    includeInferredImports: false,
  });
  const resolvedProjectRoots = extractResolvedProjectRoots(workspace);

  const result = verifyRunnerCoverageData({
    expectedProjectRoots,
    resolvedProjectRoots,
    minExpectedProjects,
    rootDir,
  });

  console.log(
    `[verify-runner-coverage] Verified ${result.resolvedCount} projects covering ${result.expectedCount} package roots.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyRunnerCoverage().catch((error) => {
    console.error(`[verify-runner-coverage] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
