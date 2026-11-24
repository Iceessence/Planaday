import { createId, db, getOrInitSettings } from './db';
import { batchApplyChanges, createRecord } from './repository';
import { computeNextChoreDueDate } from './recurrence';
import { addDaysIso } from './temporal';
import type {
  CalendarEventPayload,
  ChorePayload,
  GoalPayload,
  LifeRecord,
  TaskPayload,
  UndoEntry,
} from './types';

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function minutesToTime(totalMin: number): string {
  const clamped = ((Math.round(totalMin) % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Drag-Anything-to-Timeline (Section 03.02):
 * Schedules any task, chore, habit, goal milestone, bill, or meal-prep step onto a calendar slot
 * creating a linked time block (preserving one authoritative source record; multiple sessions allowed).
 */
export async function scheduleActionOnCalendar(
  sourceRecordId: string,
  dateIso: string,
  startTime: string,
  durationMin?: number,
  milestoneId?: string
): Promise<LifeRecord<CalendarEventPayload> | null> {
  const source = await db.records.get(sourceRecordId);
  if (!source) return null;
  const settings = await getOrInitSettings();
  const dur = Math.max(15, durationMin ?? source.estimateMin ?? 30);
  const endTime = minutesToTime(timeToMinutes(startTime) + dur);

  let label = source.title;
  if (milestoneId && source.type === 'goal') {
    const ms = (source.payload as unknown as GoalPayload).milestones?.find((m) => m.id === milestoneId);
    if (ms) label = `${source.title}: ${ms.title}`;
  }

  return createRecord<CalendarEventPayload>(
    'event',
    label,
    {
      startDate: dateIso,
      endDate: dateIso,
      startTime,
      endTime,
      allDay: false,
      floating: false,
      timeZone: settings.defaultTimeZone,
      style: 'soft',
      emoji: source.type === 'chore' ? '🧹' : source.type === 'goal' ? '🎯' : '✅',
      eventStatus: 'confirmed',
      linkedActionId: source.id,
      notes: milestoneId ? `Milestone:${milestoneId}` : undefined,
    },
    {
      category: source.category ?? source.type,
      color: source.color ?? (source.type === 'chore' ? '#4f7a65' : '#a97434'),
      tags: [...source.tags],
      links: [{ targetId: source.id, targetType: source.type, relation: 'scheduled_from', label: source.title }],
    },
    { undoLabel: `Scheduled "${label}" on ${dateIso} ${startTime}` }
  );
}

/**
 * Atomically completes (or uncompletes) a Task, Chore, or Linked Calendar Block across ALL views in ONE undo step!
 * - For Chores: recalculates nextDueDate from actualCompletionDate and appends to completion ledger.
 * - For Multi-step Goals: only logs time or completes the targeted milestone—NEVER prematurely completes the parent Goal!
 * - Updates linked calendar blocks so every view reflects completion atomically.
 */
export async function completeActionAtomically(
  recordId: string,
  options: {
    completedDateIso: string;
    minutesLogged?: number;
    timeLogOnly?: boolean;
    assigneeId?: string | null;
  }
): Promise<void> {
  const settings = await getOrInitSettings();
  const now = new Date().toISOString();

  await batchApplyChanges(`Completed action`, async () => {
    const rec = await db.records.get(recordId);
    if (!rec) return [];

    // If clicked from a linked Calendar timeblock, resolve to the authoritative ActionItem
    let target = rec;
    if (rec.type === 'event') {
      const linkedId = (rec.payload as unknown as CalendarEventPayload).linkedActionId;
      if (linkedId) {
        const linked = await db.records.get(linkedId);
        if (linked) target = linked;
      }
    }

    const changes: UndoEntry['changes'] = [];

    if (options.timeLogOnly) {
      if (target.type === 'task') {
        const tp = target.payload as unknown as TaskPayload;
        const updated: LifeRecord = {
          ...target,
          payload: { ...tp, actualMinutes: (tp.actualMinutes ?? 0) + (options.minutesLogged ?? 30) },
          updatedAt: now,
          rev: target.rev + 1,
          deviceId: settings.deviceId,
        };
        changes.push({ recordId: target.id, before: target, after: updated });
      }
      return changes;
    }

    if (target.type === 'chore') {
      const cp = target.payload as unknown as ChorePayload;
      const nextDueDate = computeNextChoreDueDate(cp, options.completedDateIso);
      const nextChore: LifeRecord = {
        ...target,
        status: 'active', // Chores remain active recurring items with updated freshness/due date
        updatedAt: now,
        rev: target.rev + 1,
        deviceId: settings.deviceId,
        payload: {
          ...cp,
          lastCompletedDate: options.completedDateIso,
          nextDueDate,
          snoozedUntil: null,
          usageCount: 0,
          checklist: (cp.checklist ?? []).map((c) => ({ ...c, done: false })),
          completions: [
            ...(cp.completions ?? []),
            {
              id: createId('cmp'),
              completedAt: now,
              completedDate: options.completedDateIso,
              assigneeId: options.assigneeId ?? target.assigneeId ?? null,
              minutesSpent: options.minutesLogged ?? target.estimateMin ?? 15,
            },
          ],
        },
      };
      changes.push({ recordId: target.id, before: target, after: nextChore });
    } else if (target.type === 'goal') {
      // Partial work on a scheduled goal block NEVER prematurely completes a multi-step goal!
      return changes;
    } else {
      const nextStatus = target.status === 'done' ? 'active' : 'done';
      const tp = (target.payload ?? {}) as Record<string, unknown>;
      const updatedTarget: LifeRecord = {
        ...target,
        status: nextStatus,
        updatedAt: now,
        rev: target.rev + 1,
        deviceId: settings.deviceId,
        payload: {
          ...tp,
          completedAt: nextStatus === 'done' ? now : null,
          boardColumn: nextStatus === 'done' ? 'done' : 'next',
          actualMinutes:
            options.minutesLogged !== undefined
              ? (Number(tp.actualMinutes) || 0) + options.minutesLogged
              : tp.actualMinutes,
        },
      };
      changes.push({ recordId: target.id, before: target, after: updatedTarget });
    }

    // Atomically update all Calendar blocks linked to this ActionItem (and cancel reminders)
    const allEvents = await db.records.where('type').equals('event').toArray();
    for (const ev of allEvents) {
      if (ev.deletedAt) continue;
      const ep = ev.payload as unknown as CalendarEventPayload;
      if (ep.linkedActionId === target.id) {
        const targetDone = target.type === 'chore' ? true : target.status !== 'done';
        const nextEv: LifeRecord = {
          ...ev,
          status: targetDone ? 'done' : 'active',
          updatedAt: now,
          rev: ev.rev + 1,
          deviceId: settings.deviceId,
          payload: {
            ...ep,
            remindersMin: targetDone ? [] : ep.remindersMin,
          },
        };
        changes.push({ recordId: ev.id, before: ev, after: nextEv });
      }
    }

    return changes;
  });
}

export type RecurringEditScope = 'this' | 'following' | 'series';

/**
 * Edits a recurring event according to explicit user-selected scope (Section 08.03):
 * - 'this': adds occurrenceDate to master's EXDATE exceptions and spawns a detached single override
 * - 'following': sets master UNTIL = occurrenceDate - 1 day and spawns a new recurring series from occurrenceDate
 * - 'series': updates the master series directly
 */
export async function applyRecurringEventEdit(
  masterEventId: string,
  occurrenceDate: string,
  scope: RecurringEditScope,
  patch: Partial<CalendarEventPayload> & { title?: string }
): Promise<void> {
  const settings = await getOrInitSettings();
  const now = new Date().toISOString();

  await batchApplyChanges(`Updated recurring event (${scope})`, async () => {
    const master = (await db.records.get(masterEventId)) as LifeRecord<CalendarEventPayload> | undefined;
    if (!master) return [];
    const changes: UndoEntry['changes'] = [];

    if (scope === 'series' || !master.recurrence) {
      const updated: LifeRecord<CalendarEventPayload> = {
        ...master,
        title: patch.title ?? master.title,
        payload: { ...master.payload, ...patch },
        updatedAt: now,
        rev: master.rev + 1,
        deviceId: settings.deviceId,
      };
      changes.push({ recordId: master.id, before: master as LifeRecord, after: updated as LifeRecord });
      return changes;
    }

    if (scope === 'this') {
      const existingExceptions = new Set(master.recurrence.exceptions ?? []);
      existingExceptions.add(occurrenceDate);
      const updatedMaster: LifeRecord<CalendarEventPayload> = {
        ...master,
        recurrence: { ...master.recurrence, exceptions: Array.from(existingExceptions) },
        updatedAt: now,
        rev: master.rev + 1,
        deviceId: settings.deviceId,
      };
      changes.push({ recordId: master.id, before: master as LifeRecord, after: updatedMaster as LifeRecord });

      const detached: LifeRecord<CalendarEventPayload> = {
        ...master,
        id: createId('ev'),
        title: patch.title ?? master.title,
        recurrence: null,
        createdAt: now,
        updatedAt: now,
        rev: 1,
        deviceId: settings.deviceId,
        payload: {
          ...master.payload,
          ...patch,
          startDate: patch.startDate ?? occurrenceDate,
          endDate: patch.endDate ?? patch.startDate ?? occurrenceDate,
          seriesMasterId: master.id,
          recurrenceExceptionDate: occurrenceDate,
        },
      };
      changes.push({ recordId: detached.id, before: null, after: detached as LifeRecord });
      return changes;
    }

    // scope === 'following'
    const dayBefore = addDaysIso(occurrenceDate, -1);
    const truncatedMaster: LifeRecord<CalendarEventPayload> = {
      ...master,
      recurrence: { ...master.recurrence, until: dayBefore, count: null },
      updatedAt: now,
      rev: master.rev + 1,
      deviceId: settings.deviceId,
    };
    changes.push({ recordId: master.id, before: master as LifeRecord, after: truncatedMaster as LifeRecord });

    const newSeries: LifeRecord<CalendarEventPayload> = {
      ...master,
      id: createId('ev'),
      title: patch.title ?? master.title,
      recurrence: { ...master.recurrence, exceptions: [] },
      createdAt: now,
      updatedAt: now,
      rev: 1,
      deviceId: settings.deviceId,
      payload: {
        ...master.payload,
        ...patch,
        startDate: patch.startDate ?? occurrenceDate,
        endDate: patch.endDate ?? patch.startDate ?? occurrenceDate,
      },
    };
    changes.push({ recordId: newSeries.id, before: null, after: newSeries as LifeRecord });
    return changes;
  });
}

// --- Flow Calendar 4-Mode Overlap Engine & Conflict Inspector (Section 07.02) ---

export type OverlapMode = 'equal_split' | 'layered_stagger' | 'expand_columns' | 'offset_columns';

export interface PositionedEvent {
  id: string;
  event: LifeRecord<CalendarEventPayload>;
  occurrenceDate: string;
  startMin: number;
  endMin: number;
  leftPct: number;
  widthPct: number;
  zIndex: number;
  topOffsetPx: number;
  labelShifted: boolean;
  columnIndex: number;
  totalColumns: number;
}

export interface ConflictWindow {
  dateIso: string;
  startMin: number;
  endMin: number;
  eventIds: string[];
  titles: string[];
}

export function layoutDayEvents(
  items: Array<{ event: LifeRecord<CalendarEventPayload>; occurrenceDate: string }>,
  mode: OverlapMode
): { positioned: PositionedEvent[]; conflicts: ConflictWindow[] } {
  const timed = items
    .filter((i) => !i.event.payload.allDay)
    .map((i) => {
      const startMin = timeToMinutes(i.event.payload.startTime || '09:00');
      const rawEnd = timeToMinutes(i.event.payload.endTime || '10:00');
      const endMin = rawEnd > startMin ? rawEnd : startMin + 30;
      return { ...i, startMin, endMin };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  // Compute strict real conflicts from true time intervals (never distorted by visual min-height)
  const conflicts: ConflictWindow[] = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i];
      const b = timed[j];
      if (b.startMin < a.endMin) {
        const overlapStart = Math.max(a.startMin, b.startMin);
        const overlapEnd = Math.min(a.endMin, b.endMin);
        if (overlapEnd > overlapStart) {
          conflicts.push({
            dateIso: a.occurrenceDate,
            startMin: overlapStart,
            endMin: overlapEnd,
            eventIds: [a.event.id, b.event.id],
            titles: [a.event.title, b.event.title],
          });
        }
      }
    }
  }

  // Group overlapping clusters
  const clusters: Array<typeof timed> = [];
  for (const item of timed) {
    const lastCluster = clusters[clusters.length - 1];
    if (!lastCluster) {
      clusters.push([item]);
    } else {
      const clusterMaxEnd = Math.max(...lastCluster.map((x) => x.endMin));
      if (item.startMin < clusterMaxEnd) {
        lastCluster.push(item);
      } else {
        clusters.push([item]);
      }
    }
  }

  const positioned: PositionedEvent[] = [];

  for (const cluster of clusters) {
    const colEnds: number[] = [];
    const assignments = cluster.map((item) => {
      let col = colEnds.findIndex((end) => end <= item.startMin);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(item.endMin);
      } else {
        colEnds[col] = item.endMin;
      }
      return { item, col };
    });

    const totalCols = Math.max(1, colEnds.length);

    for (const { item, col } of assignments) {
      let leftPct = 0;
      let widthPct = 100;
      let topOffsetPx = 0;
      let labelShifted = false;

      if (mode === 'equal_split') {
        widthPct = 100 / totalCols;
        leftPct = col * widthPct;
      } else if (mode === 'layered_stagger') {
        leftPct = Math.min(col * 12, 48);
        widthPct = Math.max(52, 100 - leftPct);
        topOffsetPx = col > 0 ? col * 14 : 0;
        labelShifted = col > 0;
      } else if (mode === 'expand_columns') {
        widthPct = 100 / totalCols;
        leftPct = col * widthPct;
      } else if (mode === 'offset_columns') {
        const step = totalCols > 1 ? 68 / totalCols : 0;
        leftPct = col * step;
        widthPct = Math.max(42, 100 - step * (totalCols - 1));
      }

      positioned.push({
        id: `${item.event.id}::${item.occurrenceDate}`,
        event: item.event,
        occurrenceDate: item.occurrenceDate,
        startMin: item.startMin,
        endMin: item.endMin,
        leftPct,
        widthPct,
        zIndex: 2 + col,
        topOffsetPx,
        labelShifted,
        columnIndex: col,
        totalColumns: totalCols,
      });
    }
  }

  return { positioned, conflicts };
}

/**
 * Finds 30+ minute free gaps between workWindowStart (default 08:00) and workWindowEnd (default 20:00).
 */
export function findFreeTimeGaps(
  dayEvents: Array<{ startMin: number; endMin: number }>,
  workStartMin = 8 * 60,
  workEndMin = 20 * 60,
  minGapMin = 30
): Array<{ startMin: number; endMin: number; durationMin: number }> {
  const sorted = [...dayEvents]
    .filter((e) => e.endMin > workStartMin && e.startMin < workEndMin)
    .sort((a, b) => a.startMin - b.startMin);

  const gaps: Array<{ startMin: number; endMin: number; durationMin: number }> = [];
  let cursor = workStartMin;

  for (const ev of sorted) {
    if (ev.startMin > cursor) {
      const dur = ev.startMin - cursor;
      if (dur >= minGapMin) gaps.push({ startMin: cursor, endMin: ev.startMin, durationMin: dur });
    }
    cursor = Math.max(cursor, ev.endMin);
  }
  if (workEndMin > cursor && workEndMin - cursor >= minGapMin) {
    gaps.push({ startMin: cursor, endMin: workEndMin, durationMin: workEndMin - cursor });
  }
  return gaps;
}
