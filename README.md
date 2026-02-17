# Wiggum Monorepo

Wiggum is a small developer tooling monorepo that ties together the Rstack ecosystem (Rsbuild, Rspack, Rspress, Rslib, Rslint, Rstest, Rsdoctor) with an AI assistant workflow powered by OpenCode. It provides:

- A simple CLI wrapper (`wiggum`) that passthroughs to the R* tools and adds an `agent` command for OpenCode integration
- A reusable agent utility package for building a sensible OpenCode config
- An MCP server for exploring Rstack documentation from AI agent UIs
- An Rsbuild plugin that injects a floating chat widget into dev builds
- A demo app showing the CLI + plugin in action

## Repository Layout

- `packages/cli` — Wiggum CLI (`wiggum`) passthrough + `agent` subcommands
- `packages/agent` — Shared agent utilities for building/merging OpenCode config
- `packages/mcp` — Model Context Protocol (MCP) Doc Explorer server for Rstack docs
- `packages/rsbuild-plugin-wiggum` — Rsbuild plugin to embed the Wiggum chat widget
- `packages/demo-app` — Example app using Rsbuild, the CLI, and the widget

## Requirements

- Node.js 18+ (CI tests on 20.x)
- pnpm 8+

## Quick Start (this repo)

```bash
pnpm install
pnpm build

# Run the demo app with the widget
pnpm -F demo-app dev
```

The demo uses `@wiggum/cli` under the hood (e.g. `wiggum build dev`) and, when the widget plugin is present, it will spin up an OpenCode server automatically during `dev` for an in‑browser assistant experience.

## Using the CLI in your app

Install locally and use via package scripts:

```bash
pnpm add -D @wiggum/cli
```

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

Common commands:
- `wiggum build …` → Rsbuild passthrough
- `wiggum pack …` → Rspack passthrough
- `wiggum test …` → Rstest passthrough
- `wiggum lint …` → Rslint passthrough
- `wiggum doc …` → Rspress passthrough
- `wiggum doctor …` → Rsdoctor passthrough
- `wiggum agent …` → OpenCode integration (see package README for details)
- `wiggum projects …` → list/graph workspace projects discovered from runner config
- `wiggum run <task> …` → run any Rstack task across projects with graph-based ordering and concurrency

Tip: run `wiggum --help` for a concise command list.
`wiggum agent` chat modes require an interactive terminal (TTY).
`wiggum agent serve` supports `--port 4096`, `--port=4096`, and `-p=4096` forms (port must be 1-65535).
Serve hostname flags support both `--hostname` and `--host` (with either `<value>` or `=<value>` forms).
Serve short aliases are also supported: `-p <port>`, `-p=<port>`, `-H <hostname>`, and `-H=<hostname>`.
For `wiggum agent run ...`, arguments such as `--autofix` are forwarded to OpenCode as command arguments (they are not treated as Wiggum globals in agent mode).

### Runner config (workspace orchestration)

Add a `wiggum.config.json` at your repo root to declare projects:

```json
{
  "projects": ["packages/*"]
}
```

Supported runner config filenames are `wiggum.config.json`, `wiggum.config.mjs`, `wiggum.config.js`, and `wiggum.config.cjs`.
TypeScript runner config variants (`wiggum.config.ts` / `.mts` / `.cts`) are not currently supported.

Then use:

```bash
wiggum projects graph --json
wiggum projects list -p @scope/app
wiggum run build --parallel 4
wiggum run test --project "@scope/*" --project "!@scope/legacy"
wiggum run test -p="@scope/*,!@scope/legacy"
wiggum run --dry-run --json build
wiggum run lint --dry-run --json
wiggum run build --ai-prompt
wiggum projects graph --no-infer-imports --json
```

Dependency edges are resolved from local package manifests and inferred local source specifiers (`import`, dynamic `import()`, `require`, and export-from forms) discovered from `src/`, `test/`, `tests/`, `spec/`, `specs/`, and `__tests__/` files, then executed in deterministic topological order.
Use `--no-infer-imports` when you want ordering based strictly on manifest-declared workspace dependencies.
Set `WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES=<positive integer>` to tune the capped per-project source scan budget used for inferred import edges (default: `400`).
The scan budget applies to both `wiggum run ...` and `wiggum projects ...` while inferred imports are enabled, and is ignored when `--no-infer-imports` is used.

For failed workspace runs, you can:
- print a structured AI remediation prompt with `--ai-prompt`
- launch OpenCode directly with rich failure context using `--autofix`
- note: `--autofix` applies to execution flows (`wiggum run ...` / passthrough commands), not `wiggum projects ...`

`--autofix` is accepted in both leading and inline global forms for execution flows:
- `wiggum --autofix run build`
- `wiggum run build --autofix`

Agent-mode note: `wiggum agent run ... --autofix` forwards the flag to OpenCode, while `wiggum --autofix agent run ...` consumes it as a Wiggum global.

In CI/non-interactive terminals, `--autofix` falls back to printing the prompt instead of opening TUI.
You can set default runner concurrency with `WIGGUM_RUNNER_PARALLEL=<positive integer>` (run mode only).

If a tool argument overlaps with a Wiggum global flag, pass it after `--`:

```bash
wiggum build -- --autofix
```

## Chat Widget (Rsbuild plugin)

Add an assistant bubble to your dev app. Minimal setup:

```ts
// rsbuild.config.ts
import { defineConfig } from '@rsbuild/core';
import { pluginChatWidget } from '@wiggum/rsbuild-plugin-wiggum';

export default defineConfig({
  plugins: [pluginChatWidget({ title: 'Wiggum Assistant' })],
});
```

By default, the plugin will start a local OpenCode server and proxy it at `/__opencode__` during `rsbuild dev`. You can also point it to an external server with `apiEndpoint`.
For CI/e2e or environments without the `opencode` binary, set `disableBackend: true` in plugin options (or `WIGGUM_CHAT_WIDGET_DISABLE_BACKEND=1`) to keep the widget UI mounted while skipping backend spawn/client wiring.
If both `apiEndpoint` and `disableBackend` are provided, `apiEndpoint` is used.
The browser API is exposed at `window.WiggumChatWidget` (`open`, `close`, `isOpen`, `init`, `destroy`).

## MCP Doc Explorer

The MCP server in `packages/mcp` exposes tools to search and fetch documentation across Rstack sites. It can be used from MCP‑compatible clients. See that package’s README for details.

## Development

- Build everything: `pnpm build`
- Test everything: `pnpm test`
- Type check (best‑effort): `pnpm -r exec tsc --noEmit`
- Install demo Playwright browser: `pnpm run setup:demo:playwright`
- Run full demo Playwright e2e: `pnpm run test:demo:e2e`
- Run widget-browser API e2e smoke: `pnpm run test:demo:widget-api`

CI runs on pushes and PRs against `main` and `develop` and validates build, tests, demo Playwright e2e coverage (smoke + full suite), and type checks on Node 20.x.

Runner-specific CI guard scripts:

- `pnpm run verify:runner:coverage`
- `pnpm run verify:runner:workflow`
- `pnpm run verify:runner:all`
- `pnpm run ci:validate` (full local CI-equivalent build/test/runner/e2e/typecheck pass)

These scripts also support path override environment variables for isolated fixture validation:

- Coverage verifier: `WIGGUM_RUNNER_VERIFY_ROOT`, `WIGGUM_RUNNER_VERIFY_CONFIG_PATH`, `WIGGUM_RUNNER_VERIFY_PACKAGES_DIR`
- Workflow verifier: `WIGGUM_RUNNER_WORKFLOW_VERIFY_ROOT`, `WIGGUM_RUNNER_WORKFLOW_VERIFY_PACKAGE_JSON_PATH`, `WIGGUM_RUNNER_WORKFLOW_VERIFY_WORKFLOW_PATH`

When `WIGGUM_RUNNER_VERIFY_CONFIG_PATH` is omitted, the coverage verifier auto-detects supported runner configs in precedence order (`wiggum.config.mjs`, `wiggum.config.js`, `wiggum.config.cjs`, `wiggum.config.json`) and otherwise falls back to `wiggum.config.json`.
Unsupported TypeScript runner config variants (`wiggum.config.ts` / `.mts` / `.cts`) fail fast with explicit diagnostics.

Whitespace-only override values are ignored and safely fall back to default repository paths.
Relative override paths resolve from the verifier root override, and absolute paths are honored directly.

## Release Management

We use [Changesets](https://github.com/changesets/changesets) to coordinate releases across the workspace.

1. Create a changeset whenever you merge user-visible changes: `pnpm changeset`. Pick the affected packages and summarize the change. Commit the generated Markdown file in `.changeset/` alongside your code.
2. When preparing a release branch, run `pnpm version-packages`. This applies pending changesets, bumps package versions, and updates changelogs. Follow it with `pnpm install --lockfile-only` if pnpm prompts about lockfile drift and commit the results.
3. Publish from the default branch with `pnpm release`, which rebuilds the workspace and runs `changeset publish` using the configured npm token. Scoped packages are configured for public access via `.changeset/config.json`.

Changesets targets the `main` branch by default; adjust `.changeset/config.json` if your release flow changes.

The private `demo-app` workspace is ignored from versioning/publishing and won't receive changeset bumps.

### Automated Releases

The `Release Packages` GitHub Actions workflow (`.github/workflows/changesets.yml`) automates the Changesets flow on every push to `main`:

- When pending changesets exist, it opens a release PR by running `pnpm version-packages`.
- Once that PR lands and the workflow runs again, it executes `pnpm ci:publish` (a thin wrapper around `pnpm release`) to publish the packages.
- Ensure the `NPM_TOKEN` repository secret is configured with publish rights before enabling auto-publish.

## OpenCode

This repo includes a minimal `opencode.json`. The CLI and plugin primarily inject configuration inline at runtime using `@wiggum/agent`.

## License

MIT (see package manifests)
