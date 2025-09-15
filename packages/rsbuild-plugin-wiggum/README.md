# @wiggum/rsbuild-plugin-wiggum

An Rsbuild plugin that injects a floating chat widget into your dev app. It connects to an OpenCode server to provide an in‑app AI assistant during development.

- Starts a local OpenCode server for you during `rsbuild dev` (or use your own via `apiEndpoint`)
- Proxies requests to avoid CORS friction
- Customizable widget (title, position, colors)

## Install

```bash
pnpm add -D @wiggum/rsbuild-plugin-wiggum
```

## Usage

Add the plugin to your Rsbuild config:

```ts
// rsbuild.config.ts
import { defineConfig } from '@rsbuild/core';
import { pluginChatWidget } from '@wiggum/rsbuild-plugin-wiggum';

export default defineConfig({
  plugins: [
    pluginChatWidget({
      title: 'Wiggum Assistant',
      position: 'bottom-right',
      autoOpen: false,
    })
  ],
});
```

Run your dev server and look for the chat bubble:

```bash
wiggum build dev --open
# or
rsbuild dev --open
```

## Options

```ts
interface ChatWidgetOptions {
  // Widget UI
  title?: string;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;

  // Server
  apiEndpoint?: string; // if provided, plugin will not spawn OpenCode; uses this URL directly

  // Behavior
  autoOpen?: boolean;
  showTypingIndicator?: boolean;
  enableFileUpload?: boolean;
  maxMessages?: number;

  // Advanced styling
  customCSS?: string;
  customTheme?: Record<string, string>;
}
```

Notes:
- When `apiEndpoint` is omitted, the plugin builds a merged OpenCode config using `@wiggum/agent`, spawns an ephemeral local server, and proxies it at `/__opencode__` during dev.
- In production builds the plugin only injects the widget asset; you should provide your own service endpoint if you want a live chat experience.

## Demo

See `packages/demo-app` for a working example using this plugin together with `@wiggum/cli`.

## Requirements

- Node.js 18+
- Rsbuild 1.4+

## License

MIT
