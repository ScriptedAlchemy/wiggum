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

- Node.js 18+ (CI tests on 18.x and 20.x)
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

Tip: run `wiggum --help` for a concise command list.

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

## MCP Doc Explorer

The MCP server in `packages/mcp` exposes tools to search and fetch documentation across Rstack sites. It can be used from MCP‑compatible clients. See that package’s README for details.

## Development

- Build everything: `pnpm build`
- Test everything: `pnpm test`
- Type check (best‑effort): `pnpm -r exec tsc --noEmit`

CI runs on pushes and PRs against `main` and `develop` and validates build, tests, and a best‑effort type check on Node 18.x/20.x.

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

### Changesets Bot

Install the [Changesets GitHub App](https://github.com/apps/changeset-bot) for this repository so pull requests automatically get reminded to include a changeset. After installation the bot will comment on PRs when a changeset is missing and provide a quick link to create one. You can choose whether to install it for the whole organization or just this repo. (See citeturn0search0)

## OpenCode

This repo includes a minimal `opencode.json`. The CLI and plugin primarily inject configuration inline at runtime using `@wiggum/agent`.

## License

MIT (see package manifests)
