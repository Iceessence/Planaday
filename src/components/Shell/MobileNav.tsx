import React, { useState } from 'react';
import {
  Calendar,
  CheckSquare,
  ChefHat,
  MoreHorizontal,
  Plus,
  Sun,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { ModalDialog } from '../Common/ModalDialog';
import type { NavView } from '../../core/types';

const TAB_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  home: { label: 'Home', icon: <Sun size={18} /> },
  today: { label: 'Today', icon: <Sun size={18} /> },
  calendar: { label: 'Calendar', icon: <Calendar size={18} /> },
  tasks: { label: 'Tasks', icon: <CheckSquare size={18} /> },
  recipes: { label: 'Kitchen', icon: <ChefHat size={18} /> },
};

const ALL_MORE_VIEWS: Array<[NavView, string]> = [
  ['all_in_one', 'All-in-One Scroll (Every Tab)'],
  ['home', 'Home Dashboard'],
  ['planner', 'Week / Month / Year'],
  ['chores', 'Chores'],
  ['history', 'History & Reviews'],
  ['notes', 'Notes & Graph'],
  ['thoughts', 'Thought Inbox'],
  ['diary', 'Diary & Reflection'],
  ['events', 'Life Events & Birthdays'],
  ['clock', 'Clock & World Slider'],
  ['alarms', 'Smart Alarms'],
  ['timers', 'Timers & Pomodoro'],
  ['stopwatch', 'Stopwatch & Ledger'],
  ['pantry', 'Pantry Lots'],
  ['meals', 'Meal Planner'],
  ['shopping', 'Groceries'],
  ['goals', 'Goals'],
  ['habits', 'Habits'],
  ['household', 'Household Fairness'],
  ['health', 'Health & Meds'],
  ['finance', 'Finance & Bills'],
  ['learning', 'Spaced Review'],
  ['media', 'Media & Hobbies'],
  ['travel', 'Travel & Hosting'],
  ['people', 'People & Gifts'],
  ['home_assets', 'Home & Storage Bins'],
  ['spaces', 'Custom Spaces'],
  ['rituals', 'Rituals & Contexts'],
  ['insights', 'Insights'],
  ['automations', 'Automations'],
  ['trash', 'Trash (30d)'],
  ['settings', 'Settings & Themes'],
];

export const MobileNav: React.FC = () => {
  const { activeView, setActiveView, settings, setQuickCaptureOpen } = useApp();
  const [moreOpen, setMoreOpen] = useState(false);

  const primaryTabs = settings.mobilePrimaryTabs.slice(0, 4);

  return (
    <>
      <button
        type="button"
        className="dp-mobile-fab"
        aria-label="Quick Capture"
        onClick={() => setQuickCaptureOpen(true)}
      >
        <Plus size={24} />
      </button>

      <nav className="dp-mobile-nav" aria-label="Mobile Primary Tabs">
        {primaryTabs.map((view) => {
          const meta = TAB_LABELS[view] ?? { label: view, icon: <Sun size={18} /> };
          return (
            <button
              key={view}
              type="button"
              className={`dp-mobile-tab ${activeView === view ? 'active' : ''}`}
              onClick={() => setActiveView(view)}
            >
              {meta.icon}
              <span>{meta.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`dp-mobile-tab ${moreOpen ? 'active' : ''}`}
          onClick={() => setMoreOpen(true)}
        >
          <MoreHorizontal size={18} />
          <span>More</span>
        </button>
      </nav>

      <ModalDialog open={moreOpen} onClose={() => setMoreOpen(false)} title="All Planner Modules" sheet>
        <div className="dp-grid-2" style={{ gap: 8 }}>
          {ALL_MORE_VIEWS.map(([v, label]) => (
            <button
              key={v}
              type="button"
              className={`dp-btn ${activeView === v ? 'dp-btn-primary' : ''}`}
              style={{ justifyContent: 'flex-start' }}
              onClick={() => {
                setActiveView(v);
                setMoreOpen(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </ModalDialog>
    </>
  );
};
