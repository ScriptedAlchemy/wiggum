import { promises as fsp } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import fastGlob from 'fast-glob';
import {
  SUPPORTED_RUNNER_CONFIG_FILES,
  UNSUPPORTED_RUNNER_CONFIG_FILES,
  formatSupportedRunnerConfigFiles,
} from './runner-metadata.js';
import { applyProjectFilters, includeDependencyClosure } from './runner/filters.js';
import { buildGraph } from './runner/graph.js';
import {
  inferImportDependencies,
  parseInferImportMaxFiles,
  validateInferImportMaxFilesOption,
} from './runner/import-inference.js';
import {
  buildPackageNameToProjectNameMap,
  readPackageInfo,
} from './runner/manifest-dependencies.js';
import type {
  CollectContext,
  MutableProject,
  ResolveRunnerWorkspaceOptions,
  ResolvedRunnerWorkspace,
  RunnerConfig,
  RunnerConfigEntry,
  RunnerGraph,
  RunnerProject,
} from './runner/types.js';
import {
  normalizePath,
  normalizeStringArray,
  pathExists,
  readJsonFile,
  replaceRootToken,
  resolveFromRoot,
  toDisplayPath,
} from './runner/utils.js';

export type {
  ResolveRunnerWorkspaceOptions,
  ResolvedRunnerWorkspace,
  RunnerConfig,
  RunnerConfigEntry,
  RunnerEdge,
  RunnerGraph,
  RunnerProject,
  RunnerProjectEntry,
} from './runner/types.js';

const fg = fastGlob;
type FastGlobWithHelpers = typeof fastGlob & {
  isDynamicPattern: (pattern: string) => boolean;
};
const { isDynamicPattern } = fastGlob as FastGlobWithHelpers;

const PROJECT_CONFIG_RE = /(?:^|\/)(?:rslib|rsbuild|rspack|rspress|rstest|rslint)\.config\.(?:mjs|js|cjs|mts|cts|ts)$/;

function isRunnerConfigFile(filePath: string): boolean {
  const base = path.basename(filePath);
  return SUPPORTED_RUNNER_CONFIG_FILES.includes(base as typeof SUPPORTED_RUNNER_CONFIG_FILES[number]);
}

function isUnsupportedRunnerConfigFile(filePath: string): boolean {
  const base = path.basename(filePath);
  return UNSUPPORTED_RUNNER_CONFIG_FILES.includes(base as typeof UNSUPPORTED_RUNNER_CONFIG_FILES[number]);
}

function unsupportedRunnerConfigError(filePath: string): Error {
  return new Error(
    `Unsupported runner config file "${path.basename(filePath)}". Use one of: ${formatSupportedRunnerConfigFiles()}`,
  );
}

function isProjectConfigFile(filePath: string): boolean {
  return PROJECT_CONFIG_RE.test(filePath.split('\\').join('/'));
}

async function detectRunnerConfig(rootDir: string): Promise<string | undefined> {
  for (const fileName of SUPPORTED_RUNNER_CONFIG_FILES) {
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

async function inferNestedConfigFromDirectory(projectPath: string): Promise<string | undefined> {
  for (const candidate of SUPPORTED_RUNNER_CONFIG_FILES) {
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
  const packageInfo = await readPackageInfo(normalizedRoot, ctx.packageNameByPathCache);
  const fallbackName = path.basename(normalizedRoot);
  const projectName = options.explicitName ?? packageInfo.packageName ?? fallbackName;
  const combinedArgs = [...options.inheritedArgs, ...(options.localArgs ?? [])];

  const existingAtRoot = ctx.dedupeByRoot.get(normalizedRoot);
  if (existingAtRoot) {
    for (const arg of combinedArgs) {
      if (!existingAtRoot.args.includes(arg)) {
        existingAtRoot.args.push(arg);
      }
    }
    return;
  }

  const nameRoot = ctx.dedupeByName.get(projectName);
  if (nameRoot && nameRoot !== normalizedRoot) {
    throw new Error(
      `Duplicate project name "${projectName}" for roots "${nameRoot}" and "${normalizedRoot}".`,
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
  const mergedIgnore = [...inheritedIgnore, ...normalizeStringArray(config.ignore)];

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

export async function resolveRunnerWorkspace(
  options: ResolveRunnerWorkspaceOptions = {},
): Promise<ResolvedRunnerWorkspace> {
  const rootDir = normalizePath(options.rootDir ?? process.cwd());
  const configPath = options.configPath
    ? normalizePath(
        path.isAbsolute(options.configPath)
          ? options.configPath
          : path.join(rootDir, options.configPath),
      )
    : await detectRunnerConfig(rootDir);
  if (configPath && isUnsupportedRunnerConfigFile(configPath)) {
    throw unsupportedRunnerConfigError(configPath);
  }

  const ctx: CollectContext = {
    dedupeByRoot: new Map(),
    dedupeByName: new Map(),
    visitedConfigPaths: new Set(),
    packageNameByPathCache: new Map(),
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

  return {
    rootDir,
    configPath,
    projects: scopedProjects,
    graph: buildGraph(scopedProjects),
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
