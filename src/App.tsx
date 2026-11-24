import React, { useState } from 'react';
import { AppProvider, useApp } from './core/AppContext';
import { Sidebar } from './components/Shell/Sidebar';
import { TopBar } from './components/Shell/TopBar';
import { MiniBar } from './components/Shell/MiniBar';
import { MobileNav } from './components/Shell/MobileNav';
import { ToastStack } from './components/Common/ToastStack';
import { QuickCaptureDialog } from './components/Common/QuickCaptureDialog';
import { GlobalSearchDialog } from './components/Common/GlobalSearchDialog';
import { CommandPalette } from './components/Common/CommandPalette';
import { SettingsView } from './components/Settings/SettingsView';
import { TrashView } from './components/Settings/TrashView';
import { OnboardingModal } from './components/Settings/OnboardingModal';
import { HomeDashboard } from './modules/plan/HomeDashboard';
import { TodaySpread } from './modules/plan/TodaySpread';
import { FlowCalendarView } from './modules/plan/FlowCalendarView';
import { PeriodPlannerView } from './modules/plan/PeriodPlannerView';
import { TasksView } from './modules/plan/TasksView';
import { ChoresView } from './modules/plan/ChoresView';
import { GoalsHabitsView } from './modules/plan/GoalsHabitsView';
import { NotesView } from './modules/mind/NotesView';
import { ThoughtInboxView } from './modules/mind/ThoughtInboxView';
import { DiaryView } from './modules/mind/DiaryView';
import { LifeEventsView } from './modules/mind/LifeEventsView';
import { TimeSuiteView } from './modules/time/TimeSuiteView';
import { ZenSheetOverlay } from './modules/time/ZenSheetOverlay';
import { RecipesView } from './modules/kitchen/RecipesView';
import { PantryView } from './modules/kitchen/PantryView';
import { MealsView } from './modules/kitchen/MealsView';
import { GroceryView } from './modules/kitchen/GroceryView';
import { HouseholdHealthView } from './modules/life/HouseholdHealthView';
import { FinanceView } from './modules/life/FinanceView';
import { LearningMediaView } from './modules/life/LearningMediaView';
import { TravelPeopleHomeView } from './modules/life/TravelPeopleHomeView';
import { StudioExtrasView } from './modules/life/StudioExtrasView';
import { HistoryView } from './modules/life/HistoryView';
import { AllInOneView } from './modules/life/AllInOneView';
import { GuideView } from './modules/life/GuideView';
import { CustomTabView } from './modules/life/CustomTabView';
import { DecorCanvasOverlay } from './components/Decor/DecorCanvas';

const ActiveWorkspaceStage: React.FC = () => {
  const { activeView, activeCustomTabId } = useApp();

  if (activeView === 'all_in_one') return <AllInOneView />;
  if (activeView === 'guide') return <GuideView />;
  if (activeView === 'custom_tab') return <CustomTabView tabId={activeCustomTabId} />;
  if (activeView === 'settings') return <SettingsView />;
  if (activeView === 'trash') return <TrashView />;
  if (activeView === 'home') return <HomeDashboard />;
  if (activeView === 'today') return <TodaySpread renderDecorOverlay={(k) => <DecorCanvasOverlay spreadKey={k} />} />;
  if (activeView === 'calendar') return <FlowCalendarView />;
  if (activeView === 'planner') return <PeriodPlannerView />;
  if (activeView === 'tasks') return <TasksView />;
  if (activeView === 'chores') return <ChoresView />;
  if (activeView === 'history') return <HistoryView />;
  if (activeView === 'goals') return <GoalsHabitsView mode="goals" />;
  if (activeView === 'habits') return <GoalsHabitsView mode="habits" />;
  if (activeView === 'notes') return <NotesView />;
  if (activeView === 'thoughts') return <ThoughtInboxView />;
  if (activeView === 'diary') return <DiaryView />;
  if (activeView === 'events') return <LifeEventsView initialTab="occasions" />;
  if (activeView === 'countdown') return <LifeEventsView initialTab="countdowns" />;
  if (activeView === 'clock') return <TimeSuiteView initialTab="clock" />;
  if (activeView === 'alarms') return <TimeSuiteView initialTab="alarms" />;
  if (activeView === 'timers') return <TimeSuiteView initialTab="timers" />;
  if (activeView === 'stopwatch') return <TimeSuiteView initialTab="stopwatch" />;
  if (activeView === 'recipes') return <RecipesView />;
  if (activeView === 'pantry') return <PantryView />;
  if (activeView === 'meals') return <MealsView />;
  if (activeView === 'shopping') return <GroceryView />;
  if (activeView === 'household') return <HouseholdHealthView mode="household" />;
  if (activeView === 'health') return <HouseholdHealthView mode="health" />;
  if (activeView === 'finance') return <FinanceView />;
  if (activeView === 'learning') return <LearningMediaView mode="learning" />;
  if (activeView === 'media') return <LearningMediaView mode="media" />;
  if (activeView === 'travel') return <TravelPeopleHomeView mode="travel" />;
  if (activeView === 'people') return <TravelPeopleHomeView mode="people" />;
  if (activeView === 'home_assets') return <TravelPeopleHomeView mode="home_assets" />;
  if (activeView === 'spaces') return <StudioExtrasView mode="spaces" />;
  if (activeView === 'rituals') return <StudioExtrasView mode="rituals" />;
  if (activeView === 'insights') return <StudioExtrasView mode="insights" />;
  if (activeView === 'automations') return <StudioExtrasView mode="automations" />;

  return <TodaySpread renderDecorOverlay={(k) => <DecorCanvasOverlay spreadKey={k} />} />;
};

const ShellFrame: React.FC = () => {
  const { ready, storageHealth, openConflicts, setActiveView } = useApp();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (!ready) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <div className="dp-card">Opening Dayplana paper binder…</div>
      </div>
    );
  }

  return (
    <div className={`dp-app ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed((c) => !c)} />
      <div className="dp-main-col">
        <TopBar />
        <MiniBar />

        {storageHealth?.isNearFull && (
          <div className="dp-banner danger" role="alert">
            <span>
              Storage space is nearly full ({storageHealth.percentUsed.toFixed(1)}% used). Export a ZIP backup or empty Trash to free space.
            </span>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('settings')}>
              Manage Storage
            </button>
          </div>
        )}

        {openConflicts.length > 0 && (
          <div className="dp-banner" role="alert">
            <span>
              {openConflicts.length} offline sync conflict(s) preserved safely — review side-by-side merge.
            </span>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('settings')}>
              Resolve Conflicts
            </button>
          </div>
        )}

        <main className="dp-content">
          <ActiveWorkspaceStage />
        </main>
      </div>

      <MobileNav />
      <QuickCaptureDialog />
      <GlobalSearchDialog />
      <CommandPalette />
      <OnboardingModal />
      <ToastStack />
      <ZenSheetOverlay />
    </div>
  );
};

export const App: React.FC = () => (
  <AppProvider>
    <ShellFrame />
  </AppProvider>
);

export default App;
