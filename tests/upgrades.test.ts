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
import { normalizeServerUrl, testServerConnection } from '../src/core/sync';
import { describeWeatherCode } from '../src/core/weather';
import { getDailyFact, getFactTopics, OFFLINE_LEARNING_FACTS } from '../src/data/facts';
import {
  computeNextAlarmTrigger,
  doesAlarmMatchMoment,
  formatRepeatDaysSummary,
} from '../src/core/alarmSchedule';
import { ALARM_RINGTONES, getRingtoneLabel } from '../src/core/audio';
import { DIARY_PROMPTS, THOUGHT_PROMPTS } from '../src/data/prompts';
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

  it('normalizes bare LAN / Tailscale URLs and verifies real /api/health connectivity cleanly', async () => {
    expect(normalizeServerUrl('192.168.88.31:3000')).toBe('http://192.168.88.31:3000');
    expect(normalizeServerUrl('100.84.12.5:3000/')).toBe('http://100.84.12.5:3000');
    expect(normalizeServerUrl('dayplana.tail1234.ts.net')).toBe('https://dayplana.tail1234.ts.net');
    expect(normalizeServerUrl('http://192.168.88.31:3000/api/health')).toBe('http://192.168.88.31:3000');
    expect(normalizeServerUrl('')).toBe('');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dayplana-sync-test-'));
    const { app } = await buildDayplanaServer({ dataDir: tmpDir });
    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    try {
      const okRes = await testServerConnection(address);
      expect(okRes.ok).toBe(true);
      expect(okRes.recordCount).toBe(0);
      expect(okRes.latencyMs).toBeGreaterThanOrEqual(0);
    } finally {
      await app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('provides 128+ offline facts across 12 topics with topic filtering and WMO weather descriptions', () => {
    expect(OFFLINE_LEARNING_FACTS.length).toBeGreaterThanOrEqual(128);
    expect(new Set(OFFLINE_LEARNING_FACTS.map((f) => f.id)).size).toBe(OFFLINE_LEARNING_FACTS.length);
    const topics = getFactTopics();
    expect(topics[0]).toBe('All');
    expect(topics.length).toBeGreaterThanOrEqual(13); // All + 12 topics

    const spaceFact = getDailyFact('2026-11-23', 0, [], 'Space');
    expect(spaceFact.fact.topic).toBe('Space');
    expect(spaceFact.totalInDeck).toBeGreaterThanOrEqual(5);

    const customDeck = [{ id: 999, topic: 'Family', text: 'Pizza Friday starts at 6 PM!' }];
    const famFact = getDailyFact('2026-11-23', 0, customDeck, 'Family');
    expect(famFact.fact.text).toContain('Pizza Friday');
    expect(famFact.totalInDeck).toBe(1);

    expect(describeWeatherCode(0).label).toBe('Clear Sky');
    expect(describeWeatherCode(63).emoji).toBe('🌧️');
    expect(describeWeatherCode(95).label).toContain('Thunderstorm');
  });

  it('schedules recurring weekday and specific-date alarms accurately and provides 8+ ringtones & 85+ reflection/thought prompts', () => {
    // Weekday-only alarm (Mon-Fri) at 07:00
    const weekdayAlarm = {
      time: '07:00',
      enabled: true,
      scheduleType: 'recurring',
      repeatDays: [1, 2, 3, 4, 5],
      ringtone: 'classic_bell',
    };
    // Monday 2026-11-23 is day=1 -> matches!
    expect(doesAlarmMatchMoment(weekdayAlarm, '2026-11-23', 1, '07:00')).toBe(true);
    // Sunday 2026-11-22 is day=0 -> must NOT ring!
    expect(doesAlarmMatchMoment(weekdayAlarm, '2026-11-22', 0, '07:00')).toBe(false);
    expect(formatRepeatDaysSummary([1, 2, 3, 4, 5], 'recurring')).toBe('Weekdays');

    // One-time scheduled alarm for 2026-12-03 at 05:30
    const flightAlarm = {
      time: '05:30',
      enabled: true,
      scheduleType: 'once',
      scheduleDate: '2026-12-03',
      ringtone: 'urgent_siren',
    };
    expect(doesAlarmMatchMoment(flightAlarm, '2026-12-02', 3, '05:30')).toBe(false);
    expect(doesAlarmMatchMoment(flightAlarm, '2026-12-03', 4, '05:30')).toBe(true);
    const nextFlight = computeNextAlarmTrigger(flightAlarm, new Date(2026, 10, 23, 20, 0, 0));
    expect(nextFlight?.dateIso).toBe('2026-12-03');
    expect(formatRepeatDaysSummary([], 'once', '2026-12-03')).toBe('Once · 2026-12-03');

    // Ringtones & categorized prompts
    expect(ALARM_RINGTONES.length).toBeGreaterThanOrEqual(8);
    expect(getRingtoneLabel('sunrise_harp')).toContain('Sunrise Harp');
    expect(getRingtoneLabel('blob:abc123', 'MySong.mp3')).toContain('MySong.mp3');
    expect(DIARY_PROMPTS.length).toBeGreaterThanOrEqual(50);
    expect(THOUGHT_PROMPTS.length).toBeGreaterThanOrEqual(35);
  });
});
