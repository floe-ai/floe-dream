import { describe, it, expect } from 'vitest';
import { buildCallFrameMessages } from '../src/call-frame-messages.js';
import type { CallFrame } from '../src/types.js';

const frame: CallFrame = {
  recentTurns: [
    { id: 'u1', timestamp: 100, kind: 'user_message', content: 'Remember the launch is Friday' },
    { id: 'a1', timestamp: 200, kind: 'assistant_message', content: 'Got it' },
  ],
  workingMemory: {
    goals: [{ id: 'g1', kind: 'goal', content: 'Ship launch checklist', salience: 0.9, strength: 0.9, createdAt: 1, lastReinforcedAt: 1, sourceEventId: 'u1' }],
    obligations: [],
    openLoops: [],
    decisions: [],
    entities: [],
    general: [],
  },
  pointers: [],
  retrievedArtefacts: [],
  captureHints: [],
  decisionLog: { frameId: 'f1', timestamp: 1, tokenEstimate: 20, decisions: [] },
};

describe('buildCallFrameMessages', () => {
  it('builds a canonical provider-neutral message list', () => {
    const messages = buildCallFrameMessages(frame);

    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('Ship launch checklist');
    expect(messages[1]).toEqual({ role: 'user', content: 'Remember the launch is Friday' });
    expect(messages[2]).toEqual({ role: 'assistant', content: 'Got it' });
  });

  it('can omit the system summary', () => {
    const messages = buildCallFrameMessages(frame, { includeSystemSummary: false });
    expect(messages).toEqual([
      { role: 'user', content: 'Remember the launch is Friday' },
      { role: 'assistant', content: 'Got it' },
    ]);
  });
});
