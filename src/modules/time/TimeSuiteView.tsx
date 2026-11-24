import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlarmClock,
  Clock,
  Download,
  Flag,
  Moon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Timer,
  Volume2,
  Watch,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { COMMON_TIMEZONES, convertEventTimeZone } from '../../core/temporal';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { createId, db, storeBlob } from '../../core/db';
import { audioEngine, type SoundscapeChannel } from '../../core/audio';
import {
  detectRuntimePlatform,
  requestAlarmNotificationPermission,
  scheduleNativeNotification,
  syncPushConfigToServer,
} from '../../core/nativeAlarms';
import { recordsToCsv, triggerBrowserDownload } from '../../core/backup';
import { ModalDialog } from '../../components/Common/ModalDialog';
import type { CalendarEventPayload, LifeRecord } from '../../core/types';

export interface StopwatchLap {
  index: number;
  splitMs: number;
  lapMs: number;
}

export function formatStopwatchMs(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  const h = Math.floor(safe / 3600000);
  const m = Math.floor((safe % 3600000) / 60000);
  const s = Math.floor((safe % 60000) / 1000);
  const cs = Math.floor((safe % 1000) / 10);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function exportStopwatchLapsToCsv(laps: StopwatchLap[]): string {
  const avg = laps.length ? laps.reduce((s, l) => s + l.lapMs, 0) / laps.length : 0;
  return recordsToCsv(
    ['Lap', 'LapTime', 'SplitTime', 'DeltaVsPrevMs', 'DeltaVsAvgMs'],
    laps.map((l, idx) => {
      const prev = idx > 0 ? laps[idx - 1].lapMs : l.lapMs;
      return [
        l.index,
        formatStopwatchMs(l.lapMs),
        formatStopwatchMs(l.splitMs),
        Math.round(l.lapMs - prev),
        Math.round(l.lapMs - avg),
      ];
    })
  );
}

const ALARM_PROFILES = ['Workday', 'Weekend', 'Travel', 'Early Flight', 'Power Nap'] as const;

export const TimeSuiteView: React.FC<{ initialTab: 'clock' | 'alarms' | 'timers' | 'stopwatch' }> = ({
  initialTab,
}) => {
  const {
    settings,
    patchSettings,
    records,
    logicalToday,
    pushToast,
    runningTimers,
    startCountdownTimer,
    toggleTimerPause,
    extendTimer,
    dismissTimer,
    setActiveView,
  } = useApp();
  const runtimeInfo = useMemo(() => detectRuntimePlatform(), []);

  const [tab, setTab] = useState<'clock' | 'alarms' | 'timers' | 'stopwatch'>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  // Clock & World Clock Slider state
  const [clockStyle, setClockStyle] = useState<'analog' | 'digital' | 'flip'>('analog');
  const [now, setNow] = useState(() => new Date());
  const [nightstandOpen, setNightstandOpen] = useState(false);
  const [burnInShift, setBurnInShift] = useState({ x: 0, y: 0 });
  const [pinnedZones, setPinnedZones] = useState<string[]>([
    settings.defaultTimeZone,
    'America/New_York',
    'Europe/London',
    'Asia/Tokyo',
  ]);
  const [addZoneVal, setAddZoneVal] = useState('Europe/Berlin');
  const [sliderMinutes, setSliderMinutes] = useState(14 * 60); // 14:00 local

  // Smart Alarms state
  const [alarmTitle, setAlarmTitle] = useState('Morning Wake-Up');
  const [alarmTime, setAlarmTime] = useState('07:00');
  const [alarmProfile, setAlarmProfile] = useState<(typeof ALARM_PROFILES)[number]>('Workday');
  const [alarmChallenge, setAlarmChallenge] = useState<'none' | 'math' | 'affirmation' | 'memory'>('math');
  const [alarmRampSec, setAlarmRampSec] = useState(30);
  const [alarmSnoozeMin, setAlarmSnoozeMin] = useState(9);
  const [alarmMaxSnooze, setAlarmMaxSnooze] = useState(3);
  const [ringingAlarm, setRingingAlarm] = useState<LifeRecord | null>(null);
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const [mathPair] = useState(() => [14, 19]);

  // Timers, Pomodoro, Soundscapes & Interval Builder state (supports Hours + Minutes + Seconds!)
  const [timerLabel, setTimerLabel] = useState('Deep Work');
  const [timerHours, setTimerHours] = useState(0);
  const [timerMin, setTimerMin] = useState(25);
  const [timerSec, setTimerSec] = useState(0);
  const [pomoFocus, setPomoFocus] = useState(25);
  const [pomoShort, setPomoShort] = useState(5);
  const [pomoLong, setPomoLong] = useState(15);
  const [pomoInterrupt, setPomoInterrupt] = useState('');
  const [soundVols, setSoundVols] = useState<Record<SoundscapeChannel, number>>({
    brown: 0,
    pink: 0,
    white: 0,
    rain: 0,
    cafe: 0,
    lofi: 0,
  });
  const [intervalName, setIntervalName] = useState('HIIT / Study Circuit');
  const [intervalStepsText, setIntervalStepsText] = useState('Warmup:3, Focus:20, Stretch:5');
  const [activeIntervalRun, setActiveIntervalRun] = useState<{
    name: string;
    steps: Array<{ label: string; sec: number }>;
    idx: number;
    remSec: number;
  } | null>(null);

  // Precision Stopwatch state (HH:MM:SS.cc)
  const [swRunning, setSwRunning] = useState(false);
  const [swElapsedMs, setSwElapsedMs] = useState(0);
  const [swLaps, setSwLaps] = useState<StopwatchLap[]>([]);
  const swStartRef = useRef<number | null>(null);
  const swBaseRef = useRef<number>(0);

  const timeLedger = useLiveQuery(() => db.timeLedger.orderBy('startedAt').reverse().limit(40).toArray(), []) ?? [];
  const alarms = useMemo(() => records.filter((r) => r.type === 'alarm'), [records]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 500);
    return () => window.clearInterval(id);
  }, []);

  // Nightstand Wake Lock & OLED burn-in shift
  useEffect(() => {
    if (!nightstandOpen) return;
    let wakeLock: { release?: () => Promise<void> } | null = null;
    const nav = navigator as unknown as { wakeLock?: { request: (type: string) => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((wl) => { wakeLock = wl; }).catch(() => { /* optional */ });
    const shiftId = window.setInterval(() => {
      setBurnInShift({ x: Math.round((Math.random() - 0.5) * 28), y: Math.round((Math.random() - 0.5) * 28) });
    }, 30000);
    return () => {
      window.clearInterval(shiftId);
      void wakeLock?.release?.();
    };
  }, [nightstandOpen]);

  // Precision Stopwatch RAF tick
  useEffect(() => {
    if (!swRunning) return;
    let raf = 0;
    const tick = () => {
      if (swStartRef.current !== null) {
        setSwElapsedMs(swBaseRef.current + (performance.now() - swStartRef.current));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [swRunning]);

  // Active Interval Runner tick
  useEffect(() => {
    if (!activeIntervalRun) return;
    const id = window.setInterval(() => {
      setActiveIntervalRun((prev) => {
        if (!prev) return null;
        if (prev.remSec > 1) return { ...prev, remSec: prev.remSec - 1 };
        const nextIdx = prev.idx + 1;
        if (nextIdx >= prev.steps.length) {
          audioEngine.playChime('complete');
          audioEngine.speakStep(`${prev.name} complete`);
          return null;
        }
        audioEngine.playChime('bell');
        audioEngine.speakStep(`Next: ${prev.steps[nextIdx].label}`);
        return { ...prev, idx: nextIdx, remSec: prev.steps[nextIdx].sec };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [activeIntervalRun]);

  const fastestLapMs = swLaps.length ? Math.min(...swLaps.map((l) => l.lapMs)) : null;
  const slowestLapMs = swLaps.length ? Math.max(...swLaps.map((l) => l.lapMs)) : null;

  const sliderHHMM = `${String(Math.floor(sliderMinutes / 60) % 24).padStart(2, '0')}:${String(sliderMinutes % 60).padStart(2, '0')}`;

  // Analog hand angles
  const secDeg = now.getSeconds() * 6;
  const minDeg = now.getMinutes() * 6 + now.getSeconds() * 0.1;
  const hourDeg = (now.getHours() % 12) * 30 + now.getMinutes() * 0.5;

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <div className="dp-between">
        <h2>Complete Time Suite</h2>
        <div className="dp-row">
          {(
            [
              ['clock', 'Clock & World', <Clock size={14} key="c" />],
              ['alarms', 'Smart Alarms', <AlarmClock size={14} key="a" />],
              ['timers', 'Timers, Pomodoro & Audio', <Timer size={14} key="t" />],
              ['stopwatch', 'Stopwatch & Ledger', <Watch size={14} key="s" />],
            ] as const
          ).map(([id, label, icon]) => (
            <button key={id} type="button" className={`dp-btn dp-btn-sm ${tab === id ? 'dp-btn-primary' : ''}`} onClick={() => setTab(id)}>
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* --- TAB 1: LOCAL CLOCK, WORLD CLOCK SLIDER & NIGHTSTAND MODE --- */}
      {tab === 'clock' && (
        <div className="dp-stack">
          <div className="dp-grid-2">
            <div className="dp-card dp-stack" style={{ alignItems: 'center', textAlign: 'center', padding: 20 }}>
              <div className="dp-row">
                {(['analog', 'digital', 'flip'] as const).map((s) => (
                  <button key={s} type="button" className={`dp-btn dp-btn-sm ${clockStyle === s ? 'dp-btn-primary' : ''}`} onClick={() => setClockStyle(s)}>
                    {s}
                  </button>
                ))}
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => setNightstandOpen(true)}>
                  <Moon size={14} /> Nightstand
                </button>
              </div>

              {clockStyle === 'analog' && (
                <svg viewBox="0 0 200 200" width={180} height={180} aria-label="Analog clock">
                  <circle cx="100" cy="100" r="92" fill="var(--dp-surface-2)" stroke="var(--dp-border)" strokeWidth="4" />
                  {Array.from({ length: 12 }, (_, i) => (
                    <line
                      key={i}
                      x1="100"
                      y1="16"
                      x2="100"
                      y2="25"
                      stroke="var(--dp-muted)"
                      strokeWidth="2.5"
                      transform={`rotate(${i * 30} 100 100)`}
                    />
                  ))}
                  <line x1="100" y1="100" x2="100" y2="52" stroke="var(--dp-ink)" strokeWidth="5" strokeLinecap="round" transform={`rotate(${hourDeg} 100 100)`} />
                  <line x1="100" y1="100" x2="100" y2="34" stroke="var(--dp-ink)" strokeWidth="3.2" strokeLinecap="round" transform={`rotate(${minDeg} 100 100)`} />
                  <line x1="100" y1="108" x2="100" y2="26" stroke="var(--dp-accent)" strokeWidth="1.8" strokeLinecap="round" transform={`rotate(${secDeg} 100 100)`} />
                  <circle cx="100" cy="100" r="4.5" fill="var(--dp-accent)" />
                </svg>
              )}

              {clockStyle === 'digital' && (
                <div style={{ fontSize: '3.1rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--dp-font-mono)' }}>
                  {now.toLocaleTimeString(settings.locale, { hour12: settings.timeFormat === '12h' })}
                </div>
              )}

              {clockStyle === 'flip' && (
                <div className="dp-row" style={{ gap: 10 }}>
                  {[
                    String(settings.timeFormat === '12h' ? now.getHours() % 12 || 12 : now.getHours()).padStart(2, '0'),
                    String(now.getMinutes()).padStart(2, '0'),
                    String(now.getSeconds()).padStart(2, '0'),
                  ].map((part, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: '#1a1816',
                        color: '#faf3e4',
                        padding: '14px 18px',
                        borderRadius: 10,
                        fontSize: '2.4rem',
                        fontFamily: 'var(--dp-font-mono)',
                        fontWeight: 700,
                        boxShadow: 'inset 0 -2px 0 rgb(255 255 255 / 0.15)',
                      }}
                    >
                      {part}
                    </div>
                  ))}
                </div>
              )}

              <span className="dp-muted">{settings.defaultTimeZone}</span>
            </div>

            {/* World Clock Meeting Slider (Section 10.01) */}
            <div className="dp-card dp-stack">
              <div className="dp-between">
                <strong>World Clock Meeting Slider</strong>
                <button
                  type="button"
                  className="dp-btn dp-btn-primary dp-btn-sm"
                  onClick={async () => {
                    const endM = sliderMinutes + 60;
                    const endHHMM = `${String(Math.floor(endM / 60) % 24).padStart(2, '0')}:${String(endM % 60).padStart(2, '0')}`;
                    await createRecord<CalendarEventPayload>('event', `Global Meeting (${sliderHHMM})`, {
                      startDate: logicalToday,
                      endDate: logicalToday,
                      startTime: sliderHHMM,
                      endTime: endHHMM,
                      allDay: false,
                      floating: false,
                      timeZone: settings.defaultTimeZone,
                      style: 'soft',
                      emoji: '🌍',
                      eventStatus: 'confirmed',
                    });
                    pushToast(`Created meeting at ${sliderHHMM} ${settings.defaultTimeZone}`, { canUndo: true });
                  }}
                >
                  1-Click Create Event
                </button>
              </div>
              <label className="dp-stack" style={{ gap: 4 }}>
                <span className="dp-muted" style={{ fontSize: '0.84rem' }}>
                  Drag slider to convert meeting time ({sliderHHMM} in {settings.defaultTimeZone}):
                </span>
                <input
                  type="range"
                  min={0}
                  max={23 * 60 + 45}
                  step={15}
                  value={sliderMinutes}
                  onChange={(e) => setSliderMinutes(Number(e.target.value))}
                />
              </label>

              <div className="dp-stack" style={{ gap: 6 }}>
                {pinnedZones.map((tz) => {
                  const conv = convertEventTimeZone(logicalToday, sliderHHMM, settings.defaultTimeZone, tz);
                  const hr = Number(conv.timeHHMM.slice(0, 2));
                  const isWorking = hr >= 9 && hr < 18;
                  const isDay = hr >= 6 && hr < 20;
                  return (
                    <div key={tz} className="dp-between" style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--dp-surface-2)' }}>
                      <div>
                        <strong>{tz}</strong> <span className="dp-muted" style={{ fontSize: '0.78rem' }}>({conv.offsetLabel})</span>
                      </div>
                      <div className="dp-row">
                        <span className="dp-pill">{isDay ? '☀️' : '🌙'} {conv.timeHHMM}</span>
                        {isWorking && <span className="dp-pill highlight">Work hrs</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="dp-row">
                <select aria-label="Pin timezone" className="dp-select" style={{ flex: 1 }} value={addZoneVal} onChange={(e) => setAddZoneVal(e.target.value)}>
                  {COMMON_TIMEZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={() => setPinnedZones((p) => (p.includes(addZoneVal) ? p : [...p, addZoneVal]))}
                >
                  Pin City
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 2: SMART ALARMS & WAKE-UP ROUTINES --- */}
      {tab === 'alarms' && (
        <div className="dp-stack">
          <div className="dp-card dp-stack" style={{ padding: 14, background: 'var(--dp-surface-2)' }}>
            <div className="dp-between">
              <strong>
                Background Alarm Delivery ({runtimeInfo.platform === 'capacitor-native' ? 'Native Mobile OS Alarms Active ✓' : runtimeInfo.platform === 'electron-desktop' ? 'Native Desktop App Active ✓' : 'Browser + Docker Push Relay'})
              </strong>
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={async () => {
                  const ok = await requestAlarmNotificationPermission();
                  pushToast(ok ? 'Notification permission granted!' : 'Permission denied in browser settings.');
                }}
              >
                Enable OS Notifications
              </button>
            </div>
            <p className="dp-muted" style={{ margin: 0, fontSize: '0.82rem' }}>
              {runtimeInfo.canWakeWhenBrowserClosed
                ? 'Running as a native app — alarms schedule directly on your OS and fire even when closed or locked.'
                : 'To make alarms wake your phone even when Chrome is completely closed: install the native Dayplana Android APK / Desktop app, OR enter a free ntfy.sh topic below so your Docker server pushes alarms directly to your phone!'}
            </p>
            <div className="dp-row">
              <input
                className="dp-input"
                style={{ flex: 2 }}
                placeholder="Optional ntfy push URL (e.g., https://ntfy.sh/my-private-dayplana-alarms)"
                value={settings.ntfyPushUrl || ''}
                onChange={(e) => void patchSettings({ ntfyPushUrl: e.target.value })}
              />
              <button
                type="button"
                className="dp-btn dp-btn-primary dp-btn-sm"
                onClick={async () => {
                  const saved = await syncPushConfigToServer(
                    settings.syncServerUrl,
                    settings.ntfyPushUrl || '',
                    settings.defaultTimeZone
                  );
                  pushToast(saved ? 'Synced background push URL to Docker server!' : 'Saved locally (connect Docker server to activate background push).');
                }}
              >
                Save Push Relay
              </button>
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={async () => {
                  try {
                    const base = settings.syncServerUrl.trim().replace(/\/+$/, '');
                    await syncPushConfigToServer(base, settings.ntfyPushUrl || '', settings.defaultTimeZone);
                    const r = await fetch(`${base}/api/push-config/test`, { method: 'POST' });
                    const j = (await r.json()) as { ok?: boolean; error?: string };
                    pushToast(j.ok ? 'Test push sent to your phone!' : j.error || 'Push test failed');
                  } catch {
                    pushToast('Could not reach Docker push test endpoint.', { tone: 'warn' });
                  }
                }}
              >
                Send Test Push
              </button>
            </div>
          </div>

          <form
            className="dp-card dp-stack"
            style={{ padding: 12 }}
            onSubmit={async (e) => {
              e.preventDefault();
              const created = await createRecord('alarm', alarmTitle.trim() || 'Alarm', {
                time: alarmTime,
                profile: alarmProfile,
                enabled: true,
                challenge: alarmChallenge,
                volumeRampSec: alarmRampSec,
                snoozeMin: alarmSnoozeMin,
                maxSnoozes: alarmMaxSnooze,
                skipNext: false,
              });
              // Schedule next OS native alarm when running inside Capacitor Android/iOS app
              const [hh, mm] = alarmTime.split(':').map(Number);
              const nextFire = new Date();
              nextFire.setHours(hh || 7, mm || 0, 0, 0);
              if (nextFire.getTime() <= Date.now()) nextFire.setDate(nextFire.getDate() + 1);
              await scheduleNativeNotification(created.id, `Dayplana Alarm: ${created.title}`, `${alarmTime} (${alarmProfile})`, nextFire.getTime());
              pushToast(`Saved ${alarmProfile} alarm for ${alarmTime}`);
            }}
          >
            <div className="dp-row">
              <input className="dp-input" style={{ flex: 2 }} value={alarmTitle} onChange={(e) => setAlarmTitle(e.target.value)} placeholder="Alarm label" />
              <input type="time" className="dp-input" style={{ width: 130 }} value={alarmTime} onChange={(e) => setAlarmTime(e.target.value)} />
              <select aria-label="Profile" className="dp-select" style={{ width: 'auto' }} value={alarmProfile} onChange={(e) => setAlarmProfile(e.target.value as (typeof ALARM_PROFILES)[number])}>
                {ALARM_PROFILES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button type="submit" className="dp-btn dp-btn-primary">
                <Plus size={14} /> Add Alarm
              </button>
            </div>
            <details className="dp-details">
              <summary>More options (Dismiss Challenge, Volume Ramp, Snooze Cap, Custom Local Audio)</summary>
              <div className="dp-row" style={{ marginTop: 10 }}>
                <select aria-label="Dismiss challenge" className="dp-select" style={{ width: 'auto' }} value={alarmChallenge} onChange={(e) => setAlarmChallenge(e.target.value as typeof alarmChallenge)}>
                  <option value="none">No dismiss challenge</option>
                  <option value="math">Math Puzzle Challenge</option>
                  <option value="affirmation">Affirmation Typing Challenge</option>
                  <option value="memory">Memory Pattern Challenge</option>
                </select>
                <label className="dp-row">
                  <span className="dp-muted">Ramp (s):</span>
                  <input type="number" min={15} max={60} className="dp-input" style={{ width: 64 }} value={alarmRampSec} onChange={(e) => setAlarmRampSec(Number(e.target.value) || 30)} />
                </label>
                <label className="dp-row">
                  <span className="dp-muted">Snooze (m):</span>
                  <input type="number" min={1} max={30} className="dp-input" style={{ width: 64 }} value={alarmSnoozeMin} onChange={(e) => setAlarmSnoozeMin(Number(e.target.value) || 9)} />
                </label>
                <label className="dp-row">
                  <span className="dp-muted">Max Snoozes:</span>
                  <input type="number" min={1} max={10} className="dp-input" style={{ width: 64 }} value={alarmMaxSnooze} onChange={(e) => setAlarmMaxSnooze(Number(e.target.value) || 3)} />
                </label>
                <label className="dp-btn dp-btn-sm">
                  Upload Audio (MP3/WAV)
                  <input
                    type="file"
                    accept="audio/*"
                    hidden
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        await storeBlob(f, f.name);
                        pushToast(`Stored custom alarm audio "${f.name}" locally`);
                      }
                    }}
                  />
                </label>
              </div>
            </details>
          </form>

          {/* Bulk Profile Toggles */}
          <div className="dp-row">
            <span className="dp-muted" style={{ fontSize: '0.82rem' }}>Bulk Toggle Profile:</span>
            {ALARM_PROFILES.map((prof) => (
              <button
                key={prof}
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={async () => {
                  const list = alarms.filter((a) => (a.payload as { profile?: string }).profile === prof);
                  const anyOn = list.some((a) => (a.payload as { enabled?: boolean }).enabled);
                  for (const a of list) {
                    await updateRecord(a.id, (c) => ({ ...c, payload: { ...c.payload, enabled: !anyOn } }));
                  }
                  pushToast(`Toggled ${prof} profile alarms`);
                }}
              >
                {prof}
              </button>
            ))}
          </div>

          <div className="dp-stack">
            {alarms.map((a) => {
              const p = a.payload as { time: string; profile: string; enabled: boolean; challenge: string; skipNext?: boolean };
              return (
                <div key={a.id} className="dp-card dp-between" style={{ padding: 12 }}>
                  <div>
                    <strong style={{ fontSize: '1.1rem' }}>{p.time}</strong> · {a.title}{' '}
                    <span className="dp-pill">{p.profile}</span>
                    {p.challenge !== 'none' && <span className="dp-pill">Challenge: {p.challenge}</span>}
                    {p.skipNext && <span className="dp-pill highlight">Skipping next</span>}
                  </div>
                  <div className="dp-row">
                    <button
                      type="button"
                      className="dp-btn dp-btn-sm"
                      onClick={() => {
                        audioEngine.playChime('bell', 0.3);
                        setChallengeAnswer('');
                        setRingingAlarm(a);
                      }}
                    >
                      Test Ring
                    </button>
                    <button
                      type="button"
                      className="dp-btn dp-btn-sm"
                      onClick={() => void updateRecord(a.id, (c) => ({ ...c, payload: { ...c.payload, skipNext: !p.skipNext } }))}
                    >
                      {p.skipNext ? 'Unskip' : 'Skip Next'}
                    </button>
                    <input
                      type="checkbox"
                      aria-label={`Enable ${a.title}`}
                      checked={p.enabled}
                      onChange={(e) => void updateRecord(a.id, (c) => ({ ...c, payload: { ...c.payload, enabled: e.target.checked } }))}
                    />
                    <button type="button" className="dp-btn dp-btn-danger dp-btn-sm" onClick={() => void softDeleteRecord(a.id)}>
                      Trash
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- TAB 3: SIMULTANEOUS TIMERS, POMODORO, INTERVAL BUILDER & SOUNDSCAPES --- */}
      {tab === 'timers' && (
        <div className="dp-stack">
          <div className="dp-grid-2">
            {/* Simultaneous Timers (Hours, Minutes & Seconds!) */}
            <div className="dp-card dp-stack">
              <h4>Simultaneous Countdowns (Hours, Minutes & Seconds)</h4>
              <div className="dp-row">
                <input className="dp-input" style={{ flex: 2, minWidth: 140 }} value={timerLabel} onChange={(e) => setTimerLabel(e.target.value)} placeholder="Label (e.g., Oven, Plank, Tea)" />
                <input type="number" aria-label="Hours" min={0} max={23} className="dp-input" style={{ width: 58 }} value={timerHours} onChange={(e) => setTimerHours(Math.max(0, Number(e.target.value) || 0))} />
                <span className="dp-muted" style={{ fontSize: '0.8rem' }}>h</span>
                <input type="number" aria-label="Minutes" min={0} max={599} className="dp-input" style={{ width: 62 }} value={timerMin} onChange={(e) => setTimerMin(Math.max(0, Number(e.target.value) || 0))} />
                <span className="dp-muted" style={{ fontSize: '0.8rem' }}>m</span>
                <input type="number" aria-label="Seconds" min={0} max={59} className="dp-input" style={{ width: 62 }} value={timerSec} onChange={(e) => setTimerSec(Math.max(0, Math.min(59, Number(e.target.value) || 0)))} />
                <span className="dp-muted" style={{ fontSize: '0.8rem' }}>s</span>
                <button
                  type="button"
                  className="dp-btn dp-btn-primary"
                  onClick={() => {
                    const total = timerHours * 3600 + timerMin * 60 + timerSec;
                    if (total <= 0) return;
                    void startCountdownTimer(timerLabel || 'Timer', total);
                  }}
                >
                  Start
                </button>
              </div>
              <div className="dp-row" style={{ gap: 5 }}>
                {(
                  [
                    [15, '15s'],
                    [30, '30s'],
                    [45, '45s'],
                    [60, '1m'],
                    [180, '3m'],
                    [300, '5m'],
                    [600, '10m'],
                    [900, '15m'],
                    [1500, '25m'],
                    [3600, '60m'],
                  ] as const
                ).map(([sec, lbl]) => (
                  <button key={lbl} type="button" className="dp-btn dp-btn-sm" onClick={() => void startCountdownTimer(`${lbl} Timer`, sec)}>
                    {lbl}
                  </button>
                ))}
              </div>
              {runningTimers.map((t) => {
                const remSec = t.targetEndMs !== null ? Math.round((t.targetEndMs - now.getTime()) / 1000) : t.remainingSecWhenPaused;
                const abs = Math.abs(remSec);
                const hh = Math.floor(abs / 3600);
                const mm = Math.floor((abs % 3600) / 60);
                const ss = abs % 60;
                const formatted =
                  hh > 0
                    ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
                    : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
                return (
                  <div key={t.id} className="dp-between" style={{ padding: 10, borderRadius: 8, background: 'var(--dp-surface-2)' }}>
                    <div>
                      <strong>{t.label}</strong>
                      <div style={{ fontFamily: 'var(--dp-font-mono)', fontSize: '1.05rem', color: remSec < 0 ? 'var(--dp-danger)' : undefined }}>
                        {remSec < 0 ? `Overdue +${formatted}` : formatted}
                      </div>
                    </div>
                    <div className="dp-row" style={{ gap: 5 }}>
                      <button type="button" className="dp-btn dp-btn-sm" onClick={() => void toggleTimerPause(t.id)}>
                        {t.targetEndMs ? <Pause size={13} /> : <Play size={13} />}
                      </button>
                      <button type="button" className="dp-btn dp-btn-sm" onClick={() => void extendTimer(t.id, 10)}>+10s</button>
                      <button type="button" className="dp-btn dp-btn-sm" onClick={() => void extendTimer(t.id, 30)}>+30s</button>
                      <button type="button" className="dp-btn dp-btn-sm" onClick={() => void extendTimer(t.id, 60)}>+1m</button>
                      <button type="button" className="dp-btn dp-btn-sm" onClick={() => void dismissTimer(t.id)}>Log & Stop</button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pomodoro Studio */}
            <div className="dp-card dp-stack">
              <h4>Pomodoro Studio</h4>
              <div className="dp-grid-3" style={{ gap: 8 }}>
                <label className="dp-stack" style={{ gap: 4 }}>
                  <span className="dp-muted">Focus (m)</span>
                  <input type="number" className="dp-input" value={pomoFocus} onChange={(e) => setPomoFocus(Number(e.target.value) || 25)} />
                </label>
                <label className="dp-stack" style={{ gap: 4 }}>
                  <span className="dp-muted">Short Break</span>
                  <input type="number" className="dp-input" value={pomoShort} onChange={(e) => setPomoShort(Number(e.target.value) || 5)} />
                </label>
                <label className="dp-stack" style={{ gap: 4 }}>
                  <span className="dp-muted">Long Break</span>
                  <input type="number" className="dp-input" value={pomoLong} onChange={(e) => setPomoLong(Number(e.target.value) || 15)} />
                </label>
              </div>
              <div className="dp-row">
                <button type="button" className="dp-btn dp-btn-primary" onClick={() => void startCountdownTimer('Pomodoro Focus', pomoFocus * 60, 'pomodoro')}>
                  Start Focus ({pomoFocus}m)
                </button>
                <button type="button" className="dp-btn" onClick={() => void startCountdownTimer('Short Break', pomoShort * 60, 'pomodoro')}>
                  Short Break ({pomoShort}m)
                </button>
                <button type="button" className="dp-btn" onClick={() => void startCountdownTimer('Long Break', pomoLong * 60, 'pomodoro')}>
                  Long Break ({pomoLong}m)
                </button>
              </div>
              <input
                className="dp-input"
                placeholder="Interruption note (park distractions here without breaking flow)…"
                value={pomoInterrupt}
                onChange={(e) => setPomoInterrupt(e.target.value)}
              />
            </div>
          </div>

          <div className="dp-grid-2">
            {/* Offline Synthesized Ambient Soundscapes Mixer (Section 10.03) */}
            <div className="dp-card dp-stack">
              <div className="dp-between">
                <h4>
                  <Volume2 size={16} style={{ verticalAlign: '-3px' }} /> Offline Ambient Soundscapes Mixer
                </h4>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={() => {
                    audioEngine.stopAll();
                    setSoundVols({ brown: 0, pink: 0, white: 0, rain: 0, cafe: 0, lofi: 0 });
                  }}
                >
                  Mute All
                </button>
              </div>
              {(
                [
                  ['brown', 'Brown Noise (Warm Deep)'],
                  ['pink', 'Pink Noise (Balanced)'],
                  ['white', 'White Noise (Crisp)'],
                  ['rain', 'Gentle Rain'],
                  ['cafe', 'Cozy Cafe Murmur'],
                  ['lofi', 'Warm Lo-Fi Drone'],
                ] as Array<[SoundscapeChannel, string]>
              ).map(([ch, label]) => (
                <label key={ch} className="dp-between" style={{ fontSize: '0.86rem' }}>
                  <span>{label}</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={soundVols[ch]}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setSoundVols((prev) => ({ ...prev, [ch]: v }));
                      audioEngine.setChannelVolume(ch, v);
                    }}
                  />
                </label>
              ))}
            </div>

            {/* Interval Sequence Builder (Section 10.04) */}
            <div className="dp-card dp-stack">
              <h4>Multi-Step Interval Builder</h4>
              <input className="dp-input" value={intervalName} onChange={(e) => setIntervalName(e.target.value)} placeholder="Sequence name" />
              <input
                className="dp-input"
                value={intervalStepsText}
                onChange={(e) => setIntervalStepsText(e.target.value)}
                placeholder="Format: StepName:Minutes, Step2:Minutes"
              />
              <div className="dp-row">
                <button
                  type="button"
                  className="dp-btn dp-btn-primary dp-btn-sm"
                  onClick={() => {
                    const steps = intervalStepsText
                      .split(',')
                      .map((part) => {
                        const [lbl, mStr] = part.split(':');
                        return { label: (lbl || 'Step').trim(), sec: Math.max(5, Math.round((Number(mStr) || 1) * 60)) };
                      })
                      .filter((s) => s.label);
                    if (steps.length === 0) return;
                    audioEngine.playChime('bell');
                    audioEngine.speakStep(`Starting ${steps[0].label}`);
                    setActiveIntervalRun({ name: intervalName, steps, idx: 0, remSec: steps[0].sec });
                  }}
                >
                  Start Sequence
                </button>
                {activeIntervalRun && (
                  <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveIntervalRun(null)}>
                    Stop
                  </button>
                )}
              </div>
              {activeIntervalRun && (
                <div className="dp-card" style={{ padding: 10, background: 'var(--dp-highlight)', color: 'var(--dp-on-highlight)' }}>
                  <strong>
                    Step {activeIntervalRun.idx + 1}/{activeIntervalRun.steps.length}: {activeIntervalRun.steps[activeIntervalRun.idx].label}
                  </strong>
                  <div style={{ fontFamily: 'var(--dp-font-mono)', fontSize: '1.4rem' }}>
                    {Math.floor(activeIntervalRun.remSec / 60)}:{String(activeIntervalRun.remSec % 60).padStart(2, '0')}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 4: PRECISION STOPWATCH & SHARED TIME LEDGER --- */}
      {tab === 'stopwatch' && (
        <div className="dp-grid-2">
          <div className="dp-card dp-stack" style={{ alignItems: 'center' }}>
            <h4>Precision Stopwatch (HH:MM:SS.cc)</h4>
            <div style={{ fontSize: '2.6rem', fontWeight: 700, fontFamily: 'var(--dp-font-mono)', fontVariantNumeric: 'tabular-nums' }}>
              {formatStopwatchMs(swElapsedMs)}
            </div>
            <div className="dp-row">
              <button
                type="button"
                className="dp-btn dp-btn-primary"
                onClick={() => {
                  if (swRunning) {
                    swBaseRef.current = swElapsedMs;
                    swStartRef.current = null;
                    setSwRunning(false);
                  } else {
                    swStartRef.current = performance.now();
                    setSwRunning(true);
                  }
                }}
              >
                {swRunning ? <Pause size={15} /> : <Play size={15} />} {swRunning ? 'Pause' : 'Start'}
              </button>
              <button
                type="button"
                className="dp-btn"
                disabled={!swRunning && swElapsedMs === 0}
                onClick={() => {
                  const prevSplit = swLaps.length > 0 ? swLaps[swLaps.length - 1].splitMs : 0;
                  setSwLaps((prev) => [
                    ...prev,
                    { index: prev.length + 1, splitMs: swElapsedMs, lapMs: swElapsedMs - prevSplit },
                  ]);
                }}
              >
                <Flag size={14} /> Lap
              </button>
              <button
                type="button"
                className="dp-btn"
                onClick={async () => {
                  if (swElapsedMs >= 1000) {
                    await db.timeLedger.put({
                      id: createId('tlog'),
                      workspaceId: settings.activeWorkspaceId,
                      sourceType: 'stopwatch',
                      label: `Stopwatch Session (${swLaps.length} laps)`,
                      startedAt: new Date(Date.now() - swElapsedMs).toISOString(),
                      endedAt: new Date().toISOString(),
                      activeSeconds: Math.round(swElapsedMs / 1000),
                      date: logicalToday,
                      laps: swLaps.map((l) => Math.round(l.lapMs)),
                    });
                    pushToast('Logged stopwatch session to Time Ledger');
                  }
                  setSwRunning(false);
                  swStartRef.current = null;
                  swBaseRef.current = 0;
                  setSwElapsedMs(0);
                  setSwLaps([]);
                }}
              >
                <RotateCcw size={14} /> Log & Reset
              </button>
              {swLaps.length > 0 && (
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={() => {
                    const csv = exportStopwatchLapsToCsv(swLaps);
                    triggerBrowserDownload(csv, `dayplana-stopwatch-laps-${logicalToday}.csv`, 'text/csv');
                    pushToast('Exported stopwatch laps CSV');
                  }}
                >
                  <Download size={14} /> CSV
                </button>
              )}
            </div>

            {swLaps.length > 0 && (
              <div className="dp-stack" style={{ width: '100%', maxHeight: 260, overflowY: 'auto', gap: 4 }}>
                {[...swLaps].reverse().map((l) => (
                  <div
                    key={l.index}
                    className="dp-between"
                    style={{
                      padding: '5px 10px',
                      borderRadius: 6,
                      background: 'var(--dp-surface-2)',
                      fontFamily: 'var(--dp-font-mono)',
                      fontSize: '0.84rem',
                    }}
                  >
                    <span>Lap #{l.index}</span>
                    <span>
                      {formatStopwatchMs(l.lapMs)}
                      {l.lapMs === fastestLapMs && swLaps.length > 1 ? ' 🟢 Fast' : ''}
                      {l.lapMs === slowestLapMs && swLaps.length > 1 ? ' 🔴 Slow' : ''}
                    </span>
                    <span className="dp-muted">{formatStopwatchMs(l.splitMs)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shared Time Ledger */}
          <div className="dp-card dp-stack">
            <div className="dp-between">
              <h4>Shared Time Ledger ({timeLedger.length})</h4>
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={() => {
                  const csv = recordsToCsv(
                    ['Date', 'Source', 'Label', 'ActiveSeconds'],
                    timeLedger.map((e) => [e.date, e.sourceType, e.label, e.activeSeconds])
                  );
                  triggerBrowserDownload(csv, `dayplana-time-ledger-${logicalToday}.csv`, 'text/csv');
                }}
              >
                <Download size={13} /> Export CSV
              </button>
            </div>
            {timeLedger.length === 0 ? (
              <p className="dp-muted">Completed timers, Pomodoros, intervals, and stopwatch runs log here automatically.</p>
            ) : (
              <div className="dp-stack" style={{ gap: 6, maxHeight: 340, overflowY: 'auto' }}>
                {timeLedger.map((entry) => (
                  <div key={entry.id} className="dp-between" style={{ padding: '6px 10px', background: 'var(--dp-surface-2)', borderRadius: 6, fontSize: '0.85rem' }}>
                    <div>
                      <strong>{entry.label}</strong>
                      <div className="dp-muted" style={{ fontSize: '0.76rem' }}>
                        {entry.date} · {entry.sourceType}
                      </div>
                    </div>
                    <span className="dp-pill">{Math.max(1, Math.round(entry.activeSeconds / 60))}m ({entry.activeSeconds}s)</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fullscreen AMOLED Nightstand / Standby Mode (Section 10.01) */}
      {nightstandOpen && (
        <div className="dp-fullscreen-overlay dp-nightstand" role="dialog" aria-label="Nightstand Standby Clock">
          <div style={{ transform: `translate(${burnInShift.x}px, ${burnInShift.y}px)`, transition: 'transform 1s ease' }}>
            <div style={{ fontSize: 'clamp(3.4rem, 12vw, 7.5rem)', fontFamily: 'var(--dp-font-mono)', fontWeight: 700, letterSpacing: '0.04em' }}>
              {now.toLocaleTimeString(settings.locale, { hour: '2-digit', minute: '2-digit', hour12: settings.timeFormat === '12h' })}
            </div>
            <div style={{ opacity: 0.7, fontSize: '1.1rem', marginBottom: 20 }}>
              {logicalToday} · {alarms.find((a) => (a.payload as { enabled?: boolean }).enabled)?.title || 'No active alarm'}
            </div>
            <button type="button" className="dp-btn" onClick={() => setNightstandOpen(false)}>
              Exit Nightstand
            </button>
          </div>
        </div>
      )}

      {/* Smart Alarm Dismiss Challenge Modal (Section 10.02) */}
      <ModalDialog open={Boolean(ringingAlarm)} onClose={() => setRingingAlarm(null)} title={`⏰ Alarm: ${ringingAlarm?.title || ''}`}>
        {ringingAlarm && (
          <div className="dp-stack">
            {(ringingAlarm.payload as { challenge?: string }).challenge === 'math' ? (
              <label className="dp-stack" style={{ gap: 6 }}>
                <span>Solve to dismiss: <strong>{mathPair[0]} + {mathPair[1]} = ?</strong></span>
                <input className="dp-input" value={challengeAnswer} onChange={(e) => setChallengeAnswer(e.target.value)} />
              </label>
            ) : (ringingAlarm.payload as { challenge?: string }).challenge === 'affirmation' ? (
              <label className="dp-stack" style={{ gap: 6 }}>
                <span>Type to dismiss: <strong>I am ready for a calm day</strong></span>
                <input className="dp-input" value={challengeAnswer} onChange={(e) => setChallengeAnswer(e.target.value)} />
              </label>
            ) : null}
            <div className="dp-between">
              <button
                type="button"
                className="dp-btn dp-btn-ghost dp-btn-sm"
                onClick={() => {
                  setRingingAlarm(null);
                  pushToast('Emergency bypass used — alarm dismissed.');
                }}
              >
                Emergency Bypass
              </button>
              <button
                type="button"
                className="dp-btn dp-btn-primary"
                onClick={() => {
                  const ch = (ringingAlarm.payload as { challenge?: string }).challenge;
                  if (ch === 'math' && Number(challengeAnswer.trim()) !== mathPair[0] + mathPair[1]) {
                    pushToast('Check the math answer to dismiss.', { tone: 'warn' });
                    return;
                  }
                  if (ch === 'affirmation' && challengeAnswer.trim().toLowerCase() !== 'i am ready for a calm day') {
                    pushToast('Type the affirmation phrase to dismiss.', { tone: 'warn' });
                    return;
                  }
                  setRingingAlarm(null);
                  setActiveView('today');
                  pushToast('Good morning! Handed off to Today Spread.');
                }}
              >
                Dismiss & Open Today
              </button>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
};
