// --- Ingestion Event ---

export interface IngestionEvent {
  id: string;
  timestamp: number;
  kind: string;
  content: string;
  metadata?: Record<string, unknown>;
  source?: string;
}

// --- Working Memory ---

export type WorkingMemoryItemKind =
  | 'goal'
  | 'obligation'
  | 'open_loop'
  | 'decision'
  | 'entity'
  | 'general';

export interface WorkingMemoryItem {
  id: string;
  kind: WorkingMemoryItemKind;
  content: string;
  salience: number;
  strength: number;
  createdAt: number;
  lastReinforcedAt: number;
  sourceEventId: string;
  metadata?: Record<string, unknown>;
}

export interface WorkingMemorySnapshot {
  goals: WorkingMemoryItem[];
  obligations: WorkingMemoryItem[];
  openLoops: WorkingMemoryItem[];
  decisions: WorkingMemoryItem[];
  entities: WorkingMemoryItem[];
  general: WorkingMemoryItem[];
}

// --- Pointers ---

export type RetrievalCost = 'cheap' | 'moderate' | 'expensive';

export interface Pointer {
  id: string;
  hintText: string;
  sourceRef: string;
  confidence: number;
  retrievalCost: RetrievalCost;
  sourceItemId?: string;
}

// --- Retrieved Artefacts ---

export interface RetrievedArtefact {
  id: string;
  content: string;
  sourceRef: string;
  relevanceScore: number;
}

// --- Capture Intents ---

export interface CaptureIntent {
  id: string;
  content: string;
  kind: 'obligation' | 'preference' | 'decision' | 'insight' | 'fact';
  sourceEventId: string;
  confidence: number;
}

// --- Frame Decision Log ---

export type FrameDecision =
  | { action: 'kept_verbatim'; itemId: string; reason: string }
  | { action: 'pointerised'; itemId: string; reason: string }
  | { action: 'dropped'; itemId: string; reason: string }
  | { action: 'retrieved'; pointerId: string; reason: string }
  | { action: 'reinforced'; itemId: string; reason: string };

export interface FrameDecisionLog {
  frameId: string;
  timestamp: number;
  decisions: FrameDecision[];
  tokenEstimate: number;
}

// --- Call Frame ---

export interface CallFrame {
  recentTurns: IngestionEvent[];
  workingMemory: WorkingMemorySnapshot;
  pointers: Pointer[];
  retrievedArtefacts: RetrievedArtefact[];
  captureHints: CaptureIntent[];
  decisionLog: FrameDecisionLog;
}

export interface CallFrameMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CallFrameMessageBuilderOptions {
  includeSystemSummary?: boolean;
  systemIntro?: string;
}

// --- Store Interface ---

export interface Store {
  saveEvent(event: IngestionEvent): void;
  getEvents(limit?: number): IngestionEvent[];
  getEvent(id: string): IngestionEvent | undefined;

  saveWorkingMemoryItem(item: WorkingMemoryItem): void;
  getWorkingMemoryItems(): WorkingMemoryItem[];
  getWorkingMemoryItem(id: string): WorkingMemoryItem | undefined;
  updateWorkingMemoryItem(item: WorkingMemoryItem): void;
  removeWorkingMemoryItem(id: string): void;

  savePointer(pointer: Pointer): void;
  getPointers(): Pointer[];
  removePointer(id: string): void;

  close(): void;
}

// --- Orchestrator Config ---

export interface OrchestratorConfig {
  store: Store;
  recentTurnLimit?: number;
  maxFrameTokens?: number;
  pointeriseThreshold?: number;
  dropThreshold?: number;
  decayLambda?: number;
  reinforcementBoost?: number;
  autoRetrieveConfidence?: number;
  consolidationEventThreshold?: number;
  consolidationIdleMs?: number;
}

// --- Orchestrator Interface ---

export interface Orchestrator {
  ingest(event: IngestionEvent): void;
  buildCallFrame(): CallFrame;
  getWorkingMemory(): WorkingMemorySnapshot;
  getPointers(): Pointer[];
}
