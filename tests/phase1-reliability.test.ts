import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createId, db, updateSettings } from '../src/core/db';
import {
  compactOutbox,
  createNamedNoteCheckpoint,
  createRecord,
  getNoteRevisions,
  updateRecord,
} from '../src/core/repository';
import { getSyncState, runSyncCycle } from '../src/core/sync';
import { computeLineDiff, SafeTextarea } from '../src/components/Common/SafeTextEditor';
import { PLANADAY_CHANGELOG } from '../src/data/changelog';
import { buildDayplanaServer } from '../server/index';
import type { NotePayload, OutboxOp } from '../src/core/types';

// Tell React 19 testing environment that act() is supported
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setNativeTextareaValue(el: HTMLTextAreaElement, value: string) {
  const proto = Object.getPrototypeOf(el) as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
}

describe('Phase 1 & Phase 2 — Sync Stress Coalescing, SQLite Backups, Mobile IME & Cursor Safety', () => {
  beforeEach(async () => {
    await db.records.clear();
    await db.outbox.clear();
    await db.revisions.clear();
    await db.undoStack.clear();
    await db.settings.clear();
  });

  it('coalesces 200 rapid note edits into 1 single outbox operation without bloating note revisions', async () => {
    const note = await createRecord<NotePayload>('note', 'Stress Note', {
      notebookId: 'nb_personal',
      writtenForDate: '2026-11-24',
      content: 'Initial paragraph',
      citations: [],
      touchedDates: ['2026-11-24'],
    });

    const t0 = performance.now();
    for (let i = 1; i <= 200; i++) {
      await updateRecord<NotePayload>(
        note.id,
        (cur) => ({
          ...cur,
          payload: { ...cur.payload, content: `Paragraph edit #${i} — ${'x'.repeat(200)}` },
        }),
        { skipUndo: true, skipRevision: true }
      );
    }
    const elapsedMs = performance.now() - t0;

    const queued = await db.outbox.toArray();
    expect(queued.length).toBe(1);
    expect(queued[0].recordId).toBe(note.id);
    expect(queued[0].baseRev).toBe(0);
    expect((queued[0].record?.payload as NotePayload).content).toContain('Paragraph edit #200');

    // Throttled revisions: skipRevision=true prevented 200 redundant snapshots (only initial creation snapshot exists)
    const revs = await getNoteRevisions(note.id);
    expect(revs.length).toBeLessThanOrEqual(1);

    // Explicit named checkpoint creates a preserved labeled snapshot
    const cpOk = await createNamedNoteCheckpoint(note.id, 'Before major rewrite');
    expect(cpOk).toBe(true);
    const revsAfter = await getNoteRevisions(note.id);
    expect(revsAfter.some((r) => r.label === 'Before major rewrite')).toBe(true);

    console.info(`[Benchmark] 200 rapid note edits -> 1 outbox op in ${elapsedMs.toFixed(1)}ms`);
  });

  it('compacts a legacy 2,000-op backlog down to 1 op and syncs cleanly to live SQLite server', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planaday-sync-stress-'));
    const { app } = await buildDayplanaServer({ dataDir: tmpDir });
    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    try {
      const note = await createRecord<NotePayload>('note', 'Giant Backlog Note', {
        notebookId: 'nb_personal',
        writtenForDate: '2026-11-24',
        content: 'v0',
        citations: [],
        touchedDates: ['2026-11-24'],
      });
      await db.outbox.clear();

      // Simulate a pre-fix legacy phone backlog with 2,000 queued copies of a ~5KB note (~10MB total!)
      const padding = 'A'.repeat(5000);
      const legacyOps: OutboxOp[] = [];
      for (let i = 1; i <= 2000; i++) {
        legacyOps.push({
          opId: `legacy_op_${i}`,
          recordId: note.id,
          operation: 'upsert',
          baseRev: i - 1,
          createdAt: new Date(Date.UTC(2026, 10, 24, 12, 0, 0) + i * 10).toISOString(),
          attempts: 0,
          record: {
            ...note,
            rev: i,
            updatedAt: new Date(Date.UTC(2026, 10, 24, 12, 0, 0) + i * 10).toISOString(),
            payload: { ...note.payload, content: `Final revision #${i} ${padding}` },
          },
        });
      }
      await db.outbox.bulkPut(legacyOps);
      expect(await db.outbox.count()).toBe(2000);

      // Compact the 2,000-op queue and measure time
      const tCompact0 = performance.now();
      const compactRes = await compactOutbox();
      const compactMs = performance.now() - tCompact0;

      expect(compactRes.before).toBe(2000);
      expect(compactRes.after).toBe(1);
      expect(compactRes.removed).toBe(1999);
      const remaining = await db.outbox.toArray();
      expect(remaining.length).toBe(1);
      expect(remaining[0].baseRev).toBe(0); // Earliest baseRev preserved!
      expect((remaining[0].record?.payload as NotePayload).content.startsWith('Final revision #2000')).toBe(true);

      // Now run real HTTP sync against Fastify + SQLite
      await updateSettings({
        operatingMode: 'docker-sync',
        syncServerUrl: address,
        syncFallbackUrl: '',
      });

      const tSync0 = performance.now();
      const state = await runSyncCycle();
      const syncMs = performance.now() - tSync0;

      expect(state.status).toBe('synced');
      expect(state.pendingCount).toBe(0);
      expect(await db.outbox.count()).toBe(0);

      // Verify server SQLite storage info & live VACUUM INTO backup!
      const infoRes = await fetch(`${address}/api/storage/info`);
      expect(infoRes.ok).toBe(true);
      const infoJson = (await infoRes.json()) as {
        app: string;
        sqlitePath: string;
        sqliteSizeBytes: number;
        recordCount: number;
        backups: Array<{ name: string; sizeBytes: number }>;
      };
      expect(infoJson.app).toBe('planaday');
      expect(infoJson.sqlitePath.endsWith('dayplana.sqlite')).toBe(true);
      expect(infoJson.sqliteSizeBytes).toBeGreaterThan(0);
      expect(infoJson.recordCount).toBe(1);

      const backupRes = await fetch(`${address}/api/storage/backup`, { method: 'POST' });
      expect(backupRes.ok).toBe(true);
      const backupJson = (await backupRes.json()) as {
        ok: boolean;
        name: string;
        filePath: string;
        sizeBytes: number;
      };
      expect(backupJson.ok).toBe(true);
      expect(fs.existsSync(backupJson.filePath)).toBe(true);
      expect(backupJson.sizeBytes).toBeGreaterThan(0);

      // Open the VACUUM INTO snapshot with SQLite to prove the backup is valid and holds the synced note!
      const snapDb = new DatabaseSync(backupJson.filePath);
      const snapRow = snapDb.prepare('SELECT json_data FROM records WHERE id = ?').get(note.id) as
        | { json_data: string }
        | undefined;
      snapDb.close();
      expect(snapRow).toBeDefined();
      expect(snapRow!.json_data).toContain('Final revision #2000');

      console.info(
        `[Benchmark] 2,000-op legacy backlog -> compacted to 1 op in ${compactMs.toFixed(1)}ms, synced to SQLite in ${syncMs.toFixed(1)}ms, backup verified (${backupJson.sizeBytes} bytes)`
      );
    } finally {
      await app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('syncs 65 distinct records across chunked 50-op batches and deduplicates duplicate batches server-side', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planaday-chunk-test-'));
    const { app } = await buildDayplanaServer({ dataDir: tmpDir });
    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    try {
      for (let i = 0; i < 65; i++) {
        await createRecord('task', `Chunk Task ${i}`, { subtasks: [] }, {}, { skipUndo: true });
      }
      expect(await db.outbox.count()).toBe(65);

      await updateSettings({
        operatingMode: 'docker-sync',
        syncServerUrl: address,
        syncFallbackUrl: '',
      });

      const state = await runSyncCycle();
      expect(state.status).toBe('synced');
      expect(state.pendingCount).toBe(0);
      expect(getSyncState().lastSyncedOpsCount).toBe(65);

      // Also test server-side deduplication if an old un-updated phone pushes 40 duplicate ops in one batch
      const dupId = createId('rec');
      const dupBatch = Array.from({ length: 40 }, (_, idx) => ({
        opId: `old_client_op_${idx}`,
        recordId: dupId,
        operation: 'upsert' as const,
        baseRev: idx,
        record: {
          id: dupId,
          workspaceId: 'ws_personal',
          type: 'note',
          title: `Version ${idx + 1}`,
          status: 'active',
          createdAt: '2026-11-24T12:00:00.000Z',
          updatedAt: '2026-11-24T12:00:00.000Z',
          deletedAt: null,
          rev: idx + 1,
          deviceId: 'legacy_phone',
          payload: { content: `Legacy body ${idx + 1}` },
        },
      }));
      const rawPush = await fetch(`${address}/api/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: 'legacy_phone', operations: dupBatch }),
      });
      expect(rawPush.ok).toBe(true);
      const rawJson = (await rawPush.json()) as { acceptedOpIds: string[]; conflicts: unknown[] };
      expect(rawJson.acceptedOpIds.length).toBe(40);
      expect(rawJson.conflicts.length).toBe(0);
    } finally {
      await app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('preserves mid-text editing under stale async prop updates and prevents IME autocorrect duplication', async () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const committed: string[] = [];

    try {
      const renderEditor = (ext: string) =>
        act(() => {
          root.render(
            React.createElement(SafeTextarea, {
              recordKey: 'note_cursor_test:content',
              externalValue: ext,
              debounceMs: 500,
              autoGrow: false,
              onCommit: (val: string) => {
                committed.push(val);
              },
            })
          );
        });

      renderEditor('Hello world today');
      const ta = container.querySelector('textarea') as HTMLTextAreaElement;
      expect(ta).toBeTruthy();
      expect(ta.value).toBe('Hello world today');

      // 1. Place cursor in the middle of the sentence and insert text
      act(() => {
        ta.focus();
        ta.setSelectionRange(6, 6);
        setNativeTextareaValue(ta, 'Hello beautiful world today');
        ta.setSelectionRange(16, 16);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(ta.value).toBe('Hello beautiful world today');
      expect(ta.selectionStart).toBe(16);

      // 2. Simulate stale async Dexie live-query re-render arriving BEFORE debounce commits
      renderEditor('Hello world today');
      expect(ta.value).toBe('Hello beautiful world today');
      expect(ta.selectionStart).toBe(16);

      // 3. Simulate Android Gboard / Samsung Keyboard autocorrect replacement ("teh" -> "the") via IME composition
      act(() => {
        ta.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        setNativeTextareaValue(ta, 'Hello beautiful teh world today');
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      });

      // Stale external prop during active IME composition MUST be ignored and MUST NOT trigger commit
      renderEditor('Hello world today');
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(committed.length).toBe(0);

      // Keyboard completes replacement ("teh" -> "the") and fires compositionend
      act(() => {
        setNativeTextareaValue(ta, 'Hello beautiful the world today');
        ta.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      });
      expect(ta.value).toBe('Hello beautiful the world today');
      expect(ta.value).not.toContain('tehthe');

      // After debounce window settles, commit fires cleanly once with exact corrected text
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      expect(committed).toEqual(['Hello beautiful the world today']);
    } finally {
      act(() => root.unmount());
      container.remove();
      vi.useRealTimers();
    }
  });

  it('computes accurate line diffs for version history and ships the permanent v2.1.0 Changelog', () => {
    const diff = computeLineDiff('Alpha\nOld line\nGamma', 'Alpha\nNew line\nAdded line\nGamma');
    expect(diff.removedCount).toBe(1);
    expect(diff.addedCount).toBe(2);
    expect(diff.lines.map((l) => `${l.type}:${l.text}`)).toEqual([
      'same:Alpha',
      'removed:Old line',
      'added:New line',
      'added:Added line',
      'same:Gamma',
    ]);

    expect(PLANADAY_CHANGELOG.length).toBeGreaterThanOrEqual(2);
    expect(PLANADAY_CHANGELOG.some((r) => r.version === '2.1.0')).toBe(true);
    expect(PLANADAY_CHANGELOG[0].bugFixes.length).toBeGreaterThan(0);
    expect(PLANADAY_CHANGELOG[0].knownLimitations.length).toBeGreaterThan(0);
  });
});
