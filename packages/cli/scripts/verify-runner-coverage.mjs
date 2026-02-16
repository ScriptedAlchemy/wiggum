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
const MIN_EXPECTED_PROJECTS = Number.parseInt(
  process.env.MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS ?? '4',
  10,
);

export function listExpectedProjectRoots(packagesDir = PACKAGES_DIR, fileSystem = fs) {
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
  if (!Number.isFinite(minExpectedProjects) || minExpectedProjects < 1) {
    throw new Error(`MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS must be >= 1, got ${minExpectedProjects}`);
  }
  if (expectedProjectRoots.length < minExpectedProjects) {
    throw new Error(
      `Expected at least ${minExpectedProjects} package projects, found ${expectedProjectRoots.length}.`,
    );
  }

  const normalizedResolvedRoots = new Set(
    resolvedProjectRoots.map((entry) => path.resolve(entry)),
  );
  const missing = expectedProjectRoots.filter((projectRoot) => !normalizedResolvedRoots.has(projectRoot));
  if (missing.length > 0) {
    throw new Error(
      `Runner config is missing ${missing.length} package project(s):\n${missing
        .map((entry) => `- ${path.relative(rootDir, entry)}`)
        .join('\n')}`,
    );
  }

  return {
    expectedCount: expectedProjectRoots.length,
    resolvedCount: resolvedProjectRoots.length,
  };
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
  const resolvedProjectRoots = workspace.projects.map((project) => path.resolve(project.root));

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
