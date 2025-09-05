import './index.css';

// Rstack ecosystem tools data
const rstackTools = [
  {
    id: 'rspack',
    name: 'Rspack',
    description: 'Fast Rust-based web bundler compatible with webpack',
    type: 'bundler',
    url: 'https://rspack.rs',
    features: [
      'Lightning-fast build speeds',
      'Webpack compatibility',
      'Tree shaking & code splitting',
      'Hot module replacement'
    ],
    status: 'ready'
  },
  {
    id: 'rsbuild',
    name: 'Rsbuild', 
    description: 'Rspack-based build tool for modern web applications',
    type: 'build-tool',
    url: 'https://rsbuild.rs',
    features: [
      'Zero-config setup',
      'Modern JavaScript support',
      'Built-in optimizations',
      'Plugin ecosystem'
    ],
    status: 'ready'
  },
  {
    id: 'rspress',
    name: 'Rspress',
    description: 'Static site generator powered by Rspack',
    type: 'static-site-generator', 
    url: 'https://rspress.rs',
    features: [
      'MDX support',
      'Fast development server',
      'SEO optimized',
      'Theme customization'
    ],
    status: 'ready'
  },
  {
    id: 'rslib',
    name: 'Rslib',
    description: 'Library development tool built on Rspack',
    type: 'library-tool',
    url: 'https://rslib.rs', 
    features: [
      'Multi-format output',
      'TypeScript support',
      'Bundle analysis',
      'Tree-shakable builds'
    ],
    status: 'ready'
  },
  {
    id: 'rsdoctor',
    name: 'Rsdoctor',
    description: 'Build analysis tool for performance optimization',
    type: 'analyzer',
    url: 'https://rsdoctor.rs',
    features: [
      'Bundle analysis',
      'Performance metrics',
      'Loader debugging',
      'Build visualization'
    ],
    status: 'ready'
  },
  {
    id: 'rstest',
    name: 'Rstest',
    description: 'Testing framework with modern features',
    type: 'testing-framework',
    url: 'https://rstest.rs',
    features: [
      'Fast test execution',
      'Modern syntax support',
      'Coverage reporting',
      'Watch mode'
    ],
    status: 'beta'
  },
  {
    id: 'rslint',
    name: 'Rslint',
    description: 'High-performance JavaScript and TypeScript linter',
    type: 'linter',
    url: 'https://rslint.rs',
    features: [
      'TypeScript ESLint rules',
      'Fast linting',
      'Auto-fix support',
      'Configurable rules'
    ],
    status: 'beta'
  }
];

// Create tool card HTML
function createToolCard(tool: typeof rstackTools[0]): string {
  const statusClass = tool.status === 'ready' ? 'status-ready' : 'status-beta';
  const statusText = tool.status === 'ready' ? 'Production Ready' : 'Beta';
  
  return `
    <div class="tool-card">
      <div class="tool-header">
        <div class="tool-icon ${tool.id}">${tool.name.slice(0, 2).toUpperCase()}</div>
        <div>
          <h3 class="tool-title">${tool.name}</h3>
          <span class="tool-type">${tool.type.replace('-', ' ')}</span>
        </div>
      </div>
      
      <p class="tool-description">${tool.description}</p>
      
      <div class="tool-features">
        <h4>Key Features</h4>
        <ul class="feature-list">
          ${tool.features.map(feature => `<li>${feature}</li>`).join('')}
        </ul>
      </div>
      
      <div class="tool-actions">
        <a href="${tool.url}" target="_blank" class="btn btn-primary">
          Visit Documentation →
        </a>
        <span class="status-indicator ${statusClass}">${statusText}</span>
      </div>
    </div>
  `;
}

// Demo code samples
const demoSamples = {
  rstest: `// math.test.ts
import { expect, test, describe } from '@rstest/core';
import { add, multiply } from './math.js';

describe('Math utilities', () => {
  test('should add numbers correctly', () => {
    expect(add(2, 3)).toBe(5);
    expect(add(-1, 1)).toBe(0);
  });

  test('should multiply numbers correctly', () => {
    expect(multiply(3, 4)).toBe(12);
    expect(multiply(0, 100)).toBe(0);
  });
});`,

  rslint: `// rslint.json
[
  {
    "ignores": ["./build/**/*", "./node_modules/**/*"],
    "languageOptions": {
      "parserOptions": {
        "project": ["./tsconfig.json"]
      }
    },
    "rules": {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/prefer-const": "error",
      "@typescript-eslint/no-explicit-any": "warn"
    },
    "plugins": ["@typescript-eslint"]
  }
]`
};

// Initialize the application
function initApp(): void {
  const rootEl = document.querySelector('#root');
  if (!rootEl) return;

  rootEl.innerHTML = `
    <div class="header">
      <h1>Rstack Ecosystem</h1>
      <p>High-performance tooling for modern web development</p>
    </div>

    <main class="main">
      <div class="tools-grid">
        ${rstackTools.map(createToolCard).join('')}
      </div>

      <div class="demo-section">
        <h2>🧪 Rstest in Action</h2>
        <p>Modern testing framework with fast execution and comprehensive features:</p>
        <div class="code-sample">
          <code>${highlightCode(demoSamples.rstest)}</code>
        </div>
        <p>Run tests with: <code class="highlight">pnpm test</code> or <code class="highlight">pnpm test:watch</code></p>
        <p>Using Wiggum CLI: <code class="highlight">wiggum test</code></p>
      </div>

      <div class="demo-section">
        <h2>🔍 Rslint Configuration</h2>
        <p>High-performance linting with TypeScript ESLint rules:</p>
        <div class="code-sample">
          <code>${highlightCode(demoSamples.rslint)}</code>
        </div>
        <p>Lint your code with: <code class="highlight">pnpm lint</code> or <code class="highlight">pnpm lint:fix</code></p>
        <p>Using Wiggum CLI: <code class="highlight">wiggum lint .</code> or <code class="highlight">wiggum lint --fix .</code></p>
      </div>
    </main>

    <footer class="footer">
      <p>Built with ❤️ using the Rstack ecosystem • <a href="https://github.com/web-infra-dev/rsbuild" target="_blank">GitHub</a></p>
    </footer>
  `;
}

// Simple code highlighting
function highlightCode(code: string): string {
  return code
    .replace(/\/\/.*$/gm, '<span style="color: #10b981;">$&</span>')
    .replace(/"[^"]*"/g, '<span style="color: #fbbf24;">$&</span>')
    .replace(/\b(import|export|from|test|describe|expect|toBe)\b/g, '<span style="color: #8b5cf6;">$&</span>');
}

// Import utility functions
export { add, multiply, greet } from './utils.js';

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}