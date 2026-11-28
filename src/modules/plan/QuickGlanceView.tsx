import { useViewFormGuard } from '../../components/Common/viewSafety';
import { useMinuteClock } from '../../components/Common/viewSafety';
import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  Camera,
  Check,
  CheckSquare,
  FileText,
  Flame,
  Inbox,
  Play,
  Plus,
  Sparkles,
  Timer,
  Trash2,
  Utensils,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createId, storeBlob } from '../../core/db';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { computeChoreFreshnessAtDate } from '../../core/recurrence';
import { formatDateLocalized, formatTimeDisplay } from '../../core/temporal';
import { WeatherCard } from '../../components/Common/WeatherCard';
import { ClockWidget, CLOCK_DESIGN_OPTIONS } from '../../components/Common/ClockWidget';
import { TabSettingsDrawer } from '../../components/Common/TabSettingsDrawer';
import type {
  CalendarEventPayload,
  ChorePayload,
  ClockDesignId,
  DiaryPayload,
  FoodLogPayload,
  GoalPayload,
  LifeRecord,
  NotePayload,
  TaskPayload,
} from '../../core/types';

const ALL_WIDGETS = [
  { id: 'clock', label: 'Clock & Date' },
  { id: 'weather', label: 'Current Weather' },
  { id: 'next_event', label: 'Next Calendar Event' },
  { id: 'recommended_chore', label: '1 Recommended Chore' },
  { id: 'top_goal', label: 'Top Daily Goal' },
  { id: 'next_task', label: 'Next Important Task' },
  { id: 'active_timer', label: 'Active Timer' },
  { id: 'reminder', label: 'Relevant Reminder' },
];

const ALL_ACTIONS = [
  { id: 'timer', label: 'Start Timer', icon: <Timer size={14} /> },
  { id: 'stopwatch', label: 'Stopwatch', icon: <Play size={14} /> },
  { id: 'note', label: 'Take Note', icon: <FileText size={14} /> },
  { id: 'task', label: 'Add Task', icon: <CheckSquare size={14} /> },
  { id: 'chore', label: 'Add Chore', icon: <Sparkles size={14} /> },
  { id: 'meal', label: 'Record Meal', icon: <Utensils size={14} /> },
  { id: 'diary', label: 'Diary Entry', icon: <Flame size={14} /> },
  { id: 'event', label: 'New Event', icon: <Calendar size={14} /> },
  { id: 'photo', label: 'Add Photo', icon: <Camera size={14} /> },
];

/**
 * Quick Glance Dashboard & Quick Capture Inbox (Section 12):
 * Fast, distraction-free essential widgets + 1-tap quick actions + triageable Quick Capture Inbox.
 */
export const QuickGlanceView: React.FC = () => {
  const {
    settings,
    patchSettings,
    records,
    logicalToday,
    setActiveView,
    runningTimers,
    startCountdownTimer,
    pushToast,
  } = useApp();
  const guardForm = useViewFormGuard(message => pushToast(message, { tone: 'warn' }));

  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [quickText, setQuickText] = useState('');
  const [quickMealCat, setQuickMealCat] = useState('lunch');
  const [quickTimerSec, setQuickTimerSec] = useState(300);
  const [inboxInput, setInboxInput] = useState('');
  const [routeToInbox, setRouteToInbox] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const visibleWidgets = settings.quickGlanceWidgets ?? ALL_WIDGETS.map((w) => w.id);
  const visibleActions = settings.quickGlanceActions ?? ALL_ACTIONS.map((a) => a.id);
  const clockCfg = settings.clockConfig ?? {
    design: 'analog_traditional' as ClockDesignId,
    showSeconds: true,
    sizePx: 140,
    accentColor: '#a97434',
    bgColor: '#fcf9f2',
    borderStyle: 'solid' as const,
    numberStyle: 'arabic' as const,
  };

  const now = useMinuteClock();
  const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // 1. Next Single Upcoming Event
  const nextEvent = useMemo(() => {
    const evs = (records.filter((r) => r.type === 'event' && r.status === 'active') as Array<LifeRecord<CalendarEventPayload>>)
      .filter((e) => e.payload.eventStatus !== 'canceled' && ((e.payload.endDate || e.payload.startDate) > logicalToday || ((e.payload.endDate || e.payload.startDate) === logicalToday && (e.payload.allDay || (e.payload.endTime || '23:59') >= nowHHMM))))
      .sort((a, b) =>
        `${a.payload.startDate} ${a.payload.startTime || '00:00'}`.localeCompare(
          `${b.payload.startDate} ${b.payload.startTime || '00:00'}`
        )
      );
    return evs[0] ?? null;
  }, [records, logicalToday, nowHHMM]);

  // 2. Single Recommended Chore (lowest freshness / most overdue)
  const recommendedChore = useMemo(() => {
    const chores = records.filter((r) => r.type === 'chore' && r.status === 'active' && !(r.payload as ChorePayload).paused) as Array<LifeRecord<ChorePayload>>;
    return chores
      .map((c) => ({ c, st: computeChoreFreshnessAtDate(c.payload, logicalToday) }))
      .sort((a, b) => a.st.freshnessPct - b.st.freshnessPct)[0] ?? null;
  }, [records, logicalToday]);

  // 3. Top Priority Goal
  const topGoal = useMemo(() => {
    const goals = records.filter((r) => r.type === 'goal' && r.status === 'active') as Array<LifeRecord<GoalPayload>>;
    return goals[0] ?? null;
  }, [records]);

  // 4. Next Important Task
  const nextTask = useMemo(() => {
    const priRank: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 };
    const tasks = records.filter((r) => r.type === 'task' && r.status === 'active') as Array<LifeRecord<TaskPayload>>;
    return [...tasks].sort((a, b) => {
      if (Boolean(b.isImportant) !== Boolean(a.isImportant)) return b.isImportant ? 1 : -1;
      return (priRank[b.priority ?? 'none'] ?? 0) - (priRank[a.priority ?? 'none'] ?? 0);
    })[0] ?? null;
  }, [records]);

  // 5. Relevant Reminder (overdue calibration, upcoming bill, or pinned family notice)
  const topReminder = useMemo(() => {
    const imp = records.find((r) => r.isImportant && r.status === 'active');
    if (imp) return { title: imp.title, meta: imp.dueDate ? `Due ${imp.dueDate}` : imp.type };
    const bill = records.find((r) => r.type === 'bill' && r.status === 'active');
    if (bill) return { title: `Bill: ${bill.title}`, meta: bill.dueDate ? `Due ${bill.dueDate}` : 'Recurring' };
    return null;
  }, [records]);

  // Quick Capture Inbox items
  const inboxItems = useMemo(
    () =>
      records
        .filter((r) => r.type === 'quick_capture' && r.status === 'active')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [records]
  );

  const handleQuickActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const txt = quickText.trim();
    if (!activeAction) return;

    if (activeAction === 'timer') {
      await startCountdownTimer(txt || 'Quick Timer', Math.max(5, quickTimerSec));
      setQuickText('');
      setActiveAction(null);
      return;
    }

    if (!txt) return;

    if (routeToInbox) {
      await createRecord('quick_capture', txt, { suggestedKind: activeAction, capturedDate: logicalToday });
      setQuickText('');
      setActiveAction(null);
      pushToast('Saved to Quick Capture Inbox for later filing!');
      return;
    }

    if (activeAction === 'task') {
      await createRecord<TaskPayload>('task', txt, { subtasks: [], boardColumn: 'next' }, { doDate: logicalToday, priority: 'medium' });
      pushToast(`Task added to Today: "${txt}"`);
    } else if (activeAction === 'chore') {
      await createRecord<ChorePayload>('chore', txt, {
        room: 'General',
        choreMode: 'after_completion',
        intervalDays: 7,
        difficulty: 2,
        checklist: [],
        linkedSupplies: [],
        nextDueDate: logicalToday,
        completions: [],
      });
      pushToast(`Chore added: "${txt}"`);
    } else if (activeAction === 'note') {
      await createRecord<NotePayload>('note', txt.slice(0, 60), {
        notebookId: 'nb_personal',
        writtenForDate: logicalToday,
        content: txt,
        citations: [],
        touchedDates: [logicalToday],
      });
      pushToast('Quick note saved to Notes!');
    } else if (activeAction === 'meal') {
      await createRecord<FoodLogPayload>('food_log', txt, {
        date: logicalToday,
        time: nowHHMM,
        mealCategory: quickMealCat,
        foodName: txt,
      });
      pushToast(`Logged ${quickMealCat}: "${txt}" (synced to Food History!)`);
    } else if (activeAction === 'diary') {
      const existing = records.find(
        (r) => r.type === 'diary' && (r.payload as DiaryPayload).date === logicalToday
      ) as LifeRecord<DiaryPayload> | undefined;
      if (existing) {
        await updateRecord<DiaryPayload>(existing.id, (c) => ({
          ...c,
          payload: {
            ...c.payload,
            extraEntries: [...(c.payload.extraEntries ?? []), { id: createId('de'), time: nowHHMM, text: txt }],
          },
        }));
      } else {
        await createRecord<DiaryPayload>('diary', `Daily Reflection — ${logicalToday}`, {
          date: logicalToday,
          narrative: txt,
        });
      }
      pushToast('Added to today’s Diary!');
    } else if (activeAction === 'event') {
      await createRecord<CalendarEventPayload>('event', txt, {
        startDate: logicalToday,
        endDate: logicalToday,
        startTime: nowHHMM,
        endTime: `${String(Math.min(23, Number(nowHHMM.slice(0, 2)) + 1)).padStart(2, '0')}:${nowHHMM.slice(3)}`,
        allDay: false,
        floating: false,
        timeZone: settings.defaultTimeZone,
        style: 'soft',
        eventStatus: 'confirmed',
      });
      pushToast(`Created event "${txt}" on Calendar!`);
    }
    setQuickText('');
    setActiveAction(null);
  };

  const handleQuickPhoto = async (file: File) => {
    const stored = await storeBlob(file, file.name);
    const existing = records.find(
      (r) => r.type === 'diary' && (r.payload as DiaryPayload).date === logicalToday
    ) as LifeRecord<DiaryPayload> | undefined;
    const photoEntry = {
      id: createId('ph'),
      blobHash: stored.hash,
      caption: file.name.replace(/\.[^.]+$/, ''),
      timestamp: new Date().toISOString(),
      album: 'Daily',
    };
    if (existing) {
      await updateRecord<DiaryPayload>(existing.id, (c) => ({
        ...c,
        payload: {
          ...c.payload,
          mediaBlobIds: [...(c.payload.mediaBlobIds ?? []), stored.hash],
          photos: [...(c.payload.photos ?? []), photoEntry],
        },
      }));
    } else {
      await createRecord<DiaryPayload>('diary', `Daily Reflection — ${logicalToday}`, {
        date: logicalToday,
        mediaBlobIds: [stored.hash],
        photos: [photoEntry],
      });
    }
    pushToast('Saved daily photo to Today & Diary!');
  };

  const convertInboxItem = async (item: LifeRecord, target: 'task' | 'note' | 'meal') => {
    if (target === 'task') {
      await createRecord<TaskPayload>('task', item.title, { subtasks: [], boardColumn: 'next' }, { doDate: logicalToday });
    } else if (target === 'note') {
      await createRecord<NotePayload>('note', item.title.slice(0, 60), {
        notebookId: 'nb_personal',
        writtenForDate: logicalToday,
        content: item.title,
      });
    } else {
      await createRecord<FoodLogPayload>('food_log', item.title, {
        date: logicalToday,
        time: nowHHMM,
        mealCategory: 'snack',
        foodName: item.title,
      });
    }
    await softDeleteRecord(item.id);
    pushToast(`Filed "${item.title}" → ${target}`);
  };

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)', gap: 16 }}>
      <div className="dp-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2>⚡ Quick Glance</h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.86rem' }}>
            {formatDateLocalized(logicalToday, settings.locale)} · Just the essentials &amp; instant capture.
          </p>
        </div>
        <div className="dp-row" style={{ gap: 6 }}>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('today')}>
            Full Today Spread <ArrowRight size={13} />
          </button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('task_calendar')}>
            Task Calendar
          </button>
        </div>
      </div>

      {/* Customize Quick Glance Widgets, Actions & Clock Style */}
      <TabSettingsDrawer title="Customize Quick Glance Widgets, Actions & Clock" subtitle="Pick exactly which essential cards, quick actions, and clock face appear here.">
        <div className="dp-stack" style={{ gap: 10, fontSize: '0.82rem' }}>
          <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <strong>Widgets:</strong>
            {ALL_WIDGETS.map((w) => {
              const on = visibleWidgets.includes(w.id);
              return (
                <label key={w.id} className="dp-row" style={{ gap: 4, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      void patchSettings({
                        quickGlanceWidgets: on ? visibleWidgets.filter((x) => x !== w.id) : [...visibleWidgets, w.id],
                      })
                    }
                  />
                  <span>{w.label}</span>
                </label>
              );
            })}
          </div>
          <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <strong>Quick Actions:</strong>
            {ALL_ACTIONS.map((a) => {
              const on = visibleActions.includes(a.id);
              return (
                <label key={a.id} className="dp-row" style={{ gap: 4, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      void patchSettings({
                        quickGlanceActions: on ? visibleActions.filter((x) => x !== a.id) : [...visibleActions, a.id],
                      })
                    }
                  />
                  <span>{a.label}</span>
                </label>
              );
            })}
          </div>
          <div className="dp-row" style={{ flexWrap: 'wrap', gap: 10 }}>
            <label className="dp-row" style={{ gap: 6 }}>
              <span className="dp-muted">Clock Design:</span>
              <select
                className="dp-select"
                style={{ width: 'auto' }}
                value={clockCfg.design}
                onChange={(e) =>
                  void patchSettings({ clockConfig: { ...clockCfg, design: e.target.value as ClockDesignId } })
                }
              >
                {CLOCK_DESIGN_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="dp-row" style={{ gap: 5, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={clockCfg.showSeconds}
                onChange={(e) => void patchSettings({ clockConfig: { ...clockCfg, showSeconds: e.target.checked } })}
              />
              <span>Show Seconds</span>
            </label>
          </div>
        </div>
      </TabSettingsDrawer>

      {/* 1-Tap Quick Actions Bar */}
      <div className="dp-card dp-stack" style={{ padding: 12, gap: 10 }}>
        <div className="dp-between" style={{ flexWrap: 'wrap', gap: 6 }}>
          <strong style={{ fontSize: '0.88rem' }}>Quick Actions</strong>
          <label className="dp-row" style={{ fontSize: '0.78rem', gap: 5, cursor: 'pointer' }}>
            <input type="checkbox" checked={routeToInbox} onChange={(e) => setRouteToInbox(e.target.checked)} />
            <span>Route captures to Quick Capture Inbox first</span>
          </label>
        </div>
        <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
          {ALL_ACTIONS.filter((a) => visibleActions.includes(a.id)).map((a) => (
            <button
              key={a.id}
              type="button"
              className={`dp-btn dp-btn-sm ${activeAction === a.id ? 'dp-btn-primary' : ''}`}
              onClick={() => {
                if (a.id === 'stopwatch') {
                  setActiveView('stopwatch');
                  return;
                }
                if (a.id === 'photo') {
                  photoInputRef.current?.click();
                  return;
                }
                setActiveAction(activeAction === a.id ? null : a.id);
              }}
            >
              {a.icon} {a.label}
            </button>
          ))}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleQuickPhoto(f);
              e.target.value = '';
            }}
          />
        </div>

        {activeAction && (
          <form className="dp-row" style={{ flexWrap: 'wrap', gap: 8 }} onSubmit={guardForm('form-1', handleQuickActionSubmit)}>
            <input
              autoFocus
              className="dp-input"
              style={{ flex: 2, minWidth: 180 }}
              placeholder={
                activeAction === 'timer'
                  ? 'Timer label (e.g., Tea steep)…'
                  : activeAction === 'meal'
                    ? 'What did you eat or drink?'
                    : `Quick ${activeAction}…`
              }
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
            />
            {activeAction === 'timer' && (
              <label className="dp-row" style={{ gap: 4, fontSize: '0.82rem' }}>
                <input
                  type="number"
                  min={5}
                  max={7200}
                  className="dp-input"
                  style={{ width: 80 }}
                  value={quickTimerSec}
                  onChange={(e) => setQuickTimerSec(Number(e.target.value) || 60)}
                />
                <span className="dp-muted">sec</span>
              </label>
            )}
            {activeAction === 'meal' && (
              <select className="dp-select" style={{ width: 'auto' }} value={quickMealCat} onChange={(e) => setQuickMealCat(e.target.value)}>
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
                <option value="drink">Drink</option>
              </select>
            )}
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">
              <Plus size={14} /> Save
            </button>
          </form>
        )}
      </div>

      {/* Essential Cards Grid */}
      <div className="dp-grid-3" style={{ gap: 12 }}>
        {visibleWidgets.includes('clock') && (
          <div className="dp-card dp-stack" style={{ padding: 14, alignItems: 'center', justifyContent: 'center' }}>
            <ClockWidget
              config={clockCfg}
              timeFormat={settings.timeFormat}
              timeZone={settings.defaultTimeZone}
              label={formatDateLocalized(logicalToday, settings.locale, { weekday: 'long', month: 'short', day: 'numeric' })}
            />
          </div>
        )}

        {visibleWidgets.includes('weather') && (
          <div className="dp-card" style={{ padding: 10 }}>
            <WeatherCard compact />
          </div>
        )}

        {visibleWidgets.includes('next_event') && (
          <div className="dp-card dp-stack" style={{ padding: 14, gap: 6 }}>
            <div className="dp-between">
              <strong style={{ fontSize: '0.84rem' }}>📅 Next Calendar Event</strong>
              <button type="button" className="dp-btn dp-btn-ghost dp-btn-sm" onClick={() => setActiveView('calendar')}>Open</button>
            </div>
            {nextEvent ? (
              <>
                <div style={{ fontSize: '1rem', fontWeight: 700 }}>
                  {nextEvent.payload.emoji || '📌'} {nextEvent.title}
                </div>
                <div className="dp-muted" style={{ fontSize: '0.82rem' }}>
                  {nextEvent.payload.startDate} ·{' '}
                  {nextEvent.payload.allDay
                    ? 'All Day'
                    : `${formatTimeDisplay(nextEvent.payload.startTime || '09:00', settings.timeFormat)} – ${formatTimeDisplay(nextEvent.payload.endTime || '10:00', settings.timeFormat)}`}
                </div>
              </>
            ) : (
              <span className="dp-muted" style={{ fontSize: '0.84rem' }}>No upcoming events scheduled.</span>
            )}
          </div>
        )}

        {visibleWidgets.includes('next_task') && (
          <div className="dp-card dp-stack" style={{ padding: 14, gap: 6 }}>
            <div className="dp-between">
              <strong style={{ fontSize: '0.84rem' }}>✅ Next Important Task</strong>
              <button type="button" className="dp-btn dp-btn-ghost dp-btn-sm" onClick={() => setActiveView('tasks')}>All</button>
            </div>
            {nextTask ? (
              <>
                <div style={{ fontWeight: 700 }}>{nextTask.isImportant ? '★ ' : ''}{nextTask.title}</div>
                <div className="dp-row" style={{ gap: 6, fontSize: '0.78rem' }}>
                  {nextTask.priority && <span className="dp-pill">{nextTask.priority}</span>}
                  {nextTask.estimateMin && <span className="dp-pill">⏱ {nextTask.estimateMin}m</span>}
                  {nextTask.dueDate && <span className="dp-pill">Due {nextTask.dueDate}</span>}
                </div>
              </>
            ) : (
              <span className="dp-muted" style={{ fontSize: '0.84rem' }}>All tasks cleared!</span>
            )}
          </div>
        )}

        {visibleWidgets.includes('recommended_chore') && (
          <div className="dp-card dp-stack" style={{ padding: 14, gap: 6 }}>
            <div className="dp-between">
              <strong style={{ fontSize: '0.84rem' }}>🧹 1 Recommended Chore</strong>
              <button type="button" className="dp-btn dp-btn-ghost dp-btn-sm" onClick={() => setActiveView('chores')}>All</button>
            </div>
            {recommendedChore ? (
              <>
                <div style={{ fontWeight: 700 }}>{recommendedChore.c.title}</div>
                <div className="dp-muted" style={{ fontSize: '0.8rem' }}>
                  {recommendedChore.c.payload.room} · {recommendedChore.st.freshnessPct}% fresh · Due {recommendedChore.st.effectiveDueDate}
                </div>
              </>
            ) : (
              <span className="dp-muted" style={{ fontSize: '0.84rem' }}>No chores due right now.</span>
            )}
          </div>
        )}

        {visibleWidgets.includes('top_goal') && (
          <div className="dp-card dp-stack" style={{ padding: 14, gap: 6 }}>
            <div className="dp-between">
              <strong style={{ fontSize: '0.84rem' }}>🎯 Top Priority Goal</strong>
              <button type="button" className="dp-btn dp-btn-ghost dp-btn-sm" onClick={() => setActiveView('goals')}>Goals</button>
            </div>
            {topGoal ? (
              <>
                <div style={{ fontWeight: 700 }}>{topGoal.title}</div>
                <div className="dp-muted" style={{ fontSize: '0.8rem' }}>
                  {(topGoal.payload.milestones ?? []).filter((m) => m.done).length}/{(topGoal.payload.milestones ?? []).length} milestones done
                </div>
              </>
            ) : (
              <span className="dp-muted" style={{ fontSize: '0.84rem' }}>No active goals yet.</span>
            )}
          </div>
        )}

        {visibleWidgets.includes('active_timer') && (
          <div className="dp-card dp-stack" style={{ padding: 14, gap: 6 }}>
            <div className="dp-between">
              <strong style={{ fontSize: '0.84rem' }}>⏱ Active Timer</strong>
              <button type="button" className="dp-btn dp-btn-ghost dp-btn-sm" onClick={() => setActiveView('timers')}>Timers</button>
            </div>
            {runningTimers.length > 0 ? (
              runningTimers.slice(0, 2).map((t) => (
                <div key={t.id} className="dp-between" style={{ fontSize: '0.84rem' }}>
                  <strong>{t.label}</strong>
                  <span className="dp-pill highlight">
                    {t.targetEndMs ? `${Math.max(0, Math.ceil((t.targetEndMs - Date.now()) / 1000))}s` : 'Paused'}
                  </span>
                </div>
              ))
            ) : (
              <button type="button" className="dp-btn dp-btn-sm" onClick={() => void startCountdownTimer('Focus Sprint', 25 * 60)}>
                Start 25m Focus Timer
              </button>
            )}
          </div>
        )}

        {visibleWidgets.includes('reminder') && (
          <div className="dp-card dp-stack" style={{ padding: 14, gap: 6 }}>
            <strong style={{ fontSize: '0.84rem' }}>🔔 Relevant Reminder</strong>
            {topReminder ? (
              <>
                <div style={{ fontWeight: 700 }}>{topReminder.title}</div>
                <div className="dp-muted" style={{ fontSize: '0.8rem' }}>{topReminder.meta}</div>
              </>
            ) : (
              <span className="dp-muted" style={{ fontSize: '0.84rem' }}>No urgent reminders right now.</span>
            )}
          </div>
        )}
      </div>

      {/* Quick Capture Inbox */}
      <div className="dp-card dp-stack" style={{ padding: 14, gap: 10 }}>
        <div className="dp-between">
          <strong>
            <Inbox size={16} style={{ verticalAlign: '-3px' }} /> Quick Capture Inbox ({inboxItems.length})
          </strong>
          <span className="dp-muted" style={{ fontSize: '0.78rem' }}>
            Drop anything fast — file into Tasks, Notes, or Food History whenever ready.
          </span>
        </div>
        <form
          className="dp-row"
          onSubmit={guardForm('form-2', async (e) => {
            e.preventDefault();
            if (!inboxInput.trim()) return;
            await createRecord('quick_capture', inboxInput.trim(), { capturedDate: logicalToday });
            setInboxInput('');
            pushToast('Added to Quick Capture Inbox');
          })}
        >
          <input
            className="dp-input"
            style={{ flex: 1 }}
            placeholder="Capture a thought, errand, reminder, or item…"
            value={inboxInput}
            onChange={(e) => setInboxInput(e.target.value)}
          />
          <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">
            <Plus size={14} /> Capture
          </button>
        </form>
        {inboxItems.map((it) => (
          <div key={it.id} className="dp-between" style={{ padding: '6px 10px', background: 'var(--dp-surface-2)', borderRadius: 6, flexWrap: 'wrap', gap: 6 }}>
            <span style={{ fontSize: '0.86rem' }}>{it.title}</span>
            <div className="dp-row" style={{ gap: 4 }}>
              <button type="button" className="dp-btn dp-btn-sm" onClick={() => void convertInboxItem(it, 'task')}>
                <Check size={12} /> → Task
              </button>
              <button type="button" className="dp-btn dp-btn-sm" onClick={() => void convertInboxItem(it, 'note')}>
                → Note
              </button>
              <button type="button" className="dp-btn dp-btn-sm" onClick={() => void convertInboxItem(it, 'meal')}>
                → Meal
              </button>
              <button type="button" className="dp-icon-btn" aria-label="Trash inbox item" onClick={() => void softDeleteRecord(it.id)}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
