# Performance, editor behavior and stability

Measurements are a local Windows run with Node 24.22.3, the installed dependency tree matching representative lock versions, and headless Chrome 158. They are single-run diagnostics. Browser numbers include automation overhead. CPU and RSS figures on the scale workload are process-wide deltas, influenced by garbage collection and timing.

## Browser notes at 390 × 844

| Approx. words | Load method | Load time | 15 replacement p50 / max | Used JS heap |
|---:|---|---:|---:|---:|
| 1,000 | Large input through Chromium | 75 ms | 1.5 / 2.8 ms | 13.1 MiB |
| 10,000 | Large input through Chromium | 4.17 s | 6.1 / 10.0 ms | 7.7 MiB |
| 50,000 | Seed IndexedDB then reload into editor | 182 ms | 11.3 / 16.3 ms | 21.1 MiB |
| 100,000 | Seed IndexedDB then reload into editor | 326 ms | 22.7 / 26.1 ms | 33.3 MiB |

Sample sizes are 15 replacements per size. Maximum approximates the nearest-rank p95 for this small sample. All four editing checks preserved the selected-range replacement and caret through debounce, and the 100k-word saved note passed reload. The seed was used only to prepare large documents. Subsequent replacements and manual save used browser input and UI. The test changed viewport orientation during a short edit and inspected the resulting text.

A separate run inserted approximate 50k-word multiline text through CDP and exceeded its 30-second timeout. The 100k stage in that run then timed out before measuring a fresh insertion. Browser input, text layout and app processing can all contribute. This is evidence of a very large insertion latency case. Historical crash, physical autocorrect duplication, slow-server editing conflicts and a leak remain unresolved. JS heap on larger documents is consistent with increased live data in this short test. Allocation and GC profiling over time are needed. [Initial log](evidence/browser-run.txt) · [Follow-up metrics](evidence/browser-followup/browser-results.json)

## Synthetic scale cases

| Scenario | Wall time | CPU time | RSS change |
|---|---:|---:|---:|
| 30,000-record fuzzy search, 10,000 matching short notes | 31.2 ms | 77 ms | +43.9 MiB |
| Repeat the full search | 17.3 ms | 31 ms | +2.0 MiB |
| SQLite applies 30,000 records in 600 batches | 511.5 ms | 516 ms | +76.4 MiB |
| SQLite first pull materializes all 30,000 records | 57.0 ms | 62 ms | −58.2 MiB |
| Serialize 30,000 records to 10,043,365 bytes of JSON | 15.9 ms | 16 ms | +10.6 MiB |
| Evaluate 10,000 cells with 9,500 simple formulas | 20.8 ms | 47 ms | −4.3 MiB |

The dataset has 10k tasks, 10k events and 10k short notes. These figures exercise source-level functions, including SQLite apply/pull, without UI rendering, a 30,000-record network transfer or bandwidth constraints. Response pagination and IndexedDB pulls deserve a full-device benchmark. [Scale fixtures](evidence/tools/scale.audit.test.ts) · [Scale log](evidence/scale-suite.txt)

The Vite build produced an index JS chunk of 412.57 kB and a planning chunk of 402.51 kB before compression. The HTML links a number of initial chunks and CSS. The browser trace also identifies later code/media and studio chunks. Large regular feature modules are eagerly imported through `App.tsx`, while more recent studios use lazy imports. Cache-first service worker behavior does not give a fresh install all required assets, verified by closing the local origin before opening Whiteboard. [Build log](evidence/build.txt) · [Offline check](evidence/browser-followup/browser-results.json)

A synthetic 2,000-op old same-note queue was reduced to one in 49.8 ms and synced in 20.4 ms in the repository run. Record writes still serialize full payloads and server pull queries materialize results. `AppContext.tsx:354` subscribes to all records; Notes counts words and paragraphs on each draft render; search reconstructs corpus and scores each time. Treat these as measured or source-supported investigation areas as indicated. [Repository log](evidence/repository-suite.txt)

## Outstanding profiling and recovery

In a two-minute Chrome soak, 158 selected-range replacements in a 62,000-character note completed at 5.4 ms median and 6.2 ms p95 including automation overhead. The caret held at index 102. Chromium reported 7 push and 8 pull requests across startup and the test. Sampled DOM nodes stayed within 7,959–7,978. Used JS heap ranged from 5.8 to 27.5 MiB. The event-listener counter varied from 509 to 4,471 and fell again. That variation warrants allocation/GC instrumentation in a longer session. A separate Chromium composition case correctly replaced a selected misspelling. [Soak evidence](evidence/browser-soak/browser-results.json)

Profile fresh and warm startup, typing, fast switching, and long paste with renderer CPU, long tasks, heap, detached nodes, listener counts and bytes. Use 60-minute jittered sessions with attachments and nested notes on Chromium and a physical phone. Run real browser UK/US and native input, large calendars and sheets, 1,000 photos, many boards/projects, endpoint interruption and failed disk writes. Current evidence did not include a long-duration qualification, power-loss durability, native memory or garbage collection timeline.
