# Replaying the continuation evidence

Use a disposable copy of exact commit `d82bdc73742e8982732b5e73d3c44d63e805d842`. Install the locked dependencies and use `npm run build`. Run the checked-in suite in the archive. Copy the two TypeScript audit fixtures from `evidence/tools` into the archive's `tests` directory so their relative imports resolve, then run Vitest against just those files. The original audit's independent regression fixture was rerun separately. Test failures listed in the catalog are expected results on this revision.

| Script | Arguments and isolation |
|---|---|
| `workflows.mjs` | Source snapshot, output directory, full Playwright `index.mjs` path. Optional fourth argument `calendar` to collect CAL-001. Harness creates its own SQLite temp, starts a random loopback listener and launches isolated Chrome profiles. |
| `responsive.mjs` | Snapshot, evidence destination, full Playwright module path and engine (chromium, firefox or webkit). Uses a local loopback server. Each viewport or browser invocation writes its own output. |
| `long-notes.mjs` | Snapshot, output directory, Chrome executable, then `followup` or `soak`. Soak runs 30 minutes and samples progress. |
| `notes-size.mjs` | Snapshot, output directory and full Playwright module path. Checks preloaded size and paired browser paste metrics. |
| `firefox-storage.mjs` | Snapshot, JSON output path, full Playwright module path. Uses its own local server and a simulated permission denial in one Firefox test context. |
| `android-native.mjs` | ADB path, output directory and phase. Set `PLANADAY_AUDIT_ADB_SERIAL` to the correct emulator. It verifies QEMU and the dedicated audit package. Keyboard test coordinates derive from each emulator screenshot. |
| `docker-storage.mjs` | Requires isolated WSL distro `PlanadayAuditD82`, its dedicated audit daemon socket, and built `planaday-audit-d82:source` image. It creates uniquely named audit volume and bind paths, and starts a fixed audit-only container on loopback port 43000. |
| `feature-matrix.mjs` | Continuation directory then full path to bundled artifact-tool module. Validates all cells by CSV import before writing both outputs. |

The runtime evidence contains generated synthetic records only. Public production identity is recorded separately. Logged-in dashboard checks were read-only. Production setup was not used to replay writes. The independent tests include controlled errors and illustrative local workspaces rather than owner data. [Test catalog](../04_COMPLETE_TEST_CATALOG.md)
