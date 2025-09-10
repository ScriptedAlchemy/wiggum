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
    let opencodeClose: (() => void) | undefined;

    const {
      customCSS = '',
      customTheme = {},
      ...widgetProps
    } = options;
    
    // Get the widget entry path
    // Prefer ESM build for the browser bundle to satisfy package exports
    const widgetEntryPath = path.join(__dirname, 'widget-loader.mjs');
    
    // Start opencode server just before dev server starts (async-friendly)
    api.onBeforeStartDevServer(async () => {
      try {
        const server = await createOpencodeServer({ hostname: '127.0.0.1', port: 0 });
        opencodeUrl = server.url;
        opencodeClose = () => server.close();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[chat-widget] Failed to start opencode server:', (e as any)?.message ?? e);
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
      const newTags = {
        headTags: [
          ...tags.headTags,
          // Provide connection info via meta tags
          ...(opencodeUrl ? [{ tag: 'meta', attrs: { name: 'wiggum-opencode-url', content: opencodeUrl } }] : []),
          { tag: 'meta', attrs: { name: 'wiggum-opencode-dir', content: api.context.rootPath } },
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
        try { opencodeClose(); } catch { /* ignore */ }
      }
    });
    api.onCloseBuild(async () => {
      if (opencodeClose) {
        try { opencodeClose(); } catch { /* ignore */ }
      }
    });
  },
});

// Export types for external use
export type { RsbuildPlugin } from '@rsbuild/core';

// Default export
export default pluginChatWidget;
