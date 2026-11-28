import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  createDefaultSettings,
  createId,
  db,
  DEFAULT_GPU_CONFIG,
  DEFAULT_SYNC_POLICY,
  getOrInitSettings,
  getStorageHealth,
  mergeSettingsObject,
  requestPersistentStorage,
  updateSettings,
  type StorageHealth,
} from './db';
import { globalSearchIndex } from './searchIndex';
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
import { audioEngine } from './audio';
import {
  computeNextAlarmTrigger,
  doesAlarmMatchMoment,
  normalizeAlarmPayload,
} from './alarmSchedule';
import { timeToMinutes } from './planActions';
import { expandRecurrenceDates } from './recurrence';
import type {
  AppSettings,
  CalendarEventPayload,
  ChorePayload,
  LifeRecord,
  ModuleId,
  NavView,
  SyncConflict,
} from './types';

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
  customSound?: string; // optional per-timer sound override
  customVolume?: number | null; // optional per-timer volume override (0..100)
}

export function isRecordVisibleForProfile(record: LifeRecord, activeProfileId: string): boolean {
  if (!activeProfileId || activeProfileId === 'all') return true;
  if (!record.ownerProfileId) return true; // shared household / legacy records stay visible
  if (record.ownerProfileId === activeProfileId) return true;
  if (record.sharedWithAll) return true;
  if (record.sharedWithProfileIds?.includes(activeProfileId)) return true;
  if (record.assigneeId === activeProfileId) return true;
  return false;
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
  activeCustomTabId: string | null;
  openCustomTab: (tabId: string) => void;
  records: LifeRecord[];
  allWorkspaceRecords: LifeRecord[];
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
  startCountdownTimer: (
    label: string,
    durationSec: number,
    kind?: RunningTimer['kind'],
    linkedRecordId?: string | null,
    opts?: { customSound?: string; customVolume?: number | null }
  ) => Promise<string>;
  toggleTimerPause: (timerId: string) => Promise<void>;
  extendTimer: (timerId: string, addSec: number) => Promise<void>;
  dismissTimer: (timerId: string) => Promise<void>;
  isModuleEnabled: (mod: ModuleId) => boolean;
  selectedNoteId: string | null;
  setSelectedNoteId: (id: string | null) => void;
  notesInitialTab: 'all' | 'daily' | 'graph';
  setNotesInitialTab: (tab: 'all' | 'daily' | 'graph') => void;
  openDailyNotesArchive: (dateIso?: string) => void;
  selectedPdfId: string | null;
  setSelectedPdfId: (id: string | null) => void;
  openPdfInStudio: (pdfRecordId: string) => void;
  selectedEventId: string | null;
  setSelectedEventId: (id: string | null) => void;
  openEventInCalendar: (eventId: string, dateIso?: string) => void;
  canInstallPwa: boolean;
  triggerInstallPwa: () => Promise<boolean>;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (v: boolean) => void;
  ringingAlarm: LifeRecord | null;
  triggerAlarmRing: (alarm: LifeRecord) => void;
  dismissRingingAlarm: (openToday?: boolean) => void;
  snoozeRingingAlarm: (minutes?: number) => void;
  notifyUser: (
    kind: 'timer' | 'alarm' | 'event' | 'chore' | 'stopwatch',
    title: string,
    body: string,
    override?: { customSound?: string; customVolume?: number | null }
  ) => void;
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
  const scale = Math.max(0.8, Math.min(1.3, (settings.uiScalePct ?? 100) / 100));
  root.style.setProperty('--dp-ui-scale', String(scale));
  root.style.setProperty('--dp-font-size', `${Math.round(Math.max(12, Math.min(24, settings.fontSizePx)) * scale * 10) / 10}px`);
  root.style.setProperty('--dp-line-height', String(settings.lineHeight));

  const radiusMap = {
    sharp: ['3px', '5px', '8px'],
    soft: ['6px', '11px', '16px'],
    cozy: ['12px', '18px', '24px'],
  };
  const [rSm, rMd, rLg] = radiusMap[settings.cardRadius ?? 'soft'] ?? radiusMap.soft;
  root.style.setProperty('--dp-radius-sm', rSm);
  root.style.setProperty('--dp-radius-md', rMd);
  root.style.setProperty('--dp-radius-lg', rLg);

  const layoutMode = settings.mobileLayoutMode ?? 'adaptive';
  root.dataset.mobileLayout = layoutMode;
  root.dataset.colorScheme = settings.colorScheme;
  root.dataset.fontPairing = settings.fontPairing;
  root.dataset.density = settings.density;
  root.dataset.paperGrain = String(settings.paperGrain);
  root.dataset.bookSpine = String(settings.bookSpineShadow);
  root.dataset.binderTabs = String(settings.binderTabs);
  root.dataset.reducedMotion = String(settings.reducedMotion);
  root.dir = settings.rtl ? 'rtl' : 'ltr';

  if (settings.plannerTitle) {
    document.title = `${settings.plannerTitle} — Personal & Professional Planner`;
  }

  // Update mobile viewport meta dynamically so Desktop Layout allows smooth pinch-to-zoom & pan on phones!
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) {
    vp.setAttribute(
      'content',
      layoutMode === 'desktop_zoom'
        ? 'width=1240, initial-scale=0.35, minimum-scale=0.2, maximum-scale=3.0, user-scalable=yes, viewport-fit=cover'
        : 'width=device-width, initial-scale=1.0, viewport-fit=cover'
    );
  }
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  const [activeView, setActiveView] = useState<NavView>('today');
  const [activeCustomTabId, setActiveCustomTabId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [storageHealth, setStorageHealth] = useState<StorageHealth | null>(null);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [zenOpen, setZenOpen] = useState(false);
  const [zenFocusText, setZenFocusText] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [notesInitialTab, setNotesInitialTab] = useState<'all' | 'daily' | 'graph'>('all');
  const [selectedPdfId, setSelectedPdfId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [ringingAlarm, setRingingAlarm] = useState<LifeRecord | null>(null);
  const [installPrompt, setInstallPrompt] = useState<{ prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } | null>(null);
  const firedAlertsRef = React.useRef<Set<string>>(new Set());
  const lastMinuteCheckedRef = React.useRef<string>('');
  const [syncState, setSyncState] = useState<SyncStateSnapshot>({
    status: 'standalone',
    pendingCount: 0,
    conflictCount: 0,
    lastSyncAt: null,
    serverReachable: false,
  });

  const liveSettings = useLiveQuery(() => db.settings.get('app-settings'), []);
  const [inFlightSettingsPatches, setInFlightSettingsPatches] = useState<Array<{ id: number; patch: Partial<AppSettings> }>>([]);
  const settingsPatchSeqRef = React.useRef(0);
  const completedSettingsSeqRef = React.useRef(0);

  useEffect(() => {
    // Once Dexie emits a fresh liveSettings snapshot after completed writes, prune those optimistic patches cleanly.
    const committed = completedSettingsSeqRef.current;
    if (committed > 0) {
      setInFlightSettingsPatches((prev) => {
        const next = prev.filter((item) => item.id > committed);
        return next.length === prev.length ? prev : next;
      });
    }
  }, [liveSettings]);

  const settings = useMemo<AppSettings>(() => {
    const defaults = createDefaultSettings();
    const base: AppSettings = !liveSettings
      ? defaults
      : {
          ...defaults,
          ...liveSettings,
          familyProfiles: liveSettings.familyProfiles?.length ? liveSettings.familyProfiles : defaults.familyProfiles,
          activeProfileId: liveSettings.activeProfileId || 'all',
          eventCategories: liveSettings.eventCategories?.length ? liveSettings.eventCategories : defaults.eventCategories,
          customTabs: Array.isArray(liveSettings.customTabs) ? liveSettings.customTabs : [],
          plannerTitle:
            !liveSettings.plannerTitle || liveSettings.plannerTitle === 'Dayplana' ? 'Planaday' : liveSettings.plannerTitle,
          cardRadius: liveSettings.cardRadius || 'soft',
          mobileLayoutMode: liveSettings.mobileLayoutMode || 'adaptive',
          uiScalePct: typeof liveSettings.uiScalePct === 'number' ? liveSettings.uiScalePct : 100,
          hiddenSidebarViews: Array.isArray(liveSettings.hiddenSidebarViews) ? liveSettings.hiddenSidebarViews : [],
          syncFallbackUrl: liveSettings.syncFallbackUrl ?? '',
          weatherEnabled: liveSettings.weatherEnabled ?? true,
          weatherLocationName: liveSettings.weatherLocationName ?? '',
          weatherLat: liveSettings.weatherLat ?? null,
          weatherLon: liveSettings.weatherLon ?? null,
          weatherUnit: liveSettings.weatherUnit ?? 'F',
          cachedWeather: liveSettings.cachedWeather ?? null,
          factTopicFilter: liveSettings.factTopicFilter ?? 'All',
          customTimerPresets: Array.isArray(liveSettings.customTimerPresets) ? liveSettings.customTimerPresets : [],
          customMoods: Array.isArray(liveSettings.customMoods) ? liveSettings.customMoods : [],
          customDiaryPrompts: Array.isArray(liveSettings.customDiaryPrompts) ? liveSettings.customDiaryPrompts : [],
          customThoughtPrompts: Array.isArray(liveSettings.customThoughtPrompts) ? liveSettings.customThoughtPrompts : [],
          customRingtones: Array.isArray(liveSettings.customRingtones) ? liveSettings.customRingtones : [],
          customNotebooks: Array.isArray(liveSettings.customNotebooks) ? liveSettings.customNotebooks : [],
          customMealFavorites: Array.isArray(liveSettings.customMealFavorites) ? liveSettings.customMealFavorites : [],
          defaultCurrency: liveSettings.defaultCurrency || 'USD',
          calendarPrefs: {
            ...defaults.calendarPrefs!,
            ...(liveSettings.calendarPrefs ?? {}),
          },
          notificationPrefs: {
            ...defaults.notificationPrefs,
            ...(liveSettings.notificationPrefs ?? {}),
          },
          syncPolicy: {
            ...DEFAULT_SYNC_POLICY,
            ...(liveSettings.syncPolicy ?? {}),
            selectiveWorkspaceIds: Array.isArray(liveSettings.syncPolicy?.selectiveWorkspaceIds)
              ? liveSettings.syncPolicy!.selectiveWorkspaceIds
              : [],
          },
          gpuConfig: {
            ...DEFAULT_GPU_CONFIG,
            ...(liveSettings.gpuConfig ?? {}),
          },
        };
    return inFlightSettingsPatches.reduce((acc, item) => mergeSettingsObject(acc, item.patch), base);
  }, [liveSettings, inFlightSettingsPatches]);

  const [logicalToday, setLogicalToday] = useState<string>(() =>
    computeLogicalDateIso(Date.now(), settings.dayBoundaryHour, settings.defaultTimeZone)
  );
  const [activeDate, setActiveDate] = useState<string>(logicalToday);

  // Boot Temporal, settings, persistent storage, trash cleanup, and sync daemon
  // CONT-008: Never block initial UI mount on optional browser storage permission prompts (e.g. Firefox persist())!
  useEffect(() => {
    let mounted = true;
    (async () => {
      await ensureTemporal();
      const s = await getOrInitSettings();
      if (!mounted) return;
      const todayNow = computeLogicalDateIso(Date.now(), s.dayBoundaryHour, s.defaultTimeZone);
      setLogicalToday(todayNow);
      setActiveDate(todayNow);
      setReady(true);

      // Run maintenance, optional persistent storage request & sync non-blocking after UI is interactive
      void Promise.allSettled([
        requestPersistentStorage(2500),
        purgeExpiredTrash(),
      ]).then(async () => {
        if (!mounted) return;
        const health = await getStorageHealth();
        if (mounted) setStorageHealth(health);
      });
      await startSyncDaemon();
    })();
    return () => {
      mounted = false;
      stopSyncDaemon();
    };
  }, []);

  // Recompute logicalToday dynamically on timer tick, focus, and visibilitychange
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
      void runSyncCycle(fetch, { manual: false });
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

  const allWorkspaceRecords = useMemo(
    () =>
      allRecordsIncludingTrash.filter(
        (r) => !r.deletedAt && r.workspaceId === settings.activeWorkspaceId
      ),
    [allRecordsIncludingTrash, settings.activeWorkspaceId]
  );

  // Respect active Family Member Profile (shows member's own items + shared/important household items)
  const records = useMemo(
    () => allWorkspaceRecords.filter((r) => isRecordVisibleForProfile(r, settings.activeProfileId)),
    [allWorkspaceRecords, settings.activeProfileId]
  );

  // Incrementally keep the inverted FTS index in sync with active workspace records (O(changed) only)
  useEffect(() => {
    globalSearchIndex.syncFromArray(records);
  }, [records]);

  // Pre-memoized active slices so the notification scheduler never re-filters the full record table per tick (v4.2.0 §2)
  const activeAlarms = useMemo(
    () => records.filter((r) => r.type === 'alarm' && r.status === 'active'),
    [records]
  );
  const activeEvents = useMemo(
    () => records.filter((r) => r.type === 'event' && r.status === 'active') as Array<LifeRecord<CalendarEventPayload>>,
    [records]
  );
  const activeChores = useMemo(
    () => records.filter((r) => r.type === 'chore' && r.status === 'active') as Array<LifeRecord<ChorePayload>>,
    [records]
  );
  const activeMeds = useMemo(
    () => records.filter((r) => r.type === 'medication' && r.status === 'active'),
    [records]
  );

  const trashedRecords = useMemo(
    () => allRecordsIncludingTrash.filter((r) => Boolean(r.deletedAt)),
    [allRecordsIncludingTrash]
  );

  // Timers persisted in IndexedDB so concurrent countdowns reconstruct accurately across reload
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
          customSound: p.customSound,
          customVolume: p.customVolume ?? null,
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

  const triggerAlarmRing = useCallback(
    (alarm: LifeRecord) => {
      const p = normalizeAlarmPayload(alarm.payload as Record<string, unknown>);
      const vol01 = Math.max(0.05, Math.min(1, ((p.volume ?? settings.notificationPrefs.volume ?? 85) / 100)));
      if (settings.notificationPrefs.soundEnabled !== false) {
        audioEngine.startAlarmLoop(p.ringtone || 'sunrise_harp', vol01, p.volumeRampSec || 20);
      }
      if (p.vibrate !== false && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate?.([400, 200, 400, 200, 400]);
        } catch {
          // optional
        }
      }
      setRingingAlarm(alarm);
      if (
        settings.notificationPrefs.osPushEnabled !== false &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification(`⏰ ${alarm.title}`, { body: `Scheduled alarm at ${p.time} (${p.profile})`, icon: '/icons/icon.svg' });
        } catch {
          // fallback handled by modal + audio loop
        }
      }
    },
    [settings.notificationPrefs.soundEnabled, settings.notificationPrefs.osPushEnabled, settings.notificationPrefs.volume]
  );

  const dismissRingingAlarm = useCallback(
    (openToday = false) => {
      audioEngine.stopAlarmLoop();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate?.(0);
        } catch {
          // ignore
        }
      }
      setRingingAlarm(null);
      if (openToday) {
        setActiveView('today');
        pushToast('Alarm dismissed — ready for Today Spread!');
      } else {
        pushToast('Alarm dismissed');
      }
    },
    [pushToast]
  );

  const snoozeRingingAlarm = useCallback(
    (minutes?: number) => {
      const current = ringingAlarm;
      audioEngine.stopAlarmLoop();
      setRingingAlarm(null);
      if (!current) return;
      const p = normalizeAlarmPayload(current.payload as Record<string, unknown>);
      const snoozeM = Math.max(1, minutes ?? p.snoozeMin ?? 9);
      const fireAt = Date.now() + snoozeM * 60 * 1000;
      void scheduleNativeNotification(`snooze-${current.id}`, `Snoozed Alarm: ${current.title}`, `Waking you up again (${snoozeM}m snooze)`, fireAt);
      window.setTimeout(() => {
        triggerAlarmRing(current);
      }, snoozeM * 60 * 1000);
      pushToast(`Snoozed "${current.title}" for ${snoozeM} min`);
    },
    [ringingAlarm, triggerAlarmRing, pushToast]
  );

  const notifyUser = useCallback(
    (
      kind: 'timer' | 'alarm' | 'event' | 'chore' | 'stopwatch',
      title: string,
      body: string,
      override?: { customSound?: string; customVolume?: number | null }
    ) => {
      const prefs = settings.notificationPrefs;
      if (!settings.notificationsEnabled || !prefs.enabled) return;
      if (kind === 'timer' && !prefs.notifyTimers) return;
      if (kind === 'alarm' && !prefs.notifyAlarms) return;
      if (kind === 'event' && !prefs.notifyEvents) return;
      if (kind === 'chore' && !prefs.notifyChores) return;
      if (kind === 'stopwatch' && !prefs.notifyStopwatch) return;

      // Respect Quiet Hours for non-alarm notifications (alarms always wake!)
      if (kind !== 'alarm' && prefs.quietHoursEnabled && prefs.quietHoursStart && prefs.quietHoursEnd) {
        const now = new Date();
        const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const s = prefs.quietHoursStart;
        const e = prefs.quietHoursEnd;
        const inQuiet = s <= e ? cur >= s && cur < e : cur >= s || cur < e;
        if (inQuiet) {
          pushToast(`🌙 (Quiet Hours) ${title}: ${body}`);
          return;
        }
      }

      if (prefs.vibrateEnabled !== false && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate?.([150, 80, 150]);
        } catch {
          // optional
        }
      }

      const effVolume =
        typeof override?.customVolume === 'number' && Number.isFinite(override.customVolume)
          ? override.customVolume
          : prefs.volume;
      const effSound = override?.customSound && override.customSound !== 'default' ? override.customSound : prefs.chimeStyle;

      const isClassicChime = ['soft', 'bell', 'marimba', 'classic_alarm', 'woodblock', 'bright', 'complete'].includes(effSound);
      if (isClassicChime) {
        fireLocalAlert(title, body, effSound as typeof prefs.chimeStyle, { ...prefs, chimeStyle: effSound as typeof prefs.chimeStyle, volume: effVolume });
      } else {
        // Musical ringtone or uploaded custom audio blob
        if (prefs.soundEnabled !== false && effVolume > 0) {
          void audioEngine.playRingtoneOnce(effSound, Math.max(0.05, Math.min(1, effVolume / 100)));
        }
        fireLocalAlert(title, body, prefs.chimeStyle, { ...prefs, soundEnabled: false });
      }
      pushToast(`🔔 ${title}: ${body}`);
    },
    [settings.notificationsEnabled, settings.notificationPrefs, pushToast]
  );

  const patchSettings = useCallback(async (patch: Partial<AppSettings>) => {
    // Apply synchronously so controlled checkboxes & selects (e.g. Calendar Adaptive Text) respond immediately
    // without reverting while IndexedDB commits asynchronously (R-0005 / CAL-002).
    const opId = ++settingsPatchSeqRef.current;
    setInFlightSettingsPatches((prev) => [...prev, { id: opId, patch }]);
    try {
      const next = await updateSettings(patch);
      completedSettingsSeqRef.current = Math.max(completedSettingsSeqRef.current, opId);
      if (
        patch.operatingMode !== undefined ||
        patch.syncServerUrl !== undefined ||
        patch.syncFallbackUrl !== undefined ||
        patch.syncAuthToken !== undefined ||
        patch.syncPolicy !== undefined
      ) {
        await startSyncDaemon();
      }
      applySettingsToDocument(next);
    } catch (err) {
      setInFlightSettingsPatches((prev) => prev.filter((item) => item.id !== opId));
      throw err;
    }
  }, []);

  // Phase 6: Schedule-Based Automatic Workspace Layout Switching (Section 18.4)
  useEffect(() => {
    if (!settings.autoWorkspaceScheduleEnabled || settings.manualWorkspaceOverrideId) return;
    const evaluateSchedule = () => {
      const now = new Date();
      const wd = now.getDay();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const match = (settings.workspaceSchedules ?? []).find(
        (s) => s.days.includes(wd) && hhmm >= s.startTime && hhmm < s.endTime
      );
      if (match && match.workspaceId !== settings.activeWorkspaceId) {
        void patchSettings({
          activeWorkspaceId: match.workspaceId,
          ...(match.clockDesign && settings.clockConfig ? { clockConfig: { ...settings.clockConfig, design: match.clockDesign } } : {}),
        });
      }
    };
    evaluateSchedule();
    const id = window.setInterval(evaluateSchedule, 60_000);
    return () => window.clearInterval(id);
  }, [
    settings.autoWorkspaceScheduleEnabled,
    settings.manualWorkspaceOverrideId,
    settings.workspaceSchedules,
    settings.activeWorkspaceId,
    settings.clockConfig,
    patchSettings,
  ]);

  const triggerSyncNow = useCallback(async () => {
    await runSyncCycle(fetch, { manual: true });
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
      linkedRecordId: string | null = null,
      opts?: { customSound?: string; customVolume?: number | null }
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
          customSound: opts?.customSound && opts.customSound !== 'default' ? opts.customSound : undefined,
          customVolume: typeof opts?.customVolume === 'number' ? opts.customVolume : null,
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
      if (settings.notificationPrefs.enabled && settings.notificationPrefs.notifyTimers) {
        await scheduleNativeNotification(id, `Timer Done: ${label}`, `Your Planaday timer "${label}" finished!`, targetEndMs);
      }
      const mins = Math.floor(safeSec / 60);
      const secs = safeSec % 60;
      const fmt = mins > 0 ? `${mins}m${secs ? ` ${secs}s` : ''}` : `${secs}s`;
      pushToast(`Started timer: ${label} (${fmt})`);
      return id;
    },
    [settings.activeWorkspaceId, settings.deviceId, settings.notificationPrefs.enabled, settings.notificationPrefs.notifyTimers, pushToast]
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
      await scheduleNativeNotification(timerId, `Timer Done: ${rec.title}`, `Your Planaday timer "${rec.title}" finished!`, nextEnd);
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
      await scheduleNativeNotification(timerId, `Timer Done: ${rec.title}`, `Your Planaday timer "${rec.title}" finished!`, nextEnd);
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

  // Live Notification Engine (v4.2.0 §2 optimized):
  // - Uses pre-memoized slices (zero full-record scans per tick!)
  // - Only runs 1s polling while countdown timers are actively running; otherwise wakes every 5s
  // - Evaluates minute-level triggers (alarms, events, chores, meds) at most ONCE per minute transition!
  useEffect(() => {
    const hasRunningTimers = runningTimers.some((t) => t.targetEndMs !== null);
    const intervalMs = hasRunningTimers ? 1000 : 5000;

    const tick = () => {
      const prefs = settings.notificationPrefs;
      if (!settings.notificationsEnabled || !prefs.enabled) return;

      const nowMs = Date.now();
      const d = new Date(nowMs);
      const nowMin = d.getHours() * 60 + d.getMinutes();
      const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

      // 1. Timers (honors per-timer customSound & customVolume overrides!)
      if (prefs.notifyTimers && runningTimers.length > 0) {
        for (const t of runningTimers) {
          if (t.targetEndMs !== null && t.targetEndMs <= nowMs && nowMs - t.targetEndMs < 15000) {
            const key = `tmr:${t.id}:${t.targetEndMs}`;
            if (!firedAlertsRef.current.has(key)) {
              firedAlertsRef.current.add(key);
              notifyUser('timer', `Timer Finished: ${t.label}`, 'Tap to stop or add time in Planaday.', {
                customSound: t.customSound,
                customVolume: t.customVolume ?? null,
              });
            }
          }
        }
      }

      // Minute-boundary gate: skip alarm/event/chore/medication scans if we already checked this HH:MM
      const calDateIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const minuteKey = `${calDateIso}:${hhmm}`;
      if (lastMinuteCheckedRef.current === minuteKey) return;
      lastMinuteCheckedRef.current = minuteKey;

      // 2. Smart Alarms (respects scheduled one-time dates, repeat days of week, & chosen ringtone!)
      if (prefs.notifyAlarms && activeAlarms.length > 0) {
        const weekday = d.getDay();
        for (const a of activeAlarms) {
          const rawP = a.payload as Record<string, unknown>;
          const p = normalizeAlarmPayload(rawP);
          if (doesAlarmMatchMoment(rawP, calDateIso, weekday, hhmm)) {
            const key = `alm:${a.id}:${calDateIso}:${hhmm}`;
            if (!firedAlertsRef.current.has(key)) {
              firedAlertsRef.current.add(key);
              triggerAlarmRing(a);
              // Automatically turn off one-time alarms after they fire
              if (p.scheduleType === 'once') {
                void db.records.update(a.id, {
                  payload: { ...rawP, enabled: false },
                  updatedAt: new Date().toISOString(),
                });
              }
            }
          }
        }
      }

      // 3. Upcoming Calendar Events (honors per-event notifyEnabled, lead time, sound, & volume!)
      if (prefs.notifyEvents && activeEvents.length > 0) {
        for (const ev of activeEvents) {
          if (ev.payload.notifyEnabled === false) continue;
          if (ev.payload.allDay || !ev.payload.startTime) continue;
          const isToday = ev.recurrence
            ? expandRecurrenceDates(ev.payload.startDate, ev.recurrence, {
              rangeStart: logicalToday,
              rangeEnd: logicalToday,
              maxCount: 1,
            }).length > 0
            : ev.payload.startDate === logicalToday;
          if (!isToday) continue;

          const startMin = timeToMinutes(ev.payload.startTime);
          const leads = ev.payload.remindersMin?.length ? ev.payload.remindersMin : [prefs.eventLeadMinutes];
          for (const lead of leads) {
            if (startMin - lead === nowMin) {
              const key = `ev:${ev.id}:${logicalToday}:${lead}`;
              if (!firedAlertsRef.current.has(key)) {
                firedAlertsRef.current.add(key);
                const whenText = lead === 0 ? 'starting now' : `starts in ${lead}m (${ev.payload.startTime})`;
                notifyUser(
                  'event',
                  `Upcoming Event: ${ev.title}`,
                  `${whenText}${ev.payload.location ? ` · ${ev.payload.location}` : ''}`,
                  {
                    customSound: ev.payload.customSound,
                    customVolume: ev.payload.customVolume ?? null,
                  }
                );
              }
            }
          }
        }
      }

      // 4. Daily Chore Reminder Digest + Per-Chore Specific Reminder Times!
      if (prefs.notifyChores && activeChores.length > 0) {
        if (hhmm === prefs.choreReminderTime) {
          const key = `chores:${logicalToday}:${prefs.choreReminderTime}`;
          if (!firedAlertsRef.current.has(key)) {
            const due = activeChores.filter(
              (c) => !c.payload.paused && c.payload.notifyEnabled !== false && !c.payload.customReminderTime && c.payload.nextDueDate <= logicalToday
            );
            if (due.length > 0) {
              firedAlertsRef.current.add(key);
              notifyUser(
                'chore',
                `${due.length} Chore${due.length === 1 ? '' : 's'} Due Today`,
                due.slice(0, 3).map((c) => c.title).join(', ')
              );
            }
          }
        }
        for (const c of activeChores) {
          if (c.payload.paused || c.payload.notifyEnabled === false) continue;
          if (c.payload.customReminderTime && c.payload.customReminderTime === hhmm && c.payload.nextDueDate <= logicalToday) {
            const key = `chore:${c.id}:${logicalToday}:${hhmm}`;
            if (!firedAlertsRef.current.has(key)) {
              firedAlertsRef.current.add(key);
              notifyUser('chore', `Chore Reminder: ${c.title}`, `Due today in ${c.payload.room}`, {
                customSound: c.payload.customSound,
              });
            }
          }
        }
      }

      // 5. Scheduled Medication Reminders (primary & optional 2nd time of day)
      if (prefs.notifyAlarms && activeMeds.length > 0) {
        for (const m of activeMeds) {
          const mp = m.payload as {
            dose?: string;
            timeOfDay?: string;
            secondTimeOfDay?: string;
            reminderEnabled?: boolean;
            takenLog?: Array<{ date: string; timeHHMM?: string }>;
            skippedLog?: Array<{ date: string }>;
          };
          if (mp.reminderEnabled === false) continue;
          const skippedToday = (mp.skippedLog ?? []).some((s) => s.date === logicalToday);
          if (skippedToday) continue;
          const times = [mp.timeOfDay, mp.secondTimeOfDay].filter((t): t is string => Boolean(t));
          for (const medTime of times) {
            if (medTime === hhmm) {
              const key = `med:${m.id}:${logicalToday}:${medTime}`;
              if (!firedAlertsRef.current.has(key)) {
                firedAlertsRef.current.add(key);
                notifyUser(
                  'alarm',
                  `Medication Reminder: ${m.title}`,
                  `Time to take ${mp.dose || 'your dose'} (${medTime})`
                );
              }
            }
          }
        }
      }
    };

    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [runningTimers, activeAlarms, activeEvents, activeChores, activeMeds, logicalToday, settings.notificationsEnabled, settings.notificationPrefs, notifyUser, triggerAlarmRing]);

  // Schedule native Capacitor alerts for ALL enabled Smart Alarms' next scheduled trigger
  useEffect(() => {
    const prefs = settings.notificationPrefs;
    if (!settings.notificationsEnabled || !prefs.enabled || !prefs.notifyAlarms) return;
    const alarms = records.filter((r) => r.type === 'alarm' && r.status === 'active');
    const now = new Date();
    for (const a of alarms) {
      const next = computeNextAlarmTrigger(a.payload as Record<string, unknown>, now);
      if (next) {
        const p = normalizeAlarmPayload(a.payload as Record<string, unknown>);
        void scheduleNativeNotification(
          a.id,
          `Planaday Alarm: ${a.title}`,
          `${p.time} (${p.profile})`,
          next.nextFireMs
        );
      } else {
        void cancelNativeNotification(a.id);
      }
    }
  }, [records, settings.notificationsEnabled, settings.notificationPrefs]);

  // Schedule native Capacitor alerts for today's upcoming events so Android rings even when closed
  useEffect(() => {
    const prefs = settings.notificationPrefs;
    if (!settings.notificationsEnabled || !prefs.enabled || !prefs.notifyEvents) return;
    const nowMs = Date.now();
    const events = records.filter((r) => r.type === 'event' && r.status === 'active') as Array<
      LifeRecord<CalendarEventPayload>
    >;
    for (const ev of events) {
      if (ev.payload.allDay || !ev.payload.startTime || ev.payload.startDate !== logicalToday) continue;
      const [hh, mm] = ev.payload.startTime.split(':').map(Number);
      const fireDate = new Date();
      fireDate.setHours(hh || 0, (mm || 0) - prefs.eventLeadMinutes, 0, 0);
      if (fireDate.getTime() > nowMs) {
        void scheduleNativeNotification(
          `ev-${ev.id}-${logicalToday}`,
          `Upcoming Event: ${ev.title}`,
          prefs.eventLeadMinutes === 0 ? 'Starting now' : `Starts in ${prefs.eventLeadMinutes} min`,
          fireDate.getTime()
        );
      }
    }
  }, [records, logicalToday, settings.notificationsEnabled, settings.notificationPrefs]);

  const openEventInCalendar = useCallback((eventId: string, dateIso?: string) => {
    if (dateIso) setActiveDate(dateIso);
    setSelectedEventId(eventId);
    setActiveView('calendar');
  }, []);

  const openDailyNotesArchive = useCallback((dateIso?: string) => {
    if (dateIso) setActiveDate(dateIso);
    setNotesInitialTab('daily');
    setActiveView('notes');
  }, []);

  const openPdfInStudio = useCallback((pdfRecordId: string) => {
    setSelectedPdfId(pdfRecordId);
    setActiveView('pdf_studio');
  }, []);

  const openCustomTab = useCallback((tabId: string) => {
    setActiveCustomTabId(tabId);
    setActiveView('custom_tab');
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

  // Global keyboard map — automatically disabled while typing in text inputs
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
        activeCustomTabId,
        openCustomTab,
        records,
        allWorkspaceRecords,
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
        notesInitialTab,
        setNotesInitialTab,
        openDailyNotesArchive,
        selectedPdfId,
        setSelectedPdfId,
        openPdfInStudio,
        selectedEventId,
        setSelectedEventId,
        openEventInCalendar,
        canInstallPwa: Boolean(installPrompt),
        triggerInstallPwa,
        mobileMenuOpen,
        setMobileMenuOpen,
        ringingAlarm,
        triggerAlarmRing,
        dismissRingingAlarm,
        snoozeRingingAlarm,
        notifyUser,
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
