# Test results and evidence

Run November 24, 2026 against exact Git revision `d82bdc73742e8982732b5e73d3c44d63e805d842`. Snapshot extracted with `git archive` into an ignored disposable workspace directory. No production application files or user-data paths were used. Existing installed project dependencies were used from the parent workspace. Representative installed and lock versions matched. npm executable was unavailable on PATH, so commands used the installed CLI entry points.

| Verification | Command or procedure | Result |
|---|---|---|
| Client type check | `node ../typescript/bin/tsc --noEmit` from snapshot | Passed. |
| Build | `node ../vite/bin/vite.js build`, then `node ../typescript/bin/tsc -p tsconfig.server.json` | Passed. [Build](evidence/build.txt) |
| Repository regressions | `node ../vitest/vitest.mjs run --root .` before copying audit tests | First run 41 passed and six network-dependent cases failed in default sandbox with loopback EACCES. Repeated with approved local sockets, 47/47 passed in 10 files. [Log](evidence/repository-suite.txt) |
| Independent checks | Copy `evidence/tools/independent.audit.test.ts` into the snapshot `tests/` and run `node ../vitest/vitest.mjs run --root . tests/independent.audit.test.ts` | 3 passed, 6 failed of 9. In-process Fastify inject and fake IndexedDB. [Log](evidence/independent-suite.txt) · [Source](evidence/tools/independent.audit.test.ts) |
| Scale cases | Copy `evidence/tools/scale.audit.test.ts` to snapshot `tests/`, run the same Vitest entry point against it | 1 passed. Source-level search, SQLite batch/pull and 10k-cell calculation, no browser rendering. [Log](evidence/scale-suite.txt) |
| Browser matrix | `node evidence/tools/browser-audit.mjs <snapshot> <browser-evidence-dir> <browser-exe> [followup|soak|workflow]` from an absolute or appropriately resolved path | Headless Chrome and Edge, fresh profiles and disposable real loopback Fastify origin. The modes exercise UI geometry, Notes, server shutdown and selected full browser paths. See evidence lists below. |
| Docker/TrueNAS | `docker context show`, `docker version --format '{{.Server.Version}}'` | Desktop Linux context selected, daemon pipe unavailable. Actual container/host mount and restore unverified. |

## Independent functional results

| Check | Outcome | Evidence |
|---|---|---|
| SQLite snapshot, blob and record survive reopen of same storage | Pass | Snapshot integrity check, one stored row, exact bytes after reopening. |
| Fresh client receives referenced attachment bytes | Fail | New client's sync trace had only record pull, local bytes absent. |
| Parallel nonconflicting title and body editing | Fail | Both promises settled while the title reverted and revision advanced once. |
| Local ZIP restore populates replacement server | Fail | Locally restored note, server zero records, status synced, no pending records. |
| Ordinary CSV text values round-trip | Fail | Comma and multiline text moved to wrong cells. |
| Standard arithmetic, trig and integral | Pass | Known reference values. |
| Graph root rejects a pole | Fail | Returned 0.123 for the vertical discontinuity. |
| Graph finds a tangent root | Fail | No root returned on the test interval. |
| ICS all-day range and recurrence exception | Pass | Exclusive end and omitted occurrence matched fixture. |

## Browser evidence

- [Initial JSON](evidence/browser/browser-results.json) and [initial console summary](evidence/browser-run.txt) record clipboard-like input, dimensions and render findings. This simulation exercised selected-range replacement through Chromium input. It does not emulate the OS composition pipeline.
- [Follow-up JSON](evidence/browser-followup/browser-results.json) and [follow-up console summary](evidence/browser-followup.txt) contain routes, geometry, errors, browser requests and timings. A fresh profile was used for each run. The decisive offline control closed the origin server and online launch was restored afterward.
- [Notes soak](evidence/browser-soak/browser-results.json) confirms 158 selected-range replacements in two minutes and a separate CDP composition replacement. It uses simulated Chromium composition and does not identify phone keyboard behavior.
- [Chrome workflows](evidence/browser-workflows/browser-results.json) and [Edge workflows](evidence/edge-workflows/browser-results.json) each passed seven checks and failed the Whiteboard SVG artifact check. Passing cases include service-worker control, simple calculator arithmetic, Calendar event creation and reload, Lab sample/status editing and reload, Whiteboard starter-board reload, built-in trusted Code Studio arithmetic and Spreadsheet A1 formula/recalculation after reload.
- [UI review and screenshots](04_UI_UX_REVIEW.md) and [performance report](05_PERFORMANCE_AND_STABILITY.md) map the evidence to issues.

## What the repository suite does and where the audit adds coverage

Unit/integration tests exercise calendar rule and DST helpers, task/chore state, kitchen calculations, revisions, fake IndexedDB, SQLite, settings, lab statistics and workbook formulas. The v4 code-runner test specifically checks preprocessing and non-Worker fallback. It supplies no evidence for real Worker containment. The smoke test mounts routes and covers boot, not every control or persistence path. A five-level notes fixture demonstrates that depth, not unlimited practical performance. Positive server integration cases predominantly reference Fastify/SQLite, not a Docker runtime. No artifact packaging workflow runs the test suite as a release gate.

Next independent verification needs physical Android/iOS, packaged desktop upgrade, real second browser/native profiles, TrueNAS restore drill, populated lifecycle coverage and sustained profiling. See [continuation checklist](12_AUDIT_COVERAGE.md).
