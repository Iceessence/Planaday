import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  Layers,
  Maximize2,
  Minimize2,
  Play,
  Plus,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createId } from '../../core/db';
import { createRecord } from '../../core/repository';
import { completeActionAtomically, minutesToTime } from '../../core/planActions';
import { formatTimeDisplay } from '../../core/temporal';
import { ALARM_RINGTONES } from '../../core/audio';
import { computeNextAlarmTrigger, normalizeAlarmPayload } from '../../core/alarmSchedule';
import { WeatherCard } from '../../components/Common/WeatherCard';
import type {
  CalendarEventPayload,
  ChorePayload,
  CustomTabDef,
  CustomTabWidget,
  CustomWidgetType,
  HabitPayload,
  LifeRecord,
  NavView,
  TaskPayload,
} from '../../core/types';

const WIDGET_TYPES: Array<{ type: CustomWidgetType; emoji: string; label: string; desc: string }> = [
  { type: 'timers', emoji: '⏱️', label: 'Custom Timers', desc: 'Pick exact timers (min + sec & sound) for 1-tap start' },
  { type: 'links', emoji: '🚀', label: 'Tab Launcher & Links', desc: 'Open any specific Dayplana tab, custom tab, or website in 1 tap' },
  { type: 'events', emoji: '📅', label: 'Events Feed', desc: 'Upcoming events filtered by category or shared/important' },
  { type: 'tasks', emoji: '✅', label: 'Task Checklist', desc: 'Interactive tasks filtered by tag/priority with quick-add' },
  { type: 'chores', emoji: '🧹', label: 'Chores Block', desc: 'Room chores with 1-click Done Today' },
  { type: 'alarms', emoji: '⏰', label: 'Quick Alarms', desc: 'View, toggle, or test-ring your scheduled alarms right here' },
  { type: 'habits', emoji: '🔥', label: 'Habits Strip', desc: 'Check off daily habits directly from this tab' },
  { type: 'counters', emoji: '🔢', label: 'Custom Trackers', desc: 'Counters with units, targets & custom +/- steps' },
  { type: 'note', emoji: '📝', label: 'Scratchpad Note', desc: 'Freeform editable note saved right inside this tab' },
  { type: 'weather', emoji: '🌤️', label: 'Live Weather', desc: 'Current temperature & conditions widget' },
];

const BUILTIN_TABS: Array<{ view: NavView; label: string; emoji: string }> = [
  { view: 'home', label: 'Home Dashboard', emoji: '🏠' },
  { view: 'today', label: 'Today Spread', emoji: '📖' },
  { view: 'calendar', label: 'Flow Calendar', emoji: '📅' },
  { view: 'planner', label: 'Week / Month / Year', emoji: '🗓️' },
  { view: 'all_in_one', label: 'All-in-One Scroll', emoji: '📜' },
  { view: 'tasks', label: 'Tasks', emoji: '✅' },
  { view: 'chores', label: 'Chores', emoji: '🧹' },
  { view: 'history', label: 'History & Reviews', emoji: '🏆' },
  { view: 'alarms', label: 'Smart Alarms', emoji: '⏰' },
  { view: 'timers', label: 'Timers & Pomodoro', emoji: '⏱️' },
  { view: 'stopwatch', label: 'Stopwatch & Ledger', emoji: '⏱️' },
  { view: 'clock', label: 'Clock & World', emoji: '🌍' },
  { view: 'notes', label: 'Notes & Graph', emoji: '📝' },
  { view: 'thoughts', label: 'Thought Inbox', emoji: '💡' },
  { view: 'diary', label: 'Diary & Mood', emoji: '📓' },
  { view: 'recipes', label: 'Recipes', emoji: '🍳' },
  { view: 'pantry', label: 'Pantry Lots', emoji: '🥫' },
  { view: 'meals', label: 'Meal Planner', emoji: '🍽️' },
  { view: 'shopping', label: 'Groceries', emoji: '🛒' },
  { view: 'goals', label: 'Goals', emoji: '🎯' },
  { view: 'habits', label: 'Habits & Routines', emoji: '🔥' },
  { view: 'health', label: 'Health & Meds', emoji: '💊' },
  { view: 'finance', label: 'Finance & Bills', emoji: '💰' },
  { view: 'people', label: 'People & Gifts', emoji: '👥' },
  { view: 'travel', label: 'Travel & Trips', emoji: '✈️' },
  { view: 'guide', label: 'Guide & Help', emoji: '❓' },
  { view: 'settings', label: 'Settings & Sync', emoji: '⚙️' },
];

function formatDurationShort(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

export const CustomTabView: React.FC<{ tabId: string | null }> = ({ tabId }) => {
  const {
    settings,
    patchSettings,
    records,
    logicalToday,
    setActiveView,
    openCustomTab,
    openEventInCalendar,
    startCountdownTimer,
    triggerAlarmRing,
    pushToast,
  } = useApp();

  const [editingHeader, setEditingHeader] = useState(false);
  const [addingWidget, setAddingWidget] = useState(false);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);

  // Add Widget builder state
  const [newWidgetType, setNewWidgetType] = useState<CustomWidgetType>('timers');
  const [newWidgetTitle, setNewWidgetTitle] = useState('');
  const [newWidgetFilterCat, setNewWidgetFilterCat] = useState('');
  const [newWidgetFilterRoom, setNewWidgetFilterRoom] = useState('');
  const [newWidgetFilterTag, setNewWidgetFilterTag] = useState('');

  // Inline widget item editors (keyed by widget ID)
  const [taskInputs, setTaskInputs] = useState<Record<string, string>>({});
  const [counterName, setCounterName] = useState<Record<string, string>>({});
  const [counterTarget, setCounterTarget] = useState<Record<string, string>>({});
  const [counterUnit, setCounterUnit] = useState<Record<string, string>>({});

  // Specific Timer Builder inputs (per widget)
  const [timerName, setTimerName] = useState<Record<string, string>>({});
  const [timerMins, setTimerMins] = useState<Record<string, number>>({});
  const [timerSecs, setTimerSecs] = useState<Record<string, number>>({});
  const [timerSnd, setTimerSnd] = useState<Record<string, string>>({});

  // Specific Tab / Link Launcher Builder inputs (per widget)
  const [pickTabTarget, setPickTabTarget] = useState<Record<string, string>>({});
  const [linkLabelInputs, setLinkLabelInputs] = useState<Record<string, string>>({});
  const [linkUrlInputs, setLinkUrlInputs] = useState<Record<string, string>>({});

  const tab = useMemo(
    () => settings.customTabs.find((t) => t.id === tabId) ?? settings.customTabs[0] ?? null,
    [settings.customTabs, tabId]
  );

  const updateThisTab = (updater: (t: CustomTabDef) => CustomTabDef) => {
    if (!tab) return;
    const next = settings.customTabs.map((t) => (t.id === tab.id ? updater(t) : t));
    void patchSettings({ customTabs: next });
  };

  if (!tab) {
    return (
      <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
        <h2>Custom Tab Not Found</h2>
        <p className="dp-muted">Create a new custom tab from the sidebar, mobile drawer, or Settings.</p>
        <div>
          <button type="button" className="dp-btn dp-btn-primary" onClick={() => setActiveView('home')}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const allEvents = records.filter((r) => r.type === 'event') as Array<LifeRecord<CalendarEventPayload>>;
  const allTasks = records.filter((r) => r.type === 'task') as Array<LifeRecord<TaskPayload>>;
  const allChores = records.filter((r) => r.type === 'chore' && r.status === 'active') as Array<LifeRecord<ChorePayload>>;
  const allAlarms = records.filter((r) => r.type === 'alarm' && r.status === 'active');
  const allHabits = records.filter((r) => r.type === 'habit' && r.status === 'active') as Array<LifeRecord<HabitPayload>>;

  const handleAddWidget = (e: React.FormEvent) => {
    e.preventDefault();
    const def = WIDGET_TYPES.find((w) => w.type === newWidgetType);
    const w: CustomTabWidget = {
      id: createId('wid'),
      type: newWidgetType,
      title: newWidgetTitle.trim() || `${def?.emoji ?? ''} ${def?.label ?? 'Widget'}`.trim(),
      limit: 8,
      filterCategory: newWidgetFilterCat || undefined,
      filterRoom: newWidgetFilterRoom.trim() || undefined,
      filterTag: newWidgetFilterTag.trim() || undefined,
      noteContent: newWidgetType === 'note' ? '' : undefined,
      counters:
        newWidgetType === 'counters'
          ? [{ id: createId('cnt'), label: 'Daily Goal', value: 0, target: 5, unit: 'times', step: 1 }]
          : undefined,
      timerPresets:
        newWidgetType === 'timers'
          ? [
              { id: createId('tp'), label: '45s Sprint', seconds: 45 },
              { id: createId('tp'), label: '5m Break', seconds: 300 },
              { id: createId('tp'), label: '25m Focus', seconds: 1500 },
            ]
          : undefined,
      links:
        newWidgetType === 'links'
          ? [
              { id: createId('lnk'), label: 'Today Spread', emoji: '📖', targetView: 'today' },
              { id: createId('lnk'), label: 'Flow Calendar', emoji: '📅', targetView: 'calendar' },
            ]
          : undefined,
    };
    updateThisTab((cur) => ({ ...cur, widgets: [...cur.widgets, w] }));
    setNewWidgetTitle('');
    setNewWidgetFilterCat('');
    setNewWidgetFilterRoom('');
    setNewWidgetFilterTag('');
    setAddingWidget(false);
    // Automatically open inline Edit panel for Timers & Links so user can pick their exact items immediately!
    if (newWidgetType === 'timers' || newWidgetType === 'links' || newWidgetType === 'counters') {
      setEditingWidgetId(w.id);
    }
    pushToast(`Added "${w.title}" widget — click ✏️ Edit anytime to customize it!`);
  };

  const moveWidget = (idx: number, dir: -1 | 1) => {
    updateThisTab((cur) => {
      const next = [...cur.widgets];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return cur;
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...cur, widgets: next };
    });
  };

  const duplicateWidget = (w: CustomTabWidget) => {
    const copy: CustomTabWidget = {
      ...structuredClone(w),
      id: createId('wid'),
      title: `${w.title} (Copy)`,
    };
    updateThisTab((cur) => ({ ...cur, widgets: [...cur.widgets, copy] }));
    pushToast(`Duplicated "${w.title}"`);
  };

  const removeWidget = (wid: string) => {
    updateThisTab((cur) => ({ ...cur, widgets: cur.widgets.filter((w) => w.id !== wid) }));
    if (editingWidgetId === wid) setEditingWidgetId(null);
  };

  const patchWidget = (wid: string, updater: (w: CustomTabWidget) => CustomTabWidget) => {
    updateThisTab((cur) => ({
      ...cur,
      widgets: cur.widgets.map((w) => (w.id === wid ? updater(w) : w)),
    }));
  };

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)', gap: 16 }}>
      {/* Custom Tab Header */}
      <div className="dp-between" style={{ borderBottom: `2px solid ${tab.color}`, paddingBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div className="dp-row">
          <span style={{ fontSize: '1.6rem' }}>{tab.emoji}</span>
          <div>
            <h2>{tab.name}</h2>
            <span className="dp-muted" style={{ fontSize: '0.8rem' }}>
              Custom Tab · {tab.widgets.length} widget{tab.widgets.length === 1 ? '' : 's'} · Click ✏️ Edit on any widget to customize timers, tab buttons, filters &amp; layout
            </span>
          </div>
        </div>
        <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <button
            type="button"
            className="dp-btn dp-btn-primary dp-btn-sm"
            onClick={() => setAddingWidget((v) => !v)}
          >
            <Plus size={14} /> Add Widget
          </button>
          <button
            type="button"
            className="dp-btn dp-btn-sm"
            onClick={() => updateThisTab((c) => ({ ...c, layout: c.layout === 'grid' ? 'single' : 'grid' }))}
          >
            <Layers size={14} /> {tab.layout === 'grid' ? '2-Column Grid' : 'Single Column'}
          </button>
          <button
            type="button"
            className={`dp-btn dp-btn-sm ${editingHeader ? 'dp-btn-primary' : ''}`}
            onClick={() => setEditingHeader((v) => !v)}
          >
            <Settings2 size={14} /> Tab Settings
          </button>
        </div>
      </div>

      {/* Customize Tab Settings Bar */}
      {editingHeader && (
        <div className="dp-card dp-row" style={{ padding: 12, background: 'var(--dp-surface-2)', flexWrap: 'wrap', gap: 8 }}>
          <input
            className="dp-input"
            style={{ width: 56, textAlign: 'center' }}
            value={tab.emoji}
            aria-label="Tab emoji"
            onChange={(e) => updateThisTab((c) => ({ ...c, emoji: e.target.value }))}
          />
          <input
            className="dp-input"
            style={{ flex: '1 1 160px' }}
            value={tab.name}
            aria-label="Tab name"
            onChange={(e) => updateThisTab((c) => ({ ...c, name: e.target.value }))}
          />
          <label className="dp-row" style={{ gap: 5, fontSize: '0.82rem' }}>
            <span className="dp-muted">Accent:</span>
            <input
              type="color"
              aria-label="Tab accent color"
              value={tab.color}
              onChange={(e) => updateThisTab((c) => ({ ...c, color: e.target.value }))}
            />
          </label>
          <button
            type="button"
            className="dp-btn dp-btn-danger dp-btn-sm"
            onClick={() => {
              const remaining = settings.customTabs.filter((t) => t.id !== tab.id);
              void patchSettings({ customTabs: remaining });
              setActiveView('home');
              pushToast(`Removed custom tab "${tab.name}"`);
            }}
          >
            <Trash2 size={13} /> Delete Tab
          </button>
        </div>
      )}

      {/* Add Widget Panel */}
      {addingWidget && (
        <form className="dp-card dp-stack" style={{ padding: 14, gap: 10, background: 'var(--dp-surface-2)', borderColor: 'var(--dp-accent)' }} onSubmit={handleAddWidget}>
          <div className="dp-between">
            <strong>Choose a Widget to Add to &ldquo;{tab.name}&rdquo;</strong>
            <button type="button" className="dp-btn dp-btn-ghost dp-btn-sm" onClick={() => setAddingWidget(false)}>
              <X size={14} /> Close
            </button>
          </div>
          <div className="dp-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {WIDGET_TYPES.map((wt) => (
              <button
                key={wt.type}
                type="button"
                className={`dp-btn dp-btn-sm ${newWidgetType === wt.type ? 'dp-btn-primary' : ''}`}
                onClick={() => setNewWidgetType(wt.type)}
                title={wt.desc}
              >
                {wt.emoji} {wt.label}
              </button>
            ))}
          </div>
          <p className="dp-muted" style={{ margin: 0, fontSize: '0.8rem' }}>
            {WIDGET_TYPES.find((w) => w.type === newWidgetType)?.desc}
          </p>
          <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <input
              className="dp-input"
              style={{ flex: '2 1 180px' }}
              placeholder="Widget title (e.g., Cooking Timers, Morning Launchpad)…"
              value={newWidgetTitle}
              onChange={(e) => setNewWidgetTitle(e.target.value)}
            />
            {newWidgetType === 'events' && (
              <select
                aria-label="Filter category"
                className="dp-select"
                style={{ width: 'auto' }}
                value={newWidgetFilterCat}
                onChange={(e) => setNewWidgetFilterCat(e.target.value)}
              >
                <option value="">All Categories</option>
                {settings.eventCategories.map((c) => (
                  <option key={c.id} value={c.name}>{c.emoji} {c.name}</option>
                ))}
              </select>
            )}
            {newWidgetType === 'tasks' && (
              <input
                className="dp-input"
                style={{ width: 160 }}
                placeholder="Filter #tag (optional)"
                value={newWidgetFilterTag}
                onChange={(e) => setNewWidgetFilterTag(e.target.value)}
              />
            )}
            {newWidgetType === 'chores' && (
              <input
                className="dp-input"
                style={{ width: 160 }}
                placeholder="Filter room (optional)"
                value={newWidgetFilterRoom}
                onChange={(e) => setNewWidgetFilterRoom(e.target.value)}
              />
            )}
            <button type="submit" className="dp-btn dp-btn-primary">
              <Plus size={14} /> Add Widget
            </button>
          </div>
        </form>
      )}

      {/* Render Custom Widgets (ALL Fully Editable!) */}
      {tab.widgets.length === 0 ? (
        <div className="dp-empty">
          <strong>Your blank canvas is ready!</strong>
          <span className="dp-muted">Click &ldquo;+ Add Widget&rdquo; above to add Custom Timers, 1-Tap Tab Launchers, Filtered Events, Tasks, Chores, Alarms, Habits, Trackers, Weather, or Notes.</span>
        </div>
      ) : (
        <div className={tab.layout === 'grid' ? 'dp-grid-2' : 'dp-stack'} style={{ gap: 14 }}>
          {tab.widgets.map((w, idx) => {
            const isEditing = editingWidgetId === w.id;
            const limit = w.limit ?? 8;
            return (
              <section
                key={w.id}
                className="dp-card dp-stack"
                style={{
                  padding: 14,
                  gap: 10,
                  gridColumn: w.spanFull && tab.layout === 'grid' ? '1 / -1' : undefined,
                  borderTop: w.accentColor ? `3px solid ${w.accentColor}` : undefined,
                }}
              >
                {/* Widget Card Header with Edit, Width, Duplicate, Reorder & Delete */}
                <div className="dp-between" style={{ gap: 6 }}>
                  <strong style={{ fontSize: '0.96rem' }}>{w.title}</strong>
                  <div className="dp-row" style={{ gap: 4 }}>
                    <button
                      type="button"
                      className={`dp-btn dp-btn-sm ${isEditing ? 'dp-btn-primary' : ''}`}
                      onClick={() => setEditingWidgetId(isEditing ? null : w.id)}
                      title="Edit this widget's title, items, filters, timers, or tab shortcuts"
                    >
                      <Edit3 size={12} /> {isEditing ? 'Done' : 'Edit'}
                    </button>
                    {tab.layout === 'grid' && (
                      <button
                        type="button"
                        className="dp-icon-btn"
                        title={w.spanFull ? 'Make half width' : 'Expand full width'}
                        onClick={() => patchWidget(w.id, (cur) => ({ ...cur, spanFull: !cur.spanFull }))}
                      >
                        {w.spanFull ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                      </button>
                    )}
                    <button type="button" className="dp-icon-btn" title="Duplicate widget" onClick={() => duplicateWidget(w)}>
                      <Copy size={13} />
                    </button>
                    <button type="button" className="dp-icon-btn" disabled={idx === 0} onClick={() => moveWidget(idx, -1)} aria-label="Move widget up">
                      <ArrowUp size={13} />
                    </button>
                    <button type="button" className="dp-icon-btn" disabled={idx === tab.widgets.length - 1} onClick={() => moveWidget(idx, 1)} aria-label="Move widget down">
                      <ArrowDown size={13} />
                    </button>
                    <button type="button" className="dp-icon-btn" onClick={() => removeWidget(w.id)} aria-label="Remove widget">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* FULL INLINE WIDGET EDITOR (Works on EVERY pre-existing and newly created widget!) */}
                {isEditing && (
                  <div className="dp-card dp-stack" style={{ padding: 10, gap: 8, background: 'var(--dp-surface-2)', borderColor: 'var(--dp-accent)' }}>
                    <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                      <input
                        aria-label="Edit widget title"
                        className="dp-input"
                        style={{ flex: '2 1 160px' }}
                        value={w.title}
                        onChange={(e) => patchWidget(w.id, (cur) => ({ ...cur, title: e.target.value }))}
                        placeholder="Widget title"
                      />
                      <label className="dp-row" style={{ gap: 4, fontSize: '0.78rem' }}>
                        <span className="dp-muted">Color:</span>
                        <input
                          type="color"
                          aria-label="Widget accent color"
                          value={w.accentColor || tab.color}
                          onChange={(e) => patchWidget(w.id, (cur) => ({ ...cur, accentColor: e.target.value }))}
                        />
                      </label>
                      {(w.type === 'events' || w.type === 'tasks' || w.type === 'chores' || w.type === 'alarms' || w.type === 'habits') && (
                        <label className="dp-row" style={{ gap: 4, fontSize: '0.78rem' }}>
                          <span className="dp-muted">Max items:</span>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            className="dp-input"
                            style={{ width: 58, padding: '3px 6px' }}
                            value={limit}
                            onChange={(e) =>
                              patchWidget(w.id, (cur) => ({ ...cur, limit: Math.max(1, Math.min(30, Number(e.target.value) || 8)) }))
                            }
                          />
                        </label>
                      )}
                    </div>

                    {/* Type-Specific Settings */}
                    {w.type === 'events' && (
                      <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8, fontSize: '0.82rem' }}>
                        <select
                          aria-label="Widget event category filter"
                          className="dp-select"
                          style={{ width: 'auto' }}
                          value={w.filterCategory || ''}
                          onChange={(e) => patchWidget(w.id, (cur) => ({ ...cur, filterCategory: e.target.value || undefined }))}
                        >
                          <option value="">All Categories</option>
                          {settings.eventCategories.map((c) => (
                            <option key={c.id} value={c.name}>{c.emoji} {c.name}</option>
                          ))}
                        </select>
                        <label className="dp-row" style={{ gap: 4 }}>
                          <input
                            type="checkbox"
                            checked={Boolean(w.onlySharedImportant)}
                            onChange={(e) => patchWidget(w.id, (cur) => ({ ...cur, onlySharedImportant: e.target.checked }))}
                          />
                          <span>Only Shared / ★ Important</span>
                        </label>
                      </div>
                    )}

                    {w.type === 'tasks' && (
                      <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8, fontSize: '0.82rem' }}>
                        <input
                          className="dp-input"
                          style={{ width: 150 }}
                          placeholder="Filter #tag (blank = all)"
                          value={w.filterTag || ''}
                          onChange={(e) => patchWidget(w.id, (cur) => ({ ...cur, filterTag: e.target.value.replace(/^#/, '') || undefined }))}
                        />
                        <select
                          aria-label="Filter task priority"
                          className="dp-select"
                          style={{ width: 'auto' }}
                          value={w.filterPriority || ''}
                          onChange={(e) => patchWidget(w.id, (cur) => ({ ...cur, filterPriority: e.target.value || undefined }))}
                        >
                          <option value="">All Priorities</option>
                          <option value="urgent">Urgent</option>
                          <option value="high">High</option>
                          <option value="medium">Medium</option>
                          <option value="low">Low</option>
                        </select>
                        <label className="dp-row" style={{ gap: 4 }}>
                          <input
                            type="checkbox"
                            checked={Boolean(w.onlySharedImportant)}
                            onChange={(e) => patchWidget(w.id, (cur) => ({ ...cur, onlySharedImportant: e.target.checked }))}
                          />
                          <span>Only Shared / ★ Important</span>
                        </label>
                      </div>
                    )}

                    {w.type === 'chores' && (
                      <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8, fontSize: '0.82rem' }}>
                        <input
                          className="dp-input"
                          list="custom-tab-rooms"
                          style={{ width: 170 }}
                          placeholder="Filter Room (blank = all)"
                          value={w.filterRoom || ''}
                          onChange={(e) => patchWidget(w.id, (cur) => ({ ...cur, filterRoom: e.target.value || undefined }))}
                        />
                        <datalist id="custom-tab-rooms">
                          {Array.from(new Set(allChores.map((c) => c.payload.room))).map((r) => (
                            <option key={r} value={r} />
                          ))}
                        </datalist>
                        <label className="dp-row" style={{ gap: 4 }}>
                          <input
                            type="checkbox"
                            checked={Boolean(w.onlySharedImportant)}
                            onChange={(e) => patchWidget(w.id, (cur) => ({ ...cur, onlySharedImportant: e.target.checked }))}
                          />
                          <span>Only Due / Overdue Today</span>
                        </label>
                      </div>
                    )}

                    {/* TIMERS WIDGET EDITOR: Pick ANY specific timers (label + min + sec + sound) or import from My Saved Presets! */}
                    {w.type === 'timers' && (
                      <div className="dp-stack" style={{ gap: 8 }}>
                        <strong style={{ fontSize: '0.8rem' }}>Add Specific Timer Button to this Widget:</strong>
                        <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                          <input
                            className="dp-input"
                            style={{ flex: '2 1 130px' }}
                            placeholder="Timer name (e.g., Steep Tea, Plank)…"
                            value={timerName[w.id] ?? ''}
                            onChange={(e) => setTimerName((p) => ({ ...p, [w.id]: e.target.value }))}
                          />
                          <input
                            type="number"
                            min={0}
                            max={600}
                            aria-label="Timer minutes"
                            className="dp-input"
                            style={{ width: 62 }}
                            value={timerMins[w.id] ?? 5}
                            onChange={(e) => setTimerMins((p) => ({ ...p, [w.id]: Math.max(0, Number(e.target.value) || 0) }))}
                          />
                          <span className="dp-muted" style={{ fontSize: '0.78rem' }}>m</span>
                          <input
                            type="number"
                            min={0}
                            max={59}
                            aria-label="Timer seconds"
                            className="dp-input"
                            style={{ width: 62 }}
                            value={timerSecs[w.id] ?? 0}
                            onChange={(e) => setTimerSecs((p) => ({ ...p, [w.id]: Math.max(0, Math.min(59, Number(e.target.value) || 0)) }))}
                          />
                          <span className="dp-muted" style={{ fontSize: '0.78rem' }}>s</span>
                          <select
                            aria-label="Timer button sound"
                            className="dp-select"
                            style={{ width: 'auto', fontSize: '0.78rem' }}
                            value={timerSnd[w.id] ?? 'default'}
                            onChange={(e) => setTimerSnd((p) => ({ ...p, [w.id]: e.target.value }))}
                          >
                            <option value="default">Default Sound</option>
                            {ALARM_RINGTONES.map((rt) => (
                              <option key={rt.id} value={rt.id}>{rt.emoji} {rt.name}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="dp-btn dp-btn-primary dp-btn-sm"
                            onClick={() => {
                              const secs = (timerMins[w.id] ?? 5) * 60 + (timerSecs[w.id] ?? 0);
                              if (secs <= 0) return;
                              const lbl = (timerName[w.id] || '').trim() || formatDurationShort(secs);
                              const snd = timerSnd[w.id] && timerSnd[w.id] !== 'default' ? timerSnd[w.id] : undefined;
                              patchWidget(w.id, (cur) => ({
                                ...cur,
                                timerPresets: [...(cur.timerPresets ?? []), { id: createId('tp'), label: lbl, seconds: secs, customSound: snd }],
                              }));
                              setTimerName((p) => ({ ...p, [w.id]: '' }));
                            }}
                          >
                            + Add Timer
                          </button>
                        </div>

                        {(settings.customTimerPresets?.length ?? 0) > 0 && (
                          <div className="dp-row" style={{ flexWrap: 'wrap', gap: 5, fontSize: '0.78rem' }}>
                            <span className="dp-muted">Import from My Saved Timers:</span>
                            {settings.customTimerPresets.map((cp) => (
                              <button
                                key={cp.id}
                                type="button"
                                className="dp-chip"
                                onClick={() =>
                                  patchWidget(w.id, (cur) => ({
                                    ...cur,
                                    timerPresets: [...(cur.timerPresets ?? []), { id: createId('tp'), label: cp.label, seconds: cp.seconds }],
                                  }))
                                }
                              >
                                + {cp.label} ({formatDurationShort(cp.seconds)})
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB LAUNCHER & LINKS EDITOR: Pick ANY specific Dayplana tab, another Custom Tab, or external URL! */}
                    {w.type === 'links' && (
                      <div className="dp-stack" style={{ gap: 8 }}>
                        <strong style={{ fontSize: '0.8rem' }}>Add a 1-Tap Tab Shortcut:</strong>
                        <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                          <select
                            aria-label="Choose a Dayplana tab to open"
                            className="dp-select"
                            style={{ flex: '1 1 190px' }}
                            value={pickTabTarget[w.id] ?? 'today'}
                            onChange={(e) => setPickTabTarget((p) => ({ ...p, [w.id]: e.target.value }))}
                          >
                            <optgroup label="Built-In Planner Tabs">
                              {BUILTIN_TABS.map((bt) => (
                                <option key={bt.view} value={`view:${bt.view}`}>
                                  {bt.emoji} {bt.label}
                                </option>
                              ))}
                            </optgroup>
                            {settings.customTabs.filter((ct) => ct.id !== tab.id).length > 0 && (
                              <optgroup label="Other Custom Tabs">
                                {settings.customTabs
                                  .filter((ct) => ct.id !== tab.id)
                                  .map((ct) => (
                                    <option key={ct.id} value={`custom:${ct.id}`}>
                                      {ct.emoji} {ct.name}
                                    </option>
                                  ))}
                              </optgroup>
                            )}
                          </select>
                          <button
                            type="button"
                            className="dp-btn dp-btn-primary dp-btn-sm"
                            onClick={() => {
                              const raw = pickTabTarget[w.id] ?? 'view:today';
                              if (raw.startsWith('custom:')) {
                                const cid = raw.slice(7);
                                const ct = settings.customTabs.find((x) => x.id === cid);
                                if (!ct) return;
                                patchWidget(w.id, (cur) => ({
                                  ...cur,
                                  links: [...(cur.links ?? []), { id: createId('lnk'), label: ct.name, emoji: ct.emoji, targetCustomTabId: ct.id }],
                                }));
                              } else {
                                const vw = (raw.startsWith('view:') ? raw.slice(5) : raw) as NavView;
                                const bt = BUILTIN_TABS.find((x) => x.view === vw);
                                patchWidget(w.id, (cur) => ({
                                  ...cur,
                                  links: [...(cur.links ?? []), { id: createId('lnk'), label: bt?.label ?? vw, emoji: bt?.emoji ?? '📌', targetView: vw }],
                                }));
                              }
                            }}
                          >
                            + Add Tab Button
                          </button>
                        </div>

                        <strong style={{ fontSize: '0.8rem' }}>Or Add an External Website Bookmark:</strong>
                        <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                          <input
                            className="dp-input"
                            style={{ flex: 1 }}
                            placeholder="Bookmark label"
                            value={linkLabelInputs[w.id] || ''}
                            onChange={(e) => setLinkLabelInputs((p) => ({ ...p, [w.id]: e.target.value }))}
                          />
                          <input
                            className="dp-input"
                            style={{ flex: 1 }}
                            placeholder="https://…"
                            value={linkUrlInputs[w.id] || ''}
                            onChange={(e) => setLinkUrlInputs((p) => ({ ...p, [w.id]: e.target.value }))}
                          />
                          <button
                            type="button"
                            className="dp-btn dp-btn-sm"
                            onClick={() => {
                              const lbl = (linkLabelInputs[w.id] || '').trim();
                              const url = (linkUrlInputs[w.id] || '').trim();
                              if (!lbl || !url) return;
                              patchWidget(w.id, (cur) => ({
                                ...cur,
                                links: [...(cur.links ?? []), { id: createId('lnk'), label: lbl, url }],
                              }));
                              setLinkLabelInputs((p) => ({ ...p, [w.id]: '' }));
                              setLinkUrlInputs((p) => ({ ...p, [w.id]: '' }));
                            }}
                          >
                            + Add URL
                          </button>
                        </div>
                      </div>
                    )}

                    {/* COUNTERS EDITOR */}
                    {w.type === 'counters' && (
                      <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                        <input
                          className="dp-input"
                          style={{ flex: '2 1 130px' }}
                          placeholder="Tracker label (e.g., Water, Pages)…"
                          value={counterName[w.id] || ''}
                          onChange={(e) => setCounterName((p) => ({ ...p, [w.id]: e.target.value }))}
                        />
                        <input
                          type="number"
                          min={0}
                          className="dp-input"
                          style={{ width: 74 }}
                          placeholder="Target"
                          value={counterTarget[w.id] || ''}
                          onChange={(e) => setCounterTarget((p) => ({ ...p, [w.id]: e.target.value }))}
                        />
                        <input
                          className="dp-input"
                          style={{ width: 84 }}
                          placeholder="Unit (cups)"
                          value={counterUnit[w.id] || ''}
                          onChange={(e) => setCounterUnit((p) => ({ ...p, [w.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          className="dp-btn dp-btn-primary dp-btn-sm"
                          onClick={() => {
                            const lbl = (counterName[w.id] || '').trim();
                            if (!lbl) return;
                            const tgt = Number(counterTarget[w.id]);
                            patchWidget(w.id, (cur) => ({
                              ...cur,
                              counters: [
                                ...(cur.counters ?? []),
                                {
                                  id: createId('cnt'),
                                  label: lbl,
                                  value: 0,
                                  target: tgt > 0 ? tgt : undefined,
                                  unit: (counterUnit[w.id] || '').trim() || undefined,
                                  step: 1,
                                },
                              ],
                            }));
                            setCounterName((p) => ({ ...p, [w.id]: '' }));
                            setCounterTarget((p) => ({ ...p, [w.id]: '' }));
                            setCounterUnit((p) => ({ ...p, [w.id]: '' }));
                          }}
                        >
                          + Add Tracker
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* EVENTS WIDGET */}
                {w.type === 'events' && (() => {
                  const evs = allEvents
                    .filter((ev) => {
                      if (ev.payload.startDate < logicalToday) return false;
                      if (w.filterCategory && ev.category !== w.filterCategory) return false;
                      if (w.onlySharedImportant && !ev.sharedWithAll && !ev.isImportant) return false;
                      return true;
                    })
                    .sort((a, b) => a.payload.startDate.localeCompare(b.payload.startDate))
                    .slice(0, limit);
                  return (
                    <div className="dp-stack" style={{ gap: 6 }}>
                      <div className="dp-row" style={{ gap: 5 }}>
                        {w.filterCategory && <span className="dp-pill">Category: {w.filterCategory}</span>}
                        {w.onlySharedImportant && <span className="dp-pill highlight">Shared / ★ Important</span>}
                      </div>
                      {evs.length === 0 ? (
                        <span className="dp-muted" style={{ fontSize: '0.84rem' }}>No upcoming matching events.</span>
                      ) : (
                        evs.map((ev) => (
                          <button
                            key={ev.id}
                            type="button"
                            className="dp-btn dp-btn-ghost dp-between"
                            style={{ width: '100%', padding: '5px 8px' }}
                            onClick={() => openEventInCalendar(ev.id, ev.payload.startDate)}
                          >
                            <span>{ev.payload.emoji || '📌'} {ev.title}</span>
                            <span className="dp-pill">
                              {ev.payload.startDate} {ev.payload.startTime ? formatTimeDisplay(ev.payload.startTime, settings.timeFormat) : 'All day'}
                            </span>
                          </button>
                        ))
                      )}
                      <button
                        type="button"
                        className="dp-btn dp-btn-sm"
                        style={{ alignSelf: 'flex-start' }}
                        onClick={async () => {
                          const now = new Date();
                          const st = minutesToTime(Math.min(22 * 60, Math.ceil((now.getHours() * 60 + now.getMinutes() + 30) / 15) * 15));
                          const en = minutesToTime(Math.min(23 * 60, Math.ceil((now.getHours() * 60 + now.getMinutes() + 90) / 15) * 15));
                          const catObj = settings.eventCategories.find((c) => c.name === w.filterCategory);
                          const created = await createRecord<CalendarEventPayload>(
                            'event',
                            `${tab.name} Event`,
                            { startDate: logicalToday, endDate: logicalToday, startTime: st, endTime: en, allDay: false, floating: false, timeZone: settings.defaultTimeZone, style: 'soft', emoji: catObj?.emoji || tab.emoji, eventStatus: 'confirmed' },
                            { category: w.filterCategory || 'Personal', color: catObj?.color || tab.color }
                          );
                          openEventInCalendar(created.id, logicalToday);
                        }}
                      >
                        + New Event Here
                      </button>
                    </div>
                  );
                })()}

                {/* TASKS WIDGET */}
                {w.type === 'tasks' && (() => {
                  const matched = allTasks
                    .filter((t) => {
                      if (t.status !== 'active') return false;
                      if (w.filterTag && !(t.tags ?? []).includes(w.filterTag.toLowerCase())) return false;
                      if (w.filterPriority && t.priority !== w.filterPriority) return false;
                      if (w.onlySharedImportant && !t.sharedWithAll && !t.isImportant) return false;
                      return true;
                    })
                    .slice(0, limit);
                  return (
                    <div className="dp-stack" style={{ gap: 6 }}>
                      <form
                        className="dp-row"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const txt = (taskInputs[w.id] || '').trim();
                          if (!txt) return;
                          await createRecord<TaskPayload>(
                            'task',
                            txt,
                            { subtasks: [], boardColumn: 'next' },
                            {
                              doDate: logicalToday,
                              tags: w.filterTag ? [w.filterTag.toLowerCase()] : [],
                              priority: (w.filterPriority as TaskPayload extends never ? never : 'medium') || 'medium',
                            }
                          );
                          setTaskInputs((p) => ({ ...p, [w.id]: '' }));
                        }}
                      >
                        <input
                          className="dp-input"
                          style={{ flex: 1 }}
                          placeholder={`Add task${w.filterTag ? ` (#${w.filterTag})` : ''}…`}
                          value={taskInputs[w.id] || ''}
                          onChange={(e) => setTaskInputs((p) => ({ ...p, [w.id]: e.target.value }))}
                        />
                        <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">Add</button>
                      </form>
                      {matched.length === 0 ? (
                        <span className="dp-muted" style={{ fontSize: '0.84rem' }}>No active tasks matching filter.</span>
                      ) : (
                        matched.map((t) => (
                          <label key={t.id} className="dp-row" style={{ cursor: 'pointer', fontSize: '0.88rem' }}>
                            <input
                              type="checkbox"
                              checked={t.status === 'done'}
                              onChange={() => void completeActionAtomically(t.id, { completedDateIso: logicalToday })}
                            />
                            <span>{t.title}</span>
                          </label>
                        ))
                      )}
                    </div>
                  );
                })()}

                {/* CHORES WIDGET */}
                {w.type === 'chores' && (() => {
                  const matched = allChores
                    .filter((c) => {
                      if (w.filterRoom && !c.payload.room.toLowerCase().includes(w.filterRoom.toLowerCase())) return false;
                      if (w.onlySharedImportant && c.payload.nextDueDate > logicalToday) return false;
                      return true;
                    })
                    .slice(0, limit);
                  return (
                    <div className="dp-stack" style={{ gap: 6 }}>
                      {matched.length === 0 ? (
                        <span className="dp-muted" style={{ fontSize: '0.84rem' }}>No matching chores.</span>
                      ) : (
                        matched.map((c) => (
                          <div key={c.id} className="dp-between" style={{ padding: '4px 8px', background: 'var(--dp-surface-2)', borderRadius: 6 }}>
                            <span>{c.title} <span className="dp-muted" style={{ fontSize: '0.76rem' }}>({c.payload.room})</span></span>
                            <button
                              type="button"
                              className="dp-btn dp-btn-primary dp-btn-sm"
                              onClick={() => void completeActionAtomically(c.id, { completedDateIso: logicalToday })}
                            >
                              <Check size={12} /> Done
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })()}

                {/* QUICK ALARMS WIDGET */}
                {w.type === 'alarms' && (
                  <div className="dp-stack" style={{ gap: 6 }}>
                    {allAlarms.length === 0 ? (
                      <span className="dp-muted" style={{ fontSize: '0.84rem' }}>No alarms yet — open Smart Alarms to schedule one.</span>
                    ) : (
                      allAlarms.slice(0, limit).map((a) => {
                        const p = normalizeAlarmPayload(a.payload as Record<string, unknown>);
                        const nxt = computeNextAlarmTrigger(a.payload as Record<string, unknown>);
                        return (
                          <div key={a.id} className="dp-between" style={{ padding: '6px 8px', background: 'var(--dp-surface-2)', borderRadius: 6 }}>
                            <span>
                              <strong style={{ fontFamily: 'var(--dp-font-mono)' }}>{p.time}</strong> · {a.title}{' '}
                              {nxt && <span className="dp-muted" style={{ fontSize: '0.75rem' }}>({nxt.countdownText})</span>}
                            </span>
                            <button type="button" className="dp-btn dp-btn-sm" onClick={() => triggerAlarmRing(a)}>
                              ▶ Ring
                            </button>
                          </div>
                        );
                      })
                    )}
                    <button type="button" className="dp-btn dp-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setActiveView('alarms')}>
                      Open Smart Alarms →
                    </button>
                  </div>
                )}

                {/* HABITS STRIP WIDGET */}
                {w.type === 'habits' && (
                  <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    {allHabits.length === 0 ? (
                      <span className="dp-muted" style={{ fontSize: '0.84rem' }}>No habits yet.</span>
                    ) : (
                      allHabits.slice(0, limit).map((h) => {
                        const done = Boolean(h.payload.logs?.[logicalToday]?.value);
                        return (
                          <button
                            key={h.id}
                            type="button"
                            className={`dp-btn dp-btn-sm ${done ? 'dp-btn-primary' : ''}`}
                            onClick={() => setActiveView('habits')}
                          >
                            {done ? '✓' : '○'} {h.title}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}

                {/* WEATHER WIDGET */}
                {w.type === 'weather' && <WeatherCard compact />}

                {/* LIVE SCRATCHPAD NOTE WIDGET */}
                {w.type === 'note' && (
                  <textarea
                    className="dp-textarea"
                    style={{ minHeight: 140 }}
                    placeholder="Write anything here — checklists, ideas, reference info…"
                    value={w.noteContent ?? ''}
                    onChange={(e) => patchWidget(w.id, (cur) => ({ ...cur, noteContent: e.target.value }))}
                  />
                )}

                {/* CUSTOM TRACKERS / COUNTERS WIDGET */}
                {w.type === 'counters' && (
                  <div className="dp-stack" style={{ gap: 8 }}>
                    {(w.counters ?? []).map((cnt) => (
                      <div key={cnt.id} className="dp-between" style={{ padding: '6px 10px', background: 'var(--dp-surface-2)', borderRadius: 8 }}>
                        <strong>{cnt.label}</strong>
                        <div className="dp-row" style={{ gap: 6 }}>
                          <button
                            type="button"
                            className="dp-btn dp-btn-sm"
                            onClick={() =>
                              patchWidget(w.id, (cur) => ({
                                ...cur,
                                counters: (cur.counters ?? []).map((x) => (x.id === cnt.id ? { ...x, value: Math.max(0, x.value - (x.step ?? 1)) } : x)),
                              }))
                            }
                          >
                            −
                          </button>
                          <span className="dp-pill highlight">
                            {cnt.value}{cnt.target ? ` / ${cnt.target}` : ''}{cnt.unit ? ` ${cnt.unit}` : ''}
                          </span>
                          <button
                            type="button"
                            className="dp-btn dp-btn-primary dp-btn-sm"
                            onClick={() =>
                              patchWidget(w.id, (cur) => ({
                                ...cur,
                                counters: (cur.counters ?? []).map((x) => (x.id === cnt.id ? { ...x, value: x.value + (x.step ?? 1) } : x)),
                              }))
                            }
                          >
                            +
                          </button>
                          {isEditing && (
                            <button
                              type="button"
                              className="dp-icon-btn"
                              style={{ width: 22, height: 22 }}
                              title="Remove tracker"
                              onClick={() =>
                                patchWidget(w.id, (cur) => ({
                                  ...cur,
                                  counters: (cur.counters ?? []).filter((x) => x.id !== cnt.id),
                                }))
                              }
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {!isEditing && (
                      <button type="button" className="dp-btn dp-btn-ghost dp-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditingWidgetId(w.id)}>
                        ✏️ Edit / Add Trackers
                      </button>
                    )}
                  </div>
                )}

                {/* CUSTOM SPECIFIC TIMERS WIDGET */}
                {w.type === 'timers' && (
                  <div className="dp-stack" style={{ gap: 8 }}>
                    <div className="dp-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      {(w.timerPresets ?? []).length === 0 ? (
                        <span className="dp-muted" style={{ fontSize: '0.82rem' }}>No timer buttons yet — click ✏️ Edit above to pick your exact timers!</span>
                      ) : (
                        (w.timerPresets ?? []).map((tp, ti) => (
                          <span key={tp.id || ti} className="dp-row" style={{ gap: 2 }}>
                            <button
                              type="button"
                              className="dp-btn dp-btn-sm"
                              onClick={() =>
                                void startCountdownTimer(tp.label, tp.seconds, 'countdown', null, {
                                  customSound: tp.customSound,
                                })
                              }
                            >
                              <Play size={12} /> {tp.label} ({formatDurationShort(tp.seconds)})
                            </button>
                            {isEditing && (
                              <button
                                type="button"
                                className="dp-icon-btn"
                                style={{ width: 24, height: 24 }}
                                title="Remove timer button"
                                onClick={() =>
                                  patchWidget(w.id, (cur) => ({
                                    ...cur,
                                    timerPresets: (cur.timerPresets ?? []).filter((_, idx2) => idx2 !== ti),
                                  }))
                                }
                              >
                                <X size={12} />
                              </button>
                            )}
                          </span>
                        ))
                      )}
                    </div>
                    {!isEditing && (
                      <button type="button" className="dp-btn dp-btn-ghost dp-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditingWidgetId(w.id)}>
                        ✏️ Customize Timers
                      </button>
                    )}
                  </div>
                )}

                {/* SPECIFIC TAB LAUNCHER & PINNED LINKS WIDGET */}
                {w.type === 'links' && (
                  <div className="dp-stack" style={{ gap: 8 }}>
                    <div className="dp-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      {(w.links ?? []).length === 0 ? (
                        <span className="dp-muted" style={{ fontSize: '0.82rem' }}>No shortcuts yet — click ✏️ Edit to pick which tabs to open easily from here!</span>
                      ) : (
                        (w.links ?? []).map((lnk) => (
                          <span key={lnk.id} className="dp-row" style={{ gap: 2 }}>
                            {lnk.targetCustomTabId ? (
                              <button
                                type="button"
                                className="dp-btn dp-btn-sm"
                                onClick={() => openCustomTab(lnk.targetCustomTabId!)}
                              >
                                {lnk.emoji || '📌'} {lnk.label}
                              </button>
                            ) : lnk.targetView ? (
                              <button
                                type="button"
                                className="dp-btn dp-btn-sm"
                                onClick={() => setActiveView(lnk.targetView as NavView)}
                              >
                                {lnk.emoji || '📌'} {lnk.label}
                              </button>
                            ) : (
                              <a
                                href={lnk.url}
                                target="_blank"
                                rel="noreferrer"
                                className="dp-btn dp-btn-sm"
                                style={{ textDecoration: 'none' }}
                              >
                                <ExternalLink size={12} /> {lnk.label}
                              </a>
                            )}
                            {isEditing && (
                              <button
                                type="button"
                                className="dp-icon-btn"
                                style={{ width: 24, height: 24 }}
                                title="Remove shortcut"
                                onClick={() =>
                                  patchWidget(w.id, (cur) => ({
                                    ...cur,
                                    links: (cur.links ?? []).filter((x) => x.id !== lnk.id),
                                  }))
                                }
                              >
                                <X size={12} />
                              </button>
                            )}
                          </span>
                        ))
                      )}
                    </div>
                    {!isEditing && (
                      <button type="button" className="dp-btn dp-btn-ghost dp-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditingWidgetId(w.id)}>
                        ✏️ Pick Tabs &amp; Links
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
