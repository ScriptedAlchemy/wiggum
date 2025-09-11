import natural from 'natural';

const STOPWORDS = new Set<string>([
  'a','an','and','the','of','to','in','for','on','with','at','by','from','up','about','into','over','after','than','out','during','before','under','around','among','is','are','was','were','be','been','being','do','does','did','doing','will','would','should','can','could','may','might','must','i','you','he','she','it','we','they','me','him','her','them','my','your','his','their','our','this','that','these','those','as','but','if','or','because','while','so','just','also','not'
]);

export function tokenize(text: string): string[] {
  const tokenizer = new natural.WordTokenizer();
  const stemmer = natural.PorterStemmer;

  let tokens = tokenizer.tokenize(text.toLowerCase()) || [];
  tokens = tokens.filter((t) => !STOPWORDS.has(t));

  const stemmedTokens = tokens
    .filter((token) => token.length > 2)
    .map((token) => stemmer.stem(token));

  const bigrams = natural.NGrams.bigrams(stemmedTokens).map((bigram) => bigram.join('_'));
  const trigrams = natural.NGrams.trigrams(stemmedTokens).map((trigram) => trigram.join('_'));

  return [...stemmedTokens, ...bigrams, ...trigrams];
}

export function cosineSimilarity(a: number[], b: number[]): number {
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

export function extractHighlights(content: string, queryTokens: string[]): string[] {
  const lines = content.split('\n');
  const highlights: string[] = [];
  const maxHighlights = 3;

  const lineScores: Array<{ line: string; index: number; score: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLower = line.toLowerCase();
    let score = 0;

    for (const token of queryTokens) {
      if (lineLower.includes(token)) {
        score += 1;
        if (new RegExp(`\\b${token}\\b`).test(lineLower)) {
          score += 0.5;
        }
      }
    }

    if (score > 0) {
      lineScores.push({ line, index: i, score });
    }
  }

  lineScores.sort((a, b) => b.score - a.score);
  for (let i = 0; i < Math.min(maxHighlights, lineScores.length); i++) {
    const { index } = lineScores[i];
    const start = Math.max(0, index - 1);
    const end = Math.min(lines.length - 1, index + 1);
    const snippet = lines.slice(start, end + 1).join('\n');
    highlights.push(snippet);
  }

  return highlights;
}
