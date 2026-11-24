import type { SyncDatabase } from './db.js';

export interface PushConfig {
  ntfyPushUrl: string;
  timeZone: string;
}

/**
 * Background Server Alarm & Timer Push Scheduler:
 * Runs inside the Docker container even when Chrome/phones are completely closed.
 * When the user sets an ntfy.sh or webhook URL in Settings, sends high-priority push alerts
 * when synced Smart Alarms or Countdown Timers fire!
 */
export class ServerAlarmScheduler {
  private timer: NodeJS.Timeout | null = null;
  private firedKeys = new Set<string>();

  constructor(private readonly syncDb: SyncDatabase) {}

  public getConfig(): PushConfig {
    return {
      ntfyPushUrl: this.syncDb.getMeta('ntfy_push_url') ?? process.env.NTFY_PUSH_URL ?? '',
      timeZone: this.syncDb.getMeta('push_tz') ?? process.env.TZ ?? 'America/Los_Angeles',
    };
  }

  public setConfig(cfg: Partial<PushConfig>): PushConfig {
    if (cfg.ntfyPushUrl !== undefined) this.syncDb.setMeta('ntfy_push_url', cfg.ntfyPushUrl.trim());
    if (cfg.timeZone !== undefined && cfg.timeZone.trim()) this.syncDb.setMeta('push_tz', cfg.timeZone.trim());
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

  private async sendPush(title: string, message: string, priority: 'high' | 'urgent' = 'high'): Promise<void> {
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

    // 1. Check active synced countdown timers
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

    // 2. Check enabled Smart Alarms in user's timezone
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

    if (this.firedKeys.size > 500) this.firedKeys.clear();
  }
}
