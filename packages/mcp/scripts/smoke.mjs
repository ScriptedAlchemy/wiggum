#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.resolve(__dirname, '../dist/index.js');

function pickTextItem(content) {
  const item = (content || []).find((c) => c.type === 'text');
  return item ? item.text : undefined;
}

async function withClient(fn) {
  const transport = new StdioClientTransport({ command: 'node', args: [serverPath] });
  const client = new Client({ name: 'smoke-client', version: '0.0.0' });
  await client.connect(transport);
  try { return await fn(client); } finally { transport.close(); }
}

async function main() {
  console.log('--- MCP Smoke Test Start ---');

  await withClient(async (client) => {
    console.log('\n[1] get_ecosystem_tools');
    const toolsRes = await client.callTool({ name: 'get_ecosystem_tools', arguments: {} });
    const tools = JSON.parse(pickTextItem(toolsRes.content));
    console.log('tools:', tools.tools.map((t) => t.id).join(', '));

    console.log('\n[2] get_site_info(rspack)');
    const infoRes = await client.callTool({ name: 'get_site_info', arguments: { site: 'rspack' } });
    const info = JSON.parse(pickTextItem(infoRes.content));
    console.log('site:', info.site, 'name:', info.info.name, 'url:', info.info.url);

    console.log('\n[3] get_docs(rspack)');
    const docsRes = await client.callTool({ name: 'get_docs', arguments: { site: 'rspack' } });
    const docsText = pickTextItem(docsRes.content);
    // If JSON is returned here, it's an error. Print tiny preview otherwise
    try {
      const maybe = JSON.parse(docsText);
      if (maybe.error) throw new Error(maybe.error);
    } catch {
      console.log('llms length:', docsText.length, 'contains .md:', docsText.includes('.md'));
    }

    console.log('\n[4] list_pages(rspack)');
    const listRes = await client.callTool({ name: 'list_pages', arguments: { site: 'rspack' } });
    let list;
    try {
      list = JSON.parse(pickTextItem(listRes.content));
      if (!list || list.error || !Array.isArray(list.pages)) {
        throw new Error(list?.error || 'list_pages returned malformed payload');
      }
      console.log('totalPages:', list.totalPages, 'sample:', list.pages.slice(0, 3).map((p) => p.path));
    } catch (e) {
      console.log('list_pages error:', e?.message || String(e));
    }

    console.log('\n[5] get_page(rspack, /guide/start/introduction.md)');
    const pageRes = await client.callTool({ name: 'get_page', arguments: { site: 'rspack', path: '/guide/start/introduction.md' } });
    try {
      const page = JSON.parse(pickTextItem(pageRes.content));
      if (page?.error) throw new Error(page.error);
      console.log('contentType:', page.contentType, 'url:', page.url);
    } catch (e) {
      console.log('get_page error:', e?.message || String(e));
    }

    console.log('\n[6] search (embeddings enabled) rspack query="configuration"');
    const searchWithEmb = await client.callTool({ name: 'search', arguments: { query: 'configuration', site: 'rspack', maxResults: 5, includeContext: true, semanticWeight: 0.7 } });
    try {
      const searchWithEmbPayload = JSON.parse(pickTextItem(searchWithEmb.content));
      const blocks = Array.isArray(searchWithEmbPayload?.results) ? searchWithEmbPayload.results : [];
      const totalWithEmb = blocks.reduce((s, r) => s + (r.matches?.length || 0), 0);
      console.log('mode:', searchWithEmbPayload.searchMode, 'total:', totalWithEmb);
      for (const block of blocks) {
        console.log(' site:', block.site);
        for (const m of (block.matches || []).slice(0, 3)) {
          console.log('  -', m.title, 'score=', m.score, 'file=', m.file);
        }
      }
    } catch (e) {
      console.log('search error:', e?.message || String(e));
    }
  });

  // 2) Broader hybrid search queries across sites (embeddings ON by default)
  await withClient(async (client) => {
    const queries = ['typescript', 'plugin', 'api'];
    const sites = ['all', 'rspack', 'rsbuild', 'rslib', 'rsdoctor', 'rstest', 'rslint'];
    for (const q of queries) {
      for (const s of sites) {
        console.log(`\n[search] q="${q}" site=${s}`);
        const res = await client.callTool({ name: 'search', arguments: { query: q, site: s, maxResults: 5, includeContext: true, semanticWeight: 0.7 } });
        try {
          const payload = JSON.parse(pickTextItem(res.content));
          const blocks = Array.isArray(payload?.results) ? payload.results : [];
          const total = blocks.reduce((acc, r) => acc + (r.matches?.length || 0), 0);
          console.log(' mode:', payload.searchMode, 'sites:', payload.searchedSites, 'total:', total);
          for (const block of blocks) {
            console.log('  site:', block.site);
            for (const m of (block.matches || []).slice(0, 3)) {
              console.log('   -', m.title, 'score=', m.score, 'file=', m.file);
            }
          }
        } catch (e) {
          console.log(' search error:', e?.message || String(e));
        }
      }
    }
  });

  console.log('\n--- MCP Smoke Test End ---');
}

main().catch((err) => { console.error('[SMOKE ERROR]', err); process.exit(1); });
