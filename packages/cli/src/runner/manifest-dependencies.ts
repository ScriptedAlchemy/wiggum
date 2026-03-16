import path from 'path';
import type { RunnerProject } from './types.js';
import { normalizePath, pathExists, readJsonFile } from './utils.js';

const PACKAGE_NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/;

export function packageNameFromSpecifier(specifier: string): string {
  if (!specifier.includes('/')) {
    return specifier;
  }
  if (specifier.startsWith('@')) {
    const segments = specifier.split('/');
    if (segments.length >= 2) {
      return `${segments[0]}/${segments[1]}`;
    }
    return specifier;
  }
  return specifier.split('/')[0];
}

export function buildPackageNameToProjectNameMap(projects: RunnerProject[]): Map<string, string> {
  const packageNameToProjectName = new Map<string, string>();
  const packageNameToProjectRoot = new Map<string, string>();

  for (const project of projects) {
    if (!project.packageName) {
      continue;
    }
    const existingProjectName = packageNameToProjectName.get(project.packageName);
    if (existingProjectName && existingProjectName !== project.name) {
      const existingProjectRoot = packageNameToProjectRoot.get(project.packageName) ?? '(unknown)';
      throw new Error(
        `Duplicate package name "${project.packageName}" across projects "${existingProjectName}" (${existingProjectRoot}) and "${project.name}" (${project.root}).`,
      );
    }
    packageNameToProjectName.set(project.packageName, project.name);
    packageNameToProjectRoot.set(project.packageName, project.root);
  }

  return packageNameToProjectName;
}

function parseAliasTargetPackageName(aliasBody: string): string | undefined {
  const normalizedAliasBody = stripSpecifierSuffix(aliasBody).trim();
  if (normalizedAliasBody.length === 0) {
    return undefined;
  }

  if (
    normalizedAliasBody.startsWith('*')
    || normalizedAliasBody.startsWith('^')
    || normalizedAliasBody.startsWith('~')
  ) {
    return undefined;
  }

  if (
    normalizedAliasBody.startsWith('./')
    || normalizedAliasBody.startsWith('../')
    || normalizedAliasBody.startsWith('/')
    || normalizedAliasBody.startsWith('file:')
  ) {
    return undefined;
  }

  let candidatePackageName: string;
  if (normalizedAliasBody.startsWith('@')) {
    const scopeSeparatorIndex = normalizedAliasBody.indexOf('/');
    if (scopeSeparatorIndex <= 1) {
      return undefined;
    }
    const versionSeparatorIndex = normalizedAliasBody.indexOf('@', scopeSeparatorIndex + 1);
    candidatePackageName = versionSeparatorIndex === -1
      ? normalizedAliasBody
      : normalizedAliasBody.slice(0, versionSeparatorIndex);
  } else {
    const versionSeparatorIndex = normalizedAliasBody.indexOf('@');
    candidatePackageName = versionSeparatorIndex === -1
      ? normalizedAliasBody
      : normalizedAliasBody.slice(0, versionSeparatorIndex);
  }

  if (!PACKAGE_NAME_RE.test(candidatePackageName)) {
    return undefined;
  }

  return candidatePackageName;
}

function stripSpecifierSuffix(rawValue: string): string {
  const hashIndex = rawValue.indexOf('#');
  const queryIndex = rawValue.indexOf('?');
  const suffixCutoff = [hashIndex, queryIndex]
    .filter((index) => index >= 0)
    .reduce((min, index) => Math.min(min, index), Number.POSITIVE_INFINITY);
  return Number.isFinite(suffixCutoff) ? rawValue.slice(0, suffixCutoff) : rawValue;
}

function parseNpmAliasDependencyTarget(specifier: string): string | undefined {
  const trimmedSpecifier = specifier.trim();
  if (!trimmedSpecifier.startsWith('npm:')) {
    return undefined;
  }

  return parseAliasTargetPackageName(trimmedSpecifier.slice('npm:'.length).trim());
}

function parseWorkspaceAliasDependencyTarget(specifier: string): string | undefined {
  const trimmedSpecifier = specifier.trim();
  if (!trimmedSpecifier.startsWith('workspace:')) {
    return undefined;
  }

  return parseAliasTargetPackageName(trimmedSpecifier.slice('workspace:'.length).trim());
}

async function readPackageNameFromPath(
  dependencyPath: string,
  packageNameCache: Map<string, string | undefined>,
): Promise<string | undefined> {
  const normalizedDependencyPath = normalizePath(dependencyPath);
  const packageJsonPath = path.basename(normalizedDependencyPath) === 'package.json'
    ? normalizedDependencyPath
    : normalizePath(path.join(normalizedDependencyPath, 'package.json'));
  if (packageNameCache.has(packageJsonPath)) {
    return packageNameCache.get(packageJsonPath);
  }
  if (!(await pathExists(packageJsonPath))) {
    packageNameCache.set(packageJsonPath, undefined);
    return undefined;
  }

  try {
    const pkg = await readJsonFile<{ name?: string }>(packageJsonPath);
    const packageName = typeof pkg.name === 'string' && pkg.name.trim().length > 0
      ? pkg.name.trim()
      : undefined;
    packageNameCache.set(packageJsonPath, packageName);
    return packageName;
  } catch {
    packageNameCache.set(packageJsonPath, undefined);
    return undefined;
  }
}

async function parseLocalPathDependencyTarget(
  projectRoot: string,
  specifier: string,
  packageNameCache: Map<string, string | undefined>,
): Promise<string | undefined> {
  const trimmedSpecifier = specifier.trim();
  let rawPath: string | undefined;

  if (trimmedSpecifier.startsWith('file:')) {
    rawPath = trimmedSpecifier.slice('file:'.length).trim();
  } else if (trimmedSpecifier.startsWith('link:')) {
    rawPath = trimmedSpecifier.slice('link:'.length).trim();
  } else if (trimmedSpecifier.startsWith('portal:')) {
    rawPath = trimmedSpecifier.slice('portal:'.length).trim();
  } else if (trimmedSpecifier.startsWith('workspace:')) {
    const workspaceBody = trimmedSpecifier.slice('workspace:'.length).trim();
    if (workspaceBody.startsWith('file:')) {
      rawPath = workspaceBody.slice('file:'.length).trim();
    } else if (workspaceBody.startsWith('link:')) {
      rawPath = workspaceBody.slice('link:'.length).trim();
    } else if (workspaceBody.startsWith('portal:')) {
      rawPath = workspaceBody.slice('portal:'.length).trim();
    } else if (
      workspaceBody.startsWith('./')
      || workspaceBody.startsWith('../')
      || workspaceBody.startsWith('/')
    ) {
      rawPath = workspaceBody;
    }
  }

  if (!rawPath) {
    return undefined;
  }

  const cleanedPath = stripSpecifierSuffix(rawPath).trim();
  if (cleanedPath.length === 0) {
    return undefined;
  }

  const absolutePath = path.isAbsolute(cleanedPath)
    ? normalizePath(cleanedPath)
    : normalizePath(path.join(projectRoot, cleanedPath));
  return readPackageNameFromPath(absolutePath, packageNameCache);
}

async function collectDependencyPackageNames(
  field: Record<string, unknown>,
  projectRoot: string,
  packageNameCache: Map<string, string | undefined>,
): Promise<string[]> {
  const dependencyPackageNames = new Set<string>();
  for (const [dependencyName, dependencySpecifier] of Object.entries(field)) {
    dependencyPackageNames.add(dependencyName);
    if (typeof dependencySpecifier !== 'string') {
      continue;
    }
    const aliasTargets = [
      parseNpmAliasDependencyTarget(dependencySpecifier),
      parseWorkspaceAliasDependencyTarget(dependencySpecifier),
      await parseLocalPathDependencyTarget(projectRoot, dependencySpecifier, packageNameCache),
    ];
    for (const aliasTargetPackageName of aliasTargets) {
      if (aliasTargetPackageName) {
        dependencyPackageNames.add(aliasTargetPackageName);
      }
    }
  }
  return Array.from(dependencyPackageNames);
}

function collectBundledDependencyPackageNames(rawValue: unknown): string[] {
  if (!Array.isArray(rawValue)) {
    return [];
  }
  return rawValue
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export async function readPackageInfo(
  projectRoot: string,
  packageNameCache: Map<string, string | undefined>,
): Promise<{
  packageName?: string;
  dependencyPackageNames: string[];
}> {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (!(await pathExists(packageJsonPath))) {
    return { dependencyPackageNames: [] };
  }

  try {
    const pkg = await readJsonFile<{
      name?: string;
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
      peerDependencies?: Record<string, unknown>;
      optionalDependencies?: Record<string, unknown>;
      bundleDependencies?: string[];
      bundledDependencies?: string[];
    }>(packageJsonPath);
    const fields = [
      pkg.dependencies ?? {},
      pkg.devDependencies ?? {},
      pkg.peerDependencies ?? {},
      pkg.optionalDependencies ?? {},
    ];
    const packageNamesFromFields = (
      await Promise.all(
        fields.map((field) => collectDependencyPackageNames(field, projectRoot, packageNameCache)),
      )
    ).flat();
    const bundledDependencyPackageNames = [
      ...collectBundledDependencyPackageNames(pkg.bundleDependencies),
      ...collectBundledDependencyPackageNames(pkg.bundledDependencies),
    ];
    return {
      packageName: pkg.name,
      dependencyPackageNames: Array.from(
        new Set([...packageNamesFromFields, ...bundledDependencyPackageNames]),
      ),
    };
  } catch {
    return { dependencyPackageNames: [] };
  }
}
