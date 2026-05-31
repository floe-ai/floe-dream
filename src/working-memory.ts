import type { Store, WorkingMemoryItem, WorkingMemorySnapshot, Pointer } from './types.js';

export interface WorkingMemoryLedgerConfig {
  pointeriseThreshold: number;
  dropThreshold: number;
  decayLambda: number;
  reinforcementBoost: number;
}

const DEFAULT_CONFIG: WorkingMemoryLedgerConfig = {
  pointeriseThreshold: 0.3,
  dropThreshold: 0.1,
  decayLambda: 0.05,
  reinforcementBoost: 0.8,
};

export class WorkingMemoryLedger {
  private store: Store;
  private config: WorkingMemoryLedgerConfig;
  private eventCounter: number = 0;

  constructor(store: Store, config?: Partial<WorkingMemoryLedgerConfig>) {
    this.store = store;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  add(item: WorkingMemoryItem): void {
    this.store.saveWorkingMemoryItem(item);
  }

  get(id: string): WorkingMemoryItem | undefined {
    return this.store.getWorkingMemoryItem(id);
  }

  getAll(): WorkingMemoryItem[] {
    return this.store.getWorkingMemoryItems();
  }

  reinforce(id: string, timestamp: number): void {
    const item = this.store.getWorkingMemoryItem(id);
    if (!item) return;
    item.strength = Math.min(1.0, item.strength + this.config.reinforcementBoost);
    item.lastReinforcedAt = timestamp;
    this.store.updateWorkingMemoryItem(item);
  }

  remove(id: string): void {
    this.store.removeWorkingMemoryItem(id);
  }

  /**
   * Apply decay to all items. Returns items that were pointerised or dropped.
   */
  applyDecay(): { pointerised: WorkingMemoryItem[]; dropped: WorkingMemoryItem[] } {
    this.eventCounter++;
    const items = this.store.getWorkingMemoryItems();
    const pointerised: WorkingMemoryItem[] = [];
    const dropped: WorkingMemoryItem[] = [];

    for (const item of items) {
      // Exponential decay based on events since last reinforcement
      const decayedStrength = item.strength * Math.exp(-this.config.decayLambda * 1);
      item.strength = decayedStrength;

      if (item.strength < this.config.dropThreshold) {
        this.store.removeWorkingMemoryItem(item.id);
        dropped.push(item);
      } else if (item.strength < this.config.pointeriseThreshold) {
        // Mark for pointerisation but don't remove yet — caller handles
        pointerised.push(item);
      } else {
        this.store.updateWorkingMemoryItem(item);
      }
    }

    return { pointerised, dropped };
  }

  getSnapshot(): WorkingMemorySnapshot {
    const items = this.store.getWorkingMemoryItems();
    return {
      goals: items.filter(i => i.kind === 'goal'),
      obligations: items.filter(i => i.kind === 'obligation'),
      openLoops: items.filter(i => i.kind === 'open_loop'),
      decisions: items.filter(i => i.kind === 'decision'),
      entities: items.filter(i => i.kind === 'entity'),
      general: items.filter(i => i.kind === 'general'),
    };
  }
}
