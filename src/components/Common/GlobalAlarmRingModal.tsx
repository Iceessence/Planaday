import React, { useEffect, useState } from 'react';
import { AlarmClock, BellOff, Volume2 } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { getRingtoneLabel } from '../../core/audio';
import { formatRepeatDaysSummary, normalizeAlarmPayload } from '../../core/alarmSchedule';
import { ModalDialog } from './ModalDialog';

export const GlobalAlarmRingModal: React.FC = () => {
  const { ringingAlarm, dismissRingingAlarm, snoozeRingingAlarm } = useApp();
  const [answer, setAnswer] = useState('');
  const [mathNums, setMathNums] = useState<[number, number]>([14, 19]);

  useEffect(() => {
    if (ringingAlarm) {
      setAnswer('');
      setMathNums([Math.floor(11 + Math.random() * 18), Math.floor(12 + Math.random() * 17)]);
    }
  }, [ringingAlarm]);

  if (!ringingAlarm) return null;

  const p = normalizeAlarmPayload(ringingAlarm.payload as Record<string, unknown>);
  const challengeOk =
    p.challenge === 'none' ||
    (p.challenge === 'math' && Number(answer.trim()) === mathNums[0] + mathNums[1]) ||
    (p.challenge === 'affirmation' && answer.trim().toLowerCase() === 'i am awake') ||
    (p.challenge === 'memory' && answer.trim() === '4271');

  return (
    <ModalDialog
      open={true}
      title={`⏰ ${ringingAlarm.title}`}
      onClose={dismissRingingAlarm}
    >
      <div className="dp-stack" style={{ gap: 12 }}>
        <div
          className="dp-card dp-stack"
          style={{
            padding: 16,
            textAlign: 'center',
            background: 'color-mix(in oklch, var(--dp-accent) 12%, var(--dp-surface))',
            borderColor: 'var(--dp-accent)',
          }}
        >
          <div style={{ fontSize: '2.4rem', fontWeight: 700, fontFamily: 'var(--dp-font-mono)' }}>
            <AlarmClock size={28} style={{ verticalAlign: '-4px', marginInlineEnd: 8 }} />
            {p.time}
          </div>
          <div className="dp-row" style={{ justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span className="dp-pill">{p.profile}</span>
            <span className="dp-pill">{formatRepeatDaysSummary(p.repeatDays, p.scheduleType, p.scheduleDate)}</span>
            <span className="dp-pill">
              <Volume2 size={12} /> {getRingtoneLabel(p.ringtone, p.ringtoneName)}
            </span>
          </div>
          {p.notes && (
            <p style={{ margin: '6px 0 0', fontSize: '0.9rem' }}>
              {p.notes}
            </p>
          )}
        </div>

        {p.challenge !== 'none' && (
          <div className="dp-card dp-stack" style={{ padding: 12, background: 'var(--dp-surface-2)' }}>
            <strong>Wake-Up Challenge ({p.challenge})</strong>
            <p className="dp-muted" style={{ margin: 0, fontSize: '0.86rem' }}>
              {p.challenge === 'math' && `Solve to dismiss: ${mathNums[0]} + ${mathNums[1]} = ?`}
              {p.challenge === 'affirmation' && 'Type exactly: I am awake'}
              {p.challenge === 'memory' && 'Type the code: 4271'}
            </p>
            <input
              autoFocus
              className="dp-input"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Enter answer to dismiss…"
            />
          </div>
        )}

        <div className="dp-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div className="dp-row" style={{ gap: 6 }}>
            <button
              type="button"
              className="dp-btn"
              onClick={() => snoozeRingingAlarm(p.snoozeMin)}
            >
              😴 Snooze +{p.snoozeMin}m
            </button>
            {p.challenge !== 'none' && (
              <button
                type="button"
                className="dp-btn dp-btn-ghost dp-btn-sm"
                onClick={() => dismissRingingAlarm(false)}
              >
                Emergency Bypass
              </button>
            )}
          </div>
          <button
            type="button"
            className="dp-btn dp-btn-primary"
            disabled={!challengeOk}
            onClick={() => dismissRingingAlarm(true)}
          >
            <BellOff size={15} /> Dismiss &amp; Open Today
          </button>
        </div>
      </div>
    </ModalDialog>
  );
};
