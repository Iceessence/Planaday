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
