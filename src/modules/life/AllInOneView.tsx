import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, Layers } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { TodaySpread } from '../plan/TodaySpread';
import { HomeDashboard } from '../plan/HomeDashboard';
import { FlowCalendarView } from '../plan/FlowCalendarView';
import { PeriodPlannerView } from '../plan/PeriodPlannerView';
import { TasksView } from '../plan/TasksView';
import { ChoresView } from '../plan/ChoresView';
import { GoalsHabitsView } from '../plan/GoalsHabitsView';
import { NotesView } from '../mind/NotesView';
import { ThoughtInboxView } from '../mind/ThoughtInboxView';
import { DiaryView } from '../mind/DiaryView';
import { LifeEventsView } from '../mind/LifeEventsView';
import { TimeSuiteView } from '../time/TimeSuiteView';
import { RecipesView } from '../kitchen/RecipesView';
import { PantryView } from '../kitchen/PantryView';
import { MealsView } from '../kitchen/MealsView';
import { GroceryView } from '../kitchen/GroceryView';
import { HouseholdHealthView } from './HouseholdHealthView';
import { FinanceView } from './FinanceView';
import { LearningMediaView } from './LearningMediaView';
import { TravelPeopleHomeView } from './TravelPeopleHomeView';
import { StudioExtrasView } from './StudioExtrasView';
import { HistoryView } from './HistoryView';
import { DecorCanvasOverlay } from '../../components/Decor/DecorCanvas';
import type { ModuleId, NavView } from '../../core/types';

interface ScrollSectionDef {
  id: string;
  view: NavView;
  label: string;
  moduleId?: ModuleId;
  render: () => React.ReactNode;
}

/**
 * All-in-One Scroll View: Every single enabled tab stacked on one continuous scrollable page
 * with a sticky quick-jump pill bar and individual collapse/expand controls.
 */
export const AllInOneView: React.FC = () => {
  const { isModuleEnabled, setActiveView } = useApp();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const allSections: ScrollSectionDef[] = [
    { id: 'sec-today', view: 'today', label: 'Today Spread', render: () => <TodaySpread renderDecorOverlay={(k) => <DecorCanvasOverlay spreadKey={k} />} /> },
    { id: 'sec-home', view: 'home', label: 'Home Overview', render: () => <HomeDashboard /> },
    { id: 'sec-calendar', view: 'calendar', label: 'Flow Calendar', moduleId: 'calendar', render: () => <FlowCalendarView /> },
    { id: 'sec-planner', view: 'planner', label: 'Week / Month / Year', moduleId: 'calendar', render: () => <PeriodPlannerView /> },
    { id: 'sec-tasks', view: 'tasks', label: 'Tasks', moduleId: 'tasks', render: () => <TasksView /> },
    { id: 'sec-chores', view: 'chores', label: 'Chores', moduleId: 'chores', render: () => <ChoresView /> },
    { id: 'sec-history', view: 'history', label: 'History & Reviews', render: () => <HistoryView /> },
    { id: 'sec-events', view: 'events', label: 'Life Events & Countdowns', moduleId: 'events', render: () => <LifeEventsView initialTab="occasions" /> },
    { id: 'sec-notes', view: 'notes', label: 'Notes & Graph', moduleId: 'notes', render: () => <NotesView /> },
    { id: 'sec-thoughts', view: 'thoughts', label: 'Thought Inbox', moduleId: 'thoughts', render: () => <ThoughtInboxView /> },
    { id: 'sec-diary', view: 'diary', label: 'Diary & Mood', moduleId: 'diary', render: () => <DiaryView /> },
    { id: 'sec-time', view: 'timers', label: 'Time Suite (Clock / Alarms / Timers / Stopwatch)', moduleId: 'time', render: () => <TimeSuiteView initialTab="timers" /> },
    { id: 'sec-recipes', view: 'recipes', label: 'Recipes', moduleId: 'kitchen', render: () => <RecipesView /> },
    { id: 'sec-pantry', view: 'pantry', label: 'Pantry Lots', moduleId: 'kitchen', render: () => <PantryView /> },
    { id: 'sec-meals', view: 'meals', label: 'Meal Planner', moduleId: 'kitchen', render: () => <MealsView /> },
    { id: 'sec-shopping', view: 'shopping', label: 'Groceries', moduleId: 'kitchen', render: () => <GroceryView /> },
    { id: 'sec-goals', view: 'goals', label: 'Goals', moduleId: 'goals', render: () => <GoalsHabitsView mode="goals" /> },
    { id: 'sec-habits', view: 'habits', label: 'Habits & Routines', moduleId: 'habits', render: () => <GoalsHabitsView mode="habits" /> },
    { id: 'sec-household', view: 'household', label: 'Household Fairness', moduleId: 'household', render: () => <HouseholdHealthView mode="household" /> },
    { id: 'sec-people', view: 'people', label: 'People & Gifts', moduleId: 'people', render: () => <TravelPeopleHomeView mode="people" /> },
    { id: 'sec-health', view: 'health', label: 'Health & Meds', moduleId: 'health', render: () => <HouseholdHealthView mode="health" /> },
    { id: 'sec-finance', view: 'finance', label: 'Finance & Bills', moduleId: 'finance', render: () => <FinanceView /> },
    { id: 'sec-learning', view: 'learning', label: 'Spaced Review', moduleId: 'learning', render: () => <LearningMediaView mode="learning" /> },
    { id: 'sec-media', view: 'media', label: 'Media & Hobbies', moduleId: 'media', render: () => <LearningMediaView mode="media" /> },
    { id: 'sec-travel', view: 'travel', label: 'Travel & Hosting', moduleId: 'travel', render: () => <TravelPeopleHomeView mode="travel" /> },
    { id: 'sec-home-assets', view: 'home_assets', label: 'Home Assets & Storage Bins', moduleId: 'home_assets', render: () => <TravelPeopleHomeView mode="home_assets" /> },
    { id: 'sec-spaces', view: 'spaces', label: 'Custom Spaces', render: () => <StudioExtrasView mode="spaces" /> },
    { id: 'sec-rituals', view: 'rituals', label: 'Rituals & Context Modes', render: () => <StudioExtrasView mode="rituals" /> },
    { id: 'sec-insights', view: 'insights', label: 'Insights & Heatmaps', render: () => <StudioExtrasView mode="insights" /> },
    { id: 'sec-automations', view: 'automations', label: 'Automations & AI', render: () => <StudioExtrasView mode="automations" /> },
  ];

  const visibleSections = allSections.filter((s) => !s.moduleId || isModuleEnabled(s.moduleId));

  const toggleAll = (collapseAll: boolean) => {
    const next: Record<string, boolean> = {};
    for (const s of visibleSections) next[s.id] = collapseAll;
    setCollapsed(next);
  };

  return (
    <div className="dp-stack" style={{ gap: 20 }}>
      {/* Sticky Quick-Jump Bar */}
      <div
        className="dp-card dp-stack dp-no-print"
        style={{ position: 'sticky', top: 56, zIndex: 12, padding: 12, gap: 8 }}
      >
        <div className="dp-between">
          <strong className="dp-row">
            <Layers size={16} /> All-in-One Scroll ({visibleSections.length} tabs on one page)
          </strong>
          <div className="dp-row" style={{ gap: 6 }}>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => toggleAll(false)}>
              Expand All
            </button>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => toggleAll(true)}>
              Collapse All
            </button>
          </div>
        </div>
        <div className="dp-row" style={{ gap: 5, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2 }}>
          {visibleSections.map((s) => (
            <button
              key={s.id}
              type="button"
              className="dp-btn dp-btn-sm"
              style={{ whiteSpace: 'nowrap' }}
              onClick={() => {
                setCollapsed((p) => ({ ...p, [s.id]: false }));
                requestAnimationFrame(() => {
                  document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stacked Live Modules */}
      {visibleSections.map((sec) => {
        const isClosed = Boolean(collapsed[sec.id]);
        return (
          <section key={sec.id} id={sec.id} style={{ scrollMarginTop: 148 }} className="dp-stack">
            <div className="dp-between" style={{ padding: '4px 6px' }}>
              <button
                type="button"
                className="dp-btn dp-btn-ghost"
                style={{ fontFamily: 'var(--dp-font-heading)', fontSize: '1.1rem', fontWeight: 700, padding: '2px 6px' }}
                onClick={() => setCollapsed((p) => ({ ...p, [sec.id]: !p[sec.id] }))}
              >
                {isClosed ? <ChevronRight size={17} /> : <ChevronDown size={17} />}
                {sec.label}
              </button>
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={() => setActiveView(sec.view)}
              >
                <ExternalLink size={13} /> Open Dedicated Tab
              </button>
            </div>
            {!isClosed && sec.render()}
          </section>
        );
      })}
    </div>
  );
};
