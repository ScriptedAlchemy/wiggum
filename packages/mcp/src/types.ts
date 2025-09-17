import natural from 'natural';

export interface DocumentIndex {
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
  tfidf?: natural.TfIdf; // reusable TF-IDF model
}

export type SearchResultItem = {
  file: string;
  title: string;
  context?: string;
  score: number;
  url?: string;
  highlights?: string[];
  related?: Array<{ path: string; title: string; reason?: string }>;
};
