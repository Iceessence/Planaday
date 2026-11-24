import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/core/db';
import { createRecord, updateRecord } from '../src/core/repository';
import { parseQuickCapture } from '../src/core/capture';
import {
  completeActionAtomically,
  computeChorePunctualityStats,
  findFreeTimeGaps,
} from '../src/core/planActions';
import { buildDayplanaServer } from '../server/index';
import { isMedicationRefillDue } from '../src/modules/life/HouseholdHealthView';
import { isRecordVisibleForProfile } from '../src/core/AppContext';
import type { CalendarEventPayload, ChorePayload, LifeRecord } from '../src/core/types';

describe('Upgrades — Seconds Timers, Post-Now Free Time, Chore Punctuality, Event Reviews & Server Push', () => {
  beforeEach(async () => {
    await db.records.clear();
    await db.undoStack.clear();
    await db.outbox.clear();
    await db.settings.clear();
  });

  it('parses seconds and compound minute+second timers in Quick Capture', () => {
    const p1 = parseQuickCapture('timer 45s Plank', '2026-11-23');
    expect(p1.targetType).toBe('timer');
    expect(p1.durationSec).toBe(45);
    expect(p1.title).toBe('Plank');

    const p2 = parseQuickCapture('timer 1m 30s Steep green tea', '2026-11-23');
    expect(p2.targetType).toBe('timer');
    expect(p2.durationSec).toBe(90);
    expect(p2.title).toBe('Steep green tea');
  });

  it('filters Free Time gaps strictly AFTER current time so past morning slots are never shown', () => {
    // Morning event 09:00-10:00, afternoon event 15:00-16:00. Current time is 14:12 (852 min).
    const gaps = findFreeTimeGaps(
      [
        { startMin: 9 * 60, endMin: 10 * 60 },
        { startMin: 15 * 60, endMin: 16 * 60 },
      ],
      8 * 60,
      21 * 60,
      30,
      14 * 60 + 12 // 2:12 PM -> rounds up to 2:15 PM (855 min)
    );
    expect(gaps.length).toBe(2);
    expect(gaps[0].startMin).toBe(14 * 60 + 15); // 2:15 PM -> 3:00 PM (45m)
    expect(gaps[0].endMin).toBe(15 * 60);
    expect(gaps[1].startMin).toBe(16 * 60); // 4:00 PM -> 9:00 PM
    // Confirm ZERO morning gaps before 14:15 appear!
    expect(gaps.every((g) => g.startMin >= 14 * 60 + 15)).toBe(true);
  });

  it('tracks chore on-time punctuality percentages and event "How did it go?" retrospectives', async () => {
    const chore = await createRecord<ChorePayload>('chore', 'Take out bins', {
      room: 'Kitchen',
      choreMode: 'after_completion',
      intervalDays: 3,
      difficulty: 1,
      checklist: [],
      linkedSupplies: [],
      nextDueDate: '2026-11-20',
      completions: [],
    });

    // Completion 1: Done ON TIME (Nov 20 when due Nov 20) -> nextDue = Nov 23
    await completeActionAtomically(chore.id, { completedDateIso: '2026-11-20' });
    // Completion 2: Done 2 days LATE (Nov 25 when due Nov 23) -> nextDue = Nov 28
    await completeActionAtomically(chore.id, { completedDateIso: '2026-11-25' });

    const reloadedChore = (await db.records.get(chore.id)) as unknown as typeof chore;
    const stats = computeChorePunctualityStats([reloadedChore]);
    expect(stats.totalTracked).toBe(2);
    expect(stats.onTimeCount).toBe(1);
    expect(stats.lateCount).toBe(1);
    expect(stats.onTimePct).toBe(50);

    // Event retrospective
    const ev = await createRecord<CalendarEventPayload>('event', 'Dentist Checkup', {
      startDate: '2026-11-23',
      endDate: '2026-11-23',
      startTime: '09:00',
      endTime: '10:00',
      allDay: false,
      floating: false,
      timeZone: 'America/Los_Angeles',
      style: 'soft',
      eventStatus: 'confirmed',
    });
    await updateRecord<CalendarEventPayload>(ev.id, (c) => ({
      ...c,
      payload: {
        ...c.payload,
        retrospective: { outcome: 'Great', rating: 5, note: 'No cavities!', loggedAt: new Date().toISOString() },
      },
    }));
    const evAfter = (await db.records.get(ev.id)) as unknown as typeof ev;
    expect(evAfter.payload.retrospective?.outcome).toBe('Great');
    expect(evAfter.payload.retrospective?.rating).toBe(5);
  });

  it('persists background Docker server push configuration (/api/push-config) cleanly in SQLite', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dayplana-push-test-'));
    const { app } = await buildDayplanaServer({ dataDir: tmpDir });
    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    try {
      const postRes = await fetch(`${address}/api/push-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ntfyPushUrl: 'https://ntfy.sh/dayplana-demo-topic',
          timeZone: 'America/Los_Angeles',
          eventLeadMinutes: 30,
          choreReminderTime: '08:30',
          notifyEvents: true,
          notifyChores: true,
        }),
      });
      expect(postRes.ok).toBe(true);
      const getRes = await fetch(`${address}/api/push-config`);
      const cfg = (await getRes.json()) as {
        ntfyPushUrl: string;
        timeZone: string;
        eventLeadMinutes: number;
        choreReminderTime: string;
      };
      expect(cfg.ntfyPushUrl).toBe('https://ntfy.sh/dayplana-demo-topic');
      expect(cfg.timeZone).toBe('America/Los_Angeles');
      expect(cfg.eventLeadMinutes).toBe(30);
      expect(cfg.choreReminderTime).toBe('08:30');
    } finally {
      await app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('tracks medication refill-by-date even when extra doses remain from skipped days', () => {
    // 18 doses left (> 7 threshold), BUT refillByDate is 4 days away (<= 7 daysBefore) -> MUST trigger refill!
    const byDate = isMedicationRefillDue(
      {
        pillsRemaining: 18,
        refillAlertDoses: 7,
        refillByDate: '2026-11-27',
        refillAlertDaysBefore: 7,
      },
      '2026-11-23'
    );
    expect(byDate.due).toBe(true);
    expect(byDate.reason).toContain('18 doses left');

    // Plenty of doses & far refill date -> NOT due
    const notDue = isMedicationRefillDue(
      {
        pillsRemaining: 25,
        refillAlertDoses: 7,
        refillByDate: '2026-12-20',
        refillAlertDaysBefore: 7,
      },
      '2026-11-23'
    );
    expect(notDue.due).toBe(false);
  });

  it('isolates family member profiles while exposing shared items across profiles', () => {
    const baseRec: LifeRecord = {
      id: 'rec_1',
      workspaceId: 'ws_personal',
      type: 'event',
      title: 'Soccer Practice',
      status: 'active',
      createdAt: '2026-11-23T00:00:00Z',
      updatedAt: '2026-11-23T00:00:00Z',
      deletedAt: null,
      ownerProfileId: 'prof_mom',
      sharedWithAll: false,
      sharedWithProfileIds: [],
      tags: [],
      links: [],
      payload: {},
      rev: 1,
      deviceId: 'dev_1',
    };
    expect(isRecordVisibleForProfile(baseRec, 'all')).toBe(true);
    expect(isRecordVisibleForProfile(baseRec, 'prof_mom')).toBe(true);
    expect(isRecordVisibleForProfile(baseRec, 'prof_dad')).toBe(false);

    // Sharing with Everyone makes it visible to Dad too
    expect(isRecordVisibleForProfile({ ...baseRec, sharedWithAll: true }, 'prof_dad')).toBe(true);
    // Sharing specifically with Dad makes it visible to Dad but not Kid
    const sharedDad = { ...baseRec, sharedWithProfileIds: ['prof_dad'] };
    expect(isRecordVisibleForProfile(sharedDad, 'prof_dad')).toBe(true);
    expect(isRecordVisibleForProfile(sharedDad, 'prof_kid')).toBe(false);
  });
});
