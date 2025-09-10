import { Config } from "@opencode-ai/sdk"
import {spawn} from 'child_process'

export type TuiOptions = {
  project?: string
  model?: string
  continue?: boolean
  session?: string
  prompt?: string
  agent?: string
  port?: number
  hostname?: string
  printLogs?: boolean
  logLevel?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  signal?: AbortSignal
  config?: Config
}


export function createOpencodeTui(options?: TuiOptions) {
  const args = []

  if (options?.project) {
    args.push(options.project)
  }
  if (options?.model) {
    args.push('--model', options.model)
  }
  if (options?.continue) {
    args.push('--continue')
  }
  if (options?.session) {
    args.push('--session', options.session)
  }
  if (options?.prompt) {
    args.push('--prompt', options.prompt)
  }
  if (options?.agent) {
    args.push('--agent', options.agent)
  }
  if (options?.port !== undefined) {
    args.push('--port', String(options.port))
  }
  if (options?.hostname) {
    args.push('--hostname', options.hostname)
  }
  if (options?.printLogs) {
    args.push('--print-logs')
  }
  if (options?.logLevel) {
    args.push('--log-level', options.logLevel)
  }

  const proc = spawn(`opencode`, args, {
    signal: options?.signal,
    stdio: 'inherit',
    env: {
      ...process.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify(options?.config ?? {}),
    },
  })

  return {
    close() {
      proc.kill()
    },
  }
}