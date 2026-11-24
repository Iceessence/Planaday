import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  createDefaultSettings,
  createId,
  db,
  getOrInitSettings,
  getStorageHealth,
  requestPersistentStorage,
  updateSettings,
  type StorageHealth,
} from './db';
import { computeLogicalDateIso, ensureTemporal } from './temporal';
import { computeGuardedTheme, THEME_PRESETS } from '../data/themes';
import {
  performRedo,
  performUndo,
  purgeExpiredTrash,
} from './repository';
import {
  runSyncCycle,
  startSyncDaemon,
  stopSyncDaemon,
  subscribeSyncState,
  type SyncStateSnapshot,
} from './sync';
import {
  cancelNativeNotification,
  fireLocalAlert,
  scheduleNativeNotification,
} from './nativeAlarms';
import type { AppSettings, LifeRecord, ModuleId, NavView, SyncConflict } from './types';

export interface ToastItem {
  id: string;
  message: string;
  canUndo?: boolean;
  tone?: 'info' | 'warn' | 'danger' | 'ok';
}

export interface RunningTimer {
  id: string;
  label: string;
  durationSec: number;
  targetEndMs: number | null; // null when paused
  remainingSecWhenPaused: number;
  kind: 'countdown' | 'pomodoro' | 'interval' | 'cooking';
  linkedRecordId?: string | null;
  startedAtIso: string;
}

interface AppContextValue {
  ready: boolean;
  settings: AppSettings;
  patchSettings: (patch: Partial<AppSettings>) => Promise<void>;
  logicalToday: string;
  activeDate: string;
  setActiveDate: (dateIso: string) => void;
  activeView: NavView;
  setActiveView: (view: NavView) => void;
  records: LifeRecord[];
  allRecordsIncludingTrash: LifeRecord[];
  trashedRecords: LifeRecord[];
  openConflicts: SyncConflict[];
  syncState: SyncStateSnapshot;
  triggerSyncNow: () => Promise<void>;
  storageHealth: StorageHealth | null;
  toasts: ToastItem[];
  pushToast: (message: string, opts?: { canUndo?: boolean; tone?: ToastItem['tone'] }) => void;
  dismissToast: (id: string) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  // Overlays
  quickCaptureOpen: boolean;
  setQuickCaptureOpen: (v: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  zenOpen: boolean;
  setZenOpen: (v: boolean) => void;
  zenFocusText: string;
  setZenFocusText: (s: string) => void;
  // Persistent mini-bar timers (persisted as records type='timer' so they survive refresh!)
  runningTimers: RunningTimer[];
  startCountdownTimer: (label: string, durationSec: number, kind?: RunningTimer['kind'], linkedRecordId?: string | null) => Promise<string>;
  toggleTimerPause: (timerId: string) => Promise<void>;
  extendTimer: (timerId: string, addSec: number) => Promise<void>;
  dismissTimer: (timerId: string) => Promise<void>;
  isModuleEnabled: (mod: ModuleId) => boolean;
  selectedNoteId: string | null;
  setSelectedNoteId: (id: string | null) => void;
  selectedEventId: string | null;
  setSelectedEventId: (id: string | null) => void;
  openEventInCalendar: (eventId: string, dateIso?: string) => void;
  canInstallPwa: boolean;
  triggerInstallPwa: () => Promise<boolean>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function applySettingsToDocument(settings: AppSettings) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const preset = THEME_PRESETS.find((t) => t.id === settings.themePresetId);
  const tokens = settings.customTokens ?? preset?.tokens ?? THEME_PRESETS[0].tokens;
  const minRatio = settings.contrastLevel === 'AAA' ? 7.0 : 4.5;
  const computed = computeGuardedTheme(tokens, minRatio);

  root.style.setProperty('--dp-canvas', tokens.canvas);
  root.style.setProperty('--dp-paper', tokens.paper);
  root.style.setProperty('--dp-surface-2', tokens.secondarySurface);
  root.style.setProperty('--dp-ink', computed.guardedPrimaryInk);
  root.style.setProperty('--dp-muted', computed.guardedMutedInk);
  root.style.setProperty('--dp-accent', tokens.primaryAccent);
  root.style.setProperty('--dp-accent-2', tokens.secondaryAccent);
  root.style.setProperty('--dp-highlight', tokens.highlight);
  root.style.setProperty('--dp-border', tokens.border);
  root.style.setProperty('--dp-on-accent', computed.onPrimaryAccent);
  root.style.setProperty('--dp-on-accent-2', computed.onSecondaryAccent);
  root.style.setProperty('--dp-on-highlight', computed.onHighlight);
  root.style.setProperty('--dp-font-size', `${Math.max(12, Math.min(24, settings.fontSizePx))}px`);
  root.style.setProperty('--dp-line-height', String(settings.lineHeight));

  root.dataset.colorScheme = settings.colorScheme;
  root.dataset.fontPairing = settings.fontPairing;
  root.dataset.density = settings.density;
  root.dataset.paperGrain = String(settings.paperGrain);
  root.dataset.bookSpine = String(settings.bookSpineShadow);
  root.dataset.binderTabs = String(settings.binderTabs);
  root.dataset.reducedMotion = String(settings.reducedMotion);
  root.dir = settings.rtl ? 'rtl' : 'ltr';
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [activeView, setActiveView] = useState<NavView>('today');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [storageHealth, setStorageHealth] = useState<StorageHealth | null>(null);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [zenOpen, setZenOpen] = useState(false);
  const [zenFocusText, setZenFocusText] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<{ prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } | null>(null);
  const firedAlertsRef = React.useRef<Set<string>>(new Set());
  const [syncState, setSyncState] = useState<SyncStateSnapshot>({
    status: 'standalone',
    pendingCount: 0,
    conflictCount: 0,
    lastSyncAt: null,
    serverReachable: false,
  });

  const liveSettings = useLiveQuery(() => db.settings.get('app-settings'), []);
  const settings = useMemo(() => liveSettings ?? createDefaultSettings(), [liveSettings]);

  const [logicalToday, setLogicalToday] = useState<string>(() =>
    computeLogicalDateIso(Date.now(), settings.dayBoundaryHour, settings.defaultTimeZone)
  );
  const [activeDate, setActiveDate] = useState<string>(logicalToday);

  // Boot Temporal, settings, persistent storage, trash cleanup, and sync daemon
  useEffect(() => {
    let mounted = true;
    (async () => {
      await ensureTemporal();
      const s = await getOrInitSettings();
      await requestPersistentStorage();
      await purgeExpiredTrash();
      const health = await getStorageHealth();
      if (!mounted) return;
      setStorageHealth(health);
      const todayNow = computeLogicalDateIso(Date.now(), s.dayBoundaryHour, s.defaultTimeZone);
      setLogicalToday(todayNow);
      setActiveDate(todayNow);
      setReady(true);
      await startSyncDaemon();
    })();
    return () => {
      mounted = false;
      stopSyncDaemon();
    };
  }, []);

  // Recompute logicalToday dynamically on timer tick, focus, and visibilitychange (NEVER frozen at boot — 05.01)
  useEffect(() => {
    const recompute = () => {
      const next = computeLogicalDateIso(Date.now(), settings.dayBoundaryHour, settings.defaultTimeZone);
      setLogicalToday((prev) => {
        if (prev !== next) {
          setActiveDate((cur) => (cur === prev ? next : cur));
          return next;
        }
        return prev;
      });
    };
    recompute();
    const id = window.setInterval(recompute, 15000);
    window.addEventListener('focus', recompute);
    document.addEventListener('visibilitychange', recompute);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', recompute);
      document.removeEventListener('visibilitychange', recompute);
    };
  }, [settings.dayBoundaryHour, settings.defaultTimeZone]);

  // Apply theme tokens & color scheme live
  useEffect(() => {
    applySettingsToDocument(settings);
  }, [settings]);

  // Subscribe to sync updates + online reconnect auto-flush + PWA install prompt
  useEffect(() => {
    const unsub = subscribeSyncState(setSyncState);
    const onOnline = () => {
      void runSyncCycle();
    };
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> });
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => {
      unsub();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    };
  }, []);

  // Live reactive queries from IndexedDB (Unified Life Graph)
  const allRecordsIncludingTrash = useLiveQuery(() => db.records.toArray(), []) ?? [];
  const openConflicts = useLiveQuery(() => db.syncConflicts.filter((c) => !c.resolved).toArray(), []) ?? [];

  const records = useMemo(
    () =>
      allRecordsIncludingTrash.filter(
        (r) => !r.deletedAt && r.workspaceId === settings.activeWorkspaceId
      ),
    [allRecordsIncludingTrash, settings.activeWorkspaceId]
  );

  const trashedRecords = useMemo(
    () => allRecordsIncludingTrash.filter((r) => Boolean(r.deletedAt)),
    [allRecordsIncludingTrash]
  );

  // Timers persisted in IndexedDB so concurrent countdowns reconstruct accurately across reload (10.03)
  const runningTimers = useMemo<RunningTimer[]>(() => {
    return allRecordsIncludingTrash
      .filter((r) => r.type === 'timer' && !r.deletedAt && r.status === 'active')
      .map((r) => {
        const p = r.payload as unknown as RunningTimer;
        return {
          id: r.id,
          label: r.title,
          durationSec: p.durationSec ?? 300,
          targetEndMs: p.targetEndMs ?? null,
          remainingSecWhenPaused: p.remainingSecWhenPaused ?? p.durationSec ?? 300,
          kind: p.kind ?? 'countdown',
          linkedRecordId: p.linkedRecordId ?? null,
          startedAtIso: p.startedAtIso ?? r.createdAt,
        };
      });
  }, [allRecordsIncludingTrash]);

  const pushToast = useCallback((message: string, opts?: { canUndo?: boolean; tone?: ToastItem['tone'] }) => {
    const id = createId('toast');
    setToasts((prev) => [...prev.slice(-3), { id, message, canUndo: opts?.canUndo, tone: opts?.tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const patchSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await updateSettings(patch);
    if (patch.operatingMode !== undefined || patch.syncServerUrl !== undefined) {
      await startSyncDaemon();
    }
    applySettingsToDocument(next);
  }, []);

  const triggerSyncNow = useCallback(async () => {
    await runSyncCycle();
    const h = await getStorageHealth();
    setStorageHealth(h);
  }, []);

  const undo = useCallback(async () => {
    const res = await performUndo();
    if (res.ok) pushToast(`Undid: ${res.label}`);
    else pushToast('Nothing to undo');
  }, [pushToast]);

  const redo = useCallback(async () => {
    const res = await performRedo();
    if (res.ok) pushToast(`Redid: ${res.label}`);
    else pushToast('Nothing to redo');
  }, [pushToast]);

  const startCountdownTimer = useCallback(
    async (
      label: string,
      durationSec: number,
      kind: RunningTimer['kind'] = 'countdown',
      linkedRecordId: string | null = null
    ) => {
      const safeSec = Math.max(1, Math.round(durationSec));
      const now = Date.now();
      const targetEndMs = now + safeSec * 1000;
      const id = createId('tmr');
      const nowIso = new Date(now).toISOString();
      const rec: LifeRecord = {
        id,
        workspaceId: settings.activeWorkspaceId,
        type: 'timer',
        title: label,
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
        tags: [],
        links: linkedRecordId ? [{ targetId: linkedRecordId, relation: 'scheduled_from' }] : [],
        payload: {
          durationSec: safeSec,
          targetEndMs,
          remainingSecWhenPaused: safeSec,
          kind,
          linkedRecordId,
          startedAtIso: nowIso,
        },
        rev: 1,
        deviceId: settings.deviceId,
      };
      await db.records.put(rec);
      await db.outbox.put({
        opId: createId('op'),
        recordId: id,
        operation: 'upsert',
        record: rec,
        baseRev: 0,
        createdAt: nowIso,
        attempts: 0,
      });
      await scheduleNativeNotification(id, `Timer Done: ${label}`, `Your Dayplana timer "${label}" finished!`, targetEndMs);
      const mins = Math.floor(safeSec / 60);
      const secs = safeSec % 60;
      const fmt = mins > 0 ? `${mins}m${secs ? ` ${secs}s` : ''}` : `${secs}s`;
      pushToast(`Started timer: ${label} (${fmt})`);
      return id;
    },
    [settings.activeWorkspaceId, settings.deviceId, pushToast]
  );

  const toggleTimerPause = useCallback(async (timerId: string) => {
    const rec = await db.records.get(timerId);
    if (!rec) return;
    const p = rec.payload as unknown as RunningTimer;
    const now = Date.now();
    if (p.targetEndMs !== null) {
      const rem = Math.max(0, Math.round((p.targetEndMs - now) / 1000));
      await cancelNativeNotification(timerId);
      await db.records.put({
        ...rec,
        updatedAt: new Date(now).toISOString(),
        payload: { ...p, targetEndMs: null, remainingSecWhenPaused: rem },
      });
    } else {
      const nextEnd = now + Math.max(1, p.remainingSecWhenPaused || 60) * 1000;
      await scheduleNativeNotification(timerId, `Timer Done: ${rec.title}`, `Your Dayplana timer "${rec.title}" finished!`, nextEnd);
      await db.records.put({
        ...rec,
        updatedAt: new Date(now).toISOString(),
        payload: { ...p, targetEndMs: nextEnd },
      });
    }
  }, []);

  const extendTimer = useCallback(async (timerId: string, addSec: number) => {
    const rec = await db.records.get(timerId);
    if (!rec) return;
    const p = rec.payload as unknown as RunningTimer;
    const now = Date.now();
    const nextEnd = p.targetEndMs !== null ? Math.max(now, p.targetEndMs) + addSec * 1000 : null;
    if (nextEnd) {
      await scheduleNativeNotification(timerId, `Timer Done: ${rec.title}`, `Your Dayplana timer "${rec.title}" finished!`, nextEnd);
    }
    await db.records.put({
      ...rec,
      updatedAt: new Date(now).toISOString(),
      payload: {
        ...p,
        durationSec: (p.durationSec || 0) + addSec,
        targetEndMs: nextEnd,
        remainingSecWhenPaused: (p.remainingSecWhenPaused || 0) + addSec,
      },
    });
  }, []);

  const dismissTimer = useCallback(async (timerId: string) => {
    const rec = await db.records.get(timerId);
    if (!rec) return;
    await cancelNativeNotification(timerId);
    const p = rec.payload as unknown as RunningTimer;
    const now = Date.now();
    const activeSeconds = Math.max(
      1,
      p.targetEndMs !== null
        ? Math.min(p.durationSec, Math.round((now - Date.parse(p.startedAtIso || rec.createdAt)) / 1000))
        : Math.max(0, p.durationSec - p.remainingSecWhenPaused)
    );
    await db.timeLedger.put({
      id: createId('tlog'),
      workspaceId: rec.workspaceId,
      sourceType: p.kind === 'pomodoro' ? 'pomodoro' : p.kind === 'interval' ? 'interval' : 'timer',
      label: rec.title,
      linkedRecordId: p.linkedRecordId ?? null,
      startedAt: p.startedAtIso || rec.createdAt,
      endedAt: new Date(now).toISOString(),
      activeSeconds,
      date: logicalToday,
    });
    await db.records.put({
      ...rec,
      status: 'done',
      updatedAt: new Date(now).toISOString(),
    });
  }, [logicalToday]);

  // Live watcher: fires chime + OS notification when any active countdown hits 00:00 or enabled Alarm hits HH:MM
  useEffect(() => {
    const id = window.setInterval(() => {
      const nowMs = Date.now();
      for (const t of runningTimers) {
        if (t.targetEndMs !== null && t.targetEndMs <= nowMs && nowMs - t.targetEndMs < 15000) {
          const key = `tmr:${t.id}:${t.targetEndMs}`;
          if (!firedAlertsRef.current.has(key)) {
            firedAlertsRef.current.add(key);
            fireLocalAlert(`Timer Finished: ${t.label}`, 'Tap to stop or add time in Dayplana.', 'complete');
            pushToast(`⏰ Timer finished: ${t.label}`);
          }
        }
      }
      const d = new Date(nowMs);
      const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const alarms = records.filter((r) => r.type === 'alarm' && r.status === 'active');
      for (const a of alarms) {
        const p = a.payload as { time?: string; enabled?: boolean; skipNext?: boolean };
        if (p.enabled && !p.skipNext && p.time === hhmm) {
          const key = `alm:${a.id}:${logicalToday}:${hhmm}`;
          if (!firedAlertsRef.current.has(key)) {
            firedAlertsRef.current.add(key);
            fireLocalAlert(`Dayplana Alarm: ${a.title}`, `Alarm ringing at ${hhmm}`, 'bell');
            pushToast(`⏰ Alarm ringing: ${a.title} (${hhmm})`);
          }
        }
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [runningTimers, records, logicalToday, pushToast]);

  const openEventInCalendar = useCallback((eventId: string, dateIso?: string) => {
    if (dateIso) setActiveDate(dateIso);
    setSelectedEventId(eventId);
    setActiveView('calendar');
  }, []);

  const triggerInstallPwa = useCallback(async () => {
    if (!installPrompt) return false;
    await installPrompt.prompt();
    const res = await installPrompt.userChoice;
    if (res.outcome === 'accepted') setInstallPrompt(null);
    return res.outcome === 'accepted';
  }, [installPrompt]);

  const isModuleEnabled = useCallback(
    (mod: ModuleId) => settings.enabledModules[mod] !== false,
    [settings.enabledModules]
  );

  // Global keyboard map (Section 04.05) — automatically disabled while typing in text inputs
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }

      if (mod && !inInput && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) void redo();
        else void undo();
        return;
      }

      if (e.key === 'Escape') {
        if (zenOpen) setZenOpen(false);
        return;
      }

      if (inInput || mod || e.altKey) return;

      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setQuickCaptureOpen(true);
      } else if (e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key.toLowerCase() === 't') {
        e.preventDefault();
        setActiveDate(logicalToday);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [logicalToday, undo, redo, zenOpen]);

  return (
    <AppContext.Provider
      value={{
        ready,
        settings,
        patchSettings,
        logicalToday,
        activeDate,
        setActiveDate,
        activeView,
        setActiveView,
        records,
        allRecordsIncludingTrash,
        trashedRecords,
        openConflicts,
        syncState,
        triggerSyncNow,
        storageHealth,
        toasts,
        pushToast,
        dismissToast,
        undo,
        redo,
        quickCaptureOpen,
        setQuickCaptureOpen,
        searchOpen,
        setSearchOpen,
        paletteOpen,
        setPaletteOpen,
        zenOpen,
        setZenOpen,
        zenFocusText,
        setZenFocusText,
        runningTimers,
        startCountdownTimer,
        toggleTimerPause,
        extendTimer,
        dismissTimer,
        isModuleEnabled,
        selectedNoteId,
        setSelectedNoteId,
        selectedEventId,
        setSelectedEventId,
        openEventInCalendar,
        canInstallPwa: Boolean(installPrompt),
        triggerInstallPwa,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
