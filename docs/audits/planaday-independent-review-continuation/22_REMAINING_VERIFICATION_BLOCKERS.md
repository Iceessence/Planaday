# Remaining verification blockers and execution queue

| ID | Scope | Observed limit and alternative tried | Smallest next verification |
|---|---|---|---|
| ENV-01 | Physical Android, OEM keyboard, power and lifecycle | ADB reported no physical phone. Owner selected emulator continuation. API 29/35/36 supplied version and native AOSP evidence. | In a later physical-device run, attach one test handset, sideload a dedicated fixture build and repeat locked sync, notification presentation and OEM IME tests. |
| ENV-02 | iPhone, App Store/Capacitor iOS, Safari and iOS keyboard | Audit host is Windows. No iPhone/iOS runtime was available. WebKit at iPhone dimensions completed narrowly scoped browser tests. | Use an iPhone or macOS/Xcode host for Safari, PWA keyboard, notification and lifecycle plus actual build. |
| ENV-03 | Live image ID, mounts, CPU/RSS, restart, permissions | No authorized production Docker engine context available. Dockge/TrueNAS authenticated views exposed configuration and high-level metadata only. Isolated Docker proof passed. | Obtain sanitized read-only engine inspect, volume path and host mount/ownership metadata from the deployment operator. |
| ENV-04 | Live consistency and backup restore | Runtime backing sources and histories unestablished. Visible dataset lacked tasks/snapshots. Synthetic snapshots, ZIP and replacement exercised safely. | Obtain backup metadata for both paths, then verify hash-complete restore onto an isolated destination. |
| ENV-05 | Reported crash and queue incident | No contemporaneous logs or trace for the historical incident. Browser control and 30-minute soak are current approximations. | Capture a reproduction with timestamp, versions, size, queue counts and CPU/heap/renderer traces from an isolated profile. |
| REQ-01 | R-0072, R-0233 | Unlimited/practically unrestricted does not provide capacity, depth or latency acceptance. Existing structures inspected. | Define depth, item counts and response limits; then stress exact boundary plus one. |
| REQ-02 | R-0373 | Refers to unspecified additional lab requirements. Code-derived workspace and record types were inventoried under owner direction. | Continue testing named laboratory workflows and add any acceptance criteria the owner later supplies. |
| SAFE-01 | Security and live exposure | Production inspection was read-only metadata; no attack replication, private records or external probing. | Use authorized policy review, sanitized network rules and bounded defensive assertions. |

## Available tests still open

The following work has no established external blocker. Matrix rows retain NOT VERIFIED when unexecuted.

1. Resume **R-0005** from CAL-002. Fine zoom increased text and event geometry, and the adaptive checkbox did not change state when toggled after zoom. Verify that interaction and reload in isolation before continuing. Resume mobile gestures and exact event geometry for the CAL-001-covered rows and continue with multi-calendar, overlap, recurring, DST, multi-day and rollover cases.
2. Exercise task dependencies and reordering starting R-0027. Verify history, timestamps and link consistency after reload, a missed schedule and offline reconnect.
3. Complete dense inspector/keyboard mobile runs, then planner gestures R-0055–0094 and the new tablet/phone branch with realistic fixtures.
4. Extend Stopwatch, alarms, notification recurrence and background tests R-0099 onward. Distinguish page hidden, process killed, configured Doze and full reboot.
5. Complete photo picker, transform and linked-file lifecycles R-0109 onward. Compare original, edited and remotely recovered bytes.
6. Use fictional end-to-end laboratory workflows R-0133–0171, then cross-workspace links R-0172 onward. Verify due dates, samples, corrective status, inventory, reporting and history.
7. Test all table and presentation cases left open, ordinary file import/export and bridge-specific native flows. Extend Windows packaged app verification, Firefox release channel and source-mapped math/office UI assertions.
8. Run a 60-minute sustained Notes test and a two-hour mixed-use scenario with sampled process and queue telemetry. Add device or emulator coverage, retries and payload mixing.

[Permanent requirement ledger](02_COMPLETE_FEATURE_VERIFICATION_MATRIX.md) · [Case catalog](04_COMPLETE_TEST_CATALOG.md)
