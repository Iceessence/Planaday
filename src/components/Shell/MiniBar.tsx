import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlarmClock, Pause, Play, Plus, Timer, X } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { computeNextAlarmTrigger } from '../../core/alarmSchedule';

function formatCountdown(sec: number): string {
  const neg = sec < 0;
  const abs = Math.abs(Math.round(sec));
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const s = abs % 60;
  const core =
    h > 0
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return neg ? `+${core}` : core;
}

export const MiniBar: React.FC = () => {
  const { runningTimers, toggleTimerPause, extendTimer, dismissTimer, records, setActiveView, pushToast } = useApp();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const busyRef = useRef(new Set<string>());
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const activeAlarms = useMemo(() => records.filter(
    (r) => r.type === 'alarm' && r.status === 'active' && (r.payload as { enabled?: boolean }).enabled !== false
  ), [records]);
  const running = runningTimers.some((timer) => timer.targetEndMs !== null);
  const hasAlarms = activeAlarms.length > 0;
  useEffect(() => {
    setNowMs(Date.now());
    if (!running && !hasAlarms) return;
    let timer: number | undefined;
    const tick = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      if (document.hidden) return;
      const now = Date.now();
      setNowMs(now);
      const period = running ? 1000 : 60_000;
      timer = window.setTimeout(tick, period - now % period);
    };
    tick();
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', tick); };
  }, [running, hasAlarms]);
  const minute = Math.floor(nowMs / 60_000);
  const nextAlarm = useMemo(() => {
    const now = new Date(minute * 60_000);
    let earliest: { record: (typeof activeAlarms)[number]; nextFireMs: number } | null = null;
    for (const record of activeAlarms) {
      const next = computeNextAlarmTrigger(record.payload as Record<string, unknown>, now);
      if (next && (!earliest || next.nextFireMs < earliest.nextFireMs)) earliest = { record, nextFireMs: next.nextFireMs };
    }
    return earliest;
  }, [activeAlarms, minute]);
  const run = async (id: string, action: () => Promise<void>) => {
    if (busyRef.current.has(id)) return;
    busyRef.current.add(id); setBusyIds(new Set(busyRef.current));
    try { await action(); }
    catch { pushToast('Timer action failed. Please try again.', { tone: 'warn' }); }
    finally { busyRef.current.delete(id); setBusyIds(new Set(busyRef.current)); }
  };
  if (runningTimers.length === 0 && activeAlarms.length === 0) return null;

  return (
    <div className="dp-minibar" role="region" aria-label="Active Timers and Next Alarm Mini-Bar">
      {runningTimers.map((t) => {
        const remSec =
          t.targetEndMs !== null ? (t.targetEndMs - nowMs) / 1000 : t.remainingSecWhenPaused;
        const overdue = remSec < 0;
        return (
          <div key={t.id} className={`dp-minibar-chip ${overdue ? 'overdue' : ''}`}>
            <Timer size={14} />
            <strong>{t.label}</strong>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCountdown(remSec)}</span>
            <button
              type="button"
              className="dp-icon-btn"
              style={{ width: 22, height: 22 }}
              aria-label={t.targetEndMs !== null ? `Pause ${t.label}` : `Resume ${t.label}`}
              disabled={busyIds.has(t.id)}
              onClick={() => void run(t.id, () => toggleTimerPause(t.id))}
            >
              {t.targetEndMs !== null ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <button
              type="button"
              className="dp-icon-btn"
              style={{ width: 30, height: 22, fontSize: '0.68rem' }}
              title="Add 10 seconds"
              disabled={busyIds.has(t.id)}
              onClick={() => void run(t.id, () => extendTimer(t.id, 10))}
            >
              +10s
            </button>
            <button
              type="button"
              className="dp-icon-btn"
              style={{ width: 28, height: 22, fontSize: '0.68rem' }}
              title="Add 1 minute"
              disabled={busyIds.has(t.id)}
              onClick={() => void run(t.id, () => extendTimer(t.id, 60))}
            >
              +1m
            </button>
            <button
              type="button"
              className="dp-icon-btn"
              style={{ width: 22, height: 22 }}
              aria-label="Finish and log timer"
              disabled={busyIds.has(t.id)}
              onClick={() => void run(t.id, () => dismissTimer(t.id))}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}

      {activeAlarms.length > 0 && (
        <button
          type="button"
          className="dp-minibar-chip"
          style={{ cursor: 'pointer' }}
          onClick={() => setActiveView('alarms')}
        >
          <AlarmClock size={14} />
          <span>
            {nextAlarm ? `Next Alarm: ${nextAlarm.record.title} (${new Date(nextAlarm.nextFireMs).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })})` : 'No upcoming alarm'}
          </span>
        </button>
      )}

      <button
        type="button"
        className="dp-btn dp-btn-ghost dp-btn-sm"
        style={{ marginInlineStart: 'auto' }}
        onClick={() => setActiveView('timers')}
      >
        <Plus size={13} />
        Timers
      </button>
    </div>
  );
};
