import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlarmClock,
  Clock,
  Download,
  Edit3,
  Flag,
  Moon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
  Timer,
  Upload,
  Volume2,
  Watch,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { COMMON_TIMEZONES, convertEventTimeZone } from '../../core/temporal';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { createId, db, storeBlob } from '../../core/db';
import { ALARM_RINGTONES, audioEngine, getRingtoneLabel, type SoundscapeChannel } from '../../core/audio';
import {
  computeNextAlarmTrigger,
  DAY_SHORT_LABELS,
  formatRepeatDaysSummary,
  normalizeAlarmPayload,
} from '../../core/alarmSchedule';
import {
  detectRuntimePlatform,
  requestAlarmNotificationPermission,
  scheduleNativeNotification,
  syncPushConfigToServer,
} from '../../core/nativeAlarms';
import { recordsToCsv, triggerBrowserDownload } from '../../core/backup';
import { SortFilterBar } from '../../components/Common/SortFilterBar';
import { TabSettingsDrawer } from '../../components/Common/TabSettingsDrawer';
import { ClockWidget, CLOCK_DESIGN_OPTIONS } from '../../components/Common/ClockWidget';
import type { CalendarEventPayload, ChimeStyle, ClockVisualConfig, LifeRecord } from '../../core/types';

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
    triggerAlarmRing,
    notifyUser,
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

  // Smart Alarms state (schedulable by weekday or specific date + customizable ringtones!)
  const [editingAlarmId, setEditingAlarmId] = useState<string | null>(null);
  const [alarmTitle, setAlarmTitle] = useState('Morning Wake-Up');
  const [alarmTime, setAlarmTime] = useState('07:00');
  const [alarmProfile, setAlarmProfile] = useState<string>('Workday');
  const [alarmScheduleType, setAlarmScheduleType] = useState<'recurring' | 'once'>('recurring');
  const [alarmRepeatDays, setAlarmRepeatDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [alarmScheduleDate, setAlarmScheduleDate] = useState<string>(logicalToday);
  const [alarmRingtone, setAlarmRingtone] = useState<string>('sunrise_harp');
  const [alarmRingtoneName, setAlarmRingtoneName] = useState<string>('');
  const [alarmVolume, setAlarmVolume] = useState<number>(85);
  const [alarmNotes, setAlarmNotes] = useState<string>('');
  const [alarmChallenge, setAlarmChallenge] = useState<'none' | 'math' | 'affirmation' | 'memory'>('none');
  const [alarmRampSec, setAlarmRampSec] = useState(25);
  const [alarmSnoozeMin, setAlarmSnoozeMin] = useState(9);
  const [alarmMaxSnooze, setAlarmMaxSnooze] = useState(3);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  // Alarm Sort & Filter state
  const [alarmSearch, setAlarmSearch] = useState('');
  const [alarmFilterChip, setAlarmFilterChip] = useState<'all' | 'enabled' | 'disabled' | 'once' | 'recurring'>('all');
  const [alarmProfileFilter, setAlarmProfileFilter] = useState('all');
  const [alarmSortBy, setAlarmSortBy] = useState<'time' | 'next' | 'title' | 'profile'>('time');
  const [alarmSortDir, setAlarmSortDir] = useState<'asc' | 'desc'>('asc');

  // Timers, Pomodoro, Soundscapes & Interval Builder state (supports Hours + Minutes + Seconds!)
  const [timerLabel, setTimerLabel] = useState('Deep Work');
  const [timerHours, setTimerHours] = useState(0);
  const [timerMin, setTimerMin] = useState(25);
  const [timerSec, setTimerSec] = useState(0);
  const [timerSound, setTimerSound] = useState('default');
  const [timerVolOverride, setTimerVolOverride] = useState('');
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

  // Precision Stopwatch state (HH:MM:SS.cc) + customizable milestone notifications
  const [swRunning, setSwRunning] = useState(false);
  const [swElapsedMs, setSwElapsedMs] = useState(0);
  const [swLaps, setSwLaps] = useState<StopwatchLap[]>([]);
  const swStartRef = useRef<number | null>(null);
  const swBaseRef = useRef<number>(0);
  const swLastNotifiedStepRef = useRef<number>(0);

  const timeLedger = useLiveQuery(() => db.timeLedger.orderBy('startedAt').reverse().limit(40).toArray(), []) ?? [];
  const alarms = useMemo(() => records.filter((r) => r.type === 'alarm'), [records]);

  const filteredSortedAlarms = useMemo(() => {
    const q = alarmSearch.trim().toLowerCase();
    const list = alarms.filter((a) => {
      const p = normalizeAlarmPayload(a.payload as Record<string, unknown>);
      if (alarmFilterChip === 'enabled' && !p.enabled) return false;
      if (alarmFilterChip === 'disabled' && p.enabled) return false;
      if (alarmFilterChip === 'once' && p.scheduleType !== 'once') return false;
      if (alarmFilterChip === 'recurring' && p.scheduleType !== 'recurring') return false;
      if (alarmProfileFilter !== 'all' && p.profile !== alarmProfileFilter) return false;
      if (q) {
        const hay = `${a.title} ${p.time} ${p.profile} ${p.notes ?? ''} ${getRingtoneLabel(p.ringtone, p.ringtoneName)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = alarmSortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      const pa = normalizeAlarmPayload(a.payload as Record<string, unknown>);
      const pb = normalizeAlarmPayload(b.payload as Record<string, unknown>);
      if (alarmSortBy === 'title') return a.title.localeCompare(b.title) * dir;
      if (alarmSortBy === 'profile') return pa.profile.localeCompare(pb.profile) * dir;
      if (alarmSortBy === 'next') {
        const na = computeNextAlarmTrigger(a.payload as Record<string, unknown>, now)?.nextFireMs ?? Number.MAX_SAFE_INTEGER;
        const nb = computeNextAlarmTrigger(b.payload as Record<string, unknown>, now)?.nextFireMs ?? Number.MAX_SAFE_INTEGER;
        return (na - nb) * dir;
      }
      return pa.time.localeCompare(pb.time) * dir;
    });
  }, [alarms, alarmSearch, alarmFilterChip, alarmProfileFilter, alarmSortBy, alarmSortDir, now]);

  const resetAlarmForm = () => {
    setEditingAlarmId(null);
    setAlarmTitle('Morning Wake-Up');
    setAlarmTime('07:00');
    setAlarmProfile('Workday');
    setAlarmScheduleType('recurring');
    setAlarmRepeatDays([1, 2, 3, 4, 5]);
    setAlarmScheduleDate(logicalToday);
    setAlarmRingtone('sunrise_harp');
    setAlarmRingtoneName('');
    setAlarmVolume(85);
    setAlarmNotes('');
    setAlarmChallenge('none');
    setAlarmRampSec(25);
    setAlarmSnoozeMin(9);
    setAlarmMaxSnooze(3);
  };

  const loadAlarmForEdit = (a: LifeRecord) => {
    const p = normalizeAlarmPayload(a.payload as Record<string, unknown>);
    setEditingAlarmId(a.id);
    setAlarmTitle(a.title);
    setAlarmTime(p.time);
    setAlarmProfile(p.profile);
    setAlarmScheduleType(p.scheduleType ?? 'recurring');
    setAlarmRepeatDays(p.repeatDays?.length ? p.repeatDays : [1, 2, 3, 4, 5]);
    setAlarmScheduleDate(p.scheduleDate || logicalToday);
    setAlarmRingtone(p.ringtone || 'sunrise_harp');
    setAlarmRingtoneName(p.ringtoneName || '');
    setAlarmVolume(p.volume ?? 85);
    setAlarmNotes(p.notes || '');
    setAlarmChallenge(p.challenge);
    setAlarmRampSec(p.volumeRampSec);
    setAlarmSnoozeMin(p.snoozeMin);
    setAlarmMaxSnooze(p.maxSnoozes);
  };

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

  // Precision Stopwatch RAF tick + milestone chime/notification
  useEffect(() => {
    if (!swRunning) return;
    let raf = 0;
    const intervalMin = settings.notificationPrefs.stopwatchIntervalMin;
    const tick = () => {
      if (swStartRef.current !== null) {
        const curMs = swBaseRef.current + (performance.now() - swStartRef.current);
        setSwElapsedMs(curMs);
        if (settings.notificationPrefs.notifyStopwatch && intervalMin > 0) {
          const step = Math.floor(curMs / (intervalMin * 60_000));
          if (step > 0 && step > swLastNotifiedStepRef.current) {
            swLastNotifiedStepRef.current = step;
            notifyUser(
              'stopwatch',
              `Stopwatch Milestone: ${step * intervalMin}m`,
              `Your stopwatch just crossed ${step * intervalMin} minutes (${formatStopwatchMs(curMs)}).`
            );
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [swRunning, settings.notificationPrefs.notifyStopwatch, settings.notificationPrefs.stopwatchIntervalMin, notifyUser]);

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

      {/* In-Tab Time, Alarm, Timer & Sound Settings Drawer */}
      <TabSettingsDrawer
        title="Time, Alarm & Sound Settings"
        subtitle="Global defaults for Clock, Smart Alarms, Timers & Stopwatch — individual alarms and timers can override their own sound & volume."
      >
        <div className="dp-grid-3" style={{ gap: 8, fontSize: '0.83rem' }}>
          <label className="dp-stack" style={{ gap: 4 }}>
            <span className="dp-muted">Default Alert Chime</span>
            <select
              className="dp-select"
              value={settings.notificationPrefs.chimeStyle}
              onChange={(e) =>
                void patchSettings({
                  notificationPrefs: { ...settings.notificationPrefs, chimeStyle: e.target.value as ChimeStyle },
                })
              }
            >
              <option value="bell">🔔 Classic Bell</option>
              <option value="soft">🌿 Soft Chime</option>
              <option value="marimba">🎵 Warm Marimba</option>
              <option value="classic_alarm">⏰ Classic Alarm</option>
              <option value="woodblock">🪵 Woodblock</option>
              <option value="bright">✨ Bright Triple</option>
            </select>
          </label>
          <label className="dp-stack" style={{ gap: 4 }}>
            <span className="dp-muted">Default Alert Volume ({settings.notificationPrefs.volume}%)</span>
            <div className="dp-row" style={{ gap: 6 }}>
              <input
                type="range"
                min={0}
                max={100}
                style={{ flex: 1 }}
                value={settings.notificationPrefs.volume}
                onChange={(e) =>
                  void patchSettings({
                    notificationPrefs: { ...settings.notificationPrefs, volume: Number(e.target.value) },
                  })
                }
              />
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={() =>
                  audioEngine.playChime(settings.notificationPrefs.chimeStyle, Math.max(0.05, settings.notificationPrefs.volume / 100))
                }
              >
                ▶ Test
              </button>
            </div>
          </label>
          <label className="dp-stack" style={{ gap: 4 }}>
            <span className="dp-muted">Clock Format &amp; Stopwatch Chime</span>
            <div className="dp-row" style={{ gap: 6 }}>
              <select
                className="dp-select"
                style={{ width: 'auto' }}
                value={settings.timeFormat}
                onChange={(e) => void patchSettings({ timeFormat: e.target.value as '12h' | '24h' })}
              >
                <option value="12h">12h</option>
                <option value="24h">24h</option>
              </select>
              <input
                type="number"
                min={0}
                max={120}
                aria-label="Stopwatch milestone interval minutes"
                className="dp-input"
                style={{ width: 64 }}
                value={settings.notificationPrefs.stopwatchIntervalMin}
                onChange={(e) =>
                  void patchSettings({
                    notificationPrefs: { ...settings.notificationPrefs, stopwatchIntervalMin: Math.max(0, Number(e.target.value) || 0) },
                  })
                }
              />
              <span className="dp-muted" style={{ fontSize: '0.76rem' }}>min/lap chime</span>
            </div>
          </label>
        </div>
        <div className="dp-row" style={{ flexWrap: 'wrap', gap: 12, fontSize: '0.82rem' }}>
          <label className="dp-row" style={{ gap: 5 }}>
            <input
              type="checkbox"
              checked={settings.notificationPrefs.notifyAlarms}
              onChange={(e) => void patchSettings({ notificationPrefs: { ...settings.notificationPrefs, notifyAlarms: e.target.checked } })}
            />
            <span>Notify Alarms</span>
          </label>
          <label className="dp-row" style={{ gap: 5 }}>
            <input
              type="checkbox"
              checked={settings.notificationPrefs.notifyTimers}
              onChange={(e) => void patchSettings({ notificationPrefs: { ...settings.notificationPrefs, notifyTimers: e.target.checked } })}
            />
            <span>Notify Timers</span>
          </label>
          <label className="dp-row" style={{ gap: 5 }}>
            <input
              type="checkbox"
              checked={settings.notificationPrefs.notifyStopwatch}
              onChange={(e) => void patchSettings({ notificationPrefs: { ...settings.notificationPrefs, notifyStopwatch: e.target.checked } })}
            />
            <span>Stopwatch Milestones</span>
          </label>
        </div>
      </TabSettingsDrawer>

      {/* --- TAB 1: LOCAL CLOCK (6+ CUSTOM DESIGNS), WORLD CLOCK SLIDER & NIGHTSTAND MODE --- */}
      {tab === 'clock' && (() => {
        const clkCfg: ClockVisualConfig = settings.clockConfig ?? {
          design: 'analog_traditional',
          showSeconds: true,
          sizePx: 168,
          accentColor: '#a97434',
          bgColor: '#fcf9f2',
          borderStyle: 'solid',
          numberStyle: 'arabic',
        };
        const patchClock = (p: Partial<ClockVisualConfig>) => void patchSettings({ clockConfig: { ...clkCfg, ...p } });
        return (
        <div className="dp-stack">
          <div className="dp-grid-2">
            <div className="dp-card dp-stack" style={{ alignItems: 'center', textAlign: 'center', padding: 20, gap: 12 }}>
              <div className="dp-row" style={{ flexWrap: 'wrap', justifyContent: 'center', gap: 5 }}>
                {CLOCK_DESIGN_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`dp-btn dp-btn-sm ${clockStyle !== 'flip' && clkCfg.design === opt.id ? 'dp-btn-primary' : ''}`}
                    onClick={() => {
                      setClockStyle('analog');
                      patchClock({ design: opt.id });
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
                <button type="button" className={`dp-btn dp-btn-sm ${clockStyle === 'flip' ? 'dp-btn-primary' : ''}`} onClick={() => setClockStyle('flip')}>
                  Retro Flip
                </button>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => setNightstandOpen(true)}>
                  <Moon size={14} /> Nightstand
                </button>
              </div>

              {clockStyle === 'flip' ? (
                <div className="dp-row" style={{ gap: 10 }}>
                  {[
                    String(settings.timeFormat === '12h' ? now.getHours() % 12 || 12 : now.getHours()).padStart(2, '0'),
                    String(now.getMinutes()).padStart(2, '0'),
                    ...(clkCfg.showSeconds ? [String(now.getSeconds()).padStart(2, '0')] : []),
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
              ) : (
                <ClockWidget config={clkCfg} timeFormat={settings.timeFormat} timeZone={settings.defaultTimeZone} />
              )}

              {/* Clock Visual Customizer (Size, Seconds, 12h/24h, Colors, Border, Numerals — Section 17) */}
              <div className="dp-row" style={{ flexWrap: 'wrap', justifyContent: 'center', gap: 8, fontSize: '0.78rem' }}>
                <label className="dp-row" style={{ gap: 4 }}>
                  <input type="checkbox" checked={clkCfg.showSeconds} onChange={(e) => patchClock({ showSeconds: e.target.checked })} />
                  <span>Seconds</span>
                </label>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={() => void patchSettings({ timeFormat: settings.timeFormat === '12h' ? '24h' : '12h' })}
                >
                  {settings.timeFormat.toUpperCase()}
                </button>
                <label className="dp-row" style={{ gap: 3 }}>
                  <span className="dp-muted">Size:</span>
                  <input type="range" min={100} max={240} value={clkCfg.sizePx} onChange={(e) => patchClock({ sizePx: Number(e.target.value) })} style={{ width: 64 }} />
                </label>
                <select aria-label="Clock numerals" className="dp-select" style={{ width: 'auto', padding: '2px 5px' }} value={clkCfg.numberStyle} onChange={(e) => patchClock({ numberStyle: e.target.value as ClockVisualConfig['numberStyle'] })}>
                  <option value="arabic">123 Arabic</option>
                  <option value="roman">XII Roman</option>
                  <option value="dots">Dots</option>
                  <option value="none">Minimal Ticks</option>
                </select>
                <select aria-label="Clock border" className="dp-select" style={{ width: 'auto', padding: '2px 5px' }} value={clkCfg.borderStyle} onChange={(e) => patchClock({ borderStyle: e.target.value as ClockVisualConfig['borderStyle'] })}>
                  <option value="solid">Solid Ring</option>
                  <option value="double">Double Ring</option>
                  <option value="none">Borderless</option>
                </select>
                <input type="color" aria-label="Clock accent color" value={clkCfg.accentColor} onChange={(e) => patchClock({ accentColor: e.target.value })} style={{ width: 22, height: 22, border: 'none', padding: 0 }} />
                <input type="color" aria-label="Clock background color" value={clkCfg.bgColor} onChange={(e) => patchClock({ bgColor: e.target.value })} style={{ width: 22, height: 22, border: 'none', padding: 0 }} />
              </div>

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
        );
      })()}

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
                : 'To make alarms wake your phone even when Chrome is completely closed: install the native Planaday Android APK / Desktop app, OR enter a free ntfy.sh topic below so your Docker server pushes alarms directly to your phone!'}
            </p>
            <div className="dp-row">
              <input
                className="dp-input"
                style={{ flex: 2 }}
                placeholder="Optional ntfy push URL (e.g., https://ntfy.sh/my-private-planaday-alarms)"
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
                    settings.defaultTimeZone,
                    settings.notificationPrefs
                  );
                  pushToast(saved ? 'Synced background push URL & alert preferences to Docker server!' : 'Saved locally (connect Docker server to activate background push).');
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
            style={{ padding: 14, gap: 10 }}
            onSubmit={async (e) => {
              e.preventDefault();
              audioEngine.stopAlarmLoop();
              setPreviewPlaying(false);
              const payload = {
                time: alarmTime,
                profile: alarmProfile.trim() || 'Workday',
                enabled: true,
                scheduleType: alarmScheduleType,
                repeatDays: alarmScheduleType === 'recurring' ? alarmRepeatDays : [],
                scheduleDate: alarmScheduleType === 'once' ? alarmScheduleDate || logicalToday : null,
                ringtone: alarmRingtone,
                ringtoneName: alarmRingtoneName || undefined,
                volume: alarmVolume,
                vibrate: true,
                challenge: alarmChallenge,
                volumeRampSec: alarmRampSec,
                snoozeMin: alarmSnoozeMin,
                maxSnoozes: alarmMaxSnooze,
                skipNext: false,
                notes: alarmNotes.trim() || undefined,
              };

              let targetId = editingAlarmId;
              if (editingAlarmId) {
                await updateRecord(editingAlarmId, (c) => ({
                  ...c,
                  title: alarmTitle.trim() || 'Alarm',
                  payload: { ...c.payload, ...payload },
                }));
                pushToast(`Updated alarm "${alarmTitle.trim() || 'Alarm'}" (${alarmTime})`);
              } else {
                const created = await createRecord('alarm', alarmTitle.trim() || 'Alarm', payload);
                targetId = created.id;
                pushToast(`Scheduled alarm "${created.title}" for ${alarmTime}`);
              }

              const nextTrig = computeNextAlarmTrigger(payload as Record<string, unknown>, new Date());
              if (nextTrig && targetId) {
                await scheduleNativeNotification(
                  targetId,
                  `Planaday Alarm: ${alarmTitle.trim() || 'Alarm'}`,
                  `${alarmTime} (${payload.profile})`,
                  nextTrig.nextFireMs
                );
              }
              resetAlarmForm();
            }}
          >
            <div className="dp-between" style={{ flexWrap: 'wrap', gap: 6 }}>
              <strong>{editingAlarmId ? '✏️ Edit Scheduled Alarm' : '⏰ Schedule New Smart Alarm'}</strong>
              {editingAlarmId && (
                <button type="button" className="dp-btn dp-btn-ghost dp-btn-sm" onClick={resetAlarmForm}>
                  Cancel Edit
                </button>
              )}
            </div>

            <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <input
                className="dp-input"
                style={{ flex: '2 1 170px' }}
                value={alarmTitle}
                onChange={(e) => setAlarmTitle(e.target.value)}
                placeholder="Alarm label (e.g., Morning Wake-Up, Early Flight, Meds)"
              />
              <input
                type="time"
                aria-label="Alarm time"
                className="dp-input"
                style={{ width: 132, fontWeight: 700, fontSize: '1.05rem' }}
                value={alarmTime}
                onChange={(e) => setAlarmTime(e.target.value)}
              />
              <input
                aria-label="Alarm profile"
                className="dp-input"
                list="alarm-profile-list"
                style={{ width: 140 }}
                value={alarmProfile}
                onChange={(e) => setAlarmProfile(e.target.value)}
                placeholder="Profile..."
              />
              <datalist id="alarm-profile-list">
                {ALARM_PROFILES.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>

            {/* Schedule Selector: Repeat Days vs Specific Calendar Date */}
            <div className="dp-card dp-stack" style={{ padding: 10, gap: 8, background: 'var(--dp-surface-2)' }}>
              <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                <strong style={{ fontSize: '0.84rem' }}>Schedule:</strong>
                <button
                  type="button"
                  className={`dp-btn dp-btn-sm ${alarmScheduleType === 'recurring' ? 'dp-btn-primary' : ''}`}
                  onClick={() => setAlarmScheduleType('recurring')}
                >
                  🔁 Repeating Days
                </button>
                <button
                  type="button"
                  className={`dp-btn dp-btn-sm ${alarmScheduleType === 'once' ? 'dp-btn-primary' : ''}`}
                  onClick={() => setAlarmScheduleType('once')}
                >
                  📅 Specific Date (One-Time)
                </button>
              </div>

              {alarmScheduleType === 'recurring' ? (
                <div className="dp-stack" style={{ gap: 6 }}>
                  <div className="dp-row" style={{ flexWrap: 'wrap', gap: 5 }}>
                    {DAY_SHORT_LABELS.map((lbl, idx) => {
                      const on = alarmRepeatDays.includes(idx);
                      return (
                        <button
                          key={lbl}
                          type="button"
                          className={`dp-btn dp-btn-sm ${on ? 'dp-btn-primary' : ''}`}
                          style={{ minWidth: 44 }}
                          onClick={() =>
                            setAlarmRepeatDays((prev) =>
                              prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx].sort()
                            )
                          }
                        >
                          {lbl}
                        </button>
                      );
                    })}
                  </div>
                  <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    <span className="dp-muted" style={{ fontSize: '0.78rem' }}>Quick presets:</span>
                    <button type="button" className="dp-chip" onClick={() => setAlarmRepeatDays([0, 1, 2, 3, 4, 5, 6])}>
                      Every Day
                    </button>
                    <button type="button" className="dp-chip" onClick={() => setAlarmRepeatDays([1, 2, 3, 4, 5])}>
                      Weekdays (Mon–Fri)
                    </button>
                    <button type="button" className="dp-chip" onClick={() => setAlarmRepeatDays([0, 6])}>
                      Weekends (Sat–Sun)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <label className="dp-row" style={{ gap: 6 }}>
                    <span className="dp-muted" style={{ fontSize: '0.84rem' }}>Date to ring:</span>
                    <input
                      type="date"
                      className="dp-input"
                      style={{ width: 'auto' }}
                      value={alarmScheduleDate}
                      onChange={(e) => setAlarmScheduleDate(e.target.value)}
                    />
                  </label>
                  <span className="dp-muted" style={{ fontSize: '0.78rem' }}>
                    Auto-disables after ringing on {alarmScheduleDate || logicalToday}.
                  </span>
                </div>
              )}
            </div>

            {/* Ringtone Chooser + Preview + Custom Audio Upload + Volume */}
            <div className="dp-card dp-stack" style={{ padding: 10, gap: 8, background: 'var(--dp-surface-2)' }}>
              <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <strong style={{ fontSize: '0.84rem' }}>🎵 Ringtone:</strong>
                <select
                  aria-label="Alarm ringtone"
                  className="dp-select"
                  style={{ flex: '1 1 200px', width: 'auto' }}
                  value={alarmRingtone}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAlarmRingtone(val);
                    const custom = (settings.customRingtones ?? []).find((c) => `blob:${c.hash}` === val);
                    setAlarmRingtoneName(custom?.name ?? '');
                    audioEngine.stopAlarmLoop();
                    setPreviewPlaying(false);
                  }}
                >
                  <optgroup label="Built-In Musical Ringtones (Offline)">
                    {ALARM_RINGTONES.map((rt) => (
                      <option key={rt.id} value={rt.id}>
                        {rt.emoji} {rt.name} — {rt.description}
                      </option>
                    ))}
                  </optgroup>
                  {(settings.customRingtones ?? []).length > 0 && (
                    <optgroup label="My Uploaded Ringtones">
                      {(settings.customRingtones ?? []).map((cr) => (
                        <option key={cr.hash} value={`blob:${cr.hash}`}>
                          🎶 {cr.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>

                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  onClick={() => {
                    if (previewPlaying) {
                      audioEngine.stopAlarmLoop();
                      setPreviewPlaying(false);
                    } else {
                      setPreviewPlaying(true);
                      void audioEngine.playRingtoneOnce(alarmRingtone, alarmVolume / 100);
                      window.setTimeout(() => setPreviewPlaying(false), 2600);
                    }
                  }}
                >
                  {previewPlaying ? <Square size={13} /> : <Play size={13} />} {previewPlaying ? 'Stop' : 'Preview'}
                </button>

                <label className="dp-btn dp-btn-sm" style={{ cursor: 'pointer' }}>
                  <Upload size={13} /> Upload MP3/WAV
                  <input
                    type="file"
                    accept="audio/*"
                    hidden
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const stored = await storeBlob(f, f.name);
                        const existing = settings.customRingtones ?? [];
                        if (!existing.some((x) => x.hash === stored.hash)) {
                          await patchSettings({
                            customRingtones: [...existing, { hash: stored.hash, name: f.name }],
                          });
                        }
                        setAlarmRingtone(`blob:${stored.hash}`);
                        setAlarmRingtoneName(f.name);
                        pushToast(`Uploaded & selected custom ringtone "${f.name}"`);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>

              <div className="dp-row" style={{ flexWrap: 'wrap', gap: 12, fontSize: '0.82rem' }}>
                <label className="dp-row" style={{ gap: 6 }}>
                  <Volume2 size={14} />
                  <span>Alarm Volume: <strong>{alarmVolume}%</strong></span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={alarmVolume}
                    onChange={(e) => setAlarmVolume(Number(e.target.value))}
                  />
                </label>
                <input
                  className="dp-input"
                  style={{ flex: '1 1 180px', padding: '4px 8px', fontSize: '0.82rem' }}
                  placeholder="Optional wake-up note shown when ringing…"
                  value={alarmNotes}
                  onChange={(e) => setAlarmNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="dp-between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <details className="dp-details" style={{ flex: 1 }}>
                <summary>Wake-Up Challenge, Gradual Ramp &amp; Snooze Options</summary>
                <div className="dp-row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
                  <select aria-label="Dismiss challenge" className="dp-select" style={{ width: 'auto' }} value={alarmChallenge} onChange={(e) => setAlarmChallenge(e.target.value as typeof alarmChallenge)}>
                    <option value="none">No dismiss challenge</option>
                    <option value="math">Math Puzzle Challenge</option>
                    <option value="affirmation">Affirmation Typing Challenge</option>
                    <option value="memory">Memory Code Challenge</option>
                  </select>
                  <label className="dp-row">
                    <span className="dp-muted">Volume Ramp (sec):</span>
                    <input type="number" min={0} max={90} className="dp-input" style={{ width: 64 }} value={alarmRampSec} onChange={(e) => setAlarmRampSec(Number(e.target.value) || 0)} />
                  </label>
                  <label className="dp-row">
                    <span className="dp-muted">Snooze (min):</span>
                    <input type="number" min={1} max={30} className="dp-input" style={{ width: 64 }} value={alarmSnoozeMin} onChange={(e) => setAlarmSnoozeMin(Number(e.target.value) || 9)} />
                  </label>
                  <label className="dp-row">
                    <span className="dp-muted">Max Snoozes:</span>
                    <input type="number" min={1} max={10} className="dp-input" style={{ width: 64 }} value={alarmMaxSnooze} onChange={(e) => setAlarmMaxSnooze(Number(e.target.value) || 3)} />
                  </label>
                </div>
              </details>
              <button type="submit" className="dp-btn dp-btn-primary">
                <Plus size={14} /> {editingAlarmId ? 'Save Alarm Changes' : 'Schedule Alarm'}
              </button>
            </div>
          </form>

          {/* Bulk Profile Toggles */}
          <div className="dp-row" style={{ flexWrap: 'wrap' }}>
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

          {/* Easy Sort & Filter Bar for Alarms */}
          <SortFilterBar
            search={alarmSearch}
            onSearchChange={setAlarmSearch}
            searchPlaceholder="Search alarms, ringtones, notes…"
            sortBy={alarmSortBy}
            onSortByChange={(v) => setAlarmSortBy(v as typeof alarmSortBy)}
            sortOptions={[
              { value: 'time', label: 'Clock Time' },
              { value: 'next', label: 'Next to Ring' },
              { value: 'title', label: 'Title (A–Z)' },
              { value: 'profile', label: 'Profile' },
            ]}
            sortDir={alarmSortDir}
            onSortDirToggle={() => setAlarmSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            chips={[
              { value: 'all', label: 'All' },
              { value: 'enabled', label: 'Enabled' },
              { value: 'disabled', label: 'Paused' },
              { value: 'recurring', label: 'Repeating' },
              { value: 'once', label: 'Scheduled Date' },
            ]}
            activeChip={alarmFilterChip}
            onChipChange={(v) => setAlarmFilterChip(v as typeof alarmFilterChip)}
            extraFilters={[
              {
                label: 'Filter by profile',
                value: alarmProfileFilter,
                onChange: setAlarmProfileFilter,
                options: [
                  { value: 'all', label: 'All Profiles' },
                  ...Array.from(new Set([...ALARM_PROFILES, ...alarms.map((a) => normalizeAlarmPayload(a.payload as Record<string, unknown>).profile)])).map(
                    (pr) => ({ value: pr, label: pr })
                  ),
                ],
              },
            ]}
            totalCount={alarms.length}
            shownCount={filteredSortedAlarms.length}
            onReset={() => {
              setAlarmSearch('');
              setAlarmFilterChip('all');
              setAlarmProfileFilter('all');
            }}
          />

          <div className="dp-stack">
            {filteredSortedAlarms.length === 0 ? (
              <p className="dp-muted">No alarms match your filter.</p>
            ) : (
              filteredSortedAlarms.map((a) => {
                const p = normalizeAlarmPayload(a.payload as Record<string, unknown>);
                const nextTrigger = computeNextAlarmTrigger(a.payload as Record<string, unknown>, now);
                return (
                  <div
                    key={a.id}
                    className="dp-card dp-between"
                    style={{
                      padding: 12,
                      flexWrap: 'wrap',
                      gap: 10,
                      opacity: p.enabled ? 1 : 0.65,
                    }}
                  >
                    <div className="dp-stack" style={{ gap: 4 }}>
                      <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                        <strong style={{ fontSize: '1.2rem', fontFamily: 'var(--dp-font-mono)' }}>{p.time}</strong>
                        <strong>{a.title}</strong>
                        <span className="dp-pill">{p.profile}</span>
                        <span className="dp-pill highlight">
                          {formatRepeatDaysSummary(p.repeatDays, p.scheduleType, p.scheduleDate)}
                        </span>
                        {nextTrigger && (
                          <span className="dp-pill" style={{ background: 'color-mix(in oklch, var(--dp-ok) 15%, var(--dp-surface))' }}>
                            Rings {nextTrigger.countdownText}
                          </span>
                        )}
                      </div>
                      <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6, fontSize: '0.78rem' }}>
                        <span className="dp-muted">{getRingtoneLabel(p.ringtone, p.ringtoneName)} · {p.volume ?? 85}% vol</span>
                        {p.challenge !== 'none' && <span className="dp-pill">Challenge: {p.challenge}</span>}
                        {p.skipNext && <span className="dp-pill highlight">Skipping next</span>}
                        {p.notes && <span className="dp-muted">· {p.notes}</span>}
                      </div>
                    </div>
                    <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                      <button
                        type="button"
                        className="dp-btn dp-btn-sm"
                        onClick={() => triggerAlarmRing(a)}
                      >
                        ▶ Test Ring
                      </button>
                      <button
                        type="button"
                        className="dp-btn dp-btn-sm"
                        onClick={() => loadAlarmForEdit(a)}
                      >
                        <Edit3 size={13} /> Edit
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
              })
            )}
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
                    void startCountdownTimer(timerLabel || 'Timer', total, 'countdown', null, {
                      customSound: timerSound !== 'default' ? timerSound : undefined,
                      customVolume: timerVolOverride !== '' ? Number(timerVolOverride) : null,
                    });
                  }}
                >
                  Start
                </button>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  title="Save this label + time as a permanent 1-tap custom preset"
                  onClick={() => {
                    const total = timerHours * 3600 + timerMin * 60 + timerSec;
                    if (total <= 0) return;
                    const nm = timerLabel.trim() || `${timerMin}m ${timerSec}s`;
                    void patchSettings({
                      customTimerPresets: [
                        ...(settings.customTimerPresets ?? []),
                        { id: createId('tpre'), label: nm, seconds: total },
                      ],
                    });
                    pushToast(`Saved custom timer preset "${nm}"`);
                  }}
                >
                  ★ Save Preset
                </button>
              </div>
              {/* Per-Timer Specific Sound & Volume Override */}
              <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6, fontSize: '0.8rem' }}>
                <span className="dp-muted">This Timer&apos;s Sound:</span>
                <select
                  aria-label="Per-timer sound override"
                  className="dp-select"
                  style={{ width: 'auto', padding: '3px 8px', fontSize: '0.8rem' }}
                  value={timerSound}
                  onChange={(e) => setTimerSound(e.target.value)}
                >
                  <option value="default">Default ({settings.notificationPrefs.chimeStyle})</option>
                  <option value="bell">🔔 Bell</option>
                  <option value="soft">🌿 Soft</option>
                  <option value="marimba">🎵 Marimba</option>
                  <option value="classic_alarm">⏰ Classic Alarm</option>
                  {ALARM_RINGTONES.map((rt) => (
                    <option key={rt.id} value={rt.id}>{rt.emoji} {rt.name}</option>
                  ))}
                  {(settings.customRingtones ?? []).map((cr) => (
                    <option key={cr.hash} value={`blob:${cr.hash}`}>🎶 {cr.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  max={100}
                  aria-label="Per-timer volume percent"
                  placeholder={`Vol ${settings.notificationPrefs.volume}%`}
                  className="dp-input"
                  style={{ width: 86, padding: '3px 6px', fontSize: '0.8rem' }}
                  value={timerVolOverride}
                  onChange={(e) => setTimerVolOverride(e.target.value)}
                />
              </div>
              {settings.customTimerPresets?.length > 0 && (
                <div className="dp-row" style={{ gap: 5 }}>
                  <span className="dp-muted" style={{ fontSize: '0.76rem' }}>My Presets:</span>
                  {settings.customTimerPresets.map((cp) => {
                    const pm = Math.floor(cp.seconds / 60);
                    const ps = cp.seconds % 60;
                    const fmt = pm > 0 ? `${pm}m${ps ? ` ${ps}s` : ''}` : `${ps}s`;
                    return (
                      <span key={cp.id} className="dp-pill highlight">
                        <button
                          type="button"
                          className="dp-btn dp-btn-ghost dp-btn-sm"
                          style={{ padding: 0, minHeight: 'auto' }}
                          onClick={() => void startCountdownTimer(cp.label, cp.seconds)}
                        >
                          ▶ {cp.label} ({fmt})
                        </button>
                        <button
                          type="button"
                          className="dp-btn dp-btn-ghost dp-btn-sm"
                          style={{ padding: '0 3px', minHeight: 'auto' }}
                          onClick={() =>
                            void patchSettings({
                              customTimerPresets: settings.customTimerPresets.filter((x) => x.id !== cp.id),
                            })
                          }
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
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
            <div className="dp-row" style={{ fontSize: '0.82rem' }}>
              <span className="dp-muted">Milestone alert every:</span>
              <select
                aria-label="Stopwatch milestone interval"
                className="dp-select"
                style={{ width: 'auto', padding: '3px 8px' }}
                value={settings.notificationPrefs.notifyStopwatch ? settings.notificationPrefs.stopwatchIntervalMin : 0}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  void patchSettings({
                    notificationPrefs: {
                      ...settings.notificationPrefs,
                      notifyStopwatch: val > 0,
                      stopwatchIntervalMin: val > 0 ? val : settings.notificationPrefs.stopwatchIntervalMin,
                    },
                  });
                }}
              >
                <option value={0}>Off</option>
                <option value={1}>Every 1 min</option>
                <option value={5}>Every 5 min</option>
                <option value={10}>Every 10 min</option>
                <option value={15}>Every 15 min</option>
                <option value={30}>Every 30 min</option>
                <option value={60}>Every 60 min</option>
              </select>
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
                  swLastNotifiedStepRef.current = 0;
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
                    triggerBrowserDownload(csv, `planaday-stopwatch-laps-${logicalToday}.csv`, 'text/csv');
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
                  triggerBrowserDownload(csv, `planaday-time-ledger-${logicalToday}.csv`, 'text/csv');
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
    </div>
  );
};
