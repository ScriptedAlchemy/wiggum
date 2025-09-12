# @wiggum/cli

`wiggum` is a tiny passthrough CLI for R* tools with an `agent` command that integrates the OpenCode AI assistant.

- Passthrough commands: `build` (Rsbuild), `pack` (Rspack), `lint` (Rslint), `lib` (Rslib), `test` (Rstest), `doc` (Rspress), `doctor` (Rsdoctor)
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

### Agent integration (OpenCode)

The `agent` subcommands use OpenCode to provide an AI assistant for your project.

- `wiggum agent chat` — start the interactive OpenCode TUI (default when no subcommand given)
- `wiggum agent serve [--port 4096 --hostname 127.0.0.1]` — run OpenCode server with Wiggum’s merged config
- `wiggum agent run <command> [...args]` — run any OpenCode subcommand
- `wiggum agent install` — install the `opencode` binary (via your package manager)
- `wiggum agent init` — no‑op placeholder (Wiggum uses inline config by default)

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

