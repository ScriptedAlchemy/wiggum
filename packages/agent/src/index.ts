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

/**
 * Deep merge that:
 * - Recursively merges objects
 * - Concatenates arrays (does not replace)
 * - Ignores `undefined` values from the override
 */
export function deepMerge<T>(base: T, override: Partial<T> | undefined): T {
  if (override === undefined) return base;

  // Arrays: concatenate when both are arrays
  if (Array.isArray(base) && Array.isArray(override)) {
    // Deduplicate items: primitives by value, objects by stable structural key
    const merged = [...base, ...override] as unknown[];
    const seen = new Set<string>();
    const out: unknown[] = [];
    for (const item of merged) {
      const key = makeStableKey(item);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (out as any) as T;
  }

  // Objects: merge per-key
  if (
    base !== null &&
    typeof base === 'object' &&
    !Array.isArray(base) &&
    override !== null &&
    typeof override === 'object' &&
    !Array.isArray(override)
  ) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    const o = override as Record<string, unknown>;
    const keys = new Set([...Object.keys(out), ...Object.keys(o)]);
    for (const key of keys) {
      const bv = (out as any)[key];
      const ov = (o as any)[key];
      if (ov === undefined) {
        // ignore undefined from override
        (out as any)[key] = bv;
        continue;
      }
      (out as any)[key] = deepMerge(bv, ov);
    }
    return (out as unknown) as T;
  }

  // Primitive or mismatched types: use override when defined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (override as any) ?? base;
}

function makeStableKey(value: unknown): string {
  const t = typeof value;
  if (value === null) return 'null';
  if (t === 'undefined') return 'undefined';
  if (t === 'number' || t === 'bigint' || t === 'boolean' || t === 'string') {
    return `${t}:${String(value)}`;
  }
  if (Array.isArray(value)) {
    return `arr:[${value.map((v) => makeStableKey(v)).join(',')}]`;
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const k of keys) {
      parts.push(`${JSON.stringify(k)}:${makeStableKey(obj[k])}`);
    }
    return `obj:{${parts.join(',')}}`;
  }
  // functions, symbols, etc. – fallback to toString identity
  return `${t}:${Object.prototype.toString.call(value)}`;
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

export function pickPreferredModel(providers: Array<{ id: string; models: Record<string, unknown> }>): string | undefined {
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
export async function buildMergedConfig(options?: { fetchEnv?: () => ReturnType<typeof fetchOpencodeEnv> | Promise<ReturnType<typeof fetchOpencodeEnv>> }): Promise<Config> {
  const base = getDefaultWiggumConfig() as Config;
  let server: { close: () => void | Promise<void> } | undefined;
  try {
    const result = await (options?.fetchEnv ? options.fetchEnv() : fetchOpencodeEnv());
    server = result.server;

    const userCfg = result.config as any;
    const providers = result.providers as any[];

    const preferred = pickPreferredModel(
      providers.map((p) => ({ id: p.id, models: p.models ?? {} }))
    );

    let merged = deepMerge(base, userCfg);

    if (!(merged as any).model && preferred) {
      (merged as any).model = preferred;
    }

    merged.agent = merged.agent || {};
    if (!merged.agent['wiggum-assistant']) {
      merged.agent['wiggum-assistant'] = (base.agent as any)['wiggum-assistant'];
    }

    return merged;
  } catch {
    return base;
  } finally {
    if (server) {
      try {
        await Promise.resolve(server.close());
      } catch {}
    }
  }
}

export type { Config };
