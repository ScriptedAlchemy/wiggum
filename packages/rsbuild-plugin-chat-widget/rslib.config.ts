import { defineConfig } from '@rslib/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  lib: [
    // Plugin build configuration (ESM + CJS) - Node.js target for the main plugin
    {
      format: 'esm',
      source: {
        entry: {
          index: './src/index.ts',
        },
      },
      output: {
        target: 'node', // Node.js target for the plugin itself
        distPath: {
          root: './dist',
        },
      },
      shims: {
        esm: {
          __dirname: true, // Enable __dirname shim for ESM output
        },
      },
      dts: false,
    },
    {
      format: 'cjs',
      source: {
        entry: {
          index: './src/index.ts',
        },
      },
      output: {
        target: 'node', // Node.js target for the plugin itself
        distPath: {
          root: './dist',
        },
      },
      dts: false, // Only generate .d.ts once
    },
    // Widget components build (ESM + CJS) - Web target for React components
    {
      format: 'esm',
      source: {
        entry: {
          'widget-entry': './src/widget-entry.tsx',
          'widget-loader': './src/widget-loader.ts',
        },
      },
      output: {
        target: 'web', // Web target for React components
        distPath: {
          root: './dist',
        },
      },
      plugins: [pluginReact()], // React plugin only for widget components
      dts: false,
    },
    {
      format: 'cjs',
      source: {
        entry: {
          'widget-entry': './src/widget-entry.tsx',
          'widget-loader': './src/widget-loader.ts',
        },
      },
      output: {
        target: 'web', // Web target for React components
        distPath: {
          root: './dist',
        },
      },
      plugins: [pluginReact()], // React plugin only for widget components
      dts: false,
    },
  ],
});
