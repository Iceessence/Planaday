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
    version: '4.0.0',
    date: '2026-11-24',
    title: 'Productivity, Mathematics, Creative Studios, Visual Workspace & Universal File Hub (Sections 26–39)',
    highlights: [
      '§26 Mathematical & Analytical Workspace: Standard calculator with fractions/memory/history/saved calculations, Scientific & Analytical Lab Mode (trig/hyperbolic/log/factorial/nPr/nCr, constants, custom variables & user functions, complex numbers, 2×2 & 3×3 matrix determinants, C₁V₁=C₂V₂ dilutions, % spike recovery, replicate %RSD), 2D & 3D Surface Graphing Calculator (simultaneous equations, parametric, polar, shaded inequalities, scatter + linear regression R², numerical derivatives, Simpson integration, roots, interactive sliders, rotated 3D wireframe), Currency Converter (live ECB/Frankfurter refresh with Live vs. Cached vs. Manual indicator + FX fee), and 23-category Universal Unit Converter + custom factor.',
      '§27 Integrated Spreadsheets: Multi-workbook, multi-sheet formula engine supporting cross-sheet refs (`Sheet2!A1`), named ranges, circular-reference `#CIRC!` detection, 25+ Excel formulas (`SUM`, `AVERAGE`, `COUNTIF`, `SUMIF`, `IF`, `AND`, `OR`, `XLOOKUP`, `MEDIAN`, `STDEV`, `PMT`, `NPV`, text & math), 6 built-in templates, Live Planaday Data Pull (Tasks, Lab Inventory, Diary, Game Entities), interactive SVG Charts (Column, Bar, Line, Area, Scatter, Pie), CSV/TSV import & export, Excel-compatible SpreadsheetML `.xls` export, and named version snapshots.',
      '§28 Presentation Creator: Unlimited presentations, custom themes & aspect ratios, drag-and-drop slide canvas (Text, Shapes, Tables, Equations, Code, Stickers, Blob Images, Planaday Note excerpts), slide transitions, speaker notes, full-screen Audience & Presenter View with live presentation timer, HTML slideshow & Print/PDF export.',
      '§29 Unlimited Hierarchical Notes: Upgraded NotesView with unlimited recursive nested sub-notes (`parentId`), expandable tree sidebar, clickable breadcrumb trails, cycle-safe reparenting, full subtree duplication, favorites & archive toggles while preserving cursor-safe IME editing.',
      '§30 & §38.2 Creative Projects & Custom Record Type Builder: Unlimited projects & subprojects with 8 templates, milestones & cross-module links, plus a user-defined Custom Record Schema Builder (text/number/dropdown/checkbox/rating/date/formula fields) with Table, List, and Gallery views.',
      '§31 Game Development Workspace: Multi-game versioning, GDD & Core Loops, Systems, Characters/Enemies/Bosses/Factions, interactive SVG Skill Trees with prerequisites, Items/Loot, Worlds/Lore, Game Logic, XP Progression & Stat Balancer with SVG curve, and Dev Progress tracker.',
      '§32 Book Writing & Story Studio: Series & Book organizer, reorderable Chapters, distraction-free IME-safe Manuscript Editor with word targets, Character DB with automatic chapter-appearance counts, Plot Arcs/Foreshadowing, Worldbuilding, read-only Story Continuity Checker (flags post-death character appearances, missing POVs & unresolved threads without silently altering text), and Markdown/Word `.doc`/Print-PDF export.',
      '§33 Universal Kanban Boards: Live Planaday Tasks & Chores sync board (moves real tasks in place with zero duplication!) plus unlimited custom boards with drag-and-drop, customizable collapsible columns, optional toggleable WIP limits, subtasks, comments & Board/List/Table views.',
      '§34 Infinite Whiteboard & Visual Workspace: Pan & zoom infinite canvas (`25%–300%`), snap grid, minimap, bookmarked canvas regions, freehand Pen/Highlighter/Marker/Eraser, Sticky Notes/Frames/Equations/Code/Stickers/Live Planaday Record cards, live-attached Diagram Connector Arrows, and SVG/Print-PDF export.',
      '§35 Sandboxed Code & Testing Studio: Multi-file projects, snippet library, line-number editor with Find/Replace & themes, strict client-side isolated Web Worker sandbox for JS/TS (shadowed network/storage globals, 2,000ms infinite-loop timeout), sandboxed HTML/CSS live preview (`sandbox=""`), automated Unit Test Runner (`solve(input)`), and syntax editing for external-toolchain languages (Python, C/C++, C#, Rust, Go, Java, SQL, Lua, Verse).',
      '§36 Camera, Photo Library & Non-Destructive Photo Editor: Camera capture, multi-photo import, drag/drop & clipboard paste, deduplicated SHA-256 blob storage, Albums/Favorites/Captions, non-destructive Canvas Editor (brightness/contrast/saturation/blur/filters/crop/rotate/flip/text/stickers + Before/After preview) that always saves edited copies while preserving originals intact.',
      '§37 Universal Document & File Hub + Expanded Global Search: Unified nested folder manager across all Planaday documents with Personal vs. Professional Lab separation and expanded Global Search routing to all new studios.',
    ],
    bugFixes: [
      'Protected all recursive note reparenting against parent-child cycles via descendant traversal guards.',
      'Enforced zero `eval` in mathematical & spreadsheet formula engines (pure recursive-descent parser) and strict Web Worker sandbox termination for user code.',
    ],
    performanceAndSync: [
      'Converted all heavy creative, math, office, visual, code, laboratory, physical planner, and reports modules to `React.lazy` + `<Suspense>` on-demand code-split chunks (`mathOffice`, `creativeStudios`, `visualCodeMedia`, `lab`, `digitalPlanner`).',
    ],
    mobileAndUx: [
      'Added a dedicated "Create & Math" group across Desktop Sidebar and Mobile Navigation Drawer, plus quick bottom-bar support for Calculator, Sheets, Kanban, Whiteboard, Photos & Files.',
    ],
    storageAndData: [
      '100% additive IndexedDB & SQLite record types (`calc_saved`, `spreadsheet`, `presentation`, `project`, `custom_schema`, `custom_entity`, `game_project`, `game_entity`, `book_project`, `book_chapter`, `book_entity`, `kanban_board`, `kanban_card`, `whiteboard`, `code_project`, `code_snippet`, `photo_asset`, `file_folder`) with zero destructive migrations and zero `localStorage`.',
    ],
    knownLimitations: [
      'Code Studio executes JavaScript and lightly stripped TypeScript inside a browser Web Worker sandbox and renders HTML/CSS inside a restricted `sandbox=""` iframe. Compiled/native languages (C, C++, C#, Python, Rust, Go, Java, SQL, Lua, Verse) are syntax-edited and downloadable for local compilers — Planaday never executes untrusted server-side code.',
      'Spreadsheet `.xls` export uses Excel-compatible SpreadsheetML 2003 XML (plus standard CSV/TSV), and Presentation exports standalone HTML slideshows & printable PDF rather than binary `.xlsx`/`.pptx` OOXML archives.',
      'Currency Converter refreshes live rates via `api.frankfurter.app` when online and transparently falls back to its built-in reference rate table or manual override when offline.',
      'Physical-device testing of camera capture, mobile soft-keyboard IME editing, and Doze lock-screen notifications must still be confirmed on your physical phone.',
    ],
  },
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
