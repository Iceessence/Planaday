import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { blobToArrayBuffer, db, getOrInitSettings } from './db';
import type { AppSettings, LifeRecord, RevisionRecord, TimeLedgerEntry } from './types';

export interface DayplanaBackupPayload {
  format: 'dayplana-backup-v2';
  exportedAt: string;
  settings: AppSettings;
  records: LifeRecord[];
  revisions: RevisionRecord[];
  timeLedger: TimeLedgerEntry[];
  blobsMeta: Array<{ hash: string; mimeType: string; name: string; size: number; createdAt: string }>;
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
 * 1-click full ZIP export including ALL records, revisions, time ledger, settings, AND binary blobs!
 */
export async function exportFullZipBackup(): Promise<Blob> {
  const jsonText = await exportFullJsonBackup();
  const blobs = await db.blobs.toArray();

  const files: Record<string, Uint8Array> = {
    'dayplana-data.json': strToU8(jsonText),
  };

  for (const b of blobs) {
    const ab = b.data ?? (b.blob ? await blobToArrayBuffer(b.blob) : new ArrayBuffer(0));
    files[`blobs/${b.hash}`] = new Uint8Array(ab);
  }

  const zipped = zipSync(files, { level: 6 });
  return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' });
}

export async function importJsonBackup(jsonText: string): Promise<{ importedRecords: number }> {
  const parsed = JSON.parse(jsonText) as DayplanaBackupPayload;
  if (!parsed || parsed.format !== 'dayplana-backup-v2' || !Array.isArray(parsed.records)) {
    throw new Error('Invalid Dayplana backup JSON format.');
  }

  await db.transaction('rw', [db.records, db.revisions, db.timeLedger, db.settings], async () => {
    if (parsed.records.length) await db.records.bulkPut(parsed.records);
    if (parsed.revisions?.length) await db.revisions.bulkPut(parsed.revisions);
    if (parsed.timeLedger?.length) await db.timeLedger.bulkPut(parsed.timeLedger);
    if (parsed.settings) {
      const current = await getOrInitSettings();
      await db.settings.put({ ...parsed.settings, id: 'app-settings', deviceId: current.deviceId });
    }
  });

  return { importedRecords: parsed.records.length };
}

export async function importZipBackup(zipFile: Blob): Promise<{ importedRecords: number; importedBlobs: number }> {
  const ab = await blobToArrayBuffer(zipFile);
  const extracted = unzipSync(new Uint8Array(ab));
  const dataBytes = extracted['dayplana-data.json'];
  if (!dataBytes) {
    throw new Error('Backup ZIP is missing dayplana-data.json');
  }
  const jsonText = strFromU8(dataBytes);
  const parsed = JSON.parse(jsonText) as DayplanaBackupPayload;
  const { importedRecords } = await importJsonBackup(jsonText);

  let importedBlobs = 0;
  for (const meta of parsed.blobsMeta ?? []) {
    const blobBytes = extracted[`blobs/${meta.hash}`];
    if (blobBytes) {
      await db.blobs.put({
        hash: meta.hash,
        mimeType: meta.mimeType,
        name: meta.name,
        size: meta.size,
        createdAt: meta.createdAt,
        data: blobBytes.buffer.slice(blobBytes.byteOffset, blobBytes.byteOffset + blobBytes.byteLength) as ArrayBuffer,
        synced: false,
      });
      importedBlobs++;
    }
  }
  return { importedRecords, importedBlobs };
}

export function triggerBrowserDownload(blobOrText: Blob | string, filename: string, mime = 'application/json') {
  const blob = typeof blobOrText === 'string' ? new Blob([blobOrText], { type: mime }) : blobOrText;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
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

  triggerBrowserDownload(zipBlob, filename, 'application/zip');
  return { ok: true, filename, method: 'download' };
}

export function recordsToCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
}
