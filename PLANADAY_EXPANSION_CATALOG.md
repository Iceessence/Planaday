# PLANADAY — Product Improvement & Expansion Catalog (`PLANADAY_EXPANSION_CATALOG.md`)

Preserves all 56 audit-proposed product improvement packages (`PF-01`–`PF-56`) from `docs/audits/planaday-independent-review/15_COMPLETE_NEW_FEATURE_CATALOG.md` and `docs/audits/planaday-independent-review-continuation/20_UPDATED_PRODUCT_IMPROVEMENT_CATALOG.md`.

**Current Status Summary (Planaday `4.1.0`):**
- **Implemented (Developer-verified, Pending independent verification):** **13** (`PF-01`, `PF-02`, `PF-03`, `PF-04`, `PF-05`, `PF-06`, `PF-07`, `PF-08`, `PF-30`, `PF-42`, `PF-51`, `PF-52`, `PF-55`)
- **Partially Implemented:** **35** (`PF-09`–`PF-11`, `PF-13`–`PF-21`, `PF-23`–`PF-29`, `PF-31`–`PF-34`, `PF-36`–`PF-40`, `PF-43`–`PF-44`, `PF-46`–`PF-49`, `PF-53`, `PF-54`)
- **Planned / Future Phases:** **8** (`PF-12`, `PF-22`, `PF-35`, `PF-41`, `PF-45`, `PF-50`, `PF-56`, plus live production verification for `PF-42`)

| ID | Priority | Package | Dependencies | Current Status |
|---|---|---|---|---|
| **PF-01** | P0 | Reliable atomic saves | `PD-001`, `PD-016` | **Implemented (Developer-verified)** — per-record lock + atomic Dexie transactions + record-bound drafts |
| **PF-02** | P0 | Verified attachment delivery | `PD-002`, `PD-015`, `CONT-003`, `CONT-004` | **Implemented (Developer-verified)** — RegExp MIME parser + SHA-256 verification + bidirectional downloads |
| **PF-03** | P0 | Verified restoration and server rebind | `PD-003` | **Implemented (Developer-verified)** — SQLite `server_id`/`sync_epoch` + replacement-server reconciliation |
| **PF-04** | P0 | Authenticated workspace pairing | `PD-004` | **Implemented (Developer-verified)** — owner passphrase, revocable Bearer tokens, 10-min pairing codes, workspace scoping + Settings UI |
| **PF-05** | P1 | Build-versioned offline assets | `PD-009` | **Implemented (Developer-verified)** — Vite `offline-manifest.json` (19 assets) + buildId-scoped `sw.js` precaching |
| **PF-06** | P1 | Responsive forms and accessible controls | `PD-011`, `PD-012`, `PD-013`, `PD-019` | **Implemented (Developer-verified)** — `.dp-studio-split`/`.dp-studio-split-3` + labeled ≥28px targets (live 320px browser pass pending) |
| **PF-07** | P1 | Long-note editor performance and recovery | `PD-010`, `PD-016` | **Implemented (Developer-verified)** — deferred O(n) counters, 12k autoGrow cap, durable `db.drafts` (live 100k browser timing pending) |
| **PF-08** | P1 | File interchange and calculator correctness | `PD-006`, `PD-007`, `PD-008`, `CONT-006`, `CONT-007`, `PD-018` | **Implemented (Developer-verified)** — 117/117 math/unit/sheet/lab refs, RFC 4180 CSV, typed `downloadFile`, rich HTML deck export |
| **PF-09** | P2 | Typed relationships and deep links | `PF-01` | Partially Implemented (unified `EntityLink` + project links) |
| **PF-10** | P2 | Incremental search and saved search scopes | `PF-01` | Partially Implemented (`GlobalSearchDialog` + Personal/Lab filter) |
| **PF-11** | P2 | Schedule proposals with decision history | `R-0005`..`R-0054` | Partially Implemented (`TaskCalendarView` auto-placement + `FlowCalendarView` drag-resize) |
| **PF-12** | P2 | Shared availability, resources, and travel buffers | `PF-04`, `PF-11` | Planned |
| **PF-13** | P2 | Project dependencies, timelines, and capacity | `PF-09`, `PF-11` | Partially Implemented (`ProjectsView` milestones & subprojects) |
| **PF-14** | P2 | Daily workspace templates and onboarding | `PF-06` | Partially Implemented (`OnboardingModal` + workspace schedules) |
| **PF-15** | P3 | Kitchen costs, inventory lots, and meal reconciliation | `PF-09` | Partially Implemented (`PantryView`, `MealsView`, `GroceryView`) |
| **PF-16** | P3 | Household budgets and receipt ledger | `PF-02`, `PF-09` | Partially Implemented (`FinanceView`) |
| **PF-17** | P3 | Private wellness measurements and trends | `PF-04` | Partially Implemented (`DiaryView` 1–10 + bathroom logs + trends) |
| **PF-18** | P3 | Shared household responsibilities | `PF-04`, `PF-09` | Partially Implemented (`HouseholdHealthView` + Family Profiles) |
| **PF-19** | P3 | Offline travel packs with time zones | `PF-05` | Partially Implemented (`TravelPeopleHomeView`) |
| **PF-20** | P3 | Collections and reading templates | `PF-09` | Partially Implemented (`LearningMediaView` + Custom Record Types) |
| **PF-21** | P3 | Learning plans and evidence notebooks | `PF-09`, `PF-02` | Partially Implemented (`LearningMediaView` + Notes) |
| **PF-22** | P3 | Structured document and PDF review | `PF-02`, `PF-08` | Planned |
| **PF-23** | P3 | Laboratory custody and sample execution | `PF-01`, `PF-04` | Partially Implemented (`LabWorkspaceView` 15 tabs) |
| **PF-24** | P3 | Laboratory QC, method validation, and uncertainty | `PF-23`, `PF-08` | Partially Implemented (`LabWetNirView` + Calibration/QC) |
| **PF-25** | P3 | Laboratory procurement and capacity planning | `PF-23` | Partially Implemented (`LabWorkspaceView` inventory/purchasing/budget) |
| **PF-26** | P3 | Game design entities and balancing scenarios | `PF-08`, `PF-09` | Partially Implemented (`GameDevView`) |
| **PF-27** | P3 | Playtesting, assets, and release evidence | `PF-02`, `PF-26` | Partially Implemented (`GameDevView` dev progress) |
| **PF-28** | P3 | Scene-based writing and story continuity | `PF-07`, `PF-09` | Partially Implemented (`BookStudioView` + Continuity Checker) |
| **PF-29** | P3 | Editorial and publishing handoff | `PF-08`, `PF-28` | Partially Implemented (`BookStudioView` `.md`/`.doc`/PDF export) |
| **PF-30** | P3 | Trusted programming learning workbench | `PD-005` | **Implemented (Developer-verified)** — null-origin CSP iframe sandbox + unit tests + external toolchain export |
| **PF-31** | P3 | Visual record canvas and printable planner | `PF-06`, `PF-09` | Partially Implemented (`DigitalPlannerView` + `WhiteboardView`) |
| **PF-32** | P3 | Reusable photo originals and editing recipes | `PF-02`, `PD-019` | Partially Implemented (`PhotoStudioView` non-destructive copies) |
| **PF-33** | P3 | Scientific calculation worksheets | `PF-08`, `PF-24` | Partially Implemented (`CalculatorView` Lab Mode + Save to Note) |
| **PF-34** | P4 | Previewable user automation | `PF-01`, `PF-04` | Partially Implemented (`StudioExtrasView` automations) |
| **PF-35** | P4 | Owner-controlled local assistance | `PF-04`, `PD-014` | Planned (guarded by explicit owner opt-in & outbound policy) |
| **PF-36** | P4 | Declarative workspace builder | `PF-09`, `PF-06` | Partially Implemented (`ProjectsView` Custom Record Builder + Custom Tabs) |
| **PF-37** | P2 | Native capture and device actions | `PF-02`, `CONT-005` | Partially Implemented (Camera input + Quick Capture) |
| **PF-38** | P2 | Desktop project panes and keyboard workflows | `PD-020`, `PF-06` | Partially Implemented (Command Palette + shortcuts + Electron 39) |
| **PF-39** | P4 | Permission-controlled historical timelines | `PF-04`, `PF-09` | Partially Implemented (`HistoryView` + `ReportsView`) |
| **PF-40** | P4 | Living documents and evidence snapshots | `PF-01`, `PF-08` | Partially Implemented (Live Spreadsheet Data Pull + Note checkpoints) |
| **PF-41** | P4 | Decision journal linked to outcomes | `PF-09` | Planned |
| **PF-42** | P0 | Recovery rehearsal with receipts | `PF-03`, `CONT-009` | **Implemented (Developer-verified)** — ZIP v3 SHA-256 manifest + SQLite `.manifest.json` + automated replacement-server restore test (live TrueNAS check pending owner authorization) |
| **PF-43** | P4 | Private evidence-aware relationship explorer | `PF-04`, `PF-09` | Partially Implemented (`NotesView` Knowledge Graph) |
| **PF-44** | P4 | Adaptive dashboards with pinned preferences | `PF-14` | Partially Implemented (`HomeDashboard`, `QuickGlanceView`, workspace schedules) |
| **PF-45** | P4 | Open template exchange with ownership controls | `PF-04`, `PF-36` | Planned (untrusted template import guard required) |
| **PF-46** | P1 | Native and web notification reliability | `CONT-005` | Partially Implemented (`nativeAlarms.ts` + diagnostics; physical Doze check pending) |
| **PF-47** | P1 | Accessible application-wide diagnostics | `CONT-004`, `PD-017` | Partially Implemented (Sync queue, blob receipts, server storage & release version diagnostics in Settings) |
| **PF-48** | P3 | External development tool integration | `PD-005`, `PD-020` | Partially Implemented (`CodeStudioView` external toolchain download) |
| **PF-49** | P4 | Personal time calibration and scheduling estimates | `PF-11` | Partially Implemented (`TaskCalendarView` learned task averages + distracted stats) |
| **PF-50** | P3 | Advanced file-format and engine compatibility | `PF-08` | Planned (progressive `.xlsx`/`.pptx`/`.pdf` parity) |
| **PF-51** | P1 | Attachment transfer receipts and retry visibility | `PD-002`, `CONT-004` | **Implemented (Developer-verified)** — `BlobTransferReceipt` tracking in `sync.ts` + expandable receipts panel in `SettingsView.tsx` |
| **PF-52** | P1 | Release and storage identity diagnostics | `PD-017`, `CONT-001`, `CONT-009` | **Implemented (Developer-verified)** — `PLANADAY_RELEASE`, `/api/health` + `/api/storage/info` version/serverId/syncEpoch surfaced in Settings |
| **PF-53** | P2 | Native compatibility and notification diagnostics | `CONT-005`, `PF-46` | Partially Implemented (Chrome 74 compatibility guard in `index.html` + runtime platform check in Settings; physical device run pending) |
| **PF-54** | P2 | Export and formula previews with fidelity checks | `PD-006`, `PD-008`, `PD-018` | Partially Implemented (RFC 4180 CSV, typed `downloadFile`, rich HTML deck export; interactive pre-export preview modal planned) |
| **PF-55** | P2 | Draft recovery inbox | `PD-016` | **Implemented (Developer-verified)** — durable Dexie v2 `db.drafts` + 1-click Restore/Discard Draft Recovery Inbox banner in `NotesView.tsx` |
| **PF-56** | P3 | Scientific and laboratory reference workbook | `PF-08`, `PF-24` | Planned (next expansion batch) |
