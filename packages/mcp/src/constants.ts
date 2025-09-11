export const RSTACK_SITES = {
  rspack: {
    name: 'Rspack',
    description: 'Fast Rust-based web bundler',
    url: 'https://rspack.rs',
    docsUrl: '/guide',
    type: 'bundler',
  },
  rsbuild: {
    name: 'Rsbuild',
    description: 'Rspack-based build tool',
    url: 'https://rsbuild.rs',
    docsUrl: '/guide',
    type: 'build-tool',
  },
  rspress: {
    name: 'Rspress',
    description: 'Static site generator',
    url: 'https://rspress.rs',
    docsUrl: '/guide',
    type: 'static-site-generator',
  },
  rslib: {
    name: 'Rslib',
    description: 'Library development tool',
    url: 'https://rslib.rs',
    docsUrl: '/guide',
    type: 'library-tool',
  },
  rsdoctor: {
    name: 'Rsdoctor',
    description: 'Build analyzer',
    url: 'https://rsdoctor.rs',
    docsUrl: '/guide',
    type: 'analyzer',
  },
  rstest: {
    name: 'Rstest',
    description: 'Testing framework',
    url: 'https://rstest.rs',
    docsUrl: '/guide',
    type: 'testing-framework',
  },
  rslint: {
    name: 'Rslint',
    description: 'JavaScript and TypeScript linter',
    url: 'https://rslint.rs',
    docsUrl: '/guide',
    type: 'linter',
  },
} as const;

export type RstackSiteKey = keyof typeof RSTACK_SITES;
