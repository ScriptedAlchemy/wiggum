import type { RunnerGraph, RunnerProject } from './types.js';

export function buildGraph(projects: RunnerProject[]): RunnerGraph {
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

  const edgeReasonByPair = new Map<string, 'manifest' | 'inferred-import'>();
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
        a.from.localeCompare(b.from)
        || a.to.localeCompare(b.to)
        || a.reason.localeCompare(b.reason),
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
