# Production version comparison

**The live application differs from the audited 4.0.0 checkout.** Confirmed read-only on November 24, 2026, over the supplied LAN endpoint.

| Evidence | Live deployment | Rebuilt checkout |
|---|---|---|
| Public health | HTTP 200. App name `dayplana`. No application version field. Data directory `/data`. | HTTP 200. `app: planaday`, `legacyApp: dayplana`, version 4.0.0. |
| Storage status | HTTP 404. | Implemented. |
| Manifest and tab branding | Dayplana — Tactile Life Planner, short name Dayplana. | Planaday. |
| Main bundle fingerprint | `index-B3OCKsQL.js`, 390,342 bytes, SHA-256 begins `bbeace624224`. | `index-DyeBixqe.js`, 412.57 kB in Vite output. |
| Linked assets | Seven fingerprinted assets from the page. | New Planaday main/planning and studio chunks with a different asset graph. |
| Running image identity | Authenticated Dockge shows active `dayplana`, healthy, reference `ghcr.io/iceessence/planaday:latest`. | Git source `d82bdc73742e8982732b5e73d3c44d63e805d842`. |

Rebuilding five pre-rebrand revisions with the installed toolchain yielded three matching linked asset hashes for `5a7022f`, more than the other candidates. The main bundle did not match. This is consistent with pre-2.1 Dayplana code and does not establish an exact commit. A mutable registry tag does not identify the image currently running. Exact matching still needs the live image ID, digest or source revision label.

The installed mobile and desktop client versions were outside production inspection. Previous and new defect tests used the exact archived 4.0.0 source. Production access was limited to header/static/metadata observations, with no practice writes and no application records read.

[Production metadata and hashes](evidence/production-metadata.json) · [Historical build asset hashes](evidence/historical-build-assets.json) · [Dockge and TrueNAS observation](12_TRUENAS_DOCKER_STORAGE_VERIFICATION.md)
