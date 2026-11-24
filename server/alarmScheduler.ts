import type { SyncDatabase } from './db.js';

export interface PushConfig {
  ntfyPushUrl: string;
  timeZone: string;
  notifyTimers: boolean;
  notifyAlarms: boolean;
  notifyEvents: boolean;
  eventLeadMinutes: number;
  notifyChores: boolean;
  choreReminderTime: string;
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/**
 * Background Server Push Scheduler:
 * Runs inside the Docker container even when Chrome/phones are completely closed.
 * Pushes high-priority notifications to user's ntfy.sh or webhook URL for:
 *   1. Active synced Countdown Timers
 *   2. Enabled Smart Alarms
 *   3. Upcoming Calendar Events (configurable lead minutes before start!)
 *   4. Daily Chores Due & Overdue Digest (at configurable HH:MM!)
 */
export class ServerAlarmScheduler {
  private timer: NodeJS.Timeout | null = null;
  private firedKeys = new Set<string>();

  constructor(private readonly syncDb: SyncDatabase) {}

  public getConfig(): PushConfig {
    const boolMeta = (k: string, def: boolean) => {
      const v = this.syncDb.getMeta(k);
      if (v === null || v === undefined) return def;
      return v !== 'false';
    };
    const leadRaw = Number(this.syncDb.getMeta('push_event_lead_min'));
    return {
      ntfyPushUrl: this.syncDb.getMeta('ntfy_push_url') ?? process.env.NTFY_PUSH_URL ?? '',
      timeZone: this.syncDb.getMeta('push_tz') ?? process.env.TZ ?? 'America/Los_Angeles',
      notifyTimers: boolMeta('push_notify_timers', true),
      notifyAlarms: boolMeta('push_notify_alarms', true),
      notifyEvents: boolMeta('push_notify_events', true),
      eventLeadMinutes: Number.isFinite(leadRaw) && leadRaw >= 0 ? leadRaw : 15,
      notifyChores: boolMeta('push_notify_chores', true),
      choreReminderTime: this.syncDb.getMeta('push_chore_time') ?? '09:00',
    };
  }

  public setConfig(cfg: Partial<PushConfig>): PushConfig {
    if (cfg.ntfyPushUrl !== undefined) this.syncDb.setMeta('ntfy_push_url', cfg.ntfyPushUrl.trim());
    if (cfg.timeZone !== undefined && cfg.timeZone.trim()) this.syncDb.setMeta('push_tz', cfg.timeZone.trim());
    if (cfg.notifyTimers !== undefined) this.syncDb.setMeta('push_notify_timers', String(Boolean(cfg.notifyTimers)));
    if (cfg.notifyAlarms !== undefined) this.syncDb.setMeta('push_notify_alarms', String(Boolean(cfg.notifyAlarms)));
    if (cfg.notifyEvents !== undefined) this.syncDb.setMeta('push_notify_events', String(Boolean(cfg.notifyEvents)));
    if (cfg.eventLeadMinutes !== undefined && Number.isFinite(cfg.eventLeadMinutes)) {
      this.syncDb.setMeta('push_event_lead_min', String(Math.max(0, Math.min(180, Math.round(cfg.eventLeadMinutes)))));
    }
    if (cfg.notifyChores !== undefined) this.syncDb.setMeta('push_notify_chores', String(Boolean(cfg.notifyChores)));
    if (cfg.choreReminderTime !== undefined && /^\d{2}:\d{2}$/.test(cfg.choreReminderTime)) {
      this.syncDb.setMeta('push_chore_time', cfg.choreReminderTime);
    }
    return this.getConfig();
  }

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 15000);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async sendPush(title: string, message: string, priority: 'default' | 'high' | 'urgent' = 'high'): Promise<void> {
    const { ntfyPushUrl } = this.getConfig();
    if (!ntfyPushUrl) return;
    try {
      await fetch(ntfyPushUrl, {
        method: 'POST',
        headers: {
          Title: title,
          Priority: priority,
          Tags: 'alarm_clock,calendar',
        },
        body: message,
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      // Non-fatal network error
    }
  }

  public async tick(): Promise<void> {
    const cfg = this.getConfig();
    if (!cfg.ntfyPushUrl) return;

    const now = new Date();
    const nowMs = now.getTime();

    // 1. Active synced countdown timers
    if (cfg.notifyTimers) {
      const timers = this.syncDb.getActiveRecordsByType('timer');
      for (const t of timers) {
        if (t.status !== 'active') continue;
        const payload = (t.payload ?? {}) as { targetEndMs?: number | null };
        if (typeof payload.targetEndMs === 'number' && payload.targetEndMs <= nowMs && nowMs - payload.targetEndMs < 90_000) {
          const key = `timer:${t.id}:${payload.targetEndMs}`;
          if (!this.firedKeys.has(key)) {
            this.firedKeys.add(key);
            await this.sendPush(`Timer Finished: ${t.title}`, `Your Dayplana timer "${t.title}" has completed!`, 'high');
          }
        }
      }
    }

    // Resolve current local date & HH:MM in user's configured timezone
    let currentHHMM = '';
    let currentDate = '';
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: cfg.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(now);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
      currentDate = `${get('year')}-${get('month')}-${get('day')}`;
      const h = get('hour') === '24' ? '00' : get('hour');
      currentHHMM = `${h}:${get('minute')}`;
    } catch {
      return;
    }
    const nowMin = hhmmToMinutes(currentHHMM);

    // 2. Enabled Smart Alarms
    if (cfg.notifyAlarms) {
      const alarms = this.syncDb.getActiveRecordsByType('alarm');
      for (const a of alarms) {
        const p = (a.payload ?? {}) as { time?: string; enabled?: boolean; skipNext?: boolean; profile?: string };
        if (!p.enabled || p.skipNext || !p.time) continue;
        if (p.time === currentHHMM) {
          const key = `alarm:${a.id}:${currentDate}:${currentHHMM}`;
          if (!this.firedKeys.has(key)) {
            this.firedKeys.add(key);
            await this.sendPush(
              `Dayplana Alarm: ${a.title}`,
              `${p.time} (${p.profile || 'Alarm'}) — Open Dayplana to start your day.`,
              'urgent'
            );
          }
        }
      }
    }

    // 3. Upcoming Calendar Events (configurable lead minutes before start)
    if (cfg.notifyEvents) {
      const events = this.syncDb.getActiveRecordsByType('event');
      for (const ev of events) {
        if (ev.status !== 'active') continue;
        const p = (ev.payload ?? {}) as {
          startDate?: string;
          startTime?: string;
          allDay?: boolean;
          remindersMin?: number[];
          location?: string;
        };
        if (p.allDay || !p.startTime || p.startDate !== currentDate) continue;
        const startMin = hhmmToMinutes(p.startTime);
        const leads = p.remindersMin?.length ? p.remindersMin : [cfg.eventLeadMinutes];
        for (const lead of leads) {
          if (startMin - lead === nowMin) {
            const key = `event:${ev.id}:${currentDate}:${lead}`;
            if (!this.firedKeys.has(key)) {
              this.firedKeys.add(key);
              const when = lead === 0 ? 'starting now' : `in ${lead} min (${p.startTime})`;
              await this.sendPush(
                `Upcoming Event: ${ev.title}`,
                `${ev.title} is ${when}${p.location ? ` · ${p.location}` : ''}`,
                'high'
              );
            }
          }
        }
      }
    }

    // 4. Daily Due / Overdue Chores Reminder
    if (cfg.notifyChores && currentHHMM === cfg.choreReminderTime) {
      const key = `chores:${currentDate}:${cfg.choreReminderTime}`;
      if (!this.firedKeys.has(key)) {
        const chores = this.syncDb.getActiveRecordsByType('chore');
        const due = chores.filter((c) => {
          const p = (c.payload ?? {}) as { nextDueDate?: string; paused?: boolean };
          return c.status === 'active' && !p.paused && p.nextDueDate && p.nextDueDate <= currentDate;
        });
        if (due.length > 0) {
          this.firedKeys.add(key);
          const names = due.slice(0, 4).map((c) => c.title).join(', ');
          await this.sendPush(
            `Dayplana Chores Due (${due.length})`,
            `Due or overdue today: ${names}${due.length > 4 ? ` +${due.length - 4} more` : ''}`,
            'default'
          );
        }
      }
    }

    // 5. Scheduled Medication Reminders
    if (cfg.notifyAlarms) {
      const meds = this.syncDb.getActiveRecordsByType('medication');
      for (const m of meds) {
        if (m.status !== 'active') continue;
        const p = (m.payload ?? {}) as {
          dose?: string;
          timeOfDay?: string;
          secondTimeOfDay?: string;
          reminderEnabled?: boolean;
          skippedLog?: Array<{ date: string }>;
        };
        if (p.reminderEnabled === false) continue;
        if ((p.skippedLog ?? []).some((s) => s.date === currentDate)) continue;
        const times = [p.timeOfDay, p.secondTimeOfDay].filter((t): t is string => Boolean(t));
        for (const t of times) {
          if (t === currentHHMM) {
            const key = `med:${m.id}:${currentDate}:${t}`;
            if (!this.firedKeys.has(key)) {
              this.firedKeys.add(key);
              await this.sendPush(
                `Medication Reminder: ${m.title}`,
                `Time to take ${m.title} (${p.dose || 'scheduled dose'}) at ${t}`,
                'high'
              );
            }
          }
        }
      }
    }

    if (this.firedKeys.size > 500) this.firedKeys.clear();
  }
}
