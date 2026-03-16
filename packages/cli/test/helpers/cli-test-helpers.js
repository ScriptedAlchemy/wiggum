import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import stripAnsi from 'strip-ansi';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const CLI_PATH = path.join(__dirname, '../../bin/cli.js');

export function createTempDirManager(prefix) {
  const tempDirs = [];

  return {
    makeTempDir() {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
      tempDirs.push(dir);
      return dir;
    },
    cleanup() {
      while (tempDirs.length > 0) {
        const dir = tempDirs.pop();
        if (dir) {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      }
    },
  };
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function buildCliEnv(envOverrides = {}) {
  return {
    ...process.env,
    ...envOverrides,
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    CLICOLOR: '0',
    CLICOLOR_FORCE: '0',
  };
}

export function runCliSpawn(args, cwd, envOverrides = {}) {
  const result = spawnSync('node', [CLI_PATH, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30000,
    env: buildCliEnv(envOverrides),
  });

  return {
    exitCode: result.status ?? 1,
    stdout: stripAnsi(result.stdout || ''),
    stderr: stripAnsi(result.stderr || ''),
  };
}

export function runCliCommand(commandLine, options = {}) {
  try {
    const result = execSync(`"${process.execPath}" "${CLI_PATH}" ${commandLine}`, {
      encoding: 'utf8',
      timeout: 30000,
      env: buildCliEnv(options.env),
      ...options,
    });
    return { stdout: stripAnsi(result), stderr: '', exitCode: 0 };
  } catch (error) {
    return {
      stdout: stripAnsi(error.stdout || ''),
      stderr: stripAnsi(error.stderr || ''),
      exitCode: error.status || 1,
    };
  }
}
