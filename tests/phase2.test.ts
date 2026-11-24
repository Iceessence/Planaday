import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/core/db';
import { createRecord, getNoteRevisions, performUndo, updateRecord } from '../src/core/repository';
import { extractInlineEntities, fileThoughtPassage } from '../src/core/mindActions';
import { exportStopwatchLapsToCsv, formatStopwatchMs } from '../src/modules/time/TimeSuiteView';
import type { NotePayload, ThoughtPayload } from '../src/core/types';

describe('Phase 2 — Mind & Time Suite Verification Gate', () => {
  beforeEach(async () => {
    await db.records.clear();
    await db.revisions.clear();
    await db.undoStack.clear();
    await db.redoStack.clear();
    await db.timeLedger.clear();
    await db.settings.clear();
  });

  it('files a highlighted thought passage without losing remaining thought text or original timestamp, with clean Undo', async () => {
    const content = 'Line one stays here.\nFile this brilliant recipe idea.\nFinal paragraph stays intact.';
    const thought = await createRecord<ThoughtPayload>('thought', 'Morning Brainstorm', {
      content,
      source: 'keyboard',
    });
    const originalCreatedAt = thought.createdAt;
    const start = content.indexOf('File this brilliant recipe idea.');
    const end = start + 'File this brilliant recipe idea.'.length;

    const filed = await fileThoughtPassage(thought.id, start, end, {
      mode: 'move',
      targetType: 'note',
      notebookId: 'nb_ideas',
      dateIso: '2026-11-23',
    });

    expect(filed).not.toBeNull();
    expect(filed!.createdRecord.type).toBe('note');
    expect((filed!.createdRecord.payload as NotePayload).content).toBe('File this brilliant recipe idea.');

    const updatedThought = (await db.records.get(thought.id)) as unknown as {
      createdAt: string;
      payload: ThoughtPayload;
    };
    expect(updatedThought.createdAt).toBe(originalCreatedAt);
    expect(updatedThought.payload.content).toContain('Line one stays here.');
    expect(updatedThought.payload.content).toContain('Final paragraph stays intact.');
    expect(updatedThought.payload.content).not.toContain('File this brilliant recipe idea.');

    // Undo restores the exact original thought text atomically
    await performUndo();
    const afterUndo = (await db.records.get(thought.id)) as unknown as { payload: ThoughtPayload };
    expect(afterUndo.payload.content).toBe(content);
  });

  it('tracks 20+ timestamped note revisions and extracts [[WikiLinks]], @mentions, and #tags', async () => {
    const note = await createRecord<NotePayload>('note', 'Project Notes', {
      notebookId: 'nb_work',
      writtenForDate: '2026-11-23',
      content: 'Version 0 referencing [[Quarterly Plan]] with @Alex #focus',
    });

    const entities = extractInlineEntities(note.payload.content);
    expect(entities.wikiLinks).toEqual(['Quarterly Plan']);
    expect(entities.mentions).toEqual(['Alex']);
    expect(entities.tags).toEqual(['focus']);

    for (let i = 1; i <= 22; i++) {
      await updateRecord<NotePayload>(note.id, (c) => ({
        ...c,
        payload: { ...c.payload, content: `Version ${i} content` },
      }));
    }

    const revs = await getNoteRevisions(note.id);
    expect(revs.length).toBeGreaterThanOrEqual(20);
    expect(revs[0].content).toBe('Version 22 content');
  });

  it('persists 3 concurrent timers via target timestamps so they reconstruct accurately after refresh', async () => {
    const now = Date.now();
    await createRecord('timer', 'Oven', { durationSec: 18 * 60, targetEndMs: now + 18 * 60 * 1000, remainingSecWhenPaused: 18 * 60, kind: 'cooking' });
    await createRecord('timer', 'Washer', { durationSec: 48 * 60, targetEndMs: now + 48 * 60 * 1000, remainingSecWhenPaused: 48 * 60, kind: 'countdown' });
    await createRecord('timer', 'Deep Work', { durationSec: 25 * 60, targetEndMs: now + 25 * 60 * 1000, remainingSecWhenPaused: 25 * 60, kind: 'pomodoro' });

    const reloaded = await db.records.where('type').equals('timer').toArray();
    expect(reloaded).toHaveLength(3);
    const oven = reloaded.find((r) => r.title === 'Oven')!;
    const remSec = Math.round(((oven.payload as { targetEndMs: number }).targetEndMs - Date.now()) / 1000);
    expect(remSec).toBeGreaterThan(1000);
    expect(remSec).toBeLessThanOrEqual(18 * 60);
  });

  it('formats precision stopwatch HH:MM:SS.cc and exports laps to CSV with deltas', () => {
    expect(formatStopwatchMs(3661250)).toBe('01:01:01.25');
    const csv = exportStopwatchLapsToCsv([
      { index: 1, splitMs: 60000, lapMs: 60000 },
      { index: 2, splitMs: 118500, lapMs: 58500 },
      { index: 3, splitMs: 181500, lapMs: 63000 },
    ]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('Lap,LapTime,SplitTime,DeltaVsPrevMs,DeltaVsAvgMs');
    expect(lines[2]).toContain('00:00:58.50');
    expect(lines[2]).toContain('-1500');
  });
});
