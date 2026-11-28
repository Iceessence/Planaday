import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * PD-009 / PF-05: Emits dist/offline-manifest.json containing every built JS/CSS/HTML chunk
 * so public/sw.js precaches ALL lazy studio chunks atomically on install!
 */
function planadayOfflineManifestPlugin(): Plugin {
  return {
    name: 'planaday-offline-manifest',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      if (!fs.existsSync(distDir)) return;
      const assets = new Set<string>(['/', '/index.html', '/manifest.webmanifest', '/icons/icon.svg']);
      const walk = (dir: string, relBase = '') => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full, rel);
          } else if (/\.(js|css|svg|png|webp|woff2|webmanifest|html)$/i.test(entry.name)) {
            assets.add(`/${rel.replace(/\\/g, '/')}`);
          }
        }
      };
      walk(distDir);
      const manifest = {
        version: '4.2.0',
        buildId: `planaday-4.2.0-${Date.now().toString(36)}`,
        generatedAt: new Date().toISOString(),
        assets: Array.from(assets).sort(),
      };
      fs.writeFileSync(path.join(distDir, 'offline-manifest.json'), JSON.stringify(manifest, null, 2));
    },
  };
}

export default defineConfig({
  plugins: [react(), planadayOfflineManifestPlugin()],
  build: {
    // CONT-005: Downlevel optional chaining (?.) & nullish coalescing (??) so Android 10 WebView 74 boots cleanly!
    target: ['chrome74', 'firefox78', 'safari13.1', 'es2019'],
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const norm = id.replace(/\\/g, '/');
          if (norm.includes('/node_modules/')) {
            if (norm.includes('/pdf-lib/') || norm.includes('/pdfjs-dist/')) return 'pdfEngine';
            if (norm.includes('/tesseract.js/')) return 'ocrEngine';
            if (norm.includes('/fflate/')) return 'archive';
            if (
              norm.includes('/react/') ||
              norm.includes('/react-dom/') ||
              norm.includes('/scheduler/') ||
              norm.includes('/dexie/') ||
              norm.includes('/dexie-react-hooks/')
            ) {
              return 'vendor';
            }
            return undefined;
          }
          // Isolate heavy on-demand studios FIRST before shared core matching
          if (
            norm.includes('/src/components/Settings/SettingsView.tsx') ||
            norm.includes('/src/components/Settings/TrashView.tsx') ||
            norm.includes('/src/core/backup.ts')
          ) {
            return 'settings';
          }
          if (norm.includes('/src/modules/studio/PdfStudioView.tsx') || norm.includes('/src/core/pdfEngine.ts')) {
            return 'pdfStudio';
          }
          if (norm.includes('/src/modules/studio/DocumentScannerView.tsx') || norm.includes('/src/core/documentScanner.ts')) {
            return 'scannerStudio';
          }
          if (
            norm.includes('/src/core/mathEngine.ts') ||
            norm.includes('/src/core/spreadsheetEngine.ts') ||
            norm.includes('/src/modules/studio/CalculatorView.tsx') ||
            norm.includes('/src/modules/studio/SpreadsheetView.tsx') ||
            norm.includes('/src/modules/studio/PresentationView.tsx')
          ) {
            return 'mathOffice';
          }
          if (norm.includes('/src/modules/plan/TodaySpread.tsx')) {
            return 'todaySpread';
          }
          if (norm.includes('/src/components/Decor/') || norm.includes('/src/data/stickers.ts')) {
            return 'decor';
          }
          // Exact cold-boot shell & core files only — prevents pulling lazy studios into eager preload!
          if (
            norm.includes('/src/core/AppContext.tsx') ||
            norm.includes('/src/core/db.ts') ||
            norm.includes('/src/core/repository.ts') ||
            norm.includes('/src/core/sync.ts') ||
            norm.includes('/src/core/blobCache.ts') ||
            norm.includes('/src/core/searchIndex.ts') ||
            norm.includes('/src/core/search.ts') ||
            norm.includes('/src/core/temporal.ts') ||
            norm.includes('/src/core/recurrence.ts') ||
            norm.includes('/src/core/planActions.ts') ||
            norm.includes('/src/core/capture.ts') ||
            norm.includes('/src/core/audio.ts') ||
            norm.includes('/src/core/alarmSchedule.ts') ||
            norm.includes('/src/core/nativeAlarms.ts') ||
            norm.includes('/src/core/releaseInfo.ts') ||
            norm.includes('/src/core/types.ts') ||
            norm.includes('/src/data/themes.ts') ||
            norm.includes('/src/data/sampleData.ts') ||
            norm.includes('/src/components/Shell/') ||
            norm.includes('/src/components/Common/ModalDialog.tsx') ||
            norm.includes('/src/components/Common/ToastStack.tsx') ||
            norm.includes('/src/components/Common/GlobalAlarmRingModal.tsx') ||
            norm.includes('/src/components/Common/QuickCaptureDialog.tsx') ||
            norm.includes('/src/components/Common/GlobalSearchDialog.tsx') ||
            norm.includes('/src/components/Common/CommandPalette.tsx') ||
            norm.includes('/src/components/Settings/OnboardingModal.tsx') ||
            norm.includes('/src/modules/time/ZenSheetOverlay.tsx')
          ) {
            return 'appCore';
          }
          // Non-boot shared helpers & catalogs live in a single lazy studioShared chunk (zero circularity!)
          if (
            norm.includes('/src/core/') ||
            norm.includes('/src/data/') ||
            norm.includes('/src/components/Common/')
          ) {
            return 'studioShared';
          }
          if (norm.includes('/src/modules/lab/')) return 'lab';
          if (norm.includes('/src/modules/planner/') || norm.includes('/src/modules/life/ReportsView.tsx')) {
            return 'digitalPlanner';
          }
          if (norm.includes('/src/modules/creative/')) return 'creativeStudios';
          if (norm.includes('/src/modules/studio/')) return 'visualCodeMedia';
          if (norm.includes('/src/modules/plan/') && !norm.includes('/src/modules/plan/TodaySpread.tsx')) {
            return 'calendarPlan';
          }
          if (norm.includes('/src/modules/mind/') || norm.includes('/src/modules/time/TimeSuiteView.tsx')) {
            return 'mindTime';
          }
          if (norm.includes('/src/modules/kitchen/') || norm.includes('/src/modules/life/')) {
            return 'kitchenLife';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['docs/**', 'node_modules/**', 'dist/**', 'dist-server/**'],
  },
});
