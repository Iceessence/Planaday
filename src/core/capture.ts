import { addDaysIso, getWeekdayIso } from './temporal';
import type { RecurrenceRule, RecordType } from './types';

export interface ParsedCapture {
  targetType: RecordType | 'timer';
  title: string;
  date?: string;
  startTime?: string;
  durationMin?: number;
  durationSec?: number;
  location?: string;
  tags: string[];
  recurrence?: RecurrenceRule | null;
  ambiguousNotes: string[];
  rawInput: string;
}

const WEEKDAY_MAP: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

/**
 * Natural-language & prefix Quick Capture parser (Section 04.01).
 * Examples:
 * - "t: Call dentist tomorrow #health"
 * - "Pilates every Tue & Thu 6pm for 45m @Studio #wellness"
 * - "timer 15m Pasta boiling"
 * - "r: Lemon Herb Pasta"
 */
export function parseQuickCapture(rawInput: string, logicalToday: string): ParsedCapture {
  let text = rawInput.trim();
  const ambiguousNotes: string[] = [];
  let targetType: RecordType | 'timer' = 'thought';
  let explicitPrefix = false;

  // Prefix parsing
  const prefixMatch = text.match(/^(t:|task:|e:|event:|c:|chore:|r:|recipe:|n:|note:|g:|grocery:|h:|habit:|cd:|countdown:|p:|person:|timer\s+)/i);
  if (prefixMatch) {
    explicitPrefix = true;
    const p = prefixMatch[1].toLowerCase().trim();
    text = text.slice(prefixMatch[0].length).trim();
    if (p.startsWith('t')) targetType = p.startsWith('timer') ? 'timer' : 'task';
    else if (p.startsWith('e')) targetType = 'event';
    else if (p.startsWith('c')) targetType = p === 'cd:' || p.startsWith('countdown') ? 'countdown' : 'chore';
    else if (p.startsWith('r')) targetType = 'recipe';
    else if (p.startsWith('n')) targetType = 'note';
    else if (p.startsWith('g')) targetType = 'grocery_item';
    else if (p.startsWith('h')) targetType = 'habit';
    else if (p.startsWith('p')) targetType = 'person';
  }

  // Extract #tags
  const tags: string[] = [];
  text = text.replace(/#([a-zA-Z0-9_-]+)/g, (_m, tag) => {
    tags.push(tag.toLowerCase());
    return '';
  });

  // Extract @location
  let location: string | undefined;
  text = text.replace(/@([A-Za-z0-9_.'-]+(?:\s+[A-Z][A-Za-z0-9_-]+)?)/g, (_m, loc) => {
    location = loc.trim();
    return '';
  });

  // Extract duration: supports hours, minutes, AND seconds (e.g. "timer 45s", "timer 1m 30s", "for 45m")
  let durationMin: number | undefined;
  let durationSec: number | undefined;
  const compoundTimerRegex = /\b(?:for\s+)?(?:(\d+)\s*(?:h|hr|hrs|hour|hours)\s*)?(?:(\d+)\s*(?:m|min|mins|minute|minutes)\s*)?(?:(\d+)\s*(?:s|sec|secs|second|seconds))\b/i;
  const secMatch = targetType === 'timer' ? text.match(compoundTimerRegex) : null;
  if (secMatch && (secMatch[1] || secMatch[2] || secMatch[3])) {
    const h = Number(secMatch[1] || 0);
    const m = Number(secMatch[2] || 0);
    const s = Number(secMatch[3] || 0);
    durationSec = h * 3600 + m * 60 + s;
    durationMin = Math.round(durationSec / 60);
    text = text.replace(secMatch[0], '');
  } else {
    const durRegex =
      targetType === 'timer'
        ? /\b(?:for\s+)?(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/i
        : /\bfor\s+(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/i;
    const durMatch = text.match(durRegex);
    if (durMatch) {
      const num = Number(durMatch[1]);
      const unit = durMatch[2].toLowerCase();
      durationMin = unit.startsWith('h') ? Math.round(num * 60) : Math.round(num);
      durationSec = unit.startsWith('h') ? Math.round(num * 3600) : Math.round(num * 60);
      text = text.replace(durMatch[0], '');
    }
  }

  // Extract recurrence: "every Tue & Thu" or "every day" or "every week"
  let recurrence: RecurrenceRule | null = null;
  const everyDaysMatch = text.match(
    /\bevery\s+((?:(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day)?)(?:\s*(?:,|&|and)\s*(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day)?)*)\b/i
  );
  if (everyDaysMatch) {
    const days = everyDaysMatch[1]
      .toLowerCase()
      .split(/\s*(?:,|&|and)\s*/)
      .map((d) => WEEKDAY_MAP[d.trim()])
      .filter((n) => n !== undefined);
    if (days.length > 0) {
      recurrence = { freq: 'weekly', interval: 1, byWeekday: Array.from(new Set(days)).sort() };
      text = text.replace(everyDaysMatch[0], '');
    }
  } else if (/\bevery\s+day\b|\bdaily\b/i.test(text)) {
    recurrence = { freq: 'daily', interval: 1 };
    text = text.replace(/\bevery\s+day\b|\bdaily\b/i, '');
  } else if (/\bevery\s+week\b|\bweekly\b/i.test(text)) {
    recurrence = { freq: 'weekly', interval: 1 };
    text = text.replace(/\bevery\s+week\b|\bweekly\b/i, '');
  }

  // Extract time: "6pm", "6:30 pm", "18:30", "at 9am"
  let startTime: string | undefined;
  const timeMatch = text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(?:at\s+)(\d{2}):(\d{2})\b/i);
  if (timeMatch) {
    if (timeMatch[1]) {
      let h = Number(timeMatch[1]);
      const m = Number(timeMatch[2] ?? '0');
      const mer = timeMatch[3].toLowerCase();
      if (mer === 'pm' && h < 12) h += 12;
      if (mer === 'am' && h === 12) h = 0;
      startTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    } else if (timeMatch[4]) {
      startTime = `${timeMatch[4]}:${timeMatch[5]}`;
    }
    text = text.replace(timeMatch[0], '');
  }

  // Extract date: today, tomorrow, YYYY-MM-DD, or next weekday
  let date: string | undefined;
  if (/\btomorrow\b/i.test(text)) {
    date = addDaysIso(logicalToday, 1);
    text = text.replace(/\btomorrow\b/i, '');
  } else if (/\btoday\b/i.test(text)) {
    date = logicalToday;
    text = text.replace(/\btoday\b/i, '');
  } else {
    const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (isoMatch) {
      date = isoMatch[1];
      text = text.replace(isoMatch[0], '');
    } else if (recurrence?.byWeekday?.length) {
      // Next matching weekday from logicalToday
      const todayW = getWeekdayIso(logicalToday);
      let delta = 7;
      for (const w of recurrence.byWeekday) {
        const d = (w - todayW + 7) % 7;
        if (d < delta) delta = d;
      }
      date = addDaysIso(logicalToday, delta);
    }
  }

  // Smart default type inference when no prefix given
  if (!explicitPrefix) {
    if (startTime || location) {
      targetType = 'event';
      if (!date) date = logicalToday;
    } else if (date || recurrence) {
      targetType = 'task';
    } else {
      targetType = 'thought';
    }
  }

  if (targetType === 'event' && !startTime && !explicitPrefix) {
    ambiguousNotes.push('No explicit time found — will default to all-day unless you pick a time.');
  }
  if (targetType === 'timer' && !durationSec && !durationMin) {
    ambiguousNotes.push('Specify a duration (e.g. 45s, 1m 30s, or 15m) for the countdown timer.');
  }

  const title = text.replace(/\s+/g, ' ').trim() || (targetType === 'timer' ? 'Quick Timer' : 'Untitled');

  return {
    targetType,
    title,
    date,
    startTime,
    durationMin,
    durationSec,
    location,
    tags,
    recurrence,
    ambiguousNotes,
    rawInput,
  };
}
