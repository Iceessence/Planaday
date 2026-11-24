import React, { useEffect, useState } from 'react';
import { AlarmClock, Pause, Play, Plus, Timer, X } from 'lucide-react';
import { useApp } from '../../core/AppContext';

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
  const { runningTimers, toggleTimerPause, extendTimer, dismissTimer, records, setActiveView } = useApp();
  const [nowMs, setNowMs] = useState(() => Date.now());

  const activeAlarms = records.filter(
    (r) => r.type === 'alarm' && r.status === 'active' && (r.payload as { enabled?: boolean }).enabled !== false
  );

  useEffect(() => {
    if (runningTimers.length === 0) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [runningTimers.length]);

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
            <span>{formatCountdown(remSec)}</span>
            <button
              type="button"
              className="dp-icon-btn"
              style={{ width: 22, height: 22 }}
              aria-label={t.targetEndMs ? 'Pause timer' : 'Resume timer'}
              onClick={() => void toggleTimerPause(t.id)}
            >
              {t.targetEndMs ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <button
              type="button"
              className="dp-icon-btn"
              style={{ width: 26, height: 22, fontSize: '0.7rem' }}
              title="Add 1 minute"
              onClick={() => void extendTimer(t.id, 60)}
            >
              +1m
            </button>
            <button
              type="button"
              className="dp-icon-btn"
              style={{ width: 22, height: 22 }}
              aria-label="Finish and log timer"
              onClick={() => void dismissTimer(t.id)}
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
            Next Alarm: {activeAlarms[0].title} ({String((activeAlarms[0].payload as { time?: string }).time ?? '07:00')})
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
