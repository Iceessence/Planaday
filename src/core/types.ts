import type {
  ColorSchemePreference,
  DensityMode,
  FontPairing,
  PaperMaterial,
  ThemeTokens,
} from '../data/themes';
import type { WeatherSnapshot } from './weather';

export type { ColorSchemePreference, DensityMode, FontPairing, PaperMaterial, ThemeTokens };

export type OperatingMode = 'docker-sync' | 'offline-phone' | 'offline-computer';

export type ModuleId =
  | 'home'
  | 'quick_glance'
  | 'today'
  | 'calendar'
  | 'task_calendar'
  | 'digital_planner'
  | 'tasks'
  | 'chores'
  | 'notes'
  | 'thoughts'
  | 'diary'
  | 'events'
  | 'time'
  | 'kitchen'
  | 'goals'
  | 'habits'
  | 'household'
  | 'health'
  | 'finance'
  | 'learning'
  | 'media'
  | 'travel'
  | 'people'
  | 'home_assets'
  | 'lab'
  | 'reports'
  | 'ai';

export type NavView =
  | 'all_in_one'
  | 'quick_glance'
  | 'home'
  | 'today'
  | 'digital_planner'
  | 'planner'
  | 'calendar'
  | 'task_calendar'
  | 'tasks'
  | 'chores'
  | 'history'
  | 'reports'
  | 'events'
  | 'notes'
  | 'thoughts'
  | 'diary'
  | 'learning'
  | 'clock'
  | 'alarms'
  | 'timers'
  | 'stopwatch'
  | 'countdown'
  | 'recipes'
  | 'pantry'
  | 'meals'
  | 'shopping'
  | 'goals'
  | 'habits'
  | 'household'
  | 'people'
  | 'health'
  | 'finance'
  | 'media'
  | 'travel'
  | 'home_assets'
  | 'lab'
  | 'spaces'
  | 'custom_tab'
  | 'insights'
  | 'rituals'
  | 'automations'
  | 'guide'
  | 'trash'
  | 'settings';

export type RecordType =
  | 'task'
  | 'chore'
  | 'habit'
  | 'goal'
  | 'routine'
  | 'event'
  | 'timeblock'
  | 'note'
  | 'notebook'
  | 'thought'
  | 'diary'
  | 'life_event'
  | 'countdown'
  | 'alarm'
  | 'timer'
  | 'interval_preset'
  | 'recipe'
  | 'pantry_lot'
  | 'pantry_zone'
  | 'meal_plan'
  | 'food_log'
  | 'grocery_item'
  | 'person'
  | 'household_member'
  | 'medication'
  | 'workout'
  | 'wellness_log'
  | 'bill'
  | 'budget_envelope'
  | 'expense'
  | 'warranty'
  | 'wishlist_item'
  | 'review_card'
  | 'media_item'
  | 'hobby_project'
  | 'trip'
  | 'packing_template'
  | 'party'
  | 'gift'
  | 'home_asset'
  | 'vehicle'
  | 'pet_plant'
  | 'storage_item'
  | 'custom_space'
  | 'decor_item'
  | 'custom_sticker'
  | 'automation_rule'
  | 'spread_template'
  | 'saved_view'
  | 'period_reflection'
  | 'triage_item'
  | 'context_mode'
  | 'quick_capture'
  | 'planner_book'
  | 'planner_page'
  | 'lab_sample'
  | 'lab_subcontract'
  | 'lab_inventory'
  | 'lab_order'
  | 'lab_budget'
  | 'lab_price_entry'
  | 'lab_price_template'
  | 'lab_research'
  | 'lab_email_draft'
  | 'lab_task'
  | 'lab_meeting'
  | 'lab_calibration'
  | 'lab_wet_nir'
  | 'lab_work_hour'
  | 'lab_qms_item';

export interface EntityLink {
  targetId: string;
  targetType?: RecordType;
  relation: 'mentions' | 'attached_note' | 'scheduled_from' | 'person' | 'recipe' | 'supply' | 'parent' | 'depends_on' | 'expense' | 'asset';
  label?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface LifeRecord<P = any> {
  id: string;
  workspaceId: string;
  type: RecordType;
  title: string;
  status: 'active' | 'done' | 'paused' | 'archived' | 'canceled';
  createdAt: string; // ISO instant
  updatedAt: string; // ISO instant
  deletedAt: string | null; // non-null => in 30-day Trash
  isSample?: boolean;
  // Shared ActionItem core fields (Section 03.01)
  dueDate?: string | null; // Hard deadline YYYY-MM-DD
  doDate?: string | null; // Planned work day YYYY-MM-DD
  priority?: 'none' | 'low' | 'medium' | 'high' | 'urgent';
  estimateMin?: number | null;
  energy?: 'low' | 'medium' | 'high';
  category?: string;
  color?: string;
  assigneeId?: string | null;
  // Family Profile Ownership & Cross-Profile Sharing
  ownerProfileId?: string | null;
  sharedWithAll?: boolean;
  sharedWithProfileIds?: string[];
  isImportant?: boolean;
  tags: string[];
  links: EntityLink[];
  recurrence?: RecurrenceRule | null;
  // Type-specific structured data
  payload: P;
  // Sync metadata
  rev: number;
  deviceId: string;
  fieldUpdatedAt?: Record<string, string>;
}

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  byWeekday?: number[]; // 0=Sun..6=Sat
  bySetPos?: number; // e.g., 1st, 2nd, -1 (last)
  firstBusinessDay?: boolean;
  skipWeekends?: boolean;
  skipHolidays?: boolean;
  until?: string | null; // YYYY-MM-DD
  count?: number | null;
  exceptions?: string[]; // YYYY-MM-DD skipped dates
  feb29Policy?: 'feb28' | 'mar1' | 'skip';
  mode?: 'calendar' | 'completion'; // for tasks/chores
}

export interface SubtaskItem {
  id: string;
  title: string;
  done: boolean;
  children?: SubtaskItem[];
}

export interface DurationCompletionLog {
  id: string;
  startedAt?: string | null;
  completedAt: string;
  actualMinutes: number;
  estimatedMinutes?: number;
  breakMinutes?: number;
  distracted: boolean;
  distractionMinutes?: number;
  distractionNote?: string;
  notes?: string;
  isEstimatedStart?: boolean;
}

export interface TaskPayload {
  notes?: string;
  subtasks: SubtaskItem[];
  pinnedTop3Date?: string | null; // YYYY-MM-DD if pinned to Today's Favorites
  favoriteCategory?: string;
  favoriteOrder?: number;
  sortOrder?: number;
  customPriorityRank?: number; // optional numeric priority (1..100)
  taskType?: string; // reusable task type for learned average duration
  originalDueDate?: string | null;
  rescheduleCount?: number;
  contextId?: string | null; // scheduling context (Work, Home, Lab, etc.)
  blockedByIds?: string[];
  waitingFor?: string;
  actualMinutes?: number;
  startedAt?: string | null;
  completedAt?: string | null;
  completionLogs?: DurationCompletionLog[];
  boardColumn?: 'backlog' | 'next' | 'in_progress' | 'done';
  sourceProvenance?: string;
  manualStartTime?: string | null; // HH:MM manual override on Task Calendar
}

export interface ChoreCompletionEntry {
  id: string;
  completedAt: string; // ISO
  completedDate: string; // YYYY-MM-DD
  scheduledDueDate?: string; // YYYY-MM-DD when it was due
  wasOnTime?: boolean;
  daysDelta?: number; // <= 0 on time/early, > 0 days late
  assigneeId?: string | null;
  minutesSpent?: number;
  breakMinutes?: number;
  distracted?: boolean;
  distractionMinutes?: number;
  distractionNote?: string;
  notes?: string;
}

export interface ChorePayload {
  room: string;
  choreMode: 'after_completion' | 'fixed' | 'weekdays' | 'monthly_nth' | 'usage_counter' | 'elapsed_hours' | 'seasonal';
  intervalDays: number;
  usageTarget?: number;
  usageCount?: number;
  elapsedHoursTarget?: number;
  activeSeasons?: Array<'spring' | 'summer' | 'fall' | 'winter'>;
  difficulty: 1 | 2 | 3 | 4 | 5;
  sortOrder?: number;
  contextId?: string | null;
  checklist: Array<{ id: string; text: string; done: boolean }>;
  linkedSupplies: string[];
  lastCompletedDate?: string | null;
  nextDueDate: string; // YYYY-MM-DD
  snoozedUntil?: string | null;
  snoozeReason?: string;
  paused?: boolean;
  rotationQueueIds?: string[];
  requireApproval?: boolean;
  notifyEnabled?: boolean; // defaults to global settings.notificationPrefs.notifyChores
  customReminderTime?: string | null; // optional per-chore HH:MM override
  customSound?: string; // 'default' | chimeStyle | AlarmRingtoneId | blob:<hash>
  completions: ChoreCompletionEntry[];
}

export interface EventBufferWings {
  prepMin?: number;
  travelMin?: number;
  decompressMin?: number;
}

export interface EventRetrospective {
  outcome: 'Great' | 'Good' | 'Okay' | 'Tough';
  rating: 1 | 2 | 3 | 4 | 5;
  note?: string;
  loggedAt: string;
}

export interface CalendarEventPayload {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  startTime?: string; // HH:MM (omitted when allDay)
  endTime?: string; // HH:MM
  allDay: boolean;
  floating: boolean; // floating local date vs fixed IANA zone
  timeZone: string; // IANA name e.g. America/Los_Angeles
  style: 'soft' | 'filled' | 'outline';
  emoji?: string;
  eventStatus: 'confirmed' | 'tentative' | 'canceled';
  importance?: 'normal' | 'must_do' | 'optional';
  location?: string;
  attendees?: string[];
  url?: string;
  notes?: string;
  attachmentBlobIds?: string[];
  remindersMin?: number[];
  notifyEnabled?: boolean; // defaults to global settings.notificationPrefs.notifyEvents
  customSound?: string; // 'default' | chimeStyle | AlarmRingtoneId | blob:<hash>
  customVolume?: number | null; // 0..100 override (null = use global volume)
  buffers?: EventBufferWings;
  linkedActionId?: string | null; // linked task/chore/milestone/bill/meal
  seriesMasterId?: string | null;
  recurrenceExceptionDate?: string | null;
  icsUid?: string;
  actualStartTime?: string;
  actualEndTime?: string;
  actualNote?: string;
  isActualLog?: boolean;
  retrospective?: EventRetrospective | null;
  calendarId?: string; // multi-calendar layer id (e.g. cal_personal, cal_work, cal_lab)
}

export interface GoalMilestone {
  id: string;
  title: string;
  done: boolean;
  dueDate?: string | null;
}

export interface GoalPayload {
  description?: string;
  targetDate?: string | null;
  milestones: GoalMilestone[];
  area?: string;
}

export interface HabitPayload {
  scheduleType: 'daily' | 'selected_days' | 'weekly_target';
  selectedDays?: number[]; // 0..6
  weeklyTarget?: number; // 1..7
  unit?: string;
  targetQuantity?: number;
  logs: Record<string, { value: number; excused?: boolean; note?: string }>; // YYYY-MM-DD -> entry
  pausedRanges?: Array<{ start: string; end: string; reason?: string }>;
}

export interface NotePayload {
  notebookId: string;
  folderPath?: string;
  writtenForDate: string; // YYYY-MM-DD
  pinned?: boolean;
  content: string; // Unlimited Markdown / block content
  citations?: string[];
  attachmentBlobIds?: string[];
  sketchBlobId?: string | null;
  voiceMemoBlobIds?: string[];
  touchedDates?: string[];
  // Phase 5 Rich Formatting & Presentation Options
  presentationMode?: 'scroll' | 'pages' | 'spread' | 'notebook' | 'planner';
  paperStyle?: 'blank' | 'lined' | 'grid' | 'dot';
  fontFamily?: 'inherit' | 'serif' | 'sans' | 'mono' | 'handwriting';
  fontSizePx?: number;
  lineSpacing?: number;
  paragraphSpacing?: number;
  textAlign?: 'left' | 'center' | 'right';
  textColor?: string;
  bgColor?: string;
}

export interface ThoughtPayload {
  content: string;
  source?: 'keyboard' | 'quick_capture' | 'share_sheet' | 'voice';
  filedRanges?: Array<{ targetId: string; targetType: RecordType; excerpt: string; filedAt: string }>;
}

export interface DiaryPhotoEntry {
  id: string;
  blobHash: string;
  caption?: string;
  timestamp: string;
  album?: string;
  tags?: string[];
  linkedActivity?: string;
}

export interface BathroomLogEntry {
  id: string;
  time: string; // HH:MM
  kind: 'urination' | 'bowel';
  note?: string;
}

export interface DiaryPayload {
  date: string; // YYYY-MM-DD
  mood?: 'Great' | 'Good' | 'Okay' | 'Low' | 'Rough' | string;
  emotions?: string[];
  energy?: number; // legacy 1..5 or 1..10
  stress?: number; // legacy 1..5 or 1..10
  sleepHours?: number;
  sleepQuality?: number;
  waterCups?: number;
  exerciseMin?: number;
  mealsNote?: string;
  weatherNote?: string;
  summary?: string;
  wins?: string;
  challenges?: string;
  learned?: string;
  gratitude?: string;
  tonight?: string;
  dailyNotes?: string;
  narrative?: string;
  promptUsed?: string;
  blankMode?: boolean;
  mediaBlobIds?: string[];
  extraEntries?: Array<{ id: string; time: string; text: string; mood?: string }>;
  // Phase 4 Comprehensive 1-10 Ratings, Custom Categories, Bathroom Tracking, Daily Sections & Rich Photos
  ratings?: Record<string, number>;
  ratingScaleMin?: number;
  ratingScaleMax?: number;
  customTrackers?: Record<string, string | number | boolean>;
  bathroom?: {
    urinations: number;
    bowelMovements: number;
    notes?: string;
    logs?: BathroomLogEntry[];
  };
  dailyNoteSections?: Record<string, string>;
  photos?: DiaryPhotoEntry[];
}

export interface FoodLogPayload {
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  mealCategory: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink' | string;
  foodName: string;
  portionQty?: number;
  portionUnit?: string;
  ingredients?: string[];
  recipeId?: string | null;
  rating?: number; // 0..5
  photoBlobHash?: string | null;
  notes?: string;
}

export interface RecipeIngredient {
  id: string;
  quantity: number;
  unit: string;
  name: string;
  canonicalName: string;
  prepText?: string;
  group?: string;
  optional?: boolean;
  nonLinear?: boolean;
  substitutions?: string;
  aisle?: string;
}

export interface RecipeStep {
  id: string;
  order: number;
  text: string;
  durationMin?: number;
  ingredientIds?: string[];
}

export interface RecipePayload {
  heroBlobId?: string | null;
  galleryBlobIds?: string[];
  cuisine?: string;
  mealTypes: string[];
  dietaryBadges: string[];
  allergens: string[];
  servings: number;
  prepMin: number;
  cookMin: number;
  restMin: number;
  difficulty: 'easy' | 'medium' | 'hard';
  rating: number; // 0..5
  madeCount: number;
  sourceUrl?: string;
  sourceBook?: string;
  equipment: string[];
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  nutrition?: { calories?: number; proteinG?: number; carbsG?: number; fatG?: number };
  variations?: string;
}

export interface PantryLotPayload {
  ingredientName: string;
  canonicalName: string;
  quantity: number;
  unit: string;
  zone: string; // Fridge | Freezer | Dry Pantry | Spice Rack | Countertop | Unassigned | custom
  shelfBin?: string;
  parLevel?: number;
  reservedQty?: number;
  purchaseDate?: string;
  openedDate?: string;
  freezeDate?: string;
  thawDate?: string;
  bestByDate?: string;
  eatByDate?: string;
  barcode?: string;
  isLeftover?: boolean;
  sourceRecipeId?: string;
  wasteLog?: Array<{ date: string; qty: number; reason: string }>;
}

export interface MealPlanPayload {
  date: string; // YYYY-MM-DD
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  entryType: 'recipe' | 'leftover' | 'eating_out' | 'text';
  recipeId?: string | null;
  deletedRecipeName?: string; // preserved if recipe deleted (15.05)
  leftoverLotId?: string | null;
  servings?: number;
  notes?: string;
  prepReminderEventId?: string | null;
}

export interface GroceryItemPayload {
  canonicalName: string;
  quantity: number;
  unit: string;
  aisle: string;
  store: string;
  checked: boolean;
  boughtQty?: number;
  price?: number;
  currency?: string;
  expiryDate?: string;
  targetZone?: string;
  sourceLabel?: string;
}

export interface DecorItemPayload {
  spreadKey: string; // e.g., today:2026-11-23, week:2026-W48, month:2026-11
  kind: 'sticker' | 'washi' | 'sticky_note' | 'stamp' | 'ink' | 'shape';
  anchorId: string;
  anchorMode?: 'page' | 'section' | 'object' | 'text' | 'canvas';
  layerPosition?: 'above' | 'below';
  relX: number; // 0..1 normalized
  relY: number; // 0..1 normalized
  fixedPxX?: number; // pixel anchor for 'canvas' / resize-immune mode
  fixedPxY?: number;
  scale: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  locked: boolean;
  lockEditing?: boolean;
  stickerId?: string;
  customBlobId?: string;
  emoji?: string;
  label?: string;
  text?: string;
  color?: string;
  widthPct?: number;
  heightPct?: number;
  stampText?: 'DONE' | 'PRIORITY' | 'MOVED' | 'CANCELED' | string;
  shapeKind?: 'line' | 'arrow' | 'rect' | 'ellipse';
  shapeCoords?: { x1: number; y1: number; x2: number; y2: number };
  inkPaths?: Array<{
    id?: string;
    color: string;
    width: number;
    opacity?: number;
    tool?: 'pen' | 'pencil' | 'fine' | 'marker' | 'highlighter' | 'dashed';
    highlighter?: boolean;
    points: Array<[number, number]>;
  }>;
}

export interface BlobRecord {
  hash: string; // SHA-256 hex
  mimeType: string;
  size: number;
  name: string;
  data: ArrayBuffer;
  blob?: Blob;
  thumbBlob?: Blob | null;
  createdAt: string;
  synced?: boolean;
}

export interface OutboxOp {
  opId: string;
  recordId: string;
  operation: 'upsert' | 'delete';
  record?: LifeRecord;
  baseRev: number;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

export interface UndoEntry {
  id: string;
  label: string;
  timestamp: string;
  changes: Array<{
    recordId: string;
    before: LifeRecord | null;
    after: LifeRecord | null;
  }>;
}

export interface RevisionRecord {
  id: string;
  recordId: string;
  timestamp: string;
  title: string;
  content: string;
  label?: string; // Optional user-named checkpoint label
}

export interface TimeLedgerEntry {
  id: string;
  workspaceId: string;
  sourceType: 'timer' | 'pomodoro' | 'interval' | 'stopwatch' | 'manual';
  label: string;
  linkedRecordId?: string | null;
  startedAt: string;
  endedAt: string;
  activeSeconds: number;
  date: string; // YYYY-MM-DD
  notes?: string;
  laps?: number[]; // ms
}

export interface SyncConflict {
  id: string;
  recordId: string;
  localRecord: LifeRecord;
  remoteRecord: LifeRecord;
  createdAt: string;
  resolved: boolean;
}

export interface WorkspaceProfile {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export interface FamilyProfile {
  id: string;
  name: string;
  emoji: string;
  color: string;
  role: 'parent' | 'member' | 'kid';
}

export interface EventCategoryDef {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export type ChimeStyle = 'soft' | 'bell' | 'marimba' | 'classic_alarm' | 'woodblock' | 'bright';

export type MobileLayoutMode = 'adaptive' | 'portrait' | 'portrait_landscape' | 'desktop_zoom';

export interface NotificationPreferences {
  enabled: boolean;
  soundEnabled: boolean;
  osPushEnabled: boolean;
  ntfyRelayEnabled: boolean;
  vibrateEnabled?: boolean;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string; // HH:MM e.g. '22:00'
  quietHoursEnd?: string; // HH:MM e.g. '07:00'
  volume: number; // 0..100
  chimeStyle: ChimeStyle;
  notifyTimers: boolean;
  notifyAlarms: boolean;
  notifyEvents: boolean;
  eventLeadMinutes: number; // minutes before event start (0..180)
  notifyChores: boolean;
  choreReminderTime: string; // HH:MM daily chore digest/alert
  notifyStopwatch: boolean;
  stopwatchIntervalMin: number; // notify every N minutes during stopwatch (0 = off)
}

export type CustomWidgetType =
  | 'events'
  | 'tasks'
  | 'chores'
  | 'note'
  | 'counters'
  | 'timers'
  | 'links'
  | 'weather'
  | 'alarms'
  | 'habits';

export interface CustomTabWidget {
  id: string;
  type: CustomWidgetType;
  title: string;
  spanFull?: boolean;
  accentColor?: string;
  limit?: number;
  filterCategory?: string;
  filterRoom?: string;
  filterTag?: string;
  filterPriority?: string;
  onlySharedImportant?: boolean;
  noteContent?: string;
  counters?: Array<{ id: string; label: string; value: number; target?: number; unit?: string; step?: number }>;
  timerPresets?: Array<{ id?: string; label: string; seconds: number; customSound?: string }>;
  links?: Array<{ id: string; label: string; emoji?: string; targetView?: NavView; targetCustomTabId?: string; url?: string }>;
}

export interface CustomTabDef {
  id: string;
  name: string;
  emoji: string;
  color: string;
  layout: 'grid' | 'single';
  widgets: CustomTabWidget[];
}

export interface CalendarLayerDef {
  id: string;
  name: string;
  emoji: string;
  color: string;
  visible: boolean;
}

export interface CalendarViewPrefs {
  intervalMin: number; // 1, 2, 5, 10, 15, 20, 30, 45, 60, 120, 180, 240, or custom
  majorGridIntervalMin: number; // e.g., 60
  showMajorGrid: boolean;
  showMinorGrid: boolean;
  gridThicknessPx: number;
  majorLineColor: string;
  minorLineColor: string;
  gridOpacity: number; // 0.1..1
  gridLineStyle: 'solid' | 'dashed';
  timeLabelEveryMin: number; // 15, 30, 60, 120, 240
  adaptiveText: boolean;
  minFontPx: number;
  maxFontPx: number;
  visibleStartHour: number; // 0..23
  visibleEndHour: number; // 1..24
  overlapPolicy: 'allow' | 'side_by_side' | 'auto_resize' | 'prevent' | 'warn' | 'stack' | 'condensed';
  dayMinWidthPx: number;
}

export interface SchedulingContextDef {
  id: string;
  name: string;
  emoji: string;
  color: string;
  days: number[]; // 0=Sun..6=Sat
  startTime: string; // HH:MM
  endTime: string; // HH:MM
}

export interface DailyNoteSectionDef {
  id: string;
  title: string;
  emoji: string;
  visible: boolean;
  schedule: 'daily' | 'weekdays' | 'weekends';
}

export interface CustomDiaryCategoryDef {
  id: string;
  name: string;
  kind: 'rating' | 'counter' | 'duration' | 'measurement' | 'checkbox' | 'text';
  unit?: string;
  min?: number;
  max?: number;
}

export type ClockDesignId =
  | 'analog_traditional'
  | 'analog_minimal'
  | 'digital'
  | 'retro_digital'
  | 'modern_minimal'
  | 'decorative';

export interface ClockVisualConfig {
  design: ClockDesignId;
  showSeconds: boolean;
  sizePx: number;
  accentColor: string;
  bgColor: string;
  borderStyle: 'solid' | 'double' | 'none';
  numberStyle: 'arabic' | 'roman' | 'dots' | 'none';
}

export interface WorkspaceScheduleRule {
  id: string;
  name: string;
  emoji: string;
  color: string;
  workspaceId: string;
  days: number[]; // 0..6
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  defaultView?: NavView;
  hiddenViews?: NavView[];
  taskContextId?: string | null;
  clockDesign?: ClockDesignId;
}

export interface ReusableTaskTypeDef {
  id: string;
  name: string;
  defaultEstimateMin: number;
  category?: string;
}

export interface AppSettings {
  id: 'app-settings';
  deviceId: string;
  activeWorkspaceId: string;
  workspaces: WorkspaceProfile[];
  // Family Member Profiles & Sharing
  familyProfiles: FamilyProfile[];
  activeProfileId: string; // 'all' for Combined Household or a specific FamilyProfile.id
  // Selectable Event Categories
  eventCategories: EventCategoryDef[];
  // User-Created Sidebar Custom Tabs
  customTabs: CustomTabDef[];
  // Custom Branding & Deep Personalization
  plannerTitle: string;
  cardRadius: 'sharp' | 'soft' | 'cozy';
  mobileLayoutMode: MobileLayoutMode;
  uiScalePct: number; // 80..130
  hiddenSidebarViews: NavView[];
  collapsedSidebarGroups?: string[];
  creationMode?: 'simple' | 'standard' | 'advanced';
  operatingMode: OperatingMode;
  syncServerUrl: string; // Primary URL: empty in same-origin Docker browser, or e.g. http://192.168.88.31:3000
  syncFallbackUrl: string; // Optional Tailscale / Remote fallback URL: e.g. http://100.x.y.z:3000 or https://host.ts.net
  lastSyncSeq: number;
  lastSyncAt: string | null;
  // Weather (live Open-Meteo when online + cached offline fallback)
  weatherEnabled: boolean;
  weatherLocationName: string;
  weatherLat: number | null;
  weatherLon: number | null;
  weatherUnit: 'F' | 'C';
  cachedWeather: WeatherSnapshot | null;
  // Deeper Per-Module Personalization
  factTopicFilter: string;
  customTimerPresets: Array<{ id: string; label: string; seconds: number }>;
  customMoods: string[];
  customDiaryPrompts: string[];
  customThoughtPrompts: string[];
  customRingtones: Array<{ hash: string; name: string }>;
  customNotebooks: Array<{ id: string; name: string; color: string }>;
  customMealFavorites: string[];
  defaultCurrency: string;
  // Phase 3 Calendar, Tasks & Intelligent Scheduling
  calendars?: CalendarLayerDef[];
  calendarPrefs?: CalendarViewPrefs;
  maxFavorites?: number | null; // null = unlimited; default 3
  autoCarryOverTasks?: boolean;
  preferredDailyEndTime?: string; // e.g. '21:00'
  allowSchedulePastEndTime?: boolean;
  schedulingContexts?: SchedulingContextDef[];
  reusableTaskTypes?: ReusableTaskTypeDef[];
  // Phase 4 Today, Quick Glance & Diary Customization
  customDailyNoteSections?: DailyNoteSectionDef[];
  todayUpcomingDays?: number;
  todayCompactMode?: boolean;
  diaryRatingScale?: { min: number; max: number; step: number };
  customDiaryCategories?: CustomDiaryCategoryDef[];
  quickGlanceWidgets?: string[];
  quickGlanceActions?: string[];
  // Phase 5 Clock Designs
  clockConfig?: ClockVisualConfig;
  // Phase 6 Schedule-Based Workspace Layouts
  workspaceSchedules?: WorkspaceScheduleRule[];
  autoWorkspaceScheduleEnabled?: boolean;
  manualWorkspaceOverrideId?: string | null;
  // Personalization
  themePresetId: string;
  customTokens: ThemeTokens;
  colorScheme: ColorSchemePreference;
  contrastLevel: 'AA' | 'AAA';
  paperMaterial: PaperMaterial;
  spreadPaperOverrides: Record<string, PaperMaterial>;
  paperGrain: boolean;
  bookSpineShadow: boolean;
  binderTabs: boolean;
  fontPairing: FontPairing;
  fontSizePx: number; // 12..24
  lineHeight: number; // 1.3..1.9
  density: DensityMode;
  iconPack: 'line' | 'filled' | 'emoji';
  reducedMotion: boolean;
  hapticsEnabled: boolean;
  rtl: boolean;
  locale: string; // e.g. 'en-US' or 'en-GB'
  // Logical day & calendar
  dayBoundaryHour: number; // 0..6 (e.g. 0 = midnight, 4 = 4:00 AM)
  weekStartsOn: 0 | 1; // 0=Sun, 1=Mon
  showWeekends: boolean;
  defaultTimeZone: string;
  secondaryTimeZone: string;
  timeFormat: '12h' | '24h';
  dailyCapacityHours: number;
  openBookLayout: boolean;
  showFactsWidget: boolean;
  customFactsDeck: Array<{ id: number; topic: string; text: string }>;
  // Modules & navigation
  enabledModules: Record<ModuleId, boolean>;
  mobilePrimaryTabs: NavView[]; // 4 primary bottom tabs
  activeContextModeId: string | null;
  lowEnergyMode: boolean;
  onboardingCompleted: boolean;
  // Home layout widget order
  homeWidgets: string[];
  todayLeftWidgets: string[];
  todayRightWidgets: string[];
  // Optional BYOK AI
  aiEnabled: boolean;
  aiEndpoint: string;
  aiApiKey: string;
  aiModel: string;
  // Background alarm, event, chore, stopwatch & timer notification controls
  notificationsEnabled: boolean;
  notificationPrefs: NotificationPreferences;
  ntfyPushUrl: string; // e.g., https://ntfy.sh/my-private-dayplana-alerts
  // Keyboard shortcut overrides
  shortcuts: Record<string, string>;
  // Favorites & recents for stickers
  favoriteStickerIds: string[];
  recentStickerIds: string[];
}
