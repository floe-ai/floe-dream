/**
 * Minimal BM25 implementation for keyword retrieval.
 * No external dependencies — hand-rolled for portability.
 */

export interface IndexedDocument {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  score: number;
  content: string;
}

export class BM25Index {
  private documents: Map<string, IndexedDocument> = new Map();
  private termFrequencies: Map<string, Map<string, number>> = new Map(); // term → docId → freq
  private documentLengths: Map<string, number> = new Map();
  private avgDocLength: number = 0;
  private k1: number = 1.5;
  private b: number = 0.75;

  add(doc: IndexedDocument): void {
    this.documents.set(doc.id, doc);
    const terms = tokenize(doc.content);
    this.documentLengths.set(doc.id, terms.length);

    const freqs: Record<string, number> = {};
    for (const term of terms) {
      freqs[term] = (freqs[term] || 0) + 1;
    }

    for (const [term, freq] of Object.entries(freqs)) {
      if (!this.termFrequencies.has(term)) {
        this.termFrequencies.set(term, new Map());
      }
      this.termFrequencies.get(term)!.set(doc.id, freq);
    }

    this.recomputeAvgLength();
  }

  remove(id: string): void {
    this.documents.delete(id);
    this.documentLengths.delete(id);

    for (const [, docFreqs] of this.termFrequencies) {
      docFreqs.delete(id);
    }

    this.recomputeAvgLength();
  }

  search(query: string, limit: number = 10): SearchResult[] {
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) return [];

    const scores: Map<string, number> = new Map();
    const N = this.documents.size;

    for (const term of queryTerms) {
      const docFreqs = this.termFrequencies.get(term);
      if (!docFreqs) continue;

      const df = docFreqs.size;
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);

      for (const [docId, tf] of docFreqs) {
        const docLen = this.documentLengths.get(docId) || 0;
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLength));
        const termScore = idf * (numerator / denominator);

        scores.set(docId, (scores.get(docId) || 0) + termScore);
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id, score]) => ({
        id,
        score,
        content: this.documents.get(id)!.content,
      }));
  }

  size(): number {
    return this.documents.size;
  }

  private recomputeAvgLength(): void {
    if (this.documentLengths.size === 0) {
      this.avgDocLength = 0;
      return;
    }
    let total = 0;
    for (const len of this.documentLengths.values()) {
      total += len;
    }
    this.avgDocLength = total / this.documentLengths.size;
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1);
}
