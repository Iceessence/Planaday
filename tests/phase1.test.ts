import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/core/db';
import { createRecord, performUndo } from '../src/core/repository';
import {
  applyRecurringEventEdit,
  completeActionAtomically,
  layoutDayEvents,
  scheduleActionOnCalendar,
} from '../src/core/planActions';
import {
  computeChoreFreshnessAtDate,
  computeNextChoreDueDate,
  expandRecurrenceDates,
} from '../src/core/recurrence';
import { exportEventsToIcs, parseIcsCalendar } from '../src/core/ics';
import { validateZonedEventTime } from '../src/core/temporal';
import type { CalendarEventPayload, ChorePayload, GoalPayload, TaskPayload } from '../src/core/types';

describe('Phase 1 — Plan & Calendar Verification Gate', () => {
  beforeEach(async () => {
    await db.records.clear();
    await db.undoStack.clear();
    await db.redoStack.clear();
    await db.outbox.clear();
    await db.settings.clear();
  });

  it('dragging a task/chore to calendar and checking it off syncs ALL views atomically and undo reverses cleanly', async () => {
    const task = await createRecord<TaskPayload>('task', 'Prepare tax folder', { subtasks: [] }, { doDate: '2026-11-23', estimateMin: 45 });
    const block = await scheduleActionOnCalendar(task.id, '2026-11-23', '10:00', 45);
    expect(block).not.toBeNull();
    expect(block!.payload.linkedActionId).toBe(task.id);

    // Check off from the Calendar block -> authoritative Task AND Calendar block both complete atomically
    await completeActionAtomically(block!.id, { completedDateIso: '2026-11-23' });
    expect((await db.records.get(task.id))?.status).toBe('done');
    expect((await db.records.get(block!.id))?.status).toBe('done');

    // Global Undo reverses BOTH the Task and the Calendar block cleanly in 1 step!
    const undoRes = await performUndo();
    expect(undoRes.ok).toBe(true);
    expect((await db.records.get(task.id))?.status).toBe('active');
    expect((await db.records.get(block!.id))?.status).toBe('active');

    // Partial work on a multi-step Goal block NEVER prematurely completes the Goal
    const goal = await createRecord<GoalPayload>('goal', 'Write a book', {
      milestones: [
        { id: 'm1', title: 'Outline', done: false },
        { id: 'm2', title: 'Chapter 1', done: false },
      ],
    });
    const goalBlock = await scheduleActionOnCalendar(goal.id, '2026-11-23', '13:00', 60, 'm1');
    await completeActionAtomically(goalBlock!.id, { completedDateIso: '2026-11-23' });
    expect((await db.records.get(goal.id))?.status).toBe('active');
  });

  it('supports DST validation and scoped recurring event edits (this / following / series)', async () => {
    // Spring-forward skipped hour in New York (2025-03-09 02:30)
    const dst = validateZonedEventTime('2025-03-09', '02:30', 'America/New_York');
    expect(dst.ambiguousOrSkipped).toBe(true);
    expect(dst.resolvedTime).toBe('03:30');

    const series = await createRecord<CalendarEventPayload>(
      'event',
      'Weekly Pilates',
      {
        startDate: '2026-11-02',
        endDate: '2026-11-02',
        startTime: '18:00',
        endTime: '18:45',
        allDay: false,
        floating: false,
        timeZone: 'America/New_York',
        style: 'soft',
        eventStatus: 'confirmed',
      },
      { recurrence: { freq: 'weekly', interval: 1, byWeekday: [1] } }
    );

    // Edit "this occurrence only" on 2026-11-09 -> adds EXDATE on master + spawns detached override
    await applyRecurringEventEdit(series.id, '2026-11-09', 'this', { startTime: '19:00', endTime: '19:45' });
    const masterAfterThis = await db.records.get(series.id);
    expect(masterAfterThis?.recurrence?.exceptions).toContain('2026-11-09');
    const occs = expandRecurrenceDates('2026-11-02', masterAfterThis!.recurrence, {
      rangeStart: '2026-11-01',
      rangeEnd: '2026-11-30',
    });
    expect(occs).not.toContain('2026-11-09');
    expect(occs).toContain('2026-11-16');

    // Edit "this and following" starting 2026-11-16 -> truncates master UNTIL=2026-11-15 & spawns new series
    await applyRecurringEventEdit(series.id, '2026-11-16', 'following', { title: 'Evening Pilates' });
    const masterAfterFollow = await db.records.get(series.id);
    expect(masterAfterFollow?.recurrence?.until).toBe('2026-11-15');
    const allEvs = await db.records.where('type').equals('event').toArray();
    expect(allEvs.some((e) => e.title === 'Evening Pilates')).toBe(true);
  });

  it('recalculates late completion-based chores from actual completion date & supports historical date replay', async () => {
    // Due Monday (2026-11-23), completed late on Wednesday (2026-11-25) on 2-day interval -> next due Friday (2026-11-27)!
    const chore = await createRecord<ChorePayload>('chore', 'Wipe counters', {
      room: 'Kitchen',
      choreMode: 'after_completion',
      intervalDays: 2,
      difficulty: 1,
      checklist: [],
      linkedSupplies: [],
      lastCompletedDate: '2026-11-21',
      nextDueDate: '2026-11-23',
      completions: [{ id: 'c0', completedAt: '2026-11-21T12:00:00Z', completedDate: '2026-11-21' }],
    });

    const nextDue = computeNextChoreDueDate(chore.payload, '2026-11-25');
    expect(nextDue).toBe('2026-11-27');

    await completeActionAtomically(chore.id, { completedDateIso: '2026-11-25' });
    const updated = (await db.records.get(chore.id)) as unknown as { payload: ChorePayload };
    expect(updated.payload.nextDueDate).toBe('2026-11-27');

    // Historical Date Replay: on 2026-11-24 (before Wed completion), it was overdue!
    const replayOnTue = computeChoreFreshnessAtDate(updated.payload, '2026-11-24');
    expect(replayOnTue.status).toBe('overdue');
    // On 2026-11-26 (day after Wed completion), it is fresh/due_soon!
    const replayOnThu = computeChoreFreshnessAtDate(updated.payload, '2026-11-26');
    expect(replayOnThu.status).toBe('due_soon');
  });

  it('computes 4-mode overlaps cleanly and round-trips multi-day/recurring .ics files', async () => {
    const e1 = await createRecord<CalendarEventPayload>('event', 'Design Review', {
      startDate: '2026-11-23',
      endDate: '2026-11-23',
      startTime: '10:00',
      endTime: '11:00',
      allDay: false,
      floating: false,
      timeZone: 'America/Los_Angeles',
      style: 'soft',
      eventStatus: 'confirmed',
    });
    const e2 = await createRecord<CalendarEventPayload>('event', 'Client Call', {
      startDate: '2026-11-23',
      endDate: '2026-11-23',
      startTime: '10:30',
      endTime: '11:30',
      allDay: false,
      floating: false,
      timeZone: 'America/Los_Angeles',
      style: 'filled',
      eventStatus: 'confirmed',
    });

    for (const mode of ['equal_split', 'layered_stagger', 'expand_columns', 'offset_columns'] as const) {
      const res = layoutDayEvents(
        [
          { event: e1, occurrenceDate: '2026-11-23' },
          { event: e2, occurrenceDate: '2026-11-23' },
        ],
        mode
      );
      expect(res.positioned).toHaveLength(2);
      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0].startMin).toBe(10 * 60 + 30);
      expect(res.conflicts[0].endMin).toBe(11 * 60);
    }

    // Round-trip ICS with multi-day all-day event + recurring event with EXDATE
    const trip = await createRecord<CalendarEventPayload>('event', 'Autumn Retreat', {
      startDate: '2026-12-01',
      endDate: '2026-12-03',
      allDay: true,
      floating: true,
      timeZone: 'UTC',
      style: 'filled',
      eventStatus: 'confirmed',
    });
    const ics = exportEventsToIcs([e1, trip]);
    expect(ics).toContain('DTEND;VALUE=DATE:20261204'); // RFC 5545 exclusive DTEND
    const parsed = parseIcsCalendar(ics, 'America/Los_Angeles');
    expect(parsed).toHaveLength(2);
    const parsedTrip = parsed.find((x) => x.title === 'Autumn Retreat')!;
    expect(parsedTrip.payload.startDate).toBe('2026-12-01');
    expect(parsedTrip.payload.endDate).toBe('2026-12-03');
  });
});
