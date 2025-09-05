import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';

export default defineConfig({
  source: {
    tsconfigPath: './tsconfig.json',
  },
  plugins: [
    pluginReact(),
    pluginTypeCheck()
  ],
});
