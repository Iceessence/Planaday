import React from 'react';
import {
  Activity,
  AlarmClock,
  BarChart3,
  BookOpen,
  Calendar,
  CalendarDays,
  CheckSquare,
  ChefHat,
  Clock,
  Compass,
  FileText,
  Film,
  Flame,
  Gift,
  HeartHandshake,
  Home,
  Hourglass,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Menu,
  Package,
  Plane,
  Settings,
  ShoppingCart,
  Sparkles,
  Sun,
  Target,
  Timer,
  Trash2,
  Users,
  Utensils,
  Wallet,
  Watch,
  Wrench,
  Zap,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import type { ModuleId, NavView } from '../../core/types';

interface NavEntry {
  view: NavView;
  label: string;
  moduleId?: ModuleId;
  icon: React.ReactNode;
  badgeCount?: number;
}

interface NavGroup {
  id: string;
  label: string;
  tabColor: string;
  items: NavEntry[];
}

export const Sidebar: React.FC<{ collapsed: boolean; onToggleCollapse: () => void }> = ({
  collapsed,
  onToggleCollapse,
}) => {
  const { activeView, setActiveView, isModuleEnabled, trashedRecords, records, logicalToday } = useApp();

  const openTasksCount = records.filter((r) => r.type === 'task' && r.status === 'active').length;
  const dueChoresCount = records.filter(
    (r) =>
      r.type === 'chore' &&
      r.status === 'active' &&
      String((r.payload as { nextDueDate?: string }).nextDueDate ?? '') <= logicalToday
  ).length;

  const groups: NavGroup[] = [
    {
      id: 'plan',
      label: 'Plan',
      tabColor: '#a97434',
      items: [
        { view: 'all_in_one', label: 'All-in-One Scroll', icon: <Layers size={17} /> },
        { view: 'home', label: 'Home', icon: <Home size={17} /> },
        { view: 'today', label: 'Today Spread', icon: <Sun size={17} /> },
        { view: 'planner', label: 'Week / Month / Year', moduleId: 'calendar', icon: <CalendarDays size={17} /> },
        { view: 'calendar', label: 'Flow Calendar', moduleId: 'calendar', icon: <Calendar size={17} /> },
        { view: 'tasks', label: 'Tasks', moduleId: 'tasks', icon: <CheckSquare size={17} />, badgeCount: openTasksCount },
        { view: 'chores', label: 'Chores', moduleId: 'chores', icon: <Sparkles size={17} />, badgeCount: dueChoresCount },
        { view: 'history', label: 'History & Reviews', icon: <BarChart3 size={17} /> },
        { view: 'events', label: 'Life Events', moduleId: 'events', icon: <Gift size={17} /> },
      ],
    },
    {
      id: 'mind',
      label: 'Mind',
      tabColor: '#4f7a65',
      items: [
        { view: 'notes', label: 'Notes & Graph', moduleId: 'notes', icon: <FileText size={17} /> },
        { view: 'thoughts', label: 'Thought Inbox', moduleId: 'thoughts', icon: <Lightbulb size={17} /> },
        { view: 'diary', label: 'Diary & Mood', moduleId: 'diary', icon: <BookOpen size={17} /> },
        { view: 'learning', label: 'Spaced Review', moduleId: 'learning', icon: <Compass size={17} /> },
      ],
    },
    {
      id: 'time',
      label: 'Time',
      tabColor: '#3b6ea5',
      items: [
        { view: 'clock', label: 'Clock & World', moduleId: 'time', icon: <Clock size={17} /> },
        { view: 'alarms', label: 'Smart Alarms', moduleId: 'time', icon: <AlarmClock size={17} /> },
        { view: 'timers', label: 'Timers & Pomodoro', moduleId: 'time', icon: <Timer size={17} /> },
        { view: 'stopwatch', label: 'Stopwatch & Ledger', moduleId: 'time', icon: <Watch size={17} /> },
        { view: 'countdown', label: 'Countdowns', moduleId: 'events', icon: <Hourglass size={17} /> },
      ],
    },
    {
      id: 'kitchen',
      label: 'Kitchen',
      tabColor: '#c96f53',
      items: [
        { view: 'recipes', label: 'Recipes', moduleId: 'kitchen', icon: <ChefHat size={17} /> },
        { view: 'pantry', label: 'Pantry Lots', moduleId: 'kitchen', icon: <Package size={17} /> },
        { view: 'meals', label: 'Meal Planner', moduleId: 'kitchen', icon: <Utensils size={17} /> },
        { view: 'shopping', label: 'Groceries', moduleId: 'kitchen', icon: <ShoppingCart size={17} /> },
      ],
    },
    {
      id: 'life',
      label: 'Life-OS',
      tabColor: '#6b5ca5',
      items: [
        { view: 'goals', label: 'Goals', moduleId: 'goals', icon: <Target size={17} /> },
        { view: 'habits', label: 'Habits & Routines', moduleId: 'habits', icon: <Flame size={17} /> },
        { view: 'household', label: 'Household Fairness', moduleId: 'household', icon: <Users size={17} /> },
        { view: 'people', label: 'People & Gifts', moduleId: 'people', icon: <HeartHandshake size={17} /> },
        { view: 'health', label: 'Health & Meds', moduleId: 'health', icon: <Activity size={17} /> },
        { view: 'finance', label: 'Finance & Bills', moduleId: 'finance', icon: <Wallet size={17} /> },
        { view: 'media', label: 'Media & Hobbies', moduleId: 'media', icon: <Film size={17} /> },
        { view: 'travel', label: 'Travel & Hosting', moduleId: 'travel', icon: <Plane size={17} /> },
        { view: 'home_assets', label: 'Home, Pets & Bins', moduleId: 'home_assets', icon: <Wrench size={17} /> },
      ],
    },
    {
      id: 'studio',
      label: 'Studio',
      tabColor: '#7a6f64',
      items: [
        { view: 'spaces', label: 'Custom Spaces', icon: <Layers size={17} /> },
        { view: 'rituals', label: 'Rituals & Contexts', icon: <LayoutDashboard size={17} /> },
        { view: 'insights', label: 'Insights & Heatmaps', icon: <BarChart3 size={17} /> },
        { view: 'automations', label: 'Automations', icon: <Zap size={17} /> },
        { view: 'trash', label: 'Trash (30d)', icon: <Trash2 size={17} />, badgeCount: trashedRecords.length || undefined },
        { view: 'settings', label: 'Settings & Themes', icon: <Settings size={17} /> },
      ],
    },
  ];

  return (
    <aside className="dp-sidebar" aria-label="Primary Planner Navigation">
      <div className="dp-brand">
        <div className="dp-brand-mark">
          <span className="dp-brand-icon" aria-hidden="true">
            D
          </span>
          {!collapsed && <span>Dayplana</span>}
        </div>
        <button
          type="button"
          className="dp-icon-btn"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={onToggleCollapse}
        >
          <Menu size={17} />
        </button>
      </div>

      {groups.map((group) => {
        const visibleItems = group.items.filter((item) => !item.moduleId || isModuleEnabled(item.moduleId));
        if (visibleItems.length === 0) return null;
        return (
          <div key={group.id} className="dp-nav-group">
            {!collapsed && (
              <div className="dp-nav-group-label">
                <span className="dp-binder-dot" style={{ background: group.tabColor }} />
                <span>{group.label}</span>
              </div>
            )}
            {visibleItems.map((item) => (
              <button
                key={item.view}
                type="button"
                className={`dp-nav-btn ${activeView === item.view ? 'active' : ''}`}
                style={{ '--tab-color': group.tabColor } as React.CSSProperties}
                title={collapsed ? item.label : undefined}
                onClick={() => setActiveView(item.view)}
              >
                {item.icon}
                {!collapsed && <span>{item.label}</span>}
                {!collapsed && item.badgeCount !== undefined && item.badgeCount > 0 && (
                  <span className="dp-nav-count">{item.badgeCount}</span>
                )}
              </button>
            ))}
          </div>
        );
      })}
    </aside>
  );
};
