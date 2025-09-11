import { defineConfig } from '@rslib/core';

// ESM-only Node library build for @wiggum/agent
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
      dts: true,
      // Keep dependencies external for a clean library build
      autoExternal: true,
    },
  ],
});

