import Dexie, { type Table } from 'dexie';
import type {
  AppSettings,
  BlobRecord,
  EventCategoryDef,
  FamilyProfile,
  GpuConfig,
  LifeRecord,
  ModuleId,
  NotificationPreferences,
  OutboxOp,
  RevisionRecord,
  SyncConflict,
  SyncPolicyConfig,
  TimeLedgerEntry,
  UndoEntry,
} from './types';
import { THEME_PRESETS } from '../data/themes';
import { getSystemTimeZone } from './temporal';
import { blobUrlCache } from './blobCache';

export interface SearchIndexEntry {
  recordId: string;
  workspaceId: string;
  type: string;
  updatedAt: string;
  tokens: string[];
}

export interface DraftRecoveryEntry {
  key: string; // `${recordId}:${field}`
  recordId: string;
  field: string;
  titleHint: string;
  content: string;
  baseRev?: number;
  updatedAt: string;
  reason?: 'unsaved' | 'interrupted' | 'error' | 'conflict';
}

export class DayplanaDB extends Dexie {
  records!: Table<LifeRecord, string>;
  blobs!: Table<BlobRecord, string>;
  outbox!: Table<OutboxOp, string>;
  undoStack!: Table<UndoEntry, string>;
  redoStack!: Table<UndoEntry, string>;
  revisions!: Table<RevisionRecord, string>;
  timeLedger!: Table<TimeLedgerEntry, string>;
  settings!: Table<AppSettings, string>;
  syncConflicts!: Table<SyncConflict, string>;
  drafts!: Table<DraftRecoveryEntry, string>;
  searchIndex!: Table<SearchIndexEntry, string>;

  constructor(name = 'dayplana-v2') {
    super(name);
    this.version(1).stores({
      records: 'id, workspaceId, type, status, updatedAt, deletedAt, dueDate, doDate, *tags, [workspaceId+type]',
      blobs: 'hash, mimeType, createdAt, synced',
      outbox: 'opId, recordId, createdAt',
      undoStack: 'id, timestamp',
      redoStack: 'id, timestamp',
      revisions: 'id, recordId, timestamp',
      timeLedger: 'id, workspaceId, date, linkedRecordId, startedAt',
      settings: 'id',
      syncConflicts: 'id, recordId, resolved',
    });
    // Non-destructive additive v2 upgrade: adds durable record-bound drafts table (PD-016 / PF-55)
    this.version(2).stores({
      records: 'id, workspaceId, type, status, updatedAt, deletedAt, dueDate, doDate, *tags, [workspaceId+type]',
      blobs: 'hash, mimeType, createdAt, synced',
      outbox: 'opId, recordId, createdAt',
      undoStack: 'id, timestamp',
      redoStack: 'id, timestamp',
      revisions: 'id, recordId, timestamp',
      timeLedger: 'id, workspaceId, date, linkedRecordId, startedAt',
      settings: 'id',
      syncConflicts: 'id, recordId, resolved',
      drafts: 'key, recordId, updatedAt',
    });
    // Non-destructive additive v3 upgrade (v4.2.0 §2): compound query indexes + persisted FTS token table
    this.version(3).stores({
      records:
        'id, workspaceId, type, status, updatedAt, deletedAt, dueDate, doDate, *tags, [workspaceId+type], [workspaceId+deletedAt], [workspaceId+type+updatedAt], [type+updatedAt]',
      blobs: 'hash, mimeType, createdAt, synced',
      outbox: 'opId, recordId, createdAt',
      undoStack: 'id, timestamp',
      redoStack: 'id, timestamp',
      revisions: 'id, recordId, timestamp',
      timeLedger: 'id, workspaceId, date, linkedRecordId, startedAt',
      settings: 'id',
      syncConflicts: 'id, recordId, resolved',
      drafts: 'key, recordId, updatedAt',
      searchIndex: 'recordId, workspaceId, type, updatedAt, *tokens',
    });
  }
}

export const db = new DayplanaDB();

export function createId(prefix = 'rec'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export const DEFAULT_ENABLED_MODULES: Record<ModuleId, boolean> = {
  home: true,
  quick_glance: true,
  today: true,
  calendar: true,
  task_calendar: true,
  digital_planner: true,
  tasks: true,
  chores: true,
  notes: true,
  thoughts: true,
  diary: true,
  events: true,
  time: true,
  kitchen: true,
  goals: true,
  habits: true,
  household: false,
  health: false,
  finance: false,
  learning: false,
  media: false,
  travel: false,
  people: false,
  home_assets: false,
  lab: true,
  reports: true,
  calculator: true,
  spreadsheets: true,
  presentations: true,
  projects: true,
  game_dev: true,
  book_writing: true,
  kanban: true,
  whiteboard: true,
  code_studio: true,
  photo_studio: true,
  scanner: true,
  pdf_studio: true,
  files: true,
  ai: false,
};

export const DEFAULT_SYNC_POLICY: SyncPolicyConfig = {
  mode: 'smart',
  inactivityDelaySec: 10,
  maxDelaySec: 120,
  scheduledIntervalMin: 15,
  wifiOnly: false,
  chargingOnly: false,
  selectiveWorkspaceIds: [],
};

export const DEFAULT_GPU_CONFIG: GpuConfig = {
  enabled: false,
  privacyOptIn: false,
  preferredModel: 'auto',
  memoryLimitMb: 6144,
  preferLocalFallback: true,
};

export const DEFAULT_EVENT_CATEGORIES: EventCategoryDef[] = [
  { id: 'cat_work', name: 'Work & Focus', emoji: '💼', color: '#3b6ea5' },
  { id: 'cat_personal', name: 'Personal', emoji: '🌿', color: '#4f7a65' },
  { id: 'cat_family', name: 'Family', emoji: '🏡', color: '#c96f53' },
  { id: 'cat_health', name: 'Health & Medical', emoji: '🩺', color: '#b5453a' },
  { id: 'cat_errands', name: 'Errands & Shopping', emoji: '🛒', color: '#b47438' },
  { id: 'cat_social', name: 'Social & Dining', emoji: '🍽️', color: '#d47c8e' },
  { id: 'cat_chores', name: 'Chores & Home', emoji: '🧹', color: '#6b8e4e' },
  { id: 'cat_study', name: 'School & Learning', emoji: '📚', color: '#6b5ca5' },
  { id: 'cat_fitness', name: 'Fitness & Sports', emoji: '🏋️', color: '#2f7a78' },
  { id: 'cat_travel', name: 'Travel & Transit', emoji: '✈️', color: '#4c759a' },
  { id: 'cat_finance', name: 'Bills & Finance', emoji: '💳', color: '#8f6c3e' },
];

export const DEFAULT_FAMILY_PROFILES: FamilyProfile[] = [
  { id: 'prof_me', name: 'Me (Primary)', emoji: '🧑', color: '#a97434', role: 'parent' },
];

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  enabled: true,
  soundEnabled: true,
  osPushEnabled: true,
  ntfyRelayEnabled: true,
  vibrateEnabled: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  volume: 75,
  chimeStyle: 'bell',
  notifyTimers: true,
  notifyAlarms: true,
  notifyEvents: true,
  eventLeadMinutes: 15,
  notifyChores: true,
  choreReminderTime: '09:00',
  notifyStopwatch: true,
  stopwatchIntervalMin: 15,
};

export function createDefaultSettings(): AppSettings {
  const defaultTheme = THEME_PRESETS[0];
  const isCapacitorNative =
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
  const isElectronDesktop =
    typeof window !== 'undefined' && ('dayplanaDesktop' in window || window.location.port === '41932');
  const isLikelyServerOrigin =
    typeof window !== 'undefined' &&
    !isCapacitorNative &&
    !isElectronDesktop &&
    window.location.protocol.startsWith('http') &&
    window.location.hostname !== '';
  return {
    id: 'app-settings',
    deviceId: createId('dev'),
    activeWorkspaceId: 'ws_personal',
    workspaces: [
      { id: 'ws_personal', name: 'Personal', emoji: '🌿', color: '#4f7a65' },
      { id: 'ws_work', name: 'Work', emoji: '💼', color: '#3b6ea5' },
      { id: 'ws_lab', name: 'Laboratory', emoji: '🧪', color: '#2f7a78' },
      { id: 'ws_home', name: 'Home & Family', emoji: '🏡', color: '#b47438' },
    ],
    familyProfiles: [...DEFAULT_FAMILY_PROFILES],
    activeProfileId: 'all',
    eventCategories: [...DEFAULT_EVENT_CATEGORIES],
    customTabs: [],
    plannerTitle: 'Planaday',
    cardRadius: 'soft',
    mobileLayoutMode: 'adaptive',
    uiScalePct: 100,
    hiddenSidebarViews: [],
    collapsedSidebarGroups: [],
    creationMode: 'standard',
    calendars: [
      { id: 'cal_personal', name: 'Personal', emoji: '🌿', color: '#4f7a65', visible: true },
      { id: 'cal_work', name: 'Work', emoji: '💼', color: '#3b6ea5', visible: true },
      { id: 'cal_lab', name: 'Laboratory', emoji: '🧪', color: '#2f7a78', visible: true },
      { id: 'cal_family', name: 'Family', emoji: '🏡', color: '#c96f53', visible: true },
      { id: 'cal_tasks', name: 'Tasks & Chores', emoji: '✅', color: '#a97434', visible: true },
    ],
    calendarPrefs: {
      intervalMin: 15,
      majorGridIntervalMin: 60,
      showMajorGrid: true,
      showMinorGrid: true,
      gridThicknessPx: 1,
      majorLineColor: '#b7a995',
      minorLineColor: '#dfd5c6',
      gridOpacity: 0.75,
      gridLineStyle: 'solid',
      timeLabelEveryMin: 60,
      adaptiveText: true,
      minFontPx: 10,
      maxFontPx: 14,
      visibleStartHour: 0,
      visibleEndHour: 24,
      overlapPolicy: 'side_by_side',
      dayMinWidthPx: 130,
    },
    maxFavorites: null, // unlimited by default (user can cap e.g. 3 anytime!)
    autoCarryOverTasks: true,
    preferredDailyEndTime: '21:00',
    allowSchedulePastEndTime: false,
    schedulingContexts: [
      { id: 'ctx_work', name: 'Work Hours', emoji: '💼', color: '#3b6ea5', days: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '17:00' },
      { id: 'ctx_lab', name: 'Laboratory Hours', emoji: '🧪', color: '#2f7a78', days: [1, 2, 3, 4, 5], startTime: '07:30', endTime: '16:30' },
      { id: 'ctx_home', name: 'Home & Chores', emoji: '🏡', color: '#b47438', days: [0, 1, 2, 3, 4, 5, 6], startTime: '17:00', endTime: '21:00' },
      { id: 'ctx_personal', name: 'Personal / Morning', emoji: '🌿', color: '#4f7a65', days: [0, 1, 2, 3, 4, 5, 6], startTime: '06:00', endTime: '22:00' },
      { id: 'ctx_relationship', name: 'Relationship & Family', emoji: '❤️', color: '#c96f53', days: [0, 1, 2, 3, 4, 5, 6], startTime: '18:00', endTime: '22:00' },
    ],
    reusableTaskTypes: [
      { id: 'tt_dishes', name: 'Wash Dishes', defaultEstimateMin: 15, category: 'Chores' },
      { id: 'tt_lab_qc', name: 'Lab QC / Verification', defaultEstimateMin: 30, category: 'Laboratory' },
      { id: 'tt_admin', name: 'Admin & Email', defaultEstimateMin: 20, category: 'Work' },
      { id: 'tt_clean', name: 'Room Cleanup', defaultEstimateMin: 25, category: 'Chores' },
    ],
    customDailyNoteSections: [
      { id: 'sec_morning', title: 'Morning Thoughts', emoji: '🌅', visible: true, schedule: 'daily' },
      { id: 'sec_goals', title: "Today's Goals", emoji: '🎯', visible: true, schedule: 'daily' },
      { id: 'sec_after_work', title: 'After Work', emoji: '🌆', visible: true, schedule: 'weekdays' },
      { id: 'sec_tonight', title: 'Tonight', emoji: '🌙', visible: true, schedule: 'daily' },
      { id: 'sec_gratitude', title: 'Gratitude', emoji: '🙏', visible: true, schedule: 'daily' },
      { id: 'sec_remember', title: 'Things to Remember', emoji: '📌', visible: true, schedule: 'daily' },
      { id: 'sec_tomorrow', title: "Tomorrow's Plans", emoji: '➡️', visible: false, schedule: 'daily' },
    ],
    todayUpcomingDays: 14,
    todayCompactMode: false,
    diaryRatingScale: { min: 1, max: 10, step: 1 },
    customDiaryCategories: [],
    quickGlanceWidgets: ['clock', 'weather', 'next_event', 'recommended_chore', 'top_goal', 'next_task', 'active_timer', 'reminder'],
    quickGlanceActions: ['timer', 'stopwatch', 'note', 'task', 'chore', 'meal', 'diary', 'event', 'photo'],
    clockConfig: {
      design: 'analog_traditional',
      showSeconds: true,
      sizePx: 148,
      accentColor: '#a97434',
      bgColor: '#fcf9f2',
      borderStyle: 'solid',
      numberStyle: 'arabic',
    },
    workspaceSchedules: [
      { id: 'wsch_morning', name: 'Morning Routine', emoji: '🌅', color: '#d49a4a', workspaceId: 'ws_personal', days: [0, 1, 2, 3, 4, 5, 6], startTime: '05:30', endTime: '08:00', defaultView: 'quick_glance', clockDesign: 'analog_minimal' },
      { id: 'wsch_work', name: 'Work & Laboratory', emoji: '🧪', color: '#2f7a78', workspaceId: 'ws_lab', days: [1, 2, 3, 4, 5], startTime: '08:00', endTime: '17:00', defaultView: 'lab', taskContextId: 'ctx_lab', clockDesign: 'digital' },
      { id: 'wsch_evening', name: 'Home & Evening', emoji: '🏡', color: '#b47438', workspaceId: 'ws_home', days: [1, 2, 3, 4, 5], startTime: '17:00', endTime: '22:30', defaultView: 'today', taskContextId: 'ctx_home', clockDesign: 'analog_traditional' },
      { id: 'wsch_weekend', name: 'Weekend Personal', emoji: '🌿', color: '#4f7a65', workspaceId: 'ws_personal', days: [0, 6], startTime: '08:00', endTime: '22:30', defaultView: 'today', clockDesign: 'decorative' },
    ],
    autoWorkspaceScheduleEnabled: false,
    manualWorkspaceOverrideId: null,
    operatingMode: isLikelyServerOrigin ? 'docker-sync' : isCapacitorNative ? 'offline-phone' : 'offline-computer',
    syncServerUrl: '', // same origin when served from Docker; set to http://192.168.x.x:3000 in native apps
    syncFallbackUrl: '', // optional Tailscale IP/URL for away-from-home failover
    lastSyncSeq: 0,
    lastSyncAt: null,
    syncPolicy: { ...DEFAULT_SYNC_POLICY },
    gpuConfig: { ...DEFAULT_GPU_CONFIG },
    weatherEnabled: true,
    weatherLocationName: '',
    weatherLat: null,
    weatherLon: null,
    weatherUnit: 'F',
    cachedWeather: null,
    factTopicFilter: 'All',
    customTimerPresets: [],
    customMoods: [],
    customDiaryPrompts: [],
    customThoughtPrompts: [],
    customRingtones: [],
    customNotebooks: [],
    customMealFavorites: [],
    defaultCurrency: 'USD',
    themePresetId: defaultTheme.id,
    customTokens: { ...defaultTheme.tokens },
    colorScheme: 'system',
    contrastLevel: 'AA',
    paperMaterial: defaultTheme.defaultPaper,
    spreadPaperOverrides: {},
    paperGrain: true,
    bookSpineShadow: true,
    binderTabs: true,
    fontPairing: 'editorial-serif',
    fontSizePx: 15,
    lineHeight: 1.55,
    density: 'comfortable',
    iconPack: 'line',
    reducedMotion: false,
    hapticsEnabled: true,
    rtl: false,
    locale: typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US',
    dayBoundaryHour: 0,
    weekStartsOn: 1,
    showWeekends: true,
    defaultTimeZone: getSystemTimeZone(),
    secondaryTimeZone: 'UTC',
    timeFormat: '12h',
    dailyCapacityHours: 8,
    openBookLayout: true,
    showFactsWidget: true,
    customFactsDeck: [],
    enabledModules: { ...DEFAULT_ENABLED_MODULES },
    mobilePrimaryTabs: ['today', 'calendar', 'tasks', 'recipes'],
    activeContextModeId: null,
    lowEnergyMode: false,
    onboardingCompleted: false,
    homeWidgets: ['kpis', 'upcoming', 'timers', 'countdowns', 'meals', 'overdue', 'pantry_alerts'],
    todayLeftWidgets: ['schedule', 'top3', 'checklist'],
    todayRightWidgets: ['notes', 'tonight', 'gratitude', 'tracker', 'facts'],
    aiEnabled: false,
    aiEndpoint: 'http://localhost:11434',
    aiApiKey: '',
    aiModel: 'llama3.2',
    notificationsEnabled: true,
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
    ntfyPushUrl: '',
    shortcuts: {
      commandPalette: 'Mod+K',
      quickCapture: 'N',
      globalSearch: '/',
      today: 'T',
      prevDate: '[',
      nextDate: ']',
      undo: 'Mod+Z',
      redo: 'Mod+Shift+Z',
    },
    favoriteStickerIds: [],
    recentStickerIds: [],
  };
}

export async function getOrInitSettings(): Promise<AppSettings> {
  const existing = await db.settings.get('app-settings');
  const defaults = createDefaultSettings();
  if (existing) {
    // Gracefully backfill newly added personalization/profile/notification fields for existing installs
    const merged: AppSettings = {
      ...defaults,
      ...existing,
      familyProfiles: existing.familyProfiles?.length ? existing.familyProfiles : defaults.familyProfiles,
      activeProfileId: existing.activeProfileId || 'all',
      eventCategories: existing.eventCategories?.length ? existing.eventCategories : defaults.eventCategories,
      customTabs: Array.isArray(existing.customTabs) ? existing.customTabs : [],
      plannerTitle:
        !existing.plannerTitle || existing.plannerTitle === 'Dayplana' ? 'Planaday' : existing.plannerTitle,
      cardRadius: existing.cardRadius || 'soft',
      mobileLayoutMode: existing.mobileLayoutMode || 'adaptive',
      uiScalePct: typeof existing.uiScalePct === 'number' ? Math.max(80, Math.min(130, existing.uiScalePct)) : 100,
      hiddenSidebarViews: Array.isArray(existing.hiddenSidebarViews) ? existing.hiddenSidebarViews : [],
      syncFallbackUrl: existing.syncFallbackUrl ?? '',
      weatherEnabled: existing.weatherEnabled ?? true,
      weatherLocationName: existing.weatherLocationName ?? '',
      weatherLat: existing.weatherLat ?? null,
      weatherLon: existing.weatherLon ?? null,
      weatherUnit: existing.weatherUnit ?? 'F',
      cachedWeather: existing.cachedWeather ?? null,
      factTopicFilter: existing.factTopicFilter ?? 'All',
      customTimerPresets: Array.isArray(existing.customTimerPresets) ? existing.customTimerPresets : [],
      customMoods: Array.isArray(existing.customMoods) ? existing.customMoods : [],
      customDiaryPrompts: Array.isArray(existing.customDiaryPrompts) ? existing.customDiaryPrompts : [],
      customNotebooks: Array.isArray(existing.customNotebooks) ? existing.customNotebooks : [],
      customMealFavorites: Array.isArray(existing.customMealFavorites) ? existing.customMealFavorites : [],
      defaultCurrency: existing.defaultCurrency || 'USD',
      enabledModules: { ...DEFAULT_ENABLED_MODULES, ...(existing.enabledModules ?? {}) },
      calendars: existing.calendars?.length ? existing.calendars : defaults.calendars,
      calendarPrefs: { ...defaults.calendarPrefs!, ...(existing.calendarPrefs ?? {}) },
      maxFavorites: existing.maxFavorites !== undefined ? existing.maxFavorites : defaults.maxFavorites,
      autoCarryOverTasks: existing.autoCarryOverTasks ?? defaults.autoCarryOverTasks,
      preferredDailyEndTime: existing.preferredDailyEndTime || defaults.preferredDailyEndTime,
      allowSchedulePastEndTime: existing.allowSchedulePastEndTime ?? false,
      schedulingContexts: existing.schedulingContexts?.length ? existing.schedulingContexts : defaults.schedulingContexts,
      reusableTaskTypes: existing.reusableTaskTypes?.length ? existing.reusableTaskTypes : defaults.reusableTaskTypes,
      customDailyNoteSections: existing.customDailyNoteSections?.length
        ? existing.customDailyNoteSections
        : defaults.customDailyNoteSections,
      todayUpcomingDays: existing.todayUpcomingDays ?? 14,
      todayCompactMode: existing.todayCompactMode ?? false,
      diaryRatingScale: existing.diaryRatingScale ?? defaults.diaryRatingScale,
      customDiaryCategories: Array.isArray(existing.customDiaryCategories) ? existing.customDiaryCategories : [],
      quickGlanceWidgets: existing.quickGlanceWidgets?.length ? existing.quickGlanceWidgets : defaults.quickGlanceWidgets,
      quickGlanceActions: existing.quickGlanceActions?.length ? existing.quickGlanceActions : defaults.quickGlanceActions,
      clockConfig: { ...defaults.clockConfig!, ...(existing.clockConfig ?? {}) },
      workspaceSchedules: existing.workspaceSchedules?.length ? existing.workspaceSchedules : defaults.workspaceSchedules,
      autoWorkspaceScheduleEnabled: existing.autoWorkspaceScheduleEnabled ?? false,
      manualWorkspaceOverrideId: existing.manualWorkspaceOverrideId ?? null,
      collapsedSidebarGroups: Array.isArray(existing.collapsedSidebarGroups) ? existing.collapsedSidebarGroups : [],
      creationMode: existing.creationMode || 'standard',
      notificationPrefs: {
        ...defaults.notificationPrefs,
        ...(existing.notificationPrefs ?? {}),
      },
      syncPolicy: {
        ...DEFAULT_SYNC_POLICY,
        ...(existing.syncPolicy ?? {}),
        selectiveWorkspaceIds: Array.isArray(existing.syncPolicy?.selectiveWorkspaceIds)
          ? existing.syncPolicy!.selectiveWorkspaceIds
          : [],
      },
      gpuConfig: {
        ...DEFAULT_GPU_CONFIG,
        ...(existing.gpuConfig ?? {}),
      },
    };
    return merged;
  }
  return db.transaction('rw', db.settings, async () => {
    const initialized = await db.settings.get('app-settings');
    if (initialized) return initialized;
    await db.settings.put(defaults);
    return defaults;
  });
}


export function mergeSettingsObject(base: AppSettings, patch: Partial<AppSettings>): AppSettings {
  return {
    ...base,
    ...patch,
    id: 'app-settings',
    calendarPrefs:
      patch.calendarPrefs && base.calendarPrefs
        ? { ...base.calendarPrefs, ...patch.calendarPrefs }
        : patch.calendarPrefs ?? base.calendarPrefs,
    notificationPrefs:
      patch.notificationPrefs && base.notificationPrefs
        ? { ...base.notificationPrefs, ...patch.notificationPrefs }
        : patch.notificationPrefs ?? base.notificationPrefs,
    enabledModules:
      patch.enabledModules && base.enabledModules
        ? { ...base.enabledModules, ...patch.enabledModules }
        : patch.enabledModules ?? base.enabledModules,
    customTokens:
      patch.customTokens && base.customTokens
        ? { ...base.customTokens, ...patch.customTokens }
        : patch.customTokens ?? base.customTokens,
    clockConfig:
      patch.clockConfig && base.clockConfig
        ? { ...base.clockConfig, ...patch.clockConfig }
        : patch.clockConfig ?? base.clockConfig,
    syncPolicy:
      patch.syncPolicy && base.syncPolicy
        ? { ...base.syncPolicy, ...patch.syncPolicy }
        : patch.syncPolicy ?? base.syncPolicy,
    gpuConfig:
      patch.gpuConfig && base.gpuConfig
        ? { ...base.gpuConfig, ...patch.gpuConfig }
        : patch.gpuConfig ?? base.gpuConfig,
  };
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  return db.transaction('rw', db.settings, async () => {
    const current = await getOrInitSettings();
    const merged = mergeSettingsObject(current, patch);
    await db.settings.put(merged);
    return merged;
  });
}

// --- Storage Persistence & Quota Monitoring (Section 15.01) ---

export interface StorageHealth {
  persisted: boolean;
  usageBytes: number;
  quotaBytes: number;
  percentUsed: number;
  isNearFull: boolean;
  error?: string;
}

export async function requestPersistentStorage(timeoutMs = 2500): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      // CONT-008: Guard against browsers (e.g. Firefox) where navigator.storage.persist() prompts and stays pending indefinitely
      return await Promise.race([
        navigator.storage.persist(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
      ]);
    }
  } catch {
    // non-fatal
  }
  return false;
}

export async function getStorageHealth(): Promise<StorageHealth> {
  try {
    const persisted = (await navigator.storage?.persisted?.()) ?? false;
    const est = (await navigator.storage?.estimate?.()) ?? { usage: 0, quota: 0 };
    const usage = est.usage ?? 0;
    const quota = est.quota ?? 0;
    const percentUsed = quota > 0 ? (usage / quota) * 100 : 0;
    return {
      persisted,
      usageBytes: usage,
      quotaBytes: quota,
      percentUsed,
      isNearFull: percentUsed > 90,
    };
  } catch (err) {
    return {
      persisted: false,
      usageBytes: 0,
      quotaBytes: 0,
      percentUsed: 0,
      isNearFull: false,
      error: err instanceof Error ? err.message : 'Unable to read storage estimate',
    };
  }
}

// --- Content-Addressed Binary Blob Store + Thumbnail Pipeline (15.01, 15.06) ---

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // LAN HTTP is not a secure context. Use the same SHA-256 digest rather than a weak substitute.
  return portableSha256(buffer);
}

// Backward compatibility only: verify existing non-cryptographic legacy backup checksums.
export function legacyBlobHash(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < bytes.length; i++) {
    h1 ^= bytes[i];
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= bytes[i] ^ (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}${bytes.length.toString(16)}`;
}

function portableSha256(buffer: ArrayBuffer): string {
  const k = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const state = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const data = new Uint8Array(buffer), w = new Uint32Array(64), block = new Uint8Array(64), view = new DataView(block.buffer);
  const rotate = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  const paddedLength = Math.ceil((data.length + 9) / 64) * 64;
  for (let offset = 0; offset < paddedLength; offset += 64) {
    block.fill(0); block.set(data.subarray(offset, offset + 64));
    if (offset <= data.length && data.length < offset + 64) block[data.length - offset] = 0x80;
    if (offset + 64 === paddedLength) { view.setUint32(56, Math.floor(data.length / 0x20000000)); view.setUint32(60, (data.length * 8) >>> 0); }
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i-15], b = w[i-2];
      w[i] = (w[i-16] + (rotate(a,7)^rotate(a,18)^(a>>>3)) + w[i-7] + (rotate(b,17)^rotate(b,19)^(b>>>10))) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = state;
    for (let i=0;i<64;i++) {
      const t1 = (h + (rotate(e,6)^rotate(e,11)^rotate(e,25)) + ((e&f)^(~e&g)) + k[i] + w[i]) >>> 0;
      const t2 = ((rotate(a,2)^rotate(a,13)^rotate(a,22)) + ((a&b)^(a&c)^(b&c))) >>> 0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    state[0]+=a;state[1]+=b;state[2]+=c;state[3]+=d;state[4]+=e;state[5]+=f;state[6]+=g;state[7]+=h;
  }
  return Array.from(state, v => v.toString(16).padStart(8,'0')).join('');
}

async function generateImageThumbnail(blob: Blob, maxSize = 360): Promise<Blob | null> {
  if (typeof document === 'undefined' || !blob.type.startsWith('image/') || blob.type === 'image/svg+xml') {
    return null;
  }
  try {
    if (typeof createImageBitmap !== 'function') return null;
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, maxSize / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bmp.close(); return null; }
    try { ctx.drawImage(bmp, 0, 0, w, h); } finally { bmp.close(); }
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', 0.78)
    );
  } catch {
    return null;
  }
}

export async function blobToArrayBuffer(input: Blob | ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
  if (input instanceof ArrayBuffer || Object.prototype.toString.call(input) === '[object ArrayBuffer]') {
    const ab = input as ArrayBuffer;
    const copy = new Uint8Array(ab.byteLength);
    copy.set(new Uint8Array(ab));
    return copy.buffer;
  }
  if (ArrayBuffer.isView(input)) {
    const view = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    const copy = new Uint8Array(view.byteLength);
    copy.set(view);
    return copy.buffer;
  }
  if (typeof (input as Blob).arrayBuffer === 'function') {
    return (input as Blob).arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsArrayBuffer(input as Blob);
  });
}

export async function storeBlob(fileOrBlob: Blob, name = 'attachment'): Promise<BlobRecord> {
  const buf = await blobToArrayBuffer(fileOrBlob);
  const hash = await sha256Hex(buf);
  const existing = await db.blobs.get(hash);
  if (existing) return existing;

  const thumbBlob = await generateImageThumbnail(fileOrBlob);
  const record: BlobRecord = {
    hash,
    mimeType: fileOrBlob.type || 'application/octet-stream',
    size: buf.byteLength,
    name,
    data: buf,
    thumbBlob,
    createdAt: new Date().toISOString(),
    synced: false,
  };
  return db.transaction('rw', db.blobs, async () => {
    const current = await db.blobs.get(hash);
    if (current) return current;
    await db.blobs.put(record);
    return record;
  });
}

export async function getBlobObjectUrl(hash: string, preferThumb = false, owned = false): Promise<string | null> {
  if (owned) {
    const rec = await db.blobs.get(hash);
    if (!rec) return null;
    return URL.createObjectURL(preferThumb && rec.thumbBlob ? rec.thumbBlob : new Blob([rec.data ?? rec.blob ?? new ArrayBuffer(0)], { type: rec.mimeType }));
  }
  const cacheKey = `${hash}:${preferThumb ? 'thumb' : 'full'}`;
  return blobUrlCache.getOrLoad(cacheKey, async () => {
    const rec = await db.blobs.get(hash);
    if (!rec) return null;
    const target = preferThumb && rec.thumbBlob ? rec.thumbBlob : new Blob([rec.data ?? rec.blob ?? new ArrayBuffer(0)], { type: rec.mimeType });
    return { blob: target, byteSize: rec.size };
  });
}
