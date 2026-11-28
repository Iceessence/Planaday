import React from 'react';
import {
  Activity,
  AlarmClock,
  BarChart3,
  BookOpen,
  Calculator,
  Calendar,
  CalendarDays,
  Camera,
  CheckSquare,
  ChefHat,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Columns3,
  Compass,
  FileSpreadsheet,
  FileText,
  Film,
  Flame,
  FlaskConical,
  Folder,
  FolderKanban,
  Gamepad2,
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
  PenTool,
  PieChart,
  Plane,
  Plus,
  Presentation,
  ScanLine,
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

export const Sidebar: React.FC<{ collapsed: boolean; onToggleCollapse: () => void }> = React.memo(({
  collapsed,
  onToggleCollapse,
}) => {
  const {
    settings,
    patchSettings,
    activeView,
    setActiveView,
    activeCustomTabId,
    openCustomTab,
    isModuleEnabled,
    trashedRecords,
    records,
    logicalToday,
    pushToast,
  } = useApp();
  const [quickAddTabOpen, setQuickAddTabOpen] = React.useState(false);
  const [newTabTitle, setNewTabTitle] = React.useState('');

  const [creating, setCreating] = React.useState(false);
  const creatingRef = React.useRef(false);
  const { openTasksCount, dueChoresCount } = React.useMemo(() => {
    let openTasksCount = 0, dueChoresCount = 0;
    for (const r of records) {
      if (r.status !== 'active') continue;
      if (r.type === 'task') openTasksCount++;
      if (r.type === 'chore') {
        const due = (r.payload as { nextDueDate?: string }).nextDueDate;
        if (due && due <= logicalToday) dueChoresCount++;
      }
    }
    return { openTasksCount, dueChoresCount };
  }, [records, logicalToday]);

  const groups = React.useMemo<NavGroup[]>(() => [
    {
      id: 'plan',
      label: 'Plan',
      tabColor: '#a97434',
      items: [
        { view: 'all_in_one', label: 'All-in-One Scroll', icon: <Layers size={17} /> },
        { view: 'quick_glance', label: 'Quick Glance', moduleId: 'quick_glance', icon: <Zap size={17} /> },
        { view: 'home', label: 'Home', icon: <Home size={17} /> },
        { view: 'today', label: 'Today Spread', icon: <Sun size={17} /> },
        { view: 'digital_planner', label: 'Physical Planner', moduleId: 'digital_planner', icon: <NotebookPen size={17} /> },
        { view: 'planner', label: 'Week / Month / Year', moduleId: 'calendar', icon: <CalendarDays size={17} /> },
        { view: 'calendar', label: 'Flow Calendar', moduleId: 'calendar', icon: <Calendar size={17} /> },
        { view: 'task_calendar', label: 'Task Calendar', moduleId: 'task_calendar', icon: <Clock size={17} /> },
        { view: 'tasks', label: 'Tasks', moduleId: 'tasks', icon: <CheckSquare size={17} />, badgeCount: openTasksCount },
        { view: 'chores', label: 'Chores', moduleId: 'chores', icon: <Sparkles size={17} />, badgeCount: dueChoresCount },
        { view: 'history', label: 'History & Reviews', icon: <BarChart3 size={17} /> },
        { view: 'reports', label: 'Reports & Analytics', moduleId: 'reports', icon: <PieChart size={17} /> },
        { view: 'events', label: 'Life Events', moduleId: 'events', icon: <Gift size={17} /> },
      ],
    },
    {
      id: 'professional',
      label: 'Laboratory',
      tabColor: '#2f7a78',
      items: [
        { view: 'lab', label: 'Lab Management', moduleId: 'lab', icon: <FlaskConical size={17} /> },
      ],
    },
    {
      id: 'create_suite',
      label: 'Create & Math',
      tabColor: '#2b5f8c',
      items: [
        { view: 'calculator', label: 'Calculator & Graph', moduleId: 'calculator', icon: <Calculator size={17} /> },
        { view: 'spreadsheets', label: 'Spreadsheets', moduleId: 'spreadsheets', icon: <FileSpreadsheet size={17} /> },
        { view: 'presentations', label: 'Presentations', moduleId: 'presentations', icon: <Presentation size={17} /> },
        { view: 'kanban', label: 'Kanban Boards', moduleId: 'kanban', icon: <Columns3 size={17} /> },
        { view: 'whiteboard', label: 'Whiteboard Canvas', moduleId: 'whiteboard', icon: <PenTool size={17} /> },
        { view: 'projects', label: 'Projects & Records', moduleId: 'projects', icon: <FolderKanban size={17} /> },
        { view: 'game_dev', label: 'Game Dev Studio', moduleId: 'game_dev', icon: <Gamepad2 size={17} /> },
        { view: 'book_writing', label: 'Book Studio', moduleId: 'book_writing', icon: <BookOpen size={17} /> },
        { view: 'code_studio', label: 'Code Sandbox', moduleId: 'code_studio', icon: <Code2 size={17} /> },
        { view: 'photo_studio', label: 'Camera & Photos', moduleId: 'photo_studio', icon: <Camera size={17} /> },
        { view: 'scanner', label: 'Note Scanner & OCR', moduleId: 'scanner', icon: <ScanLine size={17} /> },
        { view: 'pdf_studio', label: 'PDF Reader & Editor', moduleId: 'pdf_studio', icon: <FileText size={17} /> },
        { view: 'files', label: 'Universal Files', moduleId: 'files', icon: <Folder size={17} /> },
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
        { view: 'guide', label: 'Guide & Help', icon: <HelpCircle size={17} /> },
        { view: 'trash', label: 'Trash (30d)', icon: <Trash2 size={17} />, badgeCount: trashedRecords.length || undefined },
        { view: 'settings', label: 'Settings & Themes', icon: <Settings size={17} /> },
      ],
    },
  ], [openTasksCount, dueChoresCount, trashedRecords.length]);
  const visibleGroups = React.useMemo(() => groups.map((group) => ({ ...group, items: group.items.filter((item) =>
    (!item.moduleId || isModuleEnabled(item.moduleId)) && !settings.hiddenSidebarViews.includes(item.view))
  })).filter((group) => group.items.length), [groups, isModuleEnabled, settings.enabledModules, settings.hiddenSidebarViews]);

  return (
    <aside className="dp-sidebar" aria-label="Primary Planner Navigation">
      <div className="dp-brand">
        <div className="dp-brand-mark">
          <span className="dp-brand-icon" aria-hidden="true">
            {(settings.plannerTitle || 'P').charAt(0).toUpperCase()}
          </span>
          {!collapsed && <span>{settings.plannerTitle || 'Planaday'}</span>}
        </div>
        <button
          type="button"
          className="dp-icon-btn"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          onClick={onToggleCollapse}
        >
          <Menu size={17} />
        </button>
      </div>

      {/* User-Created Custom Sidebar Tabs */}
      <div className="dp-nav-group">
        {!collapsed && (
          <div className="dp-nav-group-label" style={{ justifyContent: 'space-between' }}>
            <span className="dp-row" style={{ gap: 6 }}>
              <span className="dp-binder-dot" style={{ background: 'var(--dp-accent)' }} />
              <span>My Custom Tabs</span>
            </span>
            <button
              type="button"
              className="dp-icon-btn"
              style={{ width: 20, height: 20 }}
              title="Create a brand-new custom sidebar tab"
              aria-label="New Custom Tab"
              aria-expanded={quickAddTabOpen}
              onClick={() => setQuickAddTabOpen((v) => !v)}
            >
              <Plus size={12} />
            </button>
          </div>
        )}
        {quickAddTabOpen && !collapsed && (
          <form
            className="dp-row"
            style={{ padding: '4px 6px', gap: 4 }}
            onSubmit={async (e) => {
              e.preventDefault();
              const nm = newTabTitle.trim();
              if (!nm || creatingRef.current) return;
              creatingRef.current = true; setCreating(true);
              try {
              const id = `ctab_${Date.now().toString(36)}`;
              await patchSettings({
                customTabs: [
                  ...settings.customTabs,
                  {
                    id,
                    name: nm,
                    emoji: '✨',
                    color: '#a97434',
                    layout: 'grid',
                    widgets: [
                      { id: `wid_${Date.now().toString(36)}_t`, type: 'tasks', title: `${nm} Tasks` },
                      { id: `wid_${Date.now().toString(36)}_n`, type: 'note', title: `${nm} Notes`, noteContent: '' },
                    ],
                  },
                ],
              });
              setNewTabTitle('');
              setQuickAddTabOpen(false);
              openCustomTab(id);
              pushToast(`Created custom tab "${nm}"!`);
              } catch { pushToast('Could not create tab. Please try again.', { tone: 'warn' }); }
              finally { creatingRef.current = false; setCreating(false); }
            }}
          >
            <input
              autoFocus
              className="dp-input"
              style={{ flex: 1, padding: '3px 6px', fontSize: '0.78rem' }}
              aria-label="New custom tab name"
              placeholder="Tab name…"
              value={newTabTitle}
              onChange={(e) => setNewTabTitle(e.target.value)}
            />
            <button type="submit" disabled={creating || !newTabTitle.trim()} className="dp-btn dp-btn-primary dp-btn-sm" style={{ padding: '2px 6px' }}>
              {creating ? 'Adding…' : 'Add'}
            </button>
          </form>
        )}
        {settings.customTabs.map((ct) => (
          <button
            key={ct.id}
            type="button"
            className={`dp-nav-btn ${activeView === 'custom_tab' && activeCustomTabId === ct.id ? 'active' : ''}`}
            style={{ '--tab-color': ct.color } as React.CSSProperties}
            title={collapsed ? ct.name : undefined}
            aria-label={ct.name}
            aria-current={activeView === 'custom_tab' && activeCustomTabId === ct.id ? 'page' : undefined}
            onClick={() => openCustomTab(ct.id)}
          >
            <span style={{ fontSize: '1rem', lineHeight: 1 }}>{ct.emoji}</span>
            {!collapsed && <span>{ct.name}</span>}
          </button>
        ))}
      </div>

      {visibleGroups.map((group) => {
        const visibleItems = group.items;
        const isGroupCollapsed = !collapsed && (settings.collapsedSidebarGroups ?? []).includes(group.id);
        return (
          <div key={group.id} className="dp-nav-group">
            {!collapsed && (
              <button
                type="button"
                className="dp-nav-group-label"
                aria-expanded={!isGroupCollapsed}
                style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', justifyContent: 'space-between', padding: '4px 8px' }}
                onClick={() => {
                  const cur = settings.collapsedSidebarGroups ?? [];
                  const next = cur.includes(group.id) ? cur.filter((x) => x !== group.id) : [...cur, group.id];
                  void patchSettings({ collapsedSidebarGroups: next });
                }}
              >
                <span className="dp-row" style={{ gap: 6 }}>
                  <span className="dp-binder-dot" style={{ background: group.tabColor }} />
                  <span>{group.label}</span>
                </span>
                {isGroupCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </button>
            )}
            {!isGroupCollapsed &&
              visibleItems.map((item) => (
                <button
                  key={item.view}
                  type="button"
                  className={`dp-nav-btn ${activeView === item.view ? 'active' : ''}`}
                  style={{ '--tab-color': group.tabColor } as React.CSSProperties}
                  title={collapsed ? item.label : undefined}
                  aria-label={item.badgeCount ? `${item.label}, ${item.badgeCount}` : item.label}
                  aria-current={activeView === item.view ? 'page' : undefined}
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
});
