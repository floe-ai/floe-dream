import type {
  CallFrame,
  CallFrameMessage,
  CallFrameMessageBuilderOptions,
  HybridCallFrameMessageBuilderOptions,
  CaptureIntent,
  Pointer,
  RetrievedArtefact,
  WorkingMemoryItem,
} from './types.js';

const DEFAULT_OPTIONS: Required<CallFrameMessageBuilderOptions> = {
  includeSystemSummary: true,
  systemIntro: 'Curated memory frame. Prioritize the latest user intent and use this as supporting context.',
};

const DEFAULT_HYBRID_OPTIONS: Required<HybridCallFrameMessageBuilderOptions> = {
  includeSystemSummary: true,
  systemIntro: DEFAULT_OPTIONS.systemIntro,
  preserveSystemMessages: true,
  recentRawTurnLimit: 8,
  includeFrameRecentTurnsFallback: true,
};

export function buildCallFrameMessages(
  frame: CallFrame,
  options?: CallFrameMessageBuilderOptions
): CallFrameMessage[] {
  const cfg = { ...DEFAULT_OPTIONS, ...options };
  const messages: CallFrameMessage[] = [];

  if (cfg.includeSystemSummary) {
    messages.push({
      role: 'system',
      content: buildSystemSummary(frame, cfg.systemIntro),
    });
  }

  for (const turn of frame.recentTurns) {
    if (turn.kind === 'user_message') {
      messages.push({ role: 'user', content: turn.content });
    } else if (turn.kind === 'assistant_message') {
      messages.push({ role: 'assistant', content: turn.content });
    }
  }

  return messages;
}

export function buildHybridCallFrameMessages(
  frame: CallFrame,
  rawMessages: CallFrameMessage[],
  options?: HybridCallFrameMessageBuilderOptions
): CallFrameMessage[] {
  const cfg = { ...DEFAULT_HYBRID_OPTIONS, ...options };
  const output: CallFrameMessage[] = [];

  if (cfg.preserveSystemMessages) {
    output.push(...rawMessages.filter(message => message.role === 'system'));
  }

  if (cfg.includeSystemSummary) {
    output.push({
      role: 'system',
      content: buildSystemSummary(frame, cfg.systemIntro),
    });
  }

  const rawTurns = rawMessages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .slice(-cfg.recentRawTurnLimit);

  if (rawTurns.length > 0) {
    output.push(...rawTurns);
    return output;
  }

  if (cfg.includeFrameRecentTurnsFallback) {
    for (const turn of frame.recentTurns) {
      if (turn.kind === 'user_message') {
        output.push({ role: 'user', content: turn.content });
      } else if (turn.kind === 'assistant_message') {
        output.push({ role: 'assistant', content: turn.content });
      }
    }
  }

  return output;
}

function buildSystemSummary(frame: CallFrame, intro: string): string {
  const lines: string[] = [intro];

  pushBucket(lines, 'Goals', frame.workingMemory.goals);
  pushBucket(lines, 'Obligations', frame.workingMemory.obligations);
  pushBucket(lines, 'Open loops', frame.workingMemory.openLoops);
  pushBucket(lines, 'Decisions', frame.workingMemory.decisions);
  pushBucket(lines, 'Entities', frame.workingMemory.entities);
  pushBucket(lines, 'General salient context', frame.workingMemory.general);
  pushPointers(lines, frame.pointers);
  pushRetrieved(lines, frame.retrievedArtefacts);
  pushCaptures(lines, frame.captureHints);

  if (lines.length === 1) {
    lines.push('No salient working memory yet.');
  }

  return lines.join('\n\n');
}

function pushBucket(lines: string[], label: string, items: WorkingMemoryItem[]): void {
  if (items.length === 0) return;
  lines.push(`${label}:\n${items.map(item => `- ${item.content}`).join('\n')}`);
}

function pushPointers(lines: string[], pointers: Pointer[]): void {
  if (pointers.length === 0) return;
  lines.push(`Pointers:\n${pointers.map(pointer => `- ${pointer.hintText}`).join('\n')}`);
}

function pushRetrieved(lines: string[], artefacts: RetrievedArtefact[]): void {
  if (artefacts.length === 0) return;
  lines.push(`Retrieved artefacts:\n${artefacts.map(artefact => `- ${artefact.content}`).join('\n')}`);
}

function pushCaptures(lines: string[], captures: CaptureIntent[]): void {
  if (captures.length === 0) return;
  lines.push(`Capture hints:\n${captures.map(capture => `- (${capture.kind}) ${capture.content}`).join('\n')}`);
}
