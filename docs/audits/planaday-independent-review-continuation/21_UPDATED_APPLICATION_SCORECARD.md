# Updated application scorecard

Scores are evidence-weighted judgments on a 0–100 scale for the stated use. UNRATED means the audit could not assign a defensible product-level score. The overall functionality score reflects critical-path usability and data integrity with greater weight than module breadth. It is not an average or completion proportion. Prior scores are from the [original scorecard](../planaday-independent-review/13_APPLICATION_SCORECARD.md).

| Category | Previous | Current | Confidence | Reason |
|---|---:|---:|---|---|
| Overall functionality | 57 | 53 | Medium | Useful editing workflows and core tools; app-wide reliability reduced by confirmed wrong-record persistence and attachment failure. |
| Feature completeness | Unrated | Unrated | High on absence of a defensible score | 345 original rows still need independent workflows. |
| Desktop UI | 72 | 70 | Medium | Broader Chromium reach, tested Firefox startup failure. |
| Mobile UI | 54 | 52 | Medium | Three measured 320px overflow cases and unnamed/undersized control candidates. |
| Android application quality | Unrated | 58 | Low | API 35/36 useful native functionality, installable API 29 blocked in stock WebView, limited lifecycle coverage. |
| iOS compatibility | Unrated | Unrated | Low | WebKit desktop/mobile geometry works for two flows. Real Safari, OS integration and iOS package unknown. |
| User experience | 61 | 58 | Medium | Core flows work. Misleading sync and fragile save/export behavior are visible. |
| Visual consistency | 68 | 68 | Medium | Shared styles; some specialist layouts retain fixed panels. |
| Accessibility | 49 | 47 | Low | Four unnamed planner controls and many candidates; screen reader testing remains open. |
| Responsiveness | 57 | 57 | Medium | Fast individual edits, slow multiline insertion and persistent narrow layout issues. |
| Performance | 61 | 60 | Medium | Scale and typical edits are fast in loopback. Calibrated bulk paste and distinct-queue resource costs remain. |
| Memory efficiency | Unrated | Unrated | Low | 30-minute JS snapshots and Node RSS lack process attribution, GC and retention recovery. |
| Long-duration stability | Unrated | 61 | Low | One 30-minute proper edited-state pass. Android, mixed use and longer runs pending. |
| Calendar | 67 | 67 | Medium | Empty ICS envelope, zoom endpoint/reload and prior all-day fixture. Full calendar lifecycles open. |
| Notes | 59 | 48 | High for current target failure | Gboard and 100K preloaded edits work. A focused draft corrupts another note and replicates. |
| Tasks | 70 | 70 | Medium | Existing test coverage plus reliable creation, description and reload, with scheduling lifecycle still open. |
| Chores | Unrated | 61 | Low | Create/reload and underlying completion logic; missed-history scenarios incomplete. |
| Digital planner | 61 | 59 | Low | Route/render, insufficient state and gesture coverage; four unnamed controls. |
| Office tools | 45 | 41 | Medium | Seven exports fail across studios and sheet formulas give errors or wrong references. |
| Mathematical accuracy | 57 | 59 | Medium | Broader supported engine inputs pass, roots still fail in material cases. |
| Creative tools | 55 | 53 | Medium | Book/Game/Project save workflows; output correctness and full relationships incomplete. |
| Laboratory management | 52 | 54 | Low | Lab sample and linked assay/client persisted. Narrow reference stats pass. Chain-of-custody and workflow approvals open. |
| Customization | 65 | 65 | Low | Configured routes and persisted settings demonstrated. Full custom space/template controls open. |
| Cross-feature integration | 57 | 56 | Low | Links exist, but sampled persistence is far narrower than intended integration matrix. |
| Synchronization | 40 | 37 | High for scoped failures | 10K sequential scale, retry and note propagation passed. Concurrent loss, 415, phantom blob status and restore rebind remain. |
| Offline operation | 54 | 53 | Medium | Local drafts survive a tested outage. Previously unvisited studio still cannot load offline. |
| Background operation | Unrated | 45 | Low | Native scheduled delivery in Home/sleep. Data sync under phone background, lock and Doze remains unverified. |
| Notifications | Unrated | 57 | Low | Matching API 35 IDs observed in three conditions with permissions granted. Physical display and changed permission paths open. |
| Data integrity | 29 | 23 | High | Wrong-note persistence added to concurrent lost edits, absent blobs and interchange correctness failures. |
| Backup and recovery | 46 | 48 | Medium | Isolated Docker replacement and SQLite-only/ZIP control. No live hash-complete restoration or validated rebind. |
| Deployment reliability | Unrated | 43 | Medium | Configured shape works in a disposable engine, live provenance and storage protection unresolved. |
| Security | 20 | 20 | High for code, low for live boundaries | Application gate and runner design unchanged; production safety unestablished. |
| Privacy | 31 | 31 | Medium | Local data paths, missing identity gate and incomplete backup/relay protection. |
| Source-code quality | 63 | 61 | Medium | New failure evidence in critical editor anchoring and formula resolution. |
| Architecture | 59 | 57 | Medium | Shared records and two stores are valuable; delivery and release identity incomplete. |
| Maintainability | 58 | 57 | Medium | Repeated backwards export usage and unclear shared lifecycle contracts. |
| Testing | 66 | 64 | High | Existing 47 tests pass while independent regressions expose missing release gates and cases. |
| Documentation | 42 | 40 | High | Live/version divergence and three unclear owner acceptance criteria. |
| Scalability | 54 | 55 | Medium | Real HTTP sequential throughput supports 10K distinct ops, with material RSS and payload growth. |

[Evidence and domain limits](23_AUDIT_COVERAGE_AND_COMPLETION_REPORT.md) · [Critical findings](19_COMPLETE_UPDATED_ISSUE_REGISTER.md)
