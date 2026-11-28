# PLANADAY — Performance Investigation & Optimization Audit (`PLANADAY_PERFORMANCE_AUDIT.md`)

**Release:** Planaday `4.2.0` (Post-108-File Integration & Deep Optimization Pass)  
**Date:** 2026-11-28  
**Integration Branch:** `integrate/final-upgrade-package` (branched from `f3f57d3e44f784b28636d861fd8cb1f8e121f68a`; prior baseline `v4.1.0` `bd96a55`)  
**Methodology:** Reproducible before-and-after measurements across production Vite builds (`dist/`), isolated microbenchmarks (1k/10k/50k search, 4,200-cell 2-sheet spreadsheet recalc, 300-task scheduler), Vitest 100,000-record search & IndexedDB CRUD benchmarks (`tests/performance-benchmarks.test.ts`), and React DOM subscription isolation tests (`tests/integration-optimization-v42.test.tsx`) — with **zero features removed**.

---

## 1. Bottlenecks Identified & Resolved

1. **Cold-Boot Chunk Bloat (`src/App.tsx`, `vite.config.ts`):**
   - *Before `v4.1.0`:* `1,324,578` B raw (`~378.6 KB` gz) eager JS.
   - *Before 108-File Integration (`f3f57d3`):* `806,056` B raw (`249.8 KB` gz), with `TodaySpread.tsx`, `DecorCanvas.tsx`, `stickers.ts` (269 stickers), and non-boot shared helpers bundled into `appCore` (`468.4 KB`, climbing to `512.5 KB` immediately after integrating the 108 files and triggering Rollup's `>500 kB` warning).
   - *Fix:* Lazy-loaded `TodaySpread` (Batch 6) and `DecorCanvasOverlay` (`src/App.tsx`), traced the exact 30-file static boot graph from `src/main.tsx`, and tightened `vite.config.ts` `manualChunks(id)` to place ONLY exact boot files in `appCore` (`284.5 KB`), isolating `todaySpread`, `decor`, and `studioShared` with **0 circular chunks**.
2. **`AppContext` Global Re-Render Fan-Out (`src/core/AppContext.tsx`, Shell & Views):**
   - *Before:* Every `markUserActivity()` / sync status change / toast update mutated the monolithic `AppContext` object and re-rendered every consumer in the tree; native alarm/event scheduling effects re-ran on `[records, ...]` even when editing unrelated notes.
   - *Fix:* Split `AppProvider` into `<ToastProvider>` (`ToastsListContext` + stable `ToastActionsContext`, `useToasts()`) → `<SyncStateProvider>` (`SyncStateContext`, `useSyncState()`) → memoized `<AppCoreProvider>`, added `useStableRecordSlice` for `activeAlarms`, `activeEvents`, `activeChores`, `activeMeds`, `trashedRecords`, and `runningTimers`, scoped native scheduling effects to domain slices, and wrapped `TopBar`, `Sidebar`, `MiniBar`, and `ToastStack` in `React.memo`.
   - *Verified:* 5 consecutive `markUserActivity` + `pushToast` updates cause **0 extra renders** on `useApp()` consumers (`tests/integration-optimization-v42.test.tsx`).
3. **Full-Workbook Recalculation on Every Spreadsheet Keystroke (`src/core/spreadsheetEngine.ts`, `SpreadsheetView.tsx`):**
   - *Before:* Editing a single cell re-evaluated every formula across all sheets (`p95 = 22.23 ms` on a 4,200-cell 2-sheet workbook).
   - *Fix:* Added stateful `IncrementalWorkbookEvaluator` maintaining per-cell forward/reverse dependency sets plus volatile (`TODAY()`) cell tracking, diffing modified cells, invalidating only transitive dependents, and falling back cleanly on structural/sheet/named-range changes.
4. **Search Tombstone Memory Retention & Off-Page Allocation (`src/core/searchIndex.ts`):**
   - *Before:* Array-backed `docs` retained deleted entries forever (`1,000 → 1,000` after 500 deletes; `50,000 → 50,000`), allocated `SearchHit` objects and `corpus.slice()` snippets for every matching doc before slicing the page, and called `localeCompare` on ISO timestamps.
   - *Fix:* Integrated Final Pass Map-backed `docs` deletion release (0 retained tombstones) and eliminated off-page hit/snippet allocations + replaced `localeCompare` with direct lexicographical `<`/`>` comparison.
5. **PDF.js Worker Thrashing & Cleanup Leak (`src/modules/studio/PdfStudioView.tsx`, `src/core/pdfEngine.ts`):**
   - *Before:* Every page flip or zoom change destroyed and re-instantiated a PDF.js document/worker; `extractPdfTextByPage` could leak `loadingTask` on throw.
   - *Fix:* Split `PdfStudioView` into a persistent document/worker loader keyed on `[activeDoc?.id, activeHash]` and a bounded page-window renderer reusing `loadedPdf.pdf` with `cancelRender?.()` cleanup; wrapped `extractPdfTextByPage` in `try/finally` with `loadingTask.destroy()` + `page.cleanup()`.
6. **Service Worker Cache Eviction Timing (`public/sw.js`):**
   - *Fix:* Moved stale cache deletion from `install` to `activate` and switched navigation/`index.html` to Network-First (with offline fallback) while keeping content-hashed `/assets/*` Cache-First.
7. **Idle Notification Polling, Blob URL Coalescing & Database Indexing (`AppContext.tsx`, `blobCache.ts`, `db.ts`, `server/db.ts`, `sync.ts`):**
   - Preserved & strengthened ~60× idle notification scan reduction, concurrent-coalescing generation-guarded LRU `BoundedBlobUrlCache`, Dexie v3 compound indexes, SQLite composite indexes + 16 MB page cache PRAGMAs, and activity-aware `smart` sync deferral.

---

## 2. Exact Measured Before vs. After Benchmarks

### A. Production Cold-Boot Bundle (`dist/`)

| Metric | `v4.1.0` (`bd96a55`) | BEFORE 108-File (`f3f57d3`) | AFTER Optimization (`4.2.0`) | Delta vs. `f3f57d3` | Delta vs. `v4.1.0` |
|---|---:|---:|---:|---:|---:|
| **Cold-Boot Eager JS (raw)** | `1,324,578 B` (`1.32 MB`) | `806,056 B` (`806.1 KB`) | **`624,165 B` (`624.2 KB`)** | **−22.6% (−181.9 KB)** | **−52.9% (−700.4 KB)** |
| **Cold-Boot Eager JS (gzip, L9)** | `~378.6 KB` | `249,780 B` (`249.8 KB`) | **`187,842 B` (`187.8 KB`)** | **−24.8% (−61.9 KB)** | **−50.4%** |
| **`appCore` Chunk (raw / gz)** | N/A | `468.4 KB / 144.1 KB` | **`284.5 KB / 81.7 KB`** | **−39.3% raw (no >500 kB warning)** | — |
| **Circular Rollup Chunks** | `>0` (reverse imports) | `0` | **`0`** | Clean | Eliminated |
| **Lazy Views Preloaded on Boot** | `4` heavy chunks | `0` | **`0`** | Clean | Eliminated |
| **Total `dist/` Files / Raw / Gz** | `19` / `~1.8 MB` | `26` / `4.16 MB` / `1.28 MB` | **`29` / `4.26 MB` / `1.31 MB`** | +3 split chunks (`todaySpread`, `decor`, `studioShared`) | Offline PDF+OCR added lazily |

### B. Microbenchmarks (Exact Saved Runs: `before_microbench.json` vs. `after_microbench.json`)

| Benchmark | BEFORE (`f3f57d3`) | AFTER (Integrated + Optimized) | Delta / Notes |
|---|---:|---:|---|
| **Search 1k docs (`p50` / `p95`)** | `0.138 ms` / `6.337 ms` | **`0.074 ms` / `0.572 ms`** | **−46.4% p50 / −91.0% p95** |
| **Search 1k empty query** | `0.187 ms` | **`0.041 ms`** | **−78.1%** |
| **Search 1k retained docs after 500 deletes** | `1,000` (500 tombstones) | **`500` (0 tombstones)** | **100% tombstone release** |
| **Search 10k docs (`p50` / `p95`)** | `0.709 ms` / `2.654 ms` | **`0.582 ms` / `0.789 ms`** | **−17.9% p50 / −70.3% p95** |
| **Search 10k empty query** | `1.114 ms` | **`0.783 ms`** | **−29.7%** |
| **Search 10k retained docs after 500 deletes** | `10,000` (500 tombstones) | **`9,500` (0 tombstones)** | **100% tombstone release** |
| **Search 50k docs (`p50` / `p95`)** | `2.513 ms` / `6.763 ms` | **`3.877 ms` / `8.087 ms`** | Map-backed zero-tombstone tradeoff (still **37× below 300ms target**) |
| **Search 50k retained docs after 500 deletes** | `50,000` (500 tombstones) | **`49,500` (0 tombstones)** | **100% tombstone release** |
| **Spreadsheet 4,200-cell 2-sheet single-cell edit (`p50` / `p95`)** | `7.90 ms` / `22.23 ms` (full recalc) | **`4.18 ms` / `6.02 ms`** (incremental, 203 downstream cells) | **−47.1% p50 / −72.9% p95** (full fallback: `9.02 / 26.18 ms`) |
| **Task Scheduler 300 tasks (`p50` / `p95`)** | `0.34 ms` / `0.72 ms` | **`0.12 ms` / `0.53 ms`** | **−64.7% p50 / −26.4% p95** |

### C. Automated Vitest Benchmarks (Final Verification Run)

| Benchmark | Measured Result | Target | Status |
|---|---|---|---|
| **100,000-Record `InvertedSearchIndex` (20 queries: exact, prefix, typo, filter)** | `build=674.5 ms` · **`p50=2.38 ms`** · **`p95=15.50 ms`** · `incUpsert=0.17 ms` | `< 300 ms p95` | **PASS (19× below target)** |
| **100 Local IndexedDB CRUD Actions** | **`p50=0.93 ms`** · **`p95=1.72 ms`** | `95% < 100 ms` | **PASS (58× below target)** |
| **200 Rapid Note Edits Coalescing** | **`182.8 ms`** → `1` outbox op | Coalesce to 1 op | **PASS** |
| **2,000-Op Legacy Backlog Compaction + SQLite Sync** | Compacted in **`58.8 ms`**, synced in **`30.1 ms`**, SQLite backup `81,920 B` | Non-blocking | **PASS** |
| **AppContext Render Isolation (`5× activity + 5× toast`)** | **`0` extra `useApp()` renders** | `0` spurious fan-out | **PASS** |

---

## 3. Pending Hardware / Live Browser Benchmarks (Honest Status)
- Real-device Android mid-range phone cold-start timing, live Chromium/Firefox/WebKit 60fps scroll & 320px viewport profiling, multi-hour memory stability soak, packaged Windows Electron `.exe` startup, and live NVIDIA RTX 5050 / RTX 5080 CUDA 12.8 container inference benchmarks were **not executed in this environment** (Docker Desktop engine stopped; no physical mobile handset attached) and remain **Pending hardware/staging verification**.
