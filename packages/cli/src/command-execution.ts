import chalk from 'chalk';
import { execa } from 'execa';
import which from 'which';
import { handleAutofixError } from './autofix.js';
import {
  getPackageManager as pmDetect,
  getExecuteCommand,
  installPackageDev,
  isPackageInstalled,
} from './pm.js';
import type { PackageInfo } from './command-registry.js';

export interface CommandInvocation {
  command: string;
  args: string[];
}

export interface CommandExecutionResult {
  toolName: string;
  command: string;
  args: string[];
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number | null | undefined;
}

export interface ForwardCommandOptions {
  autofix?: boolean;
  cwd?: string;
  captureOutput?: boolean;
}

export class CommandExecutionError extends Error {
  readonly result: CommandExecutionResult;

  constructor(result: CommandExecutionResult) {
    super(`Command "${result.toolName}" failed with exit code ${result.exitCode ?? 'unknown'}.`);
    this.name = 'CommandExecutionError';
    this.result = result;
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function getPackageManager(silent: boolean = false): Promise<string> {
  try {
    const packageManager = await pmDetect();
    if (!silent) {
      console.log(chalk.blue(`Detected package manager: ${packageManager}`));
    }
    return packageManager;
  } catch {
    if (!silent) {
      console.log(chalk.yellow('Could not detect package manager, defaulting to npm'));
    }
    return 'npm';
  }
}

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

export async function resolveCommandInvocation(
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
  const execCommand = getExecuteCommand(packageManager, dlxArgs);
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

export async function forwardCommand(
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
    const message = getErrorMessage(error);
    if (autofix) {
      await handleAutofixError(toolName, originalArgs, '', message, 1);
    }
    throw new Error(`Error executing ${toolName}: ${message}`);
  }
}
