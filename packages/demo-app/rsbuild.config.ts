import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';
import { pluginChatWidget } from '@wiggum/rsbuild-plugin-chat-widget';

export default defineConfig({
  source: {
    entry: {
      index: './src/index.tsx',
    },
    tsconfigPath: './tsconfig.json',
  },
  plugins: [
    pluginReact(),
    // Always enable type checking
    pluginTypeCheck(),
    // The chat widget plugin currently consumes only customTheme/customCSS directly at build time.
    // Other options are unused by the injected loader, so we omit them to avoid confusion.
    pluginChatWidget({
      title: 'Rstack Help & Support',
      customTheme: {
        'border-radius': '12px',
        'shadow': '0 4px 20px rgba(0, 0, 0, 0.15)',
      },
    }),
  ],
});
