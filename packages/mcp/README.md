# Wiggum MCP DocExplorer

A Model Context Protocol (MCP) server optimized for AI agents to explore Rstack ecosystem documentation. This server provides streamlined, AI-optimized tools for intelligent documentation exploration across Rspack, Rsbuild, Rspress, Rslib, Rsdoctor, Rstest, and Rslint.

## Features

- **AI-Optimized Tools**: Streamlined toolset designed specifically for AI consumption
- **Structured JSON Responses**: All responses formatted as structured JSON for better AI processing
- **Multi-site Documentation Access**: Connect to all major Rstack ecosystem tools
- **Intelligent Search**: Search across documentation with context-aware results
- **LLMs.txt Integration**: Optimized for AI consumption with structured data formats
- **Real-time Fetching**: Direct access to live documentation content

### Technical Features
- **TypeScript Implementation**: Full type safety and modern JavaScript features
- **Zod Schema Validation**: Runtime type checking for all inputs and outputs
- **Error Handling**: Comprehensive error handling with meaningful messages
- **Modular Architecture**: Clean separation of concerns for maintainability

## Installation

```bash
pnpm install
pnpm build
```

Requires Node.js v18 or higher.

## Usage

### As MCP Server

Run the compiled server:

```bash
node dist/index.js
```

### Configuration

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "wiggum-doc-explorer": {
      "command": "node",
      "args": ["/path/to/wiggum/packages/mcp/dist/index.js"]
    }
  }
}
```

## API Reference

The MCP server runs on stdio and can be integrated with MCP-compatible clients. It exposes the following tools:

## AI-Optimized Tools

#### `get_ecosystem_tools`
Get information about all available Rstack ecosystem tools.

**Parameters:** None

**Example:**
```json
{}
```

**Returns:** Structured JSON with ecosystem overview and tool details

#### `get_site_info`
Get detailed information about a specific Rstack site.

**Parameters:**
- `site` (enum: rspack, rsbuild, rspress, rslib, rsdoctor, rstest, rslint)

**Example:**
```json
{"site": "rsbuild"}
```

**Returns:** Structured JSON with detailed site information

#### `get_docs`
Fetch documentation content from a site (`llms.txt`).

**Parameters:**
- `site` (enum: rspack, rsbuild, rspress, rslib, rsdoctor, rstest, rslint)

**Example:**
```json
{"site": "rspack"}
```

**Returns:** Raw `llms.txt` content optimized for AI processing

#### `search`
Search documentation across Rstack ecosystem sites with hybrid TF‑IDF + semantic retrieval.

**Parameters:**
- `query` (string): Search query
- `site` (enum: rspack, rsbuild, rspress, rslib, rsdoctor, rstest, rslint, all) - defaults to "all"

**Example:**
```json
{"query": "configuration", "site": "rsbuild"}
```

**Returns:** Structured JSON with search results and context

#### `get_page`
Fetch a specific documentation page from an Rstack site. This tool parses the llms.txt file to find the actual markdown document and returns the raw markdown content instead of HTML.

**Parameters:**
- `site` (enum: rspack, rsbuild, rspress, rslib, rsdoctor, rstest, rslint)
- `path` (string): The documentation path (e.g., "/guide/getting-started" or "CLI")

**Example:**
```json
{"site": "rsbuild", "path": "/guide/getting-started"}
```

**Returns:** Structured JSON with markdown content and metadata including:
- `site`: The requested site
- `requestedPath`: The path you requested
- `actualPath`: The actual markdown file path found
- `url`: The full URL to the markdown file
- `content`: Raw markdown content
- `contentType`: Always "markdown"

#### `list_pages`
List all available documentation pages for a specific Rstack site by parsing `llms.txt`. Returns JSON only (AI‑friendly).

**Parameters:**
- `site` (enum: rspack, rsbuild, rspress, rslib, rsdoctor, rstest, rslint)

**Example:**
```json
{"site": "rsbuild"}
```

**Returns:** Structured JSON with:
- `site`: The requested site
- `totalPages`: Number of available pages
- `pages`: Array of page objects with `title`, `path`, `url`, optional `section`, and `headings` (array of `{ level, text }`)

## Integration with Claude for Desktop

To use this MCP server with Claude for Desktop, add the following to your Claude configuration:

```json
{
  "mcpServers": {
    "wiggum-doc-explorer": {
      "command": "bun",
      "args": ["/path/to/wiggum/packages/mcp/dist/index.js"]
    }
  }
}
```

## AI Agent Workflow

1. **Discover Tools**: Use `get_ecosystem_tools` to see all available Rstack tools
2. **Get Site Details**: Use `get_site_info` for specific tool information
3. **Search Documentation**: Use `search_docs` to find relevant content across sites
4. **Fetch Content**: Use `get_docs` to retrieve full documentation or `get_page` for specific pages
5. **Process Results**: All responses are structured JSON for optimal AI consumption

## Supported Rstack Sites

- **Rspack** (https://rspack.rs) - Fast Rust-based web bundler
- **Rsbuild** (https://rsbuild.rs) - Rspack-based build tool
- **Rspress** (https://rspress.rs) - Static site generator
- **Rslib** (https://rslib.rs) - Library development tool
- **Rsdoctor** (https://rsdoctor.rs) - Build analyzer
- **Rstest** (https://rstest.rs) - Testing framework
- **Rslint** (https://rslint.rs) - JavaScript and TypeScript linter

## Development

### Building

```bash
pnpm build
```

### Testing

```bash
node dist/index.js
```

## JSON-RPC Examples

### Initialize
Request:
```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"clientInfo":{"name":"example","version":"1.0.0"}}}
```
Response:
```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"wiggum-mcp-docexplorer","version":"1.0.0"}}}
```

### List tools
Request:
```json
{"jsonrpc":"2.0","id":2,"method":"tools/list"}
```
Response:
```json
{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"get_ecosystem_tools"},{"name":"get_site_info"},{"name":"get_docs"},{"name":"search"},{"name":"get_page"},{"name":"list_pages"}]}}
```

### get_ecosystem_tools
Request:
```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_ecosystem_tools","arguments":{}}}
```
Response:
```json
{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"{\n  \"ecosystem\": \"Rstack\",\n  \"totalTools\": 7,\n  \"tools\": [\n    {\n      \"id\": \"rspack\",\n      \"name\": \"Rspack\",\n      \"description\": \"Fast Rust-based web bundler\",\n      \"url\": \"https://rspack.rs\",\n      \"docsUrl\": \"https://rspack.rs/guide\",\n      \"type\": \"bundler\"\n    }\n  ]\n}"}]}}
```

### get_site_info
Request:
```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_site_info","arguments":{"site":"rsbuild"}}}
```
Response:
```json
{"jsonrpc":"2.0","id":4,"result":{"content":[{"type":"text","text":"{\n  \"id\": \"rsbuild\",\n  \"name\": \"Rsbuild\",\n  \"description\": \"Rspack-based build tool\",\n  \"url\": \"https://rsbuild.rs\",\n  \"docsUrl\": \"https://rsbuild.rs/guide\",\n  \"type\": \"build-tool\"\n}"}]}}
```

### get_docs
Request:
```json
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_docs","arguments":{"site":"rspack","format":"llms"}}}
```
Response:
```json
{"jsonrpc":"2.0","id":5,"result":{"content":[{"type":"text","text":"# Rspack\n\nRspack is a fast Rust-based web bundler...\n\n## Getting Started\n..."}]}}
```

### search_docs
Request (single site):
```json
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"search","arguments":{"query":"configuration","site":"rsbuild"}}}
```
Response:
```json
{"jsonrpc":"2.0","id":6,"result":{"content":[{"type":"text","text":"{\n  \"query\": \"configuration\",\n  \"searchedSites\": [\"rsbuild\"],\n  \"totalResults\": 5,\n  \"results\": [\n    {\n      \"site\": \"rsbuild\",\n      \"matches\": [\"Configuration guide...\"]\n    }\n  ]\n}"}]}}
```

Request (all sites):
```json
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"search","arguments":{"query":"configuration"}}}
```
Response:
```json
{"jsonrpc":"2.0","id":7,"result":{"content":[{"type":"text","text":"{\n  \"query\": \"configuration\",\n  \"searchedSites\": [\"rspack\", \"rsbuild\", \"rspress\"],\n  \"totalResults\": 12,\n  \"results\": [...]\n}"}]}}
```

### get_page
Request:
```json
{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"get_page","arguments":{"site":"rsbuild","path":"/guide/getting-started"}}}
```
Response:
```json
{"jsonrpc":"2.0","id":8,"result":{"content":[{"type":"text","text":"{\n  \"site\": \"rsbuild\",\n  \"path\": \"/guide/getting-started\",\n  \"url\": \"https://rsbuild.rs/guide/getting-started\",\n  \"content\": \"# Getting Started\\n\\nRsbuild is a fast build tool...\"\n}"}]}}
```

## License

MIT
