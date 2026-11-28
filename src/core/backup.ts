import { strFromU8, strToU8, unzipSync, zip, zipSync } from 'fflate';
import { PLANADAY_RELEASE } from './releaseInfo';
import { blobToArrayBuffer, createId, db, getOrInitSettings, legacyBlobHash, mergeSettingsObject, sha256Hex } from './db';
import type { AppSettings, LifeRecord, RevisionRecord, TimeLedgerEntry } from './types';

export interface DayplanaBackupPayload {
  format: 'dayplana-backup-v2';
  appVersion?: string;
  schemaVersion?: number;
  exportedAt: string;
  settings: AppSettings;
  records: LifeRecord[];
  revisions: RevisionRecord[];
  timeLedger: TimeLedgerEntry[];
  blobsMeta: Array<{ hash: string; mimeType: string; name: string; size: number; createdAt: string }>;
}

export interface BackupIntegrityManifest {
  formatVersion: 3;
  appVersion: string;
  schemaVersion: number;
  exportedAt: string;
  recordCount: number;
  revisionCount: number;
  blobCount: number;
  dataSha256: string;
  blobChecksums: Record<string, { size: number; mimeType: string; name: string }>;
}

async function readBackupSnapshot() {
  const initialized = await getOrInitSettings();
  const [settings, records, revisions, timeLedger, blobs] = await db.transaction('r', [db.settings, db.records, db.revisions, db.timeLedger, db.blobs], () => Promise.all([
    db.settings.get('app-settings'),
    db.records.toArray(),
    db.revisions.toArray(),
    db.timeLedger.toArray(),
    db.blobs.toArray(),
  ]));
  if (!settings) throw new Error('Settings unavailable during backup');

  const payload: DayplanaBackupPayload = {
    format: 'dayplana-backup-v2',
    appVersion: PLANADAY_RELEASE.version,
    schemaVersion: PLANADAY_RELEASE.indexedDbSchemaVersion,
    exportedAt: new Date().toISOString(),
    settings: { ...mergeSettingsObject(initialized, settings), syncAuthToken: undefined },
    records,
    revisions,
    timeLedger,
    blobsMeta: blobs.map((b) => ({
      hash: b.hash,
      mimeType: b.mimeType,
      name: b.name,
      size: b.size,
      createdAt: b.createdAt,
    })),
  };

  return { payload, blobs };
}

export async function exportFullJsonBackup(): Promise<string> {
  return JSON.stringify((await readBackupSnapshot()).payload, null, 2);
}

/**
 * 1-click full ZIP export including ALL records, revisions, time ledger, settings,
 * binary blobs, AND a verified SHA-256 integrity manifest (Phase 1 / PF-42).
 */
export async function exportFullZipBackup(): Promise<Blob> {
  const { payload: parsed, blobs } = await readBackupSnapshot();
  const jsonText = JSON.stringify(parsed, null, 2);
  const dataBytes = strToU8(jsonText);
  const dataSha256 = await sha256Hex(
    dataBytes.buffer.slice(dataBytes.byteOffset, dataBytes.byteOffset + dataBytes.byteLength) as ArrayBuffer
  );

  const files: Record<string, Uint8Array> = {
    'dayplana-data.json': dataBytes,
  };
  const blobChecksums: BackupIntegrityManifest['blobChecksums'] = {};

  for (const b of blobs) {
    const ab = b.data
      ? await blobToArrayBuffer(b.data)
      : b.blob
        ? await blobToArrayBuffer(b.blob)
        : new ArrayBuffer(0);
    files[`blobs/${b.hash}`] = new Uint8Array(ab);
    blobChecksums[b.hash] = { size: ab.byteLength, mimeType: b.mimeType, name: b.name };
  }

  const manifest: BackupIntegrityManifest = {
    formatVersion: 3,
    appVersion: PLANADAY_RELEASE.version,
    schemaVersion: PLANADAY_RELEASE.indexedDbSchemaVersion,
    exportedAt: parsed.exportedAt,
    recordCount: parsed.records.length,
    revisionCount: parsed.revisions.length,
    blobCount: blobs.length,
    dataSha256,
    blobChecksums,
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

  const zipped = typeof Worker === 'undefined'
    ? zipSync(files, { level: 6 })
    : await new Promise<Uint8Array>((resolve, reject) => zip(files, { level: 6 }, (error, bytes) => error ? reject(error) : resolve(bytes)));
  return new Blob([zipped.slice()], { type: 'application/zip' });
}

export async function importJsonBackup(
  jsonText: string,
  options: { queueForSyncReconcile?: boolean } = {}
): Promise<{ importedRecords: number }> {
  const parsed = JSON.parse(jsonText) as DayplanaBackupPayload;
  if (!parsed || parsed.format !== 'dayplana-backup-v2' || !Array.isArray(parsed.records)) {
    throw new Error('Invalid Planaday/Dayplana backup JSON format.');
  }

  const now = new Date().toISOString();
  await db.transaction('rw', [db.records, db.revisions, db.timeLedger, db.settings, db.outbox], async () => {
    if (parsed.records.length) await db.records.bulkPut(parsed.records);
    if (parsed.revisions?.length) await db.revisions.bulkPut(parsed.revisions);
    if (parsed.timeLedger?.length) await db.timeLedger.bulkPut(parsed.timeLedger);
    if (parsed.settings) {
      const current = await getOrInitSettings();
      // PD-003: Always clear bound server identity on backup restore so replacement servers
      // trigger explicit/safe reconciliation rather than falsely reporting "synced"!
      await db.settings.put({
        ...parsed.settings,
        id: 'app-settings',
        deviceId: current.deviceId,
        syncAuthToken: undefined,
        lastSyncServerId: undefined,
        lastSyncEpoch: undefined,
        restoredFromBackupAt: now,
      });
    }
    if (options.queueForSyncReconcile) {
      for (const rec of parsed.records) {
        await db.outbox.put({
          opId: createId('op'),
          recordId: rec.id,
          operation: 'upsert',
          record: rec,
          baseRev: 0,
          createdAt: now,
          attempts: 0,
        });
      }
    }
  });

  return { importedRecords: parsed.records.length };
}

export async function importZipBackup(
  zipFile: Blob,
  options: { maxExpandedBytes?: number } = {}
): Promise<{ importedRecords: number; importedBlobs: number; verifiedIntegrity: boolean; missingBlobs: string[] }> {
  const ab = await blobToArrayBuffer(zipFile);
  let expandedBytes = 0;
  const maxExpandedBytes = options.maxExpandedBytes ?? 1024 * 1024 * 1024;
  if (!Number.isFinite(maxExpandedBytes) || maxExpandedBytes <= 0) throw new Error('Invalid backup expansion limit.');
  const extracted = unzipSync(new Uint8Array(ab), { filter: file => {
    expandedBytes += file.originalSize;
    if (expandedBytes > maxExpandedBytes) throw new Error('Backup exceeds the configured expanded-size safety limit.');
    return file.name === 'dayplana-data.json' || file.name === 'manifest.json' || /^blobs\/[a-f0-9]{16,64}$/i.test(file.name);
  } });
  const dataBytes = extracted['dayplana-data.json'];
  if (!dataBytes) {
    throw new Error('Backup ZIP is missing dayplana-data.json');
  }

  // Verify manifest data digest when manifest.json is present
  let verifiedIntegrity = Boolean(extracted['manifest.json']);
  if (extracted['manifest.json']) {
    const manifest = JSON.parse(strFromU8(extracted['manifest.json'])) as BackupIntegrityManifest;
    const actualDataHash = await sha256Hex(
      dataBytes.buffer.slice(dataBytes.byteOffset, dataBytes.byteOffset + dataBytes.byteLength) as ArrayBuffer
    );
    if (manifest.dataSha256?.length !== 64) verifiedIntegrity = false;
    const legacyMatches = !verifiedIntegrity && manifest.dataSha256 === legacyBlobHash(dataBytes.buffer.slice(dataBytes.byteOffset, dataBytes.byteOffset + dataBytes.byteLength) as ArrayBuffer);
    if (!manifest.dataSha256 || (actualDataHash !== manifest.dataSha256 && !legacyMatches)) {
      throw new Error('Backup integrity check failed: dayplana-data.json SHA-256 mismatch.');
    }
  }

  const jsonText = strFromU8(dataBytes);
  const parsed = JSON.parse(jsonText) as DayplanaBackupPayload;
  const stagedBlobs: Array<import('./types').BlobRecord> = [];

  let importedBlobs = 0;
  const missingBlobs: string[] = [];
  for (const meta of parsed.blobsMeta ?? []) {
    const blobBytes = extracted[`blobs/${meta.hash}`];
    if (!blobBytes) {
      missingBlobs.push(meta.hash);
      verifiedIntegrity = false;
      continue;
    }
    const buf = blobBytes.buffer.slice(blobBytes.byteOffset, blobBytes.byteOffset + blobBytes.byteLength) as ArrayBuffer;
    if (meta.hash.length === 64) {
      const actualHash = await sha256Hex(buf);
      if (actualHash !== meta.hash.toLowerCase()) {
        throw new Error(
          `Backup blob integrity mismatch for "${meta.name}" (expected ${meta.hash.slice(0, 12)}…, got ${actualHash.slice(0, 12)}…, ${buf.byteLength}B).`
        );
      }
    }
    if (meta.hash.length !== 64) {
      verifiedIntegrity = false;
      if (legacyBlobHash(buf) !== meta.hash.toLowerCase()) throw new Error(`Legacy backup blob checksum mismatch: ${meta.name}`);
    }
    if (buf.byteLength !== meta.size) throw new Error(`Backup blob size mismatch: ${meta.name}`);
    stagedBlobs.push({
      hash: meta.hash,
      mimeType: meta.mimeType,
      name: meta.name,
      size: buf.byteLength,
      createdAt: meta.createdAt,
      data: buf,
      synced: false,
    });
    importedBlobs++;
  }
  const { importedRecords } = await db.transaction('rw', [db.records, db.revisions, db.timeLedger, db.settings, db.outbox, db.blobs], async () => {
    const result = await importJsonBackup(jsonText);
    if (stagedBlobs.length) await db.blobs.bulkPut(stagedBlobs);
    return result;
  });
  return { importedRecords, importedBlobs, verifiedIntegrity, missingBlobs };
}

export function sanitizeDownloadFilename(rawName: string, fallback = 'planaday-export.txt'): string {
  const cleaned = rawName
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .trim()
    .slice(0, 140);
  return cleaned || fallback;
}

export interface DownloadFileOptions {
  filename: string;
  content: Blob | string | Uint8Array;
  mimeType?: string;
}

/**
 * PD-008: Typed named-argument file download helper so filename and content can NEVER be swapped.
 */
export function downloadFile({ filename, content, mimeType = 'application/octet-stream' }: DownloadFileOptions): {
  filename: string;
  mimeType: string;
  sizeBytes: number;
} {
  const safeName = sanitizeDownloadFilename(filename);
  let blob: Blob;
  if (content instanceof Blob) {
    blob = content;
  } else if (content instanceof Uint8Array) {
    blob = new Blob([content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer], {
      type: mimeType,
    });
  } else {
    blob = new Blob([content], { type: mimeType });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return { filename: safeName, mimeType: blob.type || mimeType, sizeBytes: blob.size };
}

/**
 * Legacy positional wrapper preserved for existing callers: (content, filename, mime).
 * Prefer `downloadFile({ filename, content, mimeType })` for all callers!
 */
export function triggerBrowserDownload(blobOrText: Blob | string, filename: string, mime = 'application/json') {
  return downloadFile({ filename, content: blobOrText, mimeType: mime });
}

/**
 * Direct disk folder backup for Offline Computer Mode (Chromium File System Access API with clean fallback).
 */
export async function saveDirectToDiskFolder(): Promise<{ ok: boolean; filename: string; method: 'fs-access' | 'download' }> {
  const zipBlob = await exportFullZipBackup();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const filename = `planaday-backup-${stamp}.zip`;

  const win = window as unknown as {
    showDirectoryPicker?: (opts?: { mode?: string }) => Promise<{
      getFileHandle: (name: string, opts: { create: boolean }) => Promise<{
        createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
      }>;
    }>;
  };

  if (typeof win.showDirectoryPicker === 'function') {
    const dir = await win.showDirectoryPicker({ mode: 'readwrite' });
    const fileHandle = await dir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(zipBlob);
    await writable.close();
    return { ok: true, filename, method: 'fs-access' };
  }

  downloadFile({ filename, content: zipBlob, mimeType: 'application/zip' });
  return { ok: true, filename, method: 'download' };
}

export function recordsToCsv(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
  opts: { neutralizeFormulas?: boolean } = {}
): string {
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (opts.neutralizeFormulas && /^[=+\-@\t\r]/.test(s)) {
      s = `'${s}`;
    }
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
}
