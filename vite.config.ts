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
        version: '4.1.0',
        buildId: `planaday-4.1.0-${Date.now().toString(36)}`,
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
        manualChunks: {
          vendor: ['react', 'react-dom', 'dexie', 'dexie-react-hooks', 'lucide-react'],
          archive: ['fflate'],
          plan: [
            './src/modules/plan/HomeDashboard.tsx',
            './src/modules/plan/QuickGlanceView.tsx',
            './src/modules/plan/TodaySpread.tsx',
            './src/modules/plan/FlowCalendarView.tsx',
            './src/modules/plan/TaskCalendarView.tsx',
            './src/modules/plan/PeriodPlannerView.tsx',
            './src/modules/plan/TasksView.tsx',
            './src/modules/plan/ChoresView.tsx',
            './src/modules/plan/GoalsHabitsView.tsx',
          ],
          lab: [
            './src/modules/lab/LabWorkspaceView.tsx',
            './src/modules/lab/LabWetNirView.tsx',
          ],
          digitalPlanner: [
            './src/modules/planner/DigitalPlannerView.tsx',
            './src/modules/life/ReportsView.tsx',
          ],
          mathOffice: [
            './src/modules/studio/CalculatorView.tsx',
            './src/modules/studio/SpreadsheetView.tsx',
            './src/modules/studio/PresentationView.tsx',
          ],
          creativeStudios: [
            './src/modules/creative/ProjectsView.tsx',
            './src/modules/creative/GameDevView.tsx',
            './src/modules/creative/BookStudioView.tsx',
          ],
          visualCodeMedia: [
            './src/modules/studio/KanbanView.tsx',
            './src/modules/studio/WhiteboardView.tsx',
            './src/modules/studio/CodeStudioView.tsx',
            './src/modules/studio/PhotoStudioView.tsx',
            './src/modules/studio/FileManagerView.tsx',
          ],
          mindTime: [
            './src/modules/mind/NotesView.tsx',
            './src/modules/mind/ThoughtInboxView.tsx',
            './src/modules/mind/DiaryView.tsx',
            './src/modules/mind/LifeEventsView.tsx',
            './src/modules/time/TimeSuiteView.tsx',
            './src/modules/time/ZenSheetOverlay.tsx',
          ],
          kitchenLife: [
            './src/modules/kitchen/RecipesView.tsx',
            './src/modules/kitchen/PantryView.tsx',
            './src/modules/kitchen/MealsView.tsx',
            './src/modules/kitchen/GroceryView.tsx',
            './src/modules/life/HouseholdHealthView.tsx',
            './src/modules/life/FinanceView.tsx',
            './src/modules/life/LearningMediaView.tsx',
            './src/modules/life/TravelPeopleHomeView.tsx',
            './src/modules/life/StudioExtrasView.tsx',
          ],
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
