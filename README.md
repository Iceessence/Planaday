# Dayplana — Edition 2 Tactile All-in-One Life Planner

Dayplana merges the warmth, calm, and spatial joy of a beloved physical paper planner (dot-grid, kraft paper, college-ruled, open-book spine shadow, binder tabs, freeform stickers, washi tape, rubber stamps, and stylus ink) with the speed and connectivity of an offline-first digital life OS.

## Architecture & Core Non-Negotiables
- **Unified Life Graph**: Single authoritative record store (`IndexedDB` via Dexie locally + `node:sqlite` WAL in Docker) — never duplicates lists across Today, Tasks, Chores, Calendar, Notes, Diary, or Kitchen.
- **Zero `localStorage` & Zero Word Limits**: All records, 100k+ word notes, revisions, and content-addressed binary blobs (photos, PDFs, voice memos, custom stickers) live in IndexedDB + Blob store locally and `/data` in Docker.
- **Zero Friction & Zero Security Overhead**: No accounts, passwords, encryption barriers, or blocking browser `alert()`/`confirm()`/`prompt()` popups.
- **Bundled 100% Offline**: All **208 built-in stickers** (16 categories × 13 exact Unicode codepoints), **40 Science & Technology learning facts**, and the **Appendix B Cooking Density Table** work offline out of the box.

## Three Seamless Operating Modes

### Mode 1 — Self-Hosted Docker Sync (Phone ↔ Computer)
Syncs automatically across phone and computer over LAN, Tailscale, or HTTPS using a single persistent `/data` volume and live SSE push, and hosts the CORS-free Recipe URL & ICS feed proxy:
```bash
docker compose up -d --build
```
Open `http://localhost:3000` (or your LAN/Tailscale address from phone & computer).

### Mode 2 — Completely Offline Phone Mode (Installable PWA)
Open Dayplana in Safari/Chrome on your phone and tap **Add to Home Screen** / **Install App**. The Service Worker precaches the app shell, assets, stickers, facts, and density table so it runs 100% standalone with zero server configured—or queues offline edits with idempotent operation IDs and auto-syncs when reconnecting to your Docker server.

### Mode 3 — Completely Offline Computer Mode
Run locally with zero Docker server required:
```bash
npm install
npm run build
npm start
```
Or install as a desktop PWA and switch **Settings → 3-Mode Sync** to **Offline Computer**, using **1-Click Full ZIP Backup (with Blobs)** or **Direct Disk Folder Backup**.

## Verification Suite
```bash
npm run typecheck
npm run build
npm test
```
