import { promises as fsp } from 'fs';
import path from 'path';

export function normalizePath(inputPath: string): string {
  return path.resolve(inputPath);
}

export function toDisplayPath(inputPath: string, rootDir: string): string {
  const relative = path.relative(rootDir, inputPath);
  return relative ? relative : '.';
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await fsp.readFile(filePath, 'utf8');
  return JSON.parse(content) as T;
}

export function replaceRootToken(inputValue: string, rootDir: string): string {
  return inputValue.split('<rootDir>').join(rootDir);
}

export function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((value): value is string => typeof value === 'string');
}

export function resolveFromRoot(rootDir: string, maybeRelativePath: string): string {
  const replaced = replaceRootToken(maybeRelativePath, rootDir);
  return normalizePath(path.isAbsolute(replaced) ? replaced : path.join(rootDir, replaced));
}
