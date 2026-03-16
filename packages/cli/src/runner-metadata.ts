export const SUPPORTED_RUNNER_CONFIG_FILES = [
  'wiggum.config.mjs',
  'wiggum.config.js',
  'wiggum.config.cjs',
  'wiggum.config.json',
] as const;

export const DEFAULT_RUNNER_CONFIG_FILE = 'wiggum.config.json' as const;

export const UNSUPPORTED_RUNNER_CONFIG_FILES = [
  'wiggum.config.ts',
  'wiggum.config.mts',
  'wiggum.config.cts',
] as const;

export const DEFAULT_MAX_INFERRED_IMPORT_SCAN_FILES = 400 as const;
export const INFERRED_IMPORT_SCAN_ENV_VAR = 'WIGGUM_RUNNER_INFER_IMPORT_MAX_FILES' as const;

export function formatSupportedRunnerConfigFiles(): string {
  return SUPPORTED_RUNNER_CONFIG_FILES.join(', ');
}
