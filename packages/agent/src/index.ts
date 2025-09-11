import type { Config } from '@opencode-ai/sdk';
import { createOpencodeClient, createOpencodeServer } from '@opencode-ai/sdk';

/**
 * Default Wiggum OpenCode configuration
 */
export function getDefaultWiggumConfig() {
  return {
    agent: {
      'wiggum-assistant': {
        description:
          'Helpful AI assistant for the Wiggum dev environment and Rstack ecosystem (Rsbuild, Rspack, Rspress, Rslib, etc.)',
        mode: 'primary',
        prompt:
          'You are a helpful AI assistant for the Wiggum development environment. You specialize in Rstack tools including Rsbuild, Rspack, Rspress, Rslib, and related technologies. Provide concise, actionable guidance and respect project conventions.',
        temperature: 0.7,
        tools: {
          bash: true,
          read: true,
          grep: true,
          glob: true,
          list: true,
          patch: true,
          write: true,
          edit: true,
          webfetch: true,
        },
      },
    },
  };
}

function deepMerge<T extends Record<string, any>>(base: T, override: Partial<T>): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (out as any)[key] === 'object' &&
      (out as any)[key] !== null &&
      !Array.isArray((out as any)[key])
    ) {
      (out as any)[key] = deepMerge((out as any)[key], value as any);
    } else {
      (out as any)[key] = value as any;
    }
  }
  return out as T;
}

async function fetchOpencodeEnv() {
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
    try {
      await server.close();
    } catch {}
    throw e;
  }
}

function pickPreferredModel(providers: Array<{ id: string; models: Record<string, unknown> }>): string | undefined {
  const has = (provId: string, modelId: string) => {
    const prov = providers.find((p) => p.id === provId);
    if (!prov || !prov.models) return false;
    return Object.prototype.hasOwnProperty.call(prov.models, modelId);
  };

  if (has('anthropic', 'claude-sonnet-4-20250514')) return 'anthropic/claude-sonnet-4-20250514';
  if (has('anthropic', 'claude-sonnet-4')) return 'anthropic/claude-sonnet-4';
  if (has('github-copilot', 'gpt-5')) return 'github-copilot/gpt-5';
  if (has('openai', 'gpt-5')) return 'openai/gpt-5';
  if (has('openrouter', 'qwen/qwen3-coder:free')) return 'openrouter/qwen/qwen3-coder:free';
  return undefined;
}

/**
 * Build the merged Wiggum+User OpenCode config
 */
export async function buildMergedConfig(): Promise<Config> {
  const base = getDefaultWiggumConfig() as Config;
  try {
    const result = await fetchOpencodeEnv();
    const userCfg = result.config as any;
    const providers = result.providers as any[];

    const preferred = pickPreferredModel(providers.map((p) => ({ id: p.id, models: p.models ?? {} })));

    let merged = deepMerge(base, userCfg);

    if (!(merged as any).model && preferred) {
      (merged as any).model = preferred;
    }

    merged.agent = merged.agent || {};
    if (!merged.agent['wiggum-assistant']) {
      merged.agent['wiggum-assistant'] = (base.agent as any)['wiggum-assistant'];
    }

    if (result.server) {
      try {
        await result.server.close();
      } catch {}
    }

    return merged;
  } catch {
    return base;
  }
}

export type { Config };

