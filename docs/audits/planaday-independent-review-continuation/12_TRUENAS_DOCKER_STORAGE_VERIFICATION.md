# TrueNAS, Dockge and Planaday storage

## What the live interfaces establish

- The Windows audit host can route directly to both supplied LAN endpoints. The application root and public health endpoint responded. The TrueNAS TLS handshake responded, while the command-line client rejected its untrusted certificate. Inspection then used the existing authenticated browser session the owner identified.
- Dockge at `192.168.88.31:5001` showed stack `dayplana` active, container `dayplana` healthy and image reference `ghcr.io/iceessence/planaday:latest`. The Compose panel matched the supplied YAML, including 3000:3000 port, configured identity `3000:3000`, `DATA_DIR=/data` and both mounts. These fields reflect the authenticated stack UI. Effective identity and immutable image information require the Docker engine's runtime inspection.
- TrueNAS at `192.168.88.49` showed Community Edition 25.10.1, interface address `192.168.88.49`, and online pool `Home_Storage` with about 2.81 TiB available. The expanded dataset tree contained `Home_Storage/Platz_Home/Server_Files`. It did not list a separate Dayplana dataset. `Server_Files` reported **0 snapshots, 0 snapshot tasks, and No Backup Tasks** in its dataset details. External schedules and backup systems remain unverified.
- The application endpoint is served at `192.168.88.31:3000`. TrueNAS and Dockge use distinct network addresses. The current evidence does not identify their physical or virtual relationship, filesystem driver on the Dockge host, or how mounting is implemented between them.

## Mount consequences

| Data | Shipped implementation and configured destination | Physical verification |
|---|---|---|
| Notes, tasks, calendar and other synced record JSON | SQLite `/data/dayplana.sqlite` with WAL/SHM siblings while in use. `dayplana_db:/data` is configured to persist these. | The live endpoint reports `/data`. The Docker project's fully qualified volume name, source mountpoint and backing pool remain unverified. |
| Photos, recordings and attachments | Binary files and metadata sidecars beneath `/data/blobs`. Configured subordinate bind `/mnt/Home_Storage/Platz_Home/Server_Files/Dayplana/blobs:/data/blobs`. This overlays the `blobs` subdirectory of the named volume. | The TrueNAS dataset with the corresponding ancestor name exists. Runtime mount/source filesystem, subdirectory metadata, and permissions remain unverified. |
| 4.0.0 SQLite backup snapshots | Current source writes snapshots under `/data/blobs/db-backups`, which lands in the bind if the shown configuration runs that build and mount. | The live deployment returns 404 to the 4.0.0 storage-status endpoint. Scheduled backup behavior of the live image could not be established. |
| Client-side storage | IndexedDB per client origin contains records, pending edits, blobs, preferences and revisions. APK uses its own application storage. | Native isolates confirmed local note restoration on tested builds. Production phone/profile data was outside the observation scope. |
| Disposable container filesystem | In the intended setup, `/data` and `/data/blobs` are runtime mounts. | Docker inspection or host metadata is required to prove both are actually mounted and writable by the effective UID/GID. |

No Planaday records or attachments were downloaded from production. Application metadata and static frontend assets were read. Docker Desktop's local contexts exposed no running daemon, and neither pointed to the production host. The logged-in views did not expose the container ID, image ID/digest, actual volume source, restart count, CPU/RSS, effective process identity or the exact filesystem type of the bind.

## Recovery and next evidence

Isolated `ST-001` reopened SQLite and verified the attachment hash on the same storage. Restoring the SQLite snapshot into a fresh data directory recreated the record but returned 404 for its attachment. Local ZIP import restored a separate synthetic record and blob. Replacement-server reconciliation remained broken in the prior case rerun.

Isolated ST-002 built the exact 4.0.0 Dockerfile under Docker 29.10.1 in a disposable WSL engine. Its image binds SQLite to a named volume and blobs to a subordinate Linux bind. The container ran as its image-default UID 1000. The live Compose specifies UID/GID 3000, which still requires independent filesystem checks. The replacement had a distinct container ID and returned the same synthetic record and SHA-256 verified blob, and its on-demand SQLite snapshot remained visible in the bind. [Build](evidence/isolated-docker-build.txt) · [Mount, replacement and hash proof](evidence/isolated-docker-storage.txt)

Before treating this deployment as protected, collect sanitized read-only Docker inspect and volume inspect output, the host filesystem source for each mount, and dataset/backup job metadata. A restore drill needs both stores and hashes, on a disposable destination. The named volume and subordinate bind can survive a container replacement independently if both are preserved and reattached. Dropping either store, pointing a stack at a new project volume, or restoring only SQLite can leave a divergent application.

[Production comparison](13_PRODUCTION_VERSION_COMPARISON.md) · [Sync and recovery evidence](14_SYNCHRONIZATION_STRESS_TEST_RESULTS.md)
