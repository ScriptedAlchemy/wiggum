/**
 * Agent integration for Wiggum CLI
 * Spawns and manages OpenCode binary directly
 */

import { spawn, ChildProcess } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import which from 'which';
import * as path from 'path';
import * as fs from 'fs';

export interface AgentOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  detached?: boolean;
}

/**
 * Check if OpenCode binary is available
 */
export async function checkOpenCodeBinary(): Promise<string | null> {
  try {
    const binaryPath = await which('opencode');
    return binaryPath;
  } catch {
    return null;
  }
}

/**
 * Install OpenCode if not available
 */
export async function installOpenCode(): Promise<boolean> {
  const spinner = ora('Installing OpenCode...').start();
  
  try {
    // Try to install via npm
    const npmInstall = spawn('npm', ['install', '-g', 'opencode-ai'], {
      stdio: 'pipe'
    });

    await new Promise<void>((resolve, reject) => {
      npmInstall.on('exit', (code) => {
        if (code === 0) {
          spinner.succeed('OpenCode installed successfully');
          resolve();
        } else {
          spinner.fail('Failed to install OpenCode');
          reject(new Error(`Installation failed with code ${code}`));
        }
      });
      
      npmInstall.on('error', (error) => {
        spinner.fail('Failed to install OpenCode');
        reject(error);
      });
    });

    return true;
  } catch (error) {
    console.error(chalk.red('\nPlease install OpenCode manually:'));
    console.log(chalk.cyan('  npm install -g @opencode-ai/cli'));
    console.log(chalk.gray('  or'));
    console.log(chalk.cyan('  brew install opencode'));
    return false;
  }
}

/**
 * Spawn OpenCode with given arguments
 */
export function spawnOpenCode(args: string[], options: AgentOptions = {}): ChildProcess {
  const openCodeOptions = {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...options.env },
    stdio: 'inherit' as const,
    detached: options.detached || false
  };

  const child = spawn('opencode', args, openCodeOptions);

  // Handle errors
  child.on('error', (error) => {
    if ((error as any).code === 'ENOENT') {
      console.error(chalk.red('OpenCode binary not found'));
      console.log(chalk.yellow('Run "wiggum agent install" to install OpenCode'));
    } else {
      console.error(chalk.red('Error spawning OpenCode:'), error);
    }
  });

  return child;
}

/**
 * Run OpenCode server
 */
export async function runOpenCodeServer(port?: number, hostname?: string): Promise<void> {
  const args = ['serve'];
  
  if (port) {
    args.push('--port', port.toString());
  }
  
  if (hostname) {
    args.push('--hostname', hostname);
  }

  console.log(chalk.cyan('Starting OpenCode server...'));
  console.log(chalk.gray(`Command: opencode ${args.join(' ')}`));

  const child = spawnOpenCode(args);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\nStopping OpenCode server...'));
    child.kill('SIGINT');
    process.exit(0);
  });

  // Wait for process to exit
  await new Promise<void>((resolve) => {
    child.on('exit', () => {
      resolve();
    });
  });
}

/**
 * Run OpenCode with custom command
 */
export async function runOpenCodeCommand(command: string, args: string[] = []): Promise<void> {
  const allArgs = [command, ...args];
  
  console.log(chalk.gray(`Running: opencode ${allArgs.join(' ')}`));
  
  const child = spawnOpenCode(allArgs);

  // Wait for process to exit
  await new Promise<void>((resolve, reject) => {
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
  });
}

/**
 * Create OpenCode configuration
 */
export async function createOpenCodeConfig(projectPath: string = process.cwd()): Promise<void> {
  const configPath = path.join(projectPath, 'opencode.json');
  
  if (fs.existsSync(configPath)) {
    console.log(chalk.yellow(`Config already exists at ${configPath}`));
    return;
  }

  const defaultConfig = {
    model: 'anthropic/claude-3-5-sonnet-20241022',
    temperature: 0.7,
    max_tokens: 4096,
    agents: []
  };

  try {
    await fs.promises.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(chalk.green(`Created opencode.json at ${configPath}`));
  } catch (error) {
    console.error(chalk.red('Failed to create config:'), error);
    throw error;
  }
}

/**
 * List available agent commands
 */
export function showAgentHelp(): void {
  console.log(`
${chalk.bold('Wiggum Agent - OpenCode Integration')}

${chalk.yellow('Usage:')} wiggum agent [command] [options]

${chalk.yellow('Default:')}
  wiggum agent         Start interactive OpenCode TUI

${chalk.yellow('Commands:')}
  ${chalk.cyan('serve')}               Start OpenCode server
  ${chalk.cyan('init')}                Initialize OpenCode config
  ${chalk.cyan('install')}             Install OpenCode binary
  ${chalk.cyan('chat')}                Start interactive TUI (same as default)
  ${chalk.cyan('run <command>')}       Run any OpenCode command
  
${chalk.yellow('Server Options:')}
  --port <port>       Server port (default: 3000)
  --hostname <host>   Server hostname (default: localhost)

${chalk.yellow('Examples:')}
  ${chalk.gray('# Install OpenCode')}
  wiggum agent install

  ${chalk.gray('# Initialize project')}
  wiggum agent init

  ${chalk.gray('# Start OpenCode server')}
  wiggum agent serve
  wiggum agent serve --port 4096

  ${chalk.gray('# Start chat session')}
  wiggum agent chat

  ${chalk.gray('# Run custom OpenCode command')}
  wiggum agent run status
  wiggum agent run session list
`);
}