import { it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { SyncDatabase } from '../server/db';
import { fuzzySearchRecords } from '../src/core/search';
import { evaluateWorkbook, cellKey, type WorksheetDef } from '../src/core/spreadsheetEngine';
import type { LifeRecord } from '../src/core/types';

it('profiles synthetic 30,000-record search, SQLite synchronization and a 10,000-cell worksheet', () => {
  const samples: Array<Record<string, string | number>> = [];
  function sample<T>(label: string, action: () => T): T {
    const wall = performance.now();
    const cpu = process.cpuUsage();
    const rss = process.memoryUsage().rss;
    const value = action();
    const cpuUsed = process.cpuUsage(cpu);
    const duration = performance.now() - wall;
    samples.push({ case: label, wallMs: +duration.toFixed(1),
      cpuMs: +((cpuUsed.user + cpuUsed.system) / 1000).toFixed(1),
      rssChangeMiB: +((process.memoryUsage().rss - rss) / 1048576).toFixed(1) });
    return value;
  }
  const records: LifeRecord[] = [];
  for (const type of ['task', 'event', 'note'] as const) {
    for (let index = 0; index < 10_000; index++) {
      records.push({
        id: `${type}-${index}`, workspaceId: 'audit', type,
        title: `Audit ${type} ${index}`, tags: ['synthetic'],
        status: 'active', createdAt: '2026-11-24T00:00:00.000Z', updatedAt: '2026-11-24T00:00:00.000Z',
        deletedAt: null, rev: 1, deviceId: 'audit-device',
        payload: type === 'note'
          ? { content: 'Short note about routine planning, collection and observation.', notebookId: 'audit' }
          : type === 'event'
            ? { startDate: '2026-11-24', endDate: '2026-11-24', startTime: '10:00', endTime: '11:00', allDay: false }
            : { estimatedMinutes: 15 },
      } as LifeRecord);
    }
  }
  const found = sample('full text and fuzzy search, first run', () => fuzzySearchRecords(records, 'observation'));
  expect(found.total).toBe(10_000);
  expect(found.hits).toHaveLength(25);
  expect(sample('full text and fuzzy search, repeat', () => fuzzySearchRecords(records, 'observation')).total).toBe(10_000);
  const dataDir = mkdtempSync(path.resolve('scale-db-'));
  const server = new SyncDatabase(dataDir);
  try {
    sample('SQLite writes in 600 batches of 50', () => {
      for (let offset = 0; offset < records.length; offset += 50) {
        server.applyOperations('audit-device', records.slice(offset, offset + 50).map(record => ({
          opId: `op-${record.id}`, recordId: record.id, operation: 'upsert', record: { ...record }, baseRev: 0,
        })));
      }
    });
    const pulled = sample('SQLite pull of all 30,000 records', () => server.pullSince(0));
    expect(pulled.records).toHaveLength(30_000);
    const bytes = sample('serialize entire pull to JSON', () => Buffer.byteLength(JSON.stringify(pulled)));
    console.log('full pull bytes:', bytes);
  } finally {
    server.close();
  }
  const sheet: WorksheetDef = { id: 'benchmark', name: 'Fixture', rows: 500, cols: 20, cells: {} };
  for (let row = 0; row < 500; row++) {
    for (let col = 0; col < 20; col++) {
      sheet.cells[cellKey(col, row)] = { raw: col === 0 ? '2' : `=A${row + 1}+1` };
    }
  }
  const calculated = sample('10,000-cell workbook with 9,500 formulas', () => evaluateWorkbook([sheet]));
  expect(calculated.benchmark.T500.value).toBe(3);
  console.table(samples);
}, 30_000);
