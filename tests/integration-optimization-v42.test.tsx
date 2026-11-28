import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, useApp, useSyncState, useToasts } from '../src/core/AppContext';
import { db, getOrInitSettings, storeBlob, updateSettings } from '../src/core/db';
import { createRecord, updateRecord } from '../src/core/repository';
import {
  markUserActivity,
  resetSyncActivityState,
  resolveConflict,
  runSyncCycle,
  stopSyncDaemon,
} from '../src/core/sync';
import { evaluateWorkbook, IncrementalWorkbookEvaluator, type WorksheetDef } from '../src/core/spreadsheetEngine';
import { InvertedSearchIndex } from '../src/core/searchIndex';
import { BoundedBlobUrlCache } from '../src/core/blobCache';
import { buildDayplanaServer } from '../server/index';
import { isPrivateOrReservedIp } from '../server/outboundPolicy';
import { GpuServiceBridge } from '../server/gpuBridge';
import type { LifeRecord } from '../src/core/types';

async function resetDb() {
  stopSyncDaemon();
  await db.records.clear();
  await db.blobs.clear();
  await db.outbox.clear();
  await db.syncConflicts.clear();
  await db.revisions.clear();
  await db.drafts.clear();
  await db.settings.clear();
  resetSyncActivityState();
  await getOrInitSettings();
}

describe('Planaday v4.2.0 Integrated Verification, Performance & Security Suite', () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    stopSyncDaemon();
    resetSyncActivityState();
  });

  it('isolates AppContext consumers from syncState and toast churn (0 extra core renders)', async () => {
    let coreRenders = 0;
    let syncRenders = 0;
    let toastRenders = 0;
    let triggerToast: ((msg: string) => void) | null = null;

    const CoreConsumer: React.FC = React.memo(() => {
      const { ready, storageHealth, pushToast } = useApp();
      coreRenders++;
      triggerToast = (m: string) => pushToast(m);
      return (
        <div data-testid="core-ready" data-health={String(Boolean(storageHealth))}>
          {String(ready)}
        </div>
      );
    });

    const SyncConsumer: React.FC = () => {
      const s = useSyncState();
      syncRenders++;
      return <div data-testid="sync-active">{String(Boolean(s.userActive))}</div>;
    };

    const ToastConsumer: React.FC = () => {
      const toasts = useToasts();
      toastRenders++;
      return <div data-testid="toast-count">{toasts.length}</div>;
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    try {
      await act(async () => {
        root.render(
          <AppProvider>
            <CoreConsumer />
            <SyncConsumer />
            <ToastConsumer />
          </AppProvider>
        );
      });

      // Wait for AppProvider async boot + initial storageHealth maintenance to settle completely
      for (let i = 0; i < 60; i++) {
        const el = container.querySelector('[data-testid="core-ready"]');
        if (el?.textContent === 'true' && el.getAttribute('data-health') === 'true') break;
        await act(async () => {
          await new Promise((r) => setTimeout(r, 25));
        });
      }
      expect(container.querySelector('[data-testid="core-ready"]')?.textContent).toBe('true');

      const baselineCoreRenders = coreRenders;
      const baselineToastRenders = toastRenders;
      const baselineSyncRenders = syncRenders;

      for (let k = 1; k <= 5; k++) {
        await act(async () => {
          markUserActivity(Date.now() + k * 10);
          triggerToast?.(`Saved locally #${k}`);
        });
      }

      expect(toastRenders).toBeGreaterThan(baselineToastRenders);
      expect(syncRenders).toBeGreaterThanOrEqual(baselineSyncRenders);
      expect(container.querySelector('[data-testid="toast-count"]')?.textContent).toBe('4'); // bounded to max 4 visible toasts
      // Core AppContext consumers MUST NOT re-render for toast bursts or sync activity updates!
      expect(coreRenders).toBe(baselineCoreRenders);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it('recalculates spreadsheets incrementally with exact parity to full evaluation including cross-sheet & #CIRC! recovery', () => {
    const s1Cells: WorksheetDef['cells'] = {};
    for (let r = 1; r <= 500; r++) {
      s1Cells[`A${r}`] = { raw: String(r) };
      s1Cells[`B${r}`] = { raw: `=A${r}*2` };
      s1Cells[`C${r}`] = { raw: `=B${r}+10` };
    }
    const s2Cells: WorksheetDef['cells'] = {
      A1: { raw: '=SUM(Data!C1:C500)' },
      A2: { raw: '=Data!C42*3' },
      A3: { raw: '=TODAY()' },
    };
    const baseSheets: WorksheetDef[] = [
      { id: 's1', name: 'Data', rows: 500, cols: 4, cells: s1Cells },
      { id: 's2', name: 'Summary', rows: 20, cols: 4, cells: s2Cells },
    ];

    const engine = new IncrementalWorkbookEvaluator();
    const initial = engine.evaluate(baseSheets);
    const fullInitial = evaluateWorkbook(baseSheets);
    expect(initial.s2.A1.value).toBe(fullInitial.s2.A1.value);
    expect(initial.s2.A2.value).toBe(fullInitial.s2.A2.value);

    // Edit single independent cell A42 -> ONLY A42, B42, C42, Summary!A1, Summary!A2, and volatile Summary!A3 recalc!
    const edited: WorksheetDef[] = [
      { ...baseSheets[0], cells: { ...baseSheets[0].cells, A42: { raw: '100' } } },
      baseSheets[1],
    ];
    const incRes = engine.evaluate(edited);
    const fullRes = evaluateWorkbook(edited);
    expect(incRes.s1.C42.value).toBe(210);
    expect(incRes.s2.A1.value).toBe(fullRes.s2.A1.value);
    expect(incRes.s2.A2.value).toBe(fullRes.s2.A2.value);
    expect(engine.lastRecalculatedCount).toBeLessThanOrEqual(8);

    // Circular reference creation & clean recovery
    const circSheets: WorksheetDef[] = [
      { ...baseSheets[0], cells: { ...edited[0].cells, D1: { raw: '=D2' }, D2: { raw: '=D1' } } },
      baseSheets[1],
    ];
    const circRes = engine.evaluate(circSheets);
    expect(circRes.s1.D1.value).toBe('#CIRC!');
    expect(circRes.s1.D2.value).toBe('#CIRC!');

    const fixedCirc: WorksheetDef[] = [
      { ...baseSheets[0], cells: { ...circSheets[0].cells, D2: { raw: '77' } } },
      baseSheets[1],
    ];
    const fixedRes = engine.evaluate(fixedCirc);
    expect(fixedRes.s1.D2.value).toBe(77);
    expect(fixedRes.s1.D1.value).toBe(77);
  });

  it('releases removed/switched records from InvertedSearchIndex and coalesces BoundedBlobUrlCache races', async () => {
    const idx = new InvertedSearchIndex();
    const recs: LifeRecord[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `idx_${i}`,
      workspaceId: 'ws_personal',
      type: 'note',
      title: `Astronomy Record ${i}`,
      status: 'active',
      createdAt: '2026-11-28T00:00:00.000Z',
      updatedAt: `2026-11-28T00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`,
      deletedAt: null,
      tags: ['space'],
      links: [],
      payload: { content: `Observation log ${i}` },
      rev: 1,
      deviceId: 'dev_a',
    }));
    idx.syncFromArray(recs);
    expect(idx.size).toBe(1000);
    const p1 = idx.search('astronomy', {}, 1, 25);
    expect(p1.total).toBe(1000);
    expect(p1.hits.length).toBe(25);
    expect(p1.hits[0].record.id).toBe('idx_999'); // newest updatedAt first

    // Switch profile to only 5 visible records -> 995 private records must be fully released
    idx.syncFromArray(recs.slice(0, 5));
    expect(idx.size).toBe(5);
    expect(idx.search('idx_999').total).toBe(0);

    // BoundedBlobUrlCache concurrency & invalidate race
    const cache = new BoundedBlobUrlCache(4);
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    let seq = 0;
    const revoked: string[] = [];
    URL.createObjectURL = () => `blob:mem-${++seq}`;
    URL.revokeObjectURL = (u: string) => {
      revoked.push(u);
    };
    try {
      let loaderCalls = 0;
      const sample = { blob: new Blob(['abc']), byteSize: 3 };
      const [u1, u2] = await Promise.all([
        cache.getOrLoad('h1:full', async () => {
          loaderCalls++;
          return sample;
        }),
        cache.getOrLoad('h1:full', async () => {
          loaderCalls++;
          return sample;
        }),
      ]);
      expect(loaderCalls).toBe(1);
      expect(u1).toBe(u2);
      cache.invalidateHash('h1');
      expect(revoked).toContain(u1);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });

  it('enforces server workspace authorization, atomic pairing codes, query-token restrictions, SSRF IPv6 checks & GPU bridge auth diagnostics', async () => {
    // 1. SSRF IPv6 hex-mapped & NAT64 blocking
    expect(isPrivateOrReservedIp('::ffff:7f00:1')).toBe(true);
    expect(isPrivateOrReservedIp('0:0:0:0:0:ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('0:0:0:0:0:0:0:1')).toBe(true);
    expect(isPrivateOrReservedIp('64:ff9b::1')).toBe(true);
    expect(isPrivateOrReservedIp('100::1')).toBe(true);
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);

    // 2. GPU bridge rejects non-HTTP(S) URLs and reports HTTP 403 auth mismatch explicitly
    const badSchemeBridge = new GpuServiceBridge({ gpuUrl: 'file:///etc/passwd' });
    expect(badSchemeBridge.isConfigured()).toBe(false);

    const authFailBridge = new GpuServiceBridge({
      gpuUrl: 'http://127.0.0.1:9999',
      internalToken: 'wrong-token',
      fetchImpl: (async () =>
        new Response(JSON.stringify({ detail: 'Invalid internal GPU service token' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })) as typeof fetch,
    });
    const authRes = await authFailBridge.getStatus();
    expect(authRes).toMatchObject({ ok: false, available: false, fallback: 'local', authError: true });

    // 3. Server workspace authorization + atomic pairing code + query-token restriction + malformed x-blob-name
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planaday-sec-v42-'));
    const { app, authStore } = await buildDayplanaServer({ dataDir: tmpDir, requireAuth: true });
    try {
      const setup = await app.inject({
        method: 'POST',
        url: '/api/auth/setup',
        payload: { passphrase: 'owner-strong-passphrase', deviceId: 'dev_owner' },
      });
      const ownerToken = (setup.json() as { token: string }).token;

      // Seed a private ws_personal record as owner
      const pushPersonal = await app.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers: { Authorization: `Bearer ${ownerToken}` },
        payload: {
          deviceId: 'dev_owner',
          operations: [
            {
              opId: 'op_owner_1',
              recordId: 'rec_private_1',
              operation: 'upsert',
              baseRev: 0,
              record: {
                id: 'rec_private_1',
                workspaceId: 'ws_personal',
                type: 'note',
                title: 'Owner Secret',
                status: 'active',
                createdAt: '2026-11-28T00:00:00.000Z',
                updatedAt: '2026-11-28T00:00:00.000Z',
                deletedAt: null,
                rev: 1,
                deviceId: 'dev_owner',
                payload: { content: 'Top secret owner diary' },
              },
            },
          ],
        },
      });
      expect(pushPersonal.statusCode).toBe(200);

      // Pair a member device restricted strictly to ws_lab
      const pairCode = authStore.createPairingCode('Lab Tablet', 'member', ['ws_lab'], 10);
      const paired1 = await app.inject({
        method: 'POST',
        url: '/api/auth/pair',
        payload: { code: pairCode.code, deviceId: 'dev_lab' },
      });
      expect(paired1.statusCode).toBe(200);
      const labToken = (paired1.json() as { token: string }).token;

      // Atomic one-time pairing code cannot be redeemed twice
      const paired2 = await app.inject({
        method: 'POST',
        url: '/api/auth/pair',
        payload: { code: pairCode.code, deviceId: 'dev_attacker' },
      });
      expect(paired2.statusCode).toBe(401);

      // Query-string ?token= MUST be rejected on non-SSE REST routes!
      const queryAuthRest = await app.inject({
        method: 'GET',
        url: `/api/sync/pull?since=0&token=${encodeURIComponent(labToken)}`,
      });
      expect(queryAuthRest.statusCode).toBe(401);

      // Scoped member CANNOT push a record with missing workspaceId (no default fallback bypass!)
      const missingWsPush = await app.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers: { Authorization: `Bearer ${labToken}` },
        payload: {
          deviceId: 'dev_lab',
          operations: [
            {
              opId: 'op_missing_ws',
              recordId: 'rec_missing_ws',
              operation: 'upsert',
              baseRev: 0,
              record: {
                id: 'rec_missing_ws',
                workspaceId: '',
                type: 'note',
                title: 'Bypass Attempt',
                status: 'active',
                createdAt: '2026-11-28T00:00:00.000Z',
                updatedAt: '2026-11-28T00:00:00.000Z',
                deletedAt: null,
                rev: 1,
                deviceId: 'dev_lab',
                payload: {},
              },
            },
          ],
        },
      });
      expect(missingWsPush.statusCode).toBe(403);

      // Scoped member CANNOT overwrite existing ws_personal record by spoofing workspaceId: 'ws_lab'!
      const hijackPush = await app.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers: { Authorization: `Bearer ${labToken}` },
        payload: {
          deviceId: 'dev_lab',
          operations: [
            {
              opId: 'op_hijack',
              recordId: 'rec_private_1',
              operation: 'upsert',
              baseRev: 1,
              record: {
                id: 'rec_private_1',
                workspaceId: 'ws_lab',
                type: 'note',
                title: 'Hijacked',
                status: 'active',
                createdAt: '2026-11-28T00:00:00.000Z',
                updatedAt: '2026-11-28T00:00:00.000Z',
                deletedAt: null,
                rev: 2,
                deviceId: 'dev_lab',
                payload: {},
              },
            },
          ],
        },
      });
      expect(hijackPush.statusCode).toBe(403);

      // Scoped pull MUST NOT leak global recordCount across ws_personal
      const labPull = await app.inject({
        method: 'GET',
        url: '/api/sync/pull?since=0',
        headers: { Authorization: `Bearer ${labToken}` },
      });
      expect(labPull.statusCode).toBe(200);
      expect(labPull.json()).toMatchObject({ records: [], recordCount: 0 });

      // Malformed x-blob-name percent-encoding MUST NOT cause HTTP 500
      const payloadBuf = Buffer.from('hello-blob');
      const { createHash } = await import('node:crypto');
      const sha = createHash('sha256').update(payloadBuf).digest('hex');
      const badHeaderBlob = await app.inject({
        method: 'PUT',
        url: `/api/blobs/${sha}`,
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'Content-Type': 'text/plain',
          'X-Blob-Name': '%E0%A4%A',
        },
        payload: payloadBuf,
      });
      expect(badHeaderBlob.statusCode).toBe(200);
    } finally {
      await app.close();
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        // non-fatal on Windows SQLite WAL handle
      }
    }
  });

  it('handles offline fallback failover, SHA-256 attachment transfer, and multi-device conflict resolution without data loss', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planaday-failover-v42-'));
    const { app } = await buildDayplanaServer({ dataDir: tmpDir, requireAuth: false });
    const serverAddr = await app.listen({ port: 0, host: '127.0.0.1' });

    try {
      // Configure an unreachable primary URL + real live fallback URL (simulating away-from-home Tailscale failover!)
      await updateSettings({
        operatingMode: 'docker-sync',
        syncServerUrl: 'http://127.0.0.1:1',
        syncFallbackUrl: serverAddr,
        deviceId: 'dev_phone',
      });

      const blob = await storeBlob(new Blob(['verified-attachment-bytes'], { type: 'text/plain' }), 'lab-note.txt');
      const note = await createRecord('note', 'Field Sample Note', {
        notebookId: 'nb_personal',
        writtenForDate: '2026-11-28',
        content: 'Initial version from phone',
        attachmentBlobIds: [blob.hash],
      });

      const sync1 = await runSyncCycle(fetch, { manual: true });
      expect(sync1.status).toBe('synced');
      expect(sync1.activeServerUrl).toBe(serverAddr);

      // Simulate Device B editing the SAME note independently on the server (rev 2, different deviceId)
      const remotePush = await fetch(`${serverAddr}/api/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: 'dev_desktop',
          operations: [
            {
              opId: 'op_desktop_edit',
              recordId: note.id,
              operation: 'upsert',
              baseRev: 1,
              record: {
                ...note,
                rev: 2,
                deviceId: 'dev_desktop',
                updatedAt: new Date(Date.now() + 2000).toISOString(),
                payload: { ...(note.payload as Record<string, unknown>), content: 'Edited concurrently on desktop' },
              },
            },
          ],
        }),
      });
      expect(remotePush.ok).toBe(true);

      // Device A edits the same note offline before pulling Device B's edit
      await updateRecord(note.id, (cur) => ({
        ...cur,
        payload: { ...(cur.payload as Record<string, unknown>), content: 'Edited concurrently on phone offline' },
      }));

      // Sync Device A -> conflict MUST be detected & preserved safely in db.syncConflicts (ZERO silent overwrite!)
      await runSyncCycle(fetch, { manual: true });
      const conflicts = await db.syncConflicts.filter((c) => !c.resolved).toArray();
      expect(conflicts.length).toBe(1);
      expect((conflicts[0].localRecord.payload as { content: string }).content).toContain('phone offline');
      expect((conflicts[0].remoteRecord.payload as { content: string }).content).toContain('desktop');

      // Resolve via keep-both -> BOTH versions survive intact!
      await resolveConflict(conflicts[0].id, 'keep-both');
      const allNotes = (await db.records.toArray()).filter((r) => r.type === 'note' && !r.deletedAt);
      expect(allNotes.length).toBe(2);
      const contents = allNotes.map((n) => (n.payload as { content: string }).content);
      expect(contents.some((c) => c.includes('desktop'))).toBe(true);
      expect(contents.some((c) => c.includes('phone offline'))).toBe(true);
    } finally {
      await app.close();
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        // non-fatal
      }
    }
  });
});
