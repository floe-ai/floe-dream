import Database from 'better-sqlite3';
import type { Store, IngestionEvent, WorkingMemoryItem, Pointer } from './types.js';

export function createSqliteStore(dbPath: string = ':memory:'): Store {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      source TEXT
    );

    CREATE TABLE IF NOT EXISTS working_memory (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      salience REAL NOT NULL,
      strength REAL NOT NULL,
      created_at INTEGER NOT NULL,
      last_reinforced_at INTEGER NOT NULL,
      source_event_id TEXT NOT NULL,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS pointers (
      id TEXT PRIMARY KEY,
      hint_text TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      confidence REAL NOT NULL,
      retrieval_cost TEXT NOT NULL,
      source_item_id TEXT
    );
  `);

  const insertEvent = db.prepare(
    `INSERT OR REPLACE INTO events (id, timestamp, kind, content, metadata, source)
     VALUES (@id, @timestamp, @kind, @content, @metadata, @source)`
  );

  const insertItem = db.prepare(
    `INSERT OR REPLACE INTO working_memory (id, kind, content, salience, strength, created_at, last_reinforced_at, source_event_id, metadata)
     VALUES (@id, @kind, @content, @salience, @strength, @createdAt, @lastReinforcedAt, @sourceEventId, @metadata)`
  );

  const insertPointer = db.prepare(
    `INSERT OR REPLACE INTO pointers (id, hint_text, source_ref, confidence, retrieval_cost, source_item_id)
     VALUES (@id, @hintText, @sourceRef, @confidence, @retrievalCost, @sourceItemId)`
  );

  return {
    saveEvent(event: IngestionEvent): void {
      insertEvent.run({
        id: event.id,
        timestamp: event.timestamp,
        kind: event.kind,
        content: event.content,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        source: event.source ?? null,
      });
    },

    getEvents(limit?: number): IngestionEvent[] {
      const sql = limit
        ? `SELECT * FROM events ORDER BY timestamp DESC LIMIT ?`
        : `SELECT * FROM events ORDER BY timestamp ASC`;
      const rows = limit ? db.prepare(sql).all(limit) : db.prepare(sql).all();
      return (rows as any[]).map(rowToEvent);
    },

    getEvent(id: string): IngestionEvent | undefined {
      const row = db.prepare(`SELECT * FROM events WHERE id = ?`).get(id) as any;
      return row ? rowToEvent(row) : undefined;
    },

    saveWorkingMemoryItem(item: WorkingMemoryItem): void {
      insertItem.run({
        id: item.id,
        kind: item.kind,
        content: item.content,
        salience: item.salience,
        strength: item.strength,
        createdAt: item.createdAt,
        lastReinforcedAt: item.lastReinforcedAt,
        sourceEventId: item.sourceEventId,
        metadata: item.metadata ? JSON.stringify(item.metadata) : null,
      });
    },

    getWorkingMemoryItems(): WorkingMemoryItem[] {
      const rows = db.prepare(`SELECT * FROM working_memory ORDER BY salience DESC`).all();
      return (rows as any[]).map(rowToItem);
    },

    getWorkingMemoryItem(id: string): WorkingMemoryItem | undefined {
      const row = db.prepare(`SELECT * FROM working_memory WHERE id = ?`).get(id) as any;
      return row ? rowToItem(row) : undefined;
    },

    updateWorkingMemoryItem(item: WorkingMemoryItem): void {
      insertItem.run({
        id: item.id,
        kind: item.kind,
        content: item.content,
        salience: item.salience,
        strength: item.strength,
        createdAt: item.createdAt,
        lastReinforcedAt: item.lastReinforcedAt,
        sourceEventId: item.sourceEventId,
        metadata: item.metadata ? JSON.stringify(item.metadata) : null,
      });
    },

    removeWorkingMemoryItem(id: string): void {
      db.prepare(`DELETE FROM working_memory WHERE id = ?`).run(id);
    },

    savePointer(pointer: Pointer): void {
      insertPointer.run({
        id: pointer.id,
        hintText: pointer.hintText,
        sourceRef: pointer.sourceRef,
        confidence: pointer.confidence,
        retrievalCost: pointer.retrievalCost,
        sourceItemId: pointer.sourceItemId ?? null,
      });
    },

    getPointers(): Pointer[] {
      const rows = db.prepare(`SELECT * FROM pointers ORDER BY confidence DESC`).all();
      return (rows as any[]).map(rowToPointer);
    },

    removePointer(id: string): void {
      db.prepare(`DELETE FROM pointers WHERE id = ?`).run(id);
    },

    close(): void {
      db.close();
    },
  };
}

function rowToEvent(row: any): IngestionEvent {
  return {
    id: row.id,
    timestamp: row.timestamp,
    kind: row.kind,
    content: row.content,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    source: row.source ?? undefined,
  };
}

function rowToItem(row: any): WorkingMemoryItem {
  return {
    id: row.id,
    kind: row.kind,
    content: row.content,
    salience: row.salience,
    strength: row.strength,
    createdAt: row.created_at,
    lastReinforcedAt: row.last_reinforced_at,
    sourceEventId: row.source_event_id,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  };
}

function rowToPointer(row: any): Pointer {
  return {
    id: row.id,
    hintText: row.hint_text,
    sourceRef: row.source_ref,
    confidence: row.confidence,
    retrievalCost: row.retrieval_cost,
    sourceItemId: row.source_item_id ?? undefined,
  };
}
