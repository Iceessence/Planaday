import Dexie, { type Table } from 'dexie';
import type {
  AppSettings,
  BlobRecord,
  EventCategoryDef,
  FamilyProfile,
  LifeRecord,
  ModuleId,
  NotificationPreferences,
  OutboxOp,
  RevisionRecord,
  SyncConflict,
  TimeLedgerEntry,
  UndoEntry,
} from './types';
import { THEME_PRESETS } from '../data/themes';
import { getSystemTimeZone } from './temporal';

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
  today: true,
  calendar: true,
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
  ai: false,
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
    operatingMode: isLikelyServerOrigin ? 'docker-sync' : isCapacitorNative ? 'offline-phone' : 'offline-computer',
    syncServerUrl: '', // same origin when served from Docker; set to http://192.168.x.x:3000 in native apps
    syncFallbackUrl: '', // optional Tailscale IP/URL for away-from-home failover
    lastSyncSeq: 0,
    lastSyncAt: null,
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
      notificationPrefs: {
        ...defaults.notificationPrefs,
        ...(existing.notificationPrefs ?? {}),
      },
    };
    return merged;
  }
  await db.settings.put(defaults);
  return defaults;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getOrInitSettings();
  const merged: AppSettings = { ...current, ...patch, id: 'app-settings' };
  await db.settings.put(merged);
  return merged;
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

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      return await navigator.storage.persist();
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
  // Deterministic fallback hash for environments without subtle crypto
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
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', 0.78)
    );
  } catch {
    return null;
  }
}

export async function blobToArrayBuffer(input: Blob | ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
  if (input instanceof ArrayBuffer) return input;
  if (ArrayBuffer.isView(input)) {
    return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
  }
  if (typeof input.arrayBuffer === 'function') {
    return input.arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsArrayBuffer(input);
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
  await db.blobs.put(record);
  return record;
}

export async function getBlobObjectUrl(hash: string, preferThumb = false): Promise<string | null> {
  const rec = await db.blobs.get(hash);
  if (!rec) return null;
  const target = preferThumb && rec.thumbBlob ? rec.thumbBlob : new Blob([rec.data], { type: rec.mimeType });
  return URL.createObjectURL(target);
}
