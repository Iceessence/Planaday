# PLANADAY — Active Working Ledger (`PLANADAY_WORKING.md`)

**Last Updated:** 2026-11-24
**Base Audited Revision:** `d82bdc73742e8982732b5e73d3c44d63e805d842` (Planaday `4.0.0`)
**Current Completed Checkpoint:** Planaday `4.1.0` — Batches 1–6 Complete (`178/178` automated tests passing; `26/28` audit issues developer-verified; `2/28` production host items waiting on owner authorization)

---

## Completed Checkpoint Summary (Planaday `4.1.0`)

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
