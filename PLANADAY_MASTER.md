# PLANADAY — Master Product Specification (`PLANADAY_MASTER.md`)

**Authoritative Version:** `4.1.0-dev` (baseline audited at `4.0.0`, commit `d82bdc73742e8982732b5e73d3c44d63e805d842`)
**Application Name:** Planaday (formerly Dayplana; internal storage IDs `dayplana-v2`, `dayplana_db`, `/data/dayplana.sqlite`, and Android package ID preserved for backward compatibility and zero data loss)
**Historical Audit Archive:** Preserved immutably in `docs/audits/planaday-independent-review/` and `docs/audits/planaday-independent-review-continuation/`.

---

## 1. Product Vision & Architectural Principles

Planaday is an offline-first, self-hostable, deeply customizable all-in-one personal and professional life operating system, planner, digital notebook, laboratory operations suite, office/math studio, visual whiteboard, and creative workspace.

### Core Invariants
1. **Zero Data Loss & Preservation First:** Every edit must be durably stored locally in IndexedDB (`dayplana-v2`) with atomic concurrent updates, record-bound draft sessions, revision history, 30-day Trash retention, and verifiable complete backups (database + SHA-256 blobs). Never use `localStorage` for user data.
2. **One Connected Application:** Records share a unified typed graph (`LifeRecord` + `EntityLink`) across Calendar, Tasks, Chores, Notes, Today, Lab, Projects, Kanban, Whiteboards, Spreadsheets, Presentations, Photos, Game Dev, and Book Studio — avoiding disconnected duplicates.
3. **Offline-First with Verified Sync:** All core features operate without network access. Self-hosted Docker/SQLite sync (`server/`) provides authenticated, epoch-aware bidirectional record and attachment synchronization with explicit receipts and zero false-healthy states.
4. **Honest Security & Platform Boundaries:** Sensitive server routes enforce owner authentication and device pairing; untrusted user code runs only inside an isolated null-origin sandbox or clearly labeled trusted mode; outbound integrations enforce an explicit egress policy; non-accredited Lab tools never claim ISO/IEC 17025 or 21 CFR Part 11 LIMS validation.
5. **Simple by Default, Unlimited in Depth:** Users select between minimal and power-user density, mobile layout modes, themes, custom tabs, workspace schedules, and custom record types.

---

## 2. Consolidated Owner Requirements

### 2.1 Daily Planning, Dashboards & Navigation
- **Today Spread & Home Dashboard:** Customizable sections (Upcoming events, Free Time Finder, Top Priorities, Tasks, Chores, Habits, Goals, Daily Notes + scheduled Custom Daily Note Sections, Mood/Water/Sleep tracker, Meals, Photos, Active Timers, Weather, Daily Facts, Family Notices).
- **Quick Glance & Quick Capture Inbox:** Lightweight fast-launch dashboard and triageable capture inbox.
- **All-in-One Scroll & Custom Tabs:** Continuous scrollable view + user-created custom tabs with configurable widgets.
- **Navigation Customization:** Collapsible sidebar groups, hidden/restorable tabs, Simple/Standard/Advanced creation modes, schedule-based automatic workspace switching with manual override, and customizable 4-slot mobile bottom bar.

### 2.2 Advanced Calendar & Intelligent Task Scheduling
- **Flow Calendar:** Zoom from 1 minute through 4 hours (1m, 2m, 5m, 10m, 15m, 20m, 30m, 45m, 1h, 2h, 3h, 4h + custom intervals), major/minor horizontal gridlines, adaptive text scaling, drag-and-drop & resizing, multi-calendar layers, 7 overlap policies (including optional overlap prevention), recurring/all-day/multi-day events, timezones/DST, ICS import/export, and optional calendar Ink/Stickers.
- **Tasks, Chores & Intelligent Task Calendar:** Separate Do Date vs. Hard Due Date, drag-and-drop ordering, unlimited configurable Favorites, automatic incomplete carryover preserving creation date/age/reschedule count, live Start/Pause timer, distracted vs. undistracted duration tracking, learned task-type averages, Preferred Daily End Time, scheduling Contexts (Work/Home/Lab/Relationship/custom), and completion-based chore recurrence with Room Health & Punctuality %.

### 2.3 Mind, Notes, Diary & Time Suite
- **Unlimited Hierarchical Notes & Knowledge Graph:** Recursive parent/child notebooks, sections, subsections, and sub-notes with cycle-safe reparenting, breadcrumbs, subtree duplication, `[[WikiLinks]]` & Backlinks, rich text/typography/paper surfaces, pagination & 2-page spread modes, cursor-preserving IME editing, Draft Recovery Inbox, version history with line diffs, attachments, voice memos, and sketches.
- **Thought Inbox, Diary & Life Events:** Triageable Thought Inbox; Diary with 1–10 and custom rating scales across wellness metrics, optional private bathroom counters, photos, custom categories & trend views; Life Events & Countdowns.
- **Time Suite & Notifications:** 6+ Clock styles, World Clock, schedulable Smart Alarms with ringtones & volume/chime controls, Timers/Pomodoro/Interval presets, Stopwatch & Time Ledger, and reliable OS/native notification scheduling with quiet hours, snooze, and permission diagnostics.

### 2.4 Physical-Style Digital Planner
- Book/notebook interface with customizable Front/Back Covers, Spiral/Ring/Book/None binding, single-page & 2-page spreads, dynamic Left/Right Side Navigation Tabs & Top Bookmarks that shift across pages as spreads turn, custom page layouts/lines/special pages (including interactive 50-state US Map), pixel-anchored Decorations/Stickers (260+ built-in + custom) with Above/Below text layering, Ink/Shape drawing tools, and optional live data binding.

### 2.5 Kitchen, Health, Household & Personal Life-OS
- **Kitchen OS:** Recipes + clipper, Lot-based Pantry inventory, Meal Planner, unified searchable Food History (Today + Meal Planner), and aisle-sorted Groceries.
- **Life-OS Modules:** Goals, Habits & Routines, Household Fairness & Family Profiles with per-item sharing, People & Gifts, Health & Medications (schedules, skip tracking, refill-by-date), Personal Finance/Bills/Warranties, Spaced Review/Learning, Media & Hobbies, Travel/Packing/Hosting, Home Assets/Vehicles/Pets/Plants/Storage Bins, Reports & Digests.

### 2.6 Comprehensive Laboratory Management (Professional Operations Workspace)
- 15 integrated sub-modules: Overview Dashboard, Samples & TAT/Custody, Subcontract Lab Tracking, Lab Inventory, Purchasing & Reorders linked to Lab Budget, Client-Specific Pricing Sheets & Reusable Templates, Method Research, Email Drafting, Lab Tasks, Lab Meetings auto-creating Lab Tasks, Calibration & QC (immutable revision preservation), **Wet Chemistry vs. NIR Comparison** (Bias, SD/SEP, RMSE, Pearson *r*, OLS slope/intercept, R², Scatter/Residual/Trend charts, outlier exclusion, mixed-unit warnings), Work Hours & Breaks, and QMS/SOP/CAPA/PT/Training.
- **Scope Boundary:** Operational lab management aid — NOT an accredited or regulatory-validated LIMS.

### 2.7 Mathematics, Office, Visual, Creative & Programming Studios
- **Mathematical & Analytical Workspace (§26):** Standard, Scientific, Lab Analytical (`C₁V₁=C₂V₂`, `%` recovery, `%RSD`), 2D & 3D Graphing Calculator (with continuity-validated root finding & tangent root detection), Currency Converter (live/cached/manual with timestamp & source), and 23-category Universal Unit Converter.
- **Integrated Spreadsheets (§27):** Multi-workbook, multi-sheet formula engine with cross-sheet refs (`#REF!` on missing sheet), composite formulas, named ranges, circular-ref detection, RFC 4180 CSV/TSV interchange, Excel SpreadsheetML `.xls`, templates, Live Planaday Data Pulls, SVG charts, and version snapshots.
- **Presentation Creator (§28):** Multi-slide designer, themes, aspect ratios, drag-and-drop elements, speaker notes, full-screen Presenter View with timer, and fidelity-preserving HTML/PDF export.
- **Projects & Custom Record Type Builder (§30, §38.2):** Nested projects, templates, cross-module links, and declarative Custom Record Schemas (Table/List/Gallery views).
- **Game Development Workspace (§31):** Multi-game GDD, systems, characters/enemies/bosses, visual Skill Trees, items/loot, worlds/lore, logic snippets, XP curve balancing, and dev progress.
- **Book Writing & Story Studio (§32):** Series/Books/Chapters, distraction-free manuscript editor, character appearance tracking, arcs/worldbuilding, read-only Story Continuity Checker, and Markdown/HTML-DOC/PDF export.
- **Universal Kanban Boards (§33):** Live shared Tasks & Chores board (zero duplication) + unlimited custom boards with optional WIP limits, checklists, comments, and Board/List/Table views.
- **Infinite Whiteboard (§34):** Pan/zoom canvas, snap grid, minimap, bookmarks, drawing tools, sticky notes/frames/cards, live-attached diagram connectors, and SVG/PDF export.
- **Code Editor & Sandboxed Testing Studio (§35):** Multi-file projects, snippet library, isolated null-origin sandbox execution for JS/TS/HTML with bounded timeout, unit test runner, and external-toolchain syntax editing for compiled languages.
- **Camera, Photo Library & Non-Destructive Editor (§36):** Capture/import/paste/drop, deduplicated SHA-256 library, albums, non-destructive Canvas editing preserving originals, and cross-module attachment reuse.
- **Universal Document & File Hub (§37):** Nested folders, favorites, archive, Personal vs. Professional Lab separation, and Global Fuzzy Search.

### 2.8 Mobile, Desktop, Storage, Sync & Deployment Requirements
- **Mobile Excellence:** Zero horizontal overflow down to 320px viewports, 4 selectable phone layout modes, UI scaling (80–130%), keyboard-safe forms, accessible touch targets, and Android/WebView compatibility.
- **Multi-Platform Delivery:** Consistent single-source release metadata across Web/PWA (with build-versioned offline asset precaching), self-hosted Docker/Node server (SQLite WAL + staged SHA-256 blobs + authenticated pairing + outbound egress policy), Android Capacitor APK, and supported Electron Windows Desktop package.
