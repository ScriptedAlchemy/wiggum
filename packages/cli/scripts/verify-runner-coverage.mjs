#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

function listExpectedProjectRoots() {
  const entries = fs.readdirSync(PACKAGES_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(PACKAGES_DIR, entry.name))
    .filter((entryPath) => fs.existsSync(path.join(entryPath, 'package.json')))
    .map((entryPath) => path.resolve(entryPath))
    .sort((a, b) => a.localeCompare(b));
}

async function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Runner config not found at ${CONFIG_PATH}`);
  }

  const expected = listExpectedProjectRoots();
  if (!Number.isFinite(MIN_EXPECTED_PROJECTS) || MIN_EXPECTED_PROJECTS < 1) {
    throw new Error(`MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS must be >= 1, got ${MIN_EXPECTED_PROJECTS}`);
  }
  if (expected.length < MIN_EXPECTED_PROJECTS) {
    throw new Error(
      `Expected at least ${MIN_EXPECTED_PROJECTS} package projects, found ${expected.length}.`,
    );
  }

  const workspace = await resolveRunnerWorkspace({
    rootDir: ROOT,
    configPath: CONFIG_PATH,
    includeDependenciesForFiltered: false,
    includeInferredImports: false,
  });

  const resolvedRoots = new Set(workspace.projects.map((project) => path.resolve(project.root)));
  const missing = expected.filter((projectRoot) => !resolvedRoots.has(projectRoot));
  if (missing.length > 0) {
    throw new Error(
      `Runner config is missing ${missing.length} package project(s):\n${missing
        .map((entry) => `- ${path.relative(ROOT, entry)}`)
        .join('\n')}`,
    );
  }

  console.log(
    `[verify-runner-coverage] Verified ${workspace.projects.length} projects covering ${expected.length} package roots.`,
  );
}

main().catch((error) => {
  console.error(`[verify-runner-coverage] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
