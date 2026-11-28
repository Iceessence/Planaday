import { addDaysIso } from './temporal';
import type { CalendarEventPayload, LifeRecord, RecurrenceRule } from './types';

const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function unescapeIcsText(s: string): string {
  return s.replace(/\\([nN,;\\])/g, (_, ch: string) => ch.toLowerCase() === 'n' ? '\n' : ch);
}

function toIcsDate(dateIso: string): string {
  return dateIso.replace(/-/g, '');
}

function toIcsDateTime(dateIso: string, timeHHMM: string): string {
  return `${toIcsDate(dateIso)}T${timeHHMM.replace(':', '')}00`;
}

function ruleToRrule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${rule.freq.toUpperCase()}`];
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byWeekday?.length) {
    const prefix = rule.bySetPos ? String(rule.bySetPos) : '';
    parts.push(`BYDAY=${rule.byWeekday.map((d) => `${prefix}${ICS_DAYS[d]}`).join(',')}`);
  }
  if (rule.until) parts.push(`UNTIL=${toIcsDate(rule.until)}T235959Z`);
  if (rule.count) parts.push(`COUNT=${rule.count}`);
  return parts.join(';');
}

function parseRrule(rruleStr: string): RecurrenceRule {
  const map = new Map<string, string>();
  for (const part of rruleStr.split(';')) {
    const [k, v] = part.split('=');
    if (k && v) map.set(k.toUpperCase(), v.toUpperCase());
  }
  const freqRaw = (map.get('FREQ') ?? 'DAILY').toLowerCase();
  const freq: RecurrenceRule['freq'] =
    freqRaw === 'weekly' || freqRaw === 'monthly' || freqRaw === 'yearly' ? freqRaw : 'daily';
  const interval = Math.max(1, Number(map.get('INTERVAL') ?? 1) || 1);
  let byWeekday: number[] | undefined;
  let bySetPos: number | undefined;
  const byDay = map.get('BYDAY');
  if (byDay) {
    byWeekday = [];
    for (const token of byDay.split(',')) {
      const m = token.match(/^(-?\d)?(SU|MO|TU|WE|TH|FR|SA)$/);
      if (m) {
        if (m[1]) bySetPos = Number(m[1]);
        const idx = ICS_DAYS.indexOf(m[2]);
        if (idx >= 0) byWeekday.push(idx);
      }
    }
  }
  const untilRaw = map.get('UNTIL');
  const until = untilRaw && untilRaw.length >= 8
    ? `${untilRaw.slice(0, 4)}-${untilRaw.slice(4, 6)}-${untilRaw.slice(6, 8)}`
    : null;
  const count = map.has('COUNT') ? Number(map.get('COUNT')) : null;
  return { freq, interval, byWeekday, bySetPos, until, count };
}

/**
 * Full .ics RFC 5545 export supporting RRULE, BYDAY, UNTIL, COUNT, EXDATE, UID, TZID, and multi-day all-day DTEND.
 */
export function exportEventsToIcs(events: Array<LifeRecord<CalendarEventPayload>>): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dayplana//Edition 2 Life Planner//EN',
    'CALSCALE:GREGORIAN',
  ];

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

  for (const ev of events) {
    const p = ev.payload;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${escapeIcsText(p.icsUid || `${ev.id}@dayplana.local`).replace(/[\r\n]/g, '')}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`SUMMARY:${escapeIcsText(ev.title)}`);

    if (p.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${toIcsDate(p.startDate)}`);
      // RFC 5545 all-day DTEND is exclusive (endDate + 1 day)
      const exclusiveEnd = addDaysIso(p.endDate || p.startDate, 1);
      lines.push(`DTEND;VALUE=DATE:${toIcsDate(exclusiveEnd)}`);
    } else {
      const tz = p.timeZone || 'UTC';
      const st = p.startTime || '09:00';
      const et = p.endTime || '10:00';
      if (p.floating) {
        lines.push(`DTSTART:${toIcsDateTime(p.startDate, st)}`);
        lines.push(`DTEND:${toIcsDateTime(p.endDate || p.startDate, et)}`);
      } else if (tz === 'UTC') {
        lines.push(`DTSTART:${toIcsDateTime(p.startDate, st)}Z`);
        lines.push(`DTEND:${toIcsDateTime(p.endDate || p.startDate, et)}Z`);
      } else {
        if (!/^[A-Za-z0-9_+\-/]+$/.test(tz)) throw new Error('Invalid calendar time zone');
        lines.push(`DTSTART;TZID=${tz}:${toIcsDateTime(p.startDate, st)}`);
        lines.push(`DTEND;TZID=${tz}:${toIcsDateTime(p.endDate || p.startDate, et)}`);
      }
    }

    if (p.location) lines.push(`LOCATION:${escapeIcsText(p.location)}`);
    if (p.notes) lines.push(`DESCRIPTION:${escapeIcsText(p.notes)}`);
    if (p.url) lines.push(`URL:${p.url.replace(/[\r\n]/g, '')}`);
    if (p.eventStatus) lines.push(`STATUS:${p.eventStatus === 'canceled' ? 'CANCELLED' : p.eventStatus.toUpperCase()}`);

    if (ev.recurrence) {
      lines.push(`RRULE:${ruleToRrule(ev.recurrence)}`);
      if (ev.recurrence.exceptions?.length) {
        const exList = ev.recurrence.exceptions.map((d) =>
          p.allDay ? toIcsDate(d) : toIcsDateTime(d, p.startTime || '09:00')
        );
        const utc = !p.allDay && !p.floating && (p.timeZone || 'UTC') === 'UTC';
        const param = p.allDay ? ';VALUE=DATE' : p.floating || utc ? '' : `;TZID=${p.timeZone}`;
        lines.push(`EXDATE${param}:${exList.map(v => utc ? v + 'Z' : v).join(',')}`);
      }
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  const encoder = new TextEncoder();
  return lines.map(line => {
    let folded = '', bytes = 0;
    for (const char of line) {
      const size = encoder.encode(char).length;
      if (bytes + size > 75) { folded += '\r\n '; bytes = 1; }
      folded += char; bytes += size;
    }
    return folded;
  }).join('\r\n') + '\r\n';
}

export interface ImportedIcsEvent {
  uid: string;
  title: string;
  payload: CalendarEventPayload;
  recurrence: RecurrenceRule | null;
}

function parseIcsDateField(rawVal: string, params: string, defaultTz: string) {
  const tzMatch = params.match(/TZID=([^;:]+)/i);
  const tz = tzMatch ? tzMatch[1].replace(/^"|"$/g, '') : defaultTz;
  const isDateOnly = /VALUE=DATE\b/i.test(params) || /^\d{8}$/.test(rawVal);

  const y = rawVal.slice(0, 4);
  const m = rawVal.slice(4, 6);
  const d = rawVal.slice(6, 8);
  const dateIso = `${y}-${m}-${d}`;

  if (isDateOnly) {
    return { dateIso, timeHHMM: undefined, allDay: true, timeZone: tz, floating: true };
  }

  const hh = rawVal.slice(9, 11) || '09';
  const mm = rawVal.slice(11, 13) || '00';
  const isUtc = rawVal.endsWith('Z');
  return {
    dateIso,
    timeHHMM: `${hh}:${mm}`,
    allDay: false,
    timeZone: isUtc ? 'UTC' : tz,
    floating: !tzMatch && !isUtc,
  };
}

/**
 * Full .ics RFC 5545 importer with line unfolding, UID extraction (for dedup), TZID, RRULE, EXDATE, and exclusive multi-day all-day DTEND handling.
 */
export function parseIcsCalendar(icsText: string, defaultTimeZone = 'UTC'): ImportedIcsEvent[] {
  // Unfold folded lines (CRLF + space/tab)
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const events: ImportedIcsEvent[] = [];
  let inEvent = false;
  let current: Record<string, { val: string; params: string }[]> = Object.create(null);
  let nested = 0;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      current = Object.create(null);
      nested = 0;
      continue;
    }
    if (inEvent && /^BEGIN:/i.test(line)) { nested++; continue; }
    if (inEvent && nested > 0) { if (/^END:/i.test(line)) nested--; continue; }
    if (line === 'END:VEVENT') {
      inEvent = false;
      const summary = unescapeIcsText(current.SUMMARY?.[0]?.val || 'Imported Event');
      const uid = current.UID?.[0]?.val || `ics_${Math.random().toString(36).slice(2, 10)}`;
      const dtStartRaw = current.DTSTART?.[0];
      if (!dtStartRaw || !/^\d{8}(?:T\d{6}Z?)?$/.test(dtStartRaw.val)) continue;

      const start = parseIcsDateField(dtStartRaw.val, dtStartRaw.params, defaultTimeZone);
      const dateCheck = new Date(start.dateIso + 'T00:00:00Z');
      if (!Number.isFinite(dateCheck.getTime()) || dateCheck.toISOString().slice(0,10) !== start.dateIso || (start.timeHHMM && !/^([01]\d|2[0-3]):[0-5]\d$/.test(start.timeHHMM))) continue;
      const dtEndRaw = current.DTEND?.[0];
      let endDate = start.dateIso;
      let endTime = start.allDay ? undefined : start.timeHHMM;

      if (dtEndRaw && /^\d{8}(?:T\d{6}Z?)?$/.test(dtEndRaw.val)) {
        const end = parseIcsDateField(dtEndRaw.val, dtEndRaw.params, start.timeZone);
        const endCheck = new Date(end.dateIso + 'T00:00:00Z');
        if (!Number.isFinite(endCheck.getTime()) || endCheck.toISOString().slice(0,10) !== end.dateIso) continue;
        if (start.allDay) {
          // RFC 5545 DTEND for all-day is exclusive; convert to inclusive endDate
          const inclusive = addDaysIso(end.dateIso, -1);
          endDate = inclusive >= start.dateIso ? inclusive : start.dateIso;
        } else {
          endDate = end.dateIso;
          endTime = end.timeHHMM;
        }
      }

      let recurrence: RecurrenceRule | null = null;
      if (current.RRULE?.[0]?.val) {
        recurrence = parseRrule(current.RRULE[0].val);
        if (current.EXDATE?.length) {
          const exDates: string[] = [];
          for (const ex of current.EXDATE) {
            for (const part of ex.val.split(',')) {
              if (part.length >= 8) {
                exDates.push(`${part.slice(0, 4)}-${part.slice(4, 6)}-${part.slice(6, 8)}`);
              }
            }
          }
          recurrence.exceptions = exDates;
        }
      }

      const statusRaw = (current.STATUS?.[0]?.val || 'CONFIRMED').toLowerCase();
      const eventStatus =
        statusRaw === 'tentative' || statusRaw === 'canceled' || statusRaw === 'cancelled'
          ? statusRaw === 'cancelled'
            ? 'canceled'
            : (statusRaw as 'tentative' | 'canceled')
          : 'confirmed';

      events.push({
        uid,
        title: summary,
        recurrence,
        payload: {
          startDate: start.dateIso,
          endDate,
          startTime: start.timeHHMM,
          endTime,
          allDay: start.allDay,
          floating: start.floating,
          timeZone: start.timeZone,
          style: 'soft',
          eventStatus,
          location: current.LOCATION?.[0]?.val ? unescapeIcsText(current.LOCATION[0].val) : undefined,
          notes: current.DESCRIPTION?.[0]?.val ? unescapeIcsText(current.DESCRIPTION[0].val) : undefined,
          url: current.URL?.[0]?.val,
          icsUid: uid,
        },
      });
      continue;
    }

    if (!inEvent || !line.includes(':')) continue;
    let colonIdx = -1, quoted = false;
    for (let i = 0; i < line.length; i++) { if (line[i] === '"') quoted = !quoted; else if (line[i] === ':' && !quoted) { colonIdx = i; break; } }
    if (colonIdx < 0) continue;
    const left = line.slice(0, colonIdx);
    const val = line.slice(colonIdx + 1).trim();
    const semiIdx = left.indexOf(';');
    const name = (semiIdx >= 0 ? left.slice(0, semiIdx) : left).toUpperCase();
    const params = semiIdx >= 0 ? left.slice(semiIdx + 1) : '';
    const arr = current[name] ?? [];
    arr.push({ val, params });
    current[name] = arr;
  }

  return events;
}
