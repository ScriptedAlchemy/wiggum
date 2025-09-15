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
async function forwardCommand(toolName: string, originalArgs: string[], packageInfo: PackageInfo, autofix: boolean = false): Promise<void> {
  try {
    // First try to find the tool in PATH
    const toolPath = await which(toolName).catch(() => null);
    
    if (toolPath) {
      // Tool is globally available, use it directly
      // If autofix is enabled, capture output for error handling
      if (autofix) {
        try {
          const result = await execa(toolName, originalArgs, { 
            cwd: process.cwd(),
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
          cwd: process.cwd()
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
            cwd: process.cwd(),
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
          cwd: process.cwd()
        });
      }
    }
  } catch (error: any) {
    console.error(chalk.red(`Error executing ${toolName}:`), error.message);
    process.exit(1);
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
