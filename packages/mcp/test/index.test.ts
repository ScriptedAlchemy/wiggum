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
