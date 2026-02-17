import { defineConfig } from '@rslib/core';

// ESM Node CLI build for @wiggum/cli
export default defineConfig({
  lib: [
    {
      format: 'esm',
      source: {
        entry: {
          cli: './src/cli.ts',
          runner: './src/runner.ts',
        },
      },
      output: {
        target: 'node',
        distPath: {
          root: './dist',
        },
      },
      dts: true,
      autoExternal: true,
    },
  ],
});
