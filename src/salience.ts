import type { IngestionEvent, WorkingMemoryItem } from './types.js';

export interface SalienceSignals {
  obligation: number;
  entityLinkage: number;
  recurrence: number;
  novelty: number;
  specificity: number;
  recoverability: number;
  userMarkedImportance: number;
  futureRelevance: number;
  socialWeight: number;
}

export interface SalienceResult {
  score: number;
  signals: SalienceSignals;
  detectedKind: WorkingMemoryItem['kind'];
  detectedEntities: string[];
}

const OBLIGATION_PATTERNS = [
  /\b(must|need to|have to|should|required|deadline|by (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|end of))\b/i,
  /\b(please|can you|could you|make sure|don't forget|remember)\b/i,
  /\b(action item|todo|task|deliverable|follow.?up)\b/i,
];

const FUTURE_PATTERNS = [
  /\b(tomorrow|next week|next month|upcoming|later|soon|eventually|schedule|meeting|appointment)\b/i,
  /\b(plan|planning|will|going to|intend)\b/i,
];

const DECISION_PATTERNS = [
  /\b(decided|decision|agreed|chosen|picked|settled on|going with|let's go with)\b/i,
];

const PREFERENCE_PATTERNS = [
  /\b(prefer|likes?|loves?|hates?|dislikes?|always|never|favou?rite)\b/i,
];

const ENTITY_PATTERN = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;

export function scoreSalience(
  event: IngestionEvent,
  existingItems: WorkingMemoryItem[]
): SalienceResult {
  const content = event.content;
  const signals: SalienceSignals = {
    obligation: scoreObligation(content),
    entityLinkage: scoreEntityLinkage(content, existingItems),
    recurrence: scoreRecurrence(content, existingItems),
    novelty: scoreNovelty(content, existingItems),
    specificity: scoreSpecificity(content),
    recoverability: scoreRecoverability(event),
    userMarkedImportance: scoreUserMarked(event),
    futureRelevance: scoreFutureRelevance(content),
    socialWeight: scoreSocialWeight(content),
  };

  const score = computeOverallScore(signals);
  const detectedKind = detectKind(content, signals);
  const detectedEntities = extractEntities(content);

  return { score, signals, detectedKind, detectedEntities };
}

function scoreObligation(content: string): number {
  let score = 0;
  for (const pattern of OBLIGATION_PATTERNS) {
    if (pattern.test(content)) score += 0.35;
  }
  return Math.min(score, 1.0);
}

function scoreEntityLinkage(content: string, existing: WorkingMemoryItem[]): number {
  if (existing.length === 0) return 0;
  const entities = extractEntities(content);
  let linked = 0;
  for (const entity of entities) {
    const entityLower = entity.toLowerCase();
    for (const item of existing) {
      if (item.content.toLowerCase().includes(entityLower)) {
        linked++;
        break;
      }
    }
  }
  return entities.length > 0 ? Math.min(linked / entities.length, 1.0) : 0;
}

function scoreRecurrence(content: string, existing: WorkingMemoryItem[]): number {
  const contentLower = content.toLowerCase();
  const words = contentLower.split(/\s+/).filter(w => w.length > 4);
  if (words.length === 0) return 0;
  let matches = 0;
  for (const item of existing) {
    const itemLower = item.content.toLowerCase();
    for (const word of words) {
      if (itemLower.includes(word)) {
        matches++;
        break;
      }
    }
  }
  return Math.min(matches / Math.max(existing.length, 1) * 2, 1.0);
}

function scoreNovelty(content: string, existing: WorkingMemoryItem[]): number {
  if (existing.length === 0) return 1.0;
  const contentLower = content.toLowerCase();
  for (const item of existing) {
    if (item.content.toLowerCase() === contentLower) return 0;
    const overlap = computeWordOverlap(contentLower, item.content.toLowerCase());
    if (overlap > 0.8) return 0.2;
  }
  return 1.0;
}

function scoreSpecificity(content: string): number {
  let score = 0.3;
  // Numbers increase specificity
  if (/\d+/.test(content)) score += 0.2;
  // Proper nouns increase specificity
  if (ENTITY_PATTERN.test(content)) score += 0.2;
  // Longer content with detail is more specific
  if (content.length > 100) score += 0.15;
  if (content.length > 300) score += 0.15;
  return Math.min(score, 1.0);
}

function scoreRecoverability(event: IngestionEvent): number {
  // Tool results and file contents are highly recoverable
  if (event.kind === 'tool_result' || event.kind === 'file_read') return 0.9;
  // Assistant messages are in the transcript
  if (event.kind === 'assistant_message') return 0.7;
  // User messages are the source of truth
  if (event.kind === 'user_message') return 0.3;
  return 0.5;
}

function scoreUserMarked(event: IngestionEvent): number {
  if (event.metadata?.important === true) return 1.0;
  if (event.metadata?.priority === 'high') return 0.8;
  // Exclamation marks and emphasis suggest importance
  if (/!{2,}|IMPORTANT|CRITICAL|URGENT/i.test(event.content)) return 0.6;
  return 0;
}

function scoreFutureRelevance(content: string): number {
  let score = 0;
  for (const pattern of FUTURE_PATTERNS) {
    if (pattern.test(content)) score += 0.3;
  }
  return Math.min(score, 1.0);
}

function scoreSocialWeight(content: string): number {
  let score = 0;
  // Preferences about people
  if (PREFERENCE_PATTERNS.some(p => p.test(content))) score += 0.4;
  // Named entities with preference/social context
  const hasEntities = ENTITY_PATTERN.test(content);
  ENTITY_PATTERN.lastIndex = 0; // Reset regex
  if (hasEntities && PREFERENCE_PATTERNS.some(p => p.test(content))) score += 0.3;
  // Relationship/meeting context
  if (/\b(team|lunch|dinner|meeting|birthday|colleague|friend)\b/i.test(content)) score += 0.2;
  return Math.min(score, 1.0);
}

function computeOverallScore(signals: SalienceSignals): number {
  const weights = {
    obligation: 0.20,
    entityLinkage: 0.12,
    recurrence: 0.08,
    novelty: 0.12,
    specificity: 0.10,
    recoverability: -0.08,
    userMarkedImportance: 0.18,
    futureRelevance: 0.12,
    socialWeight: 0.16,
  };

  let score = 0;
  for (const [key, weight] of Object.entries(weights)) {
    score += signals[key as keyof SalienceSignals] * weight;
  }
  return Math.max(0, Math.min(1.0, score));
}

function detectKind(content: string, signals: SalienceSignals): WorkingMemoryItem['kind'] {
  if (signals.obligation > 0.3) return 'obligation';
  if (DECISION_PATTERNS.some(p => p.test(content))) return 'decision';
  if (signals.futureRelevance > 0.5) return 'open_loop';
  if (PREFERENCE_PATTERNS.some(p => p.test(content))) return 'entity';
  const entities = extractEntities(content);
  if (entities.length > 0 && content.length < 100) return 'entity';
  return 'general';
}

function extractEntities(content: string): string[] {
  const matches = content.match(ENTITY_PATTERN) || [];
  // Filter out common English words that happen to start sentences
  const stopWords = new Set([
    'The', 'This', 'That', 'These', 'Those', 'What', 'When', 'Where',
    'Which', 'Who', 'How', 'Why', 'But', 'And', 'For', 'Not', 'You',
    'All', 'Can', 'Her', 'Was', 'One', 'Our', 'Out', 'Are', 'Has',
    'His', 'Had', 'Its', 'Let', 'May', 'New', 'Now', 'Old', 'See',
    'Way', 'Did', 'Get', 'Got', 'Yet', 'Say', 'She', 'Too', 'Use',
  ]);
  return [...new Set(matches.filter(m => !stopWords.has(m)))];
}

function computeWordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) overlap++;
  }
  return overlap / Math.max(wordsA.size, wordsB.size);
}
