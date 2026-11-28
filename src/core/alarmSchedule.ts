// Pure Alarm Scheduling & Next-Trigger Computation Utilities
// Shared by TimeSuiteView, AppContext global alarm loop, and Capacitor native OS scheduling.

export type AlarmRingtoneId =
  | 'sunrise_harp'
  | 'classic_bell'
  | 'radar_pulse'
  | 'morning_chimes'
  | 'retro_digital'
  | 'bright_marimba'
  | 'zen_bowl'
  | 'urgent_siren';

export interface AlarmPayload {
  time: string; // HH:MM (24h)
  profile: string;
  enabled: boolean;
  scheduleType?: 'recurring' | 'once';
  repeatDays?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  scheduleDate?: string | null; // YYYY-MM-DD when scheduleType === 'once'
  ringtone?: string; // AlarmRingtoneId or `blob:<hash>`
  ringtoneName?: string;
  volume?: number; // 0..100
  vibrate?: boolean;
  challenge: 'none' | 'math' | 'affirmation' | 'memory';
  volumeRampSec: number;
  snoozeMin: number;
  maxSnoozes: number;
  skipNext?: boolean;
  notes?: string;
}

export const DAY_SHORT_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function normalizeAlarmPayload(raw: Record<string, unknown>): AlarmPayload {
  const scheduleType = raw.scheduleType === 'once' ? 'once' : 'recurring';
  const rawDays = Array.isArray(raw.repeatDays)
    ? raw.repeatDays.filter((d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6)
    : undefined;
  return {
    time: typeof raw.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time) ? raw.time : '07:00',
    profile: typeof raw.profile === 'string' ? raw.profile : 'Workday',
    enabled: raw.enabled !== false,
    scheduleType,
    repeatDays: rawDays ? Array.from(new Set(rawDays)).sort((a,b) => a-b) : (scheduleType === 'recurring' ? [0, 1, 2, 3, 4, 5, 6] : []),
    scheduleDate: typeof raw.scheduleDate === 'string' && raw.scheduleDate ? raw.scheduleDate : null,
    ringtone: typeof raw.ringtone === 'string' && raw.ringtone ? raw.ringtone : 'sunrise_harp',
    ringtoneName: typeof raw.ringtoneName === 'string' ? raw.ringtoneName : undefined,
    volume: typeof raw.volume === 'number' && Number.isFinite(raw.volume) ? Math.max(5, Math.min(100, raw.volume)) : 85,
    vibrate: raw.vibrate !== false,
    challenge:
      raw.challenge === 'math' || raw.challenge === 'affirmation' || raw.challenge === 'memory'
        ? raw.challenge
        : 'none',
    volumeRampSec: typeof raw.volumeRampSec === 'number' && Number.isFinite(raw.volumeRampSec) ? Math.max(0, Math.min(3600, raw.volumeRampSec)) : 30,
    snoozeMin: typeof raw.snoozeMin === 'number' && Number.isFinite(raw.snoozeMin) ? Math.max(1, Math.min(1440, Math.round(raw.snoozeMin))) : 9,
    maxSnoozes: typeof raw.maxSnoozes === 'number' && Number.isFinite(raw.maxSnoozes) ? Math.max(0, Math.floor(raw.maxSnoozes)) : 3,
    skipNext: Boolean(raw.skipNext),
    notes: typeof raw.notes === 'string' ? raw.notes : undefined,
  };
}

export function formatRepeatDaysSummary(
  repeatDays: number[] | undefined,
  scheduleType: 'recurring' | 'once' = 'recurring',
  scheduleDate?: string | null
): string {
  if (scheduleType === 'once') {
    return scheduleDate ? `Once · ${scheduleDate}` : 'One-time (next)';
  }
  const days = Array.from(new Set(repeatDays ?? [0, 1, 2, 3, 4, 5, 6])).sort((a, b) => a - b);
  if (days.length === 0) return 'One-time';
  if (days.length === 7) return 'Every day';
  const joined = days.join(',');
  if (joined === '1,2,3,4,5') return 'Weekdays';
  if (joined === '0,6') return 'Weekends';
  return days.map((d) => DAY_SHORT_LABELS[d]).join(', ');
}

export function formatCountdownMs(ms: number): string {
  if (ms <= 0) return 'now';
  const totalMin = Math.ceil(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hrs = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `in ${days}d ${hrs}h`;
  if (hrs > 0) return `in ${hrs}h ${mins}m`;
  return `in ${mins}m`;
}

/**
 * Checks whether an alarm should trigger at a specific local date (YYYY-MM-DD),
 * day of week (0=Sun..6=Sat), and HH:MM clock string.
 */
export function doesAlarmMatchMoment(
  raw: Record<string, unknown>,
  dateIso: string,
  weekday: number,
  hhmm: string
): boolean {
  const alarm = normalizeAlarmPayload(raw);
  if (!alarm.enabled || alarm.skipNext) return false;
  if (alarm.time !== hhmm) return false;

  if (alarm.scheduleType === 'once') {
    if (alarm.scheduleDate) {
      return alarm.scheduleDate === dateIso;
    }
    return true;
  }

  const days = alarm.repeatDays && alarm.repeatDays.length > 0 ? alarm.repeatDays : [0, 1, 2, 3, 4, 5, 6];
  return days.includes(weekday);
}

/**
 * Computes the next upcoming fire timestamp (ms) for an alarm from `now`,
 * supporting specific-date one-time alarms, weekday-repeating alarms, and skipNext.
 */
export function computeNextAlarmTrigger(
  raw: Record<string, unknown>,
  now: Date = new Date()
): { nextFireMs: number; countdownText: string; dateIso: string } | null {
  const alarm = normalizeAlarmPayload(raw);
  if (!alarm.enabled || !Number.isFinite(now.getTime()) || (alarm.scheduleType === 'once' && alarm.skipNext)) return null;

  const [hh, mm] = alarm.time.split(':').map(Number);
  const hour = Number.isFinite(hh) ? hh : 7;
  const minute = Number.isFinite(mm) ? mm : 0;

  if (alarm.scheduleType === 'once') {
    if (alarm.scheduleDate && /^\d{4}-\d{2}-\d{2}$/.test(alarm.scheduleDate)) {
      const [y, m, d] = alarm.scheduleDate.split('-').map(Number);
      const target = new Date(y, (m || 1) - 1, d || 1, hour, minute, 0, 0);
      if (target.getFullYear() !== y || target.getMonth() !== m - 1 || target.getDate() !== d || target.getTime() <= now.getTime()) return null;
      return {
        nextFireMs: target.getTime(),
        countdownText: formatCountdownMs(target.getTime() - now.getTime()),
        dateIso: alarm.scheduleDate,
      };
    }
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    return {
      nextFireMs: target.getTime(),
      countdownText: formatCountdownMs(target.getTime() - now.getTime()),
      dateIso: iso,
    };
  }

  const allowedDays =
    alarm.repeatDays && alarm.repeatDays.length > 0 ? alarm.repeatDays : [0, 1, 2, 3, 4, 5, 6];

  let skippedOne = false;
  for (let offset = 0; offset <= 14; offset++) {
    const cand = new Date(now);
    cand.setDate(now.getDate() + offset);
    cand.setHours(hour, minute, 0, 0);
    if (cand.getTime() <= now.getTime()) continue;
    if (!allowedDays.includes(cand.getDay())) continue;
    if (alarm.skipNext && !skippedOne) {
      skippedOne = true;
      continue;
    }
    const iso = `${cand.getFullYear()}-${String(cand.getMonth() + 1).padStart(2, '0')}-${String(cand.getDate()).padStart(2, '0')}`;
    return {
      nextFireMs: cand.getTime(),
      countdownText: formatCountdownMs(cand.getTime() - now.getTime()),
      dateIso: iso,
    };
  }

  return null;
}
