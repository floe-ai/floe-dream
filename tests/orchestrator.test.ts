import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createOrchestrator } from '../src/orchestrator.js';
import { createSqliteStore } from '../src/store-sqlite.js';
import type { Store, IngestionEvent } from '../src/types.js';

describe('Orchestrator - tracer bullet', () => {
  let store: Store;

  beforeEach(() => {
    store = createSqliteStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('returns an empty Call Frame when no events have been ingested', () => {
    const orchestrator = createOrchestrator({ store });
    const frame = orchestrator.buildCallFrame();

    expect(frame.recentTurns).toEqual([]);
    expect(frame.workingMemory.goals).toEqual([]);
    expect(frame.workingMemory.obligations).toEqual([]);
    expect(frame.pointers).toEqual([]);
    expect(frame.retrievedArtefacts).toEqual([]);
    expect(frame.decisionLog.decisions).toEqual([]);
  });

  it('includes a user message in recent turns after ingestion', () => {
    const orchestrator = createOrchestrator({ store });
    const event: IngestionEvent = {
      id: 'evt-1',
      timestamp: 1000,
      kind: 'user_message',
      content: 'Hello, remember that the meeting is on Friday',
    };

    orchestrator.ingest(event);
    const frame = orchestrator.buildCallFrame();

    expect(frame.recentTurns.length).toBeGreaterThanOrEqual(1);
    expect(frame.recentTurns.some(t => t.content === event.content)).toBe(true);
  });

  it('produces a Frame Decision Log with each Call Frame', () => {
    const orchestrator = createOrchestrator({ store });
    orchestrator.ingest({
      id: 'evt-1',
      timestamp: 1000,
      kind: 'user_message',
      content: 'Please make sure to send the report by Monday',
    });

    const frame = orchestrator.buildCallFrame();

    expect(frame.decisionLog).toBeDefined();
    expect(frame.decisionLog.frameId).toMatch(/^frame-/);
    expect(frame.decisionLog.timestamp).toBeGreaterThan(0);
    expect(frame.decisionLog.tokenEstimate).toBeGreaterThan(0);
  });

  it('keeps recent turns in chronological order when limited', () => {
    const orchestrator = createOrchestrator({ store, recentTurnLimit: 3 });
    for (let i = 1; i <= 6; i++) {
      orchestrator.ingest({
        id: `evt-${i}`,
        timestamp: i * 1000,
        kind: i % 2 === 0 ? 'assistant_message' : 'user_message',
        content: `message-${i}`,
      });
    }

    const frame = orchestrator.buildCallFrame();
    expect(frame.recentTurns.map(t => t.content)).toEqual(['message-4', 'message-5', 'message-6']);
  });
});
