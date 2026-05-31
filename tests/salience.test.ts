import { describe, it, expect } from 'vitest';
import { scoreSalience } from '../src/salience.js';
import type { IngestionEvent, WorkingMemoryItem } from '../src/types.js';

function makeEvent(content: string, overrides: Partial<IngestionEvent> = {}): IngestionEvent {
  return {
    id: 'evt-1',
    timestamp: 1000,
    kind: 'user_message',
    content,
    ...overrides,
  };
}

function makeItem(content: string, overrides: Partial<WorkingMemoryItem> = {}): WorkingMemoryItem {
  return {
    id: 'item-1',
    kind: 'general',
    content,
    salience: 0.5,
    strength: 0.8,
    createdAt: 1000,
    lastReinforcedAt: 1000,
    sourceEventId: 'evt-0',
    ...overrides,
  };
}

describe('Salience Scorer', () => {
  it('scores obligation-like content higher than casual content', () => {
    const obligation = scoreSalience(
      makeEvent('Please make sure to send the quarterly report by Friday'),
      []
    );
    const casual = scoreSalience(
      makeEvent('The weather is nice today'),
      []
    );

    expect(obligation.score).toBeGreaterThan(casual.score);
  });

  it('detects obligation kind for imperative content', () => {
    const result = scoreSalience(
      makeEvent('You must submit the budget proposal by end of week'),
      []
    );
    expect(result.detectedKind).toBe('obligation');
  });

  it('detects decision kind for decision language', () => {
    const result = scoreSalience(
      makeEvent('We decided to use PostgreSQL for the write model'),
      []
    );
    expect(result.detectedKind).toBe('decision');
  });

  it('scores higher when entities link to existing working memory', () => {
    const existing = [makeItem('Lucas is the project manager for Alpha')];

    const linked = scoreSalience(
      makeEvent('Lucas mentioned the deadline is next Monday'),
      existing
    );
    const unlinked = scoreSalience(
      makeEvent('Someone mentioned the deadline is next Monday'),
      existing
    );

    expect(linked.score).toBeGreaterThan(unlinked.score);
  });

  it('extracts named entities from content', () => {
    const result = scoreSalience(
      makeEvent('Lucas and Sarah discussed the Alpha project timeline'),
      []
    );
    expect(result.detectedEntities).toContain('Lucas');
    expect(result.detectedEntities).toContain('Sarah');
    expect(result.detectedEntities).toContain('Alpha');
  });

  it('scores user-marked important content highest', () => {
    const marked = scoreSalience(
      makeEvent('Remember this detail', { metadata: { important: true } }),
      []
    );
    const unmarked = scoreSalience(
      makeEvent('Remember this detail'),
      []
    );

    expect(marked.score).toBeGreaterThan(unmarked.score);
  });

  it('scores future-relevant content higher', () => {
    const future = scoreSalience(
      makeEvent('The team standup is scheduled for next week on Tuesday'),
      []
    );
    const past = scoreSalience(
      makeEvent('The team standup went fine today, nothing notable'),
      []
    );

    expect(future.score).toBeGreaterThan(past.score);
  });

  it('gives lower salience to highly recoverable events', () => {
    const toolResult = scoreSalience(
      makeEvent('File contents: function hello() {}', { kind: 'tool_result' }),
      []
    );
    const userMsg = scoreSalience(
      makeEvent('File contents: function hello() {}', { kind: 'user_message' }),
      []
    );

    // Tool results are more recoverable, so should score lower (less need to keep)
    expect(toolResult.score).toBeLessThan(userMsg.score);
  });

  it('detects novelty — duplicate content scores lower', () => {
    const existing = [makeItem('The deployment target is AWS us-east-1')];

    const novel = scoreSalience(
      makeEvent('We should switch to a microservices architecture'),
      existing
    );
    const duplicate = scoreSalience(
      makeEvent('The deployment target is AWS us-east-1'),
      existing
    );

    expect(novel.score).toBeGreaterThan(duplicate.score);
  });
});
