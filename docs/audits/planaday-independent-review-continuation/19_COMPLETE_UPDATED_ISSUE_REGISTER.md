# Updated issue register

All 20 previous issues remain open. [Reverification and acceptance criteria](18_PREVIOUS_ISSUE_REVERIFICATION.md) preserves the full PD-001–020 register and current findings. The earlier tentative CONT-002 label was consolidated into PD-016, the now-reproduced cross-note corruption at P0.

| ID | Severity | Finding | Evidence scope | Evidence | Repair acceptance |
|---|---|---|---|---|---|
| CONT-001 | P1 | Live deployment differs from 4.0.0 | Current source health has version 4.0.0, live is Dayplana with no version field and different bundle. | [Evidence](evidence/production-metadata.json) | Record live immutable image, backup and prove compatibility before rollout. |
| CONT-003 | P1 | Ordinary media blob PUT returns 415 | PNG/JPEG/WAV rejected in isolated server. Correct hash stayed unavailable. Octet/PDF/SVG passed. | [Evidence](evidence/ordinary-blobs.jsonl) | Recognize the supported media types, then verify two-client transfer. |
| CONT-004 | P1 | Blob transfer failure reports healthy sync | Synthetic 503 resulted in synced, zero pending and absent bytes. | [Evidence](evidence/reliability-suite.txt) | Retain binary pending items and fail clearly until receipt is verified. |
| CONT-005 | P1 | Installable Android 10 WebView cannot boot current app | Stock API 29 WebView 74 hits syntax error, API 35/36 start. | [Evidence](evidence/android-5566/current-webview-syntax.log) | Define enforced/supported WebView floor or ship compatible asset target. |
| CONT-006 | P1 | Missing-sheet formula returns active sheet numeric data | SH-033 expected a reference error. It returned 3. | [Evidence](evidence/reference-suite.txt) | Resolve sheets explicitly and propagate REF errors. |
| CONT-007 | P2 | Composite formula and zero-length text semantics fail | SH-030–032 return an unexpected character or arithmetic error on a valid nested expression. | [Evidence](evidence/reference-suite.txt) | Add formula parsing and edge semantics tests. |
| CONT-008 | P1 | Firefox tested build never opens workspace | Playwright Firefox 153 remained on startup. Native persistent-storage request stayed pending. Immediate simulated denial allowed startup. | [Evidence](evidence/firefox-storage-control.json) | Reproduce released Firefox, then identify unresolved initial bootstrap step. |
| CONT-009 | P1 | Production backup coverage unverified | Visible TrueNAS dataset reports zero snapshots/tasks and no backup tasks. Live SQLite location and external protection are unknown. | [Storage findings](12_TRUENAS_DOCKER_STORAGE_VERIFICATION.md) | Locate both running mounts, identify protection for each and independently restore a synthetic clone. |

PD-002 and CONT-003 describe separate failure layers within attachment synchronization. The former also fails with supported octet-stream on a fresh recipient. CONT-004 describes status/receipt behavior after an explicitly temporary server failure. CONT-009 records an operational evidence gap. It does not establish that no external backup exists.

## Order for triage

1. Put data preservation and deployment access boundaries first. PD-001, PD-016, PD-004 and PD-005 are the highest-impact confirmed runtime or source findings.
2. Identify the live immutable release and actual mount sources, then prove restore before any rollout. CONT-001, CONT-009 and PD-003.
3. Verify reliable binary delivery and all sync error states. PD-002, PD-015, CONT-003 and CONT-004.
4. Reestablish safe interchange, calculation accuracy, browser/native support and offline availability before advancing feature breadth. [Development order](20_UPDATED_PRODUCT_IMPROVEMENT_CATALOG.md)
