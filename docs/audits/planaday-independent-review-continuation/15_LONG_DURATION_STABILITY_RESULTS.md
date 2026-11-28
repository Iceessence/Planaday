# Long-duration stability and large notes

LS-001 ran an isolated 30-minute Chrome edit loop on a preloaded Notes document of approximately 10,000 words. It made 2,370 alternating substitutions, with p50 5.22 ms and p95 7.57 ms for the measured edit operation. The final content length was 62,000 characters and the selection was 102–102. The last scheduled checkpoint was at 1,765.4 seconds. At that checkpoint 191 requests had been counted. The 30-minute assertion itself passed. No renderer crash or stalled controls interrupted this scenario. [Full soak](evidence/long-notes/browser-results.json)

Sampled JS heap fluctuated between 5.99 and 33.65 MB. DOM nodes declined from 7,975 to 5,365 between the first and last scheduled checkpoints, and the listener count fluctuated across samples. These snapshots did not isolate GC, retained listeners, native process memory, or memory after closing the editor. They cannot establish a leak-free run. Frame-rate, complete main-thread blocking, isolated CPU, database size and native memory were not independently sampled. The case covers one editor, one synthetic document and a desktop browser. [Checkpoint evidence](evidence/long-notes/soak-progress.json)

| Preloaded words | Time to load | Single-character edit at start, middle, end |
|---:|---:|---|
| 100 | 142 ms | Passed |
| 1,000 | 129 ms | Passed |
| 10,000 | 134 ms | Passed |
| 25,000 | 158 ms | Passed |
| 50,000 | 205 ms | Passed |
| 100,000 | 296 ms | Passed |

| Multiline pasted words | Bare Chrome textarea | Planaday Notes |
|---:|---:|---:|
| 1,000 | 34.9 ms | 114.9 ms |
| 10,000 | 2.71 s | 4.39 s |
| 25,000 | 22.33 s | 28.22 s |

Same Chromium path and payload demonstrate substantial renderer insertion cost and additional Planaday overhead. The earlier 50k/100k initial insertion timeout still matters. This continuation rechecked preloaded edits and 100K save/reload. A 100K fresh paste and a historical crash dump remain unavailable. The result cannot assign a historical cause or estimate Android maximum input size. [Size fixture details](evidence/notes-size/results.json) · [Separate reload follow-up](evidence/notes-followup/browser-results.json)

60-minute editing, two-hour mixed use, Android sustained runs and full rich-text performance remain pending. Resume with [the soak harness](evidence/tools/long-notes.mjs), preserving the 30-minute baseline, then capture Chrome/WebView process CPU, GC and retained allocations plus queue and database growth. Include varied calendar, file, spreadsheet and whiteboard work across the mixed-use run.
