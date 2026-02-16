/**
 * Agent integration for Wiggum CLI
 * Spawns and manages OpenCode binary directly
 */

import { spawn, ChildProcess } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import which from 'which';

import type { Config } from '@opencode-ai/sdk';
import { createOpencodeTui, type TuiOptions } from './opencode.js';
import { buildMergedConfig } from '@wiggum/agent';
import { getPackageManager, installGlobalPackage } from './pm.js'



export interface AgentOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  detached?: boolean;
  config?: Config;
}

/**
 * Get default Wiggum OpenCode configuration
 */
// buildMergedConfig and getDefaultWiggumConfig are imported from @wiggum/agent

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
  try {
    const pm = await getPackageManager()
    const ok = await installGlobalPackage('opencode-ai', pm)
    if (!ok) {
      console.error(chalk.red('\nPlease install OpenCode manually:'));
      console.log(chalk.cyan('  npm install -g opencode-ai'));
      console.log(chalk.gray('  or'));
      console.log(chalk.cyan('  brew install sst/tap/opencode'));
    }
    return ok
  } catch {
    console.error(chalk.red('\nPlease install OpenCode manually:'));
    console.log(chalk.cyan('  npm install -g opencode-ai'));
    console.log(chalk.gray('  or'));
    console.log(chalk.cyan('  brew install sst/tap/opencode'));
    return false
  }
}

/**
 * Create OpenCode TUI with Wiggum config
 */
export async function createWiggumOpencodeTui(tuiOptions: Partial<TuiOptions> = {}) {
  const mergedConfig = await buildMergedConfig();
  const options: TuiOptions = {
    project: process.cwd(),
    config: mergedConfig,
    ...tuiOptions,
  };
  return createOpencodeTui(options);
}

/**
 * Spawn OpenCode with given arguments (legacy function for server/command mode)
 */
export function spawnOpenCode(args: string[], options: AgentOptions = {}): ChildProcess {
  const env = { ...process.env, ...options.env } as NodeJS.ProcessEnv;

  if (options.config) {
    try {
      env.OPENCODE_CONFIG_CONTENT = JSON.stringify(options.config);
    } catch {
      // ignore invalid config
    }
  }

  const openCodeOptions = {
    cwd: options.cwd || process.cwd(),
    env,
    stdio: 'inherit' as const,
    detached: options.detached || false,
  };

  const child = spawn('opencode', args, openCodeOptions);

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

  const mergedConfig = await buildMergedConfig();
  const child = spawnOpenCode(args, { config: mergedConfig });

  // Handle graceful shutdown
  process.once('SIGINT', () => {
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
export async function runOpenCodeCommand(command: string, args: string[] = [], runtimeConfig?: Config): Promise<void> {
  const allArgs = [command, ...args];

  console.log(chalk.gray(`Running: opencode ${allArgs.join(' ')}`));

  const mergedConfig = runtimeConfig ?? (await buildMergedConfig());
  const child = spawnOpenCode(allArgs, { config: mergedConfig });

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
 * Initialize OpenCode configuration (no-op; we use inline config)
 */
export async function createOpenCodeConfig(): Promise<void> {
  console.log(chalk.gray('No config file created. Wiggum uses inline OpenCode config.'));
}

/**
 * List available agent commands
 */
export function showAgentHelp(): void {
  console.log(`
${chalk.bold('Wiggum Agent - OpenCode Integration')}

${chalk.yellow('Usage:')} wiggum agent [command] [options]

${chalk.yellow('Default:')}
  wiggum agent         Start interactive OpenCode TUI (uses inline config)

${chalk.yellow('Commands:')}
  ${chalk.cyan('serve | server')}      Start OpenCode server
  ${chalk.cyan('init')}                Initialize OpenCode config
  ${chalk.cyan('install')}             Install OpenCode binary
  ${chalk.cyan('chat')}                Start interactive TUI (same as default)
  ${chalk.cyan('run <command>')}       Run any OpenCode command
  
${chalk.yellow('Server Options:')}
  --port <port>       Server port (default: 3000)
  --hostname <host>   Server hostname (default: localhost)
  --host <host>       Alias for --hostname
  -p <port>           Short alias for --port
  -H <host>           Short alias for --hostname

${chalk.yellow('Notes:')}
  Chat modes require an interactive terminal (TTY).


${chalk.yellow('Examples:')}
  ${chalk.gray('# Install OpenCode')}
  wiggum agent install

  ${chalk.gray('# Initialize project')}
  wiggum agent init

  ${chalk.gray('# Start OpenCode server')}
  wiggum agent serve
  wiggum agent serve --port 4096
  wiggum agent server --port=4096 --hostname=0.0.0.0
  wiggum agent serve -p 4096 -H localhost

  ${chalk.gray('# Start interactive chat')}
  wiggum agent chat

  ${chalk.gray('# Run custom OpenCode command')}
  wiggum agent run status
  wiggum agent run session list
`);
}
