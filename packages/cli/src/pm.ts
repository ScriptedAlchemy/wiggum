import { detect } from 'package-manager-detector'
import { resolveCommand } from 'package-manager-detector/commands'
import { execa } from 'execa'
import ora from 'ora'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

let cachedPackageManager: string | null = null
const SUPPORTED_PACKAGE_MANAGERS = [
  'npm',
  'yarn',
  'yarn@berry',
  'pnpm',
  'pnpm@6',
  'bun',
  'deno',
] as const
type SupportedPackageManager = typeof SUPPORTED_PACKAGE_MANAGERS[number]

function toSupportedPackageManager(packageManager: string): SupportedPackageManager {
  if ((SUPPORTED_PACKAGE_MANAGERS as readonly string[]).includes(packageManager)) {
    return packageManager as SupportedPackageManager
  }
  return 'npm'
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export async function getPackageManager(): Promise<string> {
  if (cachedPackageManager) return cachedPackageManager
  try {
    const result = await detect({ cwd: process.cwd() })
    cachedPackageManager = result?.agent || 'npm'
  } catch {
    cachedPackageManager = 'npm'
  }
  return cachedPackageManager
}

export function isPackageInstalled(packageName: string): boolean {
  try {
    // Prefer resolving from the project CWD; fallback to module URL
    let req: NodeRequire
    try {
      const fromCwd = path.join(process.cwd(), 'package.json')
      req = createRequire(fromCwd)
    } catch {
      req = createRequire(fileURLToPath(import.meta.url))
    }
    req.resolve(packageName)
    return true
  } catch {
    return false
  }
}

export async function installPackageDev(packageName: string, packageManager?: string): Promise<boolean> {
  const spinner = ora(`Installing ${packageName} as dev dependency...`).start()
  const pm = packageManager || (await getPackageManager())
  try {
    // Prefer -D for cross-PM compatibility
    const resolved = resolveCommand(toSupportedPackageManager(pm), 'add', [packageName, '-D'])
    if (!resolved) throw new Error('Could not resolve package manager command')
    const { command, args } = resolved
    await execa(command, args, { stdio: 'pipe' })
    spinner.succeed(`Successfully installed ${packageName} as dev dependency`)
    return true
  } catch (error: unknown) {
    spinner.fail(`Failed to install ${packageName}: ${getErrorMessage(error)}`)
    return false
  }
}

export function getExecuteCommand(packageManager: string, dlxArgs: string[]) {
  return resolveCommand(toSupportedPackageManager(packageManager), 'execute', dlxArgs)
}

export async function installGlobalPackage(packageName: string, packageManager?: string): Promise<boolean> {
  const pm = packageManager || (await getPackageManager())
  const spinner = ora(`Installing ${packageName} globally with ${pm}...`).start()
  try {
    let command = 'npm'
    let args: string[] = ['install', '-g', packageName]
    switch (pm) {
      case 'pnpm':
        command = 'pnpm'
        args = ['add', '-g', packageName]
        break
      case 'yarn':
        command = 'yarn'
        args = ['global', 'add', packageName]
        break
      case 'bun':
        command = 'bun'
        args = ['add', '-g', packageName]
        break
      default:
        break
    }
    await execa(command, args, { stdio: 'pipe' })
    spinner.succeed(`Installed ${packageName} globally`)
    return true
  } catch (error: unknown) {
    spinner.fail(`Failed to install ${packageName} globally: ${getErrorMessage(error)}`)
    return false
  }
}

