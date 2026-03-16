import { promises as fsp } from 'fs';
import fastGlob from 'fast-glob';
import {
  DEFAULT_MAX_INFERRED_IMPORT_SCAN_FILES,
  INFERRED_IMPORT_SCAN_ENV_VAR,
} from '../runner-metadata.js';
import {
  buildPackageNameToProjectNameMap,
  packageNameFromSpecifier,
} from './manifest-dependencies.js';
import type { RunnerProject } from './types.js';

const fg = fastGlob;
const IMPORT_ARGUMENT_COMMENT_RE = '(?:\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n\\r]*)\\s*';

const INFERRED_IMPORT_SOURCE_PATTERNS = [
  'src/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}',
  'test/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}',
  'tests/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}',
  'spec/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}',
  'specs/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}',
  '__tests__/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}',
];

const IMPORT_RE =
  new RegExp(
    `(?:import\\s+(?:[^'"]+from\\s*)?|import\\(\\s*(?:${IMPORT_ARGUMENT_COMMENT_RE})*|export\\s+[^'"]*from\\s*|require(?:\\.resolve)?\\(\\s*(?:${IMPORT_ARGUMENT_COMMENT_RE})*|import\\.meta\\.resolve\\(\\s*(?:${IMPORT_ARGUMENT_COMMENT_RE})*)['"]([^'"]+)['"]\\s*\\)?`,
    'g',
  );

export function parseInferImportMaxFiles(
  rawValue = process.env[INFERRED_IMPORT_SCAN_ENV_VAR],
): number {
  if (rawValue === undefined || rawValue.trim().length === 0) {
    return DEFAULT_MAX_INFERRED_IMPORT_SCAN_FILES;
  }
  const normalizedValue = rawValue.trim();
  if (!/^\d+$/.test(normalizedValue)) {
    throw new Error(
      `Invalid ${INFERRED_IMPORT_SCAN_ENV_VAR} value "${rawValue}". Expected a positive integer.`,
    );
  }
  const parsedValue = Number.parseInt(normalizedValue, 10);
  if (!Number.isSafeInteger(parsedValue) || parsedValue < 1) {
    throw new Error(
      `Invalid ${INFERRED_IMPORT_SCAN_ENV_VAR} value "${rawValue}". Expected a positive integer.`,
    );
  }
  return parsedValue;
}

export function validateInferImportMaxFilesOption(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`inferImportMaxFiles must be a positive integer, got ${value}`);
  }
  return value;
}

export async function inferImportDependencies(
  projects: RunnerProject[],
  maxImportScanFiles: number,
): Promise<void> {
  validateInferImportMaxFilesOption(maxImportScanFiles);
  const packageNameToProject = buildPackageNameToProjectNameMap(projects);
  if (packageNameToProject.size === 0) return;

  for (const project of projects) {
    const files = await fg(INFERRED_IMPORT_SOURCE_PATTERNS, {
      cwd: project.root,
      absolute: true,
      onlyFiles: true,
      dot: false,
      unique: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/*.d.ts'],
      followSymbolicLinks: true,
    });
    const filesToScan = [...files]
      .sort((a, b) => a.localeCompare(b))
      .slice(0, maxImportScanFiles);
    const seenDeps = new Set<string>();
    for (const file of filesToScan) {
      IMPORT_RE.lastIndex = 0;
      let content: string;
      try {
        content = await fsp.readFile(file, 'utf8');
      } catch {
        continue;
      }
      if (content.length > 1_000_000) continue;
      let match: RegExpExecArray | null;
      while ((match = IMPORT_RE.exec(content)) !== null) {
        const specifier = match[1];
        if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) continue;
        const projectPackageName = packageNameFromSpecifier(specifier);
        const dependencyProjectName =
          packageNameToProject.get(specifier) ?? packageNameToProject.get(projectPackageName);
        if (dependencyProjectName && dependencyProjectName !== project.name) {
          seenDeps.add(dependencyProjectName);
        }
      }
    }

    for (const dep of seenDeps) {
      if (!project.dependencies.includes(dep) && !project.inferredDependencies.includes(dep)) {
        project.inferredDependencies.push(dep);
      }
    }

    project.inferredDependencies = Array.from(new Set(project.inferredDependencies)).sort((a, b) =>
      a.localeCompare(b)
    );
  }
}
