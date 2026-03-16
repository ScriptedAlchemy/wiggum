import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  checkOpenCodeBinary,
  createOpenCodeConfig,
  createWiggumOpencodeTui,
  installOpenCode,
  runOpenCodeCommand,
  runOpenCodeServer,
  showAgentHelp,
} from './agent.js';
import {
  extractGlobalAutofixArgs,
  parseAgentServeArgs,
  printAgentServeHelp,
} from './agent-cli.js';
import {
  buildRunnerFailurePrompt,
  handleRunnerAutofixError,
  hasInteractiveTerminal,
  type RunnerFailureContext,
} from './autofix.js';
import { COMMAND_NAMES, COMMAND_REGISTRY, isWiggumCommandName } from './command-registry.js';
import {
  CommandExecutionError,
  forwardCommand,
  getErrorMessage,
} from './command-execution.js';
import {
  buildExecutionOrder,
  ensureAcyclicGraph,
  projectSummaries,
  resolveRunnerWorkspace,
  type RunnerProject,
} from './runner.js';
import {
  hasHelpFlagBeforePassthrough,
  parseProjectsCommandArgs,
  parseRunCommandArgs,
  parseRunnerFlags,
  printProjectsHelp,
  printRunHelp,
  renderProjectList,
  runWithConcurrency,
} from './runner-cli.js';

async function handleUnifiedCommand(
  command: keyof typeof COMMAND_REGISTRY,
  args: string[],
  autofix: boolean = false,
): Promise<void> {
  const mapping = COMMAND_REGISTRY[command];
  await forwardCommand(mapping.tool, args, mapping, { autofix });
}

function getPackageVersion(): string {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version;
  } catch {
    return '1.0.0';
  }
}

function printMainHelp(): void {
  const commandLines = COMMAND_NAMES.map(
    (commandName) =>
      `  ${commandName.padEnd(10)}${COMMAND_REGISTRY[commandName].description}`,
  ).join('\n');

  console.log(`
Usage: wiggum <command> [options]

Commands:
${commandLines}
  run        Run a task across runner projects
  projects   List or graph runner projects
  agent      OpenCode AI agent integration

This is a passthrough CLI - all flags and options are forwarded to the underlying tools.
Use "wiggum <command> --help" to see help for a specific command.
Global options:
  --autofix   Enable OpenCode autofix flow for command failures
`);
}

async function handleProjectsCommand(commandArgs: string[], autofix: boolean): Promise<void> {
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
    firstProjectsArg
    && !firstProjectsArg.startsWith('-')
    && firstProjectsArg !== 'list'
    && firstProjectsArg !== 'graph'
  ) {
    console.error(chalk.red(`Unknown projects subcommand: ${firstProjectsArg}`));
    printProjectsHelp();
    process.exit(1);
  }
  const projectsHelpRequested = hasHelpFlagBeforePassthrough(commandArgs);

  let parsedProjectsArgs: ReturnType<typeof parseProjectsCommandArgs>;
  try {
    parsedProjectsArgs = parseProjectsCommandArgs(commandArgs);
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    if (projectsHelpRequested && errorMessage === 'Unknown projects subcommand: help') {
      printProjectsHelp();
      process.exit(0);
    }
    console.error(chalk.red('Invalid projects command:'), errorMessage);
    printProjectsHelp();
    process.exit(1);
    return;
  }
  if (projectsHelpRequested) {
    printProjectsHelp();
    process.exit(0);
  }

  let runnerFlags: ReturnType<typeof parseRunnerFlags>;
  try {
    runnerFlags = parseRunnerFlags(parsedProjectsArgs.runnerArgs, {
      useParallelEnv: false,
    });
  } catch (error: unknown) {
    console.error(chalk.red('Invalid runner flags:'), getErrorMessage(error));
    process.exit(1);
    return;
  }
  if (runnerFlags.passthroughArgs.length > 0) {
    console.error(chalk.red(`Unknown projects option(s): ${runnerFlags.passthroughArgs.join(' ')}`));
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
        parsedProjectsArgs.subCommand === 'list'
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

    renderProjectList(workspace.projects, workspace.rootDir, workspace.configPath);
    if (parsedProjectsArgs.subCommand === 'graph') {
      console.log(chalk.cyan('\nProject graph:'));
      console.log(`- Topological order: ${workspace.graph.topologicalOrder.join(' -> ') || '(none)'}`);
      console.log(
        `- Concurrency levels: ${workspace.graph.levels
          .map((level, index) => `L${index + 1}[${level.join(', ')}]`)
          .join(' ')}`,
      );
      if (workspace.graph.cycles.length > 0) {
        console.log(
          chalk.red(`- Cycles: ${workspace.graph.cycles.map((cycle) => cycle.join(' -> ')).join('; ')}`),
        );
      }
    }
  } catch (error: unknown) {
    console.error(chalk.red('Failed to resolve projects:'), getErrorMessage(error));
    process.exit(1);
  }
}

async function handleRunCommand(commandArgs: string[], autofix: boolean): Promise<void> {
  const firstRunArg = commandArgs[0];
  if (firstRunArg === '--help' || firstRunArg === '-h' || firstRunArg === 'help') {
    printRunHelp();
    process.exit(0);
  }
  if (firstRunArg && !firstRunArg.startsWith('-') && !isWiggumCommandName(firstRunArg)) {
    console.error(chalk.red(`Unsupported runner task: ${firstRunArg}`));
    printRunHelp();
    process.exit(1);
  }
  const runHelpRequested = hasHelpFlagBeforePassthrough(commandArgs);

  let parsedRunArgs: ReturnType<typeof parseRunCommandArgs>;
  try {
    parsedRunArgs = parseRunCommandArgs(commandArgs);
  } catch (error: unknown) {
    const errorMessage = getErrorMessage(error);
    if (runHelpRequested && errorMessage === 'Unsupported runner task: help') {
      printRunHelp();
      process.exit(0);
    }
    console.error(chalk.red('Invalid run command:'), errorMessage);
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

  const mapping = COMMAND_REGISTRY[task];

  let runnerFlags: ReturnType<typeof parseRunnerFlags>;
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
  } catch (error: unknown) {
    console.error(chalk.red('Invalid runner flags:'), getErrorMessage(error));
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
        console.log(chalk.cyan(`[runner] ${task} -> ${project.name} (${project.root})`));
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
            message: getErrorMessage(error),
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
  } catch (error: unknown) {
    console.error(chalk.red('Runner failed:'), getErrorMessage(error));
    process.exit(1);
  }
}

async function handleAgentCommand(commandArgs: string[]): Promise<void> {
  const sub = commandArgs[0];

  if (sub === '--help' || sub === '-h' || sub === 'help') {
    showAgentHelp();
    process.exit(0);
  }

  const effectiveSub = sub || 'chat';
  const isServeMode = effectiveSub === 'serve' || effectiveSub === 'server';
  let parsedServeArgs: ReturnType<typeof parseAgentServeArgs> | undefined;
  if (isServeMode) {
    try {
      parsedServeArgs = parseAgentServeArgs(commandArgs.slice(1));
    } catch (error: unknown) {
      console.error(chalk.red('Error:'), getErrorMessage(error));
      process.exit(1);
    }
  }
  if (parsedServeArgs?.help) {
    printAgentServeHelp();
    process.exit(0);
  }

  const requiresInteractiveTerminal = effectiveSub === 'chat' || effectiveSub === 'tui';
  if (requiresInteractiveTerminal && !hasInteractiveTerminal()) {
    console.error(chalk.red('OpenCode chat mode requires an interactive terminal.'));
    console.log(chalk.yellow('Run "wiggum agent run <command>" or use a TTY-enabled terminal session.'));
    process.exit(1);
  }

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
        if (!ok) {
          process.exit(1);
        }
        break;
      }
      case 'init': {
        await createOpenCodeConfig();
        break;
      }
      case 'serve':
      case 'server': {
        const serveArgs = parsedServeArgs ?? parseAgentServeArgs(commandArgs.slice(1));
        let port: number | undefined;
        if (serveArgs.portRaw !== undefined) {
          if (!/^\d+$/.test(serveArgs.portRaw)) {
            throw new Error(`Invalid --port value "${serveArgs.portRaw}". Expected an integer between 1 and 65535.`);
          }
          const parsedPort = Number.parseInt(serveArgs.portRaw, 10);
          if (!Number.isFinite(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
            throw new Error(`Invalid --port value "${serveArgs.portRaw}". Expected an integer between 1 and 65535.`);
          }
          port = parsedPort;
        }
        if (serveArgs.hostnameRaw !== undefined && serveArgs.hostnameRaw.trim().length === 0) {
          throw new Error('Invalid --hostname value. Expected a non-empty hostname.');
        }
        await runOpenCodeServer(port, serveArgs.hostnameRaw);
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
        await runOpenCodeCommand(effectiveSub, commandArgs.slice(1));
      }
    }
  } catch (error: unknown) {
    console.error(chalk.red('Error:'), getErrorMessage(error));
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const { autofix, filteredArgs } = extractGlobalAutofixArgs(args);
  const command = filteredArgs[0];
  const commandArgs = filteredArgs.slice(1);

  if (command === '--help' || command === '-h') {
    printMainHelp();
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    console.log(`wiggum v${getPackageVersion()}`);
    process.exit(0);
  }

  if (!command) {
    console.log('Usage: wiggum <command> [options]');
    console.log('Run "wiggum --help" for available commands.');
    process.exit(1);
  }

  if (command === 'projects') {
    await handleProjectsCommand(commandArgs, autofix);
    return;
  }

  if (command === 'run') {
    await handleRunCommand(commandArgs, autofix);
    return;
  }

  if (command === 'agent') {
    await handleAgentCommand(commandArgs);
    return;
  }

  if (isWiggumCommandName(command)) {
    try {
      await handleUnifiedCommand(command, commandArgs, autofix);
      return;
    } catch (error: unknown) {
      console.error(chalk.red('Error:'), getErrorMessage(error));
      process.exit(1);
    }
  }

  console.error(chalk.red(`Unknown command: ${command}`));
  console.log('Run "wiggum --help" for available commands.');
  process.exit(1);
}

main().catch((error: unknown) => {
  console.error(chalk.red('Fatal error:'), getErrorMessage(error));
  process.exit(1);
});
