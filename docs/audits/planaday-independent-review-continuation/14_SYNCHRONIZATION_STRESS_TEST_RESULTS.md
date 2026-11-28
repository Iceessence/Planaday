# Synchronization stress and storage recovery

The independent harness used current client sync logic, seeded IndexedDB and a real local HTTP and SQLite server. A second workflow used two separate Chrome browser profiles and genuine IndexedDB. All data were synthetic. Each timed row is one bounded loopback scenario. The estimates do not represent WAN latency or multi-client contention.

| Queued ops | Same-note compaction and sync | Distinct-record compaction and sync | Distinct pushes | Distinct request bytes | Distinct RSS delta |
|---:|---:|---:|---:|---:|---:|
| 10 | 1.6 + 22.0 ms | 0.2 + 5.9 ms | 1 | 4,021 | 0.4 MiB |
| 100 | 4.1 + 6.5 ms | 0.7 + 13.6 ms | 2 | 40,342 | 10.3 MiB |
| 1,000 | 15.7 + 5.2 ms | 4.1 + 84.9 ms | 20 | 408,380 | 14.0 MiB |
| 2,000 | 27.2 + 3.9 ms | 9.4 + 110.6 ms | 40 | 821,200 | 35.8 MiB |
| 5,000 | 69.7 + 3.7 ms | 22.5 + 292.9 ms | 100 | 2,059,660 | 50.3 MiB |
| 10,000 | 126.8 + 3.5 ms | 50.4 + 593.2 ms | 200 | 4,133,760 | 59.9 MiB |

All same-note scenarios compacted to one operation and all distinct-record scenarios preserved the requested count. SY-D-10000 used about 2.97 MB of pull response traffic, maximum single request latency 28.8 ms, and 688 ms summed CPU. RSS deltas include the colocated harness and server. They are not mobile memory estimates. [Raw timings and sources](evidence/reliability-suite.txt)

| Case | Outcome |
|---|---|
| SY-013 | One synthetic 503 on record push retained the record and the retry delivered it once. |
| SY-014 | A synthetic 503 on blob PUT left bytes missing. Sync reported synced and zero remaining pending. |
| SY-015 | Eleven record kinds and the tested deletion/restore path reached real SQLite. |
| SY-016 | Replayed operation ID did not increase sequence or duplicate the record. |
| BR-001 | Note body reached a separate Chrome profile and server. An earlier setup run did not consistently save the initial fixture. The retained run waited for confirmed initial persistence. |
| BR-002 and BL-001 | The PNG reference arrived without bytes. Direct normal PNG, JPEG and WAV returned 415 on upload and 404 on read. Octet-stream, PDF and SVG passed identical-byte readback. |
| BR-003 | Wrong record persisted only in the scoped focus-order fault. This is an editor target failure with synchronization propagating the already-wrong result. |
| BR-004 | During loopback-offline state the draft remained local. After connection restored, the expected body reached SQLite. |
| ST-001 | Same-directory service reopen kept note and blob hash. SQLite snapshot in a fresh directory kept the record and returned 404 for its attachment. Full ZIP restored one note and blob locally. |
| ST-002 | WSL Docker container replacement retained the same named volume and nested bind. Record, blob hash and on-demand backup survived independently. |

The prior repository race still loses a disjoint edit, and restored ZIP reconciliation can report healthy against an empty server. The historical queue of approximately 2,000 operations cannot be reconstructed without contemporaneous logs. Controlled fixtures demonstrate how thousands of distinct edits legitimately remain queued and how legacy same-record entries can accumulate before compaction. AN-008 separately received a queued edit at the isolated server while the API 35 emulator was asleep. [Evidence](evidence/android-native/background-sync.json) A real phone's background/locked sync, several devices competing on the same record, retries during attachment transfer, conflict resolution after extended outage and production recovery need independent tests. [Browser workflows](evidence/browser-workflows/results.json) · [Recovery](12_TRUENAS_DOCKER_STORAGE_VERIFICATION.md) · [Prior regression rerun](evidence/prior-issue-regressions.txt)
