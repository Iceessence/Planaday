import { blobToArrayBuffer, createId, db, getOrInitSettings, sha256Hex, updateSettings } from './db';
import { detectRuntimePlatform } from './nativeAlarms';
import { compactOutbox, subscribeRepository } from './repository';
import type { LifeRecord, OutboxOp, SyncConflict } from './types';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'standalone';

export interface BlobTransferReceipt {
  hash: string;
  direction: 'upload' | 'download';
  status: 'verified' | 'pending' | 'failed';
  error?: string;
  at: string;
}

export interface SyncStateSnapshot {
  status: SyncStatus;
  pendingCount: number;
  pendingBlobUploads?: number;
  pendingBlobDownloads?: number;
  failedBlobTransfers?: number;
  blobReceipts?: BlobTransferReceipt[];
  conflictCount: number;
  lastSyncAt: string | null;
  errorMessage?: string;
  serverReachable: boolean;
  activeServerUrl?: string;
  serverId?: string;
  syncEpoch?: number;
  lastSyncDurationMs?: number;
  lastSyncedOpsCount?: number;
  queueBytesEstimate?: number;
  compactedOpsTotal?: number;
}

export interface ServerStorageInfo {
  ok: boolean;
  app: string;
  version?: string;
  serverId?: string;
  syncEpoch?: number;
  authEnabled?: boolean;
  dataDir: string;
  sqlitePath: string;
  sqliteSizeBytes: number;
  blobsDir: string;
  blobCount: number;
  blobTotalBytes: number;
  recordCount: number;
  seq: number;
  sseClientCount: number;
  uptimeSec: number;
  backupsDir: string;
  backups: Array<{ name: string; sizeBytes: number; modifiedAt: string }>;
}

type SyncListener = (state: SyncStateSnapshot) => void;
const syncListeners = new Set<SyncListener>();

let currentState: SyncStateSnapshot = {
  status: 'standalone',
  pendingCount: 0,
  pendingBlobUploads: 0,
  pendingBlobDownloads: 0,
  failedBlobTransfers: 0,
  blobReceipts: [],
  conflictCount: 0,
  lastSyncAt: null,
  serverReachable: false,
  compactedOpsTotal: 0,
};

let eventSource: EventSource | null = null;
let syncTimer: number | null = null;
let debouncedSyncTimer: number | null = null;
let unsubRepo: (() => void) | null = null;
let visibilityHandler: (() => void) | null = null;
let syncInFlight: Promise<SyncStateSnapshot> | null = null;
let totalCompactedOps = 0;

const PUSH_BATCH_SIZE = 50;

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

function buildAuthHeaders(token?: string | null, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (token && token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

/**
 * Recursively extracts every SHA-256 / content-addressed blob hash referenced by a LifeRecord (PD-002).
 */
export function extractReferencedBlobHashes(record: LifeRecord): string[] {
  const hashes = new Set<string>();
  const isHash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{16,128}$/i.test(v);

  const visit = (obj: unknown, keyHint = ''): void => {
    if (!obj) return;
    if (typeof obj === 'string') {
      if (/(blob|hash)/i.test(keyHint) && isHash(obj)) {
        hashes.add(obj.toLowerCase());
      }
      return;
    }
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (typeof item === 'string' && /(blob|hash)/i.test(keyHint) && isHash(item)) {
          hashes.add(item.toLowerCase());
        } else if (item && typeof item === 'object') {
          visit(item, keyHint);
        }
      }
      return;
    }
    if (typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        visit(v, k);
      }
    }
  };

  visit(record.payload);
  return Array.from(hashes);
}

export function normalizeServerUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  let url = trimmed.replace(/\/api(?:\/.*)?$/i, '').replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) {
    const looksLikeTsHttps = /\.ts\.net$/i.test(url) && !url.includes(':');
    url = `${looksLikeTsHttps ? 'https' : 'http'}://${url}`;
  }
  return url;
}

export interface ServerTestResult {
  ok: boolean;
  normalizedUrl: string;
  latencyMs: number;
  version?: string;
  serverId?: string;
  authEnabled?: boolean;
  setupRequired?: boolean;
  recordCount?: number;
  error?: string;
}

export async function testServerConnection(rawUrl: string, fetchImpl: typeof fetch = fetch): Promise<ServerTestResult> {
  const normalizedUrl = normalizeServerUrl(rawUrl);
  const started = Date.now();
  let timerId: ReturnType<typeof setTimeout> | null = null;
  try {
    const res = await Promise.race([
      fetchImpl(`${normalizedUrl}/api/health`),
      new Promise<never>((_, reject) => {
        timerId = setTimeout(() => {
          const err = new Error('Connection timed out');
          err.name = 'TimeoutError';
          reject(err);
        }, 5500);
      }),
    ]);
    if (timerId) clearTimeout(timerId);
    const contentType = res.headers?.get?.('content-type') ?? 'application/json';
    if (!res.ok) {
      return {
        ok: false,
        normalizedUrl,
        latencyMs: Date.now() - started,
        error: `Server responded with HTTP ${res.status}. Make sure port :3000 is included (e.g., http://192.168.88.31:3000).`,
      };
    }
    if (contentType && !contentType.includes('json')) {
      return {
        ok: false,
        normalizedUrl,
        latencyMs: Date.now() - started,
        error: 'Target returned HTML instead of Planaday Sync API — check that you included port :3000 (not Dockge port 5001).',
      };
    }
    const json = (await res.json()) as {
      ok?: boolean;
      app?: string;
      legacyApp?: string;
      version?: string;
      serverId?: string;
      authEnabled?: boolean;
      setupRequired?: boolean;
      recordCount?: number;
    };
    const isPlanaday = json.app === 'planaday' || json.app === 'dayplana' || json.legacyApp === 'dayplana';
    if (!json.ok || !isPlanaday) {
      return {
        ok: false,
        normalizedUrl,
        latencyMs: Date.now() - started,
        error: 'Reached a server, but it is not a Planaday Sync Server.',
      };
    }
    return {
      ok: true,
      normalizedUrl,
      latencyMs: Date.now() - started,
      version: json.version,
      serverId: json.serverId,
      authEnabled: json.authEnabled,
      setupRequired: json.setupRequired,
      recordCount: json.recordCount,
    };
  } catch (err) {
    if (timerId) clearTimeout(timerId);
    return {
      ok: false,
      normalizedUrl,
      latencyMs: Date.now() - started,
      error:
        err instanceof Error && err.name === 'TimeoutError'
          ? 'Connection timed out — if away from home Wi-Fi, use your Docker host Tailscale IP (http://100.x.y.z:3000).'
          : `Could not reach ${normalizedUrl || 'same-origin server'} — verify Docker is running and use http://LAN_IP:3000 or Tailscale http://100.x.y.z:3000.`,
    };
  }
}

export async function fetchServerStorageInfo(fetchImpl: typeof fetch = fetch): Promise<ServerStorageInfo | null> {
  const settings = await getOrInitSettings();
  const candidates = getCandidateServerBases(settings.syncServerUrl, settings.syncFallbackUrl || '');
  const headers = buildAuthHeaders(settings.syncAuthToken);
  for (const base of candidates) {
    try {
      const res = await fetchImpl(`${base}/api/storage/info`, { headers });
      if (res.ok) {
        const json = (await res.json()) as ServerStorageInfo;
        if (json.ok) return json;
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function triggerServerSqliteBackup(
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; filePath?: string; sizeBytes?: number; error?: string }> {
  const settings = await getOrInitSettings();
  const candidates = getCandidateServerBases(settings.syncServerUrl, settings.syncFallbackUrl || '');
  const headers = buildAuthHeaders(settings.syncAuthToken);
  for (const base of candidates) {
    try {
      const res = await fetchImpl(`${base}/api/storage/backup`, { method: 'POST', headers });
      const json = (await res.json()) as { ok?: boolean; filePath?: string; sizeBytes?: number; error?: string };
      if (res.ok && json.ok) {
        return { ok: true, filePath: json.filePath, sizeBytes: json.sizeBytes };
      }
      return { ok: false, error: json.error || `HTTP ${res.status}` };
    } catch {
      // try next candidate
    }
  }
  return { ok: false, error: 'Could not reach Planaday sync server.' };
}

function getCandidateServerBases(primaryRaw: string, fallbackRaw: string): string[] {
  const runtime = detectRuntimePlatform();
  const primary = normalizeServerUrl(primaryRaw);
  const fallback = normalizeServerUrl(fallbackRaw);
  const list: string[] = [];

  if (primary) list.push(primary);
  else if (runtime.platform === 'web-pwa') list.push('');

  if (fallback && !list.includes(fallback)) list.push(fallback);
  return list;
}

/**
 * Field-level non-overlapping record merger (Section 15.05).
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
    'ownerProfileId',
    'sharedWithAll',
    'sharedWithProfileIds',
    'isImportant',
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

interface SyncPassResult {
  seq: number;
  serverId?: string;
  syncEpoch?: number;
  pushedCount: number;
  failedUploads: BlobTransferReceipt[];
  failedDownloads: BlobTransferReceipt[];
  verifiedReceipts: BlobTransferReceipt[];
  reboundReplacementServer: boolean;
}

async function uploadUnsyncedBlobs(
  base: string,
  authToken: string | undefined,
  fetchImpl: typeof fetch
): Promise<{ verified: BlobTransferReceipt[]; failed: BlobTransferReceipt[] }> {
  const verified: BlobTransferReceipt[] = [];
  const failed: BlobTransferReceipt[] = [];
  const unsyncedBlobs = await db.blobs.filter((b) => !b.synced).toArray();

  for (const blobRec of unsyncedBlobs) {
    const now = new Date().toISOString();
    try {
      const buf = blobRec.data
        ? await blobToArrayBuffer(blobRec.data)
        : blobRec.blob
          ? await blobToArrayBuffer(blobRec.blob)
          : new ArrayBuffer(0);
      const res = await fetchImpl(`${base}/api/blobs/${blobRec.hash}`, {
        method: 'PUT',
        headers: buildAuthHeaders(authToken, {
          'Content-Type': blobRec.mimeType || 'application/octet-stream',
          'X-Blob-Name': encodeURIComponent(blobRec.name || 'attachment'),
        }),
        body: buf,
      });
      if (res.ok) {
        // Use full put() rather than partial update() so cross-realm ArrayBuffer payloads are never stripped by deepClone
        await db.blobs.put({ ...blobRec, data: buf, synced: true });
        verified.push({ hash: blobRec.hash, direction: 'upload', status: 'verified', at: now });
      } else {
        failed.push({
          hash: blobRec.hash,
          direction: 'upload',
          status: 'failed',
          error: `Blob upload rejected (HTTP ${res.status})`,
          at: now,
        });
      }
    } catch (err) {
      failed.push({
        hash: blobRec.hash,
        direction: 'upload',
        status: 'failed',
        error: err instanceof Error ? err.message : 'Blob upload network failure',
        at: now,
      });
    }
  }
  return { verified, failed };
}

async function downloadMissingReferencedBlobs(
  base: string,
  authToken: string | undefined,
  fetchImpl: typeof fetch
): Promise<{ verified: BlobTransferReceipt[]; failed: BlobTransferReceipt[] }> {
  const verified: BlobTransferReceipt[] = [];
  const failed: BlobTransferReceipt[] = [];

  // Inspect all non-deleted records for referenced attachment hashes not yet stored locally (PD-002)
  const allRecs = await db.records.toArray();
  const neededHashes = new Set<string>();
  for (const rec of allRecs) {
    if (rec.deletedAt) continue;
    for (const h of extractReferencedBlobHashes(rec)) {
      neededHashes.add(h);
    }
  }

  for (const hash of neededHashes) {
    const localExisting = await db.blobs.get(hash);
    if (localExisting && (localExisting.data || localExisting.blob)) continue;

    const now = new Date().toISOString();
    try {
      const res = await fetchImpl(`${base}/api/blobs/${hash}`, {
        headers: buildAuthHeaders(authToken),
      });
      if (!res.ok) {
        failed.push({
          hash,
          direction: 'download',
          status: 'failed',
          error: `Attachment download failed (HTTP ${res.status})`,
          at: now,
        });
        continue;
      }
      const ab = await res.arrayBuffer();
      if (hash.length === 64) {
        const computed = await sha256Hex(ab);
        if (computed !== hash.toLowerCase()) {
          failed.push({
            hash,
            direction: 'download',
            status: 'failed',
            error: `Downloaded attachment SHA-256 mismatch (${computed.slice(0, 10)}… != ${hash.slice(0, 10)}…)`,
            at: now,
          });
          continue;
        }
      }
      const mimeType = (res.headers?.get?.('content-type') || 'application/octet-stream').split(';')[0].trim();
      await db.blobs.put({
        hash,
        mimeType,
        name: `attachment-${hash.slice(0, 8)}`,
        size: ab.byteLength,
        data: ab,
        createdAt: now,
        synced: true,
      });
      verified.push({ hash, direction: 'download', status: 'verified', at: now });
    } catch (err) {
      failed.push({
        hash,
        direction: 'download',
        status: 'failed',
        error: err instanceof Error ? err.message : 'Attachment download network error',
        at: now,
      });
    }
  }

  return { verified, failed };
}

async function pushPendingOperations(
  base: string,
  settings: Awaited<ReturnType<typeof getOrInitSettings>>,
  pendingOps: OutboxOp[],
  fetchImpl: typeof fetch
): Promise<{ pushedCount: number; serverId?: string; syncEpoch?: number }> {
  let pushedCount = 0;
  let serverId: string | undefined;
  let syncEpoch: number | undefined;

  for (let offset = 0; offset < pendingOps.length; offset += PUSH_BATCH_SIZE) {
    const chunk = pendingOps.slice(offset, offset + PUSH_BATCH_SIZE);
    const pushRes = await fetchImpl(`${base}/api/sync/push`, {
      method: 'POST',
      headers: buildAuthHeaders(settings.syncAuthToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        deviceId: settings.deviceId,
        operations: chunk,
      }),
    });
    if (!pushRes.ok) {
      throw new Error(`Sync push failed (HTTP ${pushRes.status})`);
    }
    const ct = pushRes.headers?.get?.('content-type') ?? 'application/json';
    if (ct && !ct.includes('json')) {
      throw new Error('Server returned HTML instead of Sync API JSON — verify port :3000');
    }
    const pushJson = (await pushRes.json()) as {
      acceptedOpIds: string[];
      conflicts?: Array<{ recordId: string; serverRecord: LifeRecord }>;
      seq: number;
      serverId?: string;
      syncEpoch?: number;
    };
    serverId = pushJson.serverId ?? serverId;
    syncEpoch = pushJson.syncEpoch ?? syncEpoch;

    if (pushJson.acceptedOpIds?.length) {
      await db.outbox.bulkDelete(pushJson.acceptedOpIds);
      pushedCount += pushJson.acceptedOpIds.length;
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
  return { pushedCount, serverId, syncEpoch };
}

async function syncAgainstBase(
  base: string,
  settings: Awaited<ReturnType<typeof getOrInitSettings>>,
  pendingOps: OutboxOp[],
  fetchImpl: typeof fetch
): Promise<SyncPassResult> {
  // 1. Upload unsynced binary blobs first & collect receipts (CONT-004 / PF-51)
  const up1 = await uploadUnsyncedBlobs(base, settings.syncAuthToken, fetchImpl);

  // 2. Push pending local delta operations in chunks
  const push1 = await pushPendingOperations(base, settings, pendingOps, fetchImpl);

  // 3. Pull remote deltas since lastSyncSeq
  const pullRes = await fetchImpl(`${base}/api/sync/pull?since=${settings.lastSyncSeq}`, {
    headers: buildAuthHeaders(settings.syncAuthToken),
  });
  if (!pullRes.ok) {
    throw new Error(`Sync pull failed (HTTP ${pullRes.status})`);
  }
  const pullCt = pullRes.headers?.get?.('content-type') ?? 'application/json';
  if (pullCt && !pullCt.includes('json')) {
    throw new Error('Server returned HTML instead of Sync API JSON — enter your Docker URL (e.g. http://192.168.88.31:3000)');
  }
  let pullJson = (await pullRes.json()) as {
    seq: number;
    records: LifeRecord[];
    recordCount?: number;
    serverId?: string;
    syncEpoch?: number;
  };

  let pushedCount = push1.pushedCount;
  const failedUploads = [...up1.failed];
  const verifiedReceipts = [...up1.verified];
  let reboundReplacementServer = false;

  // 4. PD-003: Server Identity / Replacement Server Reconciliation!
  // Detect when connected to a replacement or empty server (different serverId, reset seq < lastSyncSeq,
  // or freshly restored from a ZIP backup) so local restored records & blobs are never silently orphaned!
  const serverChanged =
    Boolean(settings.lastSyncServerId && pullJson.serverId && pullJson.serverId !== settings.lastSyncServerId) ||
    Boolean(settings.lastSyncEpoch && pullJson.syncEpoch && pullJson.syncEpoch !== settings.lastSyncEpoch) ||
    pullJson.seq < settings.lastSyncSeq ||
    Boolean(settings.restoredFromBackupAt);

  if (serverChanged) {
    reboundReplacementServer = true;
    // Pull full remote state from seq 0 so we don't miss anything on the replacement server
    const fullPullRes = await fetchImpl(`${base}/api/sync/pull?since=0`, {
      headers: buildAuthHeaders(settings.syncAuthToken),
    });
    if (!fullPullRes.ok) {
      throw new Error(`Replacement server reconciliation pull failed (HTTP ${fullPullRes.status})`);
    }
    pullJson = (await fullPullRes.json()) as typeof pullJson;

    const remoteById = new Map((pullJson.records ?? []).map((r) => [r.id, r]));
    const localRecords = await db.records.toArray();
    const now = new Date().toISOString();
    const reconcileOps: OutboxOp[] = [];

    for (const loc of localRecords) {
      const rem = remoteById.get(loc.id);
      if (!rem || loc.rev > rem.rev) {
        reconcileOps.push({
          opId: createId('rebind'),
          recordId: loc.id,
          operation: 'upsert',
          record: loc,
          baseRev: rem?.rev ?? 0,
          createdAt: now,
          attempts: 0,
        });
      }
    }

    if (reconcileOps.length > 0) {
      // Also ensure every locally stored blob not already uploaded in step 1 is pushed to the replacement server
      const uploadedInPass1 = new Set(up1.verified.map((r) => r.hash));
      const localBlobs = await db.blobs.toArray();
      for (const b of localBlobs) {
        if (b.synced && !uploadedInPass1.has(b.hash)) {
          const buf = b.data
            ? await blobToArrayBuffer(b.data)
            : b.blob
              ? await blobToArrayBuffer(b.blob)
              : new ArrayBuffer(0);
          await db.blobs.put({ ...b, data: buf, synced: false });
        }
      }
      const up2 = await uploadUnsyncedBlobs(base, settings.syncAuthToken, fetchImpl);
      verifiedReceipts.push(...up2.verified);
      failedUploads.push(...up2.failed);

      await db.outbox.bulkPut(reconcileOps);
      const push2 = await pushPendingOperations(base, settings, reconcileOps, fetchImpl);
      pushedCount += push2.pushedCount;
      // Refresh seq after reconciliation push
      const afterPull = await fetchImpl(`${base}/api/sync/pull?since=0`, {
        headers: buildAuthHeaders(settings.syncAuthToken),
      });
      if (afterPull.ok) {
        pullJson = (await afterPull.json()) as typeof pullJson;
      }
    }
  }

  // 5. Apply pulled remote records safely
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

  // 6. PD-002: Download & SHA-256 verify every attachment referenced by pulled/local records!
  const dl = await downloadMissingReferencedBlobs(base, settings.syncAuthToken, fetchImpl);
  verifiedReceipts.push(...dl.verified);

  return {
    seq: pullJson.seq ?? 0,
    serverId: pullJson.serverId ?? push1.serverId,
    syncEpoch: pullJson.syncEpoch ?? push1.syncEpoch,
    pushedCount,
    failedUploads,
    failedDownloads: dl.failed,
    verifiedReceipts,
    reboundReplacementServer,
  };
}

function estimateOpsBytes(ops: OutboxOp[]): number {
  let bytes = 0;
  for (const o of ops) {
    try {
      bytes += JSON.stringify(o).length;
    } catch {
      bytes += 256;
    }
  }
  return bytes;
}

async function executeSyncCycle(fetchImpl: typeof fetch): Promise<SyncStateSnapshot> {
  const started = Date.now();

  const comp = await compactOutbox();
  if (comp.removed > 0) {
    totalCompactedOps += comp.removed;
  }

  const settings = await getOrInitSettings();
  const pendingOps = await db.outbox.orderBy('createdAt').toArray();
  const unsyncedBlobCount = await db.blobs.filter((b) => !b.synced).count();
  const openConflicts = await db.syncConflicts.filter((c) => !c.resolved).count();
  const queueBytesEstimate = estimateOpsBytes(pendingOps);

  if (settings.operatingMode !== 'docker-sync') {
    emitSyncState({
      status: 'standalone',
      pendingCount: pendingOps.length + unsyncedBlobCount,
      pendingBlobUploads: unsyncedBlobCount,
      pendingBlobDownloads: 0,
      failedBlobTransfers: 0,
      conflictCount: openConflicts,
      lastSyncAt: settings.lastSyncAt,
      serverReachable: false,
      errorMessage: undefined,
      activeServerUrl: undefined,
      queueBytesEstimate,
      compactedOpsTotal: totalCompactedOps,
    });
    return currentState;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    emitSyncState({
      status: 'offline',
      pendingCount: pendingOps.length + unsyncedBlobCount,
      pendingBlobUploads: unsyncedBlobCount,
      conflictCount: openConflicts,
      lastSyncAt: settings.lastSyncAt,
      serverReachable: false,
      queueBytesEstimate,
      compactedOpsTotal: totalCompactedOps,
      errorMessage: 'Device is currently offline — changes queued safely on device.',
    });
    return currentState;
  }

  const candidates = getCandidateServerBases(settings.syncServerUrl, settings.syncFallbackUrl || '');
  if (candidates.length === 0) {
    emitSyncState({
      status: 'error',
      pendingCount: pendingOps.length + unsyncedBlobCount,
      pendingBlobUploads: unsyncedBlobCount,
      conflictCount: openConflicts,
      lastSyncAt: settings.lastSyncAt,
      serverReachable: false,
      queueBytesEstimate,
      compactedOpsTotal: totalCompactedOps,
      errorMessage: 'Enter your Docker LAN URL (http://192.168.88.31:3000) or Tailscale IP (http://100.x.y.z:3000) in Settings → Sync & Storage.',
    });
    return currentState;
  }

  emitSyncState({
    status: 'syncing',
    pendingCount: pendingOps.length + unsyncedBlobCount,
    pendingBlobUploads: unsyncedBlobCount,
    conflictCount: openConflicts,
    queueBytesEstimate,
    compactedOpsTotal: totalCompactedOps,
  });

  let lastErr: unknown = null;
  for (const base of candidates) {
    try {
      const res = await syncAgainstBase(base, settings, pendingOps, fetchImpl);
      const now = new Date().toISOString();
      const remPendingOps = await db.outbox.toArray();
      const remUnsyncedBlobs = await db.blobs.filter((b) => !b.synced).count();
      const remConflicts = await db.syncConflicts.filter((c) => !c.resolved).count();

      const totalBlobFailures = res.failedUploads.length + res.failedDownloads.length;
      const totalPending = remPendingOps.length + remUnsyncedBlobs + res.failedDownloads.length;
      const allReceipts = [...res.failedUploads, ...res.failedDownloads, ...res.verifiedReceipts].slice(0, 30);

      // Update bound server identity & seq (use exact server seq when rebound to a replacement server!)
      await updateSettings({
        lastSyncSeq: res.reboundReplacementServer ? res.seq : Math.max(settings.lastSyncSeq, res.seq),
        lastSyncServerId: res.serverId ?? settings.lastSyncServerId,
        lastSyncEpoch: res.syncEpoch ?? settings.lastSyncEpoch,
        restoredFromBackupAt: totalBlobFailures === 0 && remPendingOps.length === 0 ? null : settings.restoredFromBackupAt,
        lastSyncAt: totalBlobFailures === 0 ? now : settings.lastSyncAt,
      });

      // CONT-004 / PF-51: NEVER report "synced" if ANY attachment upload or download failed!
      if (totalBlobFailures > 0 || remUnsyncedBlobs > 0) {
        const firstErr = res.failedUploads[0]?.error || res.failedDownloads[0]?.error || 'Attachment transfer incomplete';
        emitSyncState({
          status: 'error',
          pendingCount: Math.max(totalPending, totalBlobFailures),
          pendingBlobUploads: remUnsyncedBlobs,
          pendingBlobDownloads: res.failedDownloads.length,
          failedBlobTransfers: totalBlobFailures,
          blobReceipts: allReceipts,
          conflictCount: remConflicts,
          lastSyncAt: settings.lastSyncAt,
          serverReachable: true,
          activeServerUrl: base || 'Same-Origin Docker',
          serverId: res.serverId,
          syncEpoch: res.syncEpoch,
          errorMessage: `Attachment transfer incomplete (${res.failedUploads.length} upload failed, ${res.failedDownloads.length} download failed): ${firstErr}`,
          lastSyncDurationMs: Date.now() - started,
          lastSyncedOpsCount: res.pushedCount,
          queueBytesEstimate: estimateOpsBytes(remPendingOps),
          compactedOpsTotal: totalCompactedOps,
        });
        return currentState;
      }

      emitSyncState({
        status: 'synced',
        pendingCount: remPendingOps.length,
        pendingBlobUploads: 0,
        pendingBlobDownloads: 0,
        failedBlobTransfers: 0,
        blobReceipts: allReceipts,
        conflictCount: remConflicts,
        lastSyncAt: now,
        serverReachable: true,
        activeServerUrl: base || 'Same-Origin Docker',
        serverId: res.serverId,
        syncEpoch: res.syncEpoch,
        errorMessage: undefined,
        lastSyncDurationMs: Date.now() - started,
        lastSyncedOpsCount: res.pushedCount,
        queueBytesEstimate: estimateOpsBytes(remPendingOps),
        compactedOpsTotal: totalCompactedOps,
      });
      return currentState;
    } catch (err) {
      lastErr = err;
    }
  }

  const remPendingOps = await db.outbox.toArray();
  const remUnsyncedBlobs = await db.blobs.filter((b) => !b.synced).count();
  const remConflicts = await db.syncConflicts.filter((c) => !c.resolved).count();
  const isOfflineErr = lastErr instanceof TypeError;
  emitSyncState({
    status: isOfflineErr ? 'offline' : 'error',
    pendingCount: remPendingOps.length + remUnsyncedBlobs,
    pendingBlobUploads: remUnsyncedBlobs,
    conflictCount: remConflicts,
    lastSyncAt: settings.lastSyncAt,
    serverReachable: false,
    lastSyncDurationMs: Date.now() - started,
    queueBytesEstimate: estimateOpsBytes(remPendingOps),
    compactedOpsTotal: totalCompactedOps,
    errorMessage:
      lastErr instanceof Error
        ? `${lastErr.message} (Tried: ${candidates.map((c) => c || 'same-origin').join(' → ')})`
        : 'Sync server unreachable — check LAN/Tailscale IP and port :3000.',
  });

  return currentState;
}

export async function runSyncCycle(fetchImpl: typeof fetch = fetch): Promise<SyncStateSnapshot> {
  if (syncInFlight) return syncInFlight;
  syncInFlight = executeSyncCycle(fetchImpl).finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

export function scheduleDebouncedSync(delayMs = 1500): void {
  if (typeof window === 'undefined') return;
  if (debouncedSyncTimer !== null) {
    window.clearTimeout(debouncedSyncTimer);
  }
  debouncedSyncTimer = window.setTimeout(() => {
    debouncedSyncTimer = null;
    void runSyncCycle();
  }, delayMs);
}

async function flushKeepaliveOnBackground(): Promise<void> {
  try {
    const settings = await getOrInitSettings();
    if (settings.operatingMode !== 'docker-sync') return;
    await compactOutbox();
    const ops = await db.outbox.orderBy('createdAt').limit(20).toArray();
    if (ops.length === 0) return;
    const candidates = getCandidateServerBases(settings.syncServerUrl, settings.syncFallbackUrl || '');
    const base =
      currentState.activeServerUrl && currentState.activeServerUrl !== 'Same-Origin Docker'
        ? currentState.activeServerUrl
        : candidates[0];
    if (base === undefined) return;
    const body = JSON.stringify({ deviceId: settings.deviceId, operations: ops });
    if (body.length < 60_000) {
      void fetch(`${base}/api/sync/push`, {
        method: 'POST',
        headers: buildAuthHeaders(settings.syncAuthToken, { 'Content-Type': 'application/json' }),
        body,
        keepalive: true,
      }).catch(() => undefined);
    } else {
      void runSyncCycle();
    }
  } catch {
    // Outbox remains safely persisted in IndexedDB
  }
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
  scheduleDebouncedSync(400);
}

export async function startSyncDaemon(): Promise<void> {
  stopSyncDaemon();
  const settings = await getOrInitSettings();
  if (settings.operatingMode !== 'docker-sync') {
    const pendingCount = await db.outbox.count();
    emitSyncState({ status: 'standalone', pendingCount, serverReachable: false });
    return;
  }

  unsubRepo = subscribeRepository(() => {
    void db.outbox.count().then((cnt) => {
      if (cnt !== currentState.pendingCount) {
        emitSyncState({ pendingCount: cnt });
      }
    });
    scheduleDebouncedSync(1500);
  });

  const result = await runSyncCycle();

  if (typeof window !== 'undefined') {
    const activeBase =
      result.activeServerUrl && result.activeServerUrl !== 'Same-Origin Docker'
        ? result.activeServerUrl
        : normalizeServerUrl(settings.syncServerUrl);
    if (result.serverReachable && typeof EventSource !== 'undefined') {
      try {
        const tokenParam = settings.syncAuthToken ? `&token=${encodeURIComponent(settings.syncAuthToken)}` : '';
        eventSource = new EventSource(
          `${activeBase}/api/sync/events?deviceId=${encodeURIComponent(settings.deviceId)}${tokenParam}`
        );
        eventSource.addEventListener('sync-update', () => {
          scheduleDebouncedSync(300);
        });
      } catch {
        // SSE optional fallback to polling
      }
    }

    visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        void flushKeepaliveOnBackground();
      } else if (document.visibilityState === 'visible') {
        void runSyncCycle();
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    syncTimer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        void runSyncCycle();
      }
    }, 20000);
  }
}

export function stopSyncDaemon(): void {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  if (syncTimer !== null) {
    window.clearInterval(syncTimer);
    syncTimer = null;
  }
  if (debouncedSyncTimer !== null) {
    window.clearTimeout(debouncedSyncTimer);
    debouncedSyncTimer = null;
  }
  if (unsubRepo) {
    unsubRepo();
    unsubRepo = null;
  }
  if (visibilityHandler && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
}
