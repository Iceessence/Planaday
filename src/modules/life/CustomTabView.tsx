import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  Layers,
  Play,
  Plus,
  Settings2,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createId } from '../../core/db';
import { createRecord } from '../../core/repository';
import { completeActionAtomically, minutesToTime } from '../../core/planActions';
import { formatTimeDisplay } from '../../core/temporal';
import type {
  CalendarEventPayload,
  ChorePayload,
  CustomTabDef,
  CustomTabWidget,
  CustomWidgetType,
  LifeRecord,
  NavView,
  TaskPayload,
} from '../../core/types';

const WIDGET_TYPES: Array<{ type: CustomWidgetType; label: string; desc: string }> = [
  { type: 'events', label: 'Events Feed', desc: 'Upcoming events filtered by category or shared/important' },
  { type: 'tasks', label: 'Task Checklist', desc: 'Interactive tasks with inline quick-add' },
  { type: 'chores', label: 'Chores Block', desc: 'Room chores with 1-click Done Today' },
  { type: 'note', label: 'Live Scratchpad Note', desc: 'Freeform editable note block saved right in this tab' },
  { type: 'counters', label: 'Custom Trackers', desc: 'Add counters for habits, reps, pages, water, or points' },
  { type: 'timers', label: 'Quick Timers', desc: 'Custom 1-tap countdown timer buttons' },
  { type: 'links', label: 'Pinned Shortcuts & Links', desc: 'Jump straight to tabs or favorite external websites' },
];

export const CustomTabView: React.FC<{ tabId: string | null }> = ({ tabId }) => {
  const {
    settings,
    patchSettings,
    records,
    logicalToday,
    setActiveView,
    openEventInCalendar,
    startCountdownTimer,
    pushToast,
  } = useApp();

  const [editingHeader, setEditingHeader] = useState(false);
  const [addingWidget, setAddingWidget] = useState(false);
  const [newWidgetType, setNewWidgetType] = useState<CustomWidgetType>('tasks');
  const [newWidgetTitle, setNewWidgetTitle] = useState('');
  const [newWidgetFilterCat, setNewWidgetFilterCat] = useState('');
  const [newWidgetFilterRoom, setNewWidgetFilterRoom] = useState('');

  // Inline widget inputs
  const [taskInputs, setTaskInputs] = useState<Record<string, string>>({});
  const [counterInputs, setCounterInputs] = useState<Record<string, string>>({});
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
        <p className="dp-muted">Create a new custom tab from the sidebar or Settings.</p>
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

  const handleAddWidget = (e: React.FormEvent) => {
    e.preventDefault();
    const defaultLabel = WIDGET_TYPES.find((w) => w.type === newWidgetType)?.label ?? 'Widget';
    const w: CustomTabWidget = {
      id: createId('wid'),
      type: newWidgetType,
      title: newWidgetTitle.trim() || defaultLabel,
      filterCategory: newWidgetFilterCat || undefined,
      filterRoom: newWidgetFilterRoom.trim() || undefined,
      noteContent: newWidgetType === 'note' ? '' : undefined,
      counters: newWidgetType === 'counters' ? [{ id: createId('cnt'), label: 'Daily Goal', value: 0, target: 5 }] : undefined,
      timerPresets:
        newWidgetType === 'timers'
          ? [
              { label: '45s Sprint', seconds: 45 },
              { label: '10m Reset', seconds: 600 },
              { label: '25m Focus', seconds: 1500 },
            ]
          : undefined,
      links: newWidgetType === 'links' ? [{ id: createId('lnk'), label: 'Today Spread', targetView: 'today' }] : undefined,
    };
    updateThisTab((cur) => ({ ...cur, widgets: [...cur.widgets, w] }));
    setNewWidgetTitle('');
    setNewWidgetFilterCat('');
    setNewWidgetFilterRoom('');
    setAddingWidget(false);
    pushToast(`Added "${w.title}" widget to ${tab.name}`);
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

  const removeWidget = (wid: string) => {
    updateThisTab((cur) => ({ ...cur, widgets: cur.widgets.filter((w) => w.id !== wid) }));
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
      <div className="dp-between" style={{ borderBottom: `2px solid ${tab.color}`, paddingBottom: 12 }}>
        <div className="dp-row">
          <span style={{ fontSize: '1.6rem' }}>{tab.emoji}</span>
          <div>
            <h2>{tab.name}</h2>
            <span className="dp-muted" style={{ fontSize: '0.8rem' }}>
              Custom Sidebar Tab · {tab.widgets.length} widget{tab.widgets.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="dp-row">
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
            className="dp-btn dp-btn-sm"
            onClick={() => setEditingHeader((v) => !v)}
          >
            <Settings2 size={14} /> Customize Tab
          </button>
        </div>
      </div>

      {/* Customize Tab Metadata Bar */}
      {editingHeader && (
        <div className="dp-card dp-row" style={{ padding: 12, background: 'var(--dp-surface-2)' }}>
          <input
            className="dp-input"
            style={{ width: 56, textAlign: 'center' }}
            value={tab.emoji}
            aria-label="Tab emoji"
            onChange={(e) => updateThisTab((c) => ({ ...c, emoji: e.target.value }))}
          />
          <input
            className="dp-input"
            style={{ flex: 1 }}
            value={tab.name}
            aria-label="Tab name"
            onChange={(e) => updateThisTab((c) => ({ ...c, name: e.target.value }))}
          />
          <input
            type="color"
            aria-label="Tab accent color"
            value={tab.color}
            onChange={(e) => updateThisTab((c) => ({ ...c, color: e.target.value }))}
          />
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
        <form className="dp-card dp-stack" style={{ padding: 14, background: 'var(--dp-surface-2)' }} onSubmit={handleAddWidget}>
          <strong>Add a Block / Widget to &ldquo;{tab.name}&rdquo;</strong>
          <div className="dp-row" style={{ gap: 6 }}>
            {WIDGET_TYPES.map((wt) => (
              <button
                key={wt.type}
                type="button"
                className={`dp-btn dp-btn-sm ${newWidgetType === wt.type ? 'dp-btn-primary' : ''}`}
                onClick={() => setNewWidgetType(wt.type)}
                title={wt.desc}
              >
                {wt.label}
              </button>
            ))}
          </div>
          <div className="dp-row">
            <input
              className="dp-input"
              style={{ flex: 2 }}
              placeholder="Widget heading (optional)…"
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
            {newWidgetType === 'chores' && (
              <input
                className="dp-input"
                style={{ width: 150 }}
                placeholder="Filter room (optional)"
                value={newWidgetFilterRoom}
                onChange={(e) => setNewWidgetFilterRoom(e.target.value)}
              />
            )}
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">
              <Plus size={14} /> Add Block
            </button>
          </div>
        </form>
      )}

      {/* Render Custom Widgets */}
      {tab.widgets.length === 0 ? (
        <div className="dp-empty">
          <strong>Your blank canvas is ready!</strong>
          <span className="dp-muted">Click &ldquo;+ Add Widget&rdquo; above to place filtered Events, Tasks, Chores, Notes, Trackers, Timers, or Shortcuts here.</span>
        </div>
      ) : (
        <div className={tab.layout === 'grid' ? 'dp-grid-2' : 'dp-stack'} style={{ gap: 14 }}>
          {tab.widgets.map((w, idx) => (
            <section key={w.id} className="dp-card dp-stack" style={{ padding: 14, gap: 10 }}>
              <div className="dp-between">
                <strong>{w.title}</strong>
                <div className="dp-row" style={{ gap: 4 }}>
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

              {/* EVENTS WIDGET */}
              {w.type === 'events' && (() => {
                const evs = allEvents
                  .filter((ev) => ev.payload.startDate >= logicalToday && (!w.filterCategory || ev.category === w.filterCategory))
                  .sort((a, b) => a.payload.startDate.localeCompare(b.payload.startDate))
                  .slice(0, 8);
                return (
                  <div className="dp-stack" style={{ gap: 6 }}>
                    {w.filterCategory && <span className="dp-pill">Category: {w.filterCategory}</span>}
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
                const tagFilter = tab.name.toLowerCase().replace(/\s+/g, '-');
                const matched = allTasks.filter((t) => t.status === 'active' && (t.tags.includes(tagFilter) || !w.filterTag)).slice(0, 8);
                return (
                  <div className="dp-stack" style={{ gap: 6 }}>
                    <form
                      className="dp-row"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const txt = (taskInputs[w.id] || '').trim();
                        if (!txt) return;
                        await createRecord<TaskPayload>('task', txt, { subtasks: [], boardColumn: 'next' }, { doDate: logicalToday, tags: [tagFilter] });
                        setTaskInputs((p) => ({ ...p, [w.id]: '' }));
                      }}
                    >
                      <input
                        className="dp-input"
                        style={{ flex: 1 }}
                        placeholder="Add task…"
                        value={taskInputs[w.id] || ''}
                        onChange={(e) => setTaskInputs((p) => ({ ...p, [w.id]: e.target.value }))}
                      />
                      <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">Add</button>
                    </form>
                    {matched.map((t) => (
                      <label key={t.id} className="dp-row" style={{ cursor: 'pointer', fontSize: '0.88rem' }}>
                        <input
                          type="checkbox"
                          checked={t.status === 'done'}
                          onChange={() => void completeActionAtomically(t.id, { completedDateIso: logicalToday })}
                        />
                        <span>{t.title}</span>
                      </label>
                    ))}
                  </div>
                );
              })()}

              {/* CHORES WIDGET */}
              {w.type === 'chores' && (() => {
                const matched = allChores.filter(
                  (c) => !w.filterRoom || c.payload.room.toLowerCase().includes(w.filterRoom.toLowerCase())
                ).slice(0, 8);
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
                              counters: (cur.counters ?? []).map((x) => (x.id === cnt.id ? { ...x, value: Math.max(0, x.value - 1) } : x)),
                            }))
                          }
                        >
                          −
                        </button>
                        <span className="dp-pill highlight">
                          {cnt.value}{cnt.target ? ` / ${cnt.target}` : ''}
                        </span>
                        <button
                          type="button"
                          className="dp-btn dp-btn-primary dp-btn-sm"
                          onClick={() =>
                            patchWidget(w.id, (cur) => ({
                              ...cur,
                              counters: (cur.counters ?? []).map((x) => (x.id === cnt.id ? { ...x, value: x.value + 1 } : x)),
                            }))
                          }
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="dp-row">
                    <input
                      className="dp-input"
                      style={{ flex: 1 }}
                      placeholder="New tracker (e.g., Pages Read, Meds, Pushups)…"
                      value={counterInputs[w.id] || ''}
                      onChange={(e) => setCounterInputs((p) => ({ ...p, [w.id]: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="dp-btn dp-btn-sm"
                      onClick={() => {
                        const lbl = (counterInputs[w.id] || '').trim();
                        if (!lbl) return;
                        patchWidget(w.id, (cur) => ({
                          ...cur,
                          counters: [...(cur.counters ?? []), { id: createId('cnt'), label: lbl, value: 0 }],
                        }));
                        setCounterInputs((p) => ({ ...p, [w.id]: '' }));
                      }}
                    >
                      + Tracker
                    </button>
                  </div>
                </div>
              )}

              {/* QUICK TIMERS WIDGET */}
              {w.type === 'timers' && (
                <div className="dp-row" style={{ gap: 6 }}>
                  {(w.timerPresets ?? []).map((tp, ti) => (
                    <button
                      key={ti}
                      type="button"
                      className="dp-btn dp-btn-sm"
                      onClick={() => void startCountdownTimer(tp.label, tp.seconds, 'countdown')}
                    >
                      <Play size={12} /> {tp.label}
                    </button>
                  ))}
                </div>
              )}

              {/* PINNED LINKS / SHORTCUTS WIDGET */}
              {w.type === 'links' && (
                <div className="dp-stack" style={{ gap: 6 }}>
                  <div className="dp-row" style={{ gap: 6 }}>
                    {(w.links ?? []).map((lnk) =>
                      lnk.targetView ? (
                        <button
                          key={lnk.id}
                          type="button"
                          className="dp-btn dp-btn-sm"
                          onClick={() => setActiveView(lnk.targetView as NavView)}
                        >
                          {lnk.label}
                        </button>
                      ) : (
                        <a
                          key={lnk.id}
                          href={lnk.url}
                          target="_blank"
                          rel="noreferrer"
                          className="dp-btn dp-btn-sm"
                          style={{ textDecoration: 'none' }}
                        >
                          <ExternalLink size={12} /> {lnk.label}
                        </a>
                      )
                    )}
                  </div>
                  <div className="dp-row">
                    <input
                      className="dp-input"
                      style={{ flex: 1 }}
                      placeholder="Bookmark name"
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
                      + Link
                    </button>
                  </div>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
