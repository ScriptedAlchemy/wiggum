import { promises as fsp } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import fastGlob from 'fast-glob';

const fg = fastGlob;
type FastGlobWithHelpers = typeof fastGlob & {
  isDynamicPattern: (pattern: string) => boolean;
};
const { isDynamicPattern } = fastGlob as FastGlobWithHelpers;

export type RunnerConfigEntry = string | RunnerProjectEntry;

export interface RunnerProjectEntry {
  name?: string;
  root?: string;
  config?: string;
  args?: string[];
  ignore?: string[];
  projects?: RunnerConfigEntry[];
}

export interface RunnerConfig {
  root?: string;
  ignore?: string[];
  defaults?: {
    args?: string[];
  };
  projects?: RunnerConfigEntry[];
}

export interface RunnerProject {
  name: string;
  root: string;
  configFile?: string;
  args: string[];
  packageName?: string;
  dependencyPackageNames: string[];
  dependencies: string[];
  inferredDependencies: string[];
}

export interface RunnerEdge {
  from: string;
  to: string;
  reason: 'manifest' | 'inferred-import';
}

export interface RunnerGraph {
  nodes: Array<{
    name: string;
    root: string;
    packageName?: string;
    dependencies: string[];
    inferredDependencies: string[];
  }>;
  edges: RunnerEdge[];
  topologicalOrder: string[];
  levels: string[][];
  cycles: string[][];
}

export interface ResolvedRunnerWorkspace {
  rootDir: string;
  configPath?: string;
  projects: RunnerProject[];
  graph: RunnerGraph;
}

export interface ResolveRunnerWorkspaceOptions {
  rootDir?: string;
  configPath?: string;
  projectFilters?: string[];
  includeDependenciesForFiltered?: boolean;
  includeInferredImports?: boolean;
  inferImportMaxFiles?: number;
}

const RUNNER_CONFIG_FILES = [
  'wiggum.config.mjs',
  'wiggum.config.js',
  'wiggum.config.cjs',
  'wiggum.config.json',
];
const UNSUPPORTED_RUNNER_CONFIG_FILES = [
  'wiggum.config.ts',
  'wiggum.config.mts',
  'wiggum.config.cts',
];

const PROJECT_CONFIG_RE = /(?:^|\/)(?:rslib|rsbuild|rspack|rspress|rstest|rslint)\.config\.(?:mjs|js|cjs|mts|cts|ts)$/;
const IMPORT_ARGUMENT_COMMENT_RE = '(?:\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n\\r]*)\\s*';
const DEFAULT_MAX_INFERRED_IMPORT_SCAN_FILES = 400;
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
    `(?:import\\s+(?:[^'"]+from\\s*)?|import\\(\\s*(?:${IMPORT_ARGUMENT_COMMENT_RE})*|export\\s+[^'"]*from\\s*|require(?:\\.resolve)?\\(\\s*(?:${IMPORT_ARGUMENT_COMMENT_RE})*)['"]([^'"]+)['"]\\s*\\)?`,
    'g',
  );

function parseInferImportMaxFiles(
  rawValue = process.env.WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES,
): number {
  if (rawValue === undefined || rawValue.trim().length === 0) {
    return DEFAULT_MAX_INFERRED_IMPORT_SCAN_FILES;
  }
  const normalizedValue = rawValue.trim();
  if (!/^\d+$/.test(normalizedValue)) {
    throw new Error(
      `Invalid WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES value "${rawValue}". Expected a positive integer.`,
    );
  }
  const parsedValue = Number.parseInt(normalizedValue, 10);
  if (!Number.isSafeInteger(parsedValue) || parsedValue < 1) {
    throw new Error(
      `Invalid WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES value "${rawValue}". Expected a positive integer.`,
    );
  }
  return parsedValue;
}

function validateInferImportMaxFilesOption(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`inferImportMaxFiles must be a positive integer, got ${value}`);
  }
  return value;
}

type MutableProject = Omit<RunnerProject, 'dependencies' | 'inferredDependencies'> & {
  dependencies: Set<string>;
  inferredDependencies: Set<string>;
};

type CollectContext = {
  dedupeByRoot: Map<string, MutableProject>;
  dedupeByName: Map<string, string>;
  visitedConfigPaths: Set<string>;
};

function normalizePath(inputPath: string): string {
  return path.resolve(inputPath);
}

function toDisplayPath(inputPath: string, rootDir: string): string {
  const relative = path.relative(rootDir, inputPath);
  return relative ? relative : '.';
}

function isRunnerConfigFile(filePath: string): boolean {
  const base = path.basename(filePath);
  return RUNNER_CONFIG_FILES.includes(base);
}

function isUnsupportedRunnerConfigFile(filePath: string): boolean {
  const base = path.basename(filePath);
  return UNSUPPORTED_RUNNER_CONFIG_FILES.includes(base);
}

function unsupportedRunnerConfigError(filePath: string): Error {
  return new Error(
    `Unsupported runner config file "${path.basename(filePath)}". Use one of: ${RUNNER_CONFIG_FILES.join(', ')}`,
  );
}

function isProjectConfigFile(filePath: string): boolean {
  return PROJECT_CONFIG_RE.test(filePath.split('\\').join('/'));
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  const wildcarded = escaped.split('*').join('.*');
  return new RegExp(`^${wildcarded}$`, 'i');
}

function packageNameFromSpecifier(specifier: string): string {
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

function buildPackageNameToProjectNameMap(projects: RunnerProject[]): Map<string, string> {
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

function applyProjectFilters(projects: RunnerProject[], filters: string[]): RunnerProject[] {
  if (filters.length === 0) return projects;

  const positive = filters.filter((pattern) => !pattern.startsWith('!'));
  const negative = filters
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => pattern.slice(1))
    .filter(Boolean);

  const positiveRegs = positive.map(wildcardToRegExp);
  const negativeRegs = negative.map(wildcardToRegExp);

  const filtered = projects.filter((project) => {
    const candidates = [project.name, project.root, project.configFile ?? ''];
    const positiveMatch =
      positiveRegs.length === 0 ||
      positiveRegs.some((reg) => candidates.some((candidate) => reg.test(candidate)));
    const negativeMatch = negativeRegs.some((reg) =>
      candidates.some((candidate) => reg.test(candidate))
    );
    return positiveMatch && !negativeMatch;
  });

  if (filtered.length === 0) {
    throw new Error(
      `No projects matched filters: ${filters.join(', ')}.`
    );
  }

  return filtered;
}

function includeDependencyClosure(allProjects: RunnerProject[], selectedProjects: RunnerProject[]): RunnerProject[] {
  const byName = new Map(allProjects.map((project) => [project.name, project]));
  const queue = [...selectedProjects.map((project) => project.name)];
  const selected = new Set(queue);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const project = byName.get(current);
    if (!project) continue;
    for (const dependency of [...project.dependencies, ...project.inferredDependencies]) {
      if (!selected.has(dependency)) {
        selected.add(dependency);
        queue.push(dependency);
      }
    }
  }

  return allProjects.filter((project) => selected.has(project.name));
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await fsp.readFile(filePath, 'utf8');
  return JSON.parse(content) as T;
}

function replaceRootToken(inputValue: string, rootDir: string): string {
  return inputValue.split('<rootDir>').join(rootDir);
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((value): value is string => typeof value === 'string');
}

function resolveFromRoot(rootDir: string, maybeRelativePath: string): string {
  const replaced = replaceRootToken(maybeRelativePath, rootDir);
  return normalizePath(path.isAbsolute(replaced) ? replaced : path.join(rootDir, replaced));
}

async function detectRunnerConfig(rootDir: string): Promise<string | undefined> {
  for (const fileName of RUNNER_CONFIG_FILES) {
    const filePath = path.join(rootDir, fileName);
    if (await pathExists(filePath)) return filePath;
  }
  for (const fileName of UNSUPPORTED_RUNNER_CONFIG_FILES) {
    const filePath = path.join(rootDir, fileName);
    if (await pathExists(filePath)) {
      throw unsupportedRunnerConfigError(filePath);
    }
  }
  return undefined;
}

async function readRunnerConfig(configPath: string): Promise<RunnerConfig> {
  const ext = path.extname(configPath).toLowerCase();
  if (ext === '.json') {
    return readJsonFile<RunnerConfig>(configPath);
  }
  const moduleUrl = pathToFileURL(configPath).toString();
  const imported = await import(moduleUrl);
  const config = (imported.default ?? imported) as RunnerConfig;
  if (!config || typeof config !== 'object') {
    throw new Error(`Invalid runner config: ${configPath}`);
  }
  return config;
}

function parseAliasTargetPackageName(aliasBody: string): string | undefined {
  if (aliasBody.length === 0) {
    return undefined;
  }

  if (aliasBody.startsWith('*') || aliasBody.startsWith('^') || aliasBody.startsWith('~')) {
    return undefined;
  }

  if (
    aliasBody.startsWith('./') ||
    aliasBody.startsWith('../') ||
    aliasBody.startsWith('/') ||
    aliasBody.startsWith('file:')
  ) {
    return undefined;
  }

  let candidatePackageName: string;
  if (aliasBody.startsWith('@')) {
    const scopeSeparatorIndex = aliasBody.indexOf('/');
    if (scopeSeparatorIndex <= 1) {
      return undefined;
    }
    const versionSeparatorIndex = aliasBody.indexOf('@', scopeSeparatorIndex + 1);
    candidatePackageName = versionSeparatorIndex === -1 ? aliasBody : aliasBody.slice(0, versionSeparatorIndex);
  } else {
    const versionSeparatorIndex = aliasBody.indexOf('@');
    candidatePackageName = versionSeparatorIndex === -1 ? aliasBody : aliasBody.slice(0, versionSeparatorIndex);
  }

  if (!/^(?:@[^/\s]+\/[^/\s]+|[^@/\s][^/\s]*)$/.test(candidatePackageName)) {
    return undefined;
  }

  return candidatePackageName;
}

function parseNpmAliasDependencyTarget(specifier: string): string | undefined {
  const trimmedSpecifier = specifier.trim();
  if (!trimmedSpecifier.startsWith('npm:')) {
    return undefined;
  }

  const aliasBody = trimmedSpecifier.slice('npm:'.length).trim();
  return parseAliasTargetPackageName(aliasBody);
}

function parseWorkspaceAliasDependencyTarget(specifier: string): string | undefined {
  const trimmedSpecifier = specifier.trim();
  if (!trimmedSpecifier.startsWith('workspace:')) {
    return undefined;
  }

  const aliasBody = trimmedSpecifier.slice('workspace:'.length).trim();
  return parseAliasTargetPackageName(aliasBody);
}

async function readPackageNameFromPath(
  dependencyPath: string,
  packageNameCache: Map<string, string | undefined>,
): Promise<string | undefined> {
  const normalizedDependencyPath = normalizePath(dependencyPath);
  if (packageNameCache.has(normalizedDependencyPath)) {
    return packageNameCache.get(normalizedDependencyPath);
  }

  const packageJsonPath = path.basename(normalizedDependencyPath) === 'package.json'
    ? normalizedDependencyPath
    : path.join(normalizedDependencyPath, 'package.json');
  if (!(await pathExists(packageJsonPath))) {
    packageNameCache.set(normalizedDependencyPath, undefined);
    return undefined;
  }

  try {
    const pkg = await readJsonFile<{ name?: string }>(packageJsonPath);
    const packageName = typeof pkg.name === 'string' && pkg.name.trim().length > 0
      ? pkg.name.trim()
      : undefined;
    packageNameCache.set(normalizedDependencyPath, packageName);
    return packageName;
  } catch {
    packageNameCache.set(normalizedDependencyPath, undefined);
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
    if (workspaceBody.startsWith('./') || workspaceBody.startsWith('../') || workspaceBody.startsWith('/')) {
      rawPath = workspaceBody;
    }
  }

  if (!rawPath) {
    return undefined;
  }

  const hashIndex = rawPath.indexOf('#');
  const queryIndex = rawPath.indexOf('?');
  const suffixCutoff = [hashIndex, queryIndex]
    .filter((index) => index >= 0)
    .reduce((min, index) => Math.min(min, index), Number.POSITIVE_INFINITY);
  const cleanedPath = (Number.isFinite(suffixCutoff) ? rawPath.slice(0, suffixCutoff) : rawPath).trim();
  if (cleanedPath.length === 0) {
    return undefined;
  }

  const absolutePath = path.isAbsolute(cleanedPath)
    ? normalizePath(cleanedPath)
    : normalizePath(path.join(projectRoot, cleanedPath));
  return readPackageNameFromPath(absolutePath, packageNameCache);
}

async function collectDependencyPackageNames(
  field: Record<string, string>,
  projectRoot: string,
  packageNameCache: Map<string, string | undefined>,
): Promise<string[]> {
  const dependencyPackageNames = new Set<string>();
  for (const [dependencyName, dependencySpecifier] of Object.entries(field)) {
    dependencyPackageNames.add(dependencyName);
    const aliasTargets = [
      parseNpmAliasDependencyTarget(dependencySpecifier),
      parseWorkspaceAliasDependencyTarget(dependencySpecifier),
      await parseLocalPathDependencyTarget(projectRoot, dependencySpecifier, packageNameCache),
    ];
    for (const aliasTargetPackageName of aliasTargets) {
      if (!aliasTargetPackageName) {
        continue;
      }
      dependencyPackageNames.add(aliasTargetPackageName);
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

async function readPackageInfo(projectRoot: string): Promise<{
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
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      bundleDependencies?: string[];
      bundledDependencies?: string[];
    }>(packageJsonPath);
    const fields = [
      pkg.dependencies ?? {},
      pkg.devDependencies ?? {},
      pkg.peerDependencies ?? {},
      pkg.optionalDependencies ?? {},
    ];
    const packageNameCache = new Map<string, string | undefined>();
    const packageNamesFromFields = (
      await Promise.all(
        fields.map((field) => collectDependencyPackageNames(field, projectRoot, packageNameCache)),
      )
    ).flat();
    const bundledDependencyPackageNames = [
      ...collectBundledDependencyPackageNames(pkg.bundleDependencies),
      ...collectBundledDependencyPackageNames(pkg.bundledDependencies),
    ];
    const dependencyPackageNames = Array.from(
      new Set([
        ...packageNamesFromFields,
        ...bundledDependencyPackageNames,
      ]),
    );
    return { packageName: pkg.name, dependencyPackageNames };
  } catch {
    return { dependencyPackageNames: [] };
  }
}

async function inferNestedConfigFromDirectory(projectPath: string): Promise<string | undefined> {
  for (const candidate of RUNNER_CONFIG_FILES) {
    const filePath = path.join(projectPath, candidate);
    if (await pathExists(filePath)) return filePath;
  }
  for (const candidate of UNSUPPORTED_RUNNER_CONFIG_FILES) {
    const filePath = path.join(projectPath, candidate);
    if (await pathExists(filePath)) {
      throw unsupportedRunnerConfigError(filePath);
    }
  }
  return undefined;
}

async function resolveStringEntry(
  rawEntry: string,
  rootDir: string,
  ignore: string[],
): Promise<string[]> {
  const replaced = replaceRootToken(rawEntry, rootDir);
  const asAbsolute = path.isAbsolute(replaced)
    ? normalizePath(replaced)
    : normalizePath(path.join(rootDir, replaced));

  if (isDynamicPattern(replaced) || isDynamicPattern(asAbsolute)) {
    const globPattern = path.isAbsolute(replaced)
      ? replaced
      : replaceRootToken(rawEntry, rootDir).split('\\').join('/');
    const entries = await fg(globPattern, {
      cwd: rootDir,
      absolute: true,
      dot: false,
      onlyFiles: false,
      ignore,
      unique: true,
      followSymbolicLinks: true,
    });
    return entries.map((entry) => normalizePath(entry));
  }

  if (!(await pathExists(asAbsolute))) {
    throw new Error(`Project entry does not exist: ${rawEntry} -> ${asAbsolute}`);
  }
  return [asAbsolute];
}

async function addResolvedProject(
  ctx: CollectContext,
  projectRoot: string,
  options: {
    explicitName?: string;
    configFile?: string;
    inheritedArgs: string[];
    localArgs?: string[];
  },
): Promise<void> {
  const normalizedRoot = normalizePath(projectRoot);
  const packageInfo = await readPackageInfo(normalizedRoot);
  const fallbackName = path.basename(normalizedRoot);
  const projectName = options.explicitName ?? packageInfo.packageName ?? fallbackName;
  const combinedArgs = [...options.inheritedArgs, ...(options.localArgs ?? [])];

  const existingAtRoot = ctx.dedupeByRoot.get(normalizedRoot);
  if (existingAtRoot) {
    for (const arg of combinedArgs) {
      if (!existingAtRoot.args.includes(arg)) existingAtRoot.args.push(arg);
    }
    return;
  }

  const nameRoot = ctx.dedupeByName.get(projectName);
  if (nameRoot && nameRoot !== normalizedRoot) {
    throw new Error(
      `Duplicate project name "${projectName}" for roots "${nameRoot}" and "${normalizedRoot}".`
    );
  }
  ctx.dedupeByName.set(projectName, normalizedRoot);

  const mutable: MutableProject = {
    name: projectName,
    root: normalizedRoot,
    configFile: options.configFile,
    args: Array.from(new Set(combinedArgs)),
    packageName: packageInfo.packageName,
    dependencyPackageNames: packageInfo.dependencyPackageNames,
    dependencies: new Set<string>(),
    inferredDependencies: new Set<string>(),
  };
  ctx.dedupeByRoot.set(normalizedRoot, mutable);
}

async function collectProjectsFromConfig(
  configPath: string,
  inheritedArgs: string[],
  inheritedIgnore: string[],
  ctx: CollectContext,
): Promise<void> {
  const absoluteConfigPath = normalizePath(configPath);
  if (ctx.visitedConfigPaths.has(absoluteConfigPath)) return;
  ctx.visitedConfigPaths.add(absoluteConfigPath);

  const configDir = path.dirname(absoluteConfigPath);
  const config = await readRunnerConfig(absoluteConfigPath);
  const configRoot = config.root ? resolveFromRoot(configDir, config.root) : configDir;
  const defaultsArgs = normalizeStringArray(config.defaults?.args);
  const mergedArgs = [...inheritedArgs, ...defaultsArgs];
  const mergedIgnore = [
    ...inheritedIgnore,
    ...normalizeStringArray(config.ignore),
  ];

  const entries = Array.isArray(config.projects) ? config.projects : [configRoot];
  for (const entry of entries) {
    await processRunnerEntry(
      entry,
      {
        baseRoot: configRoot,
        inheritedArgs: mergedArgs,
        inheritedIgnore: mergedIgnore,
        sourceConfigPath: absoluteConfigPath,
      },
      ctx,
    );
  }
}

async function processResolvedPath(
  resolvedPath: string,
  inheritedArgs: string[],
  inheritedIgnore: string[],
  sourceConfigPath: string,
  ctx: CollectContext,
): Promise<void> {
  const stat = await fsp.stat(resolvedPath);
  if (stat.isDirectory()) {
    const nestedConfig = await inferNestedConfigFromDirectory(resolvedPath);
    if (nestedConfig) {
      await collectProjectsFromConfig(nestedConfig, inheritedArgs, inheritedIgnore, ctx);
      return;
    }
    await addResolvedProject(ctx, resolvedPath, { inheritedArgs });
    return;
  }

  if (isRunnerConfigFile(resolvedPath)) {
    await collectProjectsFromConfig(resolvedPath, inheritedArgs, inheritedIgnore, ctx);
    return;
  }
  if (isUnsupportedRunnerConfigFile(resolvedPath)) {
    throw unsupportedRunnerConfigError(resolvedPath);
  }
  if (path.basename(resolvedPath) === 'package.json') {
    await addResolvedProject(ctx, path.dirname(resolvedPath), { inheritedArgs });
    return;
  }
  if (isProjectConfigFile(resolvedPath)) {
    await addResolvedProject(ctx, path.dirname(resolvedPath), {
      inheritedArgs,
      configFile: resolvedPath,
    });
    return;
  }
  throw new Error(`Unsupported project file "${resolvedPath}" in ${sourceConfigPath}.`);
}

async function processRunnerEntry(
  entry: RunnerConfigEntry,
  scope: {
    baseRoot: string;
    inheritedArgs: string[];
    inheritedIgnore: string[];
    sourceConfigPath: string;
  },
  ctx: CollectContext,
): Promise<void> {
  const { baseRoot, inheritedArgs, inheritedIgnore, sourceConfigPath } = scope;

  if (typeof entry === 'string') {
    const resolvedPaths = await resolveStringEntry(entry, baseRoot, inheritedIgnore);
    for (const resolvedPath of resolvedPaths) {
      await processResolvedPath(
        resolvedPath,
        inheritedArgs,
        inheritedIgnore,
        sourceConfigPath,
        ctx,
      );
    }
    return;
  }

  if (!entry || typeof entry !== 'object') {
    throw new Error(`Invalid project entry in ${sourceConfigPath}.`);
  }

  const objectRoot = entry.root ? resolveFromRoot(baseRoot, entry.root) : baseRoot;
  const mergedIgnore = [...inheritedIgnore, ...normalizeStringArray(entry.ignore)];
  const localArgs = normalizeStringArray(entry.args);
  const mergedArgs = [...inheritedArgs, ...localArgs];

  if (Array.isArray(entry.projects) && entry.projects.length > 0) {
    for (const nestedEntry of entry.projects) {
      await processRunnerEntry(
        nestedEntry,
        {
          baseRoot: objectRoot,
          inheritedArgs: mergedArgs,
          inheritedIgnore: mergedIgnore,
          sourceConfigPath,
        },
        ctx,
      );
    }
    return;
  }

  const explicitConfig = entry.config ? resolveFromRoot(objectRoot, entry.config) : undefined;
  if (explicitConfig && !(await pathExists(explicitConfig))) {
    throw new Error(`Project config file not found: ${explicitConfig}`);
  }
  if (explicitConfig && isUnsupportedRunnerConfigFile(explicitConfig)) {
    throw unsupportedRunnerConfigError(explicitConfig);
  }
  if (explicitConfig && isRunnerConfigFile(explicitConfig)) {
    await collectProjectsFromConfig(explicitConfig, mergedArgs, mergedIgnore, ctx);
    return;
  }

  await addResolvedProject(ctx, objectRoot, {
    explicitName: entry.name,
    configFile: explicitConfig,
    inheritedArgs,
    localArgs,
  });
}

function buildGraph(projects: RunnerProject[]): RunnerGraph {
  const dependencyMap = new Map<string, string[]>(
    projects.map((project) => [
      project.name,
      Array.from(new Set([...project.dependencies, ...project.inferredDependencies])).sort((a, b) =>
        a.localeCompare(b)
      ),
    ]),
  );

  const nodes = projects
    .map((project) => ({
      name: project.name,
      root: project.root,
      packageName: project.packageName,
      dependencies: [...project.dependencies].sort((a, b) => a.localeCompare(b)),
      inferredDependencies: [...project.inferredDependencies].sort((a, b) =>
        a.localeCompare(b)
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.root.localeCompare(b.root));

  const edgeReasonByPair = new Map<string, RunnerEdge['reason']>();
  for (const project of projects) {
    for (const dependency of project.dependencies) {
      const pair = `${dependency}=>${project.name}`;
      if (!edgeReasonByPair.has(pair)) {
        edgeReasonByPair.set(pair, 'manifest');
      }
    }
    for (const dependency of project.inferredDependencies) {
      const pair = `${dependency}=>${project.name}`;
      if (!edgeReasonByPair.has(pair)) {
        edgeReasonByPair.set(pair, 'inferred-import');
      }
    }
  }

  const edges = Array.from(edgeReasonByPair.entries())
    .map(([pair, reason]) => {
      const [from, to] = pair.split('=>');
      return { from, to, reason };
    })
    .sort(
      (a, b) =>
        a.from.localeCompare(b.from) ||
        a.to.localeCompare(b.to) ||
        a.reason.localeCompare(b.reason)
    );

  const byName = new Map(projects.map((project) => [project.name, project]));
  const dependents = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const project of projects) {
    indegree.set(project.name, dependencyMap.get(project.name)?.length ?? 0);
  }
  for (const edge of edges) {
    if (!byName.has(edge.from) || !byName.has(edge.to)) continue;
    const existing = dependents.get(edge.from) ?? [];
    existing.push(edge.to);
    dependents.set(edge.from, existing);
  }
  for (const list of dependents.values()) {
    list.sort((a, b) => a.localeCompare(b));
  }

  const topologicalOrder: string[] = [];
  const levels: string[][] = [];
  let ready = Array.from(indegree.entries())
    .filter(([, degree]) => degree === 0)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b));

  while (ready.length > 0) {
    const current = [...ready];
    levels.push(current);
    topologicalOrder.push(...current);
    const next: string[] = [];
    for (const name of current) {
      const children = dependents.get(name) ?? [];
      for (const child of children) {
        const nextDegree = (indegree.get(child) ?? 0) - 1;
        indegree.set(child, nextDegree);
        if (nextDegree === 0) next.push(child);
      }
    }
    ready = Array.from(new Set(next)).sort((a, b) => a.localeCompare(b));
  }

  const unresolved = new Set(
    Array.from(indegree.entries())
      .filter(([, degree]) => degree > 0)
      .map(([name]) => name),
  );
  const cycles = unresolved.size === 0 ? [] : findCycles(dependencyMap, unresolved);

  return { nodes, edges, topologicalOrder, levels, cycles };
}

function findCycles(dependencyMap: Map<string, string[]>, unresolved: Set<string>): string[][] {
  const indexByNode = new Map<string, number>();
  const lowLinkByNode = new Map<string, number>();
  const stack: string[] = [];
  const inStack = new Set<string>();
  let index = 0;
  const stronglyConnectedComponents: string[][] = [];

  const strongConnect = (node: string) => {
    indexByNode.set(node, index);
    lowLinkByNode.set(node, index);
    index += 1;
    stack.push(node);
    inStack.add(node);

    const dependencies = dependencyMap.get(node) ?? [];
    for (const dependency of dependencies) {
      if (!unresolved.has(dependency)) continue;
      if (!indexByNode.has(dependency)) {
        strongConnect(dependency);
        lowLinkByNode.set(
          node,
          Math.min(lowLinkByNode.get(node)!, lowLinkByNode.get(dependency)!),
        );
      } else if (inStack.has(dependency)) {
        lowLinkByNode.set(
          node,
          Math.min(lowLinkByNode.get(node)!, indexByNode.get(dependency)!),
        );
      }
    }

    if (lowLinkByNode.get(node) === indexByNode.get(node)) {
      const component: string[] = [];
      while (stack.length > 0) {
        const popped = stack.pop()!;
        inStack.delete(popped);
        component.push(popped);
        if (popped === node) break;
      }
      stronglyConnectedComponents.push(component.sort((a, b) => a.localeCompare(b)));
    }
  };

  for (const node of unresolved) {
    if (!indexByNode.has(node)) {
      strongConnect(node);
    }
  }

  return stronglyConnectedComponents
    .filter((component) => {
      if (component.length > 1) return true;
      const single = component[0];
      const deps = dependencyMap.get(single) ?? [];
      return deps.includes(single);
    })
    .sort((a, b) => a[0].localeCompare(b[0]));
}

async function inferImportDependencies(
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
      if (
        !project.dependencies.includes(dep) &&
        !project.inferredDependencies.includes(dep)
      ) {
        project.inferredDependencies.push(dep);
      }
    }

    project.inferredDependencies = Array.from(new Set(project.inferredDependencies)).sort((a, b) =>
      a.localeCompare(b)
    );
  }

}

export async function resolveRunnerWorkspace(
  options: ResolveRunnerWorkspaceOptions = {},
): Promise<ResolvedRunnerWorkspace> {
  const rootDir = normalizePath(options.rootDir ?? process.cwd());
  const configPath = options.configPath
    ? normalizePath(path.isAbsolute(options.configPath) ? options.configPath : path.join(rootDir, options.configPath))
    : await detectRunnerConfig(rootDir);
  if (configPath && isUnsupportedRunnerConfigFile(configPath)) {
    throw unsupportedRunnerConfigError(configPath);
  }

  const ctx: CollectContext = {
    dedupeByRoot: new Map(),
    dedupeByName: new Map(),
    visitedConfigPaths: new Set(),
  };

  if (configPath) {
    await collectProjectsFromConfig(configPath, [], [], ctx);
  } else {
    await addResolvedProject(ctx, rootDir, { inheritedArgs: [] });
  }

  const projects = Array.from(ctx.dedupeByRoot.values())
    .map((project) => ({
      ...project,
      dependencies: Array.from(project.dependencies),
      inferredDependencies: Array.from(project.inferredDependencies),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.root.localeCompare(b.root));

  const packageToName = buildPackageNameToProjectNameMap(projects);

  for (const project of projects) {
    const localDependencies = project.dependencyPackageNames
      .map((dependencyPackageName) => packageToName.get(dependencyPackageName))
      .filter((value): value is string => Boolean(value) && value !== project.name);
    project.dependencies = Array.from(new Set(localDependencies)).sort((a, b) =>
      a.localeCompare(b)
    );
  }

  if (options.includeInferredImports !== false) {
    const maxImportScanFiles = options.inferImportMaxFiles === undefined
      ? parseInferImportMaxFiles()
      : validateInferImportMaxFilesOption(options.inferImportMaxFiles);
    await inferImportDependencies(projects, maxImportScanFiles);
  }

  const projectFilters = options.projectFilters ?? [];
  const filtered = applyProjectFilters(projects, projectFilters);
  const selected = options.includeDependenciesForFiltered
    ? includeDependencyClosure(projects, filtered)
    : filtered;
  const selectedSet = new Set(selected.map((project) => project.name));
  const scopedProjects = projects
    .filter((project) => selectedSet.has(project.name))
    .map((project) => ({
      ...project,
      dependencies: project.dependencies.filter((dep) => selectedSet.has(dep)),
      inferredDependencies: project.inferredDependencies.filter((dep) => selectedSet.has(dep)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.root.localeCompare(b.root));

  const graph = buildGraph(scopedProjects);
  return {
    rootDir,
    configPath,
    projects: scopedProjects,
    graph,
  };
}

export function ensureAcyclicGraph(graph: RunnerGraph): void {
  if (graph.cycles.length === 0) return;
  const cycleText = graph.cycles.map((cycle) => cycle.join(' -> ')).join('; ');
  throw new Error(`Circular project dependencies detected: ${cycleText}`);
}

export function projectSummaries(
  projects: RunnerProject[],
  rootDir: string,
): Array<{
  name: string;
  root: string;
  config: string;
  args: string[];
  packageName?: string;
  dependencies: string[];
  inferredDependencies: string[];
}> {
  return projects.map((project) => ({
    name: project.name,
    root: toDisplayPath(project.root, rootDir),
    config: project.configFile ? toDisplayPath(project.configFile, rootDir) : '(auto)',
    args: project.args,
    packageName: project.packageName,
    dependencies: [...project.dependencies].sort((a, b) => a.localeCompare(b)),
    inferredDependencies: [...project.inferredDependencies].sort((a, b) => a.localeCompare(b)),
  }));
}

export function buildExecutionOrder(
  projects: RunnerProject[],
  graph: RunnerGraph,
): RunnerProject[] {
  const byName = new Map(projects.map((project) => [project.name, project]));
  return graph.topologicalOrder
    .map((name) => byName.get(name))
    .filter((project): project is RunnerProject => Boolean(project));
}
