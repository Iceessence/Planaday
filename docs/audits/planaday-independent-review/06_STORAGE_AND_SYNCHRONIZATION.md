# Storage, synchronization and recovery

| Layer | Current implementation | Verified evidence and limits |
|---|---|---|
| Browser / mobile PWA | Dexie IndexedDB `dayplana-v2`: records, settings, blobs, revisions, time ledger, outbox, undo/redo, conflicts. Storage is scoped to the application origin/profile. | Repository suite verifies persisted synthetic notes and one ZIP blob round trip. Eviction, quota exhaustion and device migration remain unverified. |
| Electron | Embedded loopback static host serves the web build. Client records still use browser storage inside the Electron profile. | Source and packaging workflow inspected. Native artifact install and profile migration unverified. |
| Android | Capacitor wraps the built bundle and keeps the legacy `com.dayplana.planner` ID. WebView local data remains separate from desktop or browser profiles. | Configuration and workflow inspected. Handset storage, upgrade, backup and deletion behavior unverified. |
| Self-host | Fastify uses `DATA_DIR` or a local fallback. SQLite `dayplana.sqlite` uses WAL and `synchronous=NORMAL`. Content-addressed bytes and metadata live under `blobs/`. | Disposable record, SQLite snapshot and bytes reopened successfully with the same directory. |
| Compose / TrueNAS | Compose maps named local-driver `dayplana_data` to `/data`. Image expects a writable mount and runs as `node`. | It is possible to host that volume on a TrueNAS deployment. The observed repository configuration does not identify a specific host dataset, mount or ACL. Docker daemon unavailable. [Docker volume lifetime](https://docs.docker.com/engine/storage/volumes/) · [TrueNAS snapshots](https://www.truenas.com/docs/scale/datasets/snapshots/managesnapshots/) |

## Sync mechanics and fault cases

Local repository saves queue full-record payloads with a base revision. Per-record coalescing and a 1.5-second post-edit debounce reduce redundant requests. The sync cycle serializes normal foreground work, uploads local blobs, pushes up to 50 operations per request, then pulls from a single last sequence. Server transactions assign revisions/sequences and track applied operation IDs. SSE notifications wake the client, with polling/reconnect fallback. The browser visibility handler attempts a small keepalive upload. These mechanisms have different behavior from guaranteed background execution.

| Scenario | Evidence |
|---|---|
| 2,000 old operations targeting one note | 49.8 ms compaction to one and 20.4 ms sync in the repository suite on this machine. This fixture represents the hypothesis about the reported backlog. |
| 65 distinct records and duplicate batch | Repository test passed with a real loopback socket. This checks a narrow homogeneous batch shape. |
| Two-client text collision | Existing suite preserves a conflict in its scenario. Nontext merges, acknowledgement failure and multi-record atomicity are additional gates. |
| Concurrent local field updates | Independently lost the title and produced the same revision for both writers. Sequential coalescing does not protect overlapping transactions. |
| New device receives a note with attachment | Server returned the original bytes and client pulled the note. The client made no GET for the blob and the local bytes were absent. |
| ZIP restored while replacing server | Local note present, old seq 300 retained, server empty, status `synced`, queue 0. There is no explicit republish from this restore path. |
| Republish, renamed host, different server identity, cursor rollback | Single sequence and a per-blob boolean make these source risks. Exercise server reuse and independent server replacement separately. |
| Browser closure, Android Doze, iOS suspension | Pending. Client code has visibility best-effort flush and foreground polling. The web worker reviewed implements fetch caching, with no browser Background Sync registration. [Browser background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation) |

## Backup acceptance requirements

The local ZIP contains settings, record JSON, revisions, ledger and blob bytes. Its import merges those stores and commits records/settings before inserting blobs. JSON-only export contains metadata and no bytes. The server daily timer writes SQLite `VACUUM INTO` under `blobs/db-backups`, and keeps ten snapshots. It starts on process boot and runs after 24 hours. Storage-dashboard backup triggers it immediately. SQLite snapshots require a separate, consistent blob backup or a storage snapshot covering both. [SQLite WAL](https://sqlite.org/wal.html)

1. On an owner-approved test dataset, identify actual container mount source, mount target, owner, groups and permissions.
2. Create a known record, note version and image on two disposable clients. Verify server rows, byte length, SHA-256 and device-local pending state.
3. Take a coordinated backup of SQLite, blobs, local-only data and necessary deployment configuration. Reopen it in a separate environment and compare counts, hashes, linkage and `PRAGMA integrity_check`.
4. Recreate a disposable container with the same mount and verify persistence. Repeat with a fresh server identity after explicit rebind, and verify full restore/republication without trusting an inherited cursor.
5. Simulate lost connection, stopped server, disk full and interrupted import with synthetic records. Compare visible status to what was durably committed.

[Independent tests and logs](09_TEST_RESULTS_AND_EVIDENCE.md) · [Data-loss issues](03_COMPLETE_ISSUE_REGISTER.md)
