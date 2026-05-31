import { describe, it, expect } from 'vitest';
import { BM25Index } from '../src/bm25.js';

describe('BM25Index', () => {
  it('returns empty results for empty index', () => {
    const index = new BM25Index();
    const results = index.search('hello');
    expect(results).toEqual([]);
  });

  it('finds documents matching a single term', () => {
    const index = new BM25Index();
    index.add({ id: 'doc-1', content: 'Lucas likes burritos for lunch' });
    index.add({ id: 'doc-2', content: 'The project deadline is Friday' });

    const results = index.search('burritos');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('doc-1');
  });

  it('ranks documents by relevance', () => {
    const index = new BM25Index();
    index.add({ id: 'doc-1', content: 'Python is a programming language' });
    index.add({ id: 'doc-2', content: 'Python programming with Python libraries in Python' });
    index.add({ id: 'doc-3', content: 'Java is also a language' });

    const results = index.search('python programming');
    expect(results[0].id).toBe('doc-2'); // More relevant (more occurrences)
    expect(results.some(r => r.id === 'doc-1')).toBe(true);
    // doc-3 should not appear or rank low
    const doc3 = results.find(r => r.id === 'doc-3');
    if (doc3) {
      expect(doc3.score).toBeLessThan(results[0].score);
    }
  });

  it('handles multi-word queries', () => {
    const index = new BM25Index();
    index.add({ id: 'doc-1', content: 'Meeting with Lucas about the quarterly budget review' });
    index.add({ id: 'doc-2', content: 'Weather forecast for next week' });

    const results = index.search('Lucas budget meeting');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('doc-1');
  });

  it('respects the limit parameter', () => {
    const index = new BM25Index();
    for (let i = 0; i < 20; i++) {
      index.add({ id: `doc-${i}`, content: `Document ${i} about testing` });
    }

    const results = index.search('testing', 5);
    expect(results.length).toBe(5);
  });

  it('removes documents from the index', () => {
    const index = new BM25Index();
    index.add({ id: 'doc-1', content: 'Lucas likes burritos' });
    index.add({ id: 'doc-2', content: 'Sarah likes sushi' });

    index.remove('doc-1');
    const results = index.search('burritos');
    expect(results.length).toBe(0);
  });

  it('tracks document count', () => {
    const index = new BM25Index();
    expect(index.size()).toBe(0);

    index.add({ id: 'doc-1', content: 'hello world' });
    expect(index.size()).toBe(1);

    index.add({ id: 'doc-2', content: 'goodbye world' });
    expect(index.size()).toBe(2);

    index.remove('doc-1');
    expect(index.size()).toBe(1);
  });
});
