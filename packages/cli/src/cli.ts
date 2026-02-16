import chalk from 'chalk';
import ora from 'ora';
import { execa } from 'execa';
import which from 'which';
import { detect } from 'package-manager-detector';
import { resolveCommand } from 'package-manager-detector/commands';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
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

// Types
interface PackageInfo {
  tool: string;
  packages: string[];
}

interface CommandMapping {
  [key: string]: PackageInfo;
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

// Handle autofix error by passing to OpenCode
async function handleAutofixError(
  toolName: string, 
  args: string[], 
  stdout: string, 
  stderr: string, 
  exitCode: number | null
): Promise<void> {
  console.log(chalk.yellow(`\n${toolName} command failed with exit code ${exitCode}`));
  console.log(chalk.cyan('Opening OpenCode TUI with error context...\n'));

  const prompt = [
    `Command failed: wiggum ${toolName} ${args.join(' ')}`,
    `Exit code: ${exitCode}`,
    '',
    'Output:',
    stdout || '(no stdout)',
    '',
    'Errors:',
    stderr || '(no stderr)',
    '',
    'Please help me fix this error.'
  ].join('\n');

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
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\nShutting down...'));
    tui.close();
    process.exit(0);
  });

  await new Promise(() => {});
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

// Forward command to the appropriate tool
async function forwardCommand(
  toolName: string,
  originalArgs: string[],
  packageInfo: PackageInfo,
  autofix: boolean = false,
  cwd: string = process.cwd(),
): Promise<void> {
  try {
    // First try to find the tool in PATH
    const toolPath = await which(toolName).catch(() => null);
    
    if (toolPath) {
      // Tool is globally available, use it directly
      // If autofix is enabled, capture output for error handling
      if (autofix) {
        try {
          const result = await execa(toolName, originalArgs, { 
            cwd,
            reject: false
          });
          
          if (result.exitCode !== 0) {
            await handleAutofixError(toolName, originalArgs, result.stdout, result.stderr, result.exitCode);
          } else {
            // Success - print output normally
            if (result.stdout) console.log(result.stdout);
            if (result.stderr) console.error(result.stderr);
          }
        } catch (error: any) {
          await handleAutofixError(toolName, originalArgs, '', error.message, 1);
        }
      } else {
        await execa(toolName, originalArgs, { 
          stdio: 'inherit',
          cwd
        });
      }
    } else {
      // Tool not in PATH, check if packages are installed and install if needed
      // Silent mode for version/help commands
      const isVersionOrHelp = originalArgs.some(arg => 
        ['--version', '-v', '--help', '-h'].includes(arg)
      );
      const packageManager = await getPackageManager(isVersionOrHelp);
      
      // Check if any required packages are missing
      const missingPackages = packageInfo.packages.filter(pkg => !isPackageInstalled(pkg));
      
      if (missingPackages.length > 0) {
        console.log(chalk.yellow(`${toolName} not found, installing required packages: ${missingPackages.join(', ')}...`));
        
        // Install missing packages
        for (const pkg of missingPackages) {
          const success = await installPackage(pkg, packageManager);
          if (!success) {
            process.exit(1);
          }
        }
      }
      
      // For dlx/execute commands, use the package name
      const executablePackage = packageInfo.packages.find(pkg => pkg.includes('cli')) || packageInfo.packages[0];
      
      // Build the dlx arguments - pass originalArgs as-is
      const dlxArgs = [executablePackage, ...originalArgs];
      const execCommand = getExecuteCommand(packageManager as any, dlxArgs);
      
      if (!execCommand) {
        throw new Error('Could not resolve package manager execute command');
      }
      
      if (!isVersionOrHelp) {
        console.log(chalk.blue(`Executing: ${execCommand.command} ${execCommand.args.join(' ')}`));
      }
      
      // If autofix is enabled, capture output for error handling
      if (autofix) {
        try {
          const result = await execa(execCommand.command, execCommand.args, { 
            cwd,
            reject: false
          });
          
          if (result.exitCode !== 0) {
            await handleAutofixError(toolName, originalArgs, result.stdout, result.stderr, result.exitCode);
          } else {
            // Success - print output normally
            if (result.stdout) console.log(result.stdout);
            if (result.stderr) console.error(result.stderr);
          }
        } catch (error: any) {
          await handleAutofixError(toolName, originalArgs, '', error.message, 1);
        }
      } else {
        await execa(execCommand.command, execCommand.args, { 
          stdio: 'inherit',
          cwd
        });
      }
    }
  } catch (error: any) {
    throw new Error(`Error executing ${toolName}: ${error.message}`);
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
  await forwardCommand(tool, args, mapping, autofix);
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
  includeInferredImports: boolean;
  passthroughArgs: string[];
}

function splitListValue(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseRunnerFlags(args: string[]): RunnerFlags {
  const parsed: RunnerFlags = {
    projectFilters: [],
    parallel: Number.isFinite(Number(process.env.WIGGUM_RUNNER_PARALLEL))
      ? Math.max(1, Number(process.env.WIGGUM_RUNNER_PARALLEL))
      : 4,
    dryRun: false,
    json: false,
    includeInferredImports: true,
    passthroughArgs: [],
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
      parsed.projectFilters.push(...splitListValue(value));
      i++;
      continue;
    }
    if (arg.startsWith('--project=')) {
      parsed.projectFilters.push(...splitListValue(arg.slice('--project='.length)));
      continue;
    }
    if (arg === '--config') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('Missing value for --config');
      }
      parsed.configPath = value;
      i++;
      continue;
    }
    if (arg.startsWith('--config=')) {
      parsed.configPath = arg.slice('--config='.length);
      continue;
    }
    if (arg === '--root') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error('Missing value for --root');
      }
      parsed.rootDir = value;
      i++;
      continue;
    }
    if (arg.startsWith('--root=')) {
      parsed.rootDir = arg.slice('--root='.length);
      continue;
    }
    if (arg === '--parallel' || arg === '--concurrency') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error(`Missing value for ${arg}`);
      }
      const parsedNumber = Number.parseInt(value, 10);
      if (!Number.isFinite(parsedNumber) || parsedNumber < 1) {
        throw new Error(`Invalid ${arg} value "${value}"`);
      }
      parsed.parallel = parsedNumber;
      i++;
      continue;
    }
    if (arg.startsWith('--parallel=')) {
      const value = Number.parseInt(arg.slice('--parallel='.length), 10);
      if (!Number.isFinite(value) || value < 1) {
        throw new Error(`Invalid --parallel value "${arg}"`);
      }
      parsed.parallel = value;
      continue;
    }
    if (arg.startsWith('--concurrency=')) {
      const value = Number.parseInt(arg.slice('--concurrency='.length), 10);
      if (!Number.isFinite(value) || value < 1) {
        throw new Error(`Invalid --concurrency value "${arg}"`);
      }
      parsed.parallel = value;
      continue;
    }
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (arg === '--json') {
      parsed.json = true;
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

// Main CLI execution
async function main() {
  // Simple CLI argument parsing
  const args = process.argv.slice(2);
  
  // Check for --autofix flag
  let autofix = false;
  let filteredArgs = args;
  
  const autofixIndex = args.findIndex(arg => arg === '--autofix');
  if (autofixIndex !== -1) {
    autofix = true;
    filteredArgs = args.filter((_, index) => index !== autofixIndex);
  }
  
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
    const subCommand = commandArgs[0] || 'list';
    if (!['list', 'graph'].includes(subCommand)) {
      console.error(chalk.red(`Unknown projects subcommand: ${subCommand}`));
      console.log(chalk.yellow('Usage: wiggum projects [list|graph] [runner flags]'));
      process.exit(1);
    }

    let runnerFlags: RunnerFlags;
    try {
      runnerFlags = parseRunnerFlags(commandArgs.slice(1));
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
        includeDependenciesForFiltered: false,
        includeInferredImports: runnerFlags.includeInferredImports,
      });
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
    const task = commandArgs[0];
    if (!task) {
      console.error(chalk.red('Missing task name.'));
      console.log(chalk.yellow('Usage: wiggum run <task> [runner flags] [-- task args]'));
      process.exit(1);
    }

    const mapping = COMMAND_MAPPING[task];
    if (!mapping) {
      console.error(chalk.red(`Unsupported runner task: ${task}`));
      console.log(chalk.yellow(`Supported tasks: ${Object.keys(COMMAND_MAPPING).join(', ')}`));
      process.exit(1);
    }

    let runnerFlags: RunnerFlags;
    try {
      runnerFlags = parseRunnerFlags(commandArgs.slice(1));
      if (runnerFlags.json && !runnerFlags.dryRun) {
        throw new Error('--json requires --dry-run for run mode');
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
      const failures: Array<{ project: string; message: string }> = [];

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
            await forwardCommand(mapping.tool, runArgs, mapping, false, project.root);
          } catch (error: any) {
            failures.push({
              project: project.name,
              message: error?.message ?? String(error),
            });
          }
        });
        if (failures.length > 0) {
          break;
        }
      }

      if (failures.length > 0) {
        const details = failures
          .map((failure) => `${failure.project}: ${failure.message}`)
          .join('\n');
        if (autofix) {
          await handleAutofixError(
            mapping.tool,
            runnerFlags.passthroughArgs,
            '',
            details,
            1,
          );
        }
        console.error(chalk.red(`[runner] ${failures.length} project(s) failed:\n${details}`));
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

    // Simple flag parser for agent subcommands
    const parseFlags = (argsArr: string[]): Record<string, string | boolean> => {
      const flags: Record<string, string | boolean> = {};
      for (let i = 0; i < argsArr.length; i++) {
        const a = argsArr[i];
        if (a.startsWith('--')) {
          const key = a.slice(2);
          const next = argsArr[i + 1];
          if (next && !next.startsWith('-')) {
            flags[key] = next;
            i++;
          } else {
            flags[key] = true;
          }
        } else if (a.startsWith('-')) {
          flags[a.slice(1)] = true;
        }
      }
      return flags;
    };

    // If no subcommand, default to launching TUI
    const effectiveSub = sub || 'chat';

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
          const flags = parseFlags(commandArgs.slice(1));
          const port = flags.port ? parseInt(flags.port as string) : undefined;
          const hostname = (flags.hostname as string) || undefined;
          await runOpenCodeServer(port, hostname);
          break;
        }
        case 'chat':
        case 'tui': {
          console.log(chalk.cyan('Starting OpenCode interactive terminal UI...'));
          console.log(chalk.gray('Press Ctrl+C to exit'));
          const tui = await createWiggumOpencodeTui();
          process.on('SIGINT', () => {
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
