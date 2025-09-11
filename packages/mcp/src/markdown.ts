import { marked } from 'marked';

export function parseMarkdownLinks(content: string): Array<{ title: string; path: string }> {
  const links: Array<{ title: string; path: string }> = [];

  try {
    const tokens = marked.lexer(content);
    const walkTokens = (tokens: any[]): void => {
      for (const token of tokens) {
        if (token.type === 'link' && token.href && token.href.endsWith('.md')) {
          links.push({ title: token.text || token.href, path: token.href });
        }
        if (token.tokens) walkTokens(token.tokens);
        if (token.items) walkTokens(token.items);
      }
    };
    walkTokens(tokens);
  } catch (error) {
    // Fallback regex parser
    const markdownLinkMatches = content.matchAll(/\[([^\]]+)\]\(([^)]+\.md)\)/g);
    for (const match of markdownLinkMatches) {
      links.push({ title: match[1].trim(), path: match[2].trim() });
    }
  }

  return links;
}

export function extractMarkdownHeadings(content: string): Array<{ level: number; text: string }> {
  const headings: Array<{ level: number; text: string }> = [];
  try {
    const tokens = marked.lexer(content);
    for (const token of tokens) {
      if (token.type === 'heading' && token.depth <= 3) {
        headings.push({ level: token.depth, text: token.text });
      }
    }
  } catch (error) {
    const lines = content.split('\n');
    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();
        headings.push({ level, text });
      }
    }
  }
  return headings;
}

export function parseAvailablePages(
  llmsContent: string
): Array<{ title: string; path: string; section?: string }> {
  const pages: Array<{ title: string; path: string; section?: string }> = [];
  let currentSection = '';

  try {
    const tokens = marked.lexer(llmsContent);
    const walkTokens = (tokens: any[]): void => {
      for (const token of tokens) {
        if (token.type === 'heading' && token.depth === 2) {
          currentSection = token.text || '';
          continue;
        }
        if (token.type === 'link' && token.href && token.href.endsWith('.md')) {
          pages.push({ title: token.text || token.href, path: token.href, section: currentSection || undefined });
        }
        if (token.tokens) walkTokens(token.tokens);
        if (token.items) walkTokens(token.items);
      }
    };
    walkTokens(tokens);
  } catch (error) {
    const lines = llmsContent.split('\n');
    for (const line of lines) {
      const sectionMatch = line.match(/^##\s+(.+)$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1];
        continue;
      }
      const markdownLinkMatch = line.match(/\[([^\]]+)\]\(([^)]+\.md)\)/);
      if (markdownLinkMatch) {
        const [, title, p] = markdownLinkMatch;
        pages.push({ title: title.trim(), path: p.trim(), section: currentSection || undefined });
      }
    }
  }

  return pages;
}

