import { addDaysIso, diffDaysIso, getWeekdayIso, resolveAnnualFloatingDate } from './temporal';
import type { ChorePayload, LifeRecord, RecurrenceRule } from './types';

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getNthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): string | null {
  const totalDays = daysInMonth(year, month);
  const matching: number[] = [];
  for (let d = 1; d <= totalDays; d++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (getWeekdayIso(iso) === weekday) matching.push(d);
  }
  if (matching.length === 0) return null;
  const chosen = nth < 0 ? matching[matching.length + nth] : matching[nth - 1];
  if (!chosen) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(chosen).padStart(2, '0')}`;
}

function getFirstBusinessDay(year: number, month: number): string {
  for (let d = 1; d <= 7; d++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const w = getWeekdayIso(iso);
    if (w !== 0 && w !== 6) return iso;
  }
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/**
 * Generates recurring occurrence dates (YYYY-MM-DD) within [rangeStart, rangeEnd] or up to maxCount.
 * Supports daily/weekly/monthly/yearly, interval N, multiple weekdays, nth/last weekday,
 * first business day, until/count, skip weekends, exceptions (EXDATE), and Feb 29 policy.
 */
export function expandRecurrenceDates(
  startDate: string,
  rule: RecurrenceRule | null | undefined,
  options: { rangeStart?: string; rangeEnd?: string; maxCount?: number } = {}
): string[] {
  const rangeStart = options.rangeStart ?? startDate;
  const rangeEnd = options.rangeEnd ?? addDaysIso(startDate, 366);
  const maxCount = options.maxCount ?? 250;
  if (maxCount <= 0 || rangeEnd < rangeStart) return [];

  if (!rule) {
    return startDate >= rangeStart && startDate <= rangeEnd ? [startDate] : [];
  }

  const interval = Math.max(1, Math.floor(Number.isFinite(rule.interval) ? rule.interval : 1));
  const exceptions = new Set(rule.exceptions ?? []);
  const results: string[] = [];
  let generatedTotal = 0;

  const pushCandidate = (iso: string): boolean => {
    if (iso < startDate) return true;
    if (rule.until && iso > rule.until) return false;
    if (rule.count && generatedTotal >= rule.count) return false;

    if (rule.skipWeekends) {
      const w = getWeekdayIso(iso);
      if (w === 0 || w === 6) return true;
    }

    generatedTotal++;
    if (!exceptions.has(iso) && iso >= rangeStart && iso <= rangeEnd) {
      results.push(iso);
    }
    if (results.length >= maxCount) return false;
    if (iso > rangeEnd && !rule.count) return false;
    return true;
  };

  if (rule.freq === 'daily') {
    const offset = rule.count ? 0 : Math.max(0, Math.ceil(diffDaysIso(startDate, rangeStart) / interval));
    let cur = addDaysIso(startDate, offset * interval);
    for (let step = 0; cur <= rangeEnd && step < 1_000_000; step++) {
      if (!pushCandidate(cur)) break;
      if (cur > rangeEnd) break;
      cur = addDaysIso(cur, interval);
    }
    return results;
  }

  if (rule.freq === 'weekly') {
    const weekdays = rule.byWeekday && rule.byWeekday.length > 0 ? Array.from(new Set(rule.byWeekday.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))).sort() : [getWeekdayIso(startDate)];
    const startDow = getWeekdayIso(startDate);
    let weekStart = addDaysIso(startDate, -startDow); // Sunday of start week
    if (!rule.count) weekStart = addDaysIso(weekStart, Math.max(0, Math.floor(diffDaysIso(weekStart, rangeStart) / (7 * interval))) * 7 * interval);
    for (let w = 0; weekStart <= rangeEnd && w < 150_000; w++) {
      let shouldStop = false;
      for (const wd of weekdays) {
        const candidate = addDaysIso(weekStart, wd);
        if (candidate < startDate) continue;
        if (!pushCandidate(candidate)) {
          shouldStop = true;
          break;
        }
      }
      if (shouldStop || weekStart > rangeEnd) break;
      weekStart = addDaysIso(weekStart, 7 * interval);
    }
    return results;
  }

  if (rule.freq === 'monthly') {
    const [sy, sm, sd] = startDate.split('-').map(Number);
    let totalMonths = sy * 12 + (sm - 1);
    const [ry, rm] = rangeStart.split('-').map(Number);
    if (!rule.count) totalMonths += Math.max(0, Math.floor((ry * 12 + rm - 1 - totalMonths) / interval)) * interval;
    for (let i = 0; i < 120_000; i++) {
      const y = Math.floor(totalMonths / 12);
      const m = (totalMonths % 12) + 1;
      if (`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01` > rangeEnd || y > 9999) break;
      let candidate: string | null = null;
      if (rule.firstBusinessDay) {
        candidate = getFirstBusinessDay(y, m);
      } else if (rule.bySetPos && rule.byWeekday?.length) {
        candidate = getNthWeekdayOfMonth(y, m, rule.byWeekday[0], rule.bySetPos);
      } else {
        const clamped = Math.min(sd, daysInMonth(y, m));
        candidate = `${y}-${String(m).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
      }
      if (candidate && !pushCandidate(candidate)) break;
      if (candidate && candidate > rangeEnd) break;
      totalMonths += interval;
    }
    return results;
  }

  if (rule.freq === 'yearly') {
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const firstYear = rule.count ? sy : sy + Math.max(0, Math.floor((Number(rangeStart.slice(0, 4)) - sy) / interval)) * interval;
    for (let y = firstYear; y <= Number(rangeEnd.slice(0, 4)); y += interval) {
      const candidate = resolveAnnualFloatingDate(sm, sd, y, rule.feb29Policy ?? 'feb28');
      if (candidate) {
        if (!pushCandidate(candidate)) break;
        if (candidate > rangeEnd) break;
      }
    }
    return results;
  }

  return results;
}

export function previewNextOccurrences(startDate: string, rule: RecurrenceRule, count = 5): string[] {
  return expandRecurrenceDates(startDate, rule, {
    rangeStart: startDate,
    rangeEnd: addDaysIso(startDate, 365 * 6),
    maxCount: count,
  });
}

// --- Completion-Based Chore Engine (Section 09.02) ---

export function getSeasonForDate(dateIso: string): 'spring' | 'summer' | 'fall' | 'winter' {
  const m = Number(dateIso.slice(5, 7));
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'fall';
  return 'winter';
}

/**
 * Signature completion-based chore engine:
 * Completing a chore late recalculates the next due date from the ACTUAL completion date!
 * Example: due Monday, done Wednesday on a 2-day interval -> next due Friday.
 */
export function computeNextChoreDueDate(
  chore: ChorePayload,
  completionDateIso: string
): string {
  const interval = Math.max(1, Math.min(3650, chore.intervalDays || 7));

  switch (chore.choreMode) {
    case 'after_completion':
      return addDaysIso(completionDateIso, interval);
    case 'fixed': {
      const base = chore.nextDueDate || completionDateIso;
      return addDaysIso(base, Math.max(1, Math.floor(diffDaysIso(base, completionDateIso) / interval) + 1) * interval);
    }
    case 'weekdays': {
      let cand = addDaysIso(completionDateIso, 1);
      while ([0, 6].includes(getWeekdayIso(cand))) {
        cand = addDaysIso(cand, 1);
      }
      return cand;
    }
    case 'monthly_nth': {
      const [y, m] = completionDateIso.split('-').map(Number);
      const nextM = m === 12 ? 1 : m + 1;
      const nextY = m === 12 ? y + 1 : y;
      return getNthWeekdayOfMonth(nextY, nextM, 6, -1) ?? addDaysIso(completionDateIso, 30);
    }
    case 'usage_counter':
      return addDaysIso(completionDateIso, interval);
    case 'elapsed_hours': {
      const days = Math.max(1, Math.ceil((chore.elapsedHoursTarget ?? 48) / 24));
      return addDaysIso(completionDateIso, days);
    }
    case 'seasonal': {
      let cand = addDaysIso(completionDateIso, interval);
      if (chore.activeSeasons && chore.activeSeasons.length > 0) {
        for (let i = 0; i < 366; i++) {
          if (chore.activeSeasons.includes(getSeasonForDate(cand))) break;
          cand = addDaysIso(cand, 1);
        }
      }
      return cand;
    }
    default:
      return addDaysIso(completionDateIso, interval);
  }
}

/**
 * Computes visual Freshness (0..100%) for a chore on any targetDate (supports Historical Date Replay!).
 */
export function computeChoreFreshnessAtDate(chore: ChorePayload, asOfDateIso: string): {
  freshnessPct: number;
  status: 'fresh' | 'due_soon' | 'due_today' | 'overdue' | 'paused';
  effectiveDueDate: string;
} {
  if (chore.paused) {
    return { freshnessPct: 100, status: 'paused', effectiveDueDate: chore.nextDueDate };
  }

  // Reconstruct historical state strictly from completion ledger entries on/before asOfDateIso
  const lastDone = (chore.completions ?? []).reduce<string | null>((latest, c) => c.completedDate <= asOfDateIso && (!latest || c.completedDate > latest) ? c.completedDate : latest, chore.lastCompletedDate && chore.lastCompletedDate <= asOfDateIso ? chore.lastCompletedDate : null);
  const interval = Math.max(1, chore.intervalDays || 7);

  let effectiveDue = chore.nextDueDate;
  if (lastDone && chore.choreMode === 'after_completion') {
    effectiveDue = addDaysIso(lastDone, interval);
  }
  if (chore.snoozedUntil && chore.snoozedUntil > effectiveDue) {
    effectiveDue = chore.snoozedUntil;
  }

  const daysUntilDue = diffDaysIso(asOfDateIso, effectiveDue);
  if (daysUntilDue < 0) {
    const overdueFraction = Math.min(1, Math.abs(daysUntilDue) / interval);
    return {
      freshnessPct: Math.max(0, Math.round(25 * (1 - overdueFraction))),
      status: 'overdue',
      effectiveDueDate: effectiveDue,
    };
  }
  if (daysUntilDue === 0) {
    return { freshnessPct: 30, status: 'due_today', effectiveDueDate: effectiveDue };
  }
  const pct = Math.min(100, Math.max(35, Math.round((daysUntilDue / interval) * 100)));
  return {
    freshnessPct: pct,
    status: daysUntilDue <= 1 ? 'due_soon' : 'fresh',
    effectiveDueDate: effectiveDue,
  };
}

export function computeRoomHealthSummary(
  chores: Array<LifeRecord<ChorePayload>>,
  asOfDateIso: string
): Array<{ room: string; healthPct: number; overdueCount: number; dueTodayCount: number; total: number }> {
  const byRoom = new Map<string, Array<LifeRecord<ChorePayload>>>();
  for (const ch of chores) {
    const room = ch.payload.room || 'General';
    const arr = byRoom.get(room) ?? [];
    arr.push(ch);
    byRoom.set(room, arr);
  }

  return Array.from(byRoom.entries())
    .map(([room, list]) => {
      let sum = 0;
      let overdueCount = 0;
      let dueTodayCount = 0;
      for (const item of list) {
        const state = computeChoreFreshnessAtDate(item.payload, asOfDateIso);
        sum += state.freshnessPct;
        if (state.status === 'overdue') overdueCount++;
        if (state.status === 'due_today') dueTodayCount++;
      }
      return {
        room,
        healthPct: list.length ? Math.round(sum / list.length) : 100,
        overdueCount,
        dueTodayCount,
        total: list.length,
      };
    })
    .sort((a, b) => a.healthPct - b.healthPct);
}
