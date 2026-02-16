# @wiggum/cli

`wiggum` is a tiny passthrough CLI for R* tools with an `agent` command that integrates the OpenCode AI assistant.

- Passthrough commands: `build` (Rsbuild), `pack` (Rspack), `lint` (Rslint), `lib` (Rslib), `test` (Rstest), `doc` (Rspress), `doctor` (Rsdoctor)
- Runner commands: `run` and `projects` for workspace orchestration with dependency graph ordering
- Agent commands: `agent serve`, `agent chat`, `agent run`, `agent install`, `agent init`

## Install

```bash
pnpm add -D @wiggum/cli
```

Then use it in your scripts:

```json
{
  "scripts": {
    "dev": "wiggum build dev --open",
    "build": "wiggum build build",
    "test": "wiggum test",
    "lint": "wiggum lint . --autofix"
  }
}
```

## Usage

Show help:

```bash
wiggum --help
```

Passthrough example (all flags go straight to the underlying tool):

```bash
wiggum build dev --open
wiggum test --watch
wiggum lint src --autofix
```

Use `--` to force flags to be forwarded to underlying tools when they overlap with Wiggum globals:

```bash
wiggum build -- --autofix
```

### Workspace runner (project graph + orchestration)

Wiggum can orchestrate tasks across many projects with an independently calculated project graph (no pnpm/Nx graph dependency).

The graph/orchestration model is aligned with patterns used across Rstack tooling:
- project discovery via config paths/globs/object entries (similar to Rstest/Rslib workspace patterns)
- package-name dependency linking for local workspace edges
- deterministic topological ordering + cycle detection
- wildcard/negation project filtering
- concurrency by dependency levels

Create a root runner config:

```json
{
  "projects": ["packages/*"]
}
```

Inspect discovered projects:

```bash
wiggum projects list
wiggum projects graph --json
```

Run a task across the workspace:

```bash
wiggum run build
wiggum run test --project @scope/app
wiggum run lint --parallel 4
```

Planning/debugging modes:

```bash
wiggum run build --dry-run
wiggum run build --dry-run --json
wiggum run build --ai-prompt
wiggum run build --autofix
```

`--ai-prompt` prints a structured remediation prompt (project failures, graph context, command output) to stderr when a run fails.  
`--autofix` opens the OpenCode TUI directly with the same failure context.

For CI/non-interactive contexts, `--autofix` automatically falls back to prompt output instead of launching TUI.  
You can force prompt-only behavior explicitly with:

```bash
WIGGUM_AUTOFIX_MODE=prompt wiggum run build --autofix
```

`--project` supports wildcard and negation filters:

```bash
wiggum run build --project "@scope/*" --project "!@scope/legacy"
```

### Agent integration (OpenCode)

The `agent` subcommands use OpenCode to provide an AI assistant for your project.

- `wiggum agent chat` — start the interactive OpenCode TUI (default when no subcommand given)
- `wiggum agent serve [--port 4096 --hostname 127.0.0.1]` — run OpenCode server with Wiggum’s merged config
- `wiggum agent run <command> [...args]` — run any OpenCode subcommand
- `wiggum agent install` — install the `opencode` binary (via your package manager)
- `wiggum agent init` — no‑op placeholder (Wiggum uses inline config by default)

Note: `wiggum agent` / `wiggum agent chat` require an interactive TTY terminal.

Examples:

```bash
wiggum agent install
wiggum agent chat
wiggum agent serve --port 4096
wiggum agent run session list
```

### OpenCode configuration

The CLI injects a default config and merges it with your OpenCode environment (providers + user config) at runtime using `@wiggum/agent`. You can also run with your own config by exporting it in your environment and invoking OpenCode directly.

## Requirements

- Node.js 18+
- For agent features: the `opencode` binary (install with `wiggum agent install`)

## Development (in this repo)

```bash
pnpm -F @wiggum/cli build
pnpm -F demo-app dev
```

## License

MIT

