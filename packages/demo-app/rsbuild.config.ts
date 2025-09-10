import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';
import { pluginChatWidget } from '@wiggum/rsbuild-plugin-chat-widget';

export default defineConfig({
  source: {
    entry: {
      index: './src/index.ts',
    },
    tsconfigPath: './tsconfig.json',
  },
  plugins: [
    pluginReact(),
    pluginTypeCheck(),
    pluginChatWidget({
      title: 'Rstack Help & Support',
      position: 'bottom-right',
      primaryColor: '#007bff',
      secondaryColor: '#6c757d',
      backgroundColor: '#ffffff',
      textColor: '#333333',
      apiEndpoint: '/api/chat',
      autoOpen: false,
      showTypingIndicator: true,
      enableFileUpload: true,
      maxMessages: 100,
      customTheme: {
        'border-radius': '12px',
        'shadow': '0 4px 20px rgba(0, 0, 0, 0.15)',
      },
    }),
  ],
});
