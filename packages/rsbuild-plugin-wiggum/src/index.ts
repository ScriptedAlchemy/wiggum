import type { RsbuildPlugin } from '@rsbuild/core';
import type { Config } from '@opencode-ai/sdk';
import path from 'path';
import fs from 'fs';
import { createOpencodeServer } from '@opencode-ai/sdk';
import { buildMergedConfig } from '@wiggum/agent';
import { createProxyMiddleware } from 'http-proxy-middleware';

export interface ChatWidgetOptions {
  // Widget configuration
  title?: string;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  
  // API configuration
  apiEndpoint?: string; // If provided, use this OpenCode server URL and skip spawning/proxying
  disableBackend?: boolean; // Skip spawning/proxying backend and run widget in UI-only mode
  
  // Behavior options
  autoOpen?: boolean;
  showTypingIndicator?: boolean;
  enableFileUpload?: boolean;
  maxMessages?: number;
  
  // Custom styling
  customCSS?: string;
  customTheme?: Record<string, string>;
}

export interface ChatWidgetProps extends Omit<ChatWidgetOptions, 'customCSS' | 'customTheme'> {}

type DevServerMiddlewares = {
  use: (path: string, middleware: unknown) => void;
};

type DevServerWithMiddlewares = {
  middlewares?: DevServerMiddlewares;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export const pluginChatWidget = (options: ChatWidgetOptions = {}): RsbuildPlugin => ({
  name: 'rsbuild:chat-widget',
  
  setup(api) {
    let opencodeUrl: string | undefined;
    let opencodeClose: (() => void | Promise<void>) | undefined;
    const backendDisabledByOption = options.disableBackend === true;
    const backendDisabledByEnv = isTruthyEnv(process.env.WIGGUM_CHAT_WIDGET_DISABLE_BACKEND);
    const backendDisabledRequested = backendDisabledByOption || backendDisabledByEnv;
    let backendDisabledForRuntime = backendDisabledRequested;

    const {
      customCSS = '',
      customTheme = {},
      ...widgetProps
    } = options;
    
    // Resolve the widget entry produced by this package's build
    // Try common variants to ensure it works in dev and after publish
    const resolveWidgetEntry = (): string => {
      const candidates = [
        path.join(__dirname, 'widget-loader.mjs'),
        path.join(__dirname, 'widget-loader.js'),
        path.join(__dirname, 'widget-loader.cjs'),
        path.resolve(__dirname, '../dist/widget-loader.mjs'),
        path.resolve(__dirname, '../dist/widget-loader.js'),
        path.resolve(__dirname, '../dist/widget-loader.cjs'),
      ];
      for (const file of candidates) {
        try { if (fs.existsSync(file)) return file; } catch {}
      }
      // Fallback to ESM path (may fail if not built)
      return path.join(__dirname, 'widget-loader.mjs');
    };
    const widgetEntryPath = resolveWidgetEntry();
    
    // Start opencode server just before dev server starts (async-friendly)
    api.onBeforeStartDevServer(async ({ server }) => {
      try {
        // If apiEndpoint is provided, skip server spawn and proxy
        if (options.apiEndpoint) {
          opencodeUrl = options.apiEndpoint;
          backendDisabledForRuntime = false;
        } else if (backendDisabledRequested) {
          opencodeUrl = undefined;
          backendDisabledForRuntime = true;
        } else {
          const config = await buildMergedConfig();

          // Overlay build-mode system prompt using packaged prompt file (or a safe fallback)
          const candidates = [
            path.join(__dirname, 'prompts', 'build.txt'),
            path.resolve(__dirname, '../prompts/build.txt'),
            path.resolve(__dirname, '../src/prompts/build.txt'),
            path.resolve(__dirname, '../dist/prompts/build.txt'),
          ];
          let buildPrompt: string | undefined;
          for (const f of candidates) {
            try { if (fs.existsSync(f)) { buildPrompt = fs.readFileSync(f, 'utf8'); break; } } catch {}
          }
          if (!buildPrompt) {
            buildPrompt = 'You are the Wiggum Build Assistant. Focus on build pipeline and bundling. Do not execute shell commands; propose minimal patches.';
          }

          const cfg: Config = {
            ...config,
            mode: {
              ...(config.mode ?? {}),
              build: {
                ...(config.mode?.build ?? {}),
                prompt: buildPrompt,
              },
            },
          };

          const serverInstance = await createOpencodeServer({ hostname: '127.0.0.1', port: 0, config: cfg });
          opencodeUrl = serverInstance.url;
          opencodeClose = () => serverInstance.close();
        }
      } catch (e) {
        if (isErrnoException(e) && e.code === 'ENOENT') {
          backendDisabledForRuntime = true;
          console.warn('[chat-widget] OpenCode binary not found; continuing without backend server.');
        } else {
          console.warn('[chat-widget] Failed to start opencode server:', getErrorMessage(e));
        }
        return;
      }

      // Install proxy middleware to avoid CORS; map /__opencode__ -> opencodeUrl
      const devServer = server as DevServerWithMiddlewares;
      if (!options.apiEndpoint && opencodeUrl && devServer.middlewares) {
        const target = opencodeUrl;
        devServer.middlewares.use(
          '/__opencode__',
          createProxyMiddleware({
            target,
            changeOrigin: true,
            ws: true,
            pathRewrite: { '^/__opencode__': '' },
          }),
        );
      }
    });

    // Modify Rsbuild config to prepend widget entry to source.preEntry
    api.modifyRsbuildConfig((config, { mergeRsbuildConfig }) => {
      return mergeRsbuildConfig(config, {
        source: {
          preEntry: [widgetEntryPath, ...(Array.isArray(config.source?.preEntry) ? config.source.preEntry : config.source?.preEntry ? [config.source.preEntry] : [])],
        },
      });
    });
    
    // Inject widget styles and metadata (no window globals)
    api.modifyHTMLTags((tags) => {
      // Map plugin options to runtime widget config
      const runtimeConfig: Record<string, unknown> = {};
      if (widgetProps.title) runtimeConfig.title = widgetProps.title;
      if (widgetProps.position) runtimeConfig.position = widgetProps.position;
      const theme: Record<string, string> = {};
      if (widgetProps.primaryColor) theme.primary = widgetProps.primaryColor;
      if (widgetProps.secondaryColor) theme.secondary = widgetProps.secondaryColor;
      if (widgetProps.backgroundColor) theme.background = widgetProps.backgroundColor;
      if (widgetProps.textColor) theme.text = widgetProps.textColor;
      if (Object.keys(theme).length > 0) runtimeConfig.theme = theme;
      if (typeof widgetProps.autoOpen === 'boolean') runtimeConfig.initiallyOpen = widgetProps.autoOpen;

      const newTags = {
        headTags: [
          ...tags.headTags,
          // Provide project directory via meta tag (server URL proxied via /__opencode__)
          { tag: 'meta', attrs: { name: 'wiggum-opencode-dir', content: api.context.rootPath } },
          // Inject runtime widget config for the loader to consume
          {
            tag: 'script',
            children: `(function(){try{window.__wiggum_widget_config=${JSON.stringify({
              ...runtimeConfig,
              ...(options.apiEndpoint ? { apiEndpoint: options.apiEndpoint } : {}),
              ...(backendDisabledForRuntime ? { disableBackend: true } : {}),
            })};}catch(e){}})();`,
          },
          // Inject custom CSS if provided
          ...(customCSS ? [{
            tag: 'style',
            children: customCSS,
          }] : []),
          // Inject custom theme CSS variables
          ...(Object.keys(customTheme).length > 0 ? [{
            tag: 'style',
            children: `:root { ${Object.entries(customTheme).map(([key, value]) => `--chat-${key}: ${value};`).join(' ')} }`,
          }] : []),
        ],
        bodyTags: tags.bodyTags,
      };
      
      return newTags;
    });

    // Ensure we tear down opencode server when dev/preview server stops
    api.onCloseDevServer(async () => {
      if (opencodeClose) {
        try { await Promise.resolve(opencodeClose()); } catch { /* ignore */ }
      }
    });
    // Do NOT close on build-end; keep server alive during dev
  },
});

// Export types for external use
export type { RsbuildPlugin } from '@rsbuild/core';

// Default export
export default pluginChatWidget;
