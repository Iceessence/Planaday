import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface ServerLifeRecord {
  id: string;
  workspaceId: string;
  type: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  rev: number;
  deviceId: string;
  [key: string]: unknown;
}

export interface IncomingOp {
  opId: string;
  recordId: string;
  operation: 'upsert' | 'delete';
  record?: ServerLifeRecord;
  baseRev: number;
}

export interface PushResult {
  acceptedOpIds: string[];
  conflicts: Array<{ recordId: string; serverRecord: ServerLifeRecord }>;
  seq: number;
}

export class SyncDatabase {
  private db: DatabaseSync;
  public readonly dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = path.join(dataDir, 'dayplana.sqlite');
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        type TEXT NOT NULL,
        rev INTEGER NOT NULL,
        seq INTEGER NOT NULL,
        device_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        json_data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_records_seq ON records(seq);
      CREATE TABLE IF NOT EXISTS applied_ops (
        op_id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT OR IGNORE INTO sync_meta (key, value) VALUES ('seq', '0');
    `);
  }

  public getCurrentSeq(): number {
    const row = this.db.prepare('SELECT value FROM sync_meta WHERE key = ?').get('seq') as { value: string } | undefined;
    return row ? Number(row.value) : 0;
  }

  private nextSeq(): number {
    const next = this.getCurrentSeq() + 1;
    this.db.prepare('UPDATE sync_meta SET value = ? WHERE key = ?').run(String(next), 'seq');
    return next;
  }

  public applyOperations(deviceId: string, operations: IncomingOp[]): PushResult {
    const acceptedOpIds: string[] = [];
    const conflicts: Array<{ recordId: string; serverRecord: ServerLifeRecord }> = [];

    const checkOp = this.db.prepare('SELECT 1 FROM applied_ops WHERE op_id = ?');
    const markOp = this.db.prepare('INSERT OR IGNORE INTO applied_ops (op_id, applied_at) VALUES (?, ?)');
    const getRec = this.db.prepare('SELECT rev, device_id, json_data FROM records WHERE id = ?');
    const upsertRec = this.db.prepare(`
      INSERT INTO records (id, workspace_id, type, rev, seq, device_id, updated_at, deleted_at, json_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_id = excluded.workspace_id,
        type = excluded.type,
        rev = excluded.rev,
        seq = excluded.seq,
        device_id = excluded.device_id,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at,
        json_data = excluded.json_data
    `);

    const now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const op of operations) {
        // Idempotent opId check
        if (checkOp.get(op.opId)) {
          acceptedOpIds.push(op.opId);
          continue;
        }
        if (!op.record) {
          markOp.run(op.opId, now);
          acceptedOpIds.push(op.opId);
          continue;
        }

        const existing = getRec.get(op.record.id) as
          | { rev: number; device_id: string; json_data: string }
          | undefined;

        if (existing && existing.rev > op.baseRev && existing.device_id !== deviceId) {
          const serverRecord = JSON.parse(existing.json_data) as ServerLifeRecord;
          conflicts.push({ recordId: op.record.id, serverRecord });
          markOp.run(op.opId, now);
          acceptedOpIds.push(op.opId);
          continue;
        }

        const seq = this.nextSeq();
        const nextRev = existing ? Math.max(existing.rev + 1, op.record.rev) : op.record.rev;
        const stored: ServerLifeRecord = {
          ...op.record,
          rev: nextRev,
          deviceId: op.record.deviceId || deviceId,
        };

        upsertRec.run(
          stored.id,
          stored.workspaceId || 'ws_personal',
          stored.type || 'note',
          stored.rev,
          seq,
          stored.deviceId,
          stored.updatedAt || now,
          stored.deletedAt ?? null,
          JSON.stringify(stored)
        );
        markOp.run(op.opId, now);
        acceptedOpIds.push(op.opId);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return { acceptedOpIds, conflicts, seq: this.getCurrentSeq() };
  }

  public pullSince(sinceSeq: number): { seq: number; records: ServerLifeRecord[] } {
    const rows = this.db
      .prepare('SELECT json_data FROM records WHERE seq > ? ORDER BY seq ASC')
      .all(sinceSeq) as Array<{ json_data: string }>;
    return {
      seq: this.getCurrentSeq(),
      records: rows.map((r) => JSON.parse(r.json_data) as ServerLifeRecord),
    };
  }

  public getStats(): { recordCount: number; seq: number } {
    const countRow = this.db.prepare('SELECT COUNT(*) as c FROM records').get() as { c: number };
    return { recordCount: countRow.c, seq: this.getCurrentSeq() };
  }

  public getActiveRecordsByType(type: string): ServerLifeRecord[] {
    const rows = this.db
      .prepare('SELECT json_data FROM records WHERE type = ? AND deleted_at IS NULL')
      .all(type) as Array<{ json_data: string }>;
    return rows.map((r) => JSON.parse(r.json_data) as ServerLifeRecord);
  }

  public getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM sync_meta WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? row.value : null;
  }

  public setMeta(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }

  public close(): void {
    this.db.close();
  }
}
