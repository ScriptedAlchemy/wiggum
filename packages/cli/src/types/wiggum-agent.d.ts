declare module '@wiggum/agent' {
  import type { Config } from '@opencode-ai/sdk';

  export function buildMergedConfig(options?: {
    fetchEnv?: () => unknown | Promise<unknown>;
  }): Promise<Config>;
}
