import './index.css';

type Tool = {
  id: string;
  name: string;
  description: string;
  type: string;
  url: string;
  features: string[];
  status: 'ready' | 'beta';
};

const rstackTools: Tool[] = [
  {
    id: 'rspack',
    name: 'Rspack',
    description: 'Fast Rust-based web bundler compatible with webpack',
    type: 'bundler',
    url: 'https://rspack.rs',
    features: ['Lightning-fast build speeds', 'Webpack compatibility', 'Tree shaking & code splitting', 'Hot module replacement'],
    status: 'ready',
  },
  {
    id: 'rsbuild',
    name: 'Rsbuild',
    description: 'Rspack-based build tool for modern web applications',
    type: 'build-tool',
    url: 'https://rsbuild.rs',
    features: ['Zero-config setup', 'Modern JavaScript support', 'Built-in optimizations', 'Plugin ecosystem'],
    status: 'ready',
  },
  {
    id: 'rspress',
    name: 'Rspress',
    description: 'Static site generator powered by Rspack',
    type: 'static-site-generator',
    url: 'https://rspress.rs',
    features: ['MDX support', 'Fast development server', 'SEO optimized', 'Theme customization'],
    status: 'ready',
  },
  {
    id: 'rslib',
    name: 'Rslib',
    description: 'Library development tool built on Rspack',
    type: 'library-tool',
    url: 'https://rslib.rs',
    features: ['Multi-format output', 'TypeScript support', 'Bundle analysis', 'Tree-shakable builds'],
    status: 'ready',
  },
  {
    id: 'rsdoctor',
    name: 'Rsdoctor',
    description: 'Build analysis tool for performance optimization',
    type: 'analyzer',
    url: 'https://rsdoctor.rs',
    features: ['Bundle analysis', 'Performance metrics', 'Loader debugging', 'Build visualization'],
    status: 'ready',
  },
  {
    id: 'rstest',
    name: 'Rstest',
    description: 'Testing framework with modern features',
    type: 'testing-framework',
    url: 'https://rstest.rs',
    features: ['Fast test execution', 'Modern syntax support', 'Coverage reporting', 'Watch mode'],
    status: 'beta',
  },
  {
    id: 'rslint',
    name: 'Rslint',
    description: 'High-performance JavaScript and TypeScript linter',
    type: 'linter',
    url: 'https://rslint.rs',
    features: ['TypeScript ESLint rules', 'Fast linting', 'Auto-fix support', 'Configurable rules'],
    status: 'beta',
  },
];

function ToolCard({ tool }: { tool: Tool }) {
  const statusClass = tool.status === 'ready' ? 'status-ready' : 'status-beta';
  const statusText = tool.status === 'ready' ? 'Production Ready' : 'Beta';
  return (
    <div className="tool-card">
      <div className="tool-header">
        <div className={`tool-icon ${tool.id}`}>{tool.name.slice(0, 2).toUpperCase()}</div>
        <div>
          <h3 className="tool-title">{tool.name}</h3>
          <span className="tool-type">{tool.type.replace('-', ' ')}</span>
        </div>
      </div>

      <p className="tool-description">{tool.description}</p>

      <div className="tool-features">
        <h4>Key Features</h4>
        <ul className="feature-list">
          {tool.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>
    
      <div className="tool-actions">
        <a href={tool.url} target="_blank" rel="noreferrer" className="btn btn-purple">
          Visit Documentation →
        </a>
        <span className={`status-indicator ${statusClass}`}>{statusText}</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <div className="header">
        <h1>Rstack Ecosystem</h1>
        <p>High-performance tooling for modern web development</p>
      </div>

      <main className="main">
        <div className="tools-grid">
          {rstackTools.map((t) => (
            <ToolCard key={t.id} tool={t} />
          ))}
        </div>
      </main>

      <footer className="footer">
        <p>
          Built with ❤️ using the Rstack ecosystem •{' '}
          <a href="https://github.com/web-infra-dev/rsbuild" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </p>
      </footer>
    </>
  );
}
