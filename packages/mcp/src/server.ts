import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import natural from 'natural';
import Fuse from 'fuse.js';
import { pipeline, env } from '@xenova/transformers';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

import { RSTACK_SITES } from './constants.js';
import { DocumentIndex } from './types.js';
import { parseMarkdownLinks, extractMarkdownHeadings, parseAvailablePages } from './markdown.js';
import { tokenize, cosineSimilarity, extractHighlights } from './text.js';

// Configure transformers.js for Node.js
env.allowLocalModels = false;
env.useBrowserCache = false;

export class WiggumMCPServer {
  private server: McpServer;
  private documentCache: Map<string, { content: string; timestamp: number }>;
  private searchIndex: Map<string, DocumentIndex>;
  // Track in-flight indexing jobs per site to avoid duplicates
  private indexingPromises: Map<string, Promise<DocumentIndex>>;
  private cacheTimeout = 10 * 60 * 1000; // 10 minutes for document cache
  private indexTimeout = 30 * 60 * 1000; // 30 minutes for search index
  private cacheDir: string;
  private embeddingModel = 'Xenova/all-MiniLM-L6-v2'; // Fast, lightweight model
  private embeddingPipeline: any = null;
  private modelInitPromise: Promise<void> | null;
  private disableEmbeddings: boolean;
  private fetchTimeoutMs: number;
  private devToRsHost: Record<string, string> = {
    'rspack.dev': 'rspack.rs',
    'rsbuild.dev': 'rsbuild.rs',
    'rspress.dev': 'rspress.rs',
    'rslib.dev': 'rslib.rs',
    'rsdoctor.dev': 'rsdoctor.rs',
    'rstest.dev': 'rstest.rs',
    'rslint.dev': 'rslint.rs',
  };

  constructor() {
    this.server = new McpServer(
      { name: 'wiggum-mcp-docexplorer', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.cacheDir = path.join(__dirname, '.embedding_cache');

    this.documentCache = new Map();
    this.searchIndex = new Map();
    this.indexingPromises = new Map();
    this.setupTools();
    this.initializeCacheDir();
    this.modelInitPromise = null;
    this.disableEmbeddings = (process.env.MCP_DISABLE_EMBEDDINGS || '').toLowerCase() === '1' ||
      (process.env.MCP_DISABLE_EMBEDDINGS || '').toLowerCase() === 'true';
    // Never use finite timeouts for network fetches
    this.fetchTimeoutMs = 0;
  }

  private async initializeCacheDir() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      process.stderr.write(`[WARNING] Could not create cache directory: ${error}\n`);
    }
  }

  private async ensureEmbeddingModel(): Promise<boolean> {
    if (this.embeddingPipeline !== null) return true;
    if (this.modelInitPromise !== null) {
      await this.modelInitPromise; return this.embeddingPipeline !== null;
    }
    this.modelInitPromise = this.initializeEmbeddingModel();
    await this.modelInitPromise;
    return this.embeddingPipeline !== null;
  }

  private async initializeEmbeddingModel(): Promise<void> {
    try {
      process.stderr.write(`[INFO] Initializing embedding model: ${this.embeddingModel}\n`);
      this.embeddingPipeline = await pipeline('feature-extraction', this.embeddingModel, { quantized: true });
      process.stderr.write('[INFO] Embedding model loaded successfully\n');
    } catch (error) {
      process.stderr.write(`[ERROR] Failed to load embedding model: ${error}\n`);
      process.stderr.write('[WARNING] Semantic search will be disabled\n');
      this.embeddingPipeline = null;
    }
  }

  private setupTools() {
    this.server.registerTool(
      'get_ecosystem_tools',
      {
        title: 'List Ecosystem Tools',
        description: 'Get information about all available Rstack ecosystem tools and their documentation sites',
        inputSchema: {},
      },
      async () => {
        const tools = Object.entries(RSTACK_SITES).map(([key, site]) => ({
          id: key,
          name: site.name,
          description: site.description,
          url: site.url,
          docsUrl: site.docsUrl,
          type: site.type,
        }));
        return { content: [{ type: 'text', text: JSON.stringify({ ecosystem: 'Rstack', totalTools: tools.length, tools }, null, 2) }] };
      }
    );

    this.server.registerTool(
      'get_site_info',
      {
        title: 'Get Site Info',
        description: 'Get detailed information about a specific Rstack site',
        inputSchema: { site: z.enum(['rspack', 'rsbuild', 'rspress', 'rslib', 'rsdoctor', 'rstest', 'rslint']).describe('The Rstack site to get information about') },
      },
      async ({ site }) => {
        const siteInfo = (RSTACK_SITES as any)[site];
        if (!siteInfo) throw new Error(`Site '${site}' not found`);
        const documentationUrl = `${siteInfo.url}/llms.txt`;
        return { content: [{ type: 'text', text: JSON.stringify({ site, info: siteInfo, documentationUrl }, null, 2) }] };
      }
    );

    this.server.registerTool(
      'search',
      {
        title: 'Hybrid Search',
        description: 'Search Rstack documentation using hybrid (embeddings + lexical) across sites.',
        inputSchema: {
          query: z.string().describe('Search query to find relevant documentation pages'),
          site: z.enum(['rspack', 'rsbuild', 'rspress', 'rslib', 'rsdoctor', 'rstest', 'rslint', 'all']).optional().default('all').describe('Specific site to search, or "all" to search across all sites'),
          maxResults: z.number().optional().default(20).describe('Maximum number of pages to return'),
          includeContext: z.boolean().optional().default(true).describe('Include surrounding context in results'),
          semanticWeight: z.number().optional().default(0.5).describe('Weight for semantic search (0-1) when using hybrid mode'),
        },
      },
      async ({ query, site = 'all', maxResults = 20, includeContext = true, semanticWeight = 0.5 }) => {
        try {
          const searchResults = await this.advancedSearch(query, site, maxResults, includeContext, semanticWeight);
          return { content: [{ type: 'text', text: searchResults }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`, query, site }, null, 2) }] };
        }
      }
    );

    this.server.registerTool(
      'get_docs',
      {
        title: 'Get Site Docs',
        description: 'Fetch documentation content from a specific Rstack site',
        inputSchema: { site: z.enum(['rspack', 'rsbuild', 'rspress', 'rslib', 'rsdoctor', 'rstest', 'rslint']).describe('The Rstack site to fetch documentation from') },
      },
      async ({ site }) => {
        try {
          const docContent = await this.fetchDocumentation(site);
          return { content: [{ type: 'text', text: docContent }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: `Failed to fetch documentation: ${error instanceof Error ? error.message : 'Unknown error'}`, site, format: 'llms' }, null, 2) }] };
        }
      }
    );

    this.server.registerTool(
      'get_page',
      {
        title: 'Get Page',
        description: 'Fetch a specific documentation page from an Rstack site',
        inputSchema: { site: z.enum(['rspack', 'rsbuild', 'rspress', 'rslib', 'rsdoctor', 'rstest', 'rslint']).describe('The Rstack site to fetch from'), path: z.string().describe('The documentation path including extension (e.g., "/guide/getting-started.md")') },
      },
      async ({ site, path }) => {
        try {
          const siteInfo = (RSTACK_SITES as any)[site];
          if (!siteInfo) throw new Error(`Unknown site: ${site}`);
          const llmsContent = await this.fetchDocumentation(site);
          const markdownPath = this.findMarkdownPath(llmsContent, path);
          if (!markdownPath) throw new Error(`Path '${path}' not found in ${site} documentation`);
          const base = new URL(siteInfo.url);
          const resolved = this.resolveUrlOnSite(base, markdownPath);
          if (resolved.origin !== base.origin) throw new Error('Cross-origin markdown URL blocked');
          const markdownUrl = resolved.toString();
          const response = await this.fetchWithTimeout(markdownUrl);
          if (!response.ok) throw new Error(`Failed to fetch markdown: ${response.status}`);
          const markdownContent = await response.text();
          return { content: [{ type: 'text', text: JSON.stringify({ site, requestedPath: path, actualPath: markdownPath, url: markdownUrl, content: markdownContent, contentType: 'markdown' }, null, 2) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: `Failed to fetch page: ${error instanceof Error ? error.message : 'Unknown error'}`, site, path }, null, 2) }] };
        }
      }
    );

    this.server.registerTool(
      'list_pages',
      {
        title: 'List Pages',
        description: 'List all available documentation pages for a specific Rstack site, including page titles and h1-h3 headings',
        inputSchema: { site: z.enum(['rspack', 'rsbuild', 'rspress', 'rslib', 'rsdoctor', 'rstest', 'rslint']).describe('The Rstack site to list pages from') },
      },
      async ({ site }) => {
        try {
          const siteInfo = (RSTACK_SITES as any)[site];
          const llmsContent = await this.fetchDocumentation(site);
          const pages = parseAvailablePages(llmsContent);

          // Concurrency-limit heading fetches to reduce bursty load
          const limit = Number.isFinite(Number(process.env.MCP_LIST_PAGES_CONCURRENCY)) && Number(process.env.MCP_LIST_PAGES_CONCURRENCY) > 0
            ? Number(process.env.MCP_LIST_PAGES_CONCURRENCY)
            : 4;
          const enhancedPages: any[] = [];
          for (let i = 0; i < pages.length; i += limit) {
            const batch = pages.slice(i, i + limit);
            const batchRes = await Promise.all(batch.map(async (page) => {
              try {
                const markdownContent = await this.fetchMarkdownContent(siteInfo.url, page.path);
                const headings = extractMarkdownHeadings(markdownContent);
                const canonicalUrl = this.resolveUrlOnSite(new URL(siteInfo.url), page.path).toString();
                return { ...page, url: canonicalUrl, headings: headings.map((h) => ({ level: h.level, text: h.text })) };
              } catch (error) {
                process.stderr.write(`[WARNING] Failed to fetch headings for ${page.path}: ${error}\n`);
                const canonicalUrl = this.resolveUrlOnSite(new URL(siteInfo.url), page.path).toString();
                return { ...page, url: canonicalUrl, headings: [] as Array<{ level: number; text: string }> } as any;
              }
            }));
            enhancedPages.push(...batchRes);
          }

          const payload = { site, totalPages: enhancedPages.length, pages: enhancedPages };
          return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
        } catch (error) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: `Failed to list pages: ${error instanceof Error ? error.message : 'Unknown error'}`, site }, null, 2) }] };
        }
      }
    );
  }

  private async fetchDocumentation(site: string): Promise<string> {
    const siteInfo = (RSTACK_SITES as any)[site];
    if (!siteInfo) throw new Error(`Unknown site: ${site}`);
    const url = `${siteInfo.url}/llms.txt`;
    try {
      const response = await this.fetchWithTimeout(url);
      if (!response.ok) throw new Error(`Failed to fetch documentation: ${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      throw new Error(`Error fetching documentation from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private findMarkdownPath(llmsContent: string, requestedPath: string): string | null {
    const links = parseMarkdownLinks(llmsContent);
    for (const link of links) {
      if (link.path === requestedPath || link.path.endsWith(requestedPath)) return link.path;
    }
    for (const link of links) {
      if (link.path.includes(requestedPath) || requestedPath.includes(link.path)) return link.path;
    }
    return null;
  }

  private async advancedSearch(
    query: string,
    site: string,
    maxResults: number,
    includeContext: boolean,
    semanticWeight: number = 0.5
  ): Promise<string> {
    if (maxResults <= 0) {
      const sitesToSearch = site === 'all' ? Object.keys(RSTACK_SITES) : [site];
      return JSON.stringify({ query, searchMode: 'hybrid', searchedSites: sitesToSearch, totalResults: 0, results: [] }, null, 2);
    }
    const sitesToSearch = site === 'all' ? Object.keys(RSTACK_SITES) : [site];
    const blocks = await Promise.all(sitesToSearch.map(async (siteKey) => {
      try {
        const wantEmbeddings = semanticWeight > 0 && !this.disableEmbeddings;
        const indexingInProgress = this.isIndexing(siteKey);

        if (wantEmbeddings && indexingInProgress) {
          const index = await this.buildOrGetIndex(siteKey, false);
          const lexicalResults = await this.searchWithTFIDF(index, query, maxResults, includeContext);
          const augmented = lexicalResults.map((m) => ({
            ...m,
            searchType: 'lexical_fallback',
            reason: 'indexing_in_progress',
            fetchCommand: `Use get_page with site=\"${siteKey}\" and path=\"${m.file}\" to fetch full content`,
          }));
          return { site: siteKey, matches: augmented };
        }

        const index = await this.buildOrGetIndex(siteKey, wantEmbeddings);
        const searchResults = await this.hybridSearch(index, query, maxResults, includeContext, semanticWeight);
        const augmented = searchResults.map((m) => ({ ...m, fetchCommand: `Use get_page with site=\"${siteKey}\" and path=\"${m.file}\" to fetch full content` }));
        return { site: siteKey, matches: augmented };
      } catch (error) {
        process.stderr.write(`[ERROR] Failed to search ${siteKey}: ${error}\n`);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { site: siteKey, matches: [{ file: 'error', title: `Search failed for ${siteKey}`, context: message, score: 0, url: '' }] };
      }
    }));

    const totalResults = blocks.reduce((s, r) => s + (r.matches?.length || 0), 0);
    return JSON.stringify({ query, searchMode: 'hybrid', searchedSites: sitesToSearch, totalResults, results: blocks }, null, 2);
  }

  private async buildOrGetIndex(site: string, includeEmbeddings: boolean = false): Promise<DocumentIndex> {
    const wantEmbeddings = includeEmbeddings && !this.disableEmbeddings;
    const cacheKey = wantEmbeddings ? `${site}-with-embeddings` : site;
    const existingIndex = this.searchIndex.get(cacheKey);
    if (existingIndex && Date.now() - existingIndex.lastUpdated < this.indexTimeout) {
      if (wantEmbeddings) {
        const hasEmbeddings = Array.from(existingIndex.documents.values()).some((doc) => doc.embedding || doc.chunks);
        if (hasEmbeddings) return existingIndex;
      } else {
        return existingIndex;
      }
    }
    if (wantEmbeddings) {
      const cachedIndex = await this.loadIndexFromCache(site);
      if (cachedIndex) {
        this.searchIndex.set(cacheKey, cachedIndex);
        return cachedIndex;
      }
    }
    // Deduplicate concurrent indexing work per site when embeddings are requested
    if (wantEmbeddings) {
      const inflight = this.indexingPromises.get(site);
      if (inflight) return inflight;
      const promise = (async () => {
        const built = await this.buildSearchIndex(site, true);
        this.searchIndex.set(cacheKey, built);
        await this.saveIndexToCache(site, built);
        return built;
      })();
      this.indexingPromises.set(site, promise);
      try {
        const result = await promise;
        return result;
      } finally {
        this.indexingPromises.delete(site);
      }
    }

    const index = await this.buildSearchIndex(site, false);
    this.searchIndex.set(cacheKey, index);
    return index;
  }

  private async getCacheFilePath(site: string): Promise<string> {
    const hash = crypto.createHash('md5').update(`${site}-${this.embeddingModel}-v1`).digest('hex').substring(0, 8);
    return path.join(this.cacheDir, `${site}-${hash}.json`);
  }

  private async saveIndexToCache(site: string, index: DocumentIndex): Promise<void> {
    try {
      const cachePath = await this.getCacheFilePath(site);
      const serializable = {
        lastUpdated: index.lastUpdated,
        documents: Array.from(index.documents.entries()).map(([id, doc]) => ({ id, content: doc.content.substring(0, 1000), title: doc.title, url: doc.url, embedding: doc.embedding, chunks: doc.chunks })),
      };
      await fs.writeFile(cachePath, JSON.stringify(serializable), 'utf-8');
      process.stderr.write(`[INFO] Saved embedding cache for ${site} to ${cachePath}\n`);
    } catch (error) {
      process.stderr.write(`[WARNING] Failed to save cache: ${error}\n`);
    }
  }

  private async loadIndexFromCache(site: string): Promise<DocumentIndex | null> {
    try {
      const cachePath = await this.getCacheFilePath(site);
      try { await fs.access(cachePath); } catch { return null; }
      const stats = await fs.stat(cachePath);
      const age = Date.now() - stats.mtimeMs;
      // Expire embedding cache after 5 days
      if (age > 5 * 24 * 60 * 60 * 1000) { process.stderr.write(`[INFO] Cache for ${site} is too old (>5 days), rebuilding\n`); return null; }
      const data = await fs.readFile(cachePath, 'utf-8');
      const cached = JSON.parse(data);
      const index: DocumentIndex = { terms: new Map(), documents: new Map(), idf: new Map(), lastUpdated: cached.lastUpdated } as DocumentIndex;
      for (const doc of cached.documents) {
        index.documents.set(doc.id, { content: doc.content, title: doc.title, url: doc.url, termFreq: new Map(), embedding: doc.embedding, chunks: doc.chunks });
      }
      process.stderr.write(`[INFO] Loaded embedding cache for ${site} from ${cachePath}\n`);
      return index;
    } catch (error) {
      process.stderr.write(`[WARNING] Failed to load cache: ${error}\n`);
      return null;
    }
  }

  private isIndexing(site: string): boolean {
    return this.indexingPromises.has(site);
  }

  private async buildSearchIndex(site: string, includeEmbeddings: boolean = false): Promise<DocumentIndex> {
    const siteInfo = (RSTACK_SITES as any)[site];
    const index: DocumentIndex = { terms: new Map(), documents: new Map(), idf: new Map(), lastUpdated: Date.now() } as DocumentIndex;
    if (includeEmbeddings && !this.disableEmbeddings) await this.ensureEmbeddingModel();
    const llmsContent = await this.fetchDocumentation(site);
    const markdownFiles = parseMarkdownLinks(llmsContent);
    
    // Filter out blog-related pages and problematic files to focus on documentation
    const filteredMarkdownFiles = markdownFiles.filter(mdFile => {
      const path = mdFile.path.toLowerCase();
      const title = mdFile.title.toLowerCase();
      
      // Skip blog pages
      if (path.includes('/blog/') || path.startsWith('/blog/')) {
        return false;
      }
      
      // Skip malformed links where title is just the path (indicates empty link text)
      if (title === path || title.startsWith('/')) {
        return false;
      }
      
      // Skip known problematic shared files that don't exist
      if (path.includes('-shared.md')) {
        return false;
      }
      
      return true;
    });
    
    process.stderr.write(`[INFO] Indexing ${filteredMarkdownFiles.length} pages for ${site} (filtered out ${markdownFiles.length - filteredMarkdownFiles.length} blog pages)\n`);
    
    await this.indexDocument(index, 'llms.txt', 'Documentation Index', llmsContent, `${siteInfo.url}/llms.txt`, includeEmbeddings);
    const batchSize = includeEmbeddings ? 3 : 5;
    for (let i = 0; i < filteredMarkdownFiles.length; i += batchSize) {
      const batch = filteredMarkdownFiles.slice(i, i + batchSize);
      const batchPromises = batch.map(async (mdFile) => {
        try {
          const content = await this.fetchMarkdownContent(siteInfo.url, mdFile.path);
          const docId = mdFile.path; const url = `${siteInfo.url}${mdFile.path}`;
          await this.indexDocument(index, docId, mdFile.title, content, url, includeEmbeddings);
        } catch (error) { console.error(`Failed to index ${mdFile.path}:`, error); }
      });
      await Promise.all(batchPromises);
    }
    this.calculateIDF(index);
    try {
      const tfidf = new natural.TfIdf();
      for (const [, doc] of index.documents) tfidf.addDocument(doc.content);
      index.tfidf = tfidf;
    } catch (e) { process.stderr.write(`[WARNING] Failed to build TF-IDF model: ${e}\n`); }
    return index;
  }

  private async indexDocument(
    index: DocumentIndex,
    docId: string,
    title: string,
    content: string,
    url: string,
    includeEmbeddings: boolean = false
  ): Promise<void> {
    const tokens = tokenize(content.toLowerCase());
    const termFreq = new Map<string, number>();
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
      if (!index.terms.has(token)) index.terms.set(token, new Set());
      index.terms.get(token)!.add(docId);
    }
    let embedding: number[] | undefined;
    let chunks: Array<{ text: string; embedding: number[] }> | undefined;
    if (includeEmbeddings) {
      if (!this.disableEmbeddings && this.embeddingPipeline) {
        try {
          if (content.length < 2000) {
            const embeddingText = `${title} ${content.substring(0, 512)}`;
            embedding = await this.generateEmbedding(embeddingText);
          } else {
            chunks = await this.createChunkedEmbeddings(content, 512, 128);
          }
        } catch (error) {
          process.stderr.write(`[WARNING] Failed to generate embeddings for ${docId}: ${error}\n`);
        }
      }
    }
    index.documents.set(docId, { content, title, url, termFreq, embedding, chunks });
  }

  private calculateIDF(index: DocumentIndex): void {
    const numDocs = index.documents.size;
    for (const [term, docSet] of index.terms.entries()) {
      const docsWithTerm = docSet.size;
      const idf = Math.log((numDocs + 1) / (docsWithTerm + 1));
      index.idf.set(term, idf);
    }
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    if (!this.embeddingPipeline) throw new Error('Embedding model not initialized');
    const output = await this.embeddingPipeline(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
  }

  private async createChunkedEmbeddings(text: string, chunkSize: number = 1200, overlap: number = 200): Promise<Array<{ text: string; embedding: number[] }>> {
    const chunks: Array<{ text: string; embedding: number[] }> = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    let buffer = '';
    for (const s of sentences) {
      if ((buffer + ' ' + s).length < chunkSize) buffer += (buffer ? ' ' : '') + s;
      else {
        if (buffer.trim().length > 50) {
          try { const embedding = await this.generateEmbedding(buffer); chunks.push({ text: buffer, embedding }); } catch (e) { console.error('Failed to generate chunk embedding:', e); }
        }
        const tail = buffer.slice(-overlap);
        buffer = tail + ' ' + s;
      }
    }
    if (buffer.trim().length > 50) {
      try { const embedding = await this.generateEmbedding(buffer); chunks.push({ text: buffer, embedding }); } catch (e) { console.error('Failed to generate chunk embedding:', e); }
    }
    return chunks;
  }

  private async searchWithSemantics(index: DocumentIndex, query: string, maxResults: number, includeContext: boolean) {
    const modelReady = await this.ensureEmbeddingModel();
    if (!modelReady || !this.embeddingPipeline) { process.stderr.write('[WARNING] Semantic search requested but embedding model not available\n'); return [] as any[]; }
    const queryEmbedding = await this.generateEmbedding(query);
    const scores = new Map<string, number>();
    for (const [docId, doc] of index.documents) {
      let maxScore = 0;
      if (doc.embedding) maxScore = Math.max(maxScore, cosineSimilarity(queryEmbedding, doc.embedding));
      if (doc.chunks) for (const chunk of doc.chunks) maxScore = Math.max(maxScore, cosineSimilarity(queryEmbedding, chunk.embedding));
      if (maxScore > 0) scores.set(docId, maxScore);
    }
    const sortedDocs = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]).slice(0, maxResults);
    return sortedDocs.map(([docId, score]) => {
      const doc = index.documents.get(docId)!;
      const result: any = { file: docId, title: doc.title, score: Math.round(score * 1000) / 1000, url: doc.url };
      if (includeContext) {
        const queryTokens = tokenize(query.toLowerCase());
        const highlights = extractHighlights(doc.content, queryTokens);
        result.highlights = highlights; result.context = highlights.join('\n...\n');
      }
      return result;
    });
  }

  private async hybridSearch(index: DocumentIndex, query: string, maxResults: number, includeContext: boolean, semanticWeight: number = 0.5) {
    const tfidfResults = await this.searchWithTFIDF(index, query, maxResults * 2, false);
    const tfidfScores = new Map<string, number>();
    for (const result of tfidfResults) tfidfScores.set(result.file, result.score);

    let semanticScores = new Map<string, number>();
    const modelReady = await this.ensureEmbeddingModel();
    if (modelReady && this.embeddingPipeline) {
      const semanticResults = await this.searchWithSemantics(index, query, maxResults * 2, false);
      for (const result of semanticResults) semanticScores.set(result.file, result.score);
    }

    const combinedScores = new Map<string, number>();
    const allDocs = new Set([...tfidfScores.keys(), ...semanticScores.keys()]);
    for (const docId of allDocs) {
      const tfidfScore = tfidfScores.get(docId) || 0;
      const semanticScore = semanticScores.get(docId) || 0;
      const maxTfidf = Math.max(...(tfidfScores.size ? tfidfScores.values() : [1]));
      const normalizedTfidf = maxTfidf && isFinite(maxTfidf) ? tfidfScore / maxTfidf : 0;
      // Clamp semantic score into [0,1] to align scales
      const normalizedSemantic = Math.max(0, Math.min(1, semanticScore));
      const combinedScore = (1 - semanticWeight) * normalizedTfidf + semanticWeight * normalizedSemantic;
      combinedScores.set(docId, combinedScore);
    }
    const thresholdEnv = process.env.MCP_HYBRID_SCORE_THRESHOLD;
    const scoreThreshold = Number.isFinite(Number(thresholdEnv)) ? Number(thresholdEnv) : 0.05;
    const sortedDocs = Array.from(combinedScores.entries())
      .filter(([, s]) => s >= scoreThreshold)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxResults);
    return sortedDocs.map(([docId, score]) => {
      const doc = index.documents.get(docId)!;
      const result: any = { file: docId, title: doc.title, score: Math.round(score * 1000) / 1000, url: doc.url, searchType: 'hybrid' };
      if (includeContext) {
        const queryTokens = tokenize(query.toLowerCase());
        const highlights = extractHighlights(doc.content, queryTokens);
        result.highlights = highlights; result.context = highlights.join('\n...\n');
      }
      return result;
    });
  }

  private async searchWithTFIDF(index: DocumentIndex, query: string, maxResults: number, includeContext: boolean) {
    const queryTokens = tokenize(query.toLowerCase());
    const scores = new Map<string, number>();

    // Prefer prebuilt model if available to avoid rebuilding redundantly
    let tfidf = index.tfidf;
    const docIds = Array.from(index.documents.keys());
    if (!tfidf) {
      tfidf = new natural.TfIdf();
      for (const [, doc] of index.documents) tfidf.addDocument(doc.content);
    }
    tfidf.tfidfs(queryTokens.join(' '), (i: number, measure: number) => {
      if (measure > 0 && i < docIds.length) scores.set(docIds[i], measure);
    });

    const fuseOptions = { includeScore: true, threshold: 0.4, keys: ['title', 'content'], minMatchCharLength: 3, shouldSort: true } as const;
    const documents = Array.from(index.documents.entries()).map(([id, doc]) => ({ id, title: doc.title, content: doc.content.substring(0, 1000), url: doc.url }));
    const fuse = new (Fuse as any)(documents, fuseOptions);
    const fuseResults = fuse.search(query);
    for (const result of fuseResults) {
      const currentScore = scores.get(result.item.id) || 0;
      const fuseScore = 1 - (result.score || 0);
      scores.set(result.item.id, currentScore + fuseScore * 0.3);
    }

    const queryLower = query.toLowerCase();
    for (const [docId, doc] of index.documents) {
      if (doc.content.toLowerCase().includes(queryLower)) scores.set(docId, (scores.get(docId) || 0) + 5);
    }

    const sortedDocs = Array.from(scores.entries()).filter(([_, score]) => score > 0).sort((a, b) => b[1] - a[1]).slice(0, maxResults);
    return sortedDocs.map(([docId, score]) => {
      const doc = index.documents.get(docId)!;
      const result: any = { file: docId, title: doc.title, score: Math.round(score * 1000) / 1000, url: doc.url };
      if (includeContext) {
        const highlights = extractHighlights(doc.content, queryTokens);
        result.highlights = highlights; result.context = highlights.join('\n...\n');
      }
      return result;
    });
  }



  private async fetchMarkdownContent(baseUrl: string, p: string): Promise<string> {
    const base = new URL(baseUrl);
    const resolved = this.resolveUrlOnSite(base, p);
    if (resolved.origin !== base.origin) throw new Error('Cross-origin markdown URL blocked');
    const fullUrl = resolved.toString();
    const cacheKey = fullUrl;
    const cached = this.documentCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) return cached.content;
    try {
      const response = await this.fetchWithTimeout(fullUrl);
      if (!response.ok) throw new Error(`Failed to fetch ${fullUrl}: ${response.status}`);
      const content = await response.text();
      this.setDocumentCache(cacheKey, { content, timestamp: Date.now() });
      return content;
    } catch (error) {
      throw new Error(`Error fetching markdown from ${fullUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Normalize any absolute .dev links to their .rs counterparts and resolve relative paths against the site base
  private resolveUrlOnSite(base: URL, pathOrUrl: string): URL {
    let u = new URL(pathOrUrl, base);
    const mapped = this.devToRsHost[u.hostname];
    if (mapped) {
      const tmp = new URL(u.toString());
      tmp.hostname = mapped;
      // Ensure scheme remains https
      tmp.protocol = 'https:';
      u = tmp;
    }
    return u;
  }

  private setDocumentCache(key: string, value: { content: string; timestamp: number }) {
    const MAX_ENTRIES = 200;
    this.documentCache.set(key, value);
    if (this.documentCache.size > MAX_ENTRIES) {
      let oldestKey: string | null = null;
      let oldestTs = Infinity;
      for (const [k, v] of this.documentCache.entries()) { if (v.timestamp < oldestTs) { oldestTs = v.timestamp; oldestKey = k; } }
      if (oldestKey) this.documentCache.delete(oldestKey);
    }
  }

  private async startBackgroundIndexing(): Promise<void> {
    if (this.disableEmbeddings) {
      process.stderr.write('[INFO] Background indexing skipped (embeddings disabled)\n');
      return;
    }

    process.stderr.write('[INFO] Starting background indexing of all sites...\n');
    
    // Get all site keys from RSTACK_SITES
    const siteKeys = Object.keys(RSTACK_SITES) as Array<keyof typeof RSTACK_SITES>;
    
    // Concurrency-limit indexing across sites
    const maxConcEnv = process.env.MCP_INDEX_CONCURRENCY;
    const maxConc = Number.isFinite(Number(maxConcEnv)) && Number(maxConcEnv) > 0 ? Number(maxConcEnv) : 2;
    for (let i = 0; i < siteKeys.length; i += maxConc) {
      const batch = siteKeys.slice(i, i + maxConc);
      const batchPromises = batch.map(async (site) => {
        try {
          process.stderr.write(`[INFO] Starting background indexing for ${site}...\n`);
          await this.buildOrGetIndex(site, true); // Include embeddings
          process.stderr.write(`[INFO] Background indexing completed for ${site}\n`);
        } catch (error) {
          process.stderr.write(`[WARNING] Background indexing failed for ${site}: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
        }
      });
      await Promise.allSettled(batchPromises);
    }
    process.stderr.write('[INFO] Background indexing process completed for all sites\n');
  }

  private async fetchWithTimeout(url: string, timeoutMs: number = this.fetchTimeoutMs, retries: number = 1): Promise<any> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      let timeout: NodeJS.Timeout | null = null;
      
      // Only set timeout if timeoutMs > 0 (disable timeout when set to 0)
      if (timeoutMs > 0) {
        timeout = setTimeout(() => controller.abort(), timeoutMs);
      }
      
      try {
        const res = await fetch(url, { signal: controller.signal } as any);
        if (timeout) clearTimeout(timeout);
        return res;
      } catch (err) {
        if (timeout) clearTimeout(timeout);
        if (attempt === retries) throw err;
        await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));
      }
    }
    throw new Error('Unreachable');
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    process.stderr.write('[INFO] Wiggum MCP DocExplorer Server running on stdio\n');
    
    // Start background indexing (non-blocking)
    this.startBackgroundIndexing().catch((error) => {
      process.stderr.write(`[ERROR] Background indexing failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    });
  }
}
