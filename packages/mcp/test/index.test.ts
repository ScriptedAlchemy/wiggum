import { describe, test, expect } from '@rstest/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

type ToolCallResult = Awaited<ReturnType<Client['callTool']>>;
type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object';
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getToolText(result: ToolCallResult): string {
  const content = result.content;
  if (!Array.isArray(content)) {
    throw new Error('Expected MCP tool content to be an array');
  }
  for (const item of content) {
    if (isJsonRecord(item) && item.type === 'text' && typeof item.text === 'string') {
      return item.text;
    }
  }
  throw new Error('Expected MCP tool content to include a text item');
}

function parseToolPayload(result: ToolCallResult): JsonRecord {
  const parsed: unknown = JSON.parse(getToolText(result));
  if (!isJsonRecord(parsed)) {
    throw new Error('Expected MCP tool payload to be a JSON object');
  }
  return parsed;
}

describe('WiggumMCPServer MCP tools (real calls)', () => {
  const ALL_SITES = ['rspack','rsbuild','rspress','rslib','rsdoctor','rstest','rslint'] as const;
  // Note(rspress): Add 'rspress' back here once the site serves /llms.txt.
  // As of now, fetching https://rspress.rs/llms.txt returns 404, and https://rspress.dev/llms.txt
  // redirects to the same. When this becomes available, include 'rspress' below and
  // expand the all-sites success assertions accordingly.
  const SITES_WITH_LLMS = ['rspack','rsbuild','rslib','rsdoctor','rstest','rslint'] as const;

  test('search returns structured JSON (no results fast path)', async () => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const serverPath = path.resolve(__dirname, '../dist/index.js');

      const transport = new StdioClientTransport({
        command: 'node',
        args: [serverPath],
        env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' },
      });
      const client = new Client({ name: 'test-client', version: '0.0.0' });
      await client.connect(transport);

      try {
        const result = await client.callTool({
          name: 'search',
          arguments: { query: 'configuration', site: 'rspack', maxResults: 0, includeContext: false },
        });
        expect(Array.isArray(result.content)).toBe(true);
        const payload = parseToolPayload(result);
        expect(payload).toHaveProperty('query');
        expect(payload).toHaveProperty('searchMode');
        expect(payload).toHaveProperty('results');
        expect(Array.isArray(payload.results)).toBe(true);
        expect(payload.totalResults).toBe(0);
      } finally {
        await transport.close();
      }
  }, 60000);

  test('search related suggestions present when results exist', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' },
    });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);

    try {
      const result = await client.callTool({
        name: 'search',
        arguments: { query: 'Module Federation', site: 'rspack', maxResults: 1, includeContext: false, semanticWeight: 0 },
      });
      const payload = parseToolPayload(result);
      const first = payload.results?.[0]?.matches?.[0] ?? payload.results?.[0];
      expect(first.related).toBeDefined();
      expect(first.related).toMatchInlineSnapshot(`
        [
          {
            "path": "/guide/start/introduction.md",
            "reason": "Same section: Guide",
            "title": "Introduction",
          },
          {
            "path": "/guide/start/quick-start.md",
            "reason": "Same section: Guide",
            "title": "Quick start",
          },
          {
            "path": "/guide/start/ecosystem.md",
            "reason": "Same section: Guide",
            "title": "Ecosystem",
          },
        ]
      `);
    } finally {
      await transport.close();
    }
  }, 60000);

  test('search defaults (site omitted) snapshot', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' },
    });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);

    try {
      const result = await client.callTool({
        name: 'search',
        arguments: { query: 'build config', maxResults: 0 },
      });
      const payload = parseToolPayload(result);
      expect(payload).toMatchInlineSnapshot(`
        {
          "query": "build config",
          "results": [],
          "searchMode": "hybrid",
          "searchedSites": [
            "rspack",
            "rsbuild",
            "rspress",
            "rslib",
            "rsdoctor",
            "rstest",
            "rslint",
          ],
          "totalResults": 0,
        }
      `);
    } finally {
      await transport.close();
    }
  }, 60000);

  test('list_recent_releases for rslib blog entries', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' },
    });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);

    try {
      const result = await client.callTool({
        name: 'list_recent_releases',
        arguments: { site: 'rslib', limit: 3 },
      });
      const payload = parseToolPayload(result);
      const releaseResults = toArray(payload.results);
      expect(payload.note).toBeUndefined();
      expect(payload.count).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(payload.results)).toBe(true);
      expect(releaseResults.length).toBeGreaterThanOrEqual(1);
      expect(
        releaseResults.every(
          (entry) => isJsonRecord(entry) && (asString(entry.path)?.startsWith('/blog/') ?? false),
        ),
      ).toBe(true);
    } finally {
      await transport.close();
    }
  }, 60000);

  test('list_recent_releases falls back to migration guides when blog missing', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' },
    });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);

    try {
      const result = await client.callTool({
        name: 'list_recent_releases',
        arguments: { site: 'rsbuild', limit: 2 },
      });
      const payload = parseToolPayload(result);
      const releaseResults = toArray(payload.results);
      expect(payload.note).toBe('No blog entries detected; returning migration guides instead.');
      expect(Array.isArray(payload.results)).toBe(true);
      expect(releaseResults.length).toBeGreaterThanOrEqual(1);
      expect(
        releaseResults.every(
          (entry) => isJsonRecord(entry) && (asString(entry.path)?.startsWith('/guide/migration/') ?? false),
        ),
      ).toBe(true);
    } finally {
      await transport.close();
    }
  }, 60000);

  test('get_config_option returns structured data for rsbuild output.sourceMap', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' },
    });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);

    try {
      const result = await client.callTool({
        name: 'get_config_option',
        arguments: { site: 'rsbuild', option: 'output.sourceMap' },
      });
      const payload = parseToolPayload(result);
      expect({ path: payload.path, title: payload.title, defaultValue: payload.default ?? null }).toMatchInlineSnapshot(`
        {
          "defaultValue": null,
          "path": "/config/output/source-map.md",
          "title": "output.sourceMap",
        }
      `);
    } finally {
      await transport.close();
    }
  }, 60000);

  test('get_config_option returns suggestions when option missing', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' },
    });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);

    try {
      const result = await client.callTool({
        name: 'get_config_option',
        arguments: { site: 'rsbuild', option: 'does.not.exist' },
      });
      const payload = parseToolPayload(result);
      expect(payload.error).toBeDefined();
      expect(toArray(payload.suggestions).slice(0, 3)).toMatchInlineSnapshot(`
        [
          {
            "path": "/config/index.md",
            "title": "Config overview",
          },
          {
            "path": "/config/root.md",
            "title": "root",
          },
          {
            "path": "/config/mode.md",
            "title": "mode",
          },
        ]
      `);
    } finally {
      await transport.close();
    }
  }, 60000);

  test('suggest_migration_path returns webpack→Rspack guidance', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' },
    });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);

    try {
      const result = await client.callTool({
        name: 'suggest_migration_path',
        arguments: { site: 'rspack', from: 'webpack' },
      });
      const payload = parseToolPayload(result);
      expect({
        path: isJsonRecord(payload.primaryGuide) ? payload.primaryGuide.path : undefined,
        title: isJsonRecord(payload.primaryGuide) ? payload.primaryGuide.title : undefined,
      }).toMatchInlineSnapshot(`
        {
          "path": "/guide/migration/webpack.md",
          "title": "Migrate from webpack",
        }
      `);
    } finally {
      await transport.close();
    }
  }, 60000);

  test('suggest_migration_path reports missing guides for rslint', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' },
    });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);

    try {
      const result = await client.callTool({
        name: 'suggest_migration_path',
        arguments: { site: 'rslint', from: 'eslint' },
      });
      const payload = parseToolPayload(result);
      expect(payload).toMatchInlineSnapshot(`
        {
          "error": "No migration guides are published for this site.",
          "from": "eslint",
          "site": "rslint",
        }
      `);
    } finally {
      await transport.close();
    }
  }, 60000);

  test('list_recent_releases across all supported sites', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' },
    });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);

    try {
      const rows: Array<{ site: string; count: unknown; note: unknown; paths: string[] }> = [];

      for (const site of SITES_WITH_LLMS) {
        const res = await client.callTool({
          name: 'list_recent_releases',
          arguments: { site, limit: 3 },
        });
        const payload = parseToolPayload(res);
        const paths = toArray(payload.results)
          .map((entry) => (isJsonRecord(entry) ? asString(entry.path) : undefined))
          .filter((entryPath): entryPath is string => typeof entryPath === 'string');
        rows.push({
          site,
          count: payload.count,
          note: payload.note,
          paths,
        });
      }

      expect(rows).toHaveLength(SITES_WITH_LLMS.length);
      expect(rows.map((row) => row.site).sort()).toEqual([...SITES_WITH_LLMS].sort());
      for (const row of rows) {
        expect(Array.isArray(row.paths)).toBe(true);
        if (row.note === 'No release or migration content available for this site.') {
          expect(row.paths).toHaveLength(0);
          continue;
        }
        expect(row.paths.length).toBeGreaterThanOrEqual(1);
        expect(row.paths.length).toBeLessThanOrEqual(3);
        expect(row.paths.every((p: string) => p.startsWith('/blog/') || p.startsWith('/guide/migration/'))).toBe(true);
      }
    } finally {
      await transport.close();
    }
  }, 90000);

  test('get_config_option resolves sample config paths from llms.txt', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' },
    });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);

    const summaries: Array<{ site: string; option: string; resolvedPath?: string; error?: string }> = [];

    try {
      const siteInfoMap = new Map<string, string>();
      const ecosystemRes = await client.callTool({ name: 'get_ecosystem_tools', arguments: {} });
      const ecosystemPayload = parseToolPayload(ecosystemRes);
      for (const tool of toArray(ecosystemPayload.tools)) {
        if (!isJsonRecord(tool)) continue;
        const toolId = asString(tool.id);
        const toolUrl = asString(tool.url);
        if (toolId && toolUrl) {
          siteInfoMap.set(toolId, toolUrl);
        }
      }

      for (const site of SITES_WITH_LLMS) {
        const siteUrl = siteInfoMap.get(site);
        if (!siteUrl) {
          summaries.push({ site, option: '<none>', error: 'site url not found from ecosystem tools' });
          continue;
        }
        const llmsUrl = `${siteUrl}/llms.txt`;
        const res = await fetch(llmsUrl);
        if (!res.ok) {
          summaries.push({ site, option: '<none>', error: `llms fetch failed: ${res.status}` });
          continue;
        }
        const text = await res.text();
        const matches = Array.from(text.matchAll(/\[([^\]]+)\]\((\/config\/[^)]+\.md)\)/g));
        if (matches.length === 0) {
          summaries.push({ site, option: '<none>', error: 'no config pages found' });
          continue;
        }
        const sample = matches.slice(0, Math.min(3, matches.length));
        for (const [, , pathValue] of sample) {
          const option = pathValue
            .replace(/^\/config\//, '')
            .replace(/\.md$/, '')
            .replace(/\//g, '.');
          const result = await client.callTool({
            name: 'get_config_option',
            arguments: { site, option },
          });
          const payload = parseToolPayload(result);
          summaries.push({
            site,
            option,
            resolvedPath: asString(payload.path),
            error: asString(payload.error),
          });
        }
      }

      expect(summaries.length).toBeGreaterThan(0);
      const entriesWithErrors = summaries.filter((entry) => entry.error);
      expect(entriesWithErrors).toEqual([]);
      expect(
        summaries.every(
          (entry) =>
            typeof entry.resolvedPath === 'string' &&
            entry.resolvedPath.startsWith('/config/') &&
            entry.resolvedPath.endsWith('.md'),
        ),
      ).toBe(true);
    } finally {
      await transport.close();
    }
  }, 120000);

  test('search snapshots per site (no results path)', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' },
    });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);

    try {
      const sites = ['all', ...ALL_SITES] as const;
      const results: Array<{ site: typeof sites[number]; payload: JsonRecord }> = [];
      for (const site of sites) {
        const res = await client.callTool({
          name: 'search',
          arguments: { query: 'configuration', site, maxResults: 0, includeContext: false, semanticWeight: 0.4 },
        });
        const payload = parseToolPayload(res);
        results.push({ site, payload });
      }
      expect(results).toMatchInlineSnapshot(`
        [
          {
            "payload": {
              "query": "configuration",
              "results": [],
              "searchMode": "hybrid",
              "searchedSites": [
                "rspack",
                "rsbuild",
                "rspress",
                "rslib",
                "rsdoctor",
                "rstest",
                "rslint",
              ],
              "totalResults": 0,
            },
            "site": "all",
          },
          {
            "payload": {
              "query": "configuration",
              "results": [],
              "searchMode": "hybrid",
              "searchedSites": [
                "rspack",
              ],
              "totalResults": 0,
            },
            "site": "rspack",
          },
          {
            "payload": {
              "query": "configuration",
              "results": [],
              "searchMode": "hybrid",
              "searchedSites": [
                "rsbuild",
              ],
              "totalResults": 0,
            },
            "site": "rsbuild",
          },
          {
            "payload": {
              "query": "configuration",
              "results": [],
              "searchMode": "hybrid",
              "searchedSites": [
                "rspress",
              ],
              "totalResults": 0,
            },
            "site": "rspress",
          },
          {
            "payload": {
              "query": "configuration",
              "results": [],
              "searchMode": "hybrid",
              "searchedSites": [
                "rslib",
              ],
              "totalResults": 0,
            },
            "site": "rslib",
          },
          {
            "payload": {
              "query": "configuration",
              "results": [],
              "searchMode": "hybrid",
              "searchedSites": [
                "rsdoctor",
              ],
              "totalResults": 0,
            },
            "site": "rsdoctor",
          },
          {
            "payload": {
              "query": "configuration",
              "results": [],
              "searchMode": "hybrid",
              "searchedSites": [
                "rstest",
              ],
              "totalResults": 0,
            },
            "site": "rstest",
          },
          {
            "payload": {
              "query": "configuration",
              "results": [],
              "searchMode": "hybrid",
              "searchedSites": [
                "rslint",
              ],
              "totalResults": 0,
            },
            "site": "rslint",
          },
        ]
      `);
    } finally {
      await transport.close();
    }
  }, 60000);

  test('get_ecosystem_tools returns list of tool ids (snapshot)', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' },
    });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);

    try {
      const result = await client.callTool({ name: 'get_ecosystem_tools', arguments: {} });
      const payload = parseToolPayload(result);
      const ids = toArray(payload.tools)
        .map((tool) => (isJsonRecord(tool) ? asString(tool.id) : undefined))
        .filter((toolId): toolId is string => typeof toolId === 'string');
      expect(ids).toMatchInlineSnapshot(`
        [
          "rspack",
          "rsbuild",
          "rspress",
          "rslib",
          "rsdoctor",
          "rstest",
          "rslint",
        ]
      `);
    } finally {
      await transport.close();
    }
  }, 60000);

  test('get_ecosystem_tools returns full payload (snapshot)', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' },
    });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);

    try {
      const result = await client.callTool({ name: 'get_ecosystem_tools', arguments: {} });
      const payload = parseToolPayload(result);
      expect(payload).toMatchInlineSnapshot(`
        {
          "ecosystem": "Rstack",
          "tools": [
            {
              "description": "Fast Rust-based web bundler",
              "docsUrl": "/guide",
              "id": "rspack",
              "name": "Rspack",
              "type": "bundler",
              "url": "https://rspack.rs",
            },
            {
              "description": "Rspack-based build tool",
              "docsUrl": "/guide",
              "id": "rsbuild",
              "name": "Rsbuild",
              "type": "build-tool",
              "url": "https://rsbuild.rs",
            },
            {
              "description": "Static site generator",
              "docsUrl": "/guide",
              "id": "rspress",
              "name": "Rspress",
              "type": "static-site-generator",
              "url": "https://rspress.rs",
            },
            {
              "description": "Library development tool",
              "docsUrl": "/guide",
              "id": "rslib",
              "name": "Rslib",
              "type": "library-tool",
              "url": "https://rslib.rs",
            },
            {
              "description": "Build analyzer",
              "docsUrl": "/guide",
              "id": "rsdoctor",
              "name": "Rsdoctor",
              "type": "analyzer",
              "url": "https://rsdoctor.rs",
            },
            {
              "description": "Testing framework",
              "docsUrl": "/guide",
              "id": "rstest",
              "name": "Rstest",
              "type": "testing-framework",
              "url": "https://rstest.rs",
            },
            {
              "description": "JavaScript and TypeScript linter",
              "docsUrl": "/guide",
              "id": "rslint",
              "name": "Rslint",
              "type": "linter",
              "url": "https://rslint.rs",
            },
          ],
          "totalTools": 7,
        }
      `);
    } finally {
      await transport.close();
    }
  }, 60000);

  test('get_site_info returns rspack info (snapshot)', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' },
    });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);

    try {
      const result = await client.callTool({ name: 'get_site_info', arguments: { site: 'rspack' } });
      const payload = parseToolPayload(result);
      const info = isJsonRecord(payload.info) ? payload.info : {};
      expect({ site: payload.site, name: info.name, url: info.url }).toMatchInlineSnapshot(`
        {
          "name": "Rspack",
          "site": "rspack",
          "url": "https://rspack.rs",
        }
      `);
    } finally {
      await transport.close();
    }
  }, 60000);

  test('get_site_info returns all sites (snapshot)', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
      env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' },
    });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);

    try {
      const rows: Array<{ site: unknown; name: unknown; url: unknown }> = [];
      for (const site of ALL_SITES) {
        const result = await client.callTool({ name: 'get_site_info', arguments: { site } });
        const payload = parseToolPayload(result);
        const info = isJsonRecord(payload.info) ? payload.info : {};
        rows.push({ site: payload.site, name: info.name, url: info.url });
      }
      expect(rows).toMatchInlineSnapshot(`
        [
          {
            "name": "Rspack",
            "site": "rspack",
            "url": "https://rspack.rs",
          },
          {
            "name": "Rsbuild",
            "site": "rsbuild",
            "url": "https://rsbuild.rs",
          },
          {
            "name": "Rspress",
            "site": "rspress",
            "url": "https://rspress.rs",
          },
          {
            "name": "Rslib",
            "site": "rslib",
            "url": "https://rslib.rs",
          },
          {
            "name": "Rsdoctor",
            "site": "rsdoctor",
            "url": "https://rsdoctor.rs",
          },
          {
            "name": "Rstest",
            "site": "rstest",
            "url": "https://rstest.rs",
          },
          {
            "name": "Rslint",
            "site": "rslint",
            "url": "https://rslint.rs",
          },
        ]
      `);
    } finally {
      await transport.close();
    }
  }, 60000);

  test('get_docs returns content without error (rspack)', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({ command: 'node', args: [serverPath], env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' } });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);

    try {
      const result = await client.callTool({ name: 'get_docs', arguments: { site: 'rspack' } });
      const text = getToolText(result);
      // Fail if server returned error JSON
      try {
        const maybe: unknown = JSON.parse(text);
        const hasError = isJsonRecord(maybe) ? Boolean(maybe.error) : false;
        expect(hasError).toBe(false);
      } catch {
        // not JSON -> OK (expected llms.txt)
      }
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(50);
      expect(text.includes('.md')).toBe(true);
    } finally {
      await transport.close();
    }
  }, 60000);

  test('get_docs for all sites returns content without error (snapshot minimal)', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({ command: 'node', args: [serverPath], env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' } });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);

    try {
      const rows: Array<{ site: string; hasError: boolean }> = [];
      for (const site of SITES_WITH_LLMS) {
        const result = await client.callTool({ name: 'get_docs', arguments: { site } });
        const text = getToolText(result);
        let hasError = false;
        try {
          const p: unknown = JSON.parse(text);
          hasError = isJsonRecord(p) ? Boolean(p.error) : false;
        } catch {
          hasError = false;
        }
        rows.push({ site, hasError });
      }
      expect(rows).toMatchInlineSnapshot(`
        [
          {
            "hasError": false,
            "site": "rspack",
          },
          {
            "hasError": false,
            "site": "rsbuild",
          },
          {
            "hasError": false,
            "site": "rslib",
          },
          {
            "hasError": false,
            "site": "rsdoctor",
          },
          {
            "hasError": false,
            "site": "rstest",
          },
          {
            "hasError": false,
            "site": "rslint",
          },
        ]
      `);
    } finally {
      await transport.close();
    }
  }, 60000);

  test('get_page returns markdown without error (rspack)', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({ command: 'node', args: [serverPath], env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' } });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);

    try {
      const result = await client.callTool({ name: 'get_page', arguments: { site: 'rspack', path: '/guide/start/introduction.md' } });
      const payload = parseToolPayload(result);
      expect(payload.error).toBeUndefined();
      expect(payload.contentType).toBe('markdown');
      expect(payload.url).toContain('introduction.md');
    } finally {
      await transport.close();
    }
  }, 60000);

  test('list_pages returns pages without error (rspack)', async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const serverPath = path.resolve(__dirname, '../dist/index.js');

    const transport = new StdioClientTransport({ command: 'node', args: [serverPath], env: { MCP_DISABLE_EMBEDDINGS: '1', MCP_FETCH_TIMEOUT_MS: '0' } });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await client.connect(transport);

    try {
      const result = await client.callTool({ name: 'list_pages', arguments: { site: 'rspack' } });
      const payload = parseToolPayload(result);
      const pages = toArray(payload.pages);
      expect(payload.error).toBeUndefined();
      expect(payload.site).toBe('rspack');
      expect(Array.isArray(payload.pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);
      expect(
        pages.some((page) => isJsonRecord(page) && (asString(page.path)?.endsWith('.md') ?? false)),
      ).toBe(true);
    } finally {
      await transport.close();
    }
  }, 60000);
});
