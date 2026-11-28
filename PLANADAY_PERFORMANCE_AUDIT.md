# PLANADAY — Performance Investigation & Optimization Audit (`PLANADAY_PERFORMANCE_AUDIT.md`)

**Release:** Planaday `4.2.0`  
**Date:** 2026-11-27  
**Baseline Audited Revision:** `4.1.0` (`bd96a55`)  
**Methodology:** Measured before-and-after profiling across production Vite bundles (`dist/`), Node/Vitest 100,000-record search & IndexedDB CRUD benchmarks (`tests/performance-benchmarks.test.ts`), and static/runtime hot-path analysis — with **zero features removed**.

---

## 1. Root Causes Identified Before Optimization (`v4.1.0` Baseline)

Profiling revealed **5 concrete bottlenecks** — none caused by hardware limits or requiring feature removal:

1. **Over-Eager Cold-Boot Bundle Loading (`src/App.tsx`, `src/modules/life/AllInOneView.tsx`, `vite.config.ts`):**
   - `App.tsx` eagerly imported 27 views (Calendar, Tasks, Chores, Notes, Diary, Kitchen, Finance, Settings, AllInOneView, etc.), and object-form Rollup `manualChunks` caused static reverse imports into `plan`, `mindTime`, and `kitchenLife`.
   - **Measured BEFORE (`v4.1.0`):** `1,324,578` bytes raw (`~378.6 KB` gzip) of JS parsed eagerly on cold startup.
2. **Unthrottled 1-Second Full-Record Scans in `AppContext.tsx`:**
   - The notification timer ran `window.setInterval(..., 1000)` unconditionally, executing **4 full `records.filter(...)` passes every single second** (for alarms, events, chores, medications) even with zero running countdown timers and even though alarms/events/chores/meds only trigger on minute (`HH:MM`) boundaries.
3. **Linear O(N) Unindexed Search (`src/core/search.ts`):**
   - `fuzzySearchRecords` serialized/extracted text and ran regex word splits + Damerau-Levenshtein comparisons linearly over every record on every keystroke (`80.9–118.7 ms` on short synthetic 100k docs, scaling linearly with real multi-KB notes and sluggish on mobile CPUs).
4. **Unbounded Blob ObjectURL Creation & Redundant Decodes (`src/core/db.ts`, `NotesView.tsx`):**
   - `getBlobObjectUrl()` created a brand-new `URL.createObjectURL()` on every read without LRU reuse or bounding, risking memory growth across long photo/note/PDF sessions.
5. **Missing Compound Database Indexes (`src/core/db.ts`, `server/db.ts`):**
   - IndexedDB lacked `[workspaceId+deletedAt]`, `[workspaceId+type+updatedAt]`, and `[type+updatedAt]` compound indexes and a dedicated FTS token store; SQLite lacked `(workspace_id, type, deleted_at)`, `(type, deleted_at)`, and `(updated_at)` indexes and explicit `temp_store=MEMORY` / 16 MB `cache_size` PRAGMAs.
6. **Aggressive Sync During Active User Typing (`src/core/sync.ts`):**
   - Post-edit sync fired `1.5s` after edits even while the user was actively typing or navigating, competing with UI interaction and uploading blobs mid-session.

---

## 2. Optimizations Implemented (`v4.2.0`)

1. **Function-Based Code Splitting & Full Lazy Routing (`src/App.tsx`, `src/modules/life/AllInOneView.tsx`, `vite.config.ts`):**
   - Converted all 28+ non-initial views in `App.tsx` and `AllInOneView.tsx` to `React.lazy` + `<Suspense>`.
   - Replaced Rollup object chunks with function-based `manualChunks(id)` assigning shared runtime (`src/core/`, shell, common dialogs, `TodaySpread.tsx`) to `appCore` and isolating `pdfEngine` (`pdf-lib` + `pdfjs-dist`), `ocrEngine` (`tesseract.js`), `pdfStudio`, `scannerStudio`, `settings`, `calendarPlan`, `mindTime`, `kitchenLife`, `lab`, `mathOffice`, `digitalPlanner`, `creativeStudios`, `visualCodeMedia`, and `archive` so **ZERO** lazy views preload on startup!
2. **Pre-Memoized Notification Slices & Minute-Boundary Gating (`src/core/AppContext.tsx`):**
   - Pre-memoized `activeAlarms`, `activeEvents`, `activeChores`, and `activeMeds` once per `records` mutation.
   - Reduced polling interval from `1s` to `5s` whenever no countdown timer is running, and gated minute-level checks behind `lastMinuteCheckedRef` (**~60× reduction** in idle scans!).
3. **Incremental Inverted Trigram FTS Index (`src/core/searchIndex.ts`, `src/core/search.ts`):**
   - Built `InvertedSearchIndex` with exact token postings (`Map<string, Set<number>>`), 2-char prefix buckets, 3-char trigram vocabulary buckets for fast 1-edit typo resolution, smallest-posting-first intersection, and O(1) revision-checked incremental `upsert`/`remove` updates.
4. **Bounded LRU Blob ObjectURL Cache (`src/core/blobCache.ts`, `src/core/db.ts`):**
   - Added `BoundedBlobUrlCache` (max 64 entries) with automatic `URL.revokeObjectURL()` eviction and GC invalidation.
5. **Virtualized Scroll List (`src/components/Common/VirtualList.tsx`):**
   - Added zero-dependency virtualized viewport list ready for 10,000+ record views.
6. **Non-Destructive Dexie v3 & SQLite PRAGMA/Index Tuning (`src/core/db.ts`, `server/db.ts`):**
   - Added Dexie v3 compound indexes + `searchIndex` table; added 3 composite SQLite indexes + `PRAGMA temp_store = MEMORY`, `PRAGMA cache_size = -16000`, `PRAGMA busy_timeout = 5000`.
7. **Activity-Aware Offline-First Sync (`src/core/sync.ts`):**
   - Default `smart` sync mode waits ~10s of user inactivity before syncing (capped at `maxDelaySec = 120s`) and pauses/yields multi-blob transfers if the user resumes interaction.

---

## 3. Real Measured Before vs. After Benchmarks

| Metric | BEFORE (`v4.1.0`) | AFTER (`v4.2.0`) | Target (§10) | Status |
|---|---|---|---|---|
| **Cold-Boot Eager JS (raw)** | `1,324,578` B (`1.32 MB`) | **`806,056` B (`806.1 KB`)** | Minimize startup parse | **−39.1% raw (−518.5 KB)** |
| **Cold-Boot Eager JS (gzip)** | `~378.6 KB` | **`249.8 KB`** | Minimize startup parse | **−34.0% gzip** |
| **Lazy Views Preloaded on Boot** | `4` heavy chunks (`plan`, `mindTime`, `kitchenLife`, `settings`) | **`0` lazy chunks** (`index` + `vendor` + `appCore` only) | Zero lazy preload | **PASS** |
| **Startup Cost of New PDF & OCR Engines** | N/A | **`0` bytes** (`pdfEngine`, `pdf.worker`, `ocrEngine` strictly lazy) | Zero boot penalty | **PASS** |
| **100,000-Record Search p50** | `~80–118 ms` (linear O(N)) | **`2.01 ms`** (`InvertedSearchIndex`) | < 300 ms | **PASS (~45× faster)** |
| **100,000-Record Search p95 (20 queries incl. typo + prefix + filter)** | `~118.7 ms` (short text) / scales O(N·L) | **`14.32 ms`** (max `14.32 ms`, vocab `100,110`) | **< 300 ms p95** | **PASS (21× below target)** |
| **100,000-Record Incremental Upsert** | Full rescan | **`0.19 ms`** | < 25 ms | **PASS** |
| **100 Local IndexedDB CRUD Actions** | Unbenchmarked | **`0.62 ms` p50 / `1.43 ms` p95** | **95% < 100 ms** | **PASS (70× below target)** |
| **200 Rapid Note Edits Coalescing** | `149.6 ms` → 1 outbox op | **`170.5 ms` → 1 outbox op** | Coalesce to 1 op | **PASS** |
| **2,000-Op Legacy Backlog Compaction + SQLite Sync** | `49.6 ms` + `23.5 ms` | **`55.6 ms` + `24.1 ms`** | Non-blocking | **PASS** |
| **Idle Notification Loop Scans/Min (0 active timers)** | `240` full array filters / min | **`4` pre-memoized checks / min** | Eliminate idle churn | **~60× reduction** |
| **Chrome 74 / Android 10 Syntax Scan** | `0` `?.`/`??` | **`0` `?.`/`??`** across all built app chunks | Android 10 WebView safe | **PASS** |

---

## 4. Pending Hardware / Live Browser Benchmarks (Honest Status)
- Real-device Android mid-range phone cold-start timing, 60fps scrolling FPS profiling, multi-hour memory stability soak, and live NVIDIA RTX 5050 CUDA vs. CPU OCR benchmark timings require execution on physical devices / GPU Docker host and are explicitly marked **Pending physical hardware verification**.
