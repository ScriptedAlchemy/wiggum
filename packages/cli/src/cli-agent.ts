#!/usr/bin/env node

/**
 * Agent CLI for Wiggum - OpenCode Interactive TUI
 */

import chalk from 'chalk';
import {
  checkOpenCodeBinary,
  installOpenCode,
  spawnOpenCode,
  runOpenCodeServer,
  runOpenCodeCommand,
  createOpenCodeConfig,
  showAgentHelp
} from './agent.js';

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];
const commandArgs = args.slice(1);

// Parse flags
function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const nextArg = args[i + 1];
      
      if (nextArg && !nextArg.startsWith('--')) {
        flags[key] = nextArg;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (args[i].startsWith('-')) {
      const key = args[i].slice(1);
      flags[key] = true;
    }
  }
  
  return flags;
}

// Main command handler
async function main() {
  // If no command or help requested, show help
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    showAgentHelp();
    process.exit(0);
  }

  // Check if OpenCode is installed first (except for install command)
  if (command !== 'install') {
    const binaryPath = await checkOpenCodeBinary();
    if (!binaryPath) {
      console.error(chalk.red('OpenCode is not installed'));
      console.log(chalk.yellow('Run "wiggum agent install" to install OpenCode'));
      process.exit(1);
    }
  }

  const flags = parseFlags(commandArgs);

  try {
    switch (command) {
      case 'install':
        // Install OpenCode binary
        const success = await installOpenCode();
        if (!success) {
          process.exit(1);
        }
        break;

      case 'init':
        // Initialize OpenCode config
        await createOpenCodeConfig();
        break;

      case 'serve':
      case 'server':
        // Start OpenCode server
        const port = flags.port ? parseInt(flags.port as string) : undefined;
        const hostname = flags.hostname as string;
        await runOpenCodeServer(port, hostname);
        break;

      case 'chat':
      case 'tui':
        // Start interactive TUI (default OpenCode behavior)
        console.log(chalk.cyan('Starting OpenCode interactive terminal UI...'));
        console.log(chalk.gray('Press Ctrl+C to exit'));
        
        // Simply spawn opencode without arguments to get the interactive TUI
        const child = spawnOpenCode([]);
        
        // Wait for process to exit
        await new Promise<void>((resolve) => {
          child.on('exit', () => {
            resolve();
          });
        });
        break;

      case 'run':
        // Run a specific OpenCode command
        if (commandArgs.length === 0) {
          console.error(chalk.red('No command specified for "run"'));
          console.log(chalk.yellow('Example: wiggum agent run session list'));
          process.exit(1);
        }
        
        // Pass all remaining args to OpenCode
        await runOpenCodeCommand(commandArgs[0], commandArgs.slice(1));
        break;

      default:
        // If command is not recognized, pass it directly to OpenCode
        // This allows commands like: wiggum agent session list
        console.log(chalk.gray(`Passing command to OpenCode: ${command} ${commandArgs.join(' ')}`));
        
        const allArgs = [command, ...commandArgs];
        const directChild = spawnOpenCode(allArgs);
        
        await new Promise<void>((resolve) => {
          directChild.on('exit', () => {
            resolve();
          });
        });
        break;
    }
  } catch (error) {
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  }
}

// Run the CLI
main().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});