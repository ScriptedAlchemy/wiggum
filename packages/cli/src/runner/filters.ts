import type { RunnerProject } from './types.js';

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  const wildcarded = escaped.split('*').join('.*');
  return new RegExp(`^${wildcarded}$`, 'i');
}

export function applyProjectFilters(projects: RunnerProject[], filters: string[]): RunnerProject[] {
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
      positiveRegs.length === 0
      || positiveRegs.some((reg) => candidates.some((candidate) => reg.test(candidate)));
    const negativeMatch = negativeRegs.some((reg) =>
      candidates.some((candidate) => reg.test(candidate))
    );
    return positiveMatch && !negativeMatch;
  });

  if (filtered.length === 0) {
    throw new Error(`No projects matched filters: ${filters.join(', ')}.`);
  }

  return filtered;
}

export function includeDependencyClosure(
  allProjects: RunnerProject[],
  selectedProjects: RunnerProject[],
): RunnerProject[] {
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
