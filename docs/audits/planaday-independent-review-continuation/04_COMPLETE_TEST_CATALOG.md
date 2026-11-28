# Complete test catalog

All listed execution cases use source `d82bdc7`, except controlled live metadata and previous issue findings. See the [matrix](02_COMPLETE_FEATURE_VERIFICATION_MATRIX.md) for row-level scope. Result PASS is scoped to the exact assertion and lifecycle. Results from simulations, browser runs and read-only live review are not pooled as a pass rate.

## Platform, UI, storage and workflows

| ID | Independent assertion or observation | Result | Mapped requirements | Artifact |
|---|---|---|---|---|
| BLD-001–003 | Both TS checks and production Vite build | Pass | release baseline | [Evidence](evidence/build.txt) |
| REG-001 | 47 unchanged repository tests | 47/47 | cross-module baseline | [Evidence](evidence/repository-suite.txt) |
| SRC-001 | Declared routes and record definitions, module and API inventory | Source mapped | R and C rows | [Evidence](evidence/source-inventory.md) |
| UI-001 | 54 Chromium desktop routes across 2 profiles | 54 loaded, 108 renders | R-0375, R-0379, C-0001–0054 | [Evidence](evidence/web-chromium/results.json) |
| UI-002 | 11 portrait and 11 landscape geometries across 54 Chromium workspace entries in 2 profiles | 2,376 renders, defects logged | R-0374, R-0376–0377, C-0001–0054 | [Evidence](evidence/web-chromium/results.json) |
| UI-003 | Find Task Calendar via the actual mobile menu search | Both profiles passed | R-0012, R-0025, R-0212, R-0379 | [Evidence](evidence/web-chromium/results.json) |
| UI-004 | Firefox 153 two geometries and Firefox 153 storage await differential control | Failed startup on native persist path; simulated immediate false unblocked | C-0064 | [Evidence](evidence/firefox-storage-control.json) |
| UI-005 | WebKit desktop and 393px startup and Notes save/reload | 4/4 | R-0230, R-0374–0375 | [Evidence](evidence/web-webkit/results.json) |
| WF-001 | Create task and reload | Pass | R-0213 | [Evidence](evidence/browser-workflows/results.json) |
| WF-002 | Create chore and reload | Pass | R-0214 | [Evidence](evidence/browser-workflows/results.json) |
| WF-003 | Create goal and reload | Pass | R-0216 | [Evidence](evidence/browser-workflows/results.json) |
| WF-004 | Create habit and reload | Pass | R-0215 | [Evidence](evidence/browser-workflows/results.json) |
| WF-005 | Create pantry lot and reload | Pass | Pantry Lot route and record | [Evidence](evidence/browser-workflows/results.json) |
| WF-006 | Create grocery item and reload | Pass | Groceries route and record | [Evidence](evidence/browser-workflows/results.json) |
| WF-007 | Task long description, edit and reload | Pass | R-0213, R-0385 | [Evidence](evidence/browser-workflows/results.json) |
| WF-008 | Project description, template milestones, reload | Pass | R-0288, R-0385 | [Evidence](evidence/browser-workflows/results.json) |
| WF-009 | Book and chapter persisted together | Pass | R-0307, R-0309, R-0472–0473 | [Evidence](evidence/browser-workflows/results.json) |
| WF-010 | Game project creation and reload | Pass | C-0021 and game project record | [Evidence](evidence/browser-workflows/results.json) |
| WF-011 | Laboratory sample, client and assay after reload | Pass | R-0133–0134, R-0331–0332 | [Evidence](evidence/browser-workflows/results.json) |
| WF-012 | Empty Calendar export named .ics with VCALENDAR envelope | Pass | C-0060 | [Evidence](evidence/browser-workflows/results.json) |
| AN-008 | Reconnect with a native note edit queued before emulator sleep | Pass on API 35, wire receipt before wake | R-0394, R-0396 | [Evidence](evidence/android-native/background-sync.json) |
| CAL-002 | Timed event positioning, adaptive font and notes | Partial. Initial assertions passed, adaptive checkbox did not change after zoom; reload assertion was not reached | R-0005–0006, R-0014 | [Evidence](evidence/calendar-workflows/results.json) |
| CAL-001 | Calendar zoom 1–240 minutes, repeating grid layers and setting reload | Pass | R-0001–0004, R-0024 | [Evidence](evidence/calendar-workflows/results.json) |
| EX-001 | Book Markdown name and payload | Fail | C-0065 | [Evidence](evidence/browser-workflows/results.json) |
| EX-002 | Book DOC name and payload | Fail | C-0065 | [Evidence](evidence/browser-workflows/results.json) |
| EX-003 | Whiteboard SVG name and payload | Fail | C-0066 | [Evidence](evidence/browser-workflows/results.json) |
| EX-004 | Code JavaScript name and payload | Fail | C-0066 | [Evidence](evidence/browser-workflows/results.json) |
| EX-005 | Presentation HTML name and payload | Fail | R-0285, R-0456 | [Evidence](evidence/browser-workflows/results.json) |
| EX-006 | Spreadsheet CSV name and payload | Fail | R-0281, R-0440 | [Evidence](evidence/browser-workflows/results.json) |
| EX-007 | Spreadsheet XLS name and payload | Fail | R-0281, R-0440 | [Evidence](evidence/browser-workflows/results.json) |
| BR-001 | Separate browser profile received note over real HTTP | Pass on recorded final fixture | R-0394 | [Evidence](evidence/browser-workflows/results.json) |
| BR-002 | Separate browser profile received ordinary PNG reference and bytes | Fail, bytes absent | R-0112, R-0123, R-0126, R-0128, R-0387 | [Evidence](evidence/browser-workflows/results.json) |
| BR-003 | Focused dirty note switch preserves owner and body | Fail, wrong note both databases | R-0230, R-0240, R-0394 | [Evidence](evidence/browser-workflows/results.json) |
| BR-004 | Offline draft, local queue and reconnect | Pass | R-0394–0395 | [Evidence](evidence/browser-workflows/results.json) |
| OFF-001 | Service worker controls cached current shell | Pass | R-0395 | [Evidence](evidence/notes-followup/browser-results.json) |
| OFF-002 | Previously unvisited Whiteboard after server shutdown | Fail | R-0287 offline context, R-0395, C-0062 | [Evidence](evidence/notes-followup/browser-results.json) |
| NT-001 | Create/open synthetic note under CDP | Pass | R-0230 | [Evidence](evidence/notes-followup/browser-results.json) |
| NT-002 | Mobile Tasks navigation and reload persisted a task | Pass | R-0213 | [Evidence](evidence/notes-followup/browser-results.json) |
| NT-003 | Single word range selection and replacement with Chromium IME | Pass | R-0230 | [Evidence](evidence/long-notes/browser-results.json) |
| NT-004 | Notes input/selection at 1K words | Pass, 50K/100K preloaded | R-0230, R-0235, R-0239 | [Evidence](evidence/notes-followup/browser-results.json) |
| NT-005 | Notes input/selection at 10K words | Pass, 50K/100K preloaded | R-0230, R-0235, R-0239 | [Evidence](evidence/notes-followup/browser-results.json) |
| NT-006 | Notes input/selection at 50K words | Pass, 50K/100K preloaded | R-0230, R-0235, R-0239 | [Evidence](evidence/notes-followup/browser-results.json) |
| NT-007 | Notes input/selection at 100K words | Pass, 50K/100K preloaded | R-0230, R-0235, R-0239 | [Evidence](evidence/notes-followup/browser-results.json) |
| NT-008 | Emulated orientation and sustained note edit | Pass | R-0230, R-0376–0377 | [Evidence](evidence/notes-followup/browser-results.json) |
| NT-009 | 100K saved note survived browser reload | Pass | R-0230, R-0239 | [Evidence](evidence/notes-followup/browser-results.json) |
| LS-001 | Thirty-minute Notes edit loop with repeated sampling | Pass, 2,370 edits | R-0230, R-0239 | [Evidence](evidence/long-notes/browser-results.json) |
| LS-002 | Load, position and edit six note sizes; compare equal large paste against bare textarea | Six preload passes, latency observed | R-0230, R-0235, R-0239 | [Evidence](evidence/notes-size/results.json) |
| AN-001 | Runtime bridge and plugin startup on API 35/36 | Pass | R-0218, R-0402 | [Evidence](evidence/android-native/preflight.json) |
| AN-002 | API 35 native caret and Gboard readiness | Pass | R-0230 | [Evidence](evidence/android-native/preflight.json) |
| AN-003 | Tap actual Gboard keys for adjacent typo | Pass | C-0055 | [Evidence](evidence/android-native/keyboard.json) |
| AN-004 | Tap correction suggestion, position and force-stop persistence | Pass | R-0230, R-0239, C-0055 | [Evidence](evidence/android-native/keyboard-finish.json) |
| AN-005 | API 36 tablet note save/force-stop reopen | Pass | R-0230, R-0239 | [Evidence](evidence/android-5568/smoke.json) |
| AN-006A | Foreground native matching notification ID | Pass | R-0095 | [Evidence](evidence/android-native/notifications.json) |
| AN-006B | Home/background native matching notification ID | Pass | R-0096 | [Evidence](evidence/android-native/notifications.json) |
| AN-006C | Screen sleep native matching notification ID | Pass | R-0097 | [Evidence](evidence/android-native/notifications.json) |
| AN-007 | Boot on Android 10 stock WebView 74 | Fail | C-0063 | [Evidence](evidence/android-5566/current-webview-syntax.log) |
| BL-001 | Six media types, valid hash and ordinary binary readback | 3 pass, PNG/JPEG/WAV fail | R-0112, R-0123, R-0126, R-0128, R-0387, C-0058 | [Evidence](evidence/ordinary-blobs.jsonl) |
| SY-S-10 | 10 ops on same note | Pass | R-0394 | [Evidence](evidence/reliability-suite.txt) |
| SY-D-10 | 10 ops on distinct records | Pass | R-0394 | [Evidence](evidence/reliability-suite.txt) |
| SY-S-100 | 100 ops on same note | Pass | R-0394 | [Evidence](evidence/reliability-suite.txt) |
| SY-D-100 | 100 ops on distinct records | Pass | R-0394 | [Evidence](evidence/reliability-suite.txt) |
| SY-S-1000 | 1000 ops on same note | Pass | R-0394 | [Evidence](evidence/reliability-suite.txt) |
| SY-D-1000 | 1000 ops on distinct records | Pass | R-0394 | [Evidence](evidence/reliability-suite.txt) |
| SY-S-2000 | 2000 ops on same note | Pass | R-0394 | [Evidence](evidence/reliability-suite.txt) |
| SY-D-2000 | 2000 ops on distinct records | Pass | R-0394 | [Evidence](evidence/reliability-suite.txt) |
| SY-S-5000 | 5000 ops on same note | Pass | R-0394 | [Evidence](evidence/reliability-suite.txt) |
| SY-D-5000 | 5000 ops on distinct records | Pass | R-0394 | [Evidence](evidence/reliability-suite.txt) |
| SY-S-10000 | 10000 ops on same note | Pass | R-0394 | [Evidence](evidence/reliability-suite.txt) |
| SY-D-10000 | 10000 ops on distinct records | Pass | R-0394 | [Evidence](evidence/reliability-suite.txt) |
| SY-013 | Transient record push 503 followed by retry | Pass | R-0394 | [Evidence](evidence/reliability-suite.txt) |
| SY-014 | Blob receives 503 and UI status must remain pending | Fail | R-0127, R-0387, R-0394 | [Evidence](evidence/reliability-suite.txt) |
| SY-015 | 11 typed records and note rename/trash/restore | Pass | R-0394 and typed C rows | [Evidence](evidence/reliability-suite.txt) |
| SY-016 | Repeated operation ID without duplication | Pass | C-0059 | [Evidence](evidence/reliability-suite.txt) |
| ST-001 | Same path reopen, SQLite-only snapshot and full ZIP | Pass with expected SQLite-only no binary | R-0132, R-0392–0393, R-0397 | [Evidence](evidence/reliability-suite.txt) |
| ST-002 | Image build, nested bind/volume and persistent replacement | Pass | R-0392–0393, C-0056–0057 | [Evidence](evidence/isolated-docker-storage.txt) |
| PR-001 | Compare public metadata, storage status and manifest | Live drift identified | R-0402, C-0061 | [Evidence](evidence/production-metadata.json) |
| PR-002 | Compare live linked assets with five archived source builds | No exact match | C-0061 | [Evidence](evidence/historical-build-assets.json) |
| PR-003 | Inspect authorized Dockge and TrueNAS live metadata | UI evidence, runtime mounts open | R-0392–0393, C-0061 | [Evidence](12_TRUENAS_DOCKER_STORAGE_VERIFICATION.md) |
| SEC-001–006 | Defensive review of app boundary, worker, relay, storage-integrity, Electron and live interface | Boundaries and remaining gaps recorded | R-0398, PD-004/005/014/015/020 | [Evidence](17_UPDATED_SECURITY_AND_PRIVACY_REVIEW.md) |

## Precision and reference assertions

The entries below identify the relevant owner range. Expected values and tolerances are specified in the [fixture source](evidence/tools/references.audit.test.ts). [Raw outcomes](evidence/reference-suite.txt)

| ID | Input | Outcome | Requirements |
|---|---|---|---|
| MA-001 | 2+3*4 | Pass | R-0271–0275, R-0403–0423 |
| MA-002 | (2+3)*4 | Pass | R-0271–0275, R-0403–0423 |
| MA-003 | -2^2 | Pass | R-0271–0275, R-0403–0423 |
| MA-004 | 2^3^2 | Pass | R-0271–0275, R-0403–0423 |
| MA-005 | 3/8+1/8 | Pass | R-0271–0275, R-0403–0423 |
| MA-006 | 2pi | Pass | R-0271–0275, R-0403–0423 |
| MA-007 | sin(pi/6) | Pass | R-0271–0275, R-0403–0423 |
| MA-008 | cos(pi) | Pass | R-0271–0275, R-0403–0423 |
| MA-009 | tan(pi/4) | Pass | R-0271–0275, R-0403–0423 |
| MA-010 | asin(1) | Pass | R-0271–0275, R-0403–0423 |
| MA-011 | acos(0) | Pass | R-0271–0275, R-0403–0423 |
| MA-012 | atan(1) | Pass | R-0271–0275, R-0403–0423 |
| MA-013 | atan2(1,-1) | Pass | R-0271–0275, R-0403–0423 |
| MA-014 | sinh(0) | Pass | R-0271–0275, R-0403–0423 |
| MA-015 | cosh(0) | Pass | R-0271–0275, R-0403–0423 |
| MA-016 | tanh(0) | Pass | R-0271–0275, R-0403–0423 |
| MA-017 | asinh(0) | Pass | R-0271–0275, R-0403–0423 |
| MA-018 | acosh(1) | Pass | R-0271–0275, R-0403–0423 |
| MA-019 | atanh(0) | Pass | R-0271–0275, R-0403–0423 |
| MA-020 | sqrt(81) | Pass | R-0271–0275, R-0403–0423 |
| MA-021 | cbrt(-27) | Pass | R-0271–0275, R-0403–0423 |
| MA-022 | abs(-7) | Pass | R-0271–0275, R-0403–0423 |
| MA-023 | ln(e) | Pass | R-0271–0275, R-0403–0423 |
| MA-024 | log(100) | Pass | R-0271–0275, R-0403–0423 |
| MA-025 | log10(1000) | Pass | R-0271–0275, R-0403–0423 |
| MA-026 | log2(1024) | Pass | R-0271–0275, R-0403–0423 |
| MA-027 | exp(0) | Pass | R-0271–0275, R-0403–0423 |
| MA-028 | pow(2,8) | Pass | R-0271–0275, R-0403–0423 |
| MA-029 | floor(-1.2) | Pass | R-0271–0275, R-0403–0423 |
| MA-030 | ceil(-1.2) | Pass | R-0271–0275, R-0403–0423 |
| MA-031 | round(1.23456,3) | Pass | R-0271–0275, R-0403–0423 |
| MA-032 | min(2,5,-3) | Pass | R-0271–0275, R-0403–0423 |
| MA-033 | max(2,5,-3) | Pass | R-0271–0275, R-0403–0423 |
| MA-034 | mean(2,4,9) | Pass | R-0271–0275, R-0403–0423 |
| MA-035 | avg(2,4,9) | Pass | R-0271–0275, R-0403–0423 |
| MA-036 | sum(2,4,9) | Pass | R-0271–0275, R-0403–0423 |
| MA-037 | fact(5) | Pass | R-0271–0275, R-0403–0423 |
| MA-038 | factorial(4) | Pass | R-0271–0275, R-0403–0423 |
| MA-039 | npr(5,2) | Pass | R-0271–0275, R-0403–0423 |
| MA-040 | ncr(5,2) | Pass | R-0271–0275, R-0403–0423 |
| MA-041 | sign(-9) | Pass | R-0271–0275, R-0403–0423 |
| MA-042 | 5! | Pass | R-0271–0275, R-0403–0423 |
| MA-043 | 3e-8+2e-8 | Pass | R-0271–0275, R-0403–0423 |
| MA-044 | 1e150/1e149 | Pass | R-0271–0275, R-0403–0423 |
| MA-045 | angle units | Pass | R-0271–0275, R-0403–0423 |
| MA-046 | variables and custom function | Pass | R-0271–0275, R-0403–0423 |
| MA-047 | invalid arithmetic shape and domains | Pass | R-0271–0275, R-0403–0423 |
| MA-048 | factorial fraction and known formatting | Pass | R-0271–0275, R-0403–0423 |
| MA-049 | derivative, smooth integral and discontinuous integral state | Pass | R-0271–0275, R-0403–0423 |
| MA-050 | finite simple roots | Pass | R-0271–0275, R-0403–0423 |
| MA-051 | excludes a pole | Fail | R-0271–0275, R-0403–0423 |
| MA-052 | detects a tangent root | Fail | R-0271–0275, R-0403–0423 |
| MA-053 | complex arithmetic sign and magnitude | Pass | R-0271–0275, R-0403–0423 |
| MA-054 | determinants | Pass | R-0271–0275, R-0403–0423 |
| MA-055 | dilution, recovery and sample RSD | Pass | R-0271–0275, R-0403–0423 |
| UN-001 | length | Pass | R-0277 |
| UN-002 | mass | Pass | R-0277 |
| UN-003 | volume | Pass | R-0277 |
| UN-004 | temperature | Pass | R-0277 |
| UN-005 | area | Pass | R-0277 |
| UN-006 | time | Pass | R-0277 |
| UN-007 | speed | Pass | R-0277 |
| UN-008 | acceleration | Pass | R-0277 |
| UN-009 | pressure | Pass | R-0277 |
| UN-010 | energy | Pass | R-0277 |
| UN-011 | power | Pass | R-0277 |
| UN-012 | force | Pass | R-0277 |
| UN-013 | electrical | Pass | R-0277 |
| UN-014 | frequency | Pass | R-0277 |
| UN-015 | data | Pass | R-0277 |
| UN-016 | dataRate | Pass | R-0277 |
| UN-017 | density | Pass | R-0277 |
| UN-018 | concentration | Pass | R-0277 |
| UN-019 | flow | Pass | R-0277 |
| UN-020 | angle | Pass | R-0277 |
| UN-021 | torque | Pass | R-0277 |
| UN-022 | fuel | Pass | R-0277 |
| UN-023 | radiation | Pass | R-0277 |
| UN-024 | all declared unit transforms invert at representative positive values | Pass | R-0277 |
| SH-001 | =SUM(A1:A3) | Pass | R-0279, R-0424–0430 |
| SH-002 | =AVERAGE(A1:A3) | Pass | R-0279, R-0424–0430 |
| SH-003 | =AVG(A1:A3) | Pass | R-0279, R-0424–0430 |
| SH-004 | =COUNT(A1:B3) | Pass | R-0279, R-0424–0430 |
| SH-005 | =COUNTA(A1:B3) | Pass | R-0279, R-0424–0430 |
| SH-006 | =MIN(A1:A3) | Pass | R-0279, R-0424–0430 |
| SH-007 | =MAX(A1:A3) | Pass | R-0279, R-0424–0430 |
| SH-008 | =MEDIAN(A1:A3) | Pass | R-0279, R-0424–0430 |
| SH-009 | =STDEV(A1:A3) | Pass | R-0279, R-0424–0430 |
| SH-010 | =STDEV_S(A1:A3) | Pass | R-0279, R-0424–0430 |
| SH-011 | =COUNTIF(A1:A3,">3") | Pass | R-0279, R-0424–0430 |
| SH-012 | =SUMIF(B1:B3,"corn",A1:A3) | Pass | R-0279, R-0424–0430 |
| SH-013 | =IF(A1<A2,"yes","no") | Pass | R-0279, R-0424–0430 |
| SH-014 | =AND(A1>0,A2<5) | Pass | R-0279, R-0424–0430 |
| SH-015 | =OR(A1>3,A2>3) | Pass | R-0279, R-0424–0430 |
| SH-016 | =XLOOKUP("soy",B1:B3,A1:A3,"missing") | Pass | R-0279, R-0424–0430 |
| SH-017 | =XLOOKUP("rice",B1:B3,A1:A3,"missing") | Pass | R-0279, R-0424–0430 |
| SH-018 | =CONCAT("A",A1) | Pass | R-0279, R-0424–0430 |
| SH-019 | =CONCATENATE("A","B") | Pass | R-0279, R-0424–0430 |
| SH-020 | =UPPER("Hi") | Pass | R-0279, R-0424–0430 |
| SH-021 | =LOWER("Hi") | Pass | R-0279, R-0424–0430 |
| SH-022 | =LEN("abc") | Pass | R-0279, R-0424–0430 |
| SH-023 | =LEFT("abc",2) | Pass | R-0279, R-0424–0430 |
| SH-024 | =RIGHT("abc",2) | Pass | R-0279, R-0424–0430 |
| SH-025 | =PMT(0,10,100) | Pass | R-0279, R-0424–0430 |
| SH-026 | =NPV(0.1,110,121) | Pass | R-0279, R-0424–0430 |
| SH-027 | =SUM(Values) | Pass | R-0279, R-0424–0430 |
| SH-028 | =Other!A1+A1 | Pass | R-0279, R-0424–0430 |
| SH-029 | =TODAY() | Pass | R-0279, R-0424–0430 |
| SH-030 | =LEFT("abc",0) | Fail | R-0279, R-0424–0430 |
| SH-031 | =RIGHT("abc",0) | Fail | R-0279, R-0424–0430 |
| SH-032 | =SUM(A1:A3)+1 | Fail | R-0279, R-0424–0430 |
| SH-033 | =Missing!A1+1 | Fail | R-0279, R-0424–0430 |
| SH-034 | invalid arithmetic reports a spreadsheet error | Pass | R-0279, R-0424–0430 |
| SH-035 | changed cells recalculate and alter aggregate | Pass | R-0279, R-0424–0430 |
| SH-036 | circular arithmetic signals an error | Pass | R-0279, R-0424–0430 |
| LA-001 | reference points produce independent bias, SEP, RMSE, regression, counts and exclusion | Pass | R-0360 |
| LA-002 | replicate handling, units warning, missing data and zero baseline | Pass | R-0360 |

## Prior regression reruns

| ID | Independent assertion | Result | Artifact |
|---|---|---|---|
| PRIOR-01 | preserves an ordinary record, a correctly hashed blob and a readable SQLite snapshot after server reopen | Pass | [Prior regressions](evidence/prior-issue-regressions.txt) |
| PRIOR-02 | downloads attachment bytes on a clean second client when its note initially syncs | Fail | [Prior regressions](evidence/prior-issue-regressions.txt) |
| PRIOR-03 | retains two disjoint edits to the same record started concurrently | Fail | [Prior regressions](evidence/prior-issue-regressions.txt) |
| PRIOR-04 | reconciles a restored local ZIP into an empty replacement server | Fail | [Prior regressions](evidence/prior-issue-regressions.txt) |
| PRIOR-05 | round-trips CSV containing a comma, quote, and embedded newline as ordinary cell text | Fail | [Prior regressions](evidence/prior-issue-regressions.txt) |
| PRIOR-06 | evaluates arithmetic, fractions, degree trig and a smooth integral against known values | Pass | [Prior regressions](evidence/prior-issue-regressions.txt) |
| PRIOR-07 | does not report a vertical discontinuity as a root | Fail | [Prior regressions](evidence/prior-issue-regressions.txt) |
| PRIOR-08 | can find a tangent root without a sign change inside the sampling intervals | Fail | [Prior regressions](evidence/prior-issue-regressions.txt) |
| PRIOR-09 | preserves exclusive dates and recurrence exceptions from a standard all-day calendar fixture | Pass | [Prior regressions](evidence/prior-issue-regressions.txt) |

The [reverification report](18_PREVIOUS_ISSUE_REVERIFICATION.md) maps each new and old observation to issue IDs and repair criteria. Audit harnesses are stored under [evidence/tools](evidence/tools/). See the [handoff evidence guide](evidence/REPLAY.md) for isolated replay.
