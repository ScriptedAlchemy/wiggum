export interface PackageInfo {
  tool: string;
  packages: string[];
  description: string;
}

export const COMMAND_REGISTRY = {
  build: {
    tool: 'rsbuild',
    packages: ['@rsbuild/core'],
    description: 'Build with Rsbuild',
  },
  pack: {
    tool: 'rspack',
    packages: ['@rspack/cli', '@rspack/core'],
    description: 'Bundle with Rspack',
  },
  lint: {
    tool: 'rslint',
    packages: ['@rslint/core'],
    description: 'Lint with Rslint',
  },
  lib: {
    tool: 'rslib',
    packages: ['@rslib/core'],
    description: 'Build library with Rslib',
  },
  test: {
    tool: 'rstest',
    packages: ['@rstest/core'],
    description: 'Test with Rstest',
  },
  doc: {
    tool: 'rspress',
    packages: ['rspress'],
    description: 'Documentation with Rspress',
  },
  doctor: {
    tool: 'rsdoctor',
    packages: ['@rsdoctor/cli'],
    description: 'Analyze with Rsdoctor',
  },
} as const satisfies Record<string, PackageInfo>;

export type WiggumCommandName = keyof typeof COMMAND_REGISTRY;

export const COMMAND_NAMES = Object.keys(COMMAND_REGISTRY) as WiggumCommandName[];

export function isWiggumCommandName(value: string): value is WiggumCommandName {
  return value in COMMAND_REGISTRY;
}
