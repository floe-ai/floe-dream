import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkingMemoryLedger } from '../src/working-memory.js';
import { createSqliteStore } from '../src/store-sqlite.js';
import type { Store, WorkingMemoryItem } from '../src/types.js';

function makeItem(overrides: Partial<WorkingMemoryItem> = {}): WorkingMemoryItem {
  return {
    id: 'item-1',
    kind: 'general',
    content: 'test content',
    salience: 0.5,
    strength: 0.8,
    createdAt: 1000,
    lastReinforcedAt: 1000,
    sourceEventId: 'evt-1',
    ...overrides,
  };
}

describe('WorkingMemoryLedger', () => {
  let store: Store;
  let ledger: WorkingMemoryLedger;

  beforeEach(() => {
    store = createSqliteStore(':memory:');
    ledger = new WorkingMemoryLedger(store);
  });

  afterEach(() => {
    store.close();
  });

  it('stores and retrieves items by id', () => {
    const item = makeItem({ id: 'wm-1', kind: 'obligation', content: 'Send report' });
    ledger.add(item);

    const retrieved = ledger.get('wm-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.content).toBe('Send report');
    expect(retrieved!.kind).toBe('obligation');
  });

  it('returns all items sorted by salience', () => {
    ledger.add(makeItem({ id: 'low', salience: 0.2, strength: 0.5 }));
    ledger.add(makeItem({ id: 'high', salience: 0.9, strength: 0.9 }));
    ledger.add(makeItem({ id: 'mid', salience: 0.5, strength: 0.7 }));

    const all = ledger.getAll();
    expect(all[0].id).toBe('high');
    expect(all[1].id).toBe('mid');
    expect(all[2].id).toBe('low');
  });

  it('reinforces an item by boosting its strength', () => {
    ledger.add(makeItem({ id: 'wm-1', strength: 0.4 }));
    ledger.reinforce('wm-1', 2000);

    const item = ledger.get('wm-1')!;
    expect(item.strength).toBeGreaterThan(0.4);
    expect(item.lastReinforcedAt).toBe(2000);
  });

  it('caps reinforced strength at 1.0', () => {
    ledger.add(makeItem({ id: 'wm-1', strength: 0.9 }));
    ledger.reinforce('wm-1', 2000);

    const item = ledger.get('wm-1')!;
    expect(item.strength).toBeLessThanOrEqual(1.0);
  });

  it('decays item strength over events', () => {
    ledger.add(makeItem({ id: 'wm-1', strength: 0.8 }));

    ledger.applyDecay();
    const item = ledger.get('wm-1')!;
    expect(item.strength).toBeLessThan(0.8);
  });

  it('drops items below the drop threshold', () => {
    ledger.add(makeItem({ id: 'wm-1', strength: 0.05 })); // Below default 0.1 drop threshold after decay

    const { dropped } = ledger.applyDecay();
    expect(dropped.length).toBe(1);
    expect(dropped[0].id).toBe('wm-1');
    expect(ledger.get('wm-1')).toBeUndefined();
  });

  it('identifies items for pointerisation below pointer threshold', () => {
    // strength 0.28 * e^(-0.05) ≈ 0.266 which is below default 0.3 pointer threshold
    ledger.add(makeItem({ id: 'wm-1', strength: 0.28 }));

    const { pointerised } = ledger.applyDecay();
    expect(pointerised.length).toBe(1);
    expect(pointerised[0].id).toBe('wm-1');
  });

  it('produces a snapshot grouped by kind', () => {
    ledger.add(makeItem({ id: 'g1', kind: 'goal', strength: 0.9 }));
    ledger.add(makeItem({ id: 'o1', kind: 'obligation', strength: 0.9 }));
    ledger.add(makeItem({ id: 'e1', kind: 'entity', strength: 0.9 }));
    ledger.add(makeItem({ id: 'gen1', kind: 'general', strength: 0.9 }));

    const snapshot = ledger.getSnapshot();
    expect(snapshot.goals.length).toBe(1);
    expect(snapshot.obligations.length).toBe(1);
    expect(snapshot.entities.length).toBe(1);
    expect(snapshot.general.length).toBe(1);
  });

  it('removes items by id', () => {
    ledger.add(makeItem({ id: 'wm-1' }));
    ledger.remove('wm-1');
    expect(ledger.get('wm-1')).toBeUndefined();
  });
});
