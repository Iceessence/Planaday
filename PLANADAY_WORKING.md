# PLANADAY — Active Working Ledger (`PLANADAY_WORKING.md`)

**Last Updated:** 2026-11-28
**Base Audited Revision:** `d82bdc73742e8982732b5e73d3c44d63e805d842` (`4.0.0`) → `bd96a55` (`4.1.0`) → `f3f57d3` (`4.2.0` pre-integration)
**Current Active Branch:** `integrate/final-upgrade-package` (recoverable backup tag `backup/pre-final-upgrade-f3f57d3` + git bundle)
**Current Completed Checkpoint:** Planaday `4.2.0` Post-108-File Integration, Optimization & Security Hardening Pass — **`108/108` files integrated** (`90` byte-exact, `18` merged/refined, `0` skipped), **`219/219` validation runner checks PASS**, **`15/15` Vitest files / `191/191` tests PASS**, cold-boot eager JS **`624.2 KB` raw / `187.8 KB` gz** (`−22.6%` vs. `f3f57d3`, `−52.9%` vs. `v4.1.0`), 100k-record search **`15.50 ms` p95**, incremental 4,200-cell spreadsheet single-edit **`6.02 ms` p95 (`−72.9%`)**.

---

## Completed Checkpoint Summary (108-File Integration, Performance & Hardening — 2026-11-28)

1. **Safe Baseline, Backup & 108-File Integration (`PLANADAY_INTEGRATION_MANIFEST.md`):**
   - Verified `108/108` archive candidate SHA-256 hashes against `UPGRADE_MANIFEST.json` (`106` matched `f3f57d3` byte-for-byte, `1` EOL-only match, `1` new `src/components/Common/viewSafety.ts`, `0` diverged).
   - Resolved 5 integration regressions + 1 native dialog violation (`labStats.ts` exact `pearsonR = 1.0`, `sync.ts`/`weather.ts` cross-realm `AbortSignal` fallback, `HouseholdHealthView.tsx` `${pills} doses left`, `SpreadsheetView.tsx` accessible `ModalDialog`, unified `4.2.0` changelog version).
2. **Deep Performance & Bundle Optimization (`PLANADAY_PERFORMANCE_AUDIT.md`):**
   - Split `AppProvider` into isolated `ToastProvider` + `SyncStateProvider` + memoized `AppCoreProvider` with stable domain slices and `React.memo` shell (`0` extra renders on `useApp()` during activity heartbeats & toasts).
   - Lazy-loaded `DecorCanvasOverlay` + tightened `vite.config.ts` `manualChunks(id)` (`appCore` `284.5 KB`, `todaySpread`, `decor`, `studioShared`, `0` circular chunks, `624.2 KB` raw / `187.8 KB` gz eager boot JS).
   - Added `IncrementalWorkbookEvaluator` (`spreadsheetEngine.ts` + `SpreadsheetView.tsx`) cutting 4,200-cell single-edit `p95` by `−72.9%` (`22.23 ms` → `6.02 ms`).
   - Eliminated off-page `SearchHit`/snippet allocations in `searchIndex.ts`, kept PDF.js workers alive across page/zoom navigation in `PdfStudioView.tsx`, fixed `extractPdfTextByPage` cleanup leak in `pdfEngine.ts`, and upgraded `public/sw.js` (`activate` cache cleanup + Network-First navigations).
3. **Server, Sync, Desktop & GPU Security Hardening:**
   - Closed workspace push/record-hijack bypasses (`server/index.ts`, `server/db.ts`), restricted `?token=` to SSE `/api/sync/events`, made pairing redemption atomic (`server/auth.ts`), added per-IP auth rate limiting (`429`), closed IPv4-mapped IPv6/NAT64 SSRF bypasses (`server/outboundPolicy.ts`), enforced static directory containment (`desktop/main.cjs`), upgraded `gpu-service/Dockerfile` to CUDA `12.8.1` (Blackwell `sm_120`), hardened `gpu-service/app.py` (constant-time auth, image caps, cached `PaddleOCR`, `asyncio.to_thread` offload, VRAM fraction cap), and hardened `server/gpuBridge.ts`.
4. **Expanded Verification (`PLANADAY_TEST_RESULTS.md`):**
   - Added `tests/integration-optimization-v42.test.tsx` (5 tests) and expanded `tests/ui-smoke.test.tsx` (36 views). Passed `typecheck`, `219/219` 4-runner checks, `191/191` Vitest tests, `py_compile`, `docker compose config`, and `build`.

---

## Completed Checkpoint Summary (Planaday `4.2.0` Initial Build — 2026-11-27)

1. **§2 Comprehensive Performance Overhaul (DONE — Measured & Verified):**
   - Lazy-loaded all 28+ non-initial views in `src/App.tsx` and `src/modules/life/AllInOneView.tsx` + refactored `vite.config.ts` to function-based `manualChunks(id)` isolating `appCore`, `vendor`, `pdfEngine`, `ocrEngine`, `pdfStudio`, `scannerStudio`, and all studio chunks (zero lazy chunks preloaded on cold boot; eager boot JS dropped `1.32 MB` → `806.1 KB` raw / `249.8 KB` gzip!).
   - Non-destructive additive Dexie v3 schema (`src/core/db.ts`) adding compound record indexes + `searchIndex` table.
   - Built incremental inverted trigram FTS engine (`src/core/searchIndex.ts`, `src/core/search.ts`, `GlobalSearchDialog.tsx`): **100,000 records searched in `2.01 ms` p50 / `14.32 ms` p95** (`0.19 ms` incremental upsert).
   - Added bounded LRU ObjectURL cache (`src/core/blobCache.ts`) + `VirtualList` (`src/components/Common/VirtualList.tsx`).
   - Optimized `AppContext.tsx` notification scheduler (~60× fewer idle scans) and tuned SQLite composite indexes + 16 MB page cache PRAGMAs in `server/db.ts`.
2. **§3 Activity-Aware Offline-First Sync Engine & Dashboard (DONE — Verified):**
   - Upgraded `src/core/sync.ts` with passive user activity tracking, `smart` inactivity deferral (~10s default + 120s max postponement cap), activity-yielding blob transfers, `manual`/`scheduled`/`continuous`/`offline` modes, `wifiOnly`, `chargingOnly`, and `selectiveWorkspaceIds`.
   - Added full Sync Policy Dashboard UI in `src/components/Settings/SettingsView.tsx`.
3. **§4 Unified Daily Notes Archive (DONE — Verified):**
   - Created `src/core/dailyNotes.ts` and unified `TodaySpread.tsx` & `NotesView.tsx` onto one canonical `note` record (zero duplication!) with Month Calendar date navigation, 6 daily categories, Jump-to-Daily-Planner navigation, 1-click Task/Project/Diary/Permanent-Knowledge conversion, and automatic bidirectional backlinks.
4. **§5 Physical Note Scanner & Handwriting OCR Studio (DONE — Verified):**
   - Built `src/core/documentScanner.ts` (Sobel edge detection, exact 4-point projective homography warp, integral-image shadow reduction, crisp B&W mode, table-to-CSV parser, `<70%` confidence analysis, hybrid GPU → offline `tesseract.js` → manual fallback, mandatory Lab review safety gate) and `src/modules/studio/DocumentScannerView.tsx`.
5. **§6 Optional Self-Hosted NVIDIA RTX 5050 GPU Service & Bridge (DONE — Verified):**
   - Created `gpu-service/` (`app.py`, `Dockerfile`, `requirements.txt`, `README.md`), `docker-compose.gpu.yml` overlay (`GPU_MEMORY_LIMIT_MB=6144`, persistent `/models` volume), authenticated `server/gpuBridge.ts` + `/api/gpu/*` routes in `server/index.ts`, and Settings GPU Acceleration & Privacy Controls Dashboard.
6. **§7 Integrated PDF Reader, Editor & Secure Redaction Studio (DONE — Verified):**
   - Built `src/core/pdfEngine.ts` (`pdfjs-dist` + `pdf-lib`: inspect, extract text, search, rotate, crop, duplicate, add blank, delete, reorder, merge, split, image insert, AcroForm read/fill, annotation embedding, and **true irreversible secure redaction** removing underlying secret text bytes) and `src/modules/studio/PdfStudioView.tsx`, wired across navigation and `FileManagerView.tsx`.
7. **§8 & §9 Size/Completeness Audit & Store Readiness (DONE — Verified):**
   - Published `PLANADAY_PERFORMANCE_AUDIT.md`, `PLANADAY_SIZE_AND_COMPLETENESS_AUDIT.md`, and `docs/STORE_DISTRIBUTION.md`.
   - Updated Windows Electron packaging (`desktop/package.json`, `main.cjs`, `preload.cjs`: `.pdf`/`.dmtheme` file associations, multi-window, native print, NSIS/MSIX metadata) and Android CI (`.github/workflows/build-apps.yml`: `versionCode 420` / `4.2.0`, R8 shrinking, PDF/image `VIEW`/`SEND` intents, optional secret-gated AAB build).
8. **§10 Benchmarks & Acceptance Tests (DONE):**
   - Added `tests/performance-benchmarks.test.ts` (3/3 PASS) and `tests/v42-features.test.ts` (5/5 PASS). Full suite: **`14/14` files, `186/186` tests PASS**, `0` TypeScript errors, `0` Chrome 74 syntax hits, `0` `localStorage`, `0` native dialogs, `0` `eval`, `0` stubs.

---

## Prior Completed Checkpoint Summary (Planaday `4.1.0`)

1. **Batch 1 — Canonical Documentation & Matrix Repair (DONE):**
   - Established all permanent canonical root documents (`PLANADAY_MASTER.md`, `PLANADAY_DEVELOPMENT_ROADMAP.md`, `PLANADAY_WORKING.md`, `PLANADAY_FEATURE_MATRIX.csv`, `PLANADAY_ISSUES.md`, `PLANADAY_EXPANSION_CATALOG.md`, `PLANADAY_TEST_RESULTS.md`, `PLANADAY_RELEASE_CHECKLIST.md`, `CHANGELOG.md`) while keeping `docs/audits/` immutable.
   - Repaired 29 shifted column cells in `PLANADAY_FEATURE_MATRIX.csv` (652 rows).
2. **Batch 2 — Critical P0 Integrity, Security & SSRF Repairs (DONE — Developer-verified):**
   - `PD-001` + `PF-01`: Per-record lock + atomic Dexie transactions (`src/core/repository.ts`).
   - `PD-016` + `PF-55`: Record-bound `useBufferedText`, non-destructive Dexie v2 `db.drafts` table, `NotesView` Draft Recovery Inbox (`SafeTextEditor.tsx`, `db.ts`, `NotesView.tsx`).
   - `PD-004` + `PF-04`: `server/auth.ts` (`scryptSync`, revocable tokens, 10-min pairing codes, workspace scoping), server route enforcement, client Bearer auth & Settings pairing UI.
   - `PD-005`: Null-origin CSP-locked `<iframe sandbox="allow-scripts">` code runner (`src/core/sandboxRunner.ts`).
   - `PD-014`: Centralized SSRF outbound URL/IP/redirect/size guard (`server/outboundPolicy.ts`).
3. **Batch 3 — Sync, Attachments & Verified Backup Integrity (DONE — Developer-verified):**
   - `CONT-003` & `PD-015`: Fastify v5 RegExp MIME parser (`PNG/JPEG/WebP/WAV/MP3/PDF/SVG/octet-stream`), server SHA-256 verification, atomic temp-file staging, safe download headers.
   - `PD-002` & `CONT-004` & `PF-51`: Bidirectional referenced blob downloads with client SHA-256 check, accurate failed-transfer receipts preventing false `synced`, cross-realm `ArrayBuffer` `put()` fix in `sync.ts`.
   - `PD-003` & `PF-03` & `PF-42`: Persistent `server_id`/`sync_epoch` in SQLite `sync_meta`, ZIP v3 SHA-256 manifest, SQLite backup companion `.manifest.json`, automatic replacement-server reconciliation.
4. **Batch 4 — Math, CSV, Spreadsheets & Export Fidelity (DONE — Developer-verified):**
   - `PD-007`: Pole rejection & golden-section tangent root finder (`src/core/mathEngine.ts`).
   - `PD-006`, `CONT-006`, `CONT-007`: RFC 4180 CSV state-machine parser, explicit `#REF!` on missing sheets, zero-length `LEFT`/`RIGHT`, composite embedded formula evaluation (`src/core/spreadsheetEngine.ts`).
   - `PD-008` & `PD-018`: Typed `downloadFile()` migrating all 7 swapped callers, pure `buildPresentationHtmlDeck()` embedding inline base64 images, HTML tables, transforms, opacity, transitions, and speaker notes.
5. **Batch 5 — Compatibility, Offline Precaching, Mobile Overflow, A11y, Calendar & Packaging (DONE — Developer-verified):**
   - `CONT-008`: 2500ms `requestPersistentStorage` timeout + non-blocking post-ready startup (`db.ts`, `AppContext.tsx`).
   - `CONT-005`: Vite `target: ['chrome74', 'firefox78', 'safari13.1', 'es2019']` (verified 0 `?.` and 0 `??` across all 13 built JS files) + ES5 compatibility notice (`index.html`).
   - `PD-009` + `PF-05`: Build-generated `dist/offline-manifest.json` (19 assets) precached atomically in `public/sw.js`.
   - `PD-017` + `PF-52` + `PF-53`: Authoritative `src/core/releaseInfo.ts` (`4.1.0`), synced manifests, CI test gates in `.github/workflows/build-apps.yml` & `docker-publish.yml`, Settings release & diagnostics UI.
   - `PD-020`: Upgraded Electron to supported `39.2.7` + `sandbox: true` & navigation guards (`desktop/package.json`, `desktop/main.cjs`).
   - `PD-010` + `PF-07`: Skipped forced `scrollHeight` reflow >12k chars, deferred single-pass word/paragraph counting in `NotesView.tsx`.
   - `PD-011`, `PD-012`, `PD-013`, `PD-019` + `PF-06`: Responsive `.dp-studio-split` / `.dp-studio-split-3` classes stacking to 1fr on mobile, explicit `aria-label` names and `≥28px` / `≥24px` targets across Planner, Files, Projects, Photos, Diary, Calendar, Decor.
   - `R-0005` (`CAL-002`) & `R-0007`: Synchronous optimistic settings patch queue + deep merge in `AppContext.tsx` & `db.ts` (fixing Flow Calendar `Adaptive Text` checkbox toggle), plus smooth vertical pointer drag-to-resize on timed calendar events (`FlowCalendarView.tsx`).
6. **Batch 6 — Comprehensive Automated Verification (DONE):**
   - Added `tests/audit-references.test.ts` (117/117 PASS, up from 111/117) and `tests/repair-verification-v41.test.ts` (14/14 PASS).
   - Full suite: **12/12 files, 178/178 tests PASS**; `tsc --noEmit && vite build && tsc -p tsconfig.server.json` PASS; `0` `localStorage`, `0` native `alert/confirm/prompt`, `0` `eval`.

---

## Remaining / Next Work Queue

1. **Live Multi-Engine Browser Verification (Environment-Blocked in This Session — `chrome_devtools` MCP unavailable):**
   - Run Playwright/live Chromium 320px visual overflow pass (`FileManagerView`, `ProjectsView`, `PhotoStudioView`, `DigitalPlannerView`), live Chromium offline Service Worker chunk test (`PD-009`), live Firefox 153 boot test (`CONT-008`), and 50k–100k word paste latency measurement (`PD-010`).
2. **Physical Device & Packaged Binary Validation:**
   - Build & test Android APK on Android 10 (API 29 WebView 74) and Android 14/15 hardware (Gboard/Samsung Keyboard IME, camera capture, Doze lock-screen alarms).
   - Build & smoke-test packaged Windows Electron 39 `.exe` (`desktop/`).
   - Test iOS Safari / WebKit standalone PWA.
3. **Owner-Authorized Production Cutover (`CONT-001`, `CONT-009`):**
   - Inspect live TrueNAS snapshot schedule & Docker `dayplana_db` volume backup path.
   - Export verified backup from live production (`192.168.88.31:3000`), pin immutable v4.1.0 Docker image digest in Dockge `compose.yaml`, enable owner auth passphrase (`PD-004`), and verify post-upgrade health.
4. **Continued Feature Matrix Verification (`R-0008`–`R-0652`) & Phase 2–4 Product Expansion (`PF-09`–`PF-50`, `PF-54`, `PF-56`).**

## Operational Constraints Honored
- Live production server (`192.168.88.31:3000`), Dockge (`192.168.88.31:5001`), and TrueNAS (`192.168.88.49`) were NOT modified.
- All legacy data identifiers (`dayplana-v2`, `/data/dayplana.sqlite`, `dayplana_db`, `com.dayplana.app`) remain 100% preserved.
