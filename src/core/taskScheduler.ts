import { minutesToTime, timeToMinutes } from './planActions';
import type {
  CalendarEventPayload,
  ChorePayload,
  DurationCompletionLog,
  LifeRecord,
  SchedulingContextDef,
  TaskPayload,
} from './types';

export interface ScheduledTaskBlock {
  task: LifeRecord<TaskPayload>;
  startMin: number;
  endMin: number;
  startTime: string;
  endTime: string;
  durationMin: number;
  kind: 'completed_recorded' | 'completed_estimated' | 'planned_auto' | 'planned_manual' | 'overflow_unfit';
  contextName?: string;
}

export interface TaskScheduleResult {
  dateIso: string;
  blocks: ScheduledTaskBlock[];
  unfitTasks: Array<LifeRecord<TaskPayload>>;
  learnedAvgByType: Record<string, number>;
}

const PRIORITY_RANK: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

/**
 * Compute learned average undistracted completion time per reusable task type.
 */
export function computeLearnedTaskDurations(tasks: Array<LifeRecord<TaskPayload>>): Record<string, number> {
  const buckets = new Map<string, number[]>();
  for (const t of tasks) {
    const key = t.payload.taskType?.trim().toLowerCase();
    if (!key) continue;
    const logs = t.payload.completionLogs ?? [];
    for (const log of logs) {
      if (Number.isFinite(log.actualMinutes) && log.actualMinutes > 0 && !log.distracted) {
        const arr = buckets.get(key) ?? [];
        arr.push(log.actualMinutes);
        buckets.set(key, arr);
      }
    }
    if (logs.length === 0 && t.payload.actualMinutes && t.payload.actualMinutes > 0) {
      const arr = buckets.get(key) ?? [];
      arr.push(t.payload.actualMinutes);
      buckets.set(key, arr);
    }
  }
  const out: Record<string, number> = {};
  for (const [k, vals] of buckets.entries()) {
    out[k] = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  }
  return out;
}

/**
 * Dynamic Intelligent Task Calendar Engine (Section 10):
 * - Preserves completed tasks at their exact recorded (or explicitly marked estimated) historical slots.
 * - Places unfinished tasks in priority + custom order into free gaps after `nowMin`,
 *   respecting existing Calendar events, Context time windows, and Preferred Daily End Time!
 */
export function computeDynamicTaskSchedule(opts: {
  dateIso: string;
  weekday: number; // 0=Sun..6=Sat
  nowMin: number; // current minute of day (e.g., 14*60+15) — for future dates pass e.g. 8*60
  preferredEndTime: string; // e.g., '21:00'
  allowPastEndTime?: boolean;
  tasks: Array<LifeRecord<TaskPayload>>;
  dayEvents: Array<LifeRecord<CalendarEventPayload>>;
  contexts: SchedulingContextDef[];
  activeContextId?: string | null;
}): TaskScheduleResult {
  const {
    dateIso,
    weekday,
    nowMin,
    preferredEndTime,
    allowPastEndTime = false,
    tasks,
    dayEvents,
    contexts,
    activeContextId = null,
  } = opts;

  const endCutoff = allowPastEndTime ? 24 * 60 : Math.min(1440, timeToMinutes(preferredEndTime || '21:00'));
  const learnedAvgByType = computeLearnedTaskDurations(tasks);
  const ctxMap = new Map(contexts.map((c) => [c.id, c]));

  // Busy intervals from existing timed calendar events
  const busy: Array<{ start: number; end: number }> = [];
  for (const ev of dayEvents) {
    if (ev.deletedAt || ev.payload.allDay || ev.payload.eventStatus === 'canceled') continue;
    const s = ev.payload.startDate < dateIso ? 0 : timeToMinutes(ev.payload.startTime || '09:00');
    const e = ev.payload.endDate > dateIso ? 1440 : timeToMinutes(ev.payload.endTime || '10:00');
    if (e > s) busy.push({ start: s, end: e });
  }

  const blocks: ScheduledTaskBlock[] = [];
  const unfitTasks: Array<LifeRecord<TaskPayload>> = [];

  // 1. Place completed tasks for this date at their immutable historical placement (Section 10.1)
  const completedToday = tasks.filter(
    (t) =>
      t.status === 'done' &&
      ((t.payload.completedAt && t.payload.completedAt.slice(0, 10) === dateIso) || t.doDate === dateIso)
  );
  let lastEstEnd = 9 * 60;
  for (const t of completedToday) {
    const lastLog = t.payload.completionLogs?.[t.payload.completionLogs.length - 1];
    const dur = Math.max(5, lastLog?.actualMinutes ?? t.payload.actualMinutes ?? t.estimateMin ?? 25);
    const startIso = lastLog?.startedAt ?? t.payload.startedAt;
    const endIso = lastLog?.completedAt ?? t.payload.completedAt;
    let sMin: number;
    let eMin: number;
    let kind: ScheduledTaskBlock['kind'];
    if (startIso && endIso) {
      const sd = new Date(startIso);
      const ed = new Date(endIso);
      sMin = sd.getHours() * 60 + sd.getMinutes();
      eMin = Math.max(sMin + 5, ed.getHours() * 60 + ed.getMinutes());
      kind = lastLog?.isEstimatedStart ? 'completed_estimated' : 'completed_recorded';
    } else if (endIso) {
      const ed = new Date(endIso);
      eMin = ed.getHours() * 60 + ed.getMinutes();
      sMin = Math.max(0, eMin - dur);
      kind = 'completed_estimated';
    } else {
      sMin = lastEstEnd;
      eMin = Math.min(24 * 60, sMin + dur);
      kind = 'completed_estimated';
    }
    lastEstEnd = Math.max(lastEstEnd, eMin);
    blocks.push({
      task: t,
      startMin: sMin,
      endMin: eMin,
      startTime: minutesToTime(sMin),
      endTime: minutesToTime(eMin),
      durationMin: eMin - sMin,
      kind,
      contextName: t.payload.contextId ? ctxMap.get(t.payload.contextId)?.name : undefined,
    });
    busy.push({ start: sMin, end: eMin });
  }

  // 2. Select eligible active tasks (today, overdue, or unscheduled) and sort by priority + custom order
  const eligibleActive = tasks
    .filter((t) => {
      if (t.deletedAt || t.status !== 'active') return false;
      if (activeContextId && t.payload.contextId && t.payload.contextId !== activeContextId) return false;
      if (t.doDate && t.doDate > dateIso) return false;
      return true;
    })
    .sort((a, b) => {
      const pa = a.payload.customPriorityRank ?? (PRIORITY_RANK[a.priority ?? 'none'] ?? 0) * 20;
      const pb = b.payload.customPriorityRank ?? (PRIORITY_RANK[b.priority ?? 'none'] ?? 0) * 20;
      if (pb !== pa) return pb - pa;
      const oa = a.payload.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const ob = b.payload.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;
      return a.createdAt.localeCompare(b.createdAt);
    });

  // Reserve every manual slot before automatic scheduling, irrespective of priority.
  const pinnedFirst = [...eligibleActive.filter(t => t.payload.manualStartTime), ...eligibleActive.filter(t => !t.payload.manualStartTime)];
  // Helper to check if [s, e) overlaps any busy block
  busy.sort((a, b) => a.start - b.start);
  const insertBusy = (block: { start: number; end: number }) => {
    let low = 0, high = busy.length;
    while (low < high) { const mid = (low + high) >>> 1; if (busy[mid].start <= block.start) low = mid + 1; else high = mid; }
    busy.splice(low, 0, block);
  };
  const findFirstFreeSlot = (earliest: number, latestEnd: number, duration: number): number | null => {
    const sortedBusy = busy;
    let cursor = Math.ceil(earliest / 5) * 5;
    for (const b of sortedBusy) {
      if (b.end <= cursor) continue;
      if (cursor + duration <= b.start) {
        return cursor + duration <= latestEnd ? cursor : null;
      }
      cursor = Math.max(cursor, Math.ceil(b.end / 5) * 5);
    }
    return cursor + duration <= latestEnd ? cursor : null;
  };

  // 3. Place manually pinned tasks first, then dynamically fill remaining tasks
  for (const t of pinnedFirst) {
    const typeKey = t.payload.taskType?.trim().toLowerCase();
    const duration = Math.max(
      5,
      t.estimateMin ?? (typeKey ? learnedAvgByType[typeKey] : undefined) ?? 25
    );
    const ctx = t.payload.contextId ? ctxMap.get(t.payload.contextId) : undefined;

    if (t.payload.manualStartTime) {
      const sMin = timeToMinutes(t.payload.manualStartTime);
      const eMin = Math.min(24 * 60, sMin + duration);
      blocks.push({
        task: t,
        startMin: sMin,
        endMin: eMin,
        startTime: minutesToTime(sMin),
        endTime: minutesToTime(eMin),
        durationMin: eMin - sMin,
        kind: 'planned_manual',
        contextName: ctx?.name,
      });
      insertBusy({ start: sMin, end: eMin });
      continue;
    }

    // Enforce scheduling context day & hours window if assigned!
    let windowStart = nowMin;
    let windowEnd = endCutoff;
    if (ctx) {
      if (ctx.days.length > 0 && !ctx.days.includes(weekday)) {
        unfitTasks.push(t);
        continue;
      }
      windowStart = Math.max(windowStart, timeToMinutes(ctx.startTime));
      windowEnd = Math.min(windowEnd, timeToMinutes(ctx.endTime));
    }

    if (windowStart + duration > windowEnd) {
      unfitTasks.push(t);
      continue;
    }

    const slotStart = findFirstFreeSlot(windowStart, windowEnd, duration);
    if (slotStart === null) {
      unfitTasks.push(t);
      continue;
    }

    const slotEnd = slotStart + duration;
    blocks.push({
      task: t,
      startMin: slotStart,
      endMin: slotEnd,
      startTime: minutesToTime(slotStart),
      endTime: minutesToTime(slotEnd),
      durationMin: duration,
      kind: 'planned_auto',
      contextName: ctx?.name,
    });
    insertBusy({ start: slotStart, end: slotEnd });
  }

  blocks.sort((a, b) => a.startMin - b.startMin);
  return { dateIso, blocks, unfitTasks, learnedAvgByType };
}

export interface DurationAnalyticsSummary {
  totalSessions: number;
  undistractedCount: number;
  distractedCount: number;
  totalMinutes: number;
  avgAllMin: number | null;
  avgUndistractedMin: number | null;
  avgDistractedMin: number | null;
  fastestMin: number | null;
  longestMin: number | null;
  avgEstimatedMin: number | null;
  totalDistractionMin: number;
  byLabel: Array<{ label: string; count: number; avgMin: number; undistractedAvgMin: number | null }>;
}

/**
 * Duration & Distraction Analytics across Tasks & Chores (Sections 9.5, 9.6, 20.2).
 */
export function computeDurationAnalytics(
  tasks: Array<LifeRecord<TaskPayload>>,
  chores: Array<LifeRecord<ChorePayload>>,
  filter?: { startDate?: string; endDate?: string; labelFilter?: string }
): DurationAnalyticsSummary {
  const entries: Array<{ label: string; log: DurationCompletionLog }> = [];

  for (const t of tasks) {
    const label = t.payload.taskType?.trim() || t.title;
    if (filter?.labelFilter && !label.toLowerCase().includes(filter.labelFilter.toLowerCase())) continue;
    const logs = t.payload.completionLogs ?? [];
    for (const log of logs) {
      const d = log.completedAt.slice(0, 10);
      if (filter?.startDate && d < filter.startDate) continue;
      if (filter?.endDate && d > filter.endDate) continue;
      entries.push({ label, log });
    }
    if (logs.length === 0 && t.status === 'done' && (t.payload.actualMinutes ?? 0) > 0) {
      const d = (t.payload.completedAt || t.updatedAt).slice(0, 10);
      if ((!filter?.startDate || d >= filter.startDate) && (!filter?.endDate || d <= filter.endDate)) {
        entries.push({
          label,
          log: {
            id: `legacy_${t.id}`,
            completedAt: t.payload.completedAt || t.updatedAt,
            actualMinutes: t.payload.actualMinutes!,
            estimatedMinutes: t.estimateMin ?? undefined,
            distracted: false,
          },
        });
      }
    }
  }

  for (const c of chores) {
    const label = c.title;
    if (filter?.labelFilter && !label.toLowerCase().includes(filter.labelFilter.toLowerCase())) continue;
    for (const comp of c.payload.completions ?? []) {
      if (!comp.minutesSpent || comp.minutesSpent <= 0) continue;
      if (filter?.startDate && comp.completedDate < filter.startDate) continue;
      if (filter?.endDate && comp.completedDate > filter.endDate) continue;
      entries.push({
        label,
        log: {
          id: comp.id,
          completedAt: comp.completedAt,
          actualMinutes: comp.minutesSpent,
          estimatedMinutes: c.estimateMin ?? undefined,
          breakMinutes: comp.breakMinutes,
          distracted: Boolean(comp.distracted),
          distractionMinutes: comp.distractionMinutes,
          notes: comp.notes,
        },
      });
    }
  }

  if (entries.length === 0) {
    return {
      totalSessions: 0,
      undistractedCount: 0,
      distractedCount: 0,
      totalMinutes: 0,
      avgAllMin: null,
      avgUndistractedMin: null,
      avgDistractedMin: null,
      fastestMin: null,
      longestMin: null,
      avgEstimatedMin: null,
      totalDistractionMin: 0,
      byLabel: [],
    };
  }

  const allMins = entries.map((e) => e.log.actualMinutes);
  const undistracted = entries.filter((e) => !e.log.distracted).map((e) => e.log.actualMinutes);
  const distracted = entries.filter((e) => e.log.distracted).map((e) => e.log.actualMinutes);
  const estimates = entries
    .map((e) => e.log.estimatedMinutes)
    .filter((v): v is number => typeof v === 'number' && v > 0);

  const avg = (arr: number[]) => (arr.length ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10 : null);

  const byLabelMap = new Map<string, { all: number[]; undistracted: number[] }>();
  for (const e of entries) {
    const cur = byLabelMap.get(e.label) ?? { all: [], undistracted: [] };
    cur.all.push(e.log.actualMinutes);
    if (!e.log.distracted) cur.undistracted.push(e.log.actualMinutes);
    byLabelMap.set(e.label, cur);
  }

  const byLabel = Array.from(byLabelMap.entries())
    .map(([label, b]) => ({
      label,
      count: b.all.length,
      avgMin: avg(b.all) ?? 0,
      undistractedAvgMin: avg(b.undistracted),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalSessions: entries.length,
    undistractedCount: undistracted.length,
    distractedCount: distracted.length,
    totalMinutes: Math.round(allMins.reduce((s, v) => s + v, 0)),
    avgAllMin: avg(allMins),
    avgUndistractedMin: avg(undistracted),
    avgDistractedMin: avg(distracted),
    fastestMin: allMins.reduce((a, n) => Math.min(a, n), Infinity),
    longestMin: allMins.reduce((a, n) => Math.max(a, n), -Infinity),
    avgEstimatedMin: avg(estimates),
    totalDistractionMin: Math.round(entries.reduce((s, e) => s + (e.log.distractionMinutes ?? 0), 0)),
    byLabel,
  };
}

/**
 * Compute task age in days and overdue days without modifying original creation metadata (Section 9.4).
 */
export function computeTaskAgeMetadata(task: LifeRecord<TaskPayload>, todayIso: string): {
  ageDays: number;
  overdueDays: number;
  rescheduleCount: number;
} {
  const createdDay = task.createdAt.slice(0, 10);
  const msPerDay = 86_400_000;
  const todayMs = Date.parse(`${todayIso}T00:00:00Z`);
  const createdMs = Date.parse(`${createdDay}T00:00:00Z`);
  const ageDays = Number.isFinite(todayMs - createdMs) ? Math.max(0, Math.floor((todayMs - createdMs) / msPerDay)) : 0;

  let overdueDays = 0;
  const refDue = task.dueDate || task.payload.originalDueDate;
  if (refDue && task.status === 'active' && refDue < todayIso) {
    const dueMs = Date.parse(`${refDue}T00:00:00Z`);
    if (Number.isFinite(todayMs - dueMs)) {
      overdueDays = Math.max(0, Math.floor((todayMs - dueMs) / msPerDay));
    }
  }

  return {
    ageDays,
    overdueDays,
    rescheduleCount: task.payload.rescheduleCount ?? 0,
  };
}
