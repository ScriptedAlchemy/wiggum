import chalk from 'chalk';
import { execa } from 'execa';
import which from 'which';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createWiggumOpencodeTui, checkOpenCodeBinary, installOpenCode, runOpenCodeServer, runOpenCodeCommand, createOpenCodeConfig, showAgentHelp } from './agent.js';
import { getPackageManager as pmDetect, installPackageDev, getExecuteCommand, isPackageInstalled } from './pm.js';
import {
  resolveRunnerWorkspace,
  ensureAcyclicGraph,
  buildExecutionOrder,
  projectSummaries,
  type RunnerProject,
} from './runner.js';

type ResolvedRunnerWorkspace = Awaited<ReturnType<typeof resolveRunnerWorkspace>>;

// Types
interface PackageInfo {
  tool: string;
  packages: string[];
}

interface CommandMapping {
  [key: string]: PackageInfo;
}

interface CommandInvocation {
  command: string;
  args: string[];
}

interface CommandExecutionResult {
  toolName: string;
  command: string;
  args: string[];
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number | null | undefined;
}

interface ForwardCommandOptions {
  autofix?: boolean;
  cwd?: string;
  captureOutput?: boolean;
}

interface RunnerFailureContext extends CommandExecutionResult {
  project: string;
  message: string;
}

class CommandExecutionError extends Error {
  readonly result: CommandExecutionResult;

  constructor(result: CommandExecutionResult) {
    super(`Command "${result.toolName}" failed with exit code ${result.exitCode ?? 'unknown'}.`);
    this.name = 'CommandExecutionError';
    this.result = result;
  }
}

// Command mapping from unified commands to specific tools
// All tools use 'packages' array for consistency
const COMMAND_MAPPING: CommandMapping = {
  build: { tool: 'rsbuild', packages: ['@rsbuild/core'] },
  pack: { tool: 'rspack', packages: ['@rspack/cli', '@rspack/core'] },
  lint: { tool: 'rslint', packages: ['@rslint/core'] },
  lib: { tool: 'rslib', packages: ['@rslib/core'] },
  test: { tool: 'rstest', packages: ['@rstest/core'] },
  doc: { tool: 'rspress', packages: ['rspress'] },
  doctor: { tool: 'rsdoctor', packages: ['@rsdoctor/cli'] }
};

// Check if a package is installed
// isPackageInstalled moved to pm.ts

function hasInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function openAutofixSession(prompt: string): Promise<void> {
  const autofixMode = process.env.WIGGUM_AUTOFIX_MODE?.toLowerCase();
  if (autofixMode === 'prompt' || autofixMode === 'print') {
    console.log(chalk.yellow('[autofix] Prompt-only mode enabled.'));
    console.log(prompt);
    return;
  }

  if (!hasInteractiveTerminal()) {
    console.log(chalk.yellow('[autofix] Non-interactive terminal detected; printing prompt instead of launching TUI.'));
    console.log(prompt);
    return;
  }

  // Verify opencode exists
  try {
    await which('opencode');
  } catch {
    console.error(chalk.red('OpenCode is not installed'));
    console.log(chalk.yellow('Run "wiggum agent install" to install OpenCode'));
    process.exit(1);
  }

  // Launch TUI with inline config and prompt
  const tui = await createWiggumOpencodeTui({ prompt });

  // Keep session alive until interrupted
  process.once('SIGINT', () => {
    console.log(chalk.yellow('\nShutting down...'));
    tui.close();
    process.exit(0);
  });

  await new Promise(() => {});
}

// Handle autofix error by passing to OpenCode
async function handleAutofixError(
  toolName: string,
  args: string[],
  stdout: string,
  stderr: string,
  exitCode: number | null | undefined,
): Promise<void> {
  console.log(chalk.yellow(`\n${toolName} command failed with exit code ${exitCode}`));
  console.log(chalk.cyan('Opening OpenCode TUI with error context...\n'));

  const prompt = [
    `Command failed: wiggum ${toolName} ${args.join(' ')}`.trim(),
    `Exit code: ${exitCode}`,
    '',
    'Output:',
    stdout || '(no stdout)',
    '',
    'Errors:',
    stderr || '(no stderr)',
    '',
    'Please help me fix this error.',
  ].join('\n');

  await openAutofixSession(prompt);
}

function truncateForPrompt(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }
  const omitted = input.length - maxLength;
  return `${input.slice(0, maxLength)}\n... (${omitted} chars omitted)`;
}

async function handleRunnerAutofixError(
  task: string,
  runnerArgs: string[],
  workspace: ResolvedRunnerWorkspace,
  failures: RunnerFailureContext[],
): Promise<void> {
  console.log(chalk.yellow(`\nRunner task "${task}" failed on ${failures.length} project(s).`));
  console.log(chalk.cyan('Opening OpenCode TUI with project failure context...\n'));

  const prompt = buildRunnerFailurePrompt(task, runnerArgs, workspace, failures);
  await openAutofixSession(prompt);
}

function buildRunnerFailurePrompt(
  task: string,
  runnerArgs: string[],
  workspace: ResolvedRunnerWorkspace,
  failures: RunnerFailureContext[],
): string {
  const levelSummary = workspace.graph.levels
    .map((level, index) => `L${index + 1}[${level.join(', ')}]`)
    .join(' ');
  const failedProjectSet = new Set(failures.map((failure) => failure.project));
  const failureEdges = workspace.graph.edges.filter(
    (edge) => failedProjectSet.has(edge.from) || failedProjectSet.has(edge.to),
  );
  const rerunArgs = ['run', task, '--project', failures.map((failure) => failure.project).join(',')];
  if (runnerArgs.length > 0) {
    rerunArgs.push('--', ...runnerArgs);
  }

  const failureSections = failures
    .map((failure) =>
      [
        `Project: ${failure.project}`,
        `Command: ${failure.command} ${failure.args.join(' ')}`.trim(),
        `Working directory: ${failure.cwd}`,
        `Exit code: ${failure.exitCode ?? 'unknown'}`,
        `Error summary: ${truncateForPrompt(failure.message, 600)}`,
        '',
        'Captured stdout:',
        truncateForPrompt(failure.stdout || '(no stdout)', 4000),
        '',
        'Captured stderr:',
        truncateForPrompt(failure.stderr || '(no stderr)', 4000),
      ].join('\n'),
    )
    .join('\n\n----\n\n');

  const prompt = [
    `Runner command failed: wiggum run ${task} ${runnerArgs.join(' ')}`.trim(),
    `Failed projects (${failures.length}): ${failures.map((failure) => failure.project).join(', ')}`,
    '',
    'Runner graph levels:',
    levelSummary || '(none)',
    '',
    'Relevant graph edges:',
    failureEdges.length > 0
      ? failureEdges
          .map((edge) => `${edge.from} <- ${edge.to} (${edge.reason})`)
          .join('\n')
      : '(none)',
    '',
    'Failure diagnostics by project:',
    failureSections || '(no details)',
    '',
    'Suggested rerun command:',
    `wiggum ${rerunArgs.join(' ')}`,
    '',
    'Please diagnose the root cause and propose concrete fixes.',
  ].join('\n');

  return prompt;
}

// Get package manager (with caching to avoid duplicate detection)
async function getPackageManager(silent: boolean = false): Promise<string> {
  try {
    const pm = await pmDetect();
    if (!silent) console.log(chalk.blue(`Detected package manager: ${pm}`));
    return pm;
  } catch {
    if (!silent) console.log(chalk.yellow('Could not detect package manager, defaulting to npm'));
    return 'npm';
  }
}

// Install package using detected package manager
async function installPackage(packageName: string, packageManager: string): Promise<boolean> {
  const ok = await installPackageDev(packageName, packageManager);
  if (!ok) {
    console.error(chalk.red(`Please install ${packageName} manually using your package manager.`));
  }
  return ok;
}

function writeCapturedOutput(stream: NodeJS.WriteStream, value: string): void {
  if (!value) return;
  stream.write(value.endsWith('\n') ? value : `${value}\n`);
}

async function resolveCommandInvocation(
  toolName: string,
  originalArgs: string[],
  packageInfo: PackageInfo,
): Promise<CommandInvocation> {
  const toolPath = await which(toolName).catch(() => null);
  if (toolPath) {
    return {
      command: toolName,
      args: originalArgs,
    };
  }

  const isVersionOrHelp = originalArgs.some((arg) =>
    ['--version', '-v', '--help', '-h'].includes(arg),
  );
  const packageManager = await getPackageManager(isVersionOrHelp);
  const missingPackages = packageInfo.packages.filter((pkg) => !isPackageInstalled(pkg));
  if (missingPackages.length > 0) {
    console.log(
      chalk.yellow(
        `${toolName} not found, installing required packages: ${missingPackages.join(', ')}...`,
      ),
    );
    for (const pkg of missingPackages) {
      const success = await installPackage(pkg, packageManager);
      if (!success) {
        process.exit(1);
      }
    }
  }

  const executablePackage =
    packageInfo.packages.find((pkg) => pkg.includes('cli')) || packageInfo.packages[0];
  const dlxArgs = [executablePackage, ...originalArgs];
  const execCommand = getExecuteCommand(packageManager as any, dlxArgs);
  if (!execCommand) {
    throw new Error('Could not resolve package manager execute command');
  }

  if (!isVersionOrHelp) {
    console.log(chalk.blue(`Executing: ${execCommand.command} ${execCommand.args.join(' ')}`));
  }

  return {
    command: execCommand.command,
    args: execCommand.args,
  };
}

// Forward command to the appropriate tool
async function forwardCommand(
  toolName: string,
  originalArgs: string[],
  packageInfo: PackageInfo,
  options: ForwardCommandOptions = {},
): Promise<CommandExecutionResult> {
  const { autofix = false, cwd = process.cwd(), captureOutput = autofix } = options;

  try {
    const invocation = await resolveCommandInvocation(toolName, originalArgs, packageInfo);
    const result = await execa(invocation.command, invocation.args, {
      cwd,
      reject: false,
      stdio: captureOutput ? 'pipe' : 'inherit',
    });
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';

    if (captureOutput) {
      writeCapturedOutput(process.stdout, stdout);
      writeCapturedOutput(process.stderr, stderr);
    }

    const execution: CommandExecutionResult = {
      toolName,
      command: invocation.command,
      args: invocation.args,
      cwd,
      stdout,
      stderr,
      exitCode: result.exitCode,
    };

    if (execution.exitCode !== 0) {
      if (autofix) {
        await handleAutofixError(
          toolName,
          originalArgs,
          execution.stdout,
          execution.stderr,
          execution.exitCode,
        );
      }
      throw new CommandExecutionError(execution);
    }

    return execution;
  } catch (error: unknown) {
    if (error instanceof CommandExecutionError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (autofix) {
      await handleAutofixError(toolName, originalArgs, '', message, 1);
    }
    throw new Error(`Error executing ${toolName}: ${message}`);
  }
}

// Handle unified commands - SIMPLIFIED PASSTHROUGH
async function handleUnifiedCommand(command: string, args: string[], autofix: boolean = false): Promise<void> {
  const mapping = COMMAND_MAPPING[command];
  
  if (!mapping) {
    console.error(chalk.red(`Unknown command: ${command}`));
    process.exit(1);
  }
  
  const { tool } = mapping;
  
  // SIMPLE PASSTHROUGH: wiggum <command> [args] → <tool> [args]
  // Just pass all arguments directly to the tool
  await forwardCommand(tool, args, mapping, { autofix });
}

// Get package version
function getPackageVersion(): string {
  try {
    // __dirname is not available in ESM; reconstruct from import.meta.url
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version;
  } catch {
    return '1.0.0';
  }
}

interface RunnerFlags {
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

interface ParseRunnerFlagsOptions {
  useParallelEnv?: boolean;
}

function splitListValue(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseRunnerFlags(args: string[], options: ParseRunnerFlagsOptions = {}): RunnerFlags {
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
      parsed.projectFilters.push(
        ...parseProjectFilterValues(arg.slice('-p='.length), '-p'),
      );
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
      const parsedNumber = parsePositiveIntegerFlag(arg, value);
      parsed.parallel = parsedNumber;
      trackRunOnlyFlag(arg);
      i++;
      continue;
    }
    if (arg.startsWith('--parallel=')) {
      const rawValue = arg.slice('--parallel='.length);
      const value = parsePositiveIntegerFlag('--parallel', rawValue);
      parsed.parallel = value;
      trackRunOnlyFlag('--parallel');
      continue;
    }
    if (arg.startsWith('--concurrency=')) {
      const rawValue = arg.slice('--concurrency='.length);
      const value = parsePositiveIntegerFlag('--concurrency', rawValue);
      parsed.parallel = value;
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

function hasHelpFlagBeforePassthrough(args: string[]): boolean {
  const boundary = args.indexOf('--');
  const parseSlice = boundary === -1 ? args : args.slice(0, boundary);
  const flagsRequiringValue = RUNNER_OPTIONS_REQUIRING_VALUE;

  for (let i = 0; i < parseSlice.length; i++) {
    const arg = parseSlice[i];
    if (arg === '--help' || arg === '-h' || arg === 'help') {
      return true;
    }
    if (flagsRequiringValue.has(arg)) {
      i += 1;
    }
  }
  return false;
}

function parseProjectsCommandArgs(args: string[]): {
  subCommand: 'list' | 'graph';
  runnerArgs: string[];
} {
  const boundary = args.indexOf('--');
  const parseBoundary = boundary === -1 ? args.length : boundary;
  const flagsRequiringValue = RUNNER_OPTIONS_REQUIRING_VALUE;

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
    if (flagsRequiringValue.has(arg)) {
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

  const normalizedSubCommand = subCommand ?? 'list';
  const runnerArgs = subCommandIndex >= 0
    ? [...args.slice(0, subCommandIndex), ...args.slice(subCommandIndex + 1)]
    : [...args];

  return {
    subCommand: normalizedSubCommand,
    runnerArgs,
  };
}

const RUNNER_OPTIONS_REQUIRING_VALUE = new Set([
  '--project',
  '-p',
  '--config',
  '--root',
  '--parallel',
  '--concurrency',
]);

function parseRunCommandArgs(args: string[]): {
  task?: string;
  runnerArgs: string[];
} {
  const boundary = args.indexOf('--');
  const parseBoundary = boundary === -1 ? args.length : boundary;
  const supportedTasks = new Set(Object.keys(COMMAND_MAPPING));

  let task: string | undefined;
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
    if (supportedTasks.has(arg)) {
      task = arg;
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

  const runnerArgs = taskIndex >= 0
    ? [...args.slice(0, taskIndex), ...args.slice(taskIndex + 1)]
    : [...args];

  return {
    task,
    runnerArgs,
  };
}

async function runWithConcurrency<T>(
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

function renderProjectList(
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

function printProjectsHelp(): void {
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
  Inferred import scan budget can be set via WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES=<positive integer> (default: 400).
  The scan budget is ignored when --no-infer-imports is enabled.
`);
}

function printRunHelp(): void {
  console.log(`
Usage: wiggum run <task> [runner options] [-- task args]

Supported tasks:
  ${Object.keys(COMMAND_MAPPING).join(', ')}

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
  Default parallelism can be set via WIGGUM_RUNNER_PARALLEL=<positive integer>.
  Inferred import scan budget can be set via WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES=<positive integer> (default: 400).
  The scan budget is ignored when --no-infer-imports is enabled.

Pass task arguments after "--" so they are forwarded to the underlying tool.
`);
}

function printAgentServeHelp(): void {
  console.log(`
Usage: wiggum agent serve [--port <1-65535>] [--hostname <host>]
       wiggum agent serve [-p <1-65535>] [-H <host>]

Options:
  --port <port>            Server port (must be 1-65535)
  -p <port>                Alias for --port
  --port=<port>            Equals-form alias for --port
  -p=<port>                Equals-form alias for --port
  --hostname <host>        Server hostname
  --hostname=<host>        Equals-form server hostname
  --host <host>            Alias for --hostname
  --host=<host>            Equals-form alias for --hostname
  -H <host>                Alias for --hostname
  -H=<host>                Equals-form alias for --hostname
  --help, -h               Show serve-specific help
`);
}

interface ParsedAgentServeArgs {
  help: boolean;
  portRaw?: string;
  hostnameRaw?: string;
}

function extractGlobalAutofixArgs(args: string[]): {
  autofix: boolean;
  filteredArgs: string[];
} {
  let autofix = false;
  let filteredArgs = [...args];
  const passthroughBoundary = args.indexOf('--');
  const parseBoundary = passthroughBoundary === -1 ? args.length : passthroughBoundary;
  const parseSlice = args.slice(0, parseBoundary);
  const commandIndex = parseSlice.findIndex((arg) => !arg.startsWith('-'));
  const commandCandidate = commandIndex >= 0 ? parseSlice[commandIndex] : undefined;
  const filteredPrefix: string[] = [];

  for (let i = 0; i < parseBoundary; i++) {
    const arg = args[i];
    const isBeforeCommandToken = commandIndex === -1 || i < commandIndex;
    const shouldTreatAsGlobalAutofix = isBeforeCommandToken || commandCandidate !== 'agent';
    if (arg === '--autofix' && shouldTreatAsGlobalAutofix) {
      autofix = true;
      continue;
    }
    filteredPrefix.push(arg);
  }

  if (parseBoundary < args.length) {
    filteredArgs = [...filteredPrefix, ...args.slice(parseBoundary)];
  } else {
    filteredArgs = filteredPrefix;
  }

  return {
    autofix,
    filteredArgs,
  };
}

function parseAgentServeArgs(argsArr: string[]): ParsedAgentServeArgs {
  const parsed: ParsedAgentServeArgs = {
    help: false,
  };

  for (let i = 0; i < argsArr.length; i++) {
    const arg = argsArr[i];
    if (arg === '--help' || arg === '-h') {
      return {
        help: true,
      };
    }
    if (arg === '--port' || arg === '-p') {
      const value = argsArr[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('Missing value for --port');
      }
      if (parsed.portRaw !== undefined) {
        throw new Error('Duplicate --port option provided.');
      }
      parsed.portRaw = value;
      i++;
      continue;
    }
    if (arg.startsWith('-p=')) {
      if (parsed.portRaw !== undefined) {
        throw new Error('Duplicate --port option provided.');
      }
      parsed.portRaw = arg.slice('-p='.length);
      continue;
    }
    if (arg.startsWith('--port=')) {
      if (parsed.portRaw !== undefined) {
        throw new Error('Duplicate --port option provided.');
      }
      parsed.portRaw = arg.slice('--port='.length);
      continue;
    }
    if (arg === '--hostname' || arg === '-H') {
      const value = argsArr[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('Missing value for --hostname');
      }
      if (parsed.hostnameRaw !== undefined) {
        throw new Error('Duplicate --hostname option provided.');
      }
      parsed.hostnameRaw = value;
      i++;
      continue;
    }
    if (arg.startsWith('-H=')) {
      if (parsed.hostnameRaw !== undefined) {
        throw new Error('Duplicate --hostname option provided.');
      }
      parsed.hostnameRaw = arg.slice('-H='.length);
      continue;
    }
    if (arg === '--host') {
      const value = argsArr[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('Missing value for --hostname');
      }
      if (parsed.hostnameRaw !== undefined) {
        throw new Error('Duplicate --hostname option provided.');
      }
      parsed.hostnameRaw = value;
      i++;
      continue;
    }
    if (arg.startsWith('--hostname=')) {
      if (parsed.hostnameRaw !== undefined) {
        throw new Error('Duplicate --hostname option provided.');
      }
      parsed.hostnameRaw = arg.slice('--hostname='.length);
      continue;
    }
    if (arg.startsWith('--host=')) {
      if (parsed.hostnameRaw !== undefined) {
        throw new Error('Duplicate --hostname option provided.');
      }
      parsed.hostnameRaw = arg.slice('--host='.length);
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown serve option: ${arg}`);
    }
    throw new Error(`Unexpected serve argument: ${arg}`);
  }

  return parsed;
}

// Main CLI execution
async function main() {
  // Simple CLI argument parsing
  const args = process.argv.slice(2);
  const { autofix, filteredArgs } = extractGlobalAutofixArgs(args);
  
  const command = filteredArgs[0];
  const commandArgs = filteredArgs.slice(1);

  // Show help with --help flag (standard convention)
  if (command === '--help' || command === '-h') {
    console.log(`
Usage: wiggum <command> [options]

Commands:
  build      Build with Rsbuild
  pack       Bundle with Rspack
  lint       Lint with Rslint
  lib        Build library with Rslib
  test       Test with Rstest
  doc        Documentation with Rspress
  doctor     Analyze with Rsdoctor
  run        Run a task across runner projects
  projects   List or graph runner projects
  agent      OpenCode AI agent integration

This is a passthrough CLI - all flags and options are forwarded to the underlying tools.
Use "wiggum <command> --help" to see help for a specific command.
Global options:
  --autofix   Enable OpenCode autofix flow for command failures
`);
    process.exit(0);
  }

  // Show version
  if (command === '--version' || command === '-v') {
    console.log(`wiggum v${getPackageVersion()}`);
    process.exit(0);
  }

  // No command provided - show minimal usage
  if (!command) {
    console.log('Usage: wiggum <command> [options]');
    console.log('Run "wiggum --help" for available commands.');
    process.exit(1);
  }

  if (command === 'projects') {
    const firstProjectsArg = commandArgs[0];
    if (firstProjectsArg === '--help' || firstProjectsArg === '-h' || firstProjectsArg === 'help') {
      printProjectsHelp();
      process.exit(0);
    }
    if (autofix) {
      console.error(chalk.red('Global option --autofix is not supported for "wiggum projects".'));
      printProjectsHelp();
      process.exit(1);
    }

    if (
      firstProjectsArg &&
      !firstProjectsArg.startsWith('-') &&
      firstProjectsArg !== 'list' &&
      firstProjectsArg !== 'graph'
    ) {
      console.error(chalk.red(`Unknown projects subcommand: ${firstProjectsArg}`));
      printProjectsHelp();
      process.exit(1);
    }
    const projectsHelpRequested = hasHelpFlagBeforePassthrough(commandArgs);

    let parsedProjectsArgs: {
      subCommand: 'list' | 'graph';
      runnerArgs: string[];
    };
    try {
      parsedProjectsArgs = parseProjectsCommandArgs(commandArgs);
    } catch (error: any) {
      const errorMessage = error?.message ?? String(error);
      if (projectsHelpRequested && errorMessage === 'Unknown projects subcommand: help') {
        printProjectsHelp();
        process.exit(0);
      }
      console.error(chalk.red('Invalid projects command:'), error.message ?? error);
      printProjectsHelp();
      process.exit(1);
      return;
    }
    if (projectsHelpRequested) {
      printProjectsHelp();
      process.exit(0);
    }
    const subCommand = parsedProjectsArgs.subCommand;

    let runnerFlags: RunnerFlags;
    try {
      runnerFlags = parseRunnerFlags(parsedProjectsArgs.runnerArgs, {
        useParallelEnv: false,
      });
    } catch (error: any) {
      console.error(chalk.red('Invalid runner flags:'), error.message);
      process.exit(1);
      return;
    }
    if (runnerFlags.passthroughArgs.length > 0) {
      console.error(
        chalk.red(
          `Unknown projects option(s): ${runnerFlags.passthroughArgs.join(' ')}`,
        ),
      );
      printProjectsHelp();
      process.exit(1);
    }
    if (runnerFlags.runOnlyFlagsUsed.length > 0) {
      console.error(
        chalk.red(
          `Run-only option(s) are not supported for "wiggum projects": ${runnerFlags.runOnlyFlagsUsed.join(', ')}`,
        ),
      );
      printProjectsHelp();
      process.exit(1);
    }

    try {
      const workspace = await resolveRunnerWorkspace({
        rootDir: runnerFlags.rootDir,
        configPath: runnerFlags.configPath,
        projectFilters: runnerFlags.projectFilters,
        includeDependenciesForFiltered: false,
        includeInferredImports: runnerFlags.includeInferredImports,
      });
      if (workspace.projects.length === 0) {
        throw new Error('No runner projects were resolved. Check your config and filters.');
      }
      if (runnerFlags.json) {
        const payload =
          subCommand === 'list'
            ? {
                rootDir: workspace.rootDir,
                configPath: workspace.configPath,
                projects: projectSummaries(workspace.projects, workspace.rootDir),
              }
            : {
                rootDir: workspace.rootDir,
                configPath: workspace.configPath,
                graph: workspace.graph,
                projects: projectSummaries(workspace.projects, workspace.rootDir),
              };
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      if (subCommand === 'list') {
        renderProjectList(workspace.projects, workspace.rootDir, workspace.configPath);
      } else {
        renderProjectList(workspace.projects, workspace.rootDir, workspace.configPath);
        console.log(chalk.cyan('\nProject graph:'));
        console.log(`- Topological order: ${workspace.graph.topologicalOrder.join(' -> ') || '(none)'}`);
        console.log(
          `- Concurrency levels: ${
            workspace.graph.levels
              .map((level, index) => `L${index + 1}[${level.join(', ')}]`)
              .join(' ')
          }`,
        );
        if (workspace.graph.cycles.length > 0) {
          console.log(chalk.red(`- Cycles: ${workspace.graph.cycles.map((cycle) => cycle.join(' -> ')).join('; ')}`));
        }
      }
      return;
    } catch (error: any) {
      console.error(chalk.red('Failed to resolve projects:'), error.message ?? error);
      process.exit(1);
      return;
    }
  }

  if (command === 'run') {
    const firstRunArg = commandArgs[0];
    if (firstRunArg === '--help' || firstRunArg === '-h' || firstRunArg === 'help') {
      printRunHelp();
      process.exit(0);
    }
    if (firstRunArg && !firstRunArg.startsWith('-') && !COMMAND_MAPPING[firstRunArg]) {
      console.error(chalk.red(`Unsupported runner task: ${firstRunArg}`));
      printRunHelp();
      process.exit(1);
    }
    const runHelpRequested = hasHelpFlagBeforePassthrough(commandArgs);

    let parsedRunArgs: {
      task?: string;
      runnerArgs: string[];
    };
    try {
      parsedRunArgs = parseRunCommandArgs(commandArgs);
    } catch (error: any) {
      const errorMessage = error?.message ?? String(error);
      if (runHelpRequested && errorMessage === 'Unsupported runner task: help') {
        printRunHelp();
        process.exit(0);
      }
      console.error(chalk.red('Invalid run command:'), error.message ?? error);
      printRunHelp();
      process.exit(1);
      return;
    }
    if (runHelpRequested) {
      printRunHelp();
      process.exit(0);
    }
    const task = parsedRunArgs.task;
    if (!task) {
      console.error(chalk.red('Missing task name.'));
      printRunHelp();
      process.exit(1);
    }

    const mapping = COMMAND_MAPPING[task];
    if (!mapping) {
      console.error(chalk.red(`Unsupported runner task: ${task}`));
      printRunHelp();
      process.exit(1);
    }

    let runnerFlags: RunnerFlags;
    try {
      runnerFlags = parseRunnerFlags(parsedRunArgs.runnerArgs, {
        useParallelEnv: true,
      });
      if (runnerFlags.json && !runnerFlags.dryRun) {
        throw new Error('--json requires --dry-run for run mode');
      }
      if (runnerFlags.aiPrompt && runnerFlags.dryRun) {
        throw new Error('--ai-prompt cannot be used with --dry-run');
      }
      if (autofix && runnerFlags.dryRun) {
        throw new Error('--autofix cannot be used with --dry-run');
      }
    } catch (error: any) {
      console.error(chalk.red('Invalid runner flags:'), error.message);
      process.exit(1);
      return;
    }

    try {
      const workspace = await resolveRunnerWorkspace({
        rootDir: runnerFlags.rootDir,
        configPath: runnerFlags.configPath,
        projectFilters: runnerFlags.projectFilters,
        includeDependenciesForFiltered: true,
        includeInferredImports: runnerFlags.includeInferredImports,
      });
      if (workspace.projects.length === 0) {
        throw new Error('No runner projects were resolved for execution. Check your config and filters.');
      }
      ensureAcyclicGraph(workspace.graph);

      const orderedProjects = buildExecutionOrder(workspace.projects, workspace.graph);
      const plans = orderedProjects.map((project) => ({
        project: project.name,
        cwd: project.root,
        tool: mapping.tool,
        args: [...project.args, ...runnerFlags.passthroughArgs],
      }));

      if (runnerFlags.dryRun) {
        if (runnerFlags.json) {
          console.log(
            JSON.stringify(
              {
                task,
                rootDir: workspace.rootDir,
                configPath: workspace.configPath,
                graph: workspace.graph,
                projects: projectSummaries(workspace.projects, workspace.rootDir),
                plan: plans,
              },
              null,
              2,
            ),
          );
        } else {
          console.log(chalk.cyan(`Dry run for task "${task}" across ${plans.length} project(s):`));
          console.log(
            chalk.gray(
              `Levels: ${workspace.graph.levels
                .map((level, index) => `L${index + 1}[${level.join(', ')}]`)
                .join(' ')}`,
            ),
          );
          for (const plan of plans) {
            console.log(`- ${plan.project}: ${plan.tool} ${plan.args.join(' ')}`.trim());
          }
        }
        return;
      }

      const byName = new Map(workspace.projects.map((project) => [project.name, project]));
      const failures: RunnerFailureContext[] = [];

      for (const level of workspace.graph.levels) {
        const levelProjects = level
          .map((name) => byName.get(name))
          .filter((project): project is RunnerProject => Boolean(project));
        await runWithConcurrency(levelProjects, runnerFlags.parallel, async (project) => {
          const runArgs = [...project.args, ...runnerFlags.passthroughArgs];
          console.log(
            chalk.cyan(
              `[runner] ${task} -> ${project.name} (${project.root})`,
            ),
          );
          try {
            await forwardCommand(mapping.tool, runArgs, mapping, {
              autofix: false,
              cwd: project.root,
              captureOutput: autofix || runnerFlags.aiPrompt,
            });
          } catch (error: unknown) {
            if (error instanceof CommandExecutionError) {
              failures.push({
                project: project.name,
                message: error.message,
                ...error.result,
              });
              return;
            }
            failures.push({
              project: project.name,
              message: error instanceof Error ? error.message : String(error),
              toolName: mapping.tool,
              command: mapping.tool,
              args: runArgs,
              cwd: project.root,
              stdout: '',
              stderr: '',
              exitCode: 1,
            });
          }
        });
        if (failures.length > 0) {
          break;
        }
      }

      if (failures.length > 0) {
        const executionOrderIndex = new Map(
          orderedProjects.map((project, index) => [project.name, index]),
        );
        const sortedFailures = [...failures].sort((left, right) => {
          const leftIndex = executionOrderIndex.get(left.project) ?? Number.MAX_SAFE_INTEGER;
          const rightIndex = executionOrderIndex.get(right.project) ?? Number.MAX_SAFE_INTEGER;
          if (leftIndex !== rightIndex) {
            return leftIndex - rightIndex;
          }
          return left.project.localeCompare(right.project);
        });

        const details = sortedFailures
          .map(
            (failure) =>
              `${failure.project}: ${failure.message} (command: ${failure.command} ${failure.args.join(' ')})`,
          )
          .join('\n');
        if (runnerFlags.aiPrompt && !autofix) {
          const aiPrompt = buildRunnerFailurePrompt(
            task,
            runnerFlags.passthroughArgs,
            workspace,
            sortedFailures,
          );
          console.error(chalk.yellow('[runner] AI remediation prompt:'));
          console.error(aiPrompt);
        }
        if (autofix) {
          await handleRunnerAutofixError(
            task,
            runnerFlags.passthroughArgs,
            workspace,
            sortedFailures,
          );
        }
        console.error(chalk.red(`[runner] ${sortedFailures.length} project(s) failed:\n${details}`));
        process.exit(1);
      }
      return;
    } catch (error: any) {
      console.error(chalk.red('Runner failed:'), error.message ?? error);
      process.exit(1);
      return;
    }
  }

  // Handle agent command - integrate agent subcommands directly
  if (command === 'agent') {
    const sub = commandArgs[0];

    // If help requested, show help; otherwise default to TUI when no subcommand
    if (sub === '--help' || sub === '-h' || sub === 'help') {
      showAgentHelp();
      process.exit(0);
    }

    // If no subcommand, default to launching TUI
    const effectiveSub = sub || 'chat';
    const isServeMode = effectiveSub === 'serve' || effectiveSub === 'server';
    let parsedServeArgs: ParsedAgentServeArgs | undefined;
    if (isServeMode) {
      try {
        parsedServeArgs = parseAgentServeArgs(commandArgs.slice(1));
      } catch (error: any) {
        console.error(chalk.red('Error:'), error?.message || error);
        process.exit(1);
      }
    }
    const isServeHelp = parsedServeArgs?.help === true;
    if (isServeHelp) {
      printAgentServeHelp();
      process.exit(0);
    }
    const requiresInteractiveTerminal = effectiveSub === 'chat' || effectiveSub === 'tui';

    if (requiresInteractiveTerminal && !hasInteractiveTerminal()) {
      console.error(chalk.red('OpenCode chat mode requires an interactive terminal.'));
      console.log(chalk.yellow('Run "wiggum agent run <command>" or use a TTY-enabled terminal session.'));
      process.exit(1);
    }

    // All subcommands except install require opencode installed
    if (effectiveSub !== 'install') {
      const binaryPath = await checkOpenCodeBinary();
      if (!binaryPath) {
        console.error(chalk.red('OpenCode is not installed'));
        console.log(chalk.yellow('Run "wiggum agent install" to install OpenCode'));
        process.exit(1);
      }
    }

    try {
      switch (effectiveSub) {
        case 'install': {
          const ok = await installOpenCode();
          if (!ok) process.exit(1);
          break;
        }
        case 'init': {
          await createOpenCodeConfig();
          break;
        }
        case 'serve':
        case 'server': {
          const serveArgs = parsedServeArgs ?? parseAgentServeArgs(commandArgs.slice(1));
          const portRaw = serveArgs.portRaw;
          let port: number | undefined;
          if (portRaw !== undefined) {
            if (!/^\d+$/.test(portRaw)) {
              throw new Error(`Invalid --port value "${portRaw}". Expected an integer between 1 and 65535.`);
            }
            const parsedPort = Number.parseInt(portRaw, 10);
            if (!Number.isFinite(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
              throw new Error(`Invalid --port value "${portRaw}". Expected an integer between 1 and 65535.`);
            }
            port = parsedPort;
          }
          const hostnameRaw = serveArgs.hostnameRaw;
          if (hostnameRaw !== undefined && hostnameRaw.trim().length === 0) {
            throw new Error('Invalid --hostname value. Expected a non-empty hostname.');
          }
          const hostname = hostnameRaw;
          await runOpenCodeServer(port, hostname);
          break;
        }
        case 'chat':
        case 'tui': {
          console.log(chalk.cyan('Starting OpenCode interactive terminal UI...'));
          console.log(chalk.gray('Press Ctrl+C to exit'));
          const tui = await createWiggumOpencodeTui();
          process.once('SIGINT', () => {
            console.log(chalk.yellow('\nShutting down...'));
            tui.close();
            process.exit(0);
          });
          await new Promise(() => {});
          break;
        }
        case 'run': {
          if (commandArgs.length < 2) {
            console.error(chalk.red('No command specified for "run"'));
            console.log(chalk.yellow('Example: wiggum agent run session list'));
            process.exit(1);
          }
          await runOpenCodeCommand(commandArgs[1], commandArgs.slice(2));
          break;
        }
        default: {
          // Pass-through: wiggum agent <opencode-subcommand> [...args]
          await runOpenCodeCommand(effectiveSub, commandArgs.slice(1));
          break;
        }
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message || error);
      process.exit(1);
    }

    return;
  }

  // Handle unified commands
  if (COMMAND_MAPPING[command]) {
    try {
      await handleUnifiedCommand(command, commandArgs, autofix);
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  } else {
    console.error(chalk.red(`Unknown command: ${command}`));
    console.log('Run "wiggum --help" for available commands.');
    process.exit(1);
  }
}

// Run the CLI
main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
