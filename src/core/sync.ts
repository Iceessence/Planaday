import { blobToArrayBuffer, createId, db, getOrInitSettings, updateSettings } from './db';
import type { LifeRecord, SyncConflict } from './types';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'standalone';

export interface SyncStateSnapshot {
  status: SyncStatus;
  pendingCount: number;
  conflictCount: number;
  lastSyncAt: string | null;
  errorMessage?: string;
  serverReachable: boolean;
}

type SyncListener = (state: SyncStateSnapshot) => void;
const syncListeners = new Set<SyncListener>();

let currentState: SyncStateSnapshot = {
  status: 'standalone',
  pendingCount: 0,
  conflictCount: 0,
  lastSyncAt: null,
  serverReachable: false,
};

let eventSource: EventSource | null = null;
let syncTimer: number | null = null;

function emitSyncState(patch: Partial<SyncStateSnapshot>) {
  currentState = { ...currentState, ...patch };
  for (const fn of syncListeners) fn(currentState);
}

export function subscribeSyncState(fn: SyncListener): () => void {
  syncListeners.add(fn);
  fn(currentState);
  return () => syncListeners.delete(fn);
}

export function getSyncState(): SyncStateSnapshot {
  return currentState;
}

function resolveApiBase(serverUrl: string): string {
  const trimmed = serverUrl.trim().replace(/\/+$/, '');
  return trimmed; // '' means same origin '/api/...'
}

/**
 * Field-level non-overlapping record merger (Section 15.05).
 * If two offline devices edit non-overlapping fields, merges automatically.
 * If both edited long-form text (`payload.content` / `payload.narrative`) or conflicting values concurrently,
 * returns a conflict flag so neither side is silently discarded!
 */
export function mergeRecordsSafely(
  local: LifeRecord,
  remote: LifeRecord
): { merged: LifeRecord; hasConflict: boolean } {
  if (local.deviceId === remote.deviceId) {
    return { merged: remote.rev >= local.rev ? remote : local, hasConflict: false };
  }

  const localFields = local.fieldUpdatedAt ?? {};
  const remoteFields = remote.fieldUpdatedAt ?? {};

  // Detect simultaneous long-text edits on notes/thoughts/diary
  const localPayload = (local.payload ?? {}) as Record<string, unknown>;
  const remotePayload = (remote.payload ?? {}) as Record<string, unknown>;
  const textKeys = ['content', 'narrative', 'dailyNotes', 'notes'];
  let textConflict = false;
  for (const tk of textKeys) {
    if (
      typeof localPayload[tk] === 'string' &&
      typeof remotePayload[tk] === 'string' &&
      localPayload[tk] !== remotePayload[tk] &&
      (localPayload[tk] as string).length > 0 &&
      (remotePayload[tk] as string).length > 0
    ) {
      textConflict = true;
    }
  }

  const merged: LifeRecord = structuredClone(local);
  const topKeys: Array<keyof LifeRecord> = [
    'title',
    'status',
    'deletedAt',
    'dueDate',
    'doDate',
    'priority',
    'estimateMin',
    'energy',
    'category',
    'color',
    'assigneeId',
    'tags',
    'links',
    'recurrence',
  ];

  for (const k of topKeys) {
    const lTs = localFields[k];
    const rTs = remoteFields[k];
    const remoteWins =
      lTs && rTs
        ? rTs > lTs
        : rTs && !lTs
          ? true
          : lTs && !rTs
            ? false
            : remote.updatedAt > local.updatedAt;
    if (remoteWins) {
      (merged as unknown as Record<string, unknown>)[k] = structuredClone(remote[k]);
    }
  }

  // Merge non-overlapping payload keys
  const mergedPayload: Record<string, unknown> = { ...localPayload };
  for (const [pk, rv] of Object.entries(remotePayload)) {
    if (!(pk in localPayload) || localPayload[pk] === undefined || localPayload[pk] === null) {
      mergedPayload[pk] = structuredClone(rv);
    } else if (JSON.stringify(localPayload[pk]) !== JSON.stringify(rv)) {
      if (remote.updatedAt > local.updatedAt && !textKeys.includes(pk)) {
        mergedPayload[pk] = structuredClone(rv);
      }
    }
  }
  merged.payload = mergedPayload;
  merged.rev = Math.max(local.rev, remote.rev) + 1;
  merged.updatedAt = new Date().toISOString();

  return { merged, hasConflict: textConflict };
}

export async function runSyncCycle(fetchImpl: typeof fetch = fetch): Promise<SyncStateSnapshot> {
  const settings = await getOrInitSettings();
  const pendingOps = await db.outbox.orderBy('createdAt').toArray();
  const openConflicts = await db.syncConflicts.filter((c) => !c.resolved).count();

  if (settings.operatingMode !== 'docker-sync') {
    emitSyncState({
      status: 'standalone',
      pendingCount: pendingOps.length,
      conflictCount: openConflicts,
      lastSyncAt: settings.lastSyncAt,
      serverReachable: false,
      errorMessage: undefined,
    });
    return currentState;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    emitSyncState({
      status: 'offline',
      pendingCount: pendingOps.length,
      conflictCount: openConflicts,
      lastSyncAt: settings.lastSyncAt,
      serverReachable: false,
      errorMessage: undefined,
    });
    return currentState;
  }

  const base = resolveApiBase(settings.syncServerUrl);
  emitSyncState({ status: 'syncing', pendingCount: pendingOps.length, conflictCount: openConflicts });

  try {
    // 1. Upload unsynced binary blobs first
    const unsyncedBlobs = await db.blobs.filter((b) => !b.synced).toArray();
    for (const blobRec of unsyncedBlobs) {
      const buf = blobRec.data ?? (blobRec.blob ? await blobToArrayBuffer(blobRec.blob) : new ArrayBuffer(0));
      const res = await fetchImpl(`${base}/api/blobs/${blobRec.hash}`, {
        method: 'PUT',
        headers: {
          'Content-Type': blobRec.mimeType || 'application/octet-stream',
          'X-Blob-Name': encodeURIComponent(blobRec.name),
        },
        body: buf,
      });
      if (res.ok) {
        await db.blobs.update(blobRec.hash, { synced: true });
      }
    }

    // 2. Push pending local delta operations idempotently
    if (pendingOps.length > 0) {
      const pushRes = await fetchImpl(`${base}/api/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: settings.deviceId,
          operations: pendingOps,
        }),
      });
      if (!pushRes.ok) {
        throw new Error(`Sync push failed (${pushRes.status})`);
      }
      const pushJson = (await pushRes.json()) as {
        acceptedOpIds: string[];
        conflicts?: Array<{ recordId: string; serverRecord: LifeRecord }>;
        seq: number;
      };

      if (pushJson.acceptedOpIds?.length) {
        await db.outbox.bulkDelete(pushJson.acceptedOpIds);
      }

      if (pushJson.conflicts?.length) {
        for (const c of pushJson.conflicts) {
          const localRec = await db.records.get(c.recordId);
          if (localRec) {
            const { merged, hasConflict } = mergeRecordsSafely(localRec, c.serverRecord);
            if (hasConflict) {
              const conflict: SyncConflict = {
                id: createId('conf'),
                recordId: c.recordId,
                localRecord: localRec,
                remoteRecord: c.serverRecord,
                createdAt: new Date().toISOString(),
                resolved: false,
              };
              await db.syncConflicts.put(conflict);
            } else {
              await db.records.put(merged);
            }
          }
        }
      }
    }

    // 3. Pull remote deltas since lastSyncSeq
    const pullRes = await fetchImpl(`${base}/api/sync/pull?since=${settings.lastSyncSeq}`);
    if (!pullRes.ok) {
      throw new Error(`Sync pull failed (${pullRes.status})`);
    }
    const pullJson = (await pullRes.json()) as {
      seq: number;
      records: LifeRecord[];
    };

    for (const remoteRec of pullJson.records ?? []) {
      if (remoteRec.deviceId === settings.deviceId) continue;
      const localRec = await db.records.get(remoteRec.id);
      if (!localRec) {
        await db.records.put(remoteRec);
      } else {
        const pendingForRec = await db.outbox.where('recordId').equals(remoteRec.id).count();
        if (pendingForRec === 0 && remoteRec.rev >= localRec.rev) {
          await db.records.put(remoteRec);
        } else if (pendingForRec > 0) {
          const { merged, hasConflict } = mergeRecordsSafely(localRec, remoteRec);
          if (hasConflict) {
            await db.syncConflicts.put({
              id: createId('conf'),
              recordId: remoteRec.id,
              localRecord: localRec,
              remoteRecord: remoteRec,
              createdAt: new Date().toISOString(),
              resolved: false,
            });
          } else {
            await db.records.put(merged);
          }
        }
      }
    }

    const now = new Date().toISOString();
    await updateSettings({
      lastSyncSeq: Math.max(settings.lastSyncSeq, pullJson.seq ?? settings.lastSyncSeq),
      lastSyncAt: now,
    });

    const remPending = await db.outbox.count();
    const remConflicts = await db.syncConflicts.filter((c) => !c.resolved).count();

    emitSyncState({
      status: 'synced',
      pendingCount: remPending,
      conflictCount: remConflicts,
      lastSyncAt: now,
      serverReachable: true,
      errorMessage: undefined,
    });
  } catch (err) {
    const remPending = await db.outbox.count();
    const remConflicts = await db.syncConflicts.filter((c) => !c.resolved).count();
    const isOfflineErr = err instanceof TypeError;
    emitSyncState({
      status: isOfflineErr ? 'offline' : 'error',
      pendingCount: remPending,
      conflictCount: remConflicts,
      lastSyncAt: settings.lastSyncAt,
      serverReachable: false,
      errorMessage: err instanceof Error ? err.message : 'Sync unreachable',
    });
  }

  return currentState;
}

export async function resolveConflict(
  conflictId: string,
  choice: 'keep-local' | 'keep-remote' | 'keep-both' | 'custom',
  customMerged?: LifeRecord
): Promise<void> {
  const conflict = await db.syncConflicts.get(conflictId);
  if (!conflict) return;
  const settings = await getOrInitSettings();
  const now = new Date().toISOString();

  if (choice === 'keep-local') {
    const rec: LifeRecord = {
      ...conflict.localRecord,
      rev: Math.max(conflict.localRecord.rev, conflict.remoteRecord.rev) + 1,
      updatedAt: now,
      deviceId: settings.deviceId,
    };
    await db.records.put(rec);
    await db.outbox.put({
      opId: createId('op'),
      recordId: rec.id,
      operation: 'upsert',
      record: rec,
      baseRev: conflict.remoteRecord.rev,
      createdAt: now,
      attempts: 0,
    });
  } else if (choice === 'keep-remote') {
    await db.records.put(conflict.remoteRecord);
  } else if (choice === 'keep-both') {
    // Keep remote in original ID, save local as an explicit conflict copy so zero text is lost
    await db.records.put(conflict.remoteRecord);
    const copy: LifeRecord = {
      ...conflict.localRecord,
      id: createId('copy'),
      title: `${conflict.localRecord.title} (Conflict Copy)`,
      createdAt: now,
      updatedAt: now,
      rev: 1,
      deviceId: settings.deviceId,
    };
    await db.records.put(copy);
    await db.outbox.put({
      opId: createId('op'),
      recordId: copy.id,
      operation: 'upsert',
      record: copy,
      baseRev: 0,
      createdAt: now,
      attempts: 0,
    });
  } else if (choice === 'custom' && customMerged) {
    const rec: LifeRecord = {
      ...customMerged,
      rev: Math.max(conflict.localRecord.rev, conflict.remoteRecord.rev) + 1,
      updatedAt: now,
      deviceId: settings.deviceId,
    };
    await db.records.put(rec);
    await db.outbox.put({
      opId: createId('op'),
      recordId: rec.id,
      operation: 'upsert',
      record: rec,
      baseRev: conflict.remoteRecord.rev,
      createdAt: now,
      attempts: 0,
    });
  }

  await db.syncConflicts.update(conflictId, { resolved: true });
  const remConflicts = await db.syncConflicts.filter((c) => !c.resolved).count();
  emitSyncState({ conflictCount: remConflicts });
}

export async function startSyncDaemon(): Promise<void> {
  stopSyncDaemon();
  const settings = await getOrInitSettings();
  if (settings.operatingMode !== 'docker-sync') {
    const pendingCount = await db.outbox.count();
    emitSyncState({ status: 'standalone', pendingCount, serverReachable: false });
    return;
  }

  await runSyncCycle();

  if (typeof window !== 'undefined') {
    const base = resolveApiBase(settings.syncServerUrl);
    if (typeof EventSource !== 'undefined') {
      try {
        eventSource = new EventSource(`${base}/api/sync/events?deviceId=${encodeURIComponent(settings.deviceId)}`);
        eventSource.addEventListener('sync-update', () => {
          void runSyncCycle();
        });
      } catch {
        // SSE optional fallback to polling
      }
    }

    syncTimer = window.setInterval(() => {
      void runSyncCycle();
    }, 15000);
  }
}

export function stopSyncDaemon(): void {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  if (syncTimer !== null && typeof window !== 'undefined') {
    window.clearInterval(syncTimer);
    syncTimer = null;
  }
}
