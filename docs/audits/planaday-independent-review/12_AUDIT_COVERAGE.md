# Audit coverage and requirement provenance

**Authoritative checkout located** in the Planaday workspace, `main` at `d82bdc73742e8982732b5e73d3c44d63e805d842`, initially clean, configured origin Iceessence/Planaday. Adjacent Dayplana contains an older source tree and is a legacy reference. No application measurements were taken from that tree. All 138 tracked paths were inventoried, 118 TypeScript/JavaScript files were syntax-scanned, and 55 route dispatch cases and 88 record kinds were enumerated. The browser viewport matrix exercised 46 visible navigation entries under default module settings. [Source inventory](evidence/source-inventory.md)

**Requirement baseline.** The two owner-supplied audit texts include explicit features, match criteria and proposed areas. The checkout and tracked Git history contained README.md as the standalone Markdown project reference, plus the app's in-source guide and changelog. The release records summarize sections 26–39 and prior phases. A separate master specification, standalone development directives or previous independent defect reports could not be located in the places checked. Changelog is a claim ledger. Matrix findings distinguish source, browser and isolated validation. If the owner supplies the master specification, add an authoritative numbered crosswalk and resolve discrepancies before scope changes.

| System / files | Depth in this review | Still open |
|---|---|---|
| Root and entry points: package manifests/lock, Vite, tsconfig, index, src/main, src/App, Capacitor, Dockerfile, Compose, GitHub workflows | Source/config inventory, entry/import review, dependency versions, compiled client/server and Chrome launch. | Native artifacts, signed update, installed dependency advisory attestation and Docker build. |
| Server: index, db, blobs, recipes, ICS, alarm scheduler | Detailed storage/sync review and focused proxy, route guards and alert review. SQLite/API assertions with normal synthetic requests. | Real deployment trust, operational failure/permission tests, ntfy end-to-end. |
| Kernel: AppContext, Dexie, repository, backup, sync, search, sanitization | Data, lifecycle, version and trust-boundary review. Direct write, restore, scale and sync checks. | Complete per-record schema, interrupted persistence, full device-pair, search coverage and query profiling. |
| Planning: dashboard, Today, Flow/Task Calendar, Tasks, Chores, Habits, period planner | Source ownership, representative route checks and core date fixtures. A new task survived reload and a timed Calendar appointment reopened in Agenda on Chrome and Edge. | Filled lifecycle by route, task gestures, multi-calendar/provider, time zones and long-horizon rendering. |
| Mind: Notes, editor, Diary, Thoughts and Life Events | Detailed Notes-buffer read, selection/load/reload tests. Other modules via source entry paths, route snapshots and baseline suite. | Physical IME, scroll replay, large mixed content, live conflict, 60-minute stability, diary/habit/food end-to-end. |
| Planner and Decor | Route controls and source/model paths, baseline anchor/helper tests. | Page/navigation transitions, pen/stickers, sync/anchor fidelity and stress. |
| Kitchen and personal modules | Named route, records and linked domain actions reviewed. Functional baseline kitchen/household/fairness cases. Some modules disabled by default. | All populated creation/edit/delete, device exercise, image and external integration paths. |
| Lab | Source interfaces and operational sections mapped. Baseline wet/NIR numerical test. Synthetic sample persisted with its assays and changed status on Chrome and Edge. | Sample-to-result and custody, pricing, co-review, purchasing, permission and regulated acceptance. |
| Creative, office and media | Source route, workbench payloads, export calls and core math/CSV. Chrome and Edge verified simple formula persistence, built-in JS execution and Whiteboard record persistence. Whiteboard export failed in both. | Full presentations, projects, game, book, kanban and whiteboard workflows, file formats, camera, OS clipboard and performance. |
| Time, alerts and notifications | Runtime capability and delivery source paths, baseline timer and relay settings. | Native lock/snooze/reboot delivery, exact-alarm permission, foreground/backfill and push states. |
| Shell, settings, styles, guide and built-in assets | Main group maps, mobile CSS and dialog checks, layouts/screenshots, settings metadata and documentation mismatch. | Other themes, custom group operations, touch, assists, native contrast/focus and deep-filled forms. |
| Tests | All tracked suites independently rerun. Test entry points and assertions surveyed, focused cases compared. | Mutation tests, native/device E2E gating, migration and failure-injection with browser storage. |

Generated web/server builds, Node dependency caches, ignored runtime-data folders, third-party libraries and native generated packages were excluded from substantive first-party source review. Inventory of a path or a route is evidence of its presence. Focused reads and functional assertions are named above, with remaining line-by-line and full workflow verification pending. No production contents or credentials were read into this report.

## Continuation checklist

1. Obtain a master specification and owner-maintained known-issue list, plus identification of the TrueNAS test dataset and documented rollback.
2. Verify paired browser profiles and physical Android/iOS, Electron installation/upgrade and all offline modes. Include iOS Safari, Android Chrome/WebView, Firefox and Edge in filled workflow/browser matrices.
3. Replay owner-reported cursor jump, autocorrect and long crash with timestamped inputs, OS versions and logs. Cover selected replacement, composition, paste, text beginning/middle, images and nesting, online/offline and slow sync.
4. Control CPU, memory, storage quota, multi-device and interrupted writes. Run fresh-origin PWA offline, cache upgrade, Docker recreation and true restore.
5. Execute each applicable step in the 25-step record lifecycle from the brief for every active record type, using test fixtures for empty, typical, high-count and current legacy data.
6. Complete audit evidence for each accessible control, theme, physical keyboard, assistive technology and specialty domain scenario before a readiness upgrade.

[Feature matrix](02_COMPLETE_FEATURE_MATRIX.md) · [Test results](09_TEST_RESULTS_AND_EVIDENCE.md)
