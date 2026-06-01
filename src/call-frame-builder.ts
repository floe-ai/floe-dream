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
  maxTokens?: number;
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

  const recentTurns = recentEvents
    .filter(e => e.kind === 'user_message' || e.kind === 'assistant_message')
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-cfg.recentTurnLimit);

  const remainingPointers: Pointer[] = [];
  for (const pointer of pointers) {
    if (pointer.confidence >= cfg.autoRetrieveConfidence) {
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

  if (cfg.maxTokens === undefined) {
    const allItems = flattenSnapshot(snapshot);
    for (const item of allItems) {
      decisions.push({
        action: 'kept_verbatim',
        itemId: item.id,
        reason: `kind=${item.kind} salience=${item.salience.toFixed(2)} strength=${item.strength.toFixed(2)}`,
      });
    }

    const decisionLog: FrameDecisionLog = {
      frameId: `frame-${++frameCounter}-${Date.now()}`,
      timestamp: Date.now(),
      decisions,
      tokenEstimate: estimateTokens(recentTurns, snapshot, remainingPointers, retrievedArtefacts),
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

  const baseTokens = estimateTokens(recentTurns, emptySnapshot(), [], []);
  const budgetLeft = Math.max(cfg.maxTokens - baseTokens, 0);

  const selected = selectWithinBudget(snapshot, remainingPointers, retrievedArtefacts, captureIntents, budgetLeft, decisions);
  const tokenEstimate = estimateTokens(recentTurns, selected.snapshot, selected.pointers, selected.retrievedArtefacts);

  const decisionLog: FrameDecisionLog = {
    frameId: `frame-${++frameCounter}-${Date.now()}`,
    timestamp: Date.now(),
    decisions,
    tokenEstimate,
  };

  return {
    recentTurns,
    workingMemory: selected.snapshot,
    pointers: selected.pointers,
    retrievedArtefacts: selected.retrievedArtefacts,
    captureHints: selected.captureHints,
    decisionLog,
  };
}

function selectWithinBudget(
  snapshot: WorkingMemorySnapshot,
  pointers: Pointer[],
  retrievedArtefacts: RetrievedArtefact[],
  captureHints: CaptureIntent[],
  budget: number,
  decisions: FrameDecision[]
): {
  snapshot: WorkingMemorySnapshot;
  pointers: Pointer[];
  retrievedArtefacts: RetrievedArtefact[];
  captureHints: CaptureIntent[];
} {
  let remaining = budget;
  const selectedItems: WorkingMemoryItem[] = [];
  const itemCandidates = flattenSnapshot(snapshot).sort(compareWorkingMemoryPriority);

  for (const item of itemCandidates) {
    const cost = estimateTextTokens(item.content);
    if (cost <= remaining) {
      selectedItems.push(item);
      remaining -= cost;
      decisions.push({
        action: 'kept_verbatim',
        itemId: item.id,
        reason: `within_budget kind=${item.kind} salience=${item.salience.toFixed(2)} strength=${item.strength.toFixed(2)}`,
      });
    } else {
      decisions.push({
        action: 'dropped',
        itemId: item.id,
        reason: `token_budget_exceeded cost=${cost} remaining=${remaining}`,
      });
    }
  }

  const selectedPointers = takeWhileFits(
    [...pointers].sort((a, b) => b.confidence - a.confidence),
    pointer => estimateTextTokens(pointer.hintText),
    () => remaining,
    value => {
      remaining -= estimateTextTokens(value.hintText);
    }
  );

  const selectedRetrieved = takeWhileFits(
    [...retrievedArtefacts].sort((a, b) => b.relevanceScore - a.relevanceScore),
    artefact => estimateTextTokens(artefact.content),
    () => remaining,
    value => {
      remaining -= estimateTextTokens(value.content);
    }
  );

  const selectedCaptures = takeWhileFits(
    [...captureHints].sort((a, b) => b.confidence - a.confidence),
    capture => estimateTextTokens(capture.content),
    () => remaining,
    value => {
      remaining -= estimateTextTokens(value.content);
    }
  );

  return {
    snapshot: snapshotFromItems(selectedItems),
    pointers: selectedPointers,
    retrievedArtefacts: selectedRetrieved,
    captureHints: selectedCaptures,
  };
}

function takeWhileFits<T>(
  items: T[],
  estimate: (value: T) => number,
  getRemaining: () => number,
  consume: (value: T) => void,
): T[] {
  const kept: T[] = [];
  for (const item of items) {
    const cost = estimate(item);
    if (cost <= getRemaining()) {
      kept.push(item);
      consume(item);
    }
  }
  return kept;
}

function compareWorkingMemoryPriority(a: WorkingMemoryItem, b: WorkingMemoryItem): number {
  return scorePriority(b) - scorePriority(a);
}

function scorePriority(item: WorkingMemoryItem): number {
  const kindWeight = {
    obligation: 6,
    goal: 5,
    decision: 4,
    open_loop: 3,
    entity: 2,
    general: 1,
  }[item.kind] ?? 0;

  return kindWeight * 10 + item.salience * 5 + item.strength * 5;
}

function flattenSnapshot(snapshot: WorkingMemorySnapshot): WorkingMemoryItem[] {
  return [
    ...snapshot.goals,
    ...snapshot.obligations,
    ...snapshot.openLoops,
    ...snapshot.decisions,
    ...snapshot.entities,
    ...snapshot.general,
  ];
}

function snapshotFromItems(items: WorkingMemoryItem[]): WorkingMemorySnapshot {
  return {
    goals: items.filter(i => i.kind === 'goal'),
    obligations: items.filter(i => i.kind === 'obligation'),
    openLoops: items.filter(i => i.kind === 'open_loop'),
    decisions: items.filter(i => i.kind === 'decision'),
    entities: items.filter(i => i.kind === 'entity'),
    general: items.filter(i => i.kind === 'general'),
  };
}

function emptySnapshot(): WorkingMemorySnapshot {
  return { goals: [], obligations: [], openLoops: [], decisions: [], entities: [], general: [] };
}

function estimateTokens(
  turns: IngestionEvent[],
  snapshot: WorkingMemorySnapshot,
  pointers: Pointer[],
  retrieved: RetrievedArtefact[]
): number {
  let chars = 0;
  for (const t of turns) chars += t.content.length;
  for (const item of flattenSnapshot(snapshot)) chars += item.content.length;
  for (const p of pointers) chars += p.hintText.length;
  for (const r of retrieved) chars += r.content.length;
  return Math.ceil(chars / 4);
}

function estimateTextTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}
