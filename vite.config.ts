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
            './src/modules/plan/TodaySpread.tsx',
            './src/modules/plan/FlowCalendarView.tsx',
            './src/modules/plan/PeriodPlannerView.tsx',
            './src/modules/plan/TasksView.tsx',
            './src/modules/plan/ChoresView.tsx',
            './src/modules/plan/GoalsHabitsView.tsx',
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
