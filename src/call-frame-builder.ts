import type {
  CallFrame,
  FrameDecisionLog,
  FrameDecision,
  IngestionEvent,
  WorkingMemoryItem,
  WorkingMemorySnapshot,
  Pointer,
  RetrievedArtefact,
  CaptureIntent,
} from './types.js';
import type { BM25Index } from './bm25.js';

export interface CallFrameBuilderConfig {
  recentTurnLimit: number;
  autoRetrieveConfidence: number;
}

const DEFAULT_CONFIG: CallFrameBuilderConfig = {
  recentTurnLimit: 10,
  autoRetrieveConfidence: 0.7,
};

let frameCounter = 0;

export function buildCallFrame(
  recentEvents: IngestionEvent[],
  snapshot: WorkingMemorySnapshot,
  pointers: Pointer[],
  captureIntents: CaptureIntent[],
  bm25: BM25Index,
  config?: Partial<CallFrameBuilderConfig>
): CallFrame {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const decisions: FrameDecision[] = [];
  const retrievedArtefacts: RetrievedArtefact[] = [];

  // Recent turns: keep only conversation events within limit
  const conversationKinds = new Set(['user_message', 'assistant_message']);
  const recentTurns = recentEvents
    .filter(e => conversationKinds.has(e.kind))
    .slice(-cfg.recentTurnLimit);

  // Process all working memory items for decision log
  const allItems = [
    ...snapshot.goals,
    ...snapshot.obligations,
    ...snapshot.openLoops,
    ...snapshot.decisions,
    ...snapshot.entities,
    ...snapshot.general,
  ];

  for (const item of allItems) {
    decisions.push({
      action: 'kept_verbatim',
      itemId: item.id,
      reason: `kind=${item.kind} salience=${item.salience.toFixed(2)} strength=${item.strength.toFixed(2)}`,
    });
  }

  // Auto-retrieve high-confidence pointers
  const remainingPointers: Pointer[] = [];
  for (const pointer of pointers) {
    if (pointer.confidence >= cfg.autoRetrieveConfidence) {
      // Attempt retrieval from BM25
      const results = bm25.search(pointer.hintText, 1);
      if (results.length > 0) {
        retrievedArtefacts.push({
          id: `retrieved-${pointer.id}`,
          content: results[0].content,
          sourceRef: pointer.sourceRef,
          relevanceScore: results[0].score,
        });
        decisions.push({
          action: 'retrieved',
          pointerId: pointer.id,
          reason: `confidence=${pointer.confidence.toFixed(2)} >= threshold=${cfg.autoRetrieveConfidence}`,
        });
      } else {
        remainingPointers.push(pointer);
      }
    } else {
      remainingPointers.push(pointer);
    }
  }

  const frameId = `frame-${++frameCounter}-${Date.now()}`;
  const tokenEstimate = estimateTokens(recentTurns, snapshot, remainingPointers, retrievedArtefacts);

  const decisionLog: FrameDecisionLog = {
    frameId,
    timestamp: Date.now(),
    decisions,
    tokenEstimate,
  };

  return {
    recentTurns,
    workingMemory: snapshot,
    pointers: remainingPointers,
    retrievedArtefacts,
    captureHints: captureIntents,
    decisionLog,
  };
}

function estimateTokens(
  turns: IngestionEvent[],
  snapshot: WorkingMemorySnapshot,
  pointers: Pointer[],
  retrieved: RetrievedArtefact[]
): number {
  // Rough estimate: 1 token ≈ 4 characters
  let chars = 0;
  for (const t of turns) chars += t.content.length;
  const allItems = [
    ...snapshot.goals, ...snapshot.obligations, ...snapshot.openLoops,
    ...snapshot.decisions, ...snapshot.entities, ...snapshot.general,
  ];
  for (const item of allItems) chars += item.content.length;
  for (const p of pointers) chars += p.hintText.length;
  for (const r of retrieved) chars += r.content.length;
  return Math.ceil(chars / 4);
}
