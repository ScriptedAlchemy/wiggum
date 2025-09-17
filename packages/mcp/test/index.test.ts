import { describe, test, expect } from '@rstest/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

describe('WiggumMCPServer MCP tools (real calls)', () => {
  const ALL_SITES = ['rspack','rsbuild','rspress','rslib','rsdoctor','rstest','rslint'] as const;
  // TODO(rspress): Add 'rspress' back here once the site serves /llms.txt.
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
        const textItem = (result.content as any[]).find((c) => c.type === 'text');
        expect(textItem).toBeTruthy();
        const payload = JSON.parse((textItem as any).text);
        expect(payload).toHaveProperty('query');
        expect(payload).toHaveProperty('searchMode');
        expect(payload).toHaveProperty('results');
        expect(Array.isArray(payload.results)).toBe(true);
        expect(payload.totalResults).toBe(0);
      } finally {
        transport.close();
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
      const textItem = (result.content as any[]).find((c) => c.type === 'text');
      const payload = JSON.parse((textItem as any).text);
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
      transport.close();
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
      const textItem = (result.content as any[]).find((c) => c.type === 'text');
      const payload = JSON.parse((textItem as any).text);
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
      transport.close();
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
      const textItem = (result.content as any[]).find((c) => c.type === 'text');
      const payload = JSON.parse((textItem as any).text);
      expect({
        count: payload.count,
        note: payload.note,
        paths: payload.results.map((r: any) => r.path),
      }).toMatchInlineSnapshot(`
        {
          "count": 2,
          "note": undefined,
          "paths": [
            "/blog/introducing-rslib.md",
            "/blog/index.md",
          ],
        }
      `);
    } finally {
      transport.close();
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
      const textItem = (result.content as any[]).find((c) => c.type === 'text');
      const payload = JSON.parse((textItem as any).text);
      expect({ note: payload.note, paths: payload.results.map((r: any) => r.path).slice(0, 2) }).toMatchInlineSnapshot(`
        {
          "note": "No blog entries detected; returning migration guides instead.",
          "paths": [
            "/guide/migration/rsbuild-0-x.md",
            "/guide/migration/webpack.md",
          ],
        }
      `);
    } finally {
      transport.close();
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
      const textItem = (result.content as any[]).find((c) => c.type === 'text');
      const payload = JSON.parse((textItem as any).text);
      expect({ path: payload.path, title: payload.title, defaultValue: payload.default ?? null }).toMatchInlineSnapshot(`
        {
          "defaultValue": null,
          "path": "/config/output/source-map.md",
          "title": "output.sourceMap",
        }
      `);
    } finally {
      transport.close();
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
      const textItem = (result.content as any[]).find((c) => c.type === 'text');
      const payload = JSON.parse((textItem as any).text);
      expect(payload.error).toBeDefined();
      expect(payload.suggestions.slice(0, 3)).toMatchInlineSnapshot(`
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
      transport.close();
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
      const textItem = (result.content as any[]).find((c) => c.type === 'text');
      const payload = JSON.parse((textItem as any).text);
      expect({
        path: payload.primaryGuide.path,
        title: payload.primaryGuide.title,
      }).toMatchInlineSnapshot(`
        {
          "path": "/guide/migration/webpack.md",
          "title": "Migrate from webpack",
        }
      `);
    } finally {
      transport.close();
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
      const textItem = (result.content as any[]).find((c) => c.type === 'text');
      const payload = JSON.parse((textItem as any).text);
      expect(payload).toMatchInlineSnapshot(`
        {
          "error": "No migration guides are published for this site.",
          "from": "eslint",
          "site": "rslint",
        }
      `);
    } finally {
      transport.close();
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
      const rows: any[] = [];
      const siteInfoMap = new Map<string, string>();
      const ecosystemRes = await client.callTool({ name: 'get_ecosystem_tools', arguments: {} });
      const ecosystemText = (ecosystemRes.content as any[]).find((c) => c.type === 'text');
      const ecosystemPayload = JSON.parse((ecosystemText as any).text);
      for (const tool of ecosystemPayload.tools) {
        siteInfoMap.set(tool.id, tool.url);
      }

      for (const site of SITES_WITH_LLMS) {
        const res = await client.callTool({
          name: 'list_recent_releases',
          arguments: { site, limit: 3 },
        });
        const textItem = (res.content as any[]).find((c) => c.type === 'text');
        const payload = JSON.parse((textItem as any).text);
        rows.push({
          site,
          count: payload.count,
          note: payload.note,
          paths: payload.results.map((r: any) => r.path),
        });
      }

      expect(rows).toMatchInlineSnapshot(`
        [
          {
            "count": 3,
            "note": undefined,
            "paths": [
              "/blog/announcing-1-5.md",
              "/blog/announcing-1-4.md",
              "/blog/rspack-next-partner.md",
            ],
            "site": "rspack",
          },
          {
            "count": 3,
            "note": "No blog entries detected; returning migration guides instead.",
            "paths": [
              "/guide/migration/rsbuild-0-x.md",
              "/guide/migration/webpack.md",
              "/guide/migration/cra.md",
            ],
            "site": "rsbuild",
          },
          {
            "count": 2,
            "note": undefined,
            "paths": [
              "/blog/introducing-rslib.md",
              "/blog/index.md",
            ],
            "site": "rslib",
          },
          {
            "count": 3,
            "note": undefined,
            "paths": [
              "/blog/release/release-note-1_2.md",
              "/blog/release/release-note-1_0.md",
              "/blog/release/release-note-0_4.md",
            ],
            "site": "rsdoctor",
          },
          {
            "count": undefined,
            "note": "No release or migration content available for this site.",
            "paths": [],
            "site": "rstest",
          },
          {
            "count": undefined,
            "note": "No release or migration content available for this site.",
            "paths": [],
            "site": "rslint",
          },
        ]
      `);
    } finally {
      transport.close();
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
      const ecosystemText = (ecosystemRes.content as any[]).find((c) => c.type === 'text');
      const ecosystemPayload = JSON.parse((ecosystemText as any).text);
      for (const tool of ecosystemPayload.tools) {
        siteInfoMap.set(tool.id, tool.url);
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
          const textItem = (result.content as any[]).find((c) => c.type === 'text');
          const payload = JSON.parse((textItem as any).text);
          summaries.push({ site, option, resolvedPath: payload.path, error: payload.error });
        }
      }

      expect(summaries).toMatchInlineSnapshot(`
        [
          {
            "error": undefined,
            "option": "index",
            "resolvedPath": "/config/index.md",
            "site": "rspack",
          },
          {
            "error": undefined,
            "option": "extends",
            "resolvedPath": "/config/extends.md",
            "site": "rspack",
          },
          {
            "error": undefined,
            "option": "entry",
            "resolvedPath": "/config/entry.md",
            "site": "rspack",
          },
          {
            "error": undefined,
            "option": "index",
            "resolvedPath": "/config/index.md",
            "site": "rsbuild",
          },
          {
            "error": undefined,
            "option": "root",
            "resolvedPath": "/config/root.md",
            "site": "rsbuild",
          },
          {
            "error": undefined,
            "option": "mode",
            "resolvedPath": "/config/mode.md",
            "site": "rsbuild",
          },
          {
            "error": undefined,
            "option": "index",
            "resolvedPath": "/config/index.md",
            "site": "rslib",
          },
          {
            "error": undefined,
            "option": "lib.index",
            "resolvedPath": "/config/lib/index.md",
            "site": "rslib",
          },
          {
            "error": undefined,
            "option": "lib.format",
            "resolvedPath": "/config/lib/format.md",
            "site": "rslib",
          },
          {
            "error": undefined,
            "option": "options.options",
            "resolvedPath": "/config/options/options.md",
            "site": "rsdoctor",
          },
          {
            "error": undefined,
            "option": "options.term",
            "resolvedPath": "/config/options/term.md",
            "site": "rsdoctor",
          },
          {
            "error": undefined,
            "option": "index",
            "resolvedPath": "/config/index.md",
            "site": "rstest",
          },
          {
            "error": undefined,
            "option": "test.root",
            "resolvedPath": "/config/test/root.md",
            "site": "rstest",
          },
          {
            "error": undefined,
            "option": "test.name",
            "resolvedPath": "/config/test/name.md",
            "site": "rstest",
          },
          {
            "error": undefined,
            "option": "index",
            "resolvedPath": "/config/index.md",
            "site": "rslint",
          },
        ]
      `);
    } finally {
      transport.close();
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
      const results: any[] = [];
      for (const site of sites) {
        const res = await client.callTool({
          name: 'search',
          arguments: { query: 'configuration', site, maxResults: 0, includeContext: false, semanticWeight: 0.4 },
        });
        const textItem = (res.content as any[]).find((c) => c.type === 'text');
        const payload = JSON.parse((textItem as any).text);
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
      transport.close();
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
      const textItem = (result.content as any[]).find((c) => c.type === 'text');
      const payload = JSON.parse((textItem as any).text);
      const ids = payload.tools.map((t: any) => t.id);
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
      transport.close();
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
      const textItem = (result.content as any[]).find((c) => c.type === 'text');
      const payload = JSON.parse((textItem as any).text);
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
      transport.close();
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
      const textItem = (result.content as any[]).find((c) => c.type === 'text');
      const payload = JSON.parse((textItem as any).text);
      expect({ site: payload.site, name: payload.info.name, url: payload.info.url }).toMatchInlineSnapshot(`
        {
          "name": "Rspack",
          "site": "rspack",
          "url": "https://rspack.rs",
        }
      `);
    } finally {
      transport.close();
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
      const rows: any[] = [];
      for (const site of ALL_SITES) {
        const result = await client.callTool({ name: 'get_site_info', arguments: { site } });
        const textItem = (result.content as any[]).find((c) => c.type === 'text');
        const payload = JSON.parse((textItem as any).text);
        rows.push({ site: payload.site, name: payload.info.name, url: payload.info.url });
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
      transport.close();
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
      const textItem = (result.content as any[]).find((c) => c.type === 'text') as any;
      const text = String(textItem.text);
      // Fail if server returned error JSON
      try {
        const maybe = JSON.parse(text);
        expect(!!maybe.error).toBe(false);
      } catch {
        // not JSON -> OK (expected llms.txt)
      }
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(50);
      expect(text.includes('.md')).toBe(true);
    } finally {
      transport.close();
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
      const rows: any[] = [];
      for (const site of SITES_WITH_LLMS) {
        const result = await client.callTool({ name: 'get_docs', arguments: { site } });
        const textItem = (result.content as any[]).find((c) => c.type === 'text') as any;
        const text = String(textItem.text);
        let hasError = false;
        try { const p = JSON.parse(text); hasError = !!p.error; } catch { hasError = false; }
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
      transport.close();
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
      const textItem = (result.content as any[]).find((c) => c.type === 'text');
      const payload = JSON.parse((textItem as any).text);
      expect(payload.error).toBeUndefined();
      expect(payload.contentType).toBe('markdown');
      expect(payload.url).toContain('introduction.md');
    } finally {
      transport.close();
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
      const textItem = (result.content as any[]).find((c) => c.type === 'text');
      const payload = JSON.parse((textItem as any).text);
      expect(payload.error).toBeUndefined();
      expect(payload.site).toBe('rspack');
      expect(Array.isArray(payload.pages)).toBe(true);
      expect(payload.pages.length).toBeGreaterThan(0);
      expect(payload.pages.some((p: any) => typeof p.path === 'string' && p.path.endsWith('.md'))).toBe(true);
    } finally {
      transport.close();
    }
  }, 60000);
});
