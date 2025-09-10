import type { RsbuildPlugin } from '@rsbuild/core';
import fs from 'fs';
import path from 'path';

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
    const {
      customCSS = '',
      customTheme = {},
      ...widgetProps
    } = options;
    
    // Get the widget entry path
    const widgetEntryPath = path.join(__dirname, 'widget-loader.js');
    
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
      const newTags = {
        headTags: [
          ...tags.headTags,
          // Inject widget configuration as global variable
          {
            tag: 'script',
            children: `window.__WIGGUM_CHAT_CONFIG__ = ${JSON.stringify(widgetProps)};`,
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
  },
});

// Export types for external use
export type { RsbuildPlugin } from '@rsbuild/core';

// Default export
export default pluginChatWidget;