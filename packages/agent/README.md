# @wiggum/agent

Shared utilities for building a sensible OpenCode configuration for the Wiggum toolchain. Used by `@wiggum/cli` and the Rsbuild chat widget plugin.

## Install

```bash
pnpm add @wiggum/agent
```

## Why this exists

OpenCode supports both file‑based and inline configuration. Wiggum prefers inline configuration so tools can inject defaults and then merge user settings at runtime. This package provides:

- `getDefaultWiggumConfig()` — baseline agent config tailored for Wiggum + Rstack
- `buildMergedConfig()` — merge defaults with the current OpenCode environment and providers
- `deepMerge()` — a deterministic deep merge used internally (arrays are concatenated with de‑dupe)
- `pickPreferredModel()` — choose a reasonable default model from available providers

## Usage

Create an OpenCode server with merged config:

```ts
import { createOpencodeServer } from '@opencode-ai/sdk';
import { buildMergedConfig } from '@wiggum/agent';

const config = await buildMergedConfig();
const server = await createOpencodeServer({ hostname: '127.0.0.1', port: 0, config });
console.log(server.url);
```

Or fetch just the defaults:

```ts
import { getDefaultWiggumConfig } from '@wiggum/agent';
const cfg = getDefaultWiggumConfig();
```

## API

### `getDefaultWiggumConfig(): Config`
Returns the baseline Wiggum agent configuration optimized for the Rstack ecosystem.

### `buildMergedConfig(opts?): Promise<Config>`
- Fetches the running OpenCode environment (providers + user config)
- Deep merges user settings with Wiggum defaults
- Attempts to set a sensible `model` if the user hasn’t specified one

### `deepMerge<T>(base: T, override?: Partial<T>): T`
- Recursively merges plain objects
- Concatenates arrays and performs structural de‑duplication
- Ignores `undefined` values from the override

### `pickPreferredModel(providers): string | undefined`
Returns a provider/model identifier if a good default is available.

## Requirements

- Node.js 18+
- TypeScript 5+ recommended

## License

MIT

