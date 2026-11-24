import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
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
  },
});
