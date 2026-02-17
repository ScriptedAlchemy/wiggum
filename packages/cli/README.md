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
- package-name dependency linking for local workspace edges (including `npm:` + `workspace:` alias specifiers, local `file:`/`link:` path references, and `bundleDependencies` / `bundledDependencies` arrays)
- inferred local edges from source imports (`import`, dynamic `import()`, `require`, and export-from specifiers) discovered in `src/`, `test/`, `tests/`, `spec/`, `specs/`, and `__tests__/`
- deterministic topological ordering + cycle detection
- wildcard/negation project filtering
- concurrency by dependency levels

When distinct runner project entries resolve to different project names, their `package.json` names must still be unique so local dependency/import edges remain unambiguous.

Create a root runner config:

```json
{
  "projects": ["packages/*"]
}
```

Supported runner config filenames are:
- `wiggum.config.json`
- `wiggum.config.mjs`
- `wiggum.config.js`
- `wiggum.config.cjs`

TypeScript runner config variants (`wiggum.config.ts` / `.mts` / `.cts`) are not currently supported.

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
wiggum run --dry-run --json build
```

Planning/debugging modes:

```bash
wiggum run build --dry-run
wiggum run build --dry-run --json
wiggum run build --ai-prompt
wiggum run build --autofix
wiggum projects graph --no-infer-imports --json
```

`--ai-prompt` prints a structured remediation prompt (project failures, graph context, command output) to stderr when a run fails.  
`--autofix` opens the OpenCode TUI directly with the same failure context.
`--ai-prompt` and `--autofix` are runtime-only failure modes and cannot be used with `--dry-run`.
`--autofix` is only supported for task execution flows (`wiggum run ...` / passthrough tool commands), not `wiggum projects ...`.
Default runner concurrency can be configured with `WIGGUM_RUNNER_PARALLEL=<positive integer>` (applies to `wiggum run ...` execution mode).
Use `--no-infer-imports` to disable source-import edge inference (from `src/`, `test/`, `tests/`, `spec/`, `specs/`, and `__tests__/` files) and rely only on manifest-declared local package edges.
Set `WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES=<positive integer>` to control the capped per-project source-file scan budget used for inferred import edges (default: `400`).
This applies to both `wiggum run ...` and `wiggum projects ...` when inferred imports are enabled, and is ignored when `--no-infer-imports` is set.

Global `--autofix` parsing rules:
- `wiggum --autofix run build` and `wiggum run build --autofix` both enable autofix mode.
- for `wiggum agent ...`, `--autofix` is forwarded only when it appears after the `agent` command token (for example `wiggum agent run session --autofix`).
- if you place `--autofix` before `agent` (for example `wiggum --autofix agent run session`), it is consumed as a Wiggum global and not forwarded.
- any `--autofix` after `--` is always forwarded to the underlying tool unchanged.

For CI/non-interactive contexts, `--autofix` automatically falls back to prompt output instead of launching TUI.  
You can force prompt-only behavior explicitly with:

```bash
WIGGUM_AUTOFIX_MODE=prompt wiggum run build --autofix
```

`--project` supports wildcard and negation filters:

```bash
wiggum run build --project "@scope/*" --project "!@scope/legacy"
wiggum run build -p="@scope/*,!@scope/legacy"
wiggum projects list -p @scope/app
```

### Runner verification scripts (CI and fixtures)

The package includes two CI guard scripts used by workspace-level checks:

- `node ./packages/cli/scripts/verify-runner-coverage.mjs`
- `node ./packages/cli/scripts/verify-runner-workflow-coverage.mjs`

Both scripts support environment overrides for isolated fixture runs:

Coverage verifier:

- `WIGGUM_RUNNER_VERIFY_ROOT`
- `WIGGUM_RUNNER_VERIFY_CONFIG_PATH`
- `WIGGUM_RUNNER_VERIFY_PACKAGES_DIR`
- `MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS`

`MIN_EXPECTED_WIGGUM_RUNNER_PROJECTS` defaults to `4`; blank/whitespace values fall back to that default.

If `WIGGUM_RUNNER_VERIFY_CONFIG_PATH` is omitted, the coverage verifier auto-detects the first supported runner config in precedence order (`wiggum.config.mjs`, `wiggum.config.js`, `wiggum.config.cjs`, `wiggum.config.json`) and falls back to `wiggum.config.json` when none exist.
Unsupported TypeScript runner config variants (`wiggum.config.ts` / `.mts` / `.cts`) fail fast with explicit diagnostics.

Workflow verifier:

- `WIGGUM_RUNNER_WORKFLOW_VERIFY_ROOT`
- `WIGGUM_RUNNER_WORKFLOW_VERIFY_PACKAGE_JSON_PATH`
- `WIGGUM_RUNNER_WORKFLOW_VERIFY_WORKFLOW_PATH`

Blank override values are ignored, so whitespace-only values safely fall back to default paths.
Relative override paths resolve from the configured verifier root, while absolute paths are used as-is.
The workflow verifier contract currently enforces:

- required root package scripts and exact command patterns
- required CI steps and per-job step ordering
- required trigger branches (`main`, `develop`) with support for inline or multiline branch YAML
- required CI job/runtime metadata (ubuntu runners, Node 20, pnpm cache wiring)
- required CI action versions (`actions/checkout@v4`, `pnpm/action-setup@v2`, `actions/setup-node@v4`)
- explicit rejection of `continue-on-error: true` drift on required jobs

Successful verifier output includes all contract counts in one line:

```text
[verify-runner-workflow-coverage] Verified runner checks in package scripts and CI workflow (<scripts> scripts, <steps> steps, <content requirements> content requirements).
```

### Agent integration (OpenCode)

The `agent` subcommands use OpenCode to provide an AI assistant for your project.

- `wiggum agent chat` — start the interactive OpenCode TUI (default when no subcommand given)
- `wiggum agent serve [--port 4096 --hostname 127.0.0.1]` — run OpenCode server with Wiggum’s merged config
- `wiggum agent run <command> [...args]` — run any OpenCode subcommand
- `wiggum agent install` — install the `opencode` binary (via your package manager)
- `wiggum agent init` — no‑op placeholder (Wiggum uses inline config by default)

Note: `wiggum agent` / `wiggum agent chat` require an interactive TTY terminal.
`wiggum agent serve` validates port values (must be 1-65535).
Hostname aliases: `--hostname <host>`, `--hostname=<host>`, `--host <host>`, or `--host=<host>`.
You can also use short serve aliases: `-p <port>` / `-p=<port>` and `-H <hostname>` / `-H=<hostname>`.
`--autofix` handling with agent commands is positional:
- `wiggum agent run ... --autofix` forwards `--autofix` to OpenCode.
- `wiggum --autofix agent run ...` consumes `--autofix` as a Wiggum global.

Examples:

```bash
wiggum agent install
wiggum agent chat
wiggum agent serve --port 4096
wiggum agent serve --port=4096 --hostname=0.0.0.0
wiggum agent serve --port=4096 --host=0.0.0.0
wiggum agent serve -p 4096 -H localhost
wiggum agent serve -p=4096 -H=localhost
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

