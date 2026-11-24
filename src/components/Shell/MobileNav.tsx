import React, { useMemo, useState } from 'react';
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
  Feather,
  FileText,
  Film,
  Flame,
  FlaskConical,
  Gift,
  HeartHandshake,
  HelpCircle,
  Home,
  Hourglass,
  Layers,
  LayoutDashboard,
  Lightbulb,
  Menu,
  NotebookPen,
  Package,
  PieChart,
  Plane,
  Plus,
  Redo2,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Sun,
  Target,
  Timer,
  Trash2,
  Undo2,
  Users,
  Utensils,
  Wallet,
  Watch,
  Wrench,
  Zap,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { ModalDialog } from '../Common/ModalDialog';
import type { ModuleId, NavView } from '../../core/types';

const TAB_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  home: { label: 'Home', icon: <Home size={20} /> },
  quick_glance: { label: 'Glance', icon: <Zap size={20} /> },
  today: { label: 'Today', icon: <Sun size={20} /> },
  digital_planner: { label: 'Planner', icon: <NotebookPen size={20} /> },
  calendar: { label: 'Calendar', icon: <Calendar size={20} /> },
  task_calendar: { label: 'Task Cal', icon: <Clock size={20} /> },
  tasks: { label: 'Tasks', icon: <CheckSquare size={20} /> },
  chores: { label: 'Chores', icon: <Sparkles size={20} /> },
  lab: { label: 'Lab', icon: <FlaskConical size={20} /> },
  reports: { label: 'Reports', icon: <PieChart size={20} /> },
  timers: { label: 'Timers', icon: <Timer size={20} /> },
  notes: { label: 'Notes', icon: <FileText size={20} /> },
  recipes: { label: 'Kitchen', icon: <ChefHat size={20} /> },
  all_in_one: { label: 'All', icon: <Layers size={20} /> },
};

interface DrawerGroup {
  title: string;
  color: string;
  items: Array<{ view: NavView; label: string; icon: React.ReactNode; moduleId?: ModuleId }>;
}

const DRAWER_GROUPS: DrawerGroup[] = [
  {
    title: 'Daily Plan',
    color: '#a97434',
    items: [
      { view: 'quick_glance', label: 'Quick Glance', icon: <Zap size={16} />, moduleId: 'quick_glance' },
      { view: 'home', label: 'Home', icon: <Home size={16} /> },
      { view: 'today', label: 'Today Spread', icon: <Sun size={16} /> },
      { view: 'digital_planner', label: 'Physical Planner', icon: <NotebookPen size={16} />, moduleId: 'digital_planner' },
      { view: 'all_in_one', label: 'All-in-One Scroll', icon: <Layers size={16} /> },
      { view: 'calendar', label: 'Flow Calendar', icon: <Calendar size={16} />, moduleId: 'calendar' },
      { view: 'task_calendar', label: 'Task Calendar', icon: <Clock size={16} />, moduleId: 'task_calendar' },
      { view: 'planner', label: 'Week / Month / Year', icon: <CalendarDays size={16} />, moduleId: 'calendar' },
      { view: 'tasks', label: 'Tasks', icon: <CheckSquare size={16} />, moduleId: 'tasks' },
      { view: 'chores', label: 'Chores', icon: <Sparkles size={16} />, moduleId: 'chores' },
      { view: 'history', label: 'History & Reviews', icon: <BarChart3 size={16} /> },
      { view: 'reports', label: 'Reports & Analytics', icon: <PieChart size={16} />, moduleId: 'reports' },
      { view: 'events', label: 'Life Events', icon: <Gift size={16} />, moduleId: 'events' },
    ],
  },
  {
    title: 'Professional / Lab',
    color: '#2f7a78',
    items: [
      { view: 'lab', label: 'Laboratory Management', icon: <FlaskConical size={16} />, moduleId: 'lab' },
    ],
  },
  {
    title: 'Time & Alerts',
    color: '#3b6ea5',
    items: [
      { view: 'timers', label: 'Timers & Audio', icon: <Timer size={16} />, moduleId: 'time' },
      { view: 'alarms', label: 'Smart Alarms', icon: <AlarmClock size={16} />, moduleId: 'time' },
      { view: 'stopwatch', label: 'Stopwatch', icon: <Watch size={16} />, moduleId: 'time' },
      { view: 'clock', label: 'Clock & World', icon: <Clock size={16} />, moduleId: 'time' },
      { view: 'countdown', label: 'Countdowns', icon: <Hourglass size={16} />, moduleId: 'events' },
    ],
  },
  {
    title: 'Mind & Writing',
    color: '#4f7a65',
    items: [
      { view: 'notes', label: 'Notes & Graph', icon: <FileText size={16} />, moduleId: 'notes' },
      { view: 'thoughts', label: 'Thought Inbox', icon: <Lightbulb size={16} />, moduleId: 'thoughts' },
      { view: 'diary', label: 'Diary & Mood', icon: <BookOpen size={16} />, moduleId: 'diary' },
      { view: 'learning', label: 'Spaced Review', icon: <Compass size={16} />, moduleId: 'learning' },
    ],
  },
  {
    title: 'Kitchen OS',
    color: '#c96f53',
    items: [
      { view: 'recipes', label: 'Recipes', icon: <ChefHat size={16} />, moduleId: 'kitchen' },
      { view: 'meals', label: 'Meal Planner', icon: <Utensils size={16} />, moduleId: 'kitchen' },
      { view: 'shopping', label: 'Groceries', icon: <ShoppingCart size={16} />, moduleId: 'kitchen' },
      { view: 'pantry', label: 'Pantry Lots', icon: <Package size={16} />, moduleId: 'kitchen' },
    ],
  },
  {
    title: 'Life-OS',
    color: '#6b5ca5',
    items: [
      { view: 'goals', label: 'Goals', icon: <Target size={16} />, moduleId: 'goals' },
      { view: 'habits', label: 'Habits & Routines', icon: <Flame size={16} />, moduleId: 'habits' },
      { view: 'health', label: 'Health & Meds', icon: <Activity size={16} />, moduleId: 'health' },
      { view: 'finance', label: 'Finance & Bills', icon: <Wallet size={16} />, moduleId: 'finance' },
      { view: 'household', label: 'Household', icon: <Users size={16} />, moduleId: 'household' },
      { view: 'people', label: 'People & Gifts', icon: <HeartHandshake size={16} />, moduleId: 'people' },
      { view: 'media', label: 'Media & Hobbies', icon: <Film size={16} />, moduleId: 'media' },
      { view: 'travel', label: 'Travel & Hosting', icon: <Plane size={16} />, moduleId: 'travel' },
      { view: 'home_assets', label: 'Home & Storage', icon: <Wrench size={16} />, moduleId: 'home_assets' },
    ],
  },
  {
    title: 'Studio & Help',
    color: '#7a6f64',
    items: [
      { view: 'guide', label: 'Guide & Help', icon: <HelpCircle size={16} /> },
      { view: 'settings', label: 'Settings & Sync', icon: <Settings size={16} /> },
      { view: 'spaces', label: 'Custom Spaces', icon: <Layers size={16} /> },
      { view: 'rituals', label: 'Rituals & Modes', icon: <LayoutDashboard size={16} /> },
      { view: 'insights', label: 'Insights', icon: <BarChart3 size={16} /> },
      { view: 'automations', label: 'Automations', icon: <Zap size={16} /> },
      { view: 'trash', label: 'Trash (30d)', icon: <Trash2 size={16} /> },
    ],
  },
];

export const MobileNav: React.FC = () => {
  const {
    activeView,
    setActiveView,
    openCustomTab,
    settings,
    patchSettings,
    isModuleEnabled,
    setQuickCaptureOpen,
    mobileMenuOpen,
    setMobileMenuOpen,
    setZenOpen,
    undo,
    redo,
    pushToast,
  } = useApp();
  const [menuQuery, setMenuQuery] = useState('');
  const [newTabName, setNewTabName] = useState('');

  const primaryTabs = settings.mobilePrimaryTabs.slice(0, 4);

  const filteredGroups = useMemo(() => {
    const q = menuQuery.trim().toLowerCase();
    return DRAWER_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (it) =>
          (!it.moduleId || isModuleEnabled(it.moduleId)) &&
          (!q || it.label.toLowerCase().includes(q) || g.title.toLowerCase().includes(q))
      ),
    })).filter((g) => g.items.length > 0);
  }, [menuQuery, isModuleEnabled]);

  const navigate = (v: NavView) => {
    setActiveView(v);
    setMobileMenuOpen(false);
    setMenuQuery('');
  };

  return (
    <>
      <button
        type="button"
        className="dp-mobile-fab"
        aria-label="Quick Capture"
        onClick={() => setQuickCaptureOpen(true)}
      >
        <Plus size={26} />
      </button>

      <nav className="dp-mobile-nav" aria-label="Mobile Primary Tabs">
        {primaryTabs.map((view) => {
          const meta = TAB_LABELS[view] ?? { label: view, icon: <Sun size={20} /> };
          const isActive = activeView === view;
          return (
            <button
              key={view}
              type="button"
              className={`dp-mobile-tab ${isActive ? 'active' : ''}`}
              onClick={() => navigate(view)}
            >
              <span className="dp-mobile-tab-pill">{meta.icon}</span>
              <span>{meta.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`dp-mobile-tab ${mobileMenuOpen ? 'active' : ''}`}
          onClick={() => setMobileMenuOpen(true)}
        >
          <span className="dp-mobile-tab-pill">
            <Menu size={20} />
          </span>
          <span>Menu</span>
        </button>
      </nav>

      {/* Rich Native-Feeling Categorized Mobile App Drawer */}
      <ModalDialog open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} title={`${settings.plannerTitle} Navigation`} sheet>
        <div className="dp-stack" style={{ gap: 14 }}>
          {/* Quick Search inside Drawer */}
          <div className="dp-row">
            <Search size={16} className="dp-muted" />
            <input
              className="dp-input"
              style={{ flex: 1 }}
              placeholder="Jump to any module (e.g. Meds, Chores, Notes, Budget)…"
              value={menuQuery}
              onChange={(e) => setMenuQuery(e.target.value)}
            />
          </div>

          {/* Workspace & Family Profile Switchers right in mobile drawer */}
          {!menuQuery && (
            <div className="dp-grid-2" style={{ gap: 8 }}>
              <label className="dp-stack" style={{ gap: 3 }}>
                <span className="dp-muted" style={{ fontSize: '0.74rem' }}>Workspace</span>
                <select
                  className="dp-select"
                  value={settings.activeWorkspaceId}
                  onChange={(e) => void patchSettings({ activeWorkspaceId: e.target.value })}
                >
                  {settings.workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>{ws.emoji} {ws.name}</option>
                  ))}
                </select>
              </label>
              <label className="dp-stack" style={{ gap: 3 }}>
                <span className="dp-muted" style={{ fontSize: '0.74rem' }}>Family Profile</span>
                <select
                  className="dp-select"
                  value={settings.activeProfileId}
                  onChange={(e) => void patchSettings({ activeProfileId: e.target.value })}
                >
                  <option value="all">🏡 Everyone (Family)</option>
                  {settings.familyProfiles.map((prof) => (
                    <option key={prof.id} value={prof.id}>{prof.emoji} {prof.name}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* Quick Utility Pills */}
          {!menuQuery && (
            <div className="dp-row" style={{ gap: 6 }}>
              <button
                type="button"
                className={`dp-btn dp-btn-sm ${settings.lowEnergyMode ? 'dp-btn-primary' : ''}`}
                onClick={() => void patchSettings({ lowEnergyMode: !settings.lowEnergyMode })}
              >
                <Sparkles size={13} /> {settings.lowEnergyMode ? 'Calm On' : 'Calm Mode'}
              </button>
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setZenOpen(true);
                }}
              >
                <Feather size={13} /> Zen Sheet
              </button>
              <button type="button" className="dp-btn dp-btn-sm" onClick={() => void undo()}>
                <Undo2 size={13} /> Undo
              </button>
              <button type="button" className="dp-btn dp-btn-sm" onClick={() => void redo()}>
                <Redo2 size={13} /> Redo
              </button>
            </div>
          )}

          {/* My Custom Tabs */}
          {!menuQuery && (
            <div className="dp-stack" style={{ gap: 6 }}>
              <strong style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--dp-muted)' }}>
                My Custom Tabs
              </strong>
              <div className="dp-grid-2" style={{ gap: 8 }}>
                {settings.customTabs.map((ct) => (
                  <button
                    key={ct.id}
                    type="button"
                    className="dp-btn"
                    style={{ justifyContent: 'flex-start', borderInlineStart: `4px solid ${ct.color}`, minHeight: 44 }}
                    onClick={() => {
                      openCustomTab(ct.id);
                      setMobileMenuOpen(false);
                    }}
                  >
                    <span>{ct.emoji}</span>
                    <span>{ct.name}</span>
                  </button>
                ))}
              </div>
              <form
                className="dp-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  const nm = newTabName.trim();
                  if (!nm) return;
                  const id = `ctab_${Date.now().toString(36)}`;
                  void patchSettings({
                    customTabs: [
                      ...settings.customTabs,
                      {
                        id,
                        name: nm,
                        emoji: '✨',
                        color: '#a97434',
                        layout: 'single',
                        widgets: [
                          { id: `wid_${Date.now().toString(36)}_t`, type: 'tasks', title: `${nm} Tasks` },
                          { id: `wid_${Date.now().toString(36)}_n`, type: 'note', title: `${nm} Notes`, noteContent: '' },
                        ],
                      },
                    ],
                  });
                  setNewTabName('');
                  openCustomTab(id);
                  setMobileMenuOpen(false);
                  pushToast(`Created custom tab "${nm}"!`);
                }}
              >
                <input
                  className="dp-input"
                  style={{ flex: 1 }}
                  placeholder="+ Create new custom tab…"
                  value={newTabName}
                  onChange={(e) => setNewTabName(e.target.value)}
                />
                <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">Add</button>
              </form>
            </div>
          )}

          {/* Categorized Native App Tiles */}
          {filteredGroups.map((group) => (
            <div key={group.title} className="dp-stack" style={{ gap: 6 }}>
              <div className="dp-row" style={{ gap: 6 }}>
                <span className="dp-binder-dot" style={{ background: group.color }} />
                <strong style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--dp-muted)' }}>
                  {group.title}
                </strong>
              </div>
              <div className="dp-grid-2" style={{ gap: 8 }}>
                {group.items.map((item) => (
                  <button
                    key={item.view}
                    type="button"
                    className={`dp-btn ${activeView === item.view ? 'dp-btn-primary' : ''}`}
                    style={{
                      justifyContent: 'flex-start',
                      minHeight: 44,
                      borderInlineStart: activeView === item.view ? undefined : `3px solid ${group.color}`,
                    }}
                    onClick={() => navigate(item.view)}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ModalDialog>
    </>
  );
};
