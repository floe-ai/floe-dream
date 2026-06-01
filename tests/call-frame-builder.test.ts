import { describe, it, expect } from 'vitest';
import { buildCallFrame } from '../src/call-frame-builder.js';
import { BM25Index } from '../src/bm25.js';
import type { IngestionEvent, WorkingMemorySnapshot, Pointer, CaptureIntent } from '../src/types.js';

function emptySnapshot(): WorkingMemorySnapshot {
  return { goals: [], obligations: [], openLoops: [], decisions: [], entities: [], general: [] };
}

describe('Call Frame Builder', () => {
  it('includes only conversation turns in recentTurns', () => {
    const events: IngestionEvent[] = [
      { id: 'e1', timestamp: 100, kind: 'user_message', content: 'Hello' },
      { id: 'e2', timestamp: 200, kind: 'tool_call', content: 'readFile(x.ts)' },
      { id: 'e3', timestamp: 300, kind: 'assistant_message', content: 'Here is the file' },
      { id: 'e4', timestamp: 400, kind: 'tool_result', content: 'file contents...' },
    ];

    const frame = buildCallFrame(events, emptySnapshot(), [], [], new BM25Index());

    expect(frame.recentTurns.length).toBe(2);
    expect(frame.recentTurns[0].kind).toBe('user_message');
    expect(frame.recentTurns[1].kind).toBe('assistant_message');
  });

  it('limits recent turns to configured maximum', () => {
    const events: IngestionEvent[] = [];
    for (let i = 0; i < 20; i++) {
      events.push({
        id: `e${i}`,
        timestamp: i * 100,
        kind: i % 2 === 0 ? 'user_message' : 'assistant_message',
        content: `Message ${i}`,
      });
    }

    const frame = buildCallFrame(events, emptySnapshot(), [], [], new BM25Index(), {
      recentTurnLimit: 5,
    });

    expect(frame.recentTurns.length).toBe(5);
    // Should be the most recent 5
    expect(frame.recentTurns[4].content).toBe('Message 19');
  });

  it('logs kept_verbatim decisions for all working memory items', () => {
    const snapshot: WorkingMemorySnapshot = {
      goals: [{ id: 'g1', kind: 'goal', content: 'Ship v1', salience: 0.9, strength: 0.9, createdAt: 100, lastReinforcedAt: 100, sourceEventId: 'e1' }],
      obligations: [{ id: 'o1', kind: 'obligation', content: 'Send report', salience: 0.8, strength: 0.8, createdAt: 100, lastReinforcedAt: 100, sourceEventId: 'e2' }],
      openLoops: [],
      decisions: [],
      entities: [],
      general: [],
    };

    const frame = buildCallFrame([], snapshot, [], [], new BM25Index());

    const keptDecisions = frame.decisionLog.decisions.filter(d => d.action === 'kept_verbatim');
    expect(keptDecisions.length).toBe(2);
  });

  it('auto-retrieves high-confidence pointers from BM25', () => {
    const bm25 = new BM25Index();
    bm25.add({ id: 'src-1', content: 'Lucas prefers burritos from the taco place on Main Street' });

    const pointers: Pointer[] = [
      { id: 'ptr-1', hintText: 'Lucas burrito preference', sourceRef: 'evt-old', confidence: 0.8, retrievalCost: 'cheap' },
    ];

    const frame = buildCallFrame([], emptySnapshot(), pointers, [], bm25, {
      autoRetrieveConfidence: 0.7,
    });

    expect(frame.retrievedArtefacts.length).toBe(1);
    expect(frame.retrievedArtefacts[0].content).toContain('burritos');
    // Pointer should be removed from the frame since it was retrieved
    expect(frame.pointers.length).toBe(0);
    // Decision log should record the retrieval
    const retrievals = frame.decisionLog.decisions.filter(d => d.action === 'retrieved');
    expect(retrievals.length).toBe(1);
  });

  it('keeps low-confidence pointers as hints without retrieving', () => {
    const bm25 = new BM25Index();
    bm25.add({ id: 'src-1', content: 'Some stored content' });

    const pointers: Pointer[] = [
      { id: 'ptr-1', hintText: 'Maybe relevant', sourceRef: 'evt-old', confidence: 0.3, retrievalCost: 'cheap' },
    ];

    const frame = buildCallFrame([], emptySnapshot(), pointers, [], bm25, {
      autoRetrieveConfidence: 0.7,
    });

    expect(frame.retrievedArtefacts.length).toBe(0);
    expect(frame.pointers.length).toBe(1);
    expect(frame.pointers[0].hintText).toBe('Maybe relevant');
  });

  it('includes capture intents in the frame', () => {
    const captures: CaptureIntent[] = [
      { id: 'cap-1', content: 'Important obligation', kind: 'obligation', sourceEventId: 'e1', confidence: 0.9 },
    ];

    const frame = buildCallFrame([], emptySnapshot(), [], captures, new BM25Index());

    expect(frame.captureHints.length).toBe(1);
    expect(frame.captureHints[0].content).toBe('Important obligation');
  });

  it('applies a token budget to working memory selection', () => {
    const snapshot: WorkingMemorySnapshot = {
      goals: [
        { id: 'g1', kind: 'goal', content: 'Launch the mobile app this Friday', salience: 0.95, strength: 0.95, createdAt: 1, lastReinforcedAt: 1, sourceEventId: 'e1' },
      ],
      obligations: [
        { id: 'o1', kind: 'obligation', content: 'Prepare the executive-ready rollout checklist', salience: 0.98, strength: 0.98, createdAt: 1, lastReinforcedAt: 1, sourceEventId: 'e2' },
      ],
      openLoops: [],
      decisions: [],
      entities: [],
      general: [
        { id: 'x1', kind: 'general', content: 'This is a low-priority note with a lot of extra filler text that should lose to higher-priority items when the frame budget is tight.', salience: 0.35, strength: 0.35, createdAt: 1, lastReinforcedAt: 1, sourceEventId: 'e3' },
      ],
    };

    const frame = buildCallFrame([], snapshot, [], [], new BM25Index(), { maxTokens: 25 });

    expect(frame.workingMemory.obligations.length).toBe(1);
    expect(frame.workingMemory.goals.length + frame.workingMemory.general.length).toBeLessThan(2);
    expect(frame.decisionLog.tokenEstimate).toBeLessThanOrEqual(25);
    expect(frame.decisionLog.decisions.some(d => d.action === 'dropped')).toBe(true);
  });

  it('estimates token count based on content size', () => {
    const events: IngestionEvent[] = [
      { id: 'e1', timestamp: 100, kind: 'user_message', content: 'A'.repeat(400) },
    ];

    const frame = buildCallFrame(events, emptySnapshot(), [], [], new BM25Index());

    // 400 chars ≈ 100 tokens
    expect(frame.decisionLog.tokenEstimate).toBeGreaterThanOrEqual(90);
    expect(frame.decisionLog.tokenEstimate).toBeLessThanOrEqual(110);
  });
});
