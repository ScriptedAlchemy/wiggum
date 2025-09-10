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
import { createOpencodeClient, createOpencodeServer } from '@opencode-ai/sdk';



export interface AgentOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  detached?: boolean;
  config?: Config;
}

/**
 * Get default Wiggum OpenCode configuration
 */
export function getDefaultWiggumConfig() {
  return {
    agent: {
      'wiggum-assistant': {
        description: 'Helpful AI assistant for the Wiggum dev environment and Rstack ecosystem (Rsbuild, Rspack, Rspress, Rslib, etc.)',
        mode: 'primary',
        prompt:
          'You are a helpful AI assistant for the Wiggum development environment. You specialize in Rstack tools including Rsbuild, Rspack, Rspress, Rslib, and related technologies. Provide concise, actionable guidance and respect project conventions.',
        temperature: 0.7,
        tools: {
          // Enable standard tools; permissions control prompts/behavior
          bash: true,
          read: true,
          grep: true,
          glob: true,
          list: true,
          patch: true,
          write: true,
          edit: true,
          webfetch: true
        }
      }
    }
  };
}

function deepMerge<T extends Record<string, any>>(base: T, override: Partial<T>): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof (out as any)[key] === 'object' && (out as any)[key] !== null && !Array.isArray((out as any)[key])) {
      (out as any)[key] = deepMerge((out as any)[key], value as any);
    } else {
      (out as any)[key] = value as any;
    }
  }
  return out as T;
}

async function fetchOpencodeEnv() {
  // Start a temporary server with an ephemeral port so we don't collide
  // with an existing instance. We'll use the returned URL, then tear down.
  const server = await createOpencodeServer({ hostname: '127.0.0.1', port: 0 });
  const client = createOpencodeClient({ baseUrl: server.url });
  try {
    const providersRes = await client.config.providers();
    const configRes = await client.config.get();
    if (!providersRes.data || !configRes.data) {
      throw new Error('Missing data from opencode server');
    }
    return { providers: providersRes.data.providers, config: configRes.data, server };
  } catch (e) {
    try { await server.close(); } catch {}
    throw e;
  }
}

function pickPreferredModel(providers: Array<{ id: string; models: Record<string, unknown> }>): string | undefined {
  const has = (provId: string, modelId: string) => {
    const prov = providers.find(p => p.id === provId);
    if (!prov || !prov.models) return false;
    return Object.prototype.hasOwnProperty.call(prov.models, modelId);
  };

  if (has('anthropic', 'claude-sonnet-4-20250514')) return 'anthropic/claude-sonnet-4-20250514';
  // Some servers list shorter IDs; fallbacks
  if (has('anthropic', 'claude-sonnet-4')) return 'anthropic/claude-sonnet-4';
  if (has('github-copilot', 'gpt-5')) return 'github-copilot/gpt-5';
  if (has('openai', 'gpt-5')) return 'openai/gpt-5';
  if (has('openrouter', 'qwen/qwen3-coder:free')) return 'openrouter/qwen/qwen3-coder:free';
  return undefined;
}

async function buildMergedConfig(): Promise<Config> {
  const base = getDefaultWiggumConfig() as Config;
  try {
    const result = await fetchOpencodeEnv();
    const userCfg = result.config as any;
    const providers = result.providers as any[];

    const preferred = pickPreferredModel(
      providers.map(p => ({ id: p.id, models: p.models ?? {} }))
    );

    // Start from base, then merge user config (user wins)
    let merged = deepMerge(base, userCfg);

    // Set model only if not defined by user config
    if (!(merged as any).model && preferred) {
      (merged as any).model = preferred;
    }

    // Ensure our agent exists if user config didn't define it
    merged.agent = merged.agent || {};
    if (!merged.agent['wiggum-assistant']) {
      merged.agent['wiggum-assistant'] = (base.agent as any)['wiggum-assistant'];
    }

    // Tear down temporary server
    if (result.server) { try { await result.server.close(); } catch {} }

    return merged;
  } catch {
    // Fallback to base if anything fails
    return base;
  }
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
    console.log(chalk.cyan('  npm install -g opencode-ai'));
    console.log(chalk.gray('  or'));
    console.log(chalk.cyan('  brew install sst/tap/opencode'));
    return false;
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

  ${chalk.gray('# Start interactive chat')}
  wiggum agent chat

  ${chalk.gray('# Run custom OpenCode command')}
  wiggum agent run status
  wiggum agent run session list
`);
}
