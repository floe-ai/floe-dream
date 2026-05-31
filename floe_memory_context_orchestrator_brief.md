# Floe Memory/Context Orchestrator Brief

Updated: 2026-05-27

## 1. Purpose

This brief defines a proposed Memory/Context Orchestrator for Floe: a layer that gives agents a more human-like short-term memory process by continuously pruning, strengthening, pointerising, retrieving, and capturing context before each model call.

The core idea is that the LLM should not receive an append-only transcript until the context window fills. Instead, every model call should be assembled from a live cognitive state: recent raw context, active working memory, high-salience facts, relevant retrieved artefacts, and lightweight pointers to recoverable knowledge.

This is not simply RAG, summarisation, or long-term memory. It is a harness-level context construction system that continuously decides what should remain cognitively alive.

## 2. Core Thesis

The context window is not short-term memory. It is closer to a raw sensory buffer.

Human short-term memory is an active process:
- important items are retained in richer form for a while;
- low-value details decay quickly;
- some information degrades into pointers;
- obligations and future-relevant details are rehearsed;
- details are externalised into notes/tasks before they vanish;
- retrieval often begins as an inkling that relevant knowledge exists, not full recall.

Floe should mirror this at the runtime/context layer.

The orchestrator should answer two questions on every meaningful event:

1. Retrieval direction  
   Does this event connect to existing knowledge that may help the agent now?

2. Storage direction  
   Does this event create, strengthen, modify, or decay something that should be remembered, captured, or externalised?

## 3. Desired Outcome

A long-running Floe session should behave less like:

“Send the whole transcript to the LLM until the limit is reached, then summarise.”

And more like:

“Maintain an active working set, keep only what has current predictive/use value, degrade recoverable information into pointers, retrieve details only when needed, and capture durable knowledge into human-readable artefacts.”

Success means:
- fewer tokens sent per call;
- less irrelevant context distracting the model;
- fewer missed obligations;
- better continuity across interruptions;
- better use of prior knowledge without over-injecting it;
- human-readable durable knowledge records;
- replayable evidence that pruning/retrieval improves outcomes.

## 4. Architectural Position

The orchestrator should sit between the Floe event spine and the Pi model/runtime call.

High-level flow:

Floe bus event  
→ Floe bridge / Pi runtime adapter  
→ Memory/Context Orchestrator  
→ pi-agent-core `transformContext` or equivalent context seam  
→ Pi model call  
→ Pi/Floe runtime events  
→ Memory/Context Orchestrator update loop

The orchestrator should not require forking `pi-agent-core` if the available context-transform seam is sufficient. Floe should own memory, salience, retrieval, and context assembly policy while Pi continues to own authentication, provider/model integration, and upstream runtime capabilities.

If `pi-agent-core` does not expose enough control for final prompt/message assembly in the non-coding-agent path, Floe may need a custom runtime adapter layer around it. The goal is to keep this as integration code, not a fork, so upstream Pi updates remain easy to consume.

## 5. What Floe Owns

Floe should own:

- event normalisation;
- working-memory ledger;
- salience scoring;
- context pruning;
- pointer generation;
- retrieval hints;
- retrieval policy;
- capture queue;
- durable knowledge writes;
- provenance links;
- evaluation harness;
- observability of what was kept, dropped, pointerised, or retrieved.

Pi should continue to own:

- model/provider calls;
- provider authentication;
- low-level runtime execution;
- model streaming;
- provider-specific payload handling;
- upstream runtime improvements.

## 6. Provider-Agnostic Knowledge Substrate

The long-term knowledge substrate should not be tied to a single wiki or memory tool.

Obsidian/Markdown is a good first implementation because it is inspectable, local-friendly, easy to diff, and easy for agents to read/write. But the architecture should support:

- Obsidian / Markdown vaults;
- Confluence;
- Notion;
- SharePoint;
- Google Docs;
- Git-backed docs;
- tickets;
- transcripts;
- chat logs;
- code repositories;
- generated artefacts;
- PDFs and design docs.

Principle:

Durable human-readable artefacts are the long-term memory. Databases, vectors, BM25 indexes, and graphs are retrieval infrastructure over those artefacts.

## 7. Memory Layers

The system should distinguish these layers:

### 7.1 Raw Source

Full transcript, event log, tool calls, tool results, file snapshots, source documents, and other provenance records.

Purpose:
- reconstruction;
- audit;
- source retrieval;
- later consolidation.

This layer is not generally injected into model context unless needed.

### 7.2 Indexed Chunks

Chunked source content indexed through:
- BM25 / keyword search;
- vector search;
- metadata filters;
- entity indexes;
- temporal indexes;
- graph/relationship indexes.

Purpose:
- retrieval;
- relevance scoring;
- evidence lookup.

### 7.3 Working Memory

A compact live state representing what is cognitively active now.

Contains:
- active goals;
- obligations;
- open loops;
- decisions;
- unresolved questions;
- key entities;
- high-salience details;
- pointers;
- capture candidates;
- current task frame.

Purpose:
- orient the next model call without dumping the transcript.

### 7.4 Pointers

Lightweight memory cues pointing to recoverable knowledge.

Examples:
- “Relevant note exists: AI Memory Architecture → Short-Term Memory Breakthrough.”
- “Lucas has a lunch-related preference connected to next week’s meeting.”
- “Burndown chart has existing reporting guidance.”

Purpose:
- preserve the existence/location of knowledge without carrying the full payload.

### 7.5 Durable Knowledge

Human-readable notes, docs, task records, decision records, project summaries, preference records, and wiki pages.

Purpose:
- long-term shared memory for humans and agents.

### 7.6 Consolidation / Dream Layer

Periodic or event-triggered processes that convert raw experience into durable knowledge.

Purpose:
- deduplication;
- contradiction detection;
- knowledge promotion;
- note/task/doc updates;
- decay of weak traces;
- human review prompts where needed.

## 8. Continuous Relevance Layer

The core mechanism is a continuous relevance layer that runs on every meaningful event.

Events may include:
- user messages;
- assistant messages;
- tool calls;
- tool results;
- file edits;
- file reads;
- runtime events;
- turn boundaries;
- plan updates;
- task state changes;
- retrieved artefacts;
- human approvals/corrections;
- workspace/project changes.

For each event, the system should ask:

1. What entities, topics, tasks, projects, people, dates, artefacts, and obligations are present?
2. What existing knowledge does this connect to?
3. What active working-memory items are strengthened or weakened?
4. What should stay verbatim in context?
5. What should degrade into a pointer?
6. What should be dropped from active context but remain recoverable?
7. What should be captured into durable knowledge?
8. What should be retrieved now?

The LLM should not be responsible for noticing all of this from scratch. The harness should produce relevance signals automatically.

## 9. Salience Model

The system should avoid hard-coded domain rules such as:

- “For code, always keep signatures.”
- “For documents, keep headings.”
- “Ignore lunch details.”

Those may emerge as render behaviours, but the core mechanism should be domain-agnostic.

Each event/chunk/item should be scored through general salience dimensions:

- obligation: does this imply something must be done?
- commitment: did the user or agent agree to something?
- current goal relevance: does it affect the current task?
- future relevance: does it connect to a known future event?
- entity linkage: does it involve known people, projects, files, tasks, or artefacts?
- recurrence: has this come up repeatedly?
- novelty: is this new information?
- specificity: is it concrete/actionable?
- source authority: did it come from the user, a manager, a source doc, a tool, or inference?
- recoverability: can it be retrieved later if dropped?
- volatility: will it become stale quickly?
- social weight: does it affect a relationship, preference, trust, or expectation?
- contradiction risk: does it conflict with existing knowledge?
- capture urgency: will useful detail decay if not externalised?
- user-marked importance: did the user explicitly or implicitly emphasise it?

The system should notice liberally but write conservatively.

## 10. Context Assembly

Before each model call, the orchestrator builds a context package from available memory state.

Candidate components:

1. System/developer/runtime instructions  
   Always included according to runtime policy.

2. Current user turn  
   Always included verbatim.

3. Recent local turns  
   Included verbatim while they remain high-relevance or needed for conversational coherence.

4. Active working memory  
   Compact structured summary of current goals, obligations, open loops, decisions, and unresolved questions.

5. High-salience verbatim details  
   Included only where exact wording/data is currently useful.

6. Pointers  
   Included where the model should know knowledge exists but does not yet need full detail.

7. Retrieved artefacts/chunks  
   Included only when relevance crosses a threshold or the agent requests/needs exact source.

8. Capture queue hints  
   Included when the model should help externalise or resolve something.

9. Provenance handles  
   References to source IDs/locations so deeper retrieval can occur later.

The model should see a curated cognitive state, not the whole transcript.

## 11. Pruning Behaviour

Each context item can move through states:

Raw event  
→ attended item  
→ working-memory item  
→ rich active context  
→ summary/pointer  
→ recoverable archive  
→ durable knowledge  
→ stale/decayed

Possible actions after each event:

- keep verbatim;
- strengthen;
- weaken;
- merge;
- split;
- pointerise;
- retrieve;
- capture;
- externalise;
- mark stale;
- drop from active context;
- keep only in source/provenance.

This creates a self-pruning context that evolves every turn.

## 12. Retrieval Behaviour

Retrieval should be pointer-first.

The orchestrator should usually avoid dumping full knowledge into context immediately. Instead, it can inject hints:

- relevant note exists;
- related decision exists;
- related task exists;
- related person/project preference exists;
- matching source chunk exists;
- similar prior issue exists.

The model can then proceed with only the hint, or ask/use a tool path to retrieve the full artefact if needed.

Thresholds should support:
- no action;
- weak pointer;
- strong pointer;
- automatic retrieval;
- capture/update request;
- human review.

## 13. Storage Behaviour

The storage side should be symmetrical with retrieval.

When an event occurs, the system should detect whether it:

- creates a new obligation;
- modifies an existing obligation;
- resolves an open loop;
- creates a decision;
- contradicts existing knowledge;
- reveals a durable preference;
- produces a reusable insight;
- updates a project state;
- should be attached to a person, task, project, document, or artefact;
- should remain raw only;
- should be ignored.

Storage should be staged:

1. Working-memory item  
   Useful now, not durable yet.

2. Capture candidate  
   Likely worth writing down, but not yet committed.

3. Durable artefact update  
   Human-readable note/task/doc/wiki update.

4. Source/provenance link  
   Raw evidence retained underneath.

Durable writes should be conservative and inspectable.

## 14. Integration with Pi / pi-agent-core

The immediate integration hypothesis:

- Use `pi-agent-core` as the model/runtime layer.
- Avoid forking Pi where possible.
- Insert Floe’s context/memory orchestration through the available context transform seam.
- Keep any provider-payload rewrite hook as a fallback/inspection layer, not the primary abstraction.
- Listen to Pi/Floe runtime events to update memory state after tool calls, tool results, messages, and turn boundaries.

If using Pi Coding Agent is not part of the stack, this should be custom Floe bridge/runtime adapter wiring, not a Pi Coding Agent extension.

Desired architecture:

Floe runtime adapter constructs or receives `AgentMessage[]`  
→ Memory/Context Orchestrator transforms messages  
→ pi-agent-core receives pruned/enriched context  
→ Pi model call executes  
→ runtime events update memory/index state

Open verification items:
- confirm exact `pi-agent-core` API available in the direct usage path;
- confirm where `transformContext` is accepted;
- confirm which runtime events are observable outside Pi Coding Agent;
- confirm whether tool calls/results are visible before and after execution;
- confirm whether final provider payload can be inspected for debug;
- confirm whether private reasoning summaries are exposed by the chosen provider/model.

## 15. Evaluation Strategy

This must be evaluated as a memory/context system, not as a summariser.

Use replayable scenarios and compare:

Baseline:
- Pi default session/history/compaction behaviour.

Experiment:
- Floe Memory/Context Orchestrator with pruning, pointers, retrieval, and capture.

Each scenario should run against the same scripted event log.

## 16. Evaluation Scenarios

### 16.1 Irrelevant Detail Decay

Plant irrelevant lunch chatter from multiple people.

Expected:
- low-value details disappear from active context quickly;
- full transcript remains recoverable;
- no irrelevant details pollute later responses.

### 16.2 Contextual Preference Retention

Plant “Lucas likes burritos” plus a future lunch with Lucas.

Expected:
- detail is retained or pointerised because it connects to future event;
- later lunch-planning prompt retrieves/surfaces it;
- unrelated lunch facts are dropped.

### 16.3 Obligation Preservation

Plant a manager request: create an executive-ready burndown chart.

Expected:
- obligation remains active until captured/resolved;
- details do not decay below useful level before capture;
- later interruption/resumption still surfaces the task.

### 16.4 Pointer-First Retrieval

Plant a prior architecture note relevant to a later question.

Expected:
- system first injects a pointer;
- full note is retrieved only if needed;
- answer improves without unnecessary context bloat.

### 16.5 Code/Document Context Shift

Use a long code/doc session where only a subset remains relevant.

Expected:
- active region stays rich;
- inactive regions degrade into pointers/summaries;
- exact details are retrieved when referenced by error, edit, or question;
- no hard-coded domain behaviour is required at the salience layer.

### 16.6 Contradiction Handling

Introduce a new decision that conflicts with a previous note.

Expected:
- contradiction is detected or flagged;
- old knowledge is not blindly reinforced;
- human review/capture queue is updated.

### 16.7 Long Session Token Pressure

Run a long session close to context limits.

Expected:
- orchestrated context stays smaller;
- task quality is equal or better than baseline;
- missed obligations do not increase.

## 17. Metrics

Track both mechanical and behavioural metrics.

### Mechanical Metrics

- tokens sent per model call;
- context size over time;
- number of items kept verbatim;
- number of items pointerised;
- number of retrieval hints;
- number of full retrievals;
- number of capture candidates;
- number of durable writes;
- latency overhead;
- index/query cost;
- compaction frequency;
- recoverability of dropped items.

### Behavioural Metrics

- task success;
- obligation recall;
- false memory injection;
- irrelevant context use;
- retrieval precision;
- retrieval recall;
- missed relevant detail rate;
- over-capture rate;
- premature pruning rate;
- contradiction detection;
- answer quality;
- continuity after interruption.

### Human Review Metrics

- user accepts/rejects capture candidates;
- user edits generated notes;
- user says “you forgot”;
- user says “why did you bring that up?”;
- user trust in surfaced memory.

## 18. Observability Requirements

The system needs clear debug visibility.

For each model call, record:

- full source event range available;
- final context package sent;
- items kept verbatim;
- items summarised;
- items pointerised;
- items dropped from active context;
- retrieval candidates considered;
- retrievals performed;
- capture candidates created;
- salience scores and contributing signals;
- provenance for each included item;
- reason for pruning/retrieval decisions.

This should be visible in Floe debug/timeline views without exposing unnecessary telemetry to the normal chat UI.

## 19. Prototype Plan

### Phase 1 — Passive Index + Replay Harness

Build:
- source transcript/event store;
- chunker;
- BM25 index;
- vector index if available;
- metadata/entity extraction;
- replay harness for scripted scenarios.

Goal:
- prove events can be indexed and searched deterministically.

### Phase 2 — Working-Memory Ledger

Build:
- active goals;
- obligations;
- open loops;
- decisions;
- pointers;
- capture candidates;
- decay/strength scoring;
- event-driven update loop.

Goal:
- prove the system can maintain compact cognitive state.

### Phase 3 — Context Assembly Hook

Build:
- integration into Floe bridge/Pi adapter;
- context package construction;
- `transformContext` or equivalent wiring;
- debug trace of final prompt/messages.

Goal:
- prove Floe can control what text reaches the model without forking Pi.

### Phase 4 — Retrieval + Pointer Policy

Build:
- relevance thresholds;
- pointer-first injection;
- automatic deep retrieval only when needed;
- source/provenance handles.

Goal:
- reduce context while preserving useful recall.

### Phase 5 — Capture Queue + Durable Notes

Build:
- capture candidate generation;
- markdown/Obsidian first writer;
- provenance links to raw session;
- human review path;
- later provider abstraction.

Goal:
- convert important short-term traces into durable knowledge.

### Phase 6 — Evaluation Battery

Build:
- baseline vs orchestrated test runs;
- deterministic graders;
- LLM-as-judge where useful;
- regression suite;
- token/latency/quality dashboards.

Goal:
- prove the orchestrator improves quality, cost, and continuity.

## 20. Main Risks

### Premature Pruning

The system drops something before it is safely recoverable.

Mitigation:
- conservative thresholds;
- recoverability scoring;
- raw transcript preservation;
- pointer before deletion;
- replay tests.

### Memory Sludge

The system captures too much and pollutes the knowledge base.

Mitigation:
- staged capture;
- human review for durable writes;
- decay weak traces;
- provenance;
- promotion only after reinforcement or high confidence.

### Over-Retrieval

The system injects too much related knowledge and distracts the model.

Mitigation:
- pointer-first retrieval;
- strict deep retrieval thresholds;
- token budget controls;
- relevance attribution.

### Domain Overfitting

The system becomes a set of hard-coded behaviours for code, docs, meetings, etc.

Mitigation:
- domain-agnostic salience model;
- domain-specific renderers only after salience is decided.

### Pi Integration Limits

Pi does not expose enough control in the direct `pi-agent-core` path.

Mitigation:
- verify extension seams;
- keep Floe adapter thin;
- request/upstream needed hooks;
- avoid forks unless unavoidable.

### Evaluation Ambiguity

It is hard to prove memory is “better”.

Mitigation:
- scripted planted-fact scenarios;
- baseline comparison;
- deterministic expected memory actions;
- human review metrics;
- task outcome grading.

## 21. Key Design Principles

- The LLM should not be responsible for remembering to search.
- Context should be assembled, not appended.
- Working memory is active salience, not context length.
- Store raw source for provenance, not as the primary memory interface.
- Durable human-readable artefacts are long-term memory.
- Databases and vectors are retrieval infrastructure.
- Pointer before payload.
- Notice liberally, write conservatively.
- Pruning must preserve recoverability.
- Same salience engine, different renderers.
- Floe should own memory/context policy; Pi can remain the runtime/model provider.
- The system should be measurable through replay, debug traces, and behavioural outcomes.

## 22. Open Questions

1. What is the exact minimal `pi-agent-core` hook needed for direct usage?
2. Can `transformContext` fully replace the outgoing message list in the path Floe uses?
3. Which Pi runtime events are available without Pi Coding Agent?
4. Should the first prototype use BM25 only, or BM25 plus vectors immediately?
5. What is the minimal working-memory schema?
6. What thresholds should define keep, pointerise, retrieve, capture, or drop?
7. Should capture candidates be human-approved at first?
8. How should durable markdown notes link back to raw transcript/event IDs?
9. How should this interact with Floe’s existing event spine and debug timeline?
10. What is the smallest scenario suite that proves the idea is better than baseline?

## 23. Recommended Immediate Next Step

Build a replayable eval harness before building a full memory system.

Reason:
- it prevents subjective “this feels better” evaluation;
- it gives a baseline;
- it forces clear definitions of keep/drop/pointer/retrieve/capture;
- it creates regression tests;
- it lets the architecture evolve without losing proof.

Minimum proof:

A scripted conversation with:
- irrelevant details that should decay;
- a future-relevant social detail that should survive as a pointer;
- an obligation that should remain active and be captured;
- a later prompt that should trigger retrieval;
- enough filler to stress context length.

Run it through:
1. baseline Pi context;
2. Floe orchestrated context.

Compare:
- final answers;
- missed obligations;
- irrelevant leakage;
- token count;
- retrieval behaviour;
- capture correctness.

If the orchestrated version remembers the right things, forgets the right things, retrieves only when useful, and uses fewer tokens, the approach is validated.
