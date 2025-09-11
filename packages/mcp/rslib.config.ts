import { defineConfig } from '@rslib/core';

// ESM Node CLI/server build for @wiggum/mcp
export default defineConfig({
  lib: [
    {
      format: 'esm',
      source: {
        entry: {
          index: './src/index.ts',
        },
      },
      output: {
        target: 'node',
        distPath: {
          root: './dist',
        },
      },
      // Keep CLI shebang in the output
      banner: {
        js: '#!/usr/bin/env node',
      },
      dts: true,
      autoExternal: true,
    },
  ],
});

