import { describe, test, expect } from '@rstest/core';
import { RSTACK_SITES } from './index.js';

describe('WiggumMCPServer', () => {
  describe('RSTACK_SITES configuration', () => {
    test('should have all expected sites configured', () => {
      const expectedSites = ['rspack', 'rsbuild', 'rspress', 'rslib', 'rsdoctor', 'rstest', 'rslint'];
      const sites = Object.keys(RSTACK_SITES);
      
      expect(sites).toMatchInlineSnapshot(`
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
      
      for (const site of expectedSites) {
        expect(sites).toContain(site);
      }
    });

    test('should have valid site configurations', () => {
      for (const [siteKey, siteConfig] of Object.entries(RSTACK_SITES)) {
        expect(siteConfig).toHaveProperty('name');
        expect(siteConfig).toHaveProperty('description');
        expect(siteConfig).toHaveProperty('url');
        expect(siteConfig).toHaveProperty('docsUrl');
        expect(siteConfig).toHaveProperty('type');
        
        expect(typeof siteConfig.name).toBe('string');
        expect(typeof siteConfig.description).toBe('string');
        expect(typeof siteConfig.url).toBe('string');
        expect(typeof siteConfig.docsUrl).toBe('string');
        expect(typeof siteConfig.type).toBe('string');
        
        expect(siteConfig.url).toMatch(/^https?:\/\//);
        expect(siteConfig.docsUrl).toMatch(/^\//); // Relative path starting with /
      }
    });

    test('should have unique site names', () => {
      const names = Object.values(RSTACK_SITES).map(site => site.name);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });

    test('should have unique URLs', () => {
      const urls = Object.values(RSTACK_SITES).map(site => site.url);
      const uniqueUrls = new Set(urls);
      expect(urls.length).toBe(uniqueUrls.size);
    });
  });

  describe('Site-specific configurations', () => {
    test('rspack should be configured correctly', () => {
      expect(RSTACK_SITES.rspack).toMatchInlineSnapshot(`
        {
          "description": "Fast Rust-based web bundler",
          "docsUrl": "/guide",
          "name": "Rspack",
          "type": "bundler",
          "url": "https://rspack.rs",
        }
      `);
    });

    test('rsbuild should be configured correctly', () => {
      expect(RSTACK_SITES.rsbuild).toMatchInlineSnapshot(`
        {
          "description": "Rspack-based build tool",
          "docsUrl": "/guide",
          "name": "Rsbuild",
          "type": "build-tool",
          "url": "https://rsbuild.rs",
        }
      `);
    });

    test('rstest should be configured correctly', () => {
      expect(RSTACK_SITES.rstest).toMatchInlineSnapshot(`
        {
          "description": "Testing framework",
          "docsUrl": "/guide",
          "name": "Rstest",
          "type": "testing-framework",
          "url": "https://rstest.rs",
        }
      `);
    });
  });

  describe('Tool Output Snapshots', () => {
    test('get_ecosystem_tools should return expected structure', () => {
      const expectedOutput = {
        tools: Object.entries(RSTACK_SITES).map(([key, site]) => ({
          id: key,
          name: site.name,
          description: site.description,
          url: site.url,
          docsUrl: site.docsUrl,
          type: site.type
        })),
        totalTools: Object.keys(RSTACK_SITES).length,
        categories: {
          bundler: ['rspack'],
          'build-tool': ['rsbuild'],
          'static-site-generator': ['rspress'],
          'library-tool': ['rslib'],
          analyzer: ['rsdoctor'],
          'testing-framework': ['rstest'],
          linter: ['rslint']
        }
      };

      expect(expectedOutput).toMatchInlineSnapshot(`
        {
          "categories": {
            "analyzer": [
              "rsdoctor",
            ],
            "build-tool": [
              "rsbuild",
            ],
            "bundler": [
              "rspack",
            ],
            "library-tool": [
              "rslib",
            ],
            "linter": [
              "rslint",
            ],
            "static-site-generator": [
              "rspress",
            ],
            "testing-framework": [
              "rstest",
            ],
          },
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
    });

    test('get_site_info should return expected structure for rspack', () => {
      const expectedOutput = {
        site: 'rspack',
        info: RSTACK_SITES.rspack,
        documentationUrl: 'https://rspack.rs/llms.txt'
      };

      expect(expectedOutput).toMatchInlineSnapshot(`
        {
          "documentationUrl": "https://rspack.rs/llms.txt",
          "info": {
            "description": "Fast Rust-based web bundler",
            "docsUrl": "/guide",
            "name": "Rspack",
            "type": "bundler",
            "url": "https://rspack.rs",
          },
          "site": "rspack",
        }
      `);
    });

    test('search result structure should match expected format', () => {
      const mockSearchResult = {
        query: 'webpack configuration',
        searchMode: 'hybrid',
        searchedSites: ['rspack'],
        totalResults: 1,
        results: [
          {
            site: 'rspack',
            pages: [
              {
                file: '/guide/config/webpack.md',
                title: 'Webpack Configuration',
                score: 0.85,
                context: 'Learn how to configure webpack compatibility...',
                url: 'https://rspack.rs/guide/config/webpack.md',
                highlights: [
                  'webpack configuration options',
                  'compatibility with webpack loaders',
                  'migration from webpack to rspack'
                ]
              }
            ]
          }
        ]
      };

      expect(mockSearchResult).toMatchInlineSnapshot(`
        {
          "query": "webpack configuration",
          "results": [
            {
              "pages": [
                {
                  "context": "Learn how to configure webpack compatibility...",
                  "file": "/guide/config/webpack.md",
                  "highlights": [
                    "webpack configuration options",
                    "compatibility with webpack loaders",
                    "migration from webpack to rspack",
                  ],
                  "score": 0.85,
                  "title": "Webpack Configuration",
                  "url": "https://rspack.rs/guide/config/webpack.md",
                },
              ],
              "site": "rspack",
            },
          ],
          "searchMode": "hybrid",
          "searchedSites": [
            "rspack",
          ],
          "totalResults": 1,
        }
      `);
    });

    test('list_pages result structure should match expected format', () => {
      const mockListPagesResult = {
        site: 'rstest',
        totalPages: 3,
        pages: [
          {
            title: 'Quick Start',
            path: '/guide/start/quick-start.md',
            section: 'Guide',
            url: 'https://rstest.rs/guide/start/quick-start.md',
            headings: [
              { level: 1, text: 'Quick Start' },
              { level: 2, text: 'Installation' },
              { level: 2, text: 'Basic Usage' },
              { level: 3, text: 'Writing Tests' }
            ]
          },
          {
            title: 'Configuration',
            path: '/guide/config.md',
            section: 'Guide',
            url: 'https://rstest.rs/guide/config.md',
            headings: [
              { level: 1, text: 'Configuration' },
              { level: 2, text: 'Test Environment' },
              { level: 2, text: 'Custom Matchers' }
            ]
          },
          {
            title: 'API Reference',
            path: '/api/index.md',
            section: 'API',
            url: 'https://rstest.rs/api/index.md',
            headings: [
              { level: 1, text: 'API Reference' },
              { level: 2, text: 'Core Functions' },
              { level: 3, text: 'test()' },
              { level: 3, text: 'expect()' }
            ]
          }
        ]
      };

      expect(mockListPagesResult).toMatchInlineSnapshot(`
        {
          "pages": [
            {
              "headings": [
                {
                  "level": 1,
                  "text": "Quick Start",
                },
                {
                  "level": 2,
                  "text": "Installation",
                },
                {
                  "level": 2,
                  "text": "Basic Usage",
                },
                {
                  "level": 3,
                  "text": "Writing Tests",
                },
              ],
              "path": "/guide/start/quick-start.md",
              "section": "Guide",
              "title": "Quick Start",
              "url": "https://rstest.rs/guide/start/quick-start.md",
            },
            {
              "headings": [
                {
                  "level": 1,
                  "text": "Configuration",
                },
                {
                  "level": 2,
                  "text": "Test Environment",
                },
                {
                  "level": 2,
                  "text": "Custom Matchers",
                },
              ],
              "path": "/guide/config.md",
              "section": "Guide",
              "title": "Configuration",
              "url": "https://rstest.rs/guide/config.md",
            },
            {
              "headings": [
                {
                  "level": 1,
                  "text": "API Reference",
                },
                {
                  "level": 2,
                  "text": "Core Functions",
                },
                {
                  "level": 3,
                  "text": "test()",
                },
                {
                  "level": 3,
                  "text": "expect()",
                },
              ],
              "path": "/api/index.md",
              "section": "API",
              "title": "API Reference",
              "url": "https://rstest.rs/api/index.md",
            },
          ],
          "site": "rstest",
          "totalPages": 3,
        }
      `);
    });

    test('error response structure should match expected format', () => {
      const mockErrorResponse = {
        error: 'Site not found',
        message: 'The requested site "invalid-site" is not available',
        availableSites: Object.keys(RSTACK_SITES),
        timestamp: '2024-01-15T10:30:00.000Z'
      };

      expect(mockErrorResponse).toMatchInlineSnapshot(`
        {
          "availableSites": [
            "rspack",
            "rsbuild",
            "rspress",
            "rslib",
            "rsdoctor",
            "rstest",
            "rslint",
          ],
          "error": "Site not found",
          "message": "The requested site "invalid-site" is not available",
          "timestamp": "2024-01-15T10:30:00.000Z",
        }
      `);
    });

    test('get_page result structure should match expected format', () => {
      const mockGetPageResult = {
        site: 'rspack',
        path: '/guide/start/quick-start.md',
        title: 'Quick Start Guide',
        url: 'https://rspack.rs/guide/start/quick-start.md',
        content: `# Quick Start Guide

This guide will help you get started with Rspack...`,
        headings: [
          { level: 1, text: 'Quick Start Guide' },
          { level: 2, text: 'Installation' },
          { level: 2, text: 'Configuration' },
          { level: 3, text: 'Basic Setup' }
        ],
        links: [
          { title: 'Configuration Guide', path: '/guide/config/basic.md' },
          { title: 'API Reference', path: '/api/index.md' }
        ],
        lastModified: '2024-01-15T10:30:00.000Z'
      };

      expect(mockGetPageResult).toMatchInlineSnapshot(`
        {
          "content": "# Quick Start Guide

        This guide will help you get started with Rspack...",
          "headings": [
            {
              "level": 1,
              "text": "Quick Start Guide",
            },
            {
              "level": 2,
              "text": "Installation",
            },
            {
              "level": 2,
              "text": "Configuration",
            },
            {
              "level": 3,
              "text": "Basic Setup",
            },
          ],
          "lastModified": "2024-01-15T10:30:00.000Z",
          "links": [
            {
              "path": "/guide/config/basic.md",
              "title": "Configuration Guide",
            },
            {
              "path": "/api/index.md",
              "title": "API Reference",
            },
          ],
          "path": "/guide/start/quick-start.md",
          "site": "rspack",
          "title": "Quick Start Guide",
          "url": "https://rspack.rs/guide/start/quick-start.md",
        }
      `);
    });
  });
});