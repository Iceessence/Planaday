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
    version: '4.2.0',
    date: '2026-11-27',
    title: 'Performance Overhaul, Activity-Aware Offline-First Sync, Unified Daily Notes Archive, Physical Note Scanner/OCR, Integrated PDF Studio & Optional RTX 5050 GPU Service',
    highlights: [
      '§2 Comprehensive Performance Overhaul: Lazy-loaded all 28+ non-initial views in App.tsx & AllInOneView.tsx (drastically cutting cold-start JS parse), added non-destructive Dexie v3 compound indexes & searchIndex table, built an incremental inverted trigram FTS index (`InvertedSearchIndex`) searching 100,000+ records well under 300ms p95, added bounded LRU ObjectURL caching (`blobCache.ts`), added `VirtualList`, optimized `AppContext.tsx` notification polling (60× fewer idle scans), and added SQLite composite indexes + 16 MB page cache PRAGMAs.',
      '§3 True Offline-First + Activity-Aware Intelligent Sync: All local edits save immediately to IndexedDB; routine sync detects active user interaction (`keydown`, `input`, `pointerdown`, `pointermove`, `wheel`, `touchstart`) and defers automatically until ~10s of inactivity (configurable up to a max-postponement cap), yields heavy background blob transfers if the user resumes typing, and supports Smart Inactivity, Manual, Scheduled, Continuous, Completely Offline, Wi-Fi Only, Charging Only, and Selective Workspace Sync modes via a live Settings Sync Dashboard.',
      '§4 Unified Daily Notes Archive (Zero Duplication): Today Spread’s Daily Notes & Margin Scratchpad now saves directly to a canonical `note` record referenced identically by both Today Spread and the new Notes → 📅 Daily Notes Archive tab, featuring month-calendar navigation, daily categories (`daily_specific`, `general_knowledge`, `ideas`, `reminders`, `research`, `uncategorized`), jump-to-daily-planner navigation, 1-click Task/Project/Diary/Permanent-Knowledge conversion, and automatic bidirectional backlinks.',
      '§5 Physical Note Scanning & Handwriting OCR Studio (`DocumentScannerView` + `documentScanner.ts`): Camera capture, multi-page scanning, automatic Sobel document edge detection, true 4-point projective homography warp, integral-image shadow reduction & B&W cleanup, table-to-CSV extraction, hybrid offline `tesseract.js` Web Worker + optional RTX 5050 GPU OCR, `<70%` low-confidence word flags with mandatory manual review confirmation before saving to Laboratory records, and original scan blob preservation.',
      '§6 Optional Self-Hosted NVIDIA RTX 5050 GPU Acceleration (`gpu-service/` + `docker-compose.gpu.yml` + `server/gpuBridge.ts`): Optional Dockge-ready FastAPI CUDA microservice with VRAM caps (`GPU_MEMORY_LIMIT_MB=6144`), persistent `/models` volume, priority job queue with cancellation & OOM recovery, authenticated `/api/gpu/*` routes, Settings privacy opt-in & CPU vs. GPU benchmark UI, and seamless offline on-device fallback.',
      '§7 Integrated PDF Reader, Editor & Secure Redaction Studio (`PdfStudioView` + `pdfEngine.ts`): Offline PDF reading (Single, 2-Page Spread, Continuous Scroll, zoom, bookmarks, reading progress, full-text search), highlights/underlines/strikethroughs/comments/freehand ink/stamps/signatures, AcroForm reading & filling, true structural page rotate/crop/duplicate/add/delete/reorder/merge/split/image-insert (`pdf-lib`), scanned-page OCR indexing into Global Search, and TRUE irreversible secure redaction that replaces redacted pages with rasterized/sanitized output destroying underlying text bytes.',
      '§8 & §9 Size Audit + Android/Windows Store Readiness: Documented exact APK (~4 MB) vs. Windows Electron (~100 MB) size & 45-module completeness audit (`PLANADAY_SIZE_AND_COMPLETENESS_AUDIT.md`), added Android PDF/image `VIEW`/`SEND` intent filters, R8 release shrinking, optional secret-gated AAB workflow, Windows `.pdf`/`.dmtheme` file associations, multi-window support, native Print, and MSIX/NSIS packaging metadata.',
    ],
    bugFixes: [
      'Eliminated 4×/second idle full-record filter scans in `AppContext.tsx` by pre-memoizing alarm/event/chore/medication slices and gating minute-level triggers to once per minute boundary.',
      'Eliminated premature `URL.revokeObjectURL` conflicts in `NotesView.tsx` by managing blob URL lifecycles centrally through the bounded LRU `blobUrlCache`.',
      'Eliminated duplication between Today Spread daily notes and Notes by unifying both views onto one canonical `note` record ID with non-destructive fallback for legacy `diary.dailyNotes`.',
    ],
    performanceAndSync: [
      'Isolated `pdf-lib`, `pdfjs-dist`, `tesseract.js`, `PdfStudioView`, and `DocumentScannerView` into dedicated on-demand lazy chunks so zero bytes are added to initial startup.',
      'Added real 100,000-record search benchmark and local action latency regression suite (`tests/performance-benchmarks.test.ts`).',
    ],
    mobileAndUx: [
      'Added Note Scanner & OCR and PDF Reader & Editor directly into Desktop Sidebar, Mobile Drawer, bottom navigation labels, Notes header, and Universal File Hub.',
      'Added Activity-Aware Sync Policy Dashboard and Self-Hosted GPU Acceleration controls in Settings → 3-Mode Sync.',
    ],
    storageAndData: [
      'Non-destructive additive Dexie v3 schema adding compound record indexes (`[workspaceId+deletedAt]`, `[workspaceId+type+updatedAt]`, `[type+updatedAt]`) and `searchIndex` table while preserving `dayplana-v2`, `/data/dayplana.sqlite`, `dayplana_db`, and `com.dayplana.app`.',
    ],
    knownLimitations: [
      'NVIDIA RTX 5050 CUDA acceleration requires deploying the optional `docker-compose.gpu.yml` overlay on a Docker host with the NVIDIA Container Toolkit; without it, Planaday uses on-device `tesseract.js` OCR and Canvas enhancement automatically.',
      'On-device `tesseract.js` requires initial language model fetch (or browser cache) the first time a language is used; if completely offline with no cached traineddata, Scanner cleanly enters Manual Transcription mode beside the preserved scan image.',
      'Real-device Android APK, Windows `.exe` installer, physical camera capture, and RTX 5050 CUDA hardware benchmarks must be confirmed on the owner’s hardware after deployment.',
    ],
  },
  {
    version: '4.1.0',
    date: '2026-11-24',
    title: 'Comprehensive Integrity, Sync, Security, Mobile Layout, Calculation & Recovery Overhaul',
    highlights: [
      'Atomic Local Writes & Draft Recovery Inbox (PD-001, PD-016, PF-01, PF-55): Serialized per-record mutations inside atomic Dexie read-write transactions, fixed blurless cross-note overwrite by locking buffered editor commits to the originating record key, and added durable `db.drafts` persistence with a 1-click Draft Recovery Inbox banner in Notes.',
      'Bidirectional Verified Attachment Sync & Server Identity Recovery (PD-002, PD-003, CONT-003, CONT-004, PD-015, PF-03, PF-42, PF-51): Fixed Fastify v5 wildcard MIME upload parser (eliminating HTTP 415 on PNG/JPEG/WAV), added server & client SHA-256 verification with atomic temp-file staging, automatic missing attachment downloads on clean devices, honest failure receipts (a failed blob transfer never shows "Synced"), and automatic server identity/epoch reconciliation so ZIP restores push cleanly onto replacement servers.',
      'Server Authentication, Device Pairing & Outbound SSRF Hardening (PD-004, PD-005, PD-014, PF-04): Added optional passphrase-protected owner auth, revocable hashed device tokens, 10-minute pairing codes, workspace-scoped authorization, centralized private/loopback/metadata IP SSRF blocking for ICS/Recipe/Push relays, and migrated Code Studio execution from same-origin Web Worker to a null-origin CSP-locked sandboxed iframe (`sandbox="allow-scripts"`).',
      'Math, Spreadsheet, CSV & Export Fidelity Repairs (PD-006, PD-007, PD-008, PD-018, CONT-006, CONT-007): Upgraded CSV import to a full RFC 4180 parser (quoted commas, escaped quotes, multiline fields), fixed missing-sheet `#REF!` errors, zero-length `LEFT`/`RIGHT`, and composite formulas (`=SUM(A1:A3)+1`), upgraded root-finder to reject poles and detect tangent roots, fixed all 7 swapped studio export downloads via typed `downloadFile()`, and upgraded HTML Presentation export to embed inline base64 images, HTML tables, transforms, opacity, transitions, and speaker notes.',
      'Cross-Engine Startup, Offline Precaching, Mobile Layout & Accessibility (CONT-005, CONT-008, PD-009, PD-010, PD-011, PD-012, PD-013, PD-017, PD-019, PD-020, R-0005, R-0007): Fixed Firefox startup hang by making persistent storage non-blocking with timeout, lowered Vite target to Chrome 74 / ES2019 for Android 10 WebView compatibility, added build-generated `offline-manifest.json` precaching in `sw.js`, eliminated 320px overflow in Files/Projects/Photos/Books/Code/Presentations, added accessible labels & ≥28px targets, fixed synchronous checkbox state & added drag-to-resize on Flow Calendar events, upgraded Electron to v39 with `sandbox: true` & navigation guards, and added automated CI typecheck/test gates.',
    ],
    bugFixes: [
      'PD-001: Fixed concurrent record mutations losing disjoint fields or emitting non-monotonic revisions via per-record lock + atomic Dexie transactions.',
      'PD-016 / CONT-002: Fixed blurless cross-note switch overwriting Note Beta with Note Alpha’s buffered draft.',
      'CONT-003: Fixed HTTP 415 on PNG, JPEG, WebP, WAV, MP3, PDF, and SVG blob uploads on Fastify v5.',
      'PD-002 & CONT-004: Fixed second-device attachment byte sync and prevented `status: "synced"` when blob transfers fail.',
      'PD-003: Fixed replacement-server sync stranding ZIP-restored records/blobs when server `seq` resets.',
      'PD-006, CONT-006, CONT-007: Fixed CSV quoting/newlines, missing-sheet `#REF!`, `LEFT`/`RIGHT` length 0, and composite spreadsheet formulas.',
      'PD-007: Fixed numerical root finder pole false positive (`1/(x-0.123)`) and missed tangent root (`(x-0.123)^2`).',
      'PD-008 & PD-018: Fixed swapped filename/content across 7 studio export buttons and upgraded HTML Presentation fidelity.',
      'CONT-005 & CONT-008: Fixed Android 10 WebView syntax error and Firefox persistent-storage startup hang.',
      'PD-010, PD-011, PD-012, PD-013, PD-019: Improved large-note paste responsiveness, eliminated 320px horizontal overflow, and labeled icon buttons.',
      'R-0005 & R-0007: Fixed synchronous optimistic settings updates for Flow Calendar Adaptive Text toggle and added pointer drag-to-resize on timed calendar events.',
    ],
    performanceAndSync: [
      'Added build-time `offline-manifest.json` precaching in Service Worker so lazy studio chunks load offline on first visit after installation.',
      'Deferred large-note word/paragraph counting and skipped forced textarea `scrollHeight` reflows above 12,000 characters.',
      'Added `serverId`, `syncEpoch`, per-blob transfer receipts, and manifest SHA-256 verification on ZIP and SQLite backups.',
    ],
    mobileAndUx: [
      'Added responsive `.dp-studio-split` and `.dp-studio-split-3` layouts stacking cleanly to 1 column at phone widths down to 320px.',
      'Added Server Security & Device Pairing UI, Release/Platform Readiness diagnostics, and Attachment Transfer Receipts in Settings.',
    ],
    storageAndData: [
      'Non-destructive additive Dexie v2 schema adding `drafts` table (`key, recordId, updatedAt`) while preserving `dayplana-v2`, `/data/dayplana.sqlite`, `dayplana_db`, and `com.dayplana.app`.',
      'Upgraded ZIP backup format to v3 with SHA-256 manifest verification (100% backward-compatible with v2 backups).',
    ],
    knownLimitations: [
      'Server authentication remains opt-in (setup mode) on existing uninitialized deployments until the owner enables a passphrase in Settings → 3-Mode Sync so existing LAN setups do not break on upgrade.',
      'Physical-device testing on Android Gboard/Samsung Keyboard, Android 10 hardware, iOS Safari, and Doze lock-screen notifications requires testing on your physical devices after deploying a new build.',
      'Independent third-party audit re-verification is still pending after these v4.1.0 developer repairs.',
    ],
  },
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
