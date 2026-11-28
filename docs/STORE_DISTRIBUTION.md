# Planaday Standalone App & Store Distribution Readiness Guide (v4.2.0 §9)

This guide documents everything prepared in the repository for standalone Android and Windows distribution and future Google Play / Microsoft Store submission.

> **Important Policy Note:** Planaday does **not** automatically publish to any store, generate or modify production signing credentials, or purchase external services without explicit owner action.

---

## 1. Android (Google Play & Direct APK Distribution)

### Package Identity & Backward Compatibility
- **Application ID (preserved):** `com.dayplana.app` (ensures seamless in-place upgrade over all existing Planaday/Dayplana Android installs without losing IndexedDB data!).
- **Version:** `versionName "4.2.0"`, `versionCode 420`.
- **Minimum WebView / OS:** Chrome/WebView 74+ (Android 10+ / API 29+), downleveled via Vite ES2019 target.

### Store-Ready Capabilities Configured in `.github/workflows/build-apps.yml`
- **APK (`assembleDebug`)** for direct sideloading on every push to `main`.
- **Optional Signed AAB (`bundleRelease`)** for Google Play Console via manual `workflow_dispatch` (`build_release_aab: true`) when repository secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) are supplied by the owner.
- **R8 Code Shrinking & Resource Shrinking** (`minifyEnabled true`, `shrinkResources true`) enabled on release builds.
- **Android File & Share Intent Filters:**
  - `ACTION_VIEW` for `application/pdf` (open PDFs directly in Planaday PDF Studio).
  - `ACTION_SEND` for `image/*` and `application/pdf` (share photos/scans/PDFs into Planaday).
- **Optional Camera Hardware Declaration:** `<uses-feature android:name="android.hardware.camera" android:required="false" />` so Chromebooks and tablets without cameras remain Play-eligible.

### Google Play Data Safety & Permissions Rationale Checklist (Owner Action Before Submission)
| Permission | Justification for Play Console |
|---|---|
| `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `VIBRATE` | Local offline Smart Alarms, Timers, Medication Reminders, and Event Alerts that wake the device on time. |
| `CAMERA` | Optional on-device Physical Note Scanner and Photo Studio capture (never uploads anywhere unless the user configures their own self-hosted server). |
| `INTERNET`, `ACCESS_NETWORK_STATE` | Optional sync with the user's own self-hosted Planaday Docker server (LAN/Tailscale) and optional Open-Meteo weather / ECB currency refresh. |

- **Data Safety Form:** Planaday collects **zero** telemetry, **zero** analytics, **zero** advertising IDs, and sends **zero** data to third-party servers by default. All user data stays in on-device IndexedDB unless the owner explicitly configures their own self-hosted sync server.
- **Note on Cleartext LAN Traffic:** Direct-sideload builds allow cleartext HTTP (`usesCleartextTraffic="true"`) so local `http://192.168.x.x:3000` LAN Docker servers work out of the box. For public Google Play distribution, consider serving your Docker instance behind HTTPS (e.g., Tailscale HTTPS `*.ts.net` or Caddy/Nginx reverse proxy) and restricting cleartext exclusively to RFC1918 local domains in `network_security_config.xml`.

---

## 2. Windows (Standalone Portable `.exe`, NSIS Installer & Microsoft Store MSIX)

### Application Identity
- **App ID (preserved):** `com.dayplana.desktop`
- **Product Name:** `Planaday` (`v4.2.0`)
- **Runtime:** Electron `39.2.7` with strict `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, navigation origin guards, and system-tray background alarm support.

### Packaging Targets Configured in `desktop/package.json`
- **`npm run dist:win`**: Standalone portable `Planaday.exe` (x64) — built automatically in GitHub Actions.
- **`npm run dist:win:installer`**: Interactive NSIS installer (`allowToChangeInstallationDirectory: true`, Start Menu + Desktop shortcuts) + portable `.exe`.
- **`npm run dist:win:msix`**: Microsoft Store MSIX/AppX package (`appx` configuration pre-populated in `desktop/package.json`).
- **OS File Associations & Desktop Features (`desktop/main.cjs` + `desktop/preload.cjs`):**
  - `.pdf` and `.dmtheme` file associations wired into single-instance `second-instance` & cold-start handoff (`planaday:open-file` IPC).
  - Multi-window support (`New Workspace Window` from Tray menu or `dayplanaDesktop.openNewWindow()`).
  - Native Windows Print (`dayplanaDesktop.printCurrentWindow()`).

### Microsoft Store / Code Signing Checklist (Owner Action Before Submission)
1. Register a Windows Developer Partner Center account and reserve the Publisher Identity Name.
2. Update `desktop/package.json` → `build.appx.publisher` with your Microsoft Partner Center publisher CN.
3. Supply an Authenticode certificate (or use Microsoft Store auto-signing for MSIX upload) before distributing public installers to avoid SmartScreen warnings.
4. Provide a public Privacy Policy URL stating Planaday is offline-first with zero third-party data collection.
