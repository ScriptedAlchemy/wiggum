export function normalizeEnvPathOverride(value) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error('env override value must be a string when provided');
  }
  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

export function ensureEnvObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('env must be an object');
  }
  return value;
}

export function ensureNonEmptyRootPath(value, fieldName) {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string path`);
  }
  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    throw new Error(`${fieldName} must be a non-empty string path`);
  }
  return normalizedValue;
}

export function readEnvPathOverride(env, key) {
  const value = env[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${key} must be a string when provided`);
  }
  return normalizeEnvPathOverride(value);
}
