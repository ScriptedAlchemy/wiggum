import { createOpencodeClient, createOpencodeServer } from '@opencode-ai/sdk'

async function main() {
  // Fixed defaults; no options
  const hostname = '127.0.0.1'
  const port = 4099
  let server: Awaited<ReturnType<typeof createOpencodeServer>> | undefined
  let baseUrl = `http://${hostname}:${port}`

  // Try to start a local server; if it fails, assume one is already running
  try {
    server = await createOpencodeServer({
      hostname,
      port,
    })
    baseUrl = server.url
  } catch {
    // If starting fails, assume a server is already running at baseUrl
  }

  try {
    const client = createOpencodeClient({ baseUrl })
    const res = await client.config.providers()
    console.log('CONFIG', await client.config.get())
    if (!res.data) throw (res as any).error ?? new Error('Unknown providers() error')
    const providers = res.data.providers
    const simplified = providers.map((p) => ({
      id: p.id,
      name: p.name,
      models: Object.keys(p.models ?? {}),
    }))
    const output = { server: baseUrl, providers: simplified }
    // console.log(JSON.stringify(output, null, 2))
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to query providers from server:', err?.message || err)
    process.exitCode = 1
  } finally {
    try {
      if (server) await server.close()
    } catch {}
  }
}

void main()
