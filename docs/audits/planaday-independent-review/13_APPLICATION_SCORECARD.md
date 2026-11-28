# Independent application scorecard

Quality scores apply the owner's 0–100 rubric to the covered evidence. Confidence reflects the breadth and relevance of that evidence. Categories with insufficient basis are **NOT VERIFIED**. Scores are diagnostic snapshots and no average can clear the critical risks.

| Category | Score | Confidence | Basis |
|---|---:|---|---|
| Overall functionality | 57 | Medium | Broad functional core and 47 baseline passes, with independently confirmed data/interop failures. |
| Feature completeness | NOT VERIFIED | Low | Missing authoritative full specification and incomplete lifecycles. |
| Desktop UI quality | 72 | Medium | Recognizable visual system and broad route access, dense toolbars and accessible-control gaps. |
| Mobile UI quality | 54 | Medium | 46 routes emulated, several clipped forms and small controls. |
| User experience | 61 | Medium | Fast capture/search and useful shell. Depth and inconsistent specialist editing burden everyday tasks. |
| Visual consistency | 68 | Medium | Consistent tokens and card forms, incompatible per-view fixed layouts. |
| Accessibility | 49 | Low | Native dialogs and some labels, heuristic names/sizes issues. Full assistive verification open. |
| Application responsiveness | 57 | Medium | Most small note replacements work, large input exceeded 30 s. |
| Performance | 61 | Medium | Representative kernel scale good, large first pulls and browser paste uneven. |
| Memory efficiency | NOT VERIFIED | Low | Short JS heap and Node RSS points without long allocation profile. |
| Long-duration stability | NOT VERIFIED | Low | Short stress and reload cases only. |
| Calendar functionality | 67 | Medium | Date and recurrence fixtures pass, touch, external calendar and full edge cases pending. |
| Notes editor functionality | 59 | Medium | Selection and preloaded 100k save verified, concurrent persistence and bulk paste need repair. |
| Task management | 70 | Medium | Tests cover time scheduling, carry-forward, use/view consistency in fixtures. |
| Digital planner | 61 | Low | Substantive model and layout, limited gesture and durability coverage. |
| Creative tools | 55 | Low | Functionality in source, export mismatch and incomplete lifecycles. |
| Office productivity tools | 45 | Medium | Spreadsheet engine exists, import/export fidelity failures and limited presentation export. |
| Mathematical accuracy | 57 | Medium | Core fixtures pass, confirmed root-finding errors. |
| Laboratory management | 52 | Low | Practical record forms and analytical helpers. Security/traceability and full lifecycle pending. |
| Customization | 65 | Low | Settings and configurable navigation/widgets exist. Real workflows partly exercised. |
| Cross-feature integration | 57 | Low | Canonical records enable useful live relationships. Many links need lifecycle tests. |
| Synchronization | 40 | High | Existing cases pass, independent missing bytes and misleading restore state. |
| Offline operation | 54 | Medium | IndexedDB supports local persistence, cold lazy chunk fails. |
| Background operation | NOT VERIFIED | Low | Lifecycle hooks in source and no physical evidence. |
| Notifications | NOT VERIFIED | Low | Scheduling and configuration shown, delivery not qualified. |
| Data integrity | 29 | High | Direct lost edit, incomplete attachment replication and flawed interchange. |
| Backup and recovery | 46 | Medium | Local ZIP and SQLite reopen positives, replacement-mode and real dataset restore open. |
| Security | 20 | High for code, low for production perimeter | Missing app-layer auth, runner isolation concern and broad origin policy. |
| Privacy | 31 | Medium | Private local store, thin professional boundary and sensitive external relay content. |
| Source-code quality | 63 | Medium | Type check and useful domain helpers, large coupled views and weak transaction boundaries. |
| Architecture | 59 | Medium | Good record model base, missing durable/permission primitives and dependency boundaries. |
| Maintainability | 58 | Medium | Code split by feature, oversized views and duplicated interaction/exports. |
| Automated testing | 66 | High | 47 tests have meaningful checks, independently discovered blind spots and CI gate missing. |
| Documentation | 42 | High | Readable README and guide, release/branding drift and missing authoritative spec. |
| Future scalability | 54 | Medium | Scale functions usable at sampled size, all-record reads, full-pull and expansion coupling limiting. |

**Verdict: CRITICAL REPAIRS REQUIRED.** Improve access controls and atomic data integrity before broader use. Advance only after severity gates are independently satisfied by the affected client, server and deployment surfaces. [Issue register](03_COMPLETE_ISSUE_REGISTER.md) · [Test and coverage evidence](09_TEST_RESULTS_AND_EVIDENCE.md)
