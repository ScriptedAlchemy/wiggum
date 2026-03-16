import chalk from 'chalk';
import which from 'which';
import { createWiggumOpencodeTui } from './agent.js';
import type { ResolvedRunnerWorkspace } from './runner.js';
import type { CommandExecutionResult } from './command-execution.js';

export interface RunnerFailureContext extends CommandExecutionResult {
  project: string;
  message: string;
}

export function hasInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export async function openAutofixSession(prompt: string): Promise<void> {
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

  try {
    await which('opencode');
  } catch {
    console.error(chalk.red('OpenCode is not installed'));
    console.log(chalk.yellow('Run "wiggum agent install" to install OpenCode'));
    process.exit(1);
  }

  const tui = await createWiggumOpencodeTui({ prompt });

  process.once('SIGINT', () => {
    console.log(chalk.yellow('\nShutting down...'));
    tui.close();
    process.exit(0);
  });

  await new Promise(() => {});
}

export async function handleAutofixError(
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

export function truncateForPrompt(input: string, maxLength: number): string {
  if (input.length <= maxLength) {
    return input;
  }
  const omitted = input.length - maxLength;
  return `${input.slice(0, maxLength)}\n... (${omitted} chars omitted)`;
}

export function buildRunnerFailurePrompt(
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

  return [
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
}

export async function handleRunnerAutofixError(
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
