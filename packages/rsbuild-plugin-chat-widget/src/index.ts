import type { RsbuildPlugin } from '@rsbuild/core';
import path from 'path';
import { createOpencodeServer } from '@opencode-ai/sdk';

export interface ChatWidgetOptions {
  // Widget configuration
  title?: string;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  
  // API configuration
  apiEndpoint?: string;
  
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

export const pluginChatWidget = (options: ChatWidgetOptions = {}): RsbuildPlugin => ({
  name: 'rsbuild:chat-widget',
  
  setup(api) {
    let opencodeUrl: string | undefined;
    let opencodeClose: (() => Promise<void>) | undefined;

    const {
      customCSS = '',
      customTheme = {},
      ...widgetProps
    } = options;
    
    // Get the widget entry path
    const widgetEntryPath = path.join(__dirname, 'widget-loader.js');
    
    // Start opencode server just before dev server starts (async-friendly)
    api.onBeforeStartDevServer(async () => {
      const prev = process.cwd();
      try {
        process.chdir(api.context.rootPath);
        const server = await createOpencodeServer({ hostname: '127.0.0.1', port: 0 });
        opencodeUrl = server.url;
        opencodeClose = () => server.close();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[chat-widget] Failed to start opencode server:', (e as any)?.message ?? e);
      } finally {
        process.chdir(prev);
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
    
    // Inject widget configuration and styles into HTML
    api.modifyHTMLTags((tags) => {
      const injectedProps = {
        ...widgetProps,
        // Provide the server URL to the widget so it can connect via SDK
        apiEndpoint: widgetProps.apiEndpoint || opencodeUrl,
      } as ChatWidgetProps & { apiEndpoint?: string };

      const newTags = {
        headTags: [
          ...tags.headTags,
          // Inject widget configuration as global variable
          {
            tag: 'script',
            children: `window.__WIGGUM_CHAT_CONFIG__ = ${JSON.stringify(injectedProps)};`,
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
        try { await opencodeClose(); } catch { /* ignore */ }
      }
    });
    api.onCloseBuild(async () => {
      if (opencodeClose) {
        try { await opencodeClose(); } catch { /* ignore */ }
      }
    });
  },
});

// Export types for external use
export type { RsbuildPlugin } from '@rsbuild/core';

// Default export
export default pluginChatWidget;
