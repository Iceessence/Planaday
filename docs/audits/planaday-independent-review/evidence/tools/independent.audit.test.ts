import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildDayplanaServer } from '../server/index';
import { db, getOrInitSettings, storeBlob, updateSettings } from '../src/core/db';
import { createRecord, updateRecord } from '../src/core/repository';
import { runSyncCycle } from '../src/core/sync';
import { exportFullZipBackup, importZipBackup } from '../src/core/backup';
import { evaluateMathExpression, findNumericalRoots, numericalIntegral } from '../src/core/mathEngine';
import { evaluateWorkbook, exportSheetToDelimited, importDelimitedToSheet, type WorksheetDef } from '../src/core/spreadsheetEngine';
import { parseIcsCalendar } from '../src/core/ics';
import { expandRecurrenceDates } from '../src/core/recurrence';

beforeEach(async () => {
  await Promise.all(db.tables.map(table => table.clear()));
});

const scratch = fs.mkdtempSync(path.resolve('independent-db-'));
const opened: Array<Awaited<ReturnType<typeof buildDayplanaServer>>['app']> = [];
afterEach(async () => {
  while (opened.length) await opened.pop()!.close();
});

async function startServer(dir: string) {
  const server = await buildDayplanaServer({ dataDir: path.join(scratch, dir) });
  opened.push(server.app);
  return server.app;
}

function through(server: Awaited<ReturnType<typeof startServer>>, trace: string[] = []): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET') as 'GET' | 'PUT' | 'POST';
    trace.push(`${method} ${url.pathname}`);
    const response = await server.inject({
      method,
      url: url.pathname + url.search,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      payload: init?.body instanceof ArrayBuffer ? Buffer.from(init.body) : init?.body as string | undefined,
    });
    return new Response(Uint8Array.from(response.rawPayload), { status: response.statusCode, headers: response.headers as Record<string, string> });
  };
}

async function setSync(seq = 0) {
  await updateSettings({ operatingMode: 'docker-sync', syncServerUrl: 'http://127.0.0.1:35191', lastSyncSeq: seq, syncFallbackUrl: '' });
}

async function createAuditNote(content: string) {
  return createRecord('note', 'Audit note', { content, notebookId: 'audit' });
}

describe('independent Planaday data and correctness checks', () => {
  it('preserves an ordinary record, a correctly hashed blob and a readable SQLite snapshot after server reopen', async () => {
    const app = await startServer('restart');
    const bytes = Buffer.from('synthetic attachment');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const note = await createAuditNote('Persist this across restart');
    const pushed = await app.inject({
      method: 'POST', url: '/api/sync/push',
      payload: { deviceId: note.deviceId, operations: [{ opId: 'rest-1', recordId: note.id, operation: 'upsert', record: note, baseRev: 0 }] },
    });
    expect(pushed.json().acceptedOpIds).toEqual(['rest-1']);
    const blob = await app.inject({
      method: 'PUT', url: `/api/blobs/${hash}`, headers: { 'content-type': 'application/octet-stream' }, payload: bytes,
    });
    expect(blob.statusCode).toBe(200);
    const backup = await app.inject({ method: 'POST', url: '/api/storage/backup' });
    expect(backup.statusCode).toBe(200);
    const snapshot = new DatabaseSync(backup.json().filePath, { readOnly: true });
    try {
      expect(snapshot.prepare('PRAGMA integrity_check').get()).toMatchObject({ integrity_check: 'ok' });
      expect(snapshot.prepare('SELECT COUNT(*) AS records FROM records').get()).toMatchObject({ records: 1 });
    } finally {
      snapshot.close();
    }
    await opened.pop()!.close();
    const restarted = await startServer('restart');
    expect((await restarted.inject('/api/sync/pull?since=0')).json().records).toHaveLength(1);
    expect((await restarted.inject(`/api/blobs/${hash}`)).rawPayload.equals(bytes)).toBe(true);
  });

  it('downloads attachment bytes on a clean second client when its note initially syncs', async () => {
    const app = await startServer('fresh-client');
    const requests: string[] = [];
    const fetchLocal = through(app, requests);
    await setSync();
    const attachment = await storeBlob(new Blob(['ordinary text fixture'], { type: 'application/octet-stream' }), 'audit.txt');
    const note = await createRecord('note', 'Attachment note', { content: 'second client', attachmentBlobIds: [attachment.hash] });
    expect((await runSyncCycle(fetchLocal)).status).toBe('synced');
    expect((await app.inject(`/api/blobs/${attachment.hash}`)).statusCode).toBe(200);
    await Promise.all(db.tables.map(table => table.clear()));
    await setSync();
    expect((await runSyncCycle(fetchLocal)).status).toBe('synced');
    expect(await db.records.get(note.id)).toBeDefined();
    console.log('fresh device requests:', requests.join(', '));
    expect(await db.blobs.get(attachment.hash)).toBeDefined();
  });

  it('retains two disjoint edits to the same record started concurrently', async () => {
    const note = await createAuditNote('initial body');
    await Promise.all([
      updateRecord(note.id, { title: 'new title' }, { skipUndo: true, skipRevision: true }),
      updateRecord(note.id, current => ({ ...current, payload: { ...current.payload, content: 'new body' } }), { skipUndo: true, skipRevision: true }),
    ]);
    const [record, queued] = await Promise.all([db.records.get(note.id), db.outbox.where('recordId').equals(note.id).toArray()]);
    console.log('parallel update:', { title: record?.title, content: record?.payload.content, rev: record?.rev, queued: queued.length });
    expect(record).toMatchObject({ title: 'new title', payload: { content: 'new body' }, rev: note.rev + 2 });
  });

  it('reconciles a restored local ZIP into an empty replacement server', async () => {
    await setSync(300);
    const note = await createAuditNote('backup transfer');
    const zip = await exportFullZipBackup();
    await Promise.all(db.tables.map(table => table.clear()));
    await importZipBackup(zip);
    const imported = await getOrInitSettings();
    expect(await db.records.get(note.id)).toBeDefined();
    const app = await startServer('replacement');
    const result = await runSyncCycle(through(app));
    const remote = (await app.inject('/api/sync/pull?since=0')).json();
    console.log('replacement server:', { importedSeq: imported.lastSyncSeq, status: result.status, pending: result.pendingCount, records: remote.records.length });
    expect(remote.records.some((record: { id: string }) => record.id === note.id)).toBe(true);
  });

  it('round-trips CSV containing a comma, quote, and embedded newline as ordinary cell text', () => {
    const original: WorksheetDef = { id: 'file', name: 'Sales', rows: 1, cols: 3, cells: {
      A1: { raw: 'East, West' }, B1: { raw: 'She said "hi"' }, C1: { raw: 'line one\nline two' },
    } };
    const csv = exportSheetToDelimited(original, evaluateWorkbook([original]).file);
    const imported = importDelimitedToSheet(csv);
    console.log('CSV imported cells:', imported.cells);
    expect(imported.cells).toEqual(original.cells);
  });

  it('evaluates arithmetic, fractions, degree trig and a smooth integral against known values', () => {
    expect(evaluateMathExpression('-2^2 + (1/2)')).toBe(-3.5);
    expect(evaluateMathExpression('sin(30)', { angleUnit: 'deg' })).toBeCloseTo(0.5, 10);
    expect(numericalIntegral('x^2', 0, 3)).toBeCloseTo(9, 10);
  });

  it('does not report a vertical discontinuity as a root', () => {
    const roots = findNumericalRoots('1/(x-0.123)', -1, 1);
    expect(roots).toEqual([]);
  });

  it('can find a tangent root without a sign change inside the sampling intervals', () => {
    const roots = findNumericalRoots('(x-0.123)^2', -1, 1);
    expect(roots[0]).toBeCloseTo(0.123, 3);
  });

  it('preserves exclusive dates and recurrence exceptions from a standard all-day calendar fixture', () => {
    const [event] = parseIcsCalendar([
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:synthetic-all-day',
      'DTSTART;VALUE=DATE:20260307', 'DTEND;VALUE=DATE:20260309', 'RRULE:FREQ=DAILY;COUNT=4',
      'EXDATE;VALUE=DATE:20260308', 'SUMMARY:Two-day sample visit', 'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n'), 'America/Los_Angeles');
    expect(event.payload).toMatchObject({ startDate: '2026-03-07', endDate: '2026-03-08', allDay: true });
    expect(event.recurrence?.exceptions).toEqual(['2026-03-08']);
    expect(expandRecurrenceDates('2026-03-07', event.recurrence, {
      rangeStart: '2026-03-07',
      rangeEnd: '2026-03-20',
    })).toEqual(['2026-03-07', '2026-03-09', '2026-03-10']);
  });
});
