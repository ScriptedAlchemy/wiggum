import chalk from 'chalk';
import { COMMAND_NAMES, type WiggumCommandName } from './command-registry.js';
import {
  DEFAULT_MAX_INFERRED_IMPORT_SCAN_FILES,
  formatSupportedRunnerConfigFiles,
  INFERRED_IMPORT_SCAN_ENV_VAR,
} from './runner-metadata.js';
import type { RunnerProject } from './runner.js';
import { projectSummaries } from './runner.js';

export interface RunnerFlags {
  configPath?: string;
  rootDir?: string;
  projectFilters: string[];
  parallel: number;
  dryRun: boolean;
  json: boolean;
  aiPrompt: boolean;
  includeInferredImports: boolean;
  runOnlyFlagsUsed: string[];
  passthroughArgs: string[];
}

export interface ParseRunnerFlagsOptions {
  useParallelEnv?: boolean;
}

export interface ParsedProjectsCommandArgs {
  subCommand: 'list' | 'graph';
  runnerArgs: string[];
}

export interface ParsedRunCommandArgs {
  task?: WiggumCommandName;
  runnerArgs: string[];
}

export const RUNNER_OPTIONS_REQUIRING_VALUE = new Set([
  '--project',
  '-p',
  '--config',
  '--root',
  '--parallel',
  '--concurrency',
]);

function splitListValue(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseRunnerFlags(
  args: string[],
  options: ParseRunnerFlagsOptions = {},
): RunnerFlags {
  const useParallelEnv = options.useParallelEnv ?? true;
  const parsePositiveIntegerFlag = (flagName: string, rawValue: string): number => {
    const normalizedValue = rawValue.trim();
    if (normalizedValue.length === 0) {
      throw new Error(`Missing value for ${flagName}`);
    }
    if (!/^\d+$/.test(normalizedValue)) {
      throw new Error(`Invalid ${flagName} value "${rawValue}"`);
    }
    const value = Number.parseInt(normalizedValue, 10);
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Invalid ${flagName} value "${rawValue}"`);
    }
    return value;
  };

  const defaultParallel = (() => {
    if (!useParallelEnv) {
      return 4;
    }
    const rawValue = process.env.WIGGUM_RUNNER_PARALLEL;
    if (rawValue === undefined || rawValue.trim().length === 0) {
      return 4;
    }
    const normalizedValue = rawValue.trim();
    try {
      return parsePositiveIntegerFlag('WIGGUM_RUNNER_PARALLEL', normalizedValue);
    } catch {
      throw new Error(
        `Invalid WIGGUM_RUNNER_PARALLEL value "${rawValue}". Expected a positive integer.`,
      );
    }
  })();

  const parsed: RunnerFlags = {
    projectFilters: [],
    parallel: defaultParallel,
    dryRun: false,
    json: false,
    aiPrompt: false,
    includeInferredImports: true,
    runOnlyFlagsUsed: [],
    passthroughArgs: [],
  };

  const trackRunOnlyFlag = (flagName: string) => {
    if (!parsed.runOnlyFlagsUsed.includes(flagName)) {
      parsed.runOnlyFlagsUsed.push(flagName);
    }
  };

  const parseProjectFilterValues = (rawValue: string, flagName: string): string[] => {
    const values = splitListValue(rawValue);
    if (values.length === 0) {
      throw new Error(`Missing value for ${flagName}`);
    }
    return values;
  };

  const parseRequiredOptionValue = (rawValue: string, flagName: string): string => {
    const normalizedValue = rawValue.trim();
    if (normalizedValue.length === 0) {
      throw new Error(`Missing value for ${flagName}`);
    }
    return normalizedValue;
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') {
      parsed.passthroughArgs.push(...args.slice(i + 1));
      break;
    }
    if (arg === '--project' || arg === '-p') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error(`Missing value for ${arg}`);
      }
      parsed.projectFilters.push(...parseProjectFilterValues(value, arg));
      i++;
      continue;
    }
    if (arg.startsWith('--project=')) {
      parsed.projectFilters.push(
        ...parseProjectFilterValues(arg.slice('--project='.length), '--project'),
      );
      continue;
    }
    if (arg.startsWith('-p=')) {
      parsed.projectFilters.push(...parseProjectFilterValues(arg.slice('-p='.length), '-p'));
      continue;
    }
    if (arg === '--config') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('Missing value for --config');
      }
      parsed.configPath = parseRequiredOptionValue(value, '--config');
      i++;
      continue;
    }
    if (arg.startsWith('--config=')) {
      parsed.configPath = parseRequiredOptionValue(arg.slice('--config='.length), '--config');
      continue;
    }
    if (arg === '--root') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('Missing value for --root');
      }
      parsed.rootDir = parseRequiredOptionValue(value, '--root');
      i++;
      continue;
    }
    if (arg.startsWith('--root=')) {
      parsed.rootDir = parseRequiredOptionValue(arg.slice('--root='.length), '--root');
      continue;
    }
    if (arg === '--parallel' || arg === '--concurrency') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error(`Missing value for ${arg}`);
      }
      parsed.parallel = parsePositiveIntegerFlag(arg, value);
      trackRunOnlyFlag(arg);
      i++;
      continue;
    }
    if (arg.startsWith('--parallel=')) {
      parsed.parallel = parsePositiveIntegerFlag('--parallel', arg.slice('--parallel='.length));
      trackRunOnlyFlag('--parallel');
      continue;
    }
    if (arg.startsWith('--concurrency=')) {
      parsed.parallel = parsePositiveIntegerFlag(
        '--concurrency',
        arg.slice('--concurrency='.length),
      );
      trackRunOnlyFlag('--concurrency');
      continue;
    }
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      trackRunOnlyFlag('--dry-run');
      continue;
    }
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--ai-prompt') {
      parsed.aiPrompt = true;
      trackRunOnlyFlag('--ai-prompt');
      continue;
    }
    if (arg === '--no-infer-imports') {
      parsed.includeInferredImports = false;
      continue;
    }

    parsed.passthroughArgs.push(arg);
  }

  return parsed;
}

export function hasHelpFlagBeforePassthrough(args: string[]): boolean {
  const boundary = args.indexOf('--');
  const parseSlice = boundary === -1 ? args : args.slice(0, boundary);

  for (let i = 0; i < parseSlice.length; i++) {
    const arg = parseSlice[i];
    if (arg === '--help' || arg === '-h' || arg === 'help') {
      return true;
    }
    if (RUNNER_OPTIONS_REQUIRING_VALUE.has(arg)) {
      i += 1;
    }
  }
  return false;
}

export function parseProjectsCommandArgs(args: string[]): ParsedProjectsCommandArgs {
  const boundary = args.indexOf('--');
  const parseBoundary = boundary === -1 ? args.length : boundary;

  let subCommand: 'list' | 'graph' | undefined;
  let subCommandIndex = -1;
  let firstPositionalCandidate: string | undefined;
  let firstPositionalIndex = -1;
  let expectValue = false;

  for (let i = 0; i < parseBoundary; i++) {
    const arg = args[i];
    if (expectValue) {
      expectValue = false;
      continue;
    }
    if (RUNNER_OPTIONS_REQUIRING_VALUE.has(arg)) {
      expectValue = true;
      continue;
    }
    if (!arg.startsWith('-') && !subCommand && !firstPositionalCandidate) {
      firstPositionalCandidate = arg;
      firstPositionalIndex = i;
    }
    if (arg === 'list' || arg === 'graph') {
      if (subCommand && subCommand !== arg) {
        throw new Error(`Conflicting projects subcommands: ${subCommand} and ${arg}`);
      }
      if (subCommand && subCommand === arg) {
        throw new Error(`Duplicate projects subcommand token: ${arg}`);
      }
      subCommand = arg;
      subCommandIndex = i;
    }
  }

  if (
    subCommand
    && firstPositionalCandidate
    && firstPositionalCandidate !== subCommand
    && firstPositionalIndex >= 0
    && firstPositionalIndex < subCommandIndex
  ) {
    throw new Error(`Unknown projects subcommand: ${firstPositionalCandidate}`);
  }

  if (!subCommand && firstPositionalCandidate) {
    throw new Error(`Unknown projects subcommand: ${firstPositionalCandidate}`);
  }

  return {
    subCommand: subCommand ?? 'list',
    runnerArgs:
      subCommandIndex >= 0
        ? [...args.slice(0, subCommandIndex), ...args.slice(subCommandIndex + 1)]
        : [...args],
  };
}

export function parseRunCommandArgs(args: string[]): ParsedRunCommandArgs {
  const boundary = args.indexOf('--');
  const parseBoundary = boundary === -1 ? args.length : boundary;
  const supportedTasks = new Set(COMMAND_NAMES);

  let task: WiggumCommandName | undefined;
  let taskIndex = -1;
  let firstPositionalCandidate: string | undefined;
  let firstPositionalIndex = -1;
  let expectValue = false;

  for (let i = 0; i < parseBoundary; i++) {
    const arg = args[i];
    if (expectValue) {
      expectValue = false;
      continue;
    }
    if (RUNNER_OPTIONS_REQUIRING_VALUE.has(arg)) {
      expectValue = true;
      continue;
    }
    if (!arg.startsWith('-') && !task && !firstPositionalCandidate) {
      firstPositionalCandidate = arg;
      firstPositionalIndex = i;
    }
    if (supportedTasks.has(arg as WiggumCommandName)) {
      task = arg as WiggumCommandName;
      taskIndex = i;
      break;
    }
  }

  if (
    task
    && firstPositionalCandidate
    && firstPositionalCandidate !== task
    && firstPositionalIndex >= 0
    && firstPositionalIndex < taskIndex
  ) {
    throw new Error(`Unsupported runner task: ${firstPositionalCandidate}`);
  }

  if (!task && firstPositionalCandidate) {
    throw new Error(`Unsupported runner task: ${firstPositionalCandidate}`);
  }

  return {
    task,
    runnerArgs: taskIndex >= 0
      ? [...args.slice(0, taskIndex), ...args.slice(taskIndex + 1)]
      : [...args],
  };
}

export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const size = Math.max(1, Math.min(concurrency, items.length));
  let cursor = 0;

  const runners = Array.from({ length: size }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      await worker(items[currentIndex]!);
    }
  });

  await Promise.all(runners);
}

export function renderProjectList(
  projects: RunnerProject[],
  rootDir: string,
  configPath?: string,
): void {
  if (configPath) {
    console.log(chalk.gray(`Config: ${configPath}`));
  }
  console.log(chalk.cyan(`Resolved ${projects.length} project(s):`));
  for (const summary of projectSummaries(projects, rootDir)) {
    console.log(`- ${summary.name}`);
    console.log(`  root: ${summary.root}`);
    if (summary.config !== '(auto)') {
      console.log(`  config: ${summary.config}`);
    }
    if (summary.dependencies.length > 0) {
      console.log(`  dependencies: ${summary.dependencies.join(', ')}`);
    }
    if (summary.inferredDependencies.length > 0) {
      console.log(`  inferred: ${summary.inferredDependencies.join(', ')}`);
    }
    if (summary.args.length > 0) {
      console.log(`  args: ${summary.args.join(' ')}`);
    }
  }
}

export function printProjectsHelp(): void {
  console.log(`
Usage: wiggum projects [list|graph] [runner options]

Subcommands:
  list       Show resolved projects (default)
  graph      Show resolved projects and dependency graph

Runner options:
  --root <path>            Workspace root to resolve from
  --config <path>          Explicit runner config path
  --project <pattern>      Include/exclude projects (supports * and !negation)
  -p <pattern>             Alias for --project (also supports -p=<pattern>)
  --json                   Emit machine-readable JSON output
  --no-infer-imports       Disable inferred import dependency edges

Notes:
  Supported runner config files: ${formatSupportedRunnerConfigFiles()}.
  Inferred import scan budget can be set via ${INFERRED_IMPORT_SCAN_ENV_VAR}=<positive integer> (default: ${DEFAULT_MAX_INFERRED_IMPORT_SCAN_FILES}).
  The scan budget is ignored when --no-infer-imports is enabled.
`);
}

export function printRunHelp(): void {
  console.log(`
Usage: wiggum run <task> [runner options] [-- task args]

Supported tasks:
  ${COMMAND_NAMES.join(', ')}

Runner options:
  --root <path>            Workspace root to resolve from
  --config <path>          Explicit runner config path
  --project <pattern>      Include/exclude projects (supports * and !negation)
  -p <pattern>             Alias for --project (also supports -p=<pattern>)
  --parallel <count>       Max concurrent project runs per level
  --concurrency <count>    Alias for --parallel
  --dry-run                Print execution plan without running commands
  --json                   Emit JSON plan (requires --dry-run)
  --ai-prompt              Print AI remediation prompt on failure
  --autofix                Launch OpenCode autofix flow on failures
  --no-infer-imports       Disable inferred import dependency edges

Notes:
  --ai-prompt and --autofix cannot be combined with --dry-run.
  Supported runner config files: ${formatSupportedRunnerConfigFiles()}.
  Default parallelism can be set via WIGGUM_RUNNER_PARALLEL=<positive integer>.
  Inferred import scan budget can be set via ${INFERRED_IMPORT_SCAN_ENV_VAR}=<positive integer> (default: ${DEFAULT_MAX_INFERRED_IMPORT_SCAN_FILES}).
  The scan budget is ignored when --no-infer-imports is enabled.

Pass task arguments after "--" so they are forwarded to the underlying tool.
`);
}
