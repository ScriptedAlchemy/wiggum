import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';
import { pluginChatWidget } from '@wiggum/rsbuild-plugin-wiggum';

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
    // Demo widget setup: UI title + themed styling.
    pluginChatWidget({
      title: 'Rstack Help & Support',
      customTheme: {
        'border-radius': '12px',
        'shadow': '0 4px 20px rgba(0, 0, 0, 0.15)',
      },
    }),
  ],
});
