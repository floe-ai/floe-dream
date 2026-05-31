# Floe Memory/Context Orchestrator (floe-dream)

A cognitive memory layer that assembles, prunes, and evolves the state sent to an LLM on each model call — giving agents human-like short-term memory rather than an append-only transcript.

This is a standalone library with zero Floe dependency. It integrates with Floe (or any agent runtime) through adapters.

## Language

**Call Frame**:
The complete assembled state sent to the model for a single model call. A structured object containing working memory, pointers, retrieved artefacts, and recent turns.
_Avoid_: Context (collides with Floe substrate Context), prompt, message list.

**Adapter**:
An integration layer that connects the orchestrator to a specific host runtime (e.g. Floe, a custom agent loop, a CLI tool). Translates host events into Ingestion Events and consumes Call Frames.
_Avoid_: Plugin, driver, bridge (collides with floe-bridge).

**Ingestion Event**:
The orchestrator's generic input primitive. A typed envelope carrying `id`, `timestamp`, `kind`, `content`, and optional `metadata`/`source`. Adapters produce these; the orchestrator never sees host-specific event types.
_Avoid_: Bus event, Floe event, message.

**Working Memory**:
The compact live cognitive state representing what is actively relevant now. Contains typed slots (goals, obligations, open loops) for items with distinct lifecycles, plus a general scored pool for other high-salience items.
_Avoid_: Short-term memory (too vague), session state, transcript.

**Obligation**:
A working memory item representing something that must be done. Has source, deadline (if known), and resolution status. Distinct lifecycle: tracks urgency and completion.
_Avoid_: Task (overloaded), TODO.

**Pointer**:
A lightweight working memory cue indicating that relevant knowledge exists and where to find it, without carrying the full payload. Contains hint text, source reference, confidence, and retrieval cost.
_Avoid_: Reference, link, bookmark.

**Salience Score**:
A numeric signal indicating how relevant/important an item is to the current cognitive state. Computed by heuristics in real-time; refined by LLM during Consolidation Passes.
_Avoid_: Priority, weight, rank.

**Consolidation Pass**:
An async background process (the "dream layer") where an LLM re-scores, promotes, demotes, merges, and captures working memory items. Not on the critical path of Call Frame assembly. Triggered by event count or idle time, not on a schedule.
_Avoid_: Compaction, summarisation (those are sub-operations within consolidation).

**Frame Decision Log**:
A structured record of every keep/drop/pointerise/retrieve decision made during a single Call Frame assembly. The primary debug and evaluation surface.
_Avoid_: Trace, audit log.

**Capture Intent**:
A request to write durable knowledge, produced by the orchestrator but executed by a pluggable Writer. The orchestrator never writes directly to external systems.
_Avoid_: Write, save, persist.

**Writer**:
A pluggable output interface that executes Capture Intents into a durable knowledge substrate (Markdown/Obsidian, Confluence, Notion, etc.).
_Avoid_: Exporter, sink.

**Store**:
The pluggable persistence interface for working memory, indexes, and event history. Default implementation: SQLite.
_Avoid_: Database, backend.

## Relationships

- An **Adapter** produces **Ingestion Events** from host runtime events
- The orchestrator processes **Ingestion Events** to update **Working Memory**
- **Working Memory** items carry a **Salience Score** that decays over time and is boosted by reinforcement
- Before each model call, the orchestrator assembles a **Call Frame** from Working Memory, Pointers, and retrieved artefacts
- Each **Call Frame** assembly produces a **Frame Decision Log**
- Items below salience threshold are converted to **Pointers**; below a lower threshold, dropped entirely
- **Consolidation Passes** run async (on event-count or idle triggers) and may produce **Capture Intents**
- **Capture Intents** are executed by a **Writer** into durable knowledge
- The **Store** persists Working Memory, indexes, and raw event history between sessions

## Integration Architecture

### Dependency Direction

```
┌──────────────────────────────────────────────────┐
│  floe-dream (standalone library)                 │
│                                                  │
│  Defines: IngestionEvent, CallFrame, Store,      │
│           Writer, Orchestrator                   │
│  Depends on: nothing external                    │
└──────────────────────────────────────────────────┘
         ▲ imported by                ▲ imported by
         │                            │
┌────────┴─────────┐       ┌─────────┴──────────┐
│  Floe Adapter    │       │  Standalone Consumer│
│  (lives in floe  │       │  (any agent loop)   │
│   repo)          │       │                     │
│                  │       │  Produces Ingestion  │
│  Imports:        │       │  Events directly    │
│  - floe-dream    │       │  from its own event │
│  - floe-bus      │       │  stream             │
│  - floe-bridge   │       └────────────────────-┘
└──────────────────┘
```

### Floe Integration Path

The Floe Adapter lives in the Floe monorepo (e.g. as a `floe-dream-adapter` workspace). It:

1. **Listens** to `floe-bus` events (user messages, assistant messages, tool calls, tool results, turn boundaries, delivery events)
2. **Translates** each bus event into an `IngestionEvent` the orchestrator understands
3. **Calls** the orchestrator's `ingest()` method to update working memory
4. **Before each model call**, calls `buildCallFrame()` to get the assembled cognitive state
5. **Flattens** the Call Frame into the message format that `floe-bridge` / Pi expects
6. **Wires into** Pi's `transformContext` seam (or equivalent) so the model receives the orchestrated frame instead of the raw transcript

```
floe-bus event
  → Floe Adapter.onEvent()
    → floe-dream orchestrator.ingest(ingestionEvent)

floe-bridge prepares model call
  → Floe Adapter.buildFrame()
    → floe-dream orchestrator.buildCallFrame()
      → returns CallFrame
    → adapter flattens CallFrame → Pi message[] format
  → Pi model call with orchestrated messages
```

### Pi Integration (via Floe Adapter)

The orchestrator itself has no Pi dependency. Pi integration is handled entirely by the Floe Adapter:

- If `pi-agent-core` exposes a `transformContext` hook: the adapter registers a transformer that replaces the default message history with the Call Frame contents.
- If Pi does not expose enough control: the adapter constructs the full message payload and uses Pi only for the model call itself (auth, streaming, provider handling).
- Runtime events from Pi (tool calls, tool results, assistant responses) flow back through `floe-bus` → adapter → orchestrator `ingest()`.

The orchestrator is agnostic to whether the model call goes through Pi, a direct OpenAI SDK call, or any other provider.

### Standalone Integration Path (no Floe, no Pi)

For non-Floe consumers (custom agent loops, CLI tools, other frameworks):

```typescript
import { createOrchestrator } from 'floe-dream';

const orchestrator = createOrchestrator({ store: sqliteStore('./memory.db') });

// On each event in your agent loop:
orchestrator.ingest({
  id: 'evt-1',
  timestamp: Date.now(),
  kind: 'user_message',
  content: 'Remember that Lucas likes burritos'
});

// Before each model call:
const frame = orchestrator.buildCallFrame();
// frame.workingMemory — active goals, obligations, scored items
// frame.pointers     — hints about recoverable knowledge
// frame.retrievedArtefacts — full content pulled in by high-confidence pointers
// frame.recentTurns  — verbatim recent conversation
// → flatten into your provider's message format however you like

// After model response:
orchestrator.ingest({
  id: 'evt-2',
  timestamp: Date.now(),
  kind: 'assistant_message',
  content: 'Got it, I will remember that.'
});
```

No bus, no bridge, no Pi. Just ingest events and build frames.

## Example dialogue

> **Dev:** "When the orchestrator receives an Ingestion Event, does it immediately update the Call Frame?"
> **Domain expert:** "No — ingestion updates Working Memory. The Call Frame is only built on demand, right before a model call. They're separate operations."

> **Dev:** "If I'm building a standalone agent without Floe, do I need to understand Floe's bus events?"
> **Domain expert:** "No. You produce Ingestion Events directly. The Floe Adapter is the only thing that knows about bus events."

## Flagged ambiguities

- "context" was used in the brief to mean both the Floe substrate Context (bounded stream) and the LLM payload. Resolved: the LLM payload is a **Call Frame**; substrate streams remain **Contexts**.
- "bridge" in Floe means `floe-bridge` (runtime embodiment). The memory orchestrator's integration layer is called an **Adapter** to avoid collision.
- "event" in Floe means a bus Event (the communication primitive). The orchestrator's input is an **Ingestion Event** — a generic envelope that may or may not originate from a bus Event.
