import React, { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { audioEngine, type SoundscapeChannel } from '../../core/audio';

export const ZenSheetOverlay: React.FC = () => {
  const {
    zenOpen,
    setZenOpen,
    zenFocusText,
    setZenFocusText,
    runningTimers,
    startCountdownTimer,
    toggleTimerPause,
  } = useApp();

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [rainVol, setRainVol] = useState(0);
  const [brownVol, setBrownVol] = useState(0);

  useEffect(() => {
    if (!zenOpen) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [zenOpen]);

  if (!zenOpen) return null;

  const activeTimer = runningTimers[0] ?? null;
  const remSec = activeTimer
    ? activeTimer.targetEndMs !== null
      ? Math.max(0, Math.round((activeTimer.targetEndMs - nowMs) / 1000))
      : activeTimer.remainingSecWhenPaused
    : null;

  const setSound = (ch: SoundscapeChannel, v: number) => {
    audioEngine.setChannelVolume(ch, v);
    if (ch === 'rain') setRainVol(v);
    if (ch === 'brown') setBrownVol(v);
  };

  return (
    <div className="dp-fullscreen-overlay" role="dialog" aria-label="Distraction-Free Zen Sheet">
      <div className="dp-between" style={{ maxWidth: 820, width: '100%', margin: '0 auto 16px' }}>
        <div className="dp-row">
          <h2>Zen Sheet</h2>
          {activeTimer && remSec !== null ? (
            <button type="button" className="dp-pill highlight" style={{ cursor: 'pointer' }} onClick={() => void toggleTimerPause(activeTimer.id)}>
              ⏱ {activeTimer.label}: {Math.floor(remSec / 60)}:{String(remSec % 60).padStart(2, '0')}
            </button>
          ) : (
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => void startCountdownTimer('Zen Focus', 25 * 60, 'pomodoro')}>
              Start 25m Pomodoro Ring
            </button>
          )}
        </div>
        <div className="dp-row">
          <label className="dp-row" style={{ fontSize: '0.8rem' }}>
            <Volume2 size={14} /> Rain
            <input type="range" min={0} max={1} step={0.1} style={{ width: 64 }} value={rainVol} onChange={(e) => setSound('rain', Number(e.target.value))} />
          </label>
          <label className="dp-row" style={{ fontSize: '0.8rem' }}>
            Brown
            <input type="range" min={0} max={1} step={0.1} style={{ width: 64 }} value={brownVol} onChange={(e) => setSound('brown', Number(e.target.value))} />
          </label>
          <button type="button" className="dp-btn" onClick={() => setZenOpen(false)}>
            Exit Zen (Esc)
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 820, width: '100%', margin: '0 auto', flex: 1 }}>
        <textarea
          autoFocus
          className="dp-textarea"
          style={{
            minHeight: '72dvh',
            fontSize: '1.12rem',
            lineHeight: 1.75,
            border: 'none',
            background: 'transparent',
            outline: 'none',
          }}
          placeholder="Focus calmly on a single note, task draft, or evening journal reflection…"
          value={zenFocusText}
          onChange={(e) => setZenFocusText(e.target.value)}
        />
      </div>
    </div>
  );
};
