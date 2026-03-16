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

export type MutableProject = Omit<RunnerProject, 'dependencies' | 'inferredDependencies'> & {
  dependencies: Set<string>;
  inferredDependencies: Set<string>;
};

export type CollectContext = {
  dedupeByRoot: Map<string, MutableProject>;
  dedupeByName: Map<string, string>;
  visitedConfigPaths: Set<string>;
  packageNameByPathCache: Map<string, string | undefined>;
};
