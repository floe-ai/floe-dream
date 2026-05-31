# PRD: floe-dream — Cognitive Memory Orchestrator (Phase 1)

## Problem Statement

AI agents today receive an append-only transcript as their "memory" until the context window fills, then get a lossy summarisation. This causes: missed obligations, irrelevant context polluting responses, lost preferences/facts that were mentioned earlier, excessive token spend, and poor continuity across interruptions. The agent has no active process for deciding what matters — it just gets everything until it can't.

## Solution

Build `floe-dream` — a standalone cognitive memory orchestrator that sits between an agent's event stream and its model calls. It maintains a Working Memory ledger, scores items by salience, decays irrelevant details, preserves obligations and future-relevant facts as Pointers, retrieves knowledge on demand, and assembles a curated Call Frame for each model call. The result: fewer tokens, better recall of what matters, graceful forgetting of what doesn't.

Phase 1 delivers: the core orchestrator with ingestion, working memory, salience scoring, decay, pointer lifecycle, Call Frame assembly, BM25 retrieval, and a deterministic eval harness proving it works better than raw transcript.

## User Stories

1. As an agent developer, I want to ingest events into the orchestrator via a simple `ingest()` call, so that I can integrate memory into any agent loop without framework coupling.
2. As an agent developer, I want to call `buildCallFrame()` before each model call, so that the model receives a curated cognitive state instead of the raw transcript.
3. As an agent developer, I want the orchestrator to track obligations (things that must be done), so that the agent never forgets a user request even after many intervening turns.
4. As an agent developer, I want low-salience details to decay and disappear from the Call Frame automatically, so that irrelevant chatter doesn't pollute model responses.
5. As an agent developer, I want high-salience details that connect to known future events to be preserved as Pointers, so that the agent surfaces relevant facts when the moment arrives.
6. As an agent developer, I want the orchestrator to use BM25 keyword search to retrieve relevant stored content, so that prior knowledge is available without manual search.
7. As an agent developer, I want a Frame Decision Log for each Call Frame, so that I can debug and understand what was kept, dropped, pointerised, or retrieved and why.
8. As an agent developer, I want Working Memory to contain typed slots (goals, obligations, open loops) plus a general scored pool, so that items with distinct lifecycles are handled correctly.
9. As an agent developer, I want Pointers to carry hint text, source reference, confidence, and retrieval cost, so that the model knows knowledge exists without carrying the full payload.
10. As an agent developer, I want salience scores to be computed by fast heuristics (not LLM calls), so that Call Frame assembly adds minimal latency.
11. As an agent developer, I want reinforcement to boost item strength when entities are re-mentioned, so that repeatedly-referenced details stay alive in Working Memory.
12. As an agent developer, I want a pluggable Store interface with a SQLite default, so that I can persist memory state locally without external infrastructure.
13. As an agent developer, I want a deterministic eval harness that replays scripted IngestionEvent sequences, so that I can prove the orchestrator makes correct keep/drop/pointer/retrieve decisions.
14. As an agent developer, I want the eval harness to compare orchestrated Call Frames against a baseline (full transcript), so that I can demonstrate token savings and quality improvements.
15. As an agent developer, I want the orchestrator to have zero external dependencies beyond SQLite, so that it's portable and easy to embed anywhere.
16. As an agent developer, I want Consolidation Passes to run on event-count or idle triggers, so that Working Memory is periodically cleaned up without blocking the main path.
17. As an agent developer, I want Capture Intents to be produced (but not executed) by the orchestrator, so that durable knowledge writes are explicit and pluggable.
18. As an agent developer, I want the standalone integration path to work with just `createOrchestrator()`, `ingest()`, and `buildCallFrame()`, so that the API surface is minimal and learnable.

## Implementation Decisions

### Architecture

- **Standalone-first**: Zero Floe dependency. The library defines IngestionEvent (input), CallFrame (output), Store, Writer, and Orchestrator interfaces. Integration with Floe or Pi happens through external Adapters.
- **Module name**: `floe-dream`. TypeScript, ESM-only, Node.js target.

### Core Modules

1. **Orchestrator** (deep module) — The main entry point. Accepts configuration, exposes `ingest()` and `buildCallFrame()`. Coordinates all other modules. Simple interface, complex internals.

2. **Working Memory Ledger** (deep module) — Manages typed slots (goals, obligations, open loops) and a general scored pool. Handles insertion, decay, reinforcement, pointerisation, and removal. Items have: id, kind, content, salience score, strength, created timestamp, last reinforced timestamp, source event id, metadata.

3. **Salience Scorer** (deep module) — Evaluates Ingestion Events against salience dimensions (obligation, entity linkage, recurrence, novelty, recoverability, etc.). Returns numeric scores. Pure function: event + current memory state → scores. No LLM calls.

4. **Decay Engine** — Applies exponential time-based decay to Working Memory item strength. Reinforcement resets/boosts. Pointerisation threshold and drop threshold are configurable.

5. **Call Frame Builder** (deep module) — Assembles a CallFrame from current Working Memory state. Selects items by salience, applies token budget, produces the Frame Decision Log. Pure function: memory state + config → CallFrame + DecisionLog.

6. **BM25 Index** — Keyword search over ingested content. Used by the retrieval system to find relevant prior content when Pointers are resolved or relevance is detected.

7. **Store** (interface + SQLite impl) — Persists Working Memory, ingested events, and index state. SQLite implementation uses a single file database.

8. **Eval Harness** — Replays IngestionEvent[] sequences, captures CallFrame snapshots at assertion points, compares against expected Working Memory state and frame contents.

### Key Interfaces (type shapes)

```typescript
interface IngestionEvent {
  id: string;
  timestamp: number;
  kind: string; // 'user_message' | 'assistant_message' | 'tool_call' | 'tool_result' | ...
  content: string;
  metadata?: Record<string, unknown>;
  source?: string;
}

interface CallFrame {
  recentTurns: IngestionEvent[];
  workingMemory: WorkingMemorySnapshot;
  pointers: Pointer[];
  retrievedArtefacts: RetrievedArtefact[];
  captureHints: CaptureIntent[];
  decisionLog: FrameDecisionLog;
}

interface WorkingMemoryItem {
  id: string;
  kind: 'goal' | 'obligation' | 'open_loop' | 'decision' | 'entity' | 'general';
  content: string;
  salience: number;
  strength: number;
  createdAt: number;
  lastReinforcedAt: number;
  sourceEventId: string;
  metadata?: Record<string, unknown>;
}

interface Pointer {
  id: string;
  hintText: string;
  sourceRef: string;
  confidence: number;
  retrievalCost: 'cheap' | 'moderate' | 'expensive';
}
```

### Decay Model

- Strength decays exponentially: `strength * e^(-λ * Δevents)` where λ is configurable
- Reinforcement (re-mention, entity link) resets strength to a configurable boost value
- Pointerise threshold: items below this become Pointers (hint only, full content retrievable)
- Drop threshold: items below this are removed from Working Memory entirely

### Retrieval

- BM25-only in Phase 1 (deterministic, no vector DB dependency)
- Pointer resolution: when confidence > auto-retrieve threshold, full content is pulled into the Call Frame
- Below that threshold: only the hint text appears in the Call Frame

### Consolidation

- Triggered after N events or T seconds of idle
- Phase 1: consolidation is heuristic-only (LLM consolidation is Phase 2 future work)
- Operations: merge duplicate items, decay weak items, promote strong items, generate Capture Intents

## Testing Decisions

### Testing Philosophy

- Test external behaviour through the public API (`ingest()`, `buildCallFrame()`), not internal state
- Tests should be deterministic — no randomness, no real clocks, no network
- Use the eval harness pattern: feed scripted events, assert on Call Frame contents
- Each deep module (Working Memory Ledger, Salience Scorer, Call Frame Builder) gets its own test suite exercising its public interface

### Modules Under Test

1. **Orchestrator integration tests** — End-to-end: ingest events, build frames, verify correct items appear/disappear
2. **Working Memory Ledger unit tests** — Insert, decay, reinforce, pointerise, drop lifecycle
3. **Salience Scorer unit tests** — Verify scoring dimensions produce expected relative ordering
4. **Call Frame Builder unit tests** — Given a fixed memory state, verify frame assembly and decision log
5. **BM25 Index unit tests** — Index documents, query, verify relevance ranking
6. **Decay Engine unit tests** — Verify exponential decay curve, reinforcement boost, threshold crossings
7. **Eval scenario tests** — The planted-fact scenarios from the brief (irrelevant decay, preference retention, obligation preservation, pointer retrieval)

### Prior Art

None in this repo (greenfield). Tests will use Vitest (standard for modern TypeScript projects), with deterministic time injection.

## Out of Scope

- **LLM-based consolidation**: Phase 2. Phase 1 consolidation is heuristic-only.
- **Vector search**: Phase 2. BM25 is sufficient for Phase 1 eval scenarios.
- **Floe Adapter**: Lives in the Floe repo, not here. We build the standalone library only.
- **Pi integration**: Adapter concern, not orchestrator concern.
- **Writer implementations**: Phase 1 produces Capture Intents but does not execute them. A Markdown Writer is future work.
- **UI/observability dashboard**: Frame Decision Logs are produced as data structures; no rendering.
- **Multi-session memory**: Phase 1 operates within a single session. Cross-session persistence is future.

## Further Notes

- The eval harness is intentionally built FIRST (per the brief's recommendation) so that every subsequent module has regression coverage from day one.
- The module should be publishable to npm as `floe-dream` when ready.
- TypeScript strict mode, ESM-only, no CommonJS.
- Minimal dependencies: `better-sqlite3` for Store, a BM25 library (or hand-rolled — it's simple enough), and `vitest` for testing.
