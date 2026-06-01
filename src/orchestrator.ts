import type {
  Orchestrator,
  OrchestratorConfig,
  IngestionEvent,
  CallFrame,
  WorkingMemorySnapshot,
  WorkingMemoryItem,
  Pointer,
  CaptureIntent,
} from './types.js';
import { WorkingMemoryLedger } from './working-memory.js';
import { scoreSalience } from './salience.js';
import { BM25Index } from './bm25.js';
import { buildCallFrame } from './call-frame-builder.js';

const DEFAULT_CONFIG = {
  recentTurnLimit: 10,
  maxFrameTokens: undefined,
  pointeriseThreshold: 0.3,
  dropThreshold: 0.1,
  decayLambda: 0.05,
  reinforcementBoost: 0.8,
  autoRetrieveConfidence: 0.7,
  consolidationEventThreshold: 20,
  consolidationIdleMs: 30000,
};

export function createOrchestrator(config: OrchestratorConfig): Orchestrator {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const ledger = new WorkingMemoryLedger(cfg.store, {
    pointeriseThreshold: cfg.pointeriseThreshold,
    dropThreshold: cfg.dropThreshold,
    decayLambda: cfg.decayLambda,
    reinforcementBoost: cfg.reinforcementBoost,
  });
  const bm25 = new BM25Index();
  const captureIntents: CaptureIntent[] = [];
  let eventsSinceConsolidation = 0;
  let idCounter = 0;

  function generateId(prefix: string): string {
    return `${prefix}-${++idCounter}-${Date.now()}`;
  }

  function ingest(event: IngestionEvent): void {
    // 1. Persist the raw event
    cfg.store.saveEvent(event);

    // 2. Index for retrieval
    bm25.add({ id: event.id, content: event.content, metadata: event.metadata });

    // 3. Score salience
    const existingItems = ledger.getAll();
    const result = scoreSalience(event, existingItems);

    // 4. Check for reinforcement of existing items
    for (const entity of result.detectedEntities) {
      const entityLower = entity.toLowerCase();
      for (const item of existingItems) {
        if (item.content.toLowerCase().includes(entityLower)) {
          ledger.reinforce(item.id, event.timestamp);
        }
      }
    }

    // 5. If salience is high enough, add to working memory
    if (result.score > cfg.pointeriseThreshold) {
      const item: WorkingMemoryItem = {
        id: generateId('wm'),
        kind: result.detectedKind,
        content: event.content,
        salience: result.score,
        strength: Math.min(1.0, result.score + 0.3), // Initial strength above salience
        createdAt: event.timestamp,
        lastReinforcedAt: event.timestamp,
        sourceEventId: event.id,
        metadata: event.metadata,
      };
      ledger.add(item);

      // Generate capture intent for obligations/decisions that score above entry threshold
      if (result.score > cfg.pointeriseThreshold && (result.detectedKind === 'obligation' || result.detectedKind === 'decision')) {
        captureIntents.push({
          id: generateId('cap'),
          content: event.content,
          kind: result.detectedKind,
          sourceEventId: event.id,
          confidence: result.score,
        });
      }
    }

    // 6. Apply decay to all items
    const { pointerised, dropped } = ledger.applyDecay();

    // 7. Convert pointerised items to pointers
    for (const item of pointerised) {
      const pointer: Pointer = {
        id: generateId('ptr'),
        hintText: summariseForPointer(item),
        sourceRef: item.sourceEventId,
        confidence: item.strength / cfg.pointeriseThreshold, // Normalise
        retrievalCost: 'cheap',
        sourceItemId: item.id,
      };
      cfg.store.savePointer(pointer);
      ledger.remove(item.id);
    }

    // 8. Track consolidation trigger
    eventsSinceConsolidation++;
    if (eventsSinceConsolidation >= cfg.consolidationEventThreshold) {
      runConsolidation();
    }
  }

  function buildFrame(): CallFrame {
    const recentEvents = cfg.store.getEvents(cfg.recentTurnLimit * 2);
    const snapshot = ledger.getSnapshot();
    const pointers = cfg.store.getPointers();

    return buildCallFrame(
      recentEvents,
      snapshot,
      pointers,
      captureIntents,
      bm25,
      {
        recentTurnLimit: cfg.recentTurnLimit,
        autoRetrieveConfidence: cfg.autoRetrieveConfidence,
        maxTokens: cfg.maxFrameTokens,
      }
    );
  }

  function runConsolidation(): void {
    // Phase 1: heuristic consolidation only
    // - Merge near-duplicate items
    // - Decay weak items aggressively
    eventsSinceConsolidation = 0;

    const items = ledger.getAll();
    const seen = new Map<string, WorkingMemoryItem>();

    for (const item of items) {
      const key = item.content.toLowerCase().trim().slice(0, 50);
      if (seen.has(key)) {
        // Duplicate — keep the stronger one
        const existing = seen.get(key)!;
        if (item.strength > existing.strength) {
          ledger.remove(existing.id);
          seen.set(key, item);
        } else {
          ledger.remove(item.id);
        }
      } else {
        seen.set(key, item);
      }
    }
  }

  return {
    ingest,
    buildCallFrame: buildFrame,
    getWorkingMemory: () => ledger.getSnapshot(),
    getPointers: () => cfg.store.getPointers(),
  };
}

function summariseForPointer(item: WorkingMemoryItem): string {
  // Create a short hint from the item content
  const maxLen = 80;
  if (item.content.length <= maxLen) return item.content;
  return item.content.slice(0, maxLen - 3) + '...';
}
