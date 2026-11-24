// Dynamic Logical-Day Clock, IANA Timezones & Temporal API Engine (Sections 05.01, 08.03, 12.04)

type TemporalNamespace = typeof import('temporal-polyfill').Temporal;

declare global {
  // eslint-disable-next-line no-var
  var Temporal: TemporalNamespace | undefined;
}

let temporalReadyPromise: Promise<TemporalNamespace> | null = null;

/**
 * Uses native Temporal where available (Chrome 144+, Edge 144+, Firefox 139+),
 * dynamically loading the bundled offline `temporal-polyfill` only when missing.
 */
export async function ensureTemporal(): Promise<TemporalNamespace> {
  if (typeof globalThis.Temporal !== 'undefined') {
    return globalThis.Temporal;
  }
  if (!temporalReadyPromise) {
    temporalReadyPromise = import('temporal-polyfill').then((mod) => {
      globalThis.Temporal = mod.Temporal;
      return mod.Temporal;
    });
  }
  return temporalReadyPromise;
}

export function getTemporalSync(): TemporalNamespace {
  if (typeof globalThis.Temporal === 'undefined') {
    throw new Error('Temporal has not been initialized. Await ensureTemporal() at startup.');
  }
  return globalThis.Temporal;
}

export function getSystemTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Computes the user's logical "today" ISO date (YYYY-MM-DD) for any instant and day boundary hour (0..6).
 * Example: with dayBoundaryHour = 4, 02:30 AM on Nov 24 is still logical day Nov 23;
 * at 04:00 AM it rolls over cleanly to Nov 24! Never frozen at boot.
 */
export function computeLogicalDateIso(
  nowInstantMs: number,
  dayBoundaryHour = 0,
  timeZone: string = getSystemTimeZone()
): string {
  const T = globalThis.Temporal;
  if (T) {
    const zdt = T.Instant.fromEpochMilliseconds(nowInstantMs).toZonedDateTimeISO(timeZone);
    const plainDate = zdt.hour < dayBoundaryHour ? zdt.toPlainDate().subtract({ days: 1 }) : zdt.toPlainDate();
    return plainDate.toString();
  }
  // Safe fallback if called before polyfill resolves in a test
  const d = new Date(nowInstantMs);
  const shifted = new Date(d.getTime() - dayBoundaryHour * 3600 * 1000);
  const y = shifted.getFullYear();
  const m = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysIso(dateIso: string, days: number): string {
  const T = globalThis.Temporal;
  if (T) {
    return T.PlainDate.from(dateIso).add({ days }).toString();
  }
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function diffDaysIso(fromIso: string, toIso: string): number {
  const T = globalThis.Temporal;
  if (T) {
    const a = T.PlainDate.from(fromIso);
    const b = T.PlainDate.from(toIso);
    return a.until(b, { largestUnit: 'days' }).days;
  }
  const [y1, m1, d1] = fromIso.split('-').map(Number);
  const [y2, m2, d2] = toIso.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function getWeekdayIso(dateIso: string): number {
  // Returns 0=Sunday .. 6=Saturday
  const T = globalThis.Temporal;
  if (T) {
    const dow = T.PlainDate.from(dateIso).dayOfWeek; // 1=Mon..7=Sun
    return dow === 7 ? 0 : dow;
  }
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function formatDateLocalized(
  dateIso: string,
  locale = 'en-US',
  options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
): string {
  const T = globalThis.Temporal;
  if (T) {
    const pd = T.PlainDate.from(dateIso);
    return pd.toLocaleString(locale, options);
  }
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatTimeDisplay(hhmm: string, format: '12h' | '24h' = '12h'): string {
  if (!hhmm || !hhmm.includes(':')) return hhmm || '';
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  if (format === '24h') {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export interface DstValidationResult {
  valid: boolean;
  ambiguousOrSkipped: boolean;
  resolvedIso: string;
  resolvedTime: string;
  warning?: string;
}

/**
 * Validates and resolves an IANA-zoned event date+time across DST transitions using Temporal.ZonedDateTime.
 */
export function validateZonedEventTime(
  dateIso: string,
  timeHHMM: string,
  timeZone: string
): DstValidationResult {
  const T = getTemporalSync();
  const normalizedTime = timeHHMM.length === 5 ? `${timeHHMM}:00` : timeHHMM;
  const input = `${dateIso}T${normalizedTime}[${timeZone}]`;

  let ambiguousOrSkipped = false;
  let warning: string | undefined;
  try {
    T.ZonedDateTime.from(input, { disambiguation: 'reject' });
  } catch (err) {
    if (err instanceof RangeError) {
      ambiguousOrSkipped = true;
      warning = `${dateIso} ${timeHHMM} in ${timeZone} falls on a Daylight Saving Time transition (skipped or repeated hour).`;
    }
  }

  const resolved = T.ZonedDateTime.from(input, { disambiguation: 'compatible' });
  return {
    valid: true,
    ambiguousOrSkipped,
    resolvedIso: resolved.toString(),
    resolvedTime: `${String(resolved.hour).padStart(2, '0')}:${String(resolved.minute).padStart(2, '0')}`,
    warning,
  };
}

/**
 * Converts a fixed IANA zoned date/time to another target IANA timezone cleanly.
 */
export function convertEventTimeZone(
  dateIso: string,
  timeHHMM: string,
  fromZone: string,
  toZone: string
): { dateIso: string; timeHHMM: string; offsetLabel: string } {
  const T = getTemporalSync();
  const normalizedTime = timeHHMM.length === 5 ? `${timeHHMM}:00` : timeHHMM;
  const src = T.ZonedDateTime.from(`${dateIso}T${normalizedTime}[${fromZone}]`, { disambiguation: 'compatible' });
  const dst = src.withTimeZone(toZone);
  return {
    dateIso: dst.toPlainDate().toString(),
    timeHHMM: `${String(dst.hour).padStart(2, '0')}:${String(dst.minute).padStart(2, '0')}`,
    offsetLabel: dst.offset,
  };
}

/**
 * Shifts a zoned event by delta minutes using UTC/Instant arithmetic so dragging across DST never corrupts duration.
 */
export function shiftZonedEventByMinutes(
  dateIso: string,
  timeHHMM: string,
  timeZone: string,
  deltaMinutes: number
): { dateIso: string; timeHHMM: string } {
  const T = getTemporalSync();
  const normalizedTime = timeHHMM.length === 5 ? `${timeHHMM}:00` : timeHHMM;
  const zdt = T.ZonedDateTime.from(`${dateIso}T${normalizedTime}[${timeZone}]`, { disambiguation: 'compatible' });
  const shifted = zdt.toInstant().add({ minutes: deltaMinutes }).toZonedDateTimeISO(timeZone);
  return {
    dateIso: shifted.toPlainDate().toString(),
    timeHHMM: `${String(shifted.hour).padStart(2, '0')}:${String(shifted.minute).padStart(2, '0')}`,
  };
}

/**
 * Resolves a floating birthday/anniversary month+day in a given year respecting Feb 29 policy.
 */
export function resolveAnnualFloatingDate(
  month: number,
  day: number,
  year: number,
  feb29Policy: 'feb28' | 'mar1' | 'skip' = 'feb28'
): string | null {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (month === 2 && day === 29 && !isLeap) {
    if (feb29Policy === 'skip') return null;
    return feb29Policy === 'mar1' ? `${year}-03-01` : `${year}-02-28`;
  }
  const T = globalThis.Temporal;
  if (T) {
    const md = T.PlainMonthDay.from({ month, day, calendar: 'iso8601' });
    return md.toPlainDate({ year }).toString();
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const COMMON_TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Toronto',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Warsaw',
  'Europe/Athens',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Pacific/Auckland',
];
