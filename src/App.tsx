import React, { Suspense, lazy, useState } from 'react';
import { AppProvider, useApp } from './core/AppContext';
import { Sidebar } from './components/Shell/Sidebar';
import { TopBar } from './components/Shell/TopBar';
import { MiniBar } from './components/Shell/MiniBar';
import { MobileNav } from './components/Shell/MobileNav';
import { ToastStack } from './components/Common/ToastStack';
import { GlobalAlarmRingModal } from './components/Common/GlobalAlarmRingModal';
import { QuickCaptureDialog } from './components/Common/QuickCaptureDialog';
import { GlobalSearchDialog } from './components/Common/GlobalSearchDialog';
import { CommandPalette } from './components/Common/CommandPalette';
import { OnboardingModal } from './components/Settings/OnboardingModal';
import { TodaySpread } from './modules/plan/TodaySpread';
import { ZenSheetOverlay } from './modules/time/ZenSheetOverlay';
import { DecorCanvasOverlay } from './components/Decor/DecorCanvas';

// On-demand lazy chunks for ALL non-initial views & studios (v4.2.0 §2 cold-start optimization)
const SettingsView = lazy(() => import('./components/Settings/SettingsView').then((m) => ({ default: m.SettingsView })));
const TrashView = lazy(() => import('./components/Settings/TrashView').then((m) => ({ default: m.TrashView })));
const HomeDashboard = lazy(() => import('./modules/plan/HomeDashboard').then((m) => ({ default: m.HomeDashboard })));
const QuickGlanceView = lazy(() => import('./modules/plan/QuickGlanceView').then((m) => ({ default: m.QuickGlanceView })));
const FlowCalendarView = lazy(() => import('./modules/plan/FlowCalendarView').then((m) => ({ default: m.FlowCalendarView })));
const TaskCalendarView = lazy(() => import('./modules/plan/TaskCalendarView').then((m) => ({ default: m.TaskCalendarView })));
const PeriodPlannerView = lazy(() => import('./modules/plan/PeriodPlannerView').then((m) => ({ default: m.PeriodPlannerView })));
const TasksView = lazy(() => import('./modules/plan/TasksView').then((m) => ({ default: m.TasksView })));
const ChoresView = lazy(() => import('./modules/plan/ChoresView').then((m) => ({ default: m.ChoresView })));
const GoalsHabitsView = lazy(() => import('./modules/plan/GoalsHabitsView').then((m) => ({ default: m.GoalsHabitsView })));
const NotesView = lazy(() => import('./modules/mind/NotesView').then((m) => ({ default: m.NotesView })));
const ThoughtInboxView = lazy(() => import('./modules/mind/ThoughtInboxView').then((m) => ({ default: m.ThoughtInboxView })));
const DiaryView = lazy(() => import('./modules/mind/DiaryView').then((m) => ({ default: m.DiaryView })));
const LifeEventsView = lazy(() => import('./modules/mind/LifeEventsView').then((m) => ({ default: m.LifeEventsView })));
const TimeSuiteView = lazy(() => import('./modules/time/TimeSuiteView').then((m) => ({ default: m.TimeSuiteView })));
const RecipesView = lazy(() => import('./modules/kitchen/RecipesView').then((m) => ({ default: m.RecipesView })));
const PantryView = lazy(() => import('./modules/kitchen/PantryView').then((m) => ({ default: m.PantryView })));
const MealsView = lazy(() => import('./modules/kitchen/MealsView').then((m) => ({ default: m.MealsView })));
const GroceryView = lazy(() => import('./modules/kitchen/GroceryView').then((m) => ({ default: m.GroceryView })));
const HouseholdHealthView = lazy(() => import('./modules/life/HouseholdHealthView').then((m) => ({ default: m.HouseholdHealthView })));
const FinanceView = lazy(() => import('./modules/life/FinanceView').then((m) => ({ default: m.FinanceView })));
const LearningMediaView = lazy(() => import('./modules/life/LearningMediaView').then((m) => ({ default: m.LearningMediaView })));
const TravelPeopleHomeView = lazy(() => import('./modules/life/TravelPeopleHomeView').then((m) => ({ default: m.TravelPeopleHomeView })));
const StudioExtrasView = lazy(() => import('./modules/life/StudioExtrasView').then((m) => ({ default: m.StudioExtrasView })));
const HistoryView = lazy(() => import('./modules/life/HistoryView').then((m) => ({ default: m.HistoryView })));
const AllInOneView = lazy(() => import('./modules/life/AllInOneView').then((m) => ({ default: m.AllInOneView })));
const GuideView = lazy(() => import('./modules/life/GuideView').then((m) => ({ default: m.GuideView })));
const CustomTabView = lazy(() => import('./modules/life/CustomTabView').then((m) => ({ default: m.CustomTabView })));
const DigitalPlannerView = lazy(() => import('./modules/planner/DigitalPlannerView').then((m) => ({ default: m.DigitalPlannerView })));
const LabWorkspaceView = lazy(() => import('./modules/lab/LabWorkspaceView').then((m) => ({ default: m.LabWorkspaceView })));
const ReportsView = lazy(() => import('./modules/life/ReportsView').then((m) => ({ default: m.ReportsView })));
const CalculatorView = lazy(() => import('./modules/studio/CalculatorView').then((m) => ({ default: m.CalculatorView })));
const SpreadsheetView = lazy(() => import('./modules/studio/SpreadsheetView').then((m) => ({ default: m.SpreadsheetView })));
const PresentationView = lazy(() => import('./modules/studio/PresentationView').then((m) => ({ default: m.PresentationView })));
const ProjectsView = lazy(() => import('./modules/creative/ProjectsView').then((m) => ({ default: m.ProjectsView })));
const GameDevView = lazy(() => import('./modules/creative/GameDevView').then((m) => ({ default: m.GameDevView })));
const BookStudioView = lazy(() => import('./modules/creative/BookStudioView').then((m) => ({ default: m.BookStudioView })));
const KanbanView = lazy(() => import('./modules/studio/KanbanView').then((m) => ({ default: m.KanbanView })));
const WhiteboardView = lazy(() => import('./modules/studio/WhiteboardView').then((m) => ({ default: m.WhiteboardView })));
const CodeStudioView = lazy(() => import('./modules/studio/CodeStudioView').then((m) => ({ default: m.CodeStudioView })));
const PhotoStudioView = lazy(() => import('./modules/studio/PhotoStudioView').then((m) => ({ default: m.PhotoStudioView })));
const DocumentScannerView = lazy(() => import('./modules/studio/DocumentScannerView').then((m) => ({ default: m.DocumentScannerView })));
const PdfStudioView = lazy(() => import('./modules/studio/PdfStudioView').then((m) => ({ default: m.PdfStudioView })));
const FileManagerView = lazy(() => import('./modules/studio/FileManagerView').then((m) => ({ default: m.FileManagerView })));

const ActiveWorkspaceStage: React.FC = () => {
  const { activeView, activeCustomTabId } = useApp();

  if (activeView === 'all_in_one') return <AllInOneView />;
  if (activeView === 'guide') return <GuideView />;
  if (activeView === 'custom_tab') return <CustomTabView tabId={activeCustomTabId} />;
  if (activeView === 'settings') return <SettingsView />;
  if (activeView === 'trash') return <TrashView />;
  if (activeView === 'home') return <HomeDashboard />;
  if (activeView === 'quick_glance') return <QuickGlanceView />;
  if (activeView === 'today') return <TodaySpread renderDecorOverlay={(k) => <DecorCanvasOverlay spreadKey={k} />} />;
  if (activeView === 'digital_planner') return <DigitalPlannerView />;
  if (activeView === 'calendar') return <FlowCalendarView />;
  if (activeView === 'task_calendar') return <TaskCalendarView />;
  if (activeView === 'planner') return <PeriodPlannerView />;
  if (activeView === 'tasks') return <TasksView />;
  if (activeView === 'chores') return <ChoresView />;
  if (activeView === 'history') return <HistoryView />;
  if (activeView === 'reports') return <ReportsView />;
  if (activeView === 'lab') return <LabWorkspaceView />;
  if (activeView === 'calculator') return <CalculatorView />;
  if (activeView === 'spreadsheets') return <SpreadsheetView />;
  if (activeView === 'presentations') return <PresentationView />;
  if (activeView === 'projects') return <ProjectsView />;
  if (activeView === 'game_dev') return <GameDevView />;
  if (activeView === 'book_writing') return <BookStudioView />;
  if (activeView === 'kanban') return <KanbanView />;
  if (activeView === 'whiteboard') return <WhiteboardView />;
  if (activeView === 'code_studio') return <CodeStudioView />;
  if (activeView === 'photo_studio') return <PhotoStudioView />;
  if (activeView === 'scanner') return <DocumentScannerView />;
  if (activeView === 'pdf_studio') return <PdfStudioView />;
  if (activeView === 'files') return <FileManagerView />;
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
        <div className="dp-card">Opening Planaday workspace…</div>
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
          <Suspense fallback={<div className="dp-card" style={{ padding: '1.5rem' }}>Loading Planaday studio…</div>}>
            <ActiveWorkspaceStage />
          </Suspense>
        </main>
      </div>

      <MobileNav />
      <QuickCaptureDialog />
      <GlobalSearchDialog />
      <CommandPalette />
      <OnboardingModal />
      <ToastStack />
      <GlobalAlarmRingModal />
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
