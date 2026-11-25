import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { blobToArrayBuffer, createId, db, getOrInitSettings, sha256Hex } from './db';
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

export async function exportFullJsonBackup(): Promise<string> {
  const [settings, records, revisions, timeLedger, blobs] = await Promise.all([
    getOrInitSettings(),
    db.records.toArray(),
    db.revisions.toArray(),
    db.timeLedger.toArray(),
    db.blobs.toArray(),
  ]);

  const payload: DayplanaBackupPayload = {
    format: 'dayplana-backup-v2',
    appVersion: '4.1.0',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    settings,
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

  return JSON.stringify(payload, null, 2);
}

/**
 * 1-click full ZIP export including ALL records, revisions, time ledger, settings,
 * binary blobs, AND a verified SHA-256 integrity manifest (Phase 1 / PF-42).
 */
export async function exportFullZipBackup(): Promise<Blob> {
  const jsonText = await exportFullJsonBackup();
  const dataBytes = strToU8(jsonText);
  const dataSha256 = await sha256Hex(
    dataBytes.buffer.slice(dataBytes.byteOffset, dataBytes.byteOffset + dataBytes.byteLength) as ArrayBuffer
  );
  const parsed = JSON.parse(jsonText) as DayplanaBackupPayload;
  const blobs = await db.blobs.toArray();

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
    appVersion: '4.1.0',
    schemaVersion: 2,
    exportedAt: parsed.exportedAt,
    recordCount: parsed.records.length,
    revisionCount: parsed.revisions.length,
    blobCount: blobs.length,
    dataSha256,
    blobChecksums,
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

  const zipped = zipSync(files, { level: 6 });
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
  zipFile: Blob
): Promise<{ importedRecords: number; importedBlobs: number; verifiedIntegrity: boolean; missingBlobs: string[] }> {
  const ab = await blobToArrayBuffer(zipFile);
  const extracted = unzipSync(new Uint8Array(ab));
  const dataBytes = extracted['dayplana-data.json'];
  if (!dataBytes) {
    throw new Error('Backup ZIP is missing dayplana-data.json');
  }

  // Verify manifest data digest when manifest.json is present
  let verifiedIntegrity = true;
  if (extracted['manifest.json']) {
    const manifest = JSON.parse(strFromU8(extracted['manifest.json'])) as BackupIntegrityManifest;
    const actualDataHash = await sha256Hex(
      dataBytes.buffer.slice(dataBytes.byteOffset, dataBytes.byteOffset + dataBytes.byteLength) as ArrayBuffer
    );
    if (manifest.dataSha256 && actualDataHash !== manifest.dataSha256) {
      throw new Error('Backup integrity check failed: dayplana-data.json SHA-256 mismatch.');
    }
  }

  const jsonText = strFromU8(dataBytes);
  const parsed = JSON.parse(jsonText) as DayplanaBackupPayload;
  const { importedRecords } = await importJsonBackup(jsonText);

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
    await db.blobs.put({
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
