// Permanent Planaday Changelog — continuously maintained with every verified release.

export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  highlights: string[];
  bugFixes: string[];
  performanceAndSync: string[];
  mobileAndUx: string[];
  storageAndData: string[];
  knownLimitations: string[];
}

export const PLANADAY_CHANGELOG: ChangelogRelease[] = [
  {
    version: '3.0.0',
    date: '2026-11-24',
    title: 'Phases 3–10 Complete — Calendar Overhaul, Task Calendar, Quick Glance, Diary 1–10, Food History, Rich Notes, Lab Workspace, Physical Digital Planner & Reports',
    highlights: [
      'Phase 3 — Flow Calendar Overhaul: 12 zoom intervals from 1 minute to 4 hours + custom intervals, customizable major/minor horizontal gridlines, adaptive event text scaling, 7 overlap policies (including optional overlap prevention), visible hours window, multi-calendar layers, and optional calendar Ink/Stickers.',
      'Phase 3 — Tasks, Chores & Dedicated Intelligent Task Calendar: Drag-and-drop custom ordering, unlimited configurable Favorites, unfinished task carry-forward preserving creation age & reschedule counts, live Start/Pause task timer, distracted vs. undistracted duration logging, learned task-type averages, Preferred Daily End Time, and unlimited scheduling Contexts.',
      'Phase 4 — Today, Quick Glance, Diary & Food History: Dedicated Quick Glance dashboard + Quick Capture Inbox; Today Upcoming Important Items, unlimited scheduled Custom Daily Note Sections & inline meals/photos; Diary upgraded to 1–10 (and custom) scales across 11 wellness metrics, optional private Bathroom Tracker, custom categories, multi-photo album & trend charts; searchable Food History synced automatically from Today & Meal Planner.',
      'Phase 5 — Rich Notes, Anchored Decor, 6+ Clock Designs & 260+ Stickers: Per-note typography/colors/alignment/paper surfaces and paginated/2-page spread presentation modes; pixel-anchored Decorations with Above/Below text layering + Shape drawing tools (Line/Box/Oval/Pencil); 6 customizable Clock designs (Traditional/Minimal Analog, Digital, Retro LED, Modern Minimal, Decorative, Flip); 50+ new stickers including Laboratory & Science.',
      'Phase 6 — Workspace Customization & Schedule Layouts: Collapsible sidebar groups, Simple/Standard/Advanced creation modes, and Schedule-Based Automatic Workspace Switching with manual override.',
      'Phase 7 — Comprehensive Laboratory Management Workspace (15 Sub-Modules): Overview Dashboard, Samples & TAT, Subcontract Tracking, Lab Inventory, Purchasing & Reorders auto-linked to Lab Budget, Client-Specific Pricing Sheets & Reusable Templates with CSV/Print export, Method Research, Email Drafting, Lab Tasks, Lab Meetings auto-creating Lab Tasks, Calibration & QC with immutable revision preservation, Wet Chemistry vs. NIR Comparison (Bias, SD/SEP, RMSE, Pearson r, OLS slope/intercept, R², Scatter/Residual/Trend SVG charts), Work Hours & Breaks, and QMS/SOP/CAPA/PT/Training.',
      'Phase 8 — Physical-Style Digital Planner: Customizable Front/Back Covers, Spiral/Ring/Book/None binding, dynamic Left/Right Side Navigation Tabs & Top Bookmarks that shift automatically as you turn pages, Zoom, Special Pages (including interactive 50-state US Travel Map, calendars, contacts, goals, habits), Ink/Stickers & optional per-page live data sync.',
      'Phase 9–10 — Advanced Reports, Automatic Summaries & Optimization: Day/Week/Month/Quarter/Year/All/Custom date reports with prior-period comparisons, distracted vs. undistracted analytics, lab KPIs, End-of-Week/Month/Year digests, code-split Vite bundles (`lab`, `digitalPlanner`), and expanded Feature Directory.',
    ],
    bugFixes: [
      'Fixed Decoration shifting bug when sections expand or collapse by introducing fixed pixel canvas anchoring (`fixedPxX`/`fixedPxY`) alongside Relative %, Section, Object, and Text anchoring modes.',
      'Removed mandatory 3-favorite task restriction across both Tasks and Today Spread (now user-configurable: Unlimited, 3, 5, or 10).',
    ],
    performanceAndSync: [
      'Added dedicated Vite code-splitting chunks (`lab`, `digitalPlanner`) so the Laboratory Workspace and Physical Planner load cleanly without bloating initial startup.',
    ],
    mobileAndUx: [
      'Added Quick Glance, Physical Planner, Task Calendar, Laboratory Management, and Reports directly into the mobile navigation drawer and customizable 4-slot phone bottom bar.',
    ],
    storageAndData: [
      '100% additive backward-compatible IndexedDB & SQLite record types (`food_log`, `quick_capture`, `planner_book`, `lab_*`); zero destructive migrations and zero localStorage usage.',
    ],
    knownLimitations: [
      'Planaday’s Laboratory Management Workspace is an operational tracking and management aid and is NOT an accredited or regulatory-validated LIMS (e.g., ISO/IEC 17025 / 21 CFR Part 11).',
      'Observational Diary trends and Wet Chemistry vs. NIR statistical summaries do not establish medical conclusions or formal analytical method validation.',
      'Physical-device validation on Android Gboard/Samsung Keyboard and Doze lock-screen notifications must still be confirmed on your physical handset.',
    ],
  },
  {
    version: '2.1.0',
    date: '2026-11-24',
    title: 'Planaday Rebrand, Phase 1 Reliability & Sync Overhaul, Phase 2 Mobile & Editing Upgrade',
    highlights: [
      'Renamed application branding from Dayplana to Planaday across web, PWA, Android APK, Windows Desktop app, notifications, and exports while preserving 100% of existing IndexedDB, SQLite, Android package ID, and Docker volume data.',
      'Added 4 user-selectable Mobile Layout Modes (Adaptive Mobile, Portrait Only, Portrait & Landscape, and Desktop Pinch-to-Zoom Layout) plus Interface Scaling (80%–130%).',
      'Added live Synchronization & Storage Dashboard showing exact on-device IndexedDB vs. Docker/TrueNAS SQLite & blob paths, queue size, sync latency, and 1-click SQLite backup to TrueNAS.',
      'Added explicit Save button, Ctrl+S shortcut, live Save vs. Sync status badges, named manual Checkpoints, and line-by-line Version Diff viewer in Notes.',
      'Added inline editing for existing Tasks and Chores, Quiet Hours & vibration controls in Notification Settings, and this permanent in-app Changelog & What’s New viewer.',
    ],
    bugFixes: [
      'Fixed Notes cursor jumping to the bottom on mobile by replacing async-controlled textareas with synchronous IME-safe local draft buffering across Notes, Diary, Thought Inbox, and Today Spread.',
      'Fixed mobile autocorrect word duplication (Gboard / Samsung Keyboard) by guarding IME composition sessions (compositionstart/compositionend) and preventing stale Dexie live-query overwrites while typing.',
      'Fixed extended note-writing lag and crashes caused by per-keystroke IndexedDB writes, per-keystroke full-note revision snapshots, unbounded outbox duplication, overlapping sync requests, and stale ObjectURL cleanup closures.',
      'Fixed mobile horizontal overflow and cramped 110px editor columns in Notes, Recipes, and Weather cards by replacing hardcoded 2-column grids with responsive stacked panes and a mobile List ↔ Editor switcher.',
    ],
    performanceAndSync: [
      'Coalesced IndexedDB sync outbox operations by recordId so editing a note 2,000 times generates 1 queued operation instead of 2,000 full-note copies (plus automatic startup compaction for existing queues).',
      'Added strict in-flight sync mutex, 50-op chunked batch uploads, 1.5s debounced post-edit auto-sync, server-side batch deduplication, and keepalive/visibility flush when backgrounding.',
      'Added throttled note revisions (manual save, named checkpoints, blur, or 60s+ snapshots) so typing no longer hammers IndexedDB or overwrites real 25-step version history.',
    ],
    mobileAndUx: [
      'Added 4 selectable mobile layout modes including Desktop Layout with pinch-to-zoom viewport switching.',
      'Made textareas auto-expand cleanly on mobile, prevented keyboard overlap with scroll padding, and ensured full-width comfortable inputs across dialogs and forms.',
      'Separated local save status (Unsaved / Saving locally / Saved locally) from server sync status (Waiting for sync / Synchronizing / Fully synchronized / Sync failed).',
    ],
    storageAndData: [
      'Added GET /api/storage/info and POST /api/storage/backup endpoints plus automated daily SQLite VACUUM INTO backups to /data/blobs/db-backups so SQLite snapshots are preserved directly on TrueNAS alongside blobs.',
      'Verified zero breaking migrations: existing IndexedDB (dayplana-v2), SQLite (dayplana.sqlite), and Android package (com.dayplana.planner) upgrade seamlessly in place.',
    ],
    knownLimitations: [
      'Android lock-screen / closed-app notifications require the installed Planaday Android APK with notification & exact-alarm permissions granted (or Docker ntfy.sh relay); mobile browser PWAs cannot reliably wake a closed browser tab.',
      'Continuous background sync while an app is force-closed is restricted by Android Doze and iOS WebKit; Planaday persists every change locally in IndexedDB, attempts keepalive flush on backgrounding, and automatically resumes syncing upon foreground/network reconnect.',
      'Physical-device testing on Samsung Keyboard / Gboard / iOS Safari must still be validated on your actual handset after installing the new APK.',
    ],
  },
  {
    version: '2.0.0',
    date: '2026-11-23',
    title: 'Edition 2 Foundation — Offline-First Planner, LAN/Tailscale Sync, Alarms, Calendar & Custom Tabs',
    highlights: [
      'Unified offline-first IndexedDB + Blob store with self-hosted Docker SQLite sync server and automatic Primary LAN → Fallback Tailscale failover.',
      'Schedulable Smart Alarms (weekdays + specific dates) with 8 synthesized offline ringtones and custom MP3/WAV upload.',
      'Flow Calendar (Timeline, Month Grid, Agenda List), universal Sort & Filter bars, 120 offline Daily Facts, live Open-Meteo Weather, 88+ Diary/Thought prompts, in-tab settings drawers, and editable Custom Tab widgets.',
    ],
    bugFixes: [
      'Fixed Android cleartext LAN/Tailscale sync permissions and Electron /api/* JSON 404 handling.',
      'Replaced AbortSignal.timeout with universal timeout handling for older WebViews.',
    ],
    performanceAndSync: [
      'Added Connection Tester with latency & record-count diagnostics.',
    ],
    mobileAndUx: [
      'Added categorized mobile navigation drawer, customizable 4-slot bottom nav, and safe-area padding.',
    ],
    storageAndData: [
      'Zero localStorage for user data; full ZIP export/import and 30-day Trash with Undo/Redo.',
    ],
    knownLimitations: [
      'Initial release wrote directly to IndexedDB per keystroke in text editors (resolved in v2.1.0).',
    ],
  },
];
