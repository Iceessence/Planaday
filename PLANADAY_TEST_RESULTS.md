# PLANADAY — Reproducible Test Results & Verification Evidence (`PLANADAY_TEST_RESULTS.md`)

**Rule:** Strictly distinguish **Previously independently verified** (audited `d82bdc7`), **Developer-verified (Pending independent verification)**, **Blocked by environment**, and **Failed**. Never fabricate benchmarks or claim physical-device verification that was not run.

---

## Historical Independent Audit Baseline (`d82bdc7` — Planaday `4.0.0`)

Preserved unmodified in `docs/audits/planaday-independent-review-continuation/`:
- Developer unit/smoke suite at `d82bdc7`: `10/10` files, `47/47` tests passed (`vitest run`).
- Independent reference suite (`references.audit.test.ts`): `111/117` passed, `6` failed (`MA-051`, `MA-052`, `SH-030`, `SH-031`, `SH-032`, `SH-033`).
- Independent reliability suite (`reliability.audit.test.ts`): `16/17` passed, `1` failed (`SY-014` failed blob PUT falsely reported `synced`).
- Independent prior-issue regressions (`prior-issue-regressions.txt`): `3/9` passed, `6` failed (`PD-001`, `PD-002`, `PD-003`, `PD-006`, `PD-007` pole & tangent).
- Browser workflows (`browser-workflows/results.json`): `EX-001`..`EX-007` failed (`PD-008`), `BR-002` failed (`CONT-003`/`PD-002`), `BR-003` failed (`PD-016`), `CAL-002` failed (`adaptiveText` checkbox state unchanged).
- Mobile 320px Chromium overflow: Universal Files `+146px` (`PD-011`), Photo Studio `+32px` (`PD-019`), Projects & Records `+21px` (`PD-012`), Physical Planner 4 unnamed controls (`PD-013`).
- Firefox 153: hung on startup awaiting `navigator.storage.persist()` (`CONT-008`).
- Android 10 (API 29) WebView 74: `Uncaught SyntaxError: Unexpected token ?` (`CONT-005`).

---

## Developer Verification Log (`4.2.0` Post-108-File Integration & Hardening — 2026-11-28 — Pending Independent Verification)

**Branch:** `integrate/final-upgrade-package` (branched from `f3f57d3`; backup tag `backup/pre-final-upgrade-f3f57d3`)

### 1. Dependency Install, Typecheck, Build, GPU & Compatibility Checks — **PASS (Developer-verified)**
- **Clean Dependency Install:** `npm.cmd ci` → Exit `0` (`259` packages installed cleanly from `package-lock.json`, including `zlibjs@0.3.1`; note `npm ci` reported 6 transitive advisories in upstream dev/tooling packages — documented in Remaining Issues).
- **TypeScript Strict Check:** `npm.cmd run typecheck` (`tsc --noEmit && tsc -p tsconfig.server.json --noEmit`) → Exit `0` (`0` errors).
- **Production Build:** `npm.cmd run build` (`tsc --noEmit && vite build && tsc -p tsconfig.server.json`) → Exit `0` (`1,923` modules transformed in `4.12s`; `0` circular chunks; `29` dist files totaling `4,255,166 B` raw / `1,310,487 B` gz; `9` `dist-server/` files totaling `81,892 B` raw / `23,063 B` gz).
- **Cold-Boot Eager JS:** **`624,165 B` raw (`624.2 KB`) / `187,842 B` gz (`187.8 KB` L9)** — `index` (`13.2 KB`) + `vendor` (`326.5 KB`) + `appCore` (`284.5 KB`), down **−22.6% raw** vs. pre-integration `f3f57d3` (`806.1 KB`) and **−52.9% raw** vs. `v4.1.0` (`1.32 MB`). Zero lazy feature views preloaded; Rollup `>500 kB` warning on `appCore` eliminated.
- **GPU Service Syntax & Compose Validation:**
  - `py -B -m py_compile gpu-service/app.py` → Exit `0`.
  - `docker compose -f docker-compose.yml -f docker-compose.gpu.yml config --quiet` → Exit `0`.
- **Chrome 74 / Android 10 WebView Compatibility Scan (`CONT-005`):** Scanned all built app `.js` chunks in `dist/assets/` → `chrome74Hits: 0`.
- **Static Safety & Completeness Scan (`src/`):** `45` module files (`33,714` lines); `0` `localStorage` data calls, `0` native `window.alert/confirm/prompt` calls, `0` `eval()`, `0` stubs/placeholders.

### 2. Upgrade Package Validation Suite (4 Runners) — **219/219 Checks PASS (Developer-verified)**
Executed against `c:\Platz Apps\Planaday` with `PLANADAY_TYPESCRIPT_PATH=c:\Platz Apps\Planaday\node_modules\typescript`:
- `BATCH4_VALIDATION.cjs`: Exit `0` — `131` files syntax clean (`0` errors), **`77` focused assertions passed** (`128` facts, `269` stickers, `58` diary prompts, `39` thought prompts).
- `BATCH5_VALIDATION.cjs`: Exit `0` — **`51` isolated assertions passed**.
- `BATCH6_VALIDATION.cjs`: Exit `0` — **`50` checks passed** (33 behavioral assertions + structural checks).
- `FINAL_VALIDATION.cjs`: Exit `0` — **`41` isolated assertions passed** (search index & mocked URL lifecycle).

### 3. Full Automated Vitest Suite (`npm.cmd test`) — **15/15 Files, 191/191 Tests PASS (Developer-verified)**
- **New `tests/integration-optimization-v42.test.tsx` (5 / 5 PASS):**
  1. `AppContext` render isolation: 5× `markUserActivity` + 5× `pushToast` trigger **`0` extra `useApp()` renders**.
  2. `IncrementalWorkbookEvaluator`: 100% parity with full `evaluateWorkbook`, incremental recalculation of `≤8` cells for independent single-row edit, plus `#CIRC!` detection and recovery.
  3. `InvertedSearchIndex` + `BoundedBlobUrlCache`: Map-backed deletion release (`0` retained tombstones), concurrent load coalescing (`1` underlying decode for simultaneous callers), and race-safe invalidation.
  4. Server security & GPU bridge hardening: scoped member token blocked (`403`) from pushing missing `workspaceId` or hijacking `ws_lab` records, scoped `recordCount` in `/api/sync/pull`, atomic pairing code redemption (`1` success / `1` failure on concurrent reuse), `?token=` rejected (`401`) on REST routes while accepted on SSE `/api/sync/events`, IPv4-mapped IPv6 (`::ffff:7f00:1`) & NAT64 SSRF blocking, malformed `x-blob-name` safe handling, and `server/gpuBridge.ts` scheme rejection + `401/403` token-mismatch reporting.
  5. Offline fallback failover (`serverUrl` unreachable → fallback URL succeeds), SHA-256 verified attachment upload/download round-trip, and multi-device conflict `keep-both` resolution preserving both copies.
- **Expanded `tests/ui-smoke.test.tsx` (1 / 1 PASS):** Awaits lazy `TodaySpread` cleanly and mounts all 36 major UI views (including `Note Scanner & OCR` and `PDF Reader & Editor`) in jsdom with `0` `localStorage`.
- **Performance & Feature Suites Retained & Passing (`tests/performance-benchmarks.test.ts` 3/3, `tests/v42-features.test.ts` 5/5, `tests/audit-references.test.ts` 117/117, `tests/repair-verification-v41.test.ts` 14/14, plus all 9 baseline suites 46/46):**
  - `[BENCH-100K]`: `build=674.5ms | p50=2.38ms | p95=15.50ms | max=15.50ms | incUpsert=0.17ms | vocab=100110`
  - `[BENCH-LOCAL-CRUD]`: `ops=100 | p50=0.93ms | p95=1.72ms`
  - `200` rapid note edits → `1` outbox op in `182.8ms`; `2,000`-op legacy backlog compacted in `58.8ms`, synced to SQLite in `30.1ms`, backup verified (`81,920` bytes).

### 4. Environment-Blocked / Hardware Checks (Not Claimed as Passed)
- **Live Docker Container Build & Run (`docker-compose.yml` + `docker-compose.gpu.yml`):** Docker CLI `29.1.3` is installed, but the Docker Desktop Linux engine daemon (`//./pipe/dockerDesktopLinuxEngine`) was not running on this host; compose YAML validation passed, while live container build/startup remains **Pending staging run**.
- **Physical NVIDIA RTX 5050 / Blackwell CUDA 12.8 Inference Benchmark:** Upgraded base image to `nvidia/cuda:12.8.1-runtime-ubuntu22.04` and hardened `gpu-service/app.py` (syntax verified), but real CUDA/PaddleOCR inference timing requires a running Docker+NVIDIA Container Toolkit host (**Pending GPU host verification**).
- **Live Multi-Browser (Chrome / Firefox / WebKit), Physical Android/iOS & Packaged Windows Electron `.exe` Runs:** Not executed in this session (**Pending live browser & physical device verification**).
- **Live Production Docker / TrueNAS Host Cutover (`CONT-001`, `CONT-009`):** Intentionally untouched without explicit owner authorization.

---

## Prior Developer Verification Log (`4.2.0` Pre-Integration — 2026-11-27)

### 1. Build, Bundle & Compatibility Verification — **PASS (Developer-verified)**
- **Command:** `npm.cmd run build` (`tsc --noEmit && vite build && tsc -p tsconfig.server.json`)
- **Result:** Exit code `0` (`1,921` modules transformed; Vite built in `3.87s`; zero TypeScript errors across web client, server, and test suites).
- **Cold-Boot Bundle Improvement (§2):** Eager JS parsed on startup reduced from **`1,324,578` B raw (`~378.6 KB` gz)** to **`806,056` B raw (`249.8 KB` gz)** (**−39.1% raw / −34.0% gz**). Zero lazy feature views (`settings`, `calendarPlan`, `mindTime`, `kitchenLife`, `lab`, `mathOffice`, `pdfStudio`, `pdfEngine`, `scannerStudio`, `ocrEngine`, `archive`) are preloaded in `dist/index.html`.
- **Offline Asset Manifest (`PD-009`):** `dist/offline-manifest.json` emitted cleanly (`version: "4.2.0"`, covering all `26` dist assets).
- **Chrome 74 / Android 10 WebView Compatibility Scan (`CONT-005`):** Scanned all built app `.js` chunks in `dist/assets/` -> `chrome74SyntaxHits: 0`.
- **Static Safety & Completeness Scan (`src/`):** `45` module files (`33,235` lines); `0` `localStorage` data calls, `0` native `alert/confirm/prompt`, `0` `eval()`, `0` stubs/placeholders.

### 2. Full Automated Test Suite (`vitest run`) — **14/14 Files, 186/186 Tests PASS (Developer-verified)**
- **Command:** `npm.cmd test` (`vitest run`, Duration `4.85s`)
- **New `v4.2.0` Suites (8/8 PASS):**
  - `tests/performance-benchmarks.test.ts` (**3 / 3 PASS**):
    1. **100,000-Record `InvertedSearchIndex` Benchmark:** `build=648.5ms`, **`p50=2.01ms`**, **`p95=14.32ms`** (target `< 300ms`), `max=14.32ms`, `incUpsert=0.19ms`, `vocab=100,110` across 20 queries (exact, multi-term, prefix, 1-edit typo, type/tag filters).
    2. **100 Local IndexedDB CRUD Actions Benchmark:** **`p50=0.62ms`**, **`p95=1.43ms`** (target `95% < 100ms`).
    3. **`BoundedBlobUrlCache` LRU Eviction:** Verified strict capacity cap + automatic `URL.revokeObjectURL` eviction.
  - `tests/v42-features.test.ts` (**5 / 5 PASS**):
    1. **§3 Activity-Aware Sync:** Verified `smart` deferral while typing, firing after inactivity, `maxDelaySec` postponement cap, `manual`/`offline`/`wifiOnly`/`chargingOnly` policies, and Selective Workspace Sync (`ws_lab` pushed, `ws_personal` untouched).
    2. **§4 Unified Daily Notes Archive:** Verified Today Spread + Notes reference identical canonical `record.id` (zero duplication), Task/Project bidirectional `EntityLink` conversions, and in-place Permanent Knowledge promotion.
    3. **§5 Physical Note Scanner:** Verified Sobel quad detection, 4-point projective homography warp, integral-image shadow brightening, table-to-CSV parsing, `<70%` uncertain word flagging, and mandatory manual-review Lab safety gate.
    4. **§7 Integrated PDF Engine & True Secure Redaction:** Verified real `pdf-lib` metadata/AcroForm filling, rotate/crop/duplicate/add/delete/reorder/merge/split, Global Search indexing of `pdf_doc`, and **irreversible stream-stripped redaction** proven across raw bytes + Flate-inflated streams + hex-decoded `Tj` text (secret `TOP-SECRET-SSN-999-88-7777` present before redaction, **0 occurrences** after redaction, unredacted page 2 preserved).
    5. **§6 Optional GPU Bridge:** Verified live Fastify `401` enforcement on `/api/gpu/*`, graceful `{ ok: true, available: false, fallback: 'local' }` when unconfigured, and live authenticated round-trip (`/status`, `/ocr`, `/jobs/:id/cancel`, `/benchmark`) against a mock local GPU HTTP worker.
- **All Prior 12 Suites Retained & Passing (`178/178` PASS):** `tests/audit-references.test.ts` (117/117), `tests/repair-verification-v41.test.ts` (14/14), plus all 10 baseline suites (47/47).

### 3. Environment-Blocked / Hardware Checks (Not Claimed as Passed)
- **Physical NVIDIA RTX 5050 CUDA Benchmark & PaddleOCR Container Execution:** Requires deploying `docker-compose.gpu.yml` on the owner's RTX 5050 Docker host (verified via mock HTTP worker in automated tests; real GPU inference timing pending hardware run).
- **Live Chrome / Firefox / WebKit Browser Automation & Physical Android/Windows Packaging Runs:** Not executed in this session (require Playwright/browser bridge, physical Android handsets, and Windows/GitHub Actions runners).
- **Live Production Docker / TrueNAS Host Verification (`CONT-001`, `CONT-009`):** Intentionally not executed without owner authorization.

---

## Developer Verification Log (`4.1.0` — 2026-11-24 — Pending Independent Verification)

### 1. Build, Typecheck & Packaging Verification — **PASS (Developer-verified)**
- **Command:** `npm.cmd run build` (`tsc --noEmit && vite build && tsc -p tsconfig.server.json`)
- **Result:** Exit code `0` (`1,704` modules transformed; Vite built in `2.49s`; zero TypeScript errors across web client, server, and test suites).
- **Offline Asset Manifest (`PD-009`):** `dist/offline-manifest.json` emitted cleanly (`version: "4.1.0"`, `assetCount: 19` covering `/`, `/index.html`, `/manifest.webmanifest`, `/icons/icon.svg`, `/sw.js`, CSS, and all 13 lazy/entry JS chunks).
- **Chrome 74 / Android 10 WebView Compatibility Scan (`CONT-005`):** Scanned all `13` built `.js` files in `dist/assets/` -> `optionalChainSyntax: 0`, `nullishSyntax: 0`.
- **Static Safety Scan (`src/`, 98 `.ts`/`.tsx` files):** `localStorageRefs: 0`, `window.alert/confirm/prompt: 0`, `eval(): 0`.

### 2. Full Automated Test Suite (`vitest run`) — **12/12 Files, 178/178 Tests PASS (Developer-verified)**
- **Command:** `npm.cmd test` (`vitest run`, Duration `5.02s`)
- **Suite Breakdown:**
  - `tests/audit-references.test.ts`: **117 / 117 PASS** (up from `111/117` — `MA-051` pole rejection, `MA-052` tangent root, `SH-030`/`SH-031` `LEFT`/`RIGHT` zero length, `SH-032` `=SUM(A1:A3)+1`, `SH-033` `=Missing!A1+1 -> #REF!` all pass!).
  - `tests/repair-verification-v41.test.ts`: **14 / 14 PASS**:
    1. `PD-001 + PF-01`: 1,000 overlapping concurrent disjoint updates -> exact `{ alpha: 500, beta: 500 }`, `rev === 1001`, 1 coalesced outbox op, plus throwing updater leaves zero partial mutation or stale outbox op (`580ms`).
    2. `PD-016 + PF-55`: Blurless `Alpha → Beta` `SafeTextarea` switch flushes Alpha's dirty draft strictly to Alpha, leaves Beta untouched, and records durable `db.drafts` entry (`330ms`).
    3. `PD-004 + PF-04`: Live Fastify server enforces `401` unauthenticated across sync/blobs/storage, workspace-scoped member pairing (`200` on `ws_personal`, `403` on `ws_lab` and admin `/api/storage/backup`), owner SQLite backup companion `.manifest.json` with valid 64-hex `sqliteSha256`, and immediate `401` after token revocation (`225ms`).
    4. `PD-005`: Null-origin iframe sandbox policy verified (`sandboxAttribute: "allow-scripts"`, `allowsSameOrigin: false`, `allowsNetwork: false`, CSP `default-src 'none'` & `connect-src 'none'`).
    5. `PD-014`: Blocks loopback, RFC1918 LAN, link-local/metadata, CGNAT/Tailscale, `file://`, and default HTTP; allows explicit `PLANADAY_ALLOWED_OUTBOUND_HOSTS`; live server `/api/proxy/ics` and `/api/proxy/recipe` return HTTP `403` on SSRF URLs.
    6. `CONT-003 + PD-015`: Live server accepts `image/png`, `image/jpeg`, `image/webp`, `audio/wav`, `application/pdf`, `image/svg+xml`, `application/octet-stream` with HTTP `200`, returns exact bytes + `X-Content-Type-Options: nosniff` + SVG `Content-Security-Policy: sandbox`, and rejects mismatched SHA-256 PUT with HTTP `400`.
    7. `PD-002 + CONT-004 + PF-51`: Synthetic HTTP `503` on blob PUT strictly returns `status: "error"`, `failedBlobTransfers >= 1`, `pendingCount >= 1`; clean Device B pulls note and automatically downloads & SHA-256 verifies PNG bytes into local `db.blobs`.
    8. `PD-003 + PF-03 + PF-42`: ZIP v3 export includes `manifest.json` with checksums; clean import + sync against empty replacement Server B reconciles both record and verified blob bytes onto Server B and binds new `serverId`. (Also caught and fixed a real cross-realm Dexie `db.blobs.update()` ArrayBuffer stripping bug during test execution!)
    9. `PD-006`: RFC 4180 CSV with quoted commas, `""`, and embedded newlines parses into exact cells and round-trips through `exportSheetToDelimited`.
    10. `PD-008`: Typed `downloadFile()` assigns sanitized filename to `anchor.download` and payload to Blob body.
    11. `CONT-008`: Never-resolving `navigator.storage.persist()` mock resolves `false` via timeout without hanging.
    12. `R-0005 + PD-017`: Overlapping `updateSettings` calls preserve both `calendarPrefs.intervalMin` and `calendarPrefs.adaptiveText`; `PLANADAY_RELEASE.version === "4.1.0"`.
    13. `PD-018`: `buildPresentationHtmlDeck()` emits `aspect-ratio:4 / 3`, `data-transition`, inline `<img src="data:image/png;base64,...">`, `transform:rotate(15deg)`, `opacity:0.85`, real `<table>` cells, `<code>`, and speaker notes.
    14. `PD-011 / PD-012 / PD-013 / PD-019 / CAL-002`: Zero unnamed buttons in mounted `DigitalPlannerView` & `FileManagerView`, responsive `.dp-studio-split` present in Files/Projects/Photos, and Flow Calendar `Adaptive Text` checkbox flips synchronously from `true` → `false` and persists in IndexedDB (`509ms`).
  - Existing 10 suites (`phase0`, `phase1`, `phase2`, `phase3`, `phase4`, `upgrades`, `phase1-reliability`, `phases3-10`, `expansion-v4`, `ui-smoke`): **47 / 47 PASS** (200 rapid note edits -> 1 outbox op in `149.6ms`; 2,000-op legacy backlog -> 1 op in `49.6ms`, synced to SQLite in `23.5ms`).

### 3. Environment-Blocked Checks (Not Claimed as Passed)
- **Live Chrome / Firefox / WebKit Browser Automation:** Blocked in this environment because neither local Playwright nor the `chrome_devtools` MCP remote-debugging bridge was available. Live 320px rendered pixel measurements, live Service Worker offline chunk reload, live Firefox 153 startup, and live 50k–100k word browser paste timings remain **Pending live browser verification**.
- **Physical Android 10 / Android 14–15 / iOS / Packaged Windows Electron 39 Hardware Checks:** Not executed in this session (require physical devices and packaging runners).
- **Live Production Docker / TrueNAS Host Verification (`CONT-001`, `CONT-009`):** Intentionally not executed without owner authorization.
