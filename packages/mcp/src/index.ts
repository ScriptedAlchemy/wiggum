#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import natural from 'natural';
import { removeStopwords } from 'stopword';
import Fuse from 'fuse.js';
import { pipeline, env } from '@xenova/transformers';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// Configure transformers.js for Node.js
env.allowLocalModels = false;
env.useBrowserCache = false;

// AI-optimized MCP server for Rstack ecosystem documentation

const RSTACK_SITES = {
  rspack: {
    name: 'Rspack',
    description: 'Fast Rust-based web bundler',
    url: 'https://rspack.rs',
    docsUrl: 'https://rspack.rs/guide',
    type: 'bundler',
  },
  rsbuild: {
    name: 'Rsbuild',
    description: 'Rspack-based build tool',
    url: 'https://rsbuild.rs',
    docsUrl: 'https://rsbuild.rs/guide',
    type: 'build-tool',
  },
  rspress: {
    name: 'Rspress',
    description: 'Static site generator',
    url: 'https://rspress.rs',
    docsUrl: 'https://rspress.rs/guide',
    type: 'static-site-generator',
  },
  rslib: {
    name: 'Rslib',
    description: 'Library development tool',
    url: 'https://rslib.rs',
    docsUrl: 'https://rslib.rs/guide',
    type: 'library-tool',
  },
  rsdoctor: {
    name: 'Rsdoctor',
    description: 'Build analyzer',
    url: 'https://rsdoctor.rs',
    docsUrl: 'https://rsdoctor.rs/guide',
    type: 'analyzer',
  },
  rstest: {
    name: 'Rstest',
    description: 'Testing framework',
    url: 'https://rstest.rs',
    docsUrl: 'https://rstest.rs/guide',
    type: 'testing-framework',
  },
  rslint: {
    name: 'Rslint',
    description: 'JavaScript and TypeScript linter',
    url: 'https://rslint.rs',
    docsUrl: 'https://rslint.rs/guide',
    type: 'linter',
  },
};

interface DocumentIndex {
  terms: Map<string, Set<string>>; // term -> set of doc IDs
  documents: Map<string, { 
    content: string; 
    title: string; 
    url: string; 
    termFreq: Map<string, number>;
    embedding?: number[]; // semantic embedding vector
    chunks?: Array<{ text: string; embedding: number[] }>; // chunked embeddings for long docs
  }>;
  idf: Map<string, number>; // inverse document frequency cache
  lastUpdated: number;
}


class WiggumMCPServer {
  private server: McpServer;
  private documentCache: Map<string, { content: string; timestamp: number }>;
  private searchIndex: Map<string, DocumentIndex>; // site -> index
  private cacheTimeout = 10 * 60 * 1000; // 10 minutes cache
  private indexTimeout = 30 * 60 * 1000; // 30 minutes for search index
  private embeddingPipeline: any = null;
  private embeddingModel = 'Xenova/all-MiniLM-L6-v2'; // Fast, lightweight model
  private modelInitPromise: Promise<void> | null = null;
  private cacheDir: string;

  constructor() {
    this.server = new McpServer(
      {
        name: 'wiggum-mcp-docexplorer',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Set up cache directory
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.cacheDir = path.join(__dirname, '.embedding_cache');
    
    this.documentCache = new Map();
    this.searchIndex = new Map();
    this.setupTools();
    this.initializeCacheDir();
    // Initialize model lazily on first use
    this.modelInitPromise = null;
  }
  
  private async initializeCacheDir() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      process.stderr.write(`[WARNING] Could not create cache directory: ${error}\n`);
    }
  }

  private async ensureEmbeddingModel(): Promise<boolean> {
    // If already initialized, return status
    if (this.embeddingPipeline !== null) {
      return true;
    }
    
    // If initialization is in progress, wait for it
    if (this.modelInitPromise !== null) {
      await this.modelInitPromise;
      return this.embeddingPipeline !== null;
    }
    
    // Start initialization
    this.modelInitPromise = this.initializeEmbeddingModel();
    await this.modelInitPromise;
    return this.embeddingPipeline !== null;
  }

  private async initializeEmbeddingModel(): Promise<void> {
    try {
      // Use stderr for info messages but prefix them clearly
      process.stderr.write(`[INFO] Initializing embedding model: ${this.embeddingModel}\n`);
      this.embeddingPipeline = await pipeline(
        'feature-extraction',
        this.embeddingModel,
        { quantized: true } // Use quantized model for faster inference
      );
      process.stderr.write('[INFO] Embedding model loaded successfully\n');
    } catch (error) {
      process.stderr.write(`[ERROR] Failed to load embedding model: ${error}\n`);
      process.stderr.write('[WARNING] Semantic search will be disabled\n');
      this.embeddingPipeline = null;
    }
  }

  private setupTools() {
    // AI-optimized tools for documentation exploration

    // Register get_ecosystem_tools tool
    this.server.registerTool(
      'get_ecosystem_tools',
      {
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
          type: site.type
        }));
        
        return {
          content: [{ 
            type: 'text', 
            text: JSON.stringify({
              ecosystem: 'Rstack',
              totalTools: tools.length,
              tools
            }, null, 2)
          }],
        };
      }
    );

    // Register get_site_info tool
    this.server.registerTool(
      'get_site_info',
      {
        description: 'Get detailed information about a specific Rstack site',
        inputSchema: {
          site: z.enum(['rspack', 'rsbuild', 'rspress', 'rslib', 'rsdoctor', 'rstest', 'rslint']).describe('The Rstack site to get information about')
        },
      },
      async ({ site }) => {
        const siteInfo = RSTACK_SITES[site as keyof typeof RSTACK_SITES];
        
        if (!siteInfo) {
          throw new Error(`Site '${site}' not found`);
        }
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              id: site,
              name: siteInfo.name,
              description: siteInfo.description,
              url: siteInfo.url,
              docsUrl: siteInfo.docsUrl,
              type: siteInfo.type
            }, null, 2),
          }],
        };
      }
    );

    // Register search_docs tool - returns pages that match the query
    this.server.registerTool(
      'search_docs',
      {
        description: 'Search for documentation pages. Returns matching pages with previews. Use get_page to fetch full page content.',
        inputSchema: {
          query: z.string().describe('Search query to find relevant documentation pages'),
          site: z.enum(['rspack', 'rsbuild', 'rspress', 'rslib', 'rsdoctor', 'rstest', 'rslint', 'all']).optional().default('all').describe('Specific site to search, or "all" to search across all sites'),
          maxResults: z.number().optional().default(10).describe('Maximum number of pages to return')
        },
      },
      async ({ query, site = 'all', maxResults = 10 }) => {
        try {
          // Use hybrid search with optimized settings
          const searchResults = await this.hybridSearchDocumentation(query, site, maxResults);
          return {
            content: [{ type: 'text', text: searchResults }],
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                query,
                site
              }, null, 2),
            }],
          };
        }
      }
    );

    // Register advanced_search tool for more sophisticated searches
    this.server.registerTool(
      'advanced_search',
      {
        description: 'Advanced search with options for deep markdown crawling and filtering',
        inputSchema: {
          query: z.string().describe('Search query for documentation'),
          site: z.enum(['rspack', 'rsbuild', 'rspress', 'rslib', 'rsdoctor', 'rstest', 'rslint', 'all']).optional().default('all').describe('Specific site to search'),
          searchMode: z.enum(['quick', 'deep', 'index_only', 'semantic', 'hybrid']).optional().default('hybrid').describe('Search mode: quick (llms.txt only), deep (TF-IDF), semantic (embeddings), hybrid (TF-IDF + semantic)'),
          maxResults: z.number().optional().default(20).describe('Maximum number of results per site'),
          includeContext: z.boolean().optional().default(true).describe('Include surrounding context in results'),
          semanticWeight: z.number().optional().default(0.5).describe('Weight for semantic search (0-1) when using hybrid mode')
        },
      },
      async ({ query, site = 'all', searchMode = 'hybrid', maxResults = 20, includeContext = true, semanticWeight = 0.5 }) => {
        try {
          const searchResults = await this.advancedSearch(query, site, searchMode, maxResults, includeContext, semanticWeight);
          return {
            content: [{ type: 'text', text: searchResults }],
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: `Advanced search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                query,
                site,
                searchMode
              }, null, 2),
            }],
          };
        }
      }
    );

    // Register get_docs tool
    this.server.registerTool(
      'get_docs',
      {
        description: 'Fetch documentation content from a specific Rstack site',
        inputSchema: {
          site: z.enum(['rspack', 'rsbuild', 'rspress', 'rslib', 'rsdoctor', 'rstest', 'rslint']).describe('The Rstack site to fetch documentation from'),
          format: z.enum(['llms', 'guide', 'api']).optional().default('llms').describe('Format of documentation to fetch (llms.txt, guide, or api)')
        },
      },
      async ({ site, format = 'llms' }) => {
        try {
          const docContent = await this.fetchDocumentation(site, format);
          return {
            content: [{ type: 'text', text: docContent }],
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: `Failed to fetch documentation: ${error instanceof Error ? error.message : 'Unknown error'}`,
                site,
                format
              }, null, 2),
            }],
          };
        }
      }
    );

    // Register get_page tool - fetch markdown content from llms.txt navigation
    this.server.registerTool(
      'get_page',
      {
        description: 'Fetch a specific documentation page from an Rstack site',
        inputSchema: {
          site: z.enum(['rspack', 'rsbuild', 'rspress', 'rslib', 'rsdoctor', 'rstest', 'rslint']).describe('The Rstack site to fetch from'),
          path: z.string().describe('The documentation path (e.g., "/guide/getting-started")')
        },
      },
      async ({ site, path }) => {
        try {
          const siteInfo = RSTACK_SITES[site as keyof typeof RSTACK_SITES];
          if (!siteInfo) throw new Error(`Unknown site: ${site}`);
          
          // First, get the llms.txt to find the actual markdown file
          const llmsContent = await this.fetchDocumentation(site, 'llms');
          const markdownPath = this.findMarkdownPath(llmsContent, path);
          
          if (!markdownPath) {
            throw new Error(`Path '${path}' not found in ${site} documentation`);
          }
          
          // Fetch the actual markdown content
          const markdownUrl = `${siteInfo.url}${markdownPath}`;
          const response = await fetch(markdownUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch markdown: ${response.status}`);
          }
          
          const markdownContent = await response.text();
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                site,
                requestedPath: path,
                actualPath: markdownPath,
                url: markdownUrl,
                content: markdownContent,
                contentType: 'markdown'
              }, null, 2)
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: `Failed to fetch page: ${error instanceof Error ? error.message : 'Unknown error'}`,
                site,
                path
              }, null, 2)
            }],
          };
        }
      }
    );

    // Register list_pages tool - list all available pages from llms.txt
    this.server.registerTool(
      'list_pages',
      {
        description: 'List all available documentation pages for a specific Rstack site',
        inputSchema: {
          site: z.enum(['rspack', 'rsbuild', 'rspress', 'rslib', 'rsdoctor', 'rstest', 'rslint']).describe('The Rstack site to list pages from')
        },
      },
      async ({ site }) => {
        try {
          const llmsContent = await this.fetchDocumentation(site, 'llms');
          const pages = this.parseAvailablePages(llmsContent);
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                site,
                totalPages: pages.length,
                pages
              }, null, 2)
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: `Failed to list pages: ${error instanceof Error ? error.message : 'Unknown error'}`,
                site
              }, null, 2)
            }],
          };
        }
      }
    );
  }

  private async fetchDocumentation(site: string, format: string): Promise<string> {
    const siteInfo = RSTACK_SITES[site as keyof typeof RSTACK_SITES];
    if (!siteInfo) {
      throw new Error(`Unknown site: ${site}`);
    }

    let url: string;
    switch (format) {
      case 'llms':
        url = `${siteInfo.url}/llms.txt`;
        break;
      case 'guide':
        url = siteInfo.docsUrl;
        break;
      case 'api':
        url = `${siteInfo.url}/api`;
        break;
      default:
        throw new Error(`Unknown format: ${format}`);
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch documentation: ${response.status} ${response.statusText}`);
      }
      return await response.text();
    } catch (error) {
      throw new Error(`Error fetching documentation from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private findMarkdownPath(llmsContent: string, requestedPath: string): string | null {
    const lines = llmsContent.split('\n');
    
    // Look for markdown links in the format [Title](/path/to/file.md)
    for (const line of lines) {
      const markdownLinkMatch = line.match(/\[([^\]]+)\]\(([^)]+\.md)\)/);
      if (markdownLinkMatch) {
        const [, title, mdPath] = markdownLinkMatch;
        
        // Check if the requested path matches the markdown path or title
        if (mdPath === requestedPath || 
            mdPath.includes(requestedPath) || 
            requestedPath.includes(mdPath.replace('.md', '')) ||
            title.toLowerCase().includes(requestedPath.toLowerCase().replace(/[\/\-]/g, ' ')) ||
            requestedPath.toLowerCase().includes(title.toLowerCase().replace(/[\s\-]/g, ''))) {
          return mdPath;
        }
      }
    }
    
    // If no exact match, try to find a partial match
    for (const line of lines) {
      const markdownLinkMatch = line.match(/\[([^\]]+)\]\(([^)]+\.md)\)/);
      if (markdownLinkMatch) {
        const [, title, mdPath] = markdownLinkMatch;
        const pathParts = requestedPath.split('/').filter(p => p);
        
        // Check if any part of the requested path matches
        if (pathParts.some(part => mdPath.includes(part) || title.toLowerCase().includes(part.toLowerCase()))) {
          return mdPath;
        }
      }
    }
    
    return null;
  }

  private async advancedSearch(
    query: string,
    site: string,
    searchMode: string,
    maxResults: number,
    includeContext: boolean,
    semanticWeight: number = 0.5
  ): Promise<string> {
    const sitesToSearch = site === 'all' ? Object.keys(RSTACK_SITES) : [site];
    const results: Array<{
      site: string;
      matches: Array<{
        file: string;
        title: string;
        context?: string;
        score: number;
        url?: string;
        highlights?: string[];
      }>;
    }> = [];

    for (const siteKey of sitesToSearch) {
      try {
        // Build or retrieve index
        const index = await this.buildOrGetIndex(siteKey, searchMode === 'semantic' || searchMode === 'hybrid');
        
        let searchResults;
        
        if (searchMode === 'semantic') {
          searchResults = await this.searchWithSemantics(index, query, maxResults, includeContext);
        } else if (searchMode === 'hybrid') {
          searchResults = await this.hybridSearch(index, query, maxResults, includeContext, semanticWeight);
        } else {
          searchResults = await this.searchWithTFIDF(index, query, maxResults, includeContext);
        }
        
        if (searchResults.length > 0) {
          results.push({
            site: siteKey,
            matches: searchResults
          });
        }
      } catch (error) {
        process.stderr.write(`[ERROR] Failed to search ${siteKey}: ${error}\n`);
        // Include error details in results for debugging
        if (error instanceof Error) {
          results.push({
            site: siteKey,
            matches: [{
              file: 'error',
              title: `Search failed for ${siteKey}`,
              context: error.message,
              score: 0,
              url: ''
            }]
          });
        }
      }
    }

    return JSON.stringify({
      query,
      searchMode,
      searchedSites: sitesToSearch,
      totalResults: results.reduce((sum, r) => sum + r.matches.length, 0),
      results
    }, null, 2);
  }

  private async buildOrGetIndex(site: string, includeEmbeddings: boolean = false): Promise<DocumentIndex> {
    const cacheKey = includeEmbeddings ? `${site}-with-embeddings` : site;
    
    // Try to load from memory cache first
    const existingIndex = this.searchIndex.get(cacheKey);
    
    // Check if index is still valid and has the required embeddings
    if (existingIndex && Date.now() - existingIndex.lastUpdated < this.indexTimeout) {
      // If we need embeddings, check if the index has them
      if (includeEmbeddings) {
        // Check if at least some documents have embeddings
        const hasEmbeddings = Array.from(existingIndex.documents.values()).some(
          doc => doc.embedding || doc.chunks
        );
        if (hasEmbeddings) {
          return existingIndex;
        }
        // Otherwise, rebuild with embeddings
      } else {
        // For non-embedding searches, any index is fine
        return existingIndex;
      }
    }
    
    // Try to load from disk cache if embeddings are needed
    if (includeEmbeddings) {
      const cachedIndex = await this.loadIndexFromCache(site);
      if (cachedIndex) {
        this.searchIndex.set(cacheKey, cachedIndex);
        return cachedIndex;
      }
    }
    
    // Build new index
    const index = await this.buildSearchIndex(site, includeEmbeddings);
    this.searchIndex.set(cacheKey, index);
    
    // Save to disk if it includes embeddings
    if (includeEmbeddings) {
      await this.saveIndexToCache(site, index);
    }
    
    return index;
  }
  
  private async getCacheFilePath(site: string): Promise<string> {
    // Create a hash of the site and model to ensure cache invalidation on changes
    const hash = crypto
      .createHash('md5')
      .update(`${site}-${this.embeddingModel}-v1`)
      .digest('hex')
      .substring(0, 8);
    return path.join(this.cacheDir, `${site}-${hash}.json`);
  }
  
  private async saveIndexToCache(site: string, index: DocumentIndex): Promise<void> {
    try {
      const cachePath = await this.getCacheFilePath(site);
      
      // Convert the index to a serializable format
      const serializable = {
        lastUpdated: index.lastUpdated,
        documents: Array.from(index.documents.entries()).map(([id, doc]) => ({
          id,
          content: doc.content.substring(0, 1000), // Store partial content to save space
          title: doc.title,
          url: doc.url,
          embedding: doc.embedding,
          chunks: doc.chunks
        })),
        // We don't need to store terms and IDF as they can be rebuilt quickly
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
      
      // Check if cache file exists
      try {
        await fs.access(cachePath);
      } catch {
        return null; // File doesn't exist
      }
      
      // Check file age
      const stats = await fs.stat(cachePath);
      const age = Date.now() - stats.mtimeMs;
      if (age > 7 * 24 * 60 * 60 * 1000) { // 7 days
        process.stderr.write(`[INFO] Cache for ${site} is too old, rebuilding\n`);
        return null;
      }
      
      // Load and parse cache
      const data = await fs.readFile(cachePath, 'utf-8');
      const cached = JSON.parse(data);
      
      // Reconstruct the index
      const index: DocumentIndex = {
        terms: new Map(),
        documents: new Map(),
        idf: new Map(),
        lastUpdated: cached.lastUpdated
      };
      
      // Restore documents with embeddings
      for (const doc of cached.documents) {
        // For cached items, we need to fetch full content again
        // but we keep the embeddings to save computation
        index.documents.set(doc.id, {
          content: doc.content, // This is partial, but enough for display
          title: doc.title,
          url: doc.url,
          termFreq: new Map(), // Will be empty but not used for semantic search
          embedding: doc.embedding,
          chunks: doc.chunks
        });
      }
      
      process.stderr.write(`[INFO] Loaded embedding cache for ${site} from ${cachePath}\n`);
      return index;
    } catch (error) {
      process.stderr.write(`[WARNING] Failed to load cache: ${error}\n`);
      return null;
    }
  }

  private async buildSearchIndex(site: string, includeEmbeddings: boolean = false): Promise<DocumentIndex> {
    const siteInfo = RSTACK_SITES[site as keyof typeof RSTACK_SITES];
    const index: DocumentIndex = {
      terms: new Map(),
      documents: new Map(),
      idf: new Map(),
      lastUpdated: Date.now()
    };
    
    // Fetch llms.txt
    const llmsContent = await this.fetchDocumentation(site, 'llms');
    const markdownFiles = this.extractAllMarkdownLinks(llmsContent);
    
    // Index llms.txt
    await this.indexDocument(index, 'llms.txt', 'Documentation Index', llmsContent, `${siteInfo.url}/llms.txt`, includeEmbeddings);
    
    // Fetch and index all markdown files in parallel (with rate limiting)
    const batchSize = includeEmbeddings ? 3 : 5; // Smaller batches when computing embeddings
    for (let i = 0; i < markdownFiles.length; i += batchSize) {
      const batch = markdownFiles.slice(i, i + batchSize);
      const batchPromises = batch.map(async (mdFile) => {
        try {
          const content = await this.fetchMarkdownContent(siteInfo.url, mdFile.path);
          const docId = mdFile.path;
          const url = `${siteInfo.url}${mdFile.path}`;
          await this.indexDocument(index, docId, mdFile.title, content, url, includeEmbeddings);
        } catch (error) {
          console.error(`Failed to index ${mdFile.path}:`, error);
        }
      });
      await Promise.all(batchPromises);
    }
    
    // Calculate IDF values
    this.calculateIDF(index);
    
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
    // Tokenize and normalize content
    const tokens = this.tokenize(content.toLowerCase());
    const termFreq = new Map<string, number>();
    
    // Calculate term frequencies
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
      
      // Update inverted index
      if (!index.terms.has(token)) {
        index.terms.set(token, new Set());
      }
      index.terms.get(token)!.add(docId);
    }
    
    // Create embeddings if requested and model is available
    let embedding: number[] | undefined;
    let chunks: Array<{ text: string; embedding: number[] }> | undefined;
    
    if (includeEmbeddings) {
      // Ensure model is loaded before trying to generate embeddings
      const modelReady = await this.ensureEmbeddingModel();
      
      if (modelReady && this.embeddingPipeline) {
        try {
          // For short documents, embed the whole content
          if (content.length < 2000) {
            const embeddingText = `${title} ${content.substring(0, 512)}`;
            embedding = await this.generateEmbedding(embeddingText);
          } else {
            // For longer documents, create chunked embeddings
            chunks = await this.createChunkedEmbeddings(content, 512, 128);
          }
        } catch (error) {
          process.stderr.write(`[WARNING] Failed to generate embeddings for ${docId}: ${error}\n`);
        }
      }
    }
    
    // Store document
    index.documents.set(docId, {
      content,
      title,
      url,
      termFreq,
      embedding,
      chunks
    });
  }

  private tokenize(text: string): string[] {
    // Use natural tokenizer and porter stemmer
    const tokenizer = new natural.WordTokenizer();
    const stemmer = natural.PorterStemmer;
    
    // Tokenize the text
    let tokens = tokenizer.tokenize(text.toLowerCase()) || [];
    
    // Remove stopwords using the stopword library
    tokens = removeStopwords(tokens);
    
    // Apply stemming to normalize words
    const stemmedTokens = tokens
      .filter(token => token.length > 2)
      .map(token => stemmer.stem(token));
    
    // Generate bigrams using natural's NGrams
    const bigrams = natural.NGrams.bigrams(stemmedTokens)
      .map(bigram => bigram.join('_'));
    
    // Also generate trigrams for better phrase matching
    const trigrams = natural.NGrams.trigrams(stemmedTokens)
      .map(trigram => trigram.join('_'));
    
    return [...stemmedTokens, ...bigrams, ...trigrams];
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
    if (!this.embeddingPipeline) {
      throw new Error('Embedding model not initialized');
    }
    
    const output = await this.embeddingPipeline(text, {
      pooling: 'mean',
      normalize: true
    });
    
    return Array.from(output.data);
  }
  
  private async createChunkedEmbeddings(
    text: string,
    chunkSize: number = 512,
    overlap: number = 128
  ): Promise<Array<{ text: string; embedding: number[] }>> {
    const chunks: Array<{ text: string; embedding: number[] }> = [];
    
    for (let i = 0; i < text.length; i += (chunkSize - overlap)) {
      const chunk = text.substring(i, i + chunkSize);
      if (chunk.trim().length > 50) { // Skip very short chunks
        try {
          const embedding = await this.generateEmbedding(chunk);
          chunks.push({ text: chunk, embedding });
        } catch (error) {
          console.error('Failed to generate chunk embedding:', error);
        }
      }
    }
    
    return chunks;
  }
  
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
  
  private async searchWithSemantics(
    index: DocumentIndex,
    query: string,
    maxResults: number,
    includeContext: boolean
  ): Promise<Array<{
    file: string;
    title: string;
    context?: string;
    score: number;
    url?: string;
    highlights?: string[];
  }>> {
    // Ensure model is loaded
    const modelReady = await this.ensureEmbeddingModel();
    
    if (!modelReady || !this.embeddingPipeline) {
      process.stderr.write('[WARNING] Semantic search requested but embedding model not available\n');
      return [];
    }
    
    // Generate query embedding
    const queryEmbedding = await this.generateEmbedding(query);
    const scores = new Map<string, number>();
    
    // Calculate cosine similarity for each document
    for (const [docId, doc] of index.documents) {
      let maxScore = 0;
      
      if (doc.embedding) {
        // Compare with document embedding
        const similarity = this.cosineSimilarity(queryEmbedding, doc.embedding);
        maxScore = Math.max(maxScore, similarity);
      }
      
      if (doc.chunks) {
        // Compare with chunk embeddings
        for (const chunk of doc.chunks) {
          const similarity = this.cosineSimilarity(queryEmbedding, chunk.embedding);
          maxScore = Math.max(maxScore, similarity);
        }
      }
      
      if (maxScore > 0) {
        scores.set(docId, maxScore);
      }
    }
    
    // Sort by similarity score
    const sortedDocs = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxResults);
    
    return sortedDocs.map(([docId, score]) => {
      const doc = index.documents.get(docId)!;
      const result: any = {
        file: docId,
        title: doc.title,
        score: Math.round(score * 1000) / 1000,
        url: doc.url
      };
      
      if (includeContext) {
        // Extract relevant snippets based on query
        const queryTokens = this.tokenize(query.toLowerCase());
        const highlights = this.extractHighlights(doc.content, queryTokens);
        result.highlights = highlights;
        result.context = highlights.join('\n...\n');
      }
      
      return result;
    });
  }
  
  private async hybridSearch(
    index: DocumentIndex,
    query: string,
    maxResults: number,
    includeContext: boolean,
    semanticWeight: number = 0.5
  ): Promise<Array<{
    file: string;
    title: string;
    context?: string;
    score: number;
    url?: string;
    highlights?: string[];
  }>> {
    // Get TF-IDF results
    const tfidfResults = await this.searchWithTFIDF(index, query, maxResults * 2, false);
    const tfidfScores = new Map<string, number>();
    for (const result of tfidfResults) {
      tfidfScores.set(result.file, result.score);
    }
    
    // Get semantic results if available
    let semanticScores = new Map<string, number>();
    const modelReady = await this.ensureEmbeddingModel();
    if (modelReady && this.embeddingPipeline) {
      const semanticResults = await this.searchWithSemantics(index, query, maxResults * 2, false);
      for (const result of semanticResults) {
        semanticScores.set(result.file, result.score);
      }
    }
    
    // Combine scores
    const combinedScores = new Map<string, number>();
    const allDocs = new Set([...tfidfScores.keys(), ...semanticScores.keys()]);
    
    for (const docId of allDocs) {
      const tfidfScore = tfidfScores.get(docId) || 0;
      const semanticScore = semanticScores.get(docId) || 0;
      
      // Normalize scores and combine
      const normalizedTfidf = tfidfScore / (Math.max(...tfidfScores.values()) || 1);
      const normalizedSemantic = semanticScore;
      
      const combinedScore = (1 - semanticWeight) * normalizedTfidf + semanticWeight * normalizedSemantic;
      combinedScores.set(docId, combinedScore);
    }
    
    // Sort by combined score
    const sortedDocs = Array.from(combinedScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxResults);
    
    return sortedDocs.map(([docId, score]) => {
      const doc = index.documents.get(docId)!;
      const result: any = {
        file: docId,
        title: doc.title,
        score: Math.round(score * 1000) / 1000,
        url: doc.url,
        searchType: 'hybrid'
      };
      
      if (includeContext) {
        const queryTokens = this.tokenize(query.toLowerCase());
        const highlights = this.extractHighlights(doc.content, queryTokens);
        result.highlights = highlights;
        result.context = highlights.join('\n...\n');
      }
      
      return result;
    });
  }
  
  private async searchWithTFIDF(
    index: DocumentIndex,
    query: string,
    maxResults: number,
    includeContext: boolean
  ): Promise<Array<{
    file: string;
    title: string;
    context?: string;
    score: number;
    url?: string;
    highlights?: string[];
  }>> {
    const queryTokens = this.tokenize(query.toLowerCase());
    const scores = new Map<string, number>();
    
    // Use natural's TfIdf for better scoring
    const tfidf = new natural.TfIdf();
    
    // Add documents to TfIdf
    for (const [, doc] of index.documents) {
      tfidf.addDocument(doc.content);
    }
    
    // Calculate base TF-IDF scores
    const docIds = Array.from(index.documents.keys());
    tfidf.tfidfs(queryTokens.join(' '), (i, measure) => {
      if (measure > 0 && i < docIds.length) {
        scores.set(docIds[i], measure);
      }
    });
    
    // Use Fuse.js for fuzzy matching on document titles and content
    const fuseOptions = {
      includeScore: true,
      threshold: 0.4,
      keys: ['title', 'content'],
      minMatchCharLength: 3,
      shouldSort: true
    };
    
    const documents = Array.from(index.documents.entries()).map(([id, doc]) => ({
      id,
      title: doc.title,
      content: doc.content.substring(0, 1000), // Use first 1000 chars for fuzzy search
      url: doc.url
    }));
    
    const fuse = new Fuse(documents, fuseOptions);
    const fuseResults = fuse.search(query);
    
    // Combine TF-IDF scores with fuzzy matching scores
    for (const result of fuseResults) {
      const currentScore = scores.get(result.item.id) || 0;
      const fuseScore = 1 - (result.score || 0); // Fuse returns 0 for perfect match
      scores.set(result.item.id, currentScore + fuseScore * 0.3); // Weight fuzzy matching less
    }
    
    // Also check for exact phrase matches
    const queryLower = query.toLowerCase();
    for (const [docId, doc] of index.documents) {
      if (doc.content.toLowerCase().includes(queryLower)) {
        scores.set(docId, (scores.get(docId) || 0) + 5); // Boost exact phrase matches
      }
    }
    
    // Sort by score and prepare results
    const sortedDocs = Array.from(scores.entries())
      .filter(([_, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxResults);
    
    return sortedDocs.map(([docId, score]) => {
      const doc = index.documents.get(docId)!;
      const result: any = {
        file: docId,
        title: doc.title,
        score: Math.round(score * 1000) / 1000,
        url: doc.url
      };
      
      if (includeContext) {
        // Extract relevant snippets
        const highlights = this.extractHighlights(doc.content, queryTokens);
        result.highlights = highlights;
        result.context = highlights.join('\n...\n');
      }
      
      return result;
    });
  }


  private extractHighlights(content: string, queryTokens: string[]): string[] {
    const lines = content.split('\n');
    const highlights: string[] = [];
    const maxHighlights = 3;
    
    // Score each line based on query token matches
    const lineScores: Array<{ line: string; index: number; score: number }> = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineLower = line.toLowerCase();
      let score = 0;
      
      for (const token of queryTokens) {
        if (lineLower.includes(token)) {
          score += 1;
          // Boost score for exact word matches
          if (new RegExp(`\\b${token}\\b`).test(lineLower)) {
            score += 0.5;
          }
        }
      }
      
      if (score > 0) {
        lineScores.push({ line, index: i, score });
      }
    }
    
    // Sort by score and extract top highlights
    lineScores.sort((a, b) => b.score - a.score);
    
    for (let i = 0; i < Math.min(maxHighlights, lineScores.length); i++) {
      const { index } = lineScores[i];
      
      // Include some context
      const start = Math.max(0, index - 1);
      const end = Math.min(lines.length - 1, index + 1);
      
      const snippet = lines.slice(start, end + 1).join('\n');
      highlights.push(snippet);
    }
    
    return highlights;
  }

  private parseAvailablePages(llmsContent: string): Array<{title: string, path: string, section?: string}> {
    const lines = llmsContent.split('\n');
    const pages: Array<{title: string, path: string, section?: string}> = [];
    let currentSection = '';
    
    for (const line of lines) {
      // Check for section headers (## Section Name)
      const sectionMatch = line.match(/^##\s+(.+)$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1];
        continue;
      }
      
      // Look for markdown links
      const markdownLinkMatch = line.match(/\[([^\]]+)\]\(([^)]+\.md)\)/);
      if (markdownLinkMatch) {
        const [, title, path] = markdownLinkMatch;
        pages.push({
          title: title.trim(),
          path: path.trim(),
          section: currentSection || undefined
        });
      }
    }
    
    return pages;
  }

  private async hybridSearchDocumentation(query: string, site: string, maxResults: number = 10): Promise<string> {
    const sitesToSearch = site === 'all' ? Object.keys(RSTACK_SITES) : [site];
    const allResults: Array<{
      site: string;
      page: string;
      title: string;
      path: string;
      score: number;
      preview: string;
      url: string;
    }> = [];

    for (const siteKey of sitesToSearch) {
      try {
        // Get search results using hybrid method
        const index = await this.buildOrGetIndex(siteKey, true);
        const searchResults = await this.hybridSearch(index, query, maxResults * 2, false, 0.4);
        
        // Convert to page-level results
        const pageResults = new Map<string, any>();
        
        for (const result of searchResults) {
          // Group by page/document
          const pagePath = result.file;
          
          if (!pageResults.has(pagePath)) {
            const doc = index.documents.get(pagePath);
            if (doc) {
              // Extract a preview from the beginning of the document
              const preview = doc.content
                .substring(0, 300)
                .replace(/\n+/g, ' ')
                .trim();
              
              pageResults.set(pagePath, {
                site: siteKey,
                page: pagePath,
                title: doc.title || result.title,
                path: pagePath,
                score: result.score,
                preview: preview + '...',
                url: doc.url || result.url || ''
              });
            }
          } else {
            // Update score if this result has a higher score
            const existing = pageResults.get(pagePath);
            if (result.score > existing.score) {
              existing.score = result.score;
            }
          }
        }
        
        // Add to results
        allResults.push(...Array.from(pageResults.values()));
      } catch (error) {
        process.stderr.write(`[ERROR] Failed to search ${siteKey}: ${error}\n`);
      }
    }
    
    // Sort all results by score and limit
    allResults.sort((a, b) => b.score - a.score);
    const topResults = allResults.slice(0, maxResults);
    
    return JSON.stringify({
      query,
      searchMode: 'hybrid',
      totalPages: topResults.length,
      pages: topResults.map(r => ({
        site: r.site,
        title: r.title,
        path: r.path,
        score: Math.round(r.score * 1000) / 1000,
        preview: r.preview,
        url: r.url,
        fetchCommand: `Use get_page with site="${r.site}" and path="${r.path}" to fetch full content`
      }))
    }, null, 2);
  }


  private extractAllMarkdownLinks(llmsContent: string): Array<{title: string, path: string}> {
    const lines = llmsContent.split('\n');
    const links: Array<{title: string, path: string}> = [];
    
    for (const line of lines) {
      // Extract markdown links in the format [Title](path.md)
      const markdownLinkMatches = line.matchAll(/\[([^\]]+)\]\(([^)]+\.md)\)/g);
      for (const match of markdownLinkMatches) {
        links.push({
          title: match[1].trim(),
          path: match[2].trim()
        });
      }
    }
    
    return links;
  }

  private async fetchMarkdownContent(baseUrl: string, path: string): Promise<string> {
    const fullUrl = `${baseUrl}${path}`;
    const cacheKey = fullUrl;
    
    // Check cache first
    const cached = this.documentCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.content;
    }
    
    try {
      const response = await fetch(fullUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${fullUrl}: ${response.status}`);
      }
      
      const content = await response.text();
      
      // Cache the content
      this.documentCache.set(cacheKey, {
        content,
        timestamp: Date.now()
      });
      
      return content;
    } catch (error) {
      throw new Error(`Error fetching markdown from ${fullUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    process.stderr.write('[INFO] Wiggum MCP DocExplorer Server running on stdio\n');
  }
}

process.on('SIGINT', async () => {
  process.exit(0);
});

const server = new WiggumMCPServer();
server.run().catch((error) => {
  process.stderr.write(`[ERROR] Server error: ${error}\n`);
  process.exit(1);
});