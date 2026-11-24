import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarPlus,
  Check,
  Clock,
  Droplets,
  ExternalLink,
  MessageSquareHeart,
  Plus,
  Sparkles,
  Star,
  Timer,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { addDaysIso, formatDateLocalized, formatTimeDisplay } from '../../core/temporal';
import { computeChoreFreshnessAtDate, expandRecurrenceDates } from '../../core/recurrence';
import {
  completeActionAtomically,
  findFreeTimeGaps,
  minutesToTime,
  scheduleActionOnCalendar,
  timeToMinutes,
} from '../../core/planActions';
import { scheduleMealWithPrepReminder } from '../../core/kitchenActions';
import { createRecord, updateRecord } from '../../core/repository';
import { getDailyFact } from '../../data/facts';
import { ModalDialog } from '../../components/Common/ModalDialog';
import type {
  CalendarEventPayload,
  ChorePayload,
  DiaryPayload,
  EventRetrospective,
  LifeRecord,
  NotePayload,
  TaskPayload,
  ThoughtPayload,
} from '../../core/types';

const MOODS = ['Great', 'Good', 'Okay', 'Low', 'Rough'] as const;
const OUTCOMES: Array<EventRetrospective['outcome']> = ['Great', 'Good', 'Okay', 'Tough'];

type QuickAddKind = 'event' | 'task' | 'chore' | 'meal' | 'timer' | 'note' | 'thought';

export const TodaySpread: React.FC<{ renderDecorOverlay?: (spreadKey: string) => React.ReactNode }> = ({
  renderDecorOverlay,
}) => {
  const {
    settings,
    patchSettings,
    records,
    logicalToday,
    activeDate,
    setActiveDate,
    setActiveView,
    openEventInCalendar,
    pushToast,
    startCountdownTimer,
  } = useApp();

  const [nowDate, setNowDate] = useState(() => new Date());
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [factOffset, setFactOffset] = useState(0);
  const [showActualRail, setShowActualRail] = useState(false);
  const [rolloverOpen, setRolloverOpen] = useState(false);
  const [rolloverDismissed, setRolloverDismissed] = useState(false);
  const [pickDateTarget, setPickDateTarget] = useState<string | null>(null);
  const [pickedDateVal, setPickedDateVal] = useState(activeDate);

  // Inline Quick Add Anything to Today without leaving Today Spread!
  const [quickKind, setQuickKind] = useState<QuickAddKind>('event');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickStartTime, setQuickStartTime] = useState(() => {
    const n = new Date();
    const rounded = Math.ceil((n.getHours() * 60 + n.getMinutes() + 15) / 15) * 15;
    return minutesToTime(Math.min(23 * 60, rounded));
  });
  const [quickDurationMin, setQuickDurationMin] = useState(45);
  const [quickTimerSec, setQuickTimerSec] = useState(0);
  const [quickChoreRoom, setQuickChoreRoom] = useState('Home');
  const [quickMealSlot, setQuickMealSlot] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('dinner');
  const [quickPinTop3, setQuickPinTop3] = useState(false);

  // Event Retrospective ("How did it go?") Modal state
  const [retroEvent, setRetroEvent] = useState<LifeRecord<CalendarEventPayload> | null>(null);
  const [retroOutcome, setRetroOutcome] = useState<EventRetrospective['outcome']>('Good');
  const [retroRating, setRetroRating] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [retroNote, setRetroNote] = useState('');

  useEffect(() => {
    const id = window.setInterval(() => setNowDate(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
  const isViewingToday = activeDate === logicalToday;
  const isPastDay = activeDate < logicalToday;
  const yesterday = addDaysIso(activeDate, -1);

  const allTasks = records.filter((r) => r.type === 'task') as Array<LifeRecord<TaskPayload>>;
  const allChores = records.filter((r) => r.type === 'chore' && r.status === 'active') as Array<
    LifeRecord<ChorePayload>
  >;
  const allEvents = records.filter((r) => r.type === 'event') as Array<LifeRecord<CalendarEventPayload>>;

  const todayTasks = useMemo(
    () => allTasks.filter((t) => t.doDate === activeDate),
    [allTasks, activeDate]
  );

  const topThree = useMemo(
    () => allTasks.filter((t) => t.payload.pinnedTop3Date === activeDate).slice(0, 3),
    [allTasks, activeDate]
  );

  const yesterdayLeftovers = useMemo(
    () =>
      allTasks.filter(
        (t) =>
          t.status === 'active' &&
          (t.doDate === yesterday || t.payload.pinnedTop3Date === yesterday)
      ),
    [allTasks, yesterday]
  );

  const dayEvents = useMemo(() => {
    const out: Array<LifeRecord<CalendarEventPayload>> = [];
    for (const ev of allEvents) {
      if (ev.recurrence) {
        const occ = expandRecurrenceDates(ev.payload.startDate, ev.recurrence, {
          rangeStart: activeDate,
          rangeEnd: activeDate,
          maxCount: 2,
        });
        if (occ.length > 0) out.push(ev);
      } else if (ev.payload.startDate <= activeDate && (ev.payload.endDate || ev.payload.startDate) >= activeDate) {
        out.push(ev);
      }
    }
    return out.sort((a, b) => (a.payload.startTime || '00:00').localeCompare(b.payload.startTime || '00:00'));
  }, [allEvents, activeDate]);

  // Split into Still Upcoming Today vs Earlier Today!
  const { upcomingEvents, pastEvents } = useMemo(() => {
    if (!isViewingToday) {
      return isPastDay
        ? { upcomingEvents: [] as Array<LifeRecord<CalendarEventPayload>>, pastEvents: dayEvents }
        : { upcomingEvents: dayEvents, pastEvents: [] as Array<LifeRecord<CalendarEventPayload>> };
    }
    const up: Array<LifeRecord<CalendarEventPayload>> = [];
    const past: Array<LifeRecord<CalendarEventPayload>> = [];
    for (const ev of dayEvents) {
      if (ev.payload.allDay || !ev.payload.startTime) {
        up.push(ev);
      } else {
        const endM = timeToMinutes(ev.payload.endTime || ev.payload.startTime);
        if (endM > nowMin) up.push(ev);
        else past.push(ev);
      }
    }
    return { upcomingEvents: up, pastEvents: past };
  }, [dayEvents, isViewingToday, isPastDay, nowMin]);

  const timedEvents = dayEvents.filter((e) => !e.payload.allDay && e.payload.startTime);

  const plannedMinutes = timedEvents.reduce((sum, ev) => {
    const s = timeToMinutes(ev.payload.startTime || '09:00');
    const e = timeToMinutes(ev.payload.endTime || '10:00');
    return sum + Math.max(15, e - s);
  }, 0);
  const capacityMinutes = settings.dailyCapacityHours * 60;
  const overScheduled = plannedMinutes > capacityMinutes;

  // Free Time Finder ONLY shows gaps AFTER current time when viewing Today (never earlier in the day!)
  const freeGaps = useMemo(() => {
    if (isPastDay) return [];
    return findFreeTimeGaps(
      timedEvents.map((e) => ({
        startMin: timeToMinutes(e.payload.startTime || '09:00'),
        endMin: timeToMinutes(e.payload.endTime || '10:00'),
      })),
      8 * 60,
      22 * 60,
      30,
      isViewingToday ? nowMin : undefined
    );
  }, [timedEvents, isViewingToday, isPastDay, nowMin]);

  const overdueChores = allChores.filter((c) => computeChoreFreshnessAtDate(c.payload, activeDate).status === 'overdue');
  const dueChores = allChores.filter((c) => computeChoreFreshnessAtDate(c.payload, activeDate).status === 'due_today');
  const openTaskCount = allTasks.filter((t) => t.status === 'active').length;

  const diaryRecord = records.find(
    (r) => r.type === 'diary' && (r.payload as unknown as DiaryPayload).date === activeDate
  ) as LifeRecord<DiaryPayload> | undefined;

  const diary: DiaryPayload = diaryRecord?.payload ?? { date: activeDate };

  const saveDiaryField = async (patch: Partial<DiaryPayload>) => {
    if (diaryRecord) {
      await updateRecord<DiaryPayload>(
        diaryRecord.id,
        (cur) => ({ ...cur, payload: { ...cur.payload, ...patch } }),
        { skipUndo: true }
      );
    } else {
      await createRecord<DiaryPayload>(
        'diary',
        `Daily Reflection — ${activeDate}`,
        { date: activeDate, ...patch },
        { category: 'Diary', tags: ['reflection'] },
        { skipUndo: true }
      );
    }
  };

  // Unified Inline Quick Add for Today Spread
  const handleInlineQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = quickTitle.trim();
    if (!text && quickKind !== 'timer') return;

    if (quickKind === 'event') {
      const endTime = minutesToTime(timeToMinutes(quickStartTime) + Math.max(15, quickDurationMin));
      await createRecord<CalendarEventPayload>(
        'event',
        text,
        {
          startDate: activeDate,
          endDate: activeDate,
          startTime: quickStartTime,
          endTime,
          allDay: false,
          floating: false,
          timeZone: settings.defaultTimeZone,
          style: 'soft',
          emoji: '📌',
          eventStatus: 'confirmed',
        },
        { category: 'Personal', color: '#a97434' }
      );
      pushToast(`Added event "${text}" at ${formatTimeDisplay(quickStartTime, settings.timeFormat)}`, { canUndo: true });
    } else if (quickKind === 'task') {
      await createRecord<TaskPayload>(
        'task',
        text,
        {
          subtasks: [],
          boardColumn: 'next',
          pinnedTop3Date: quickPinTop3 && topThree.length < 3 ? activeDate : null,
        },
        { doDate: activeDate, estimateMin: quickDurationMin || 25 }
      );
      pushToast(`Added task "${text}" to Today`, { canUndo: true });
    } else if (quickKind === 'chore') {
      await createRecord<ChorePayload>(
        'chore',
        text,
        {
          room: quickChoreRoom.trim() || 'Home',
          choreMode: 'after_completion',
          intervalDays: 3,
          difficulty: 2,
          checklist: [],
          linkedSupplies: [],
          nextDueDate: activeDate,
          completions: [],
        },
        { estimateMin: 15, category: quickChoreRoom.trim() || 'Home' }
      );
      pushToast(`Added chore "${text}" due ${activeDate}`, { canUndo: true });
    } else if (quickKind === 'meal') {
      await scheduleMealWithPrepReminder({
        date: activeDate,
        slot: quickMealSlot,
        entryType: 'text',
        title: text,
        addPrepReminder: false,
      });
      pushToast(`Planned ${quickMealSlot}: "${text}"`, { canUndo: true });
    } else if (quickKind === 'timer') {
      const totalSec = Math.max(1, (quickDurationMin || 0) * 60 + (quickTimerSec || 0));
      await startCountdownTimer(text || 'Today Timer', totalSec, 'countdown');
    } else if (quickKind === 'note') {
      await createRecord<NotePayload>('note', text, {
        notebookId: 'nb_personal',
        writtenForDate: activeDate,
        content: `# ${text}\n`,
        touchedDates: [activeDate],
      });
      pushToast(`Created note "${text}" for ${activeDate}`, { canUndo: true });
    } else if (quickKind === 'thought') {
      await createRecord<ThoughtPayload>('thought', text.slice(0, 64), {
        content: text,
        source: 'keyboard',
      });
      pushToast('Captured thought to Thought Inbox', { canUndo: true });
    }

    setQuickTitle('');
    setQuickPinTop3(false);
  };

  const handleQuickAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTaskTitle.trim();
    if (!title) return;
    await createRecord<TaskPayload>(
      'task',
      title,
      { subtasks: [], boardColumn: 'next' },
      { doDate: activeDate, estimateMin: 30 }
    );
    setNewTaskTitle('');
    pushToast(`Added "${title}" to Today`, { canUndo: true });
  };

  const toggleTop3 = async (task: LifeRecord<TaskPayload>) => {
    const pinned = task.payload.pinnedTop3Date === activeDate;
    if (!pinned && topThree.length >= 3) {
      pushToast('Top Three is full — unpin one priority first.');
      return;
    }
    await updateRecord<TaskPayload>(
      task.id,
      (cur) => ({ ...cur, payload: { ...cur.payload, pinnedTop3Date: pinned ? null : activeDate } }),
      { undoLabel: pinned ? 'Unpinned from Top 3' : 'Pinned to Top 3' }
    );
  };

  const openRetroModal = (ev: LifeRecord<CalendarEventPayload>) => {
    setRetroEvent(ev);
    setRetroOutcome(ev.payload.retrospective?.outcome ?? 'Good');
    setRetroRating(ev.payload.retrospective?.rating ?? 4);
    setRetroNote(ev.payload.retrospective?.note ?? '');
  };

  const renderEventRow = (ev: LifeRecord<CalendarEventPayload>, isPast: boolean) => {
    const startM = ev.payload.startTime ? timeToMinutes(ev.payload.startTime) : null;
    const endM = ev.payload.endTime ? timeToMinutes(ev.payload.endTime) : null;
    const happeningNow = isViewingToday && startM !== null && endM !== null && nowMin >= startM && nowMin < endM;
    const minsUntil = isViewingToday && startM !== null && startM > nowMin ? startM - nowMin : null;

    return (
      <div
        key={ev.id}
        className="dp-card dp-between"
        style={{
          padding: '8px 12px',
          borderInlineStart: `4px solid ${ev.color || 'var(--dp-accent)'}`,
          opacity: ev.status === 'done' || isPast ? 0.78 : 1,
          cursor: 'pointer',
        }}
        onClick={() => openEventInCalendar(ev.id, activeDate)}
        title="Click to open this event in Flow Calendar"
      >
        <div className="dp-row" style={{ flex: 1 }}>
          {ev.payload.linkedActionId && (
            <input
              type="checkbox"
              aria-label={`Complete ${ev.title}`}
              checked={ev.status === 'done'}
              onClick={(e) => e.stopPropagation()}
              onChange={async () => {
                await completeActionAtomically(ev.id, { completedDateIso: activeDate });
                pushToast(`Synced "${ev.title}" across Today, Tasks & Calendar`, { canUndo: true });
              }}
            />
          )}
          <div>
            <div className="dp-row" style={{ gap: 6 }}>
              <strong style={{ textDecoration: ev.status === 'done' ? 'line-through' : undefined }}>
                {ev.payload.emoji ? `${ev.payload.emoji} ` : ''}
                {ev.title}
              </strong>
              {happeningNow && (
                <span className="dp-pill" style={{ borderColor: 'var(--dp-danger)', color: 'var(--dp-danger)' }}>
                  ● Now
                </span>
              )}
              {minsUntil !== null && (
                <span className="dp-pill highlight">
                  in {minsUntil >= 60 ? `${Math.floor(minsUntil / 60)}h ${minsUntil % 60}m` : `${minsUntil}m`}
                </span>
              )}
              {ev.payload.retrospective && (
                <span className="dp-pill">
                  {ev.payload.retrospective.outcome} ({'★'.repeat(ev.payload.retrospective.rating)})
                </span>
              )}
            </div>
            <div className="dp-muted" style={{ fontSize: '0.78rem' }}>
              {ev.payload.allDay
                ? 'All day'
                : `${formatTimeDisplay(ev.payload.startTime || '09:00', settings.timeFormat)} – ${formatTimeDisplay(ev.payload.endTime || '10:00', settings.timeFormat)}`}
              {ev.payload.location ? ` · 📍 ${ev.payload.location}` : ''}
              {showActualRail && ev.payload.actualStartTime
                ? ` · Actual: ${ev.payload.actualStartTime}–${ev.payload.actualEndTime || '?'}`
                : ''}
            </div>
          </div>
        </div>

        <div className="dp-row" onClick={(e) => e.stopPropagation()}>
          {(isPast || ev.status === 'done') && (
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              title="Log how this event went"
              onClick={() => openRetroModal(ev)}
            >
              <MessageSquareHeart size={13} /> {ev.payload.retrospective ? 'Edit Review' : 'How did it go?'}
            </button>
          )}
          <button
            type="button"
            className="dp-icon-btn"
            title="Jump to this event in Flow Calendar"
            aria-label={`Open ${ev.title} in Flow Calendar`}
            onClick={() => openEventInCalendar(ev.id, activeDate)}
          >
            <ExternalLink size={14} />
          </button>
        </div>
      </div>
    );
  };

  const dailyFact = getDailyFact(activeDate, factOffset, settings.customFactsDeck);
  const spreadPaper = settings.spreadPaperOverrides[`today:${activeDate}`] ?? settings.paperMaterial;

  // Low-Energy / Overwhelmed Mode
  if (settings.lowEnergyMode) {
    const mustDoEvents = upcomingEvents.filter((e) => e.payload.importance === 'must_do');
    return (
      <div className="dp-paper-sheet dp-stack" data-paper={spreadPaper} style={{ padding: 'var(--dp-space-5)', maxWidth: 720, margin: '0 auto' }}>
        <div className="dp-between">
          <div>
            <h2>Calm / Low-Energy Mode</h2>
            <p className="dp-muted" style={{ margin: '4px 0 0' }}>
              Just the essentials still ahead for {formatDateLocalized(activeDate, settings.locale)}.
            </p>
          </div>
          <button type="button" className="dp-btn" onClick={() => void patchSettings({ lowEnergyMode: false })}>
            Return to Full Spread
          </button>
        </div>

        <div className="dp-card dp-between">
          <div>
            <strong>Gentle 10-Minute Start</strong>
            <div className="dp-muted" style={{ fontSize: '0.84rem' }}>
              Pick one tiny step and let a quiet 10m timer carry you.
            </div>
          </div>
          <button
            type="button"
            className="dp-btn dp-btn-primary"
            onClick={() => void startCountdownTimer('Gentle 10m Focus', 10 * 60, 'countdown')}
          >
            <Timer size={16} /> Start 10m Timer
          </button>
        </div>

        <div className="dp-card dp-stack">
          <h4>Top 1–3 Priorities</h4>
          {topThree.length === 0 ? (
            <p className="dp-muted" style={{ margin: 0 }}>No Top Three pinned yet.</p>
          ) : (
            topThree.map((t) => (
              <label key={t.id} className="dp-row" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={t.status === 'done'}
                  onChange={() => void completeActionAtomically(t.id, { completedDateIso: activeDate })}
                />
                <span style={{ textDecoration: t.status === 'done' ? 'line-through' : undefined }}>{t.title}</span>
              </label>
            ))
          )}
        </div>

        <div className="dp-card dp-stack">
          <h4>Upcoming Must-Do Commitments ({mustDoEvents.length})</h4>
          {mustDoEvents.length === 0 ? (
            <p className="dp-muted" style={{ margin: 0 }}>No upcoming Must-Do events remaining today.</p>
          ) : (
            mustDoEvents.map((ev) => renderEventRow(ev, false))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dp-stack">
      {/* Date Header & Live Rollover Controls */}
      <div className="dp-card dp-between" style={{ padding: '12px 16px' }}>
        <div className="dp-row">
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(addDaysIso(activeDate, -1))}>
            ←
          </button>
          <div>
            <h2 style={{ fontSize: '1.25rem' }}>{formatDateLocalized(activeDate, settings.locale)}</h2>
            <div className="dp-row" style={{ fontSize: '0.78rem' }}>
              <span className="dp-muted">
                Logical Today: <strong>{logicalToday}</strong>
                {settings.dayBoundaryHour > 0 ? ` (rolls over at ${settings.dayBoundaryHour}:00 AM)` : ''}
              </span>
              {activeDate !== logicalToday && (
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(logicalToday)}>
                  Jump to Today
                </button>
              )}
            </div>
          </div>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(addDaysIso(activeDate, 1))}>
            →
          </button>
        </div>

        <div className="dp-row">
          <input
            aria-label="Choose spread date"
            type="date"
            className="dp-input"
            style={{ width: 'auto', padding: '4px 8px' }}
            value={activeDate}
            onChange={(e) => e.target.value && setActiveDate(e.target.value)}
          />
          <button
            type="button"
            className="dp-btn dp-btn-sm"
            onClick={() => void patchSettings({ openBookLayout: !settings.openBookLayout })}
          >
            <BookOpen size={14} /> {settings.openBookLayout ? 'Open-Book' : 'Single Page'}
          </button>
          {yesterdayLeftovers.length > 0 && (
            <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={() => setRolloverOpen(true)}>
              Rollover ({yesterdayLeftovers.length})
            </button>
          )}
        </div>
      </div>

      {/* Inline Add-Anything-To-Today Bar (no tab switching required!) */}
      <form className="dp-card dp-stack dp-no-print" style={{ padding: 12, gap: 10 }} onSubmit={handleInlineQuickAdd}>
        <div className="dp-row" style={{ gap: 5 }}>
          <strong style={{ fontSize: '0.82rem', marginInlineEnd: 4 }}>Add to Today:</strong>
          {(
            [
              ['event', '+ Event'],
              ['task', '+ Task'],
              ['chore', '+ Chore'],
              ['meal', '+ Meal'],
              ['timer', '+ Timer'],
              ['note', '+ Note'],
              ['thought', '+ Thought'],
            ] as Array<[QuickAddKind, string]>
          ).map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              className={`dp-btn dp-btn-sm ${quickKind === k ? 'dp-btn-primary' : ''}`}
              onClick={() => setQuickKind(k)}
            >
              {lbl}
            </button>
          ))}
        </div>

        <div className="dp-row">
          <input
            className="dp-input"
            style={{ flex: 2, minWidth: 180 }}
            placeholder={
              quickKind === 'event'
                ? 'Event title (added straight to Today & Calendar)…'
                : quickKind === 'task'
                  ? 'Task for Today…'
                  : quickKind === 'chore'
                    ? 'Chore due today…'
                    : quickKind === 'meal'
                      ? 'Meal idea (e.g., Roasted Salmon)…'
                      : quickKind === 'timer'
                        ? 'Timer label (e.g., Steep tea, Plank)…'
                        : quickKind === 'note'
                          ? 'New note title for Today…'
                          : 'Quick thought brain dump…'
            }
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
          />

          {quickKind === 'event' && (
            <>
              <input type="time" aria-label="Event start time" className="dp-input" style={{ width: 122 }} value={quickStartTime} onChange={(e) => setQuickStartTime(e.target.value)} />
              <input type="number" aria-label="Duration minutes" min={5} max={480} className="dp-input" style={{ width: 72 }} value={quickDurationMin} onChange={(e) => setQuickDurationMin(Number(e.target.value) || 30)} title="Minutes" />
              <span className="dp-muted" style={{ fontSize: '0.8rem' }}>min</span>
            </>
          )}

          {quickKind === 'task' && (
            <label className="dp-row" style={{ fontSize: '0.82rem' }}>
              <input type="checkbox" checked={quickPinTop3} onChange={(e) => setQuickPinTop3(e.target.checked)} />
              <span>Pin Top 3</span>
            </label>
          )}

          {quickKind === 'chore' && (
            <input className="dp-input" style={{ width: 120 }} value={quickChoreRoom} onChange={(e) => setQuickChoreRoom(e.target.value)} placeholder="Room" />
          )}

          {quickKind === 'meal' && (
            <select aria-label="Meal slot" className="dp-select" style={{ width: 'auto' }} value={quickMealSlot} onChange={(e) => setQuickMealSlot(e.target.value as typeof quickMealSlot)}>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
          )}

          {quickKind === 'timer' && (
            <>
              <input type="number" aria-label="Timer minutes" min={0} max={720} className="dp-input" style={{ width: 64 }} value={quickDurationMin} onChange={(e) => setQuickDurationMin(Math.max(0, Number(e.target.value) || 0))} />
              <span className="dp-muted" style={{ fontSize: '0.8rem' }}>m</span>
              <input type="number" aria-label="Timer seconds" min={0} max={59} className="dp-input" style={{ width: 64 }} value={quickTimerSec} onChange={(e) => setQuickTimerSec(Math.max(0, Math.min(59, Number(e.target.value) || 0)))} />
              <span className="dp-muted" style={{ fontSize: '0.8rem' }}>s</span>
            </>
          )}

          <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">
            <Plus size={14} /> {quickKind === 'timer' ? 'Start' : 'Add'}
          </button>
        </div>
      </form>

      {/* Overdue Alert Banner + 4 Clickable KPI Counters */}
      {(overdueChores.length > 0 || (yesterdayLeftovers.length > 0 && !rolloverDismissed)) && (
        <div className="dp-banner" style={{ margin: 0 }}>
          <span className="dp-row">
            <AlertTriangle size={16} />
            {overdueChores.length > 0 && `${overdueChores.length} overdue chore(s). `}
            {yesterdayLeftovers.length > 0 && `${yesterdayLeftovers.length} unfinished item(s) from ${yesterday}.`}
          </span>
          <div className="dp-row">
            {yesterdayLeftovers.length > 0 && (
              <button type="button" className="dp-btn dp-btn-sm dp-btn-primary" onClick={() => setRolloverOpen(true)}>
                Open Rollover Drawer
              </button>
            )}
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setRolloverDismissed(true)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="dp-kpi-grid" style={{ marginBottom: 0 }}>
        <button type="button" className="dp-kpi-card" onClick={() => setActiveView('calendar')}>
          <span className="dp-kpi-value">{upcomingEvents.length}</span>
          <span className="dp-kpi-label">{isViewingToday ? 'Still Upcoming Today' : `Events on ${activeDate}`}</span>
        </button>
        <button type="button" className="dp-kpi-card" onClick={() => setActiveView('chores')}>
          <span className="dp-kpi-value" style={{ color: overdueChores.length ? 'var(--dp-danger)' : undefined }}>
            {overdueChores.length}
          </span>
          <span className="dp-kpi-label">Overdue Chores</span>
        </button>
        <button type="button" className="dp-kpi-card" onClick={() => setActiveView('chores')}>
          <span className="dp-kpi-value">{dueChores.length}</span>
          <span className="dp-kpi-label">Due Chores</span>
        </button>
        <button type="button" className="dp-kpi-card" onClick={() => setActiveView('tasks')}>
          <span className="dp-kpi-value">{openTaskCount}</span>
          <span className="dp-kpi-label">Open Tasks</span>
        </button>
      </div>

      {/* Open-Book Two-Page Paper Spread */}
      <div className={`dp-open-book ${settings.openBookLayout ? '' : 'single-page'}`}>
        {/* LEFT PAGE */}
        <section className="dp-paper-sheet dp-book-page dp-book-page-left dp-stack" data-paper={spreadPaper}>
          {renderDecorOverlay?.(`today:${activeDate}:left`)}

          <div className="dp-section-title">
            <span className="dp-row">
              <Clock size={16} /> {isViewingToday ? 'Still Upcoming Today' : 'Time-Block Schedule'}
            </span>
            <div className="dp-row">
              <button type="button" className="dp-btn dp-btn-sm" onClick={() => setShowActualRail((v) => !v)}>
                {showActualRail ? 'Planned + Actual' : 'Planned Rail'}
              </button>
              <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('calendar')}>
                Flow Calendar →
              </button>
            </div>
          </div>

          <div style={{ fontSize: '0.82rem' }}>
            <div className="dp-between" style={{ marginBottom: 4 }}>
              <span className="dp-muted">
                Capacity: {(plannedMinutes / 60).toFixed(1)}h / {settings.dailyCapacityHours}h planned
              </span>
              {overScheduled && (
                <span style={{ color: 'var(--dp-warn)', fontWeight: 600 }}>
                  Gently over daily capacity
                </span>
              )}
            </div>
            <div className="dp-progress-track">
              <div
                className="dp-progress-fill"
                style={{
                  width: `${Math.min(100, (plannedMinutes / Math.max(60, capacityMinutes)) * 100)}%`,
                  background: overScheduled ? 'var(--dp-warn)' : 'var(--dp-accent-2)',
                }}
              />
            </div>
          </div>

          {/* Upcoming Schedule (clickable to jump straight into Flow Calendar & open event!) */}
          <div className="dp-stack" style={{ gap: 6 }}>
            {isViewingToday && (
              <div className="dp-pill" style={{ alignSelf: 'flex-start', borderColor: 'var(--dp-danger)', color: 'var(--dp-danger)' }}>
                ● Now: {formatTimeDisplay(minutesToTime(nowMin), settings.timeFormat)}
              </div>
            )}
            {upcomingEvents.length === 0 ? (
              <p className="dp-muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                {isViewingToday
                  ? 'No more scheduled events remaining today — enjoy your open evening!'
                  : isPastDay
                    ? 'Past date — expand Earlier Events below to review or log how they went.'
                    : 'No events scheduled yet. Use "+ Event" above or click Flow Calendar.'}
              </p>
            ) : (
              upcomingEvents.map((ev) => renderEventRow(ev, false))
            )}
          </div>

          {/* Earlier Today / Past Events with "How did it go?" prompts */}
          {pastEvents.length > 0 && (
            <details className="dp-details">
              <summary>
                {isViewingToday ? `Earlier Today (${pastEvents.length})` : `Completed / Past Events (${pastEvents.length})`} — click "How did it go?" to reflect
              </summary>
              <div className="dp-stack" style={{ gap: 6, marginTop: 8 }}>
                {pastEvents.map((ev) => renderEventRow(ev, true))}
              </div>
            </details>
          )}

          {/* Free Time Finder — ONLY shows remaining gaps AFTER current time on Today! */}
          {!isPastDay && (
            <details className="dp-details" open={freeGaps.length > 0}>
              <summary>
                Free Time Remaining ({freeGaps.length} open gap{freeGaps.length === 1 ? '' : 's'} ≥ 30m
                {isViewingToday ? ` after ${formatTimeDisplay(minutesToTime(nowMin), settings.timeFormat)}` : ''})
              </summary>
              {freeGaps.length === 0 ? (
                <p className="dp-muted" style={{ margin: '8px 0 0', fontSize: '0.82rem' }}>
                  No 30+ minute free gaps left before 10:00 PM.
                </p>
              ) : (
                <div className="dp-stack" style={{ gap: 6, marginTop: 8 }}>
                  {freeGaps.slice(0, 4).map((g) => {
                    const candidate = todayTasks.find(
                      (t) => t.status === 'active' && (t.estimateMin ?? 30) <= g.durationMin
                    );
                    return (
                      <div key={g.startMin} className="dp-between" style={{ fontSize: '0.83rem' }}>
                        <span>
                          {formatTimeDisplay(minutesToTime(g.startMin), settings.timeFormat)} –{' '}
                          {formatTimeDisplay(minutesToTime(g.endMin), settings.timeFormat)} ({g.durationMin}m free)
                        </span>
                        {candidate && (
                          <button
                            type="button"
                            className="dp-btn dp-btn-sm"
                            onClick={async () => {
                              await scheduleActionOnCalendar(
                                candidate.id,
                                activeDate,
                                minutesToTime(g.startMin),
                                Math.min(g.durationMin, candidate.estimateMin ?? 30)
                              );
                              pushToast(`Scheduled "${candidate.title}" at ${formatTimeDisplay(minutesToTime(g.startMin), settings.timeFormat)}`, { canUndo: true });
                            }}
                          >
                            Slot "{candidate.title.slice(0, 22)}"
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </details>
          )}

          {/* Top Three Priorities */}
          <div className="dp-section-title" style={{ marginTop: 8 }}>
            <span className="dp-row">
              <Star size={16} /> Top Three Priorities ({topThree.length}/3)
            </span>
          </div>
          <div className="dp-stack" style={{ gap: 6 }}>
            {topThree.length === 0 ? (
              <p className="dp-muted" style={{ margin: 0, fontSize: '0.84rem' }}>
                Star up to 3 tasks below to pin your Top Three for {activeDate}.
              </p>
            ) : (
              topThree.map((t, idx) => (
                <div key={t.id} className="dp-between" style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--dp-highlight)', color: 'var(--dp-on-highlight)' }}>
                  <label className="dp-row" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={t.status === 'done'}
                      onChange={() => void completeActionAtomically(t.id, { completedDateIso: activeDate })}
                    />
                    <strong>
                      {idx + 1}. <span style={{ textDecoration: t.status === 'done' ? 'line-through' : undefined }}>{t.title}</span>
                    </strong>
                  </label>
                  <button type="button" className="dp-btn dp-btn-sm" onClick={() => void toggleTop3(t)}>
                    Unpin
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Daily Checklist */}
          <div className="dp-section-title" style={{ marginTop: 8 }}>
            <span>Daily Checklist</span>
            <span className="dp-muted" style={{ fontSize: '0.8rem' }}>
              {todayTasks.filter((t) => t.status === 'done').length}/{todayTasks.length} done
            </span>
          </div>
          <form className="dp-row" onSubmit={handleQuickAddTask}>
            <input
              className="dp-input"
              style={{ flex: 1 }}
              placeholder="Add a daily to-do (Enter to add)…"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
            />
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">
              Add
            </button>
          </form>
          <div className="dp-stack" style={{ gap: 6 }}>
            {todayTasks.map((t) => (
              <div key={t.id} className="dp-between" style={{ padding: '5px 8px', borderBottom: '1px dotted var(--dp-border)' }}>
                <label className="dp-row" style={{ cursor: 'pointer', flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={t.status === 'done'}
                    onChange={async () => {
                      await completeActionAtomically(t.id, { completedDateIso: activeDate });
                      pushToast(`Updated "${t.title}"`, { canUndo: true });
                    }}
                  />
                  <span style={{ textDecoration: t.status === 'done' ? 'line-through' : undefined }}>{t.title}</span>
                </label>
                <div className="dp-row">
                  <button
                    type="button"
                    className="dp-icon-btn"
                    title="Pin to Top Three"
                    aria-label="Pin to Top Three"
                    onClick={() => void toggleTop3(t)}
                  >
                    <Star size={14} fill={t.payload.pinnedTop3Date === activeDate ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    type="button"
                    className="dp-icon-btn"
                    title="Schedule onto next open time slot"
                    aria-label="Schedule onto Timeline"
                    onClick={async () => {
                      const slotStart = freeGaps[0] ? minutesToTime(freeGaps[0].startMin) : minutesToTime(Math.min(22 * 60, nowMin + 15));
                      await scheduleActionOnCalendar(t.id, activeDate, slotStart, t.estimateMin ?? 30);
                      pushToast(`Time-blocked "${t.title}" at ${formatTimeDisplay(slotStart, settings.timeFormat)}`, { canUndo: true });
                    }}
                  >
                    <CalendarPlus size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* RIGHT PAGE */}
        <section className="dp-paper-sheet dp-book-page dp-book-page-right dp-stack" data-paper={spreadPaper}>
          {renderDecorOverlay?.(`today:${activeDate}:right`)}

          <div className="dp-section-title">
            <span>Daily Notes & Margin Scratchpad</span>
            <span className="dp-muted" style={{ fontSize: '0.78rem' }}>Synced live to Diary</span>
          </div>
          <textarea
            className="dp-textarea"
            style={{ minHeight: 130, background: 'transparent' }}
            placeholder="Jot freeform notes, meeting highlights, or sketches for today…"
            value={diary.dailyNotes ?? ''}
            onChange={(e) => void saveDiaryField({ dailyNotes: e.target.value })}
          />

          <div className="dp-grid-2" style={{ gap: 10 }}>
            <label className="dp-stack" style={{ gap: 4 }}>
              <strong style={{ fontSize: '0.88rem' }}>Tonight</strong>
              <textarea
                className="dp-textarea"
                style={{ minHeight: 68, background: 'transparent' }}
                placeholder="Evening wind-down or dinner plan…"
                value={diary.tonight ?? ''}
                onChange={(e) => void saveDiaryField({ tonight: e.target.value })}
              />
            </label>
            <label className="dp-stack" style={{ gap: 4 }}>
              <strong style={{ fontSize: '0.88rem' }}>Gratitude</strong>
              <textarea
                className="dp-textarea"
                style={{ minHeight: 68, background: 'transparent' }}
                placeholder="One calm thing you appreciated today…"
                value={diary.gratitude ?? ''}
                onChange={(e) => void saveDiaryField({ gratitude: e.target.value })}
              />
            </label>
          </div>

          <div className="dp-card dp-stack" style={{ padding: 12, gap: 10 }}>
            <div className="dp-between">
              <strong style={{ fontSize: '0.9rem' }}>Daily Tracker Strip</strong>
              <div className="dp-row" style={{ gap: 6 }}>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('history')}>
                  History →
                </button>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('diary')}>
                  Full Diary →
                </button>
              </div>
            </div>
            <div className="dp-row">
              <span className="dp-muted" style={{ fontSize: '0.8rem' }}>Mood:</span>
              {MOODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`dp-btn dp-btn-sm ${diary.mood === m ? 'dp-btn-primary' : ''}`}
                  onClick={() => void saveDiaryField({ mood: m })}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="dp-grid-2" style={{ gap: 8, fontSize: '0.83rem' }}>
              <label className="dp-between">
                <span>
                  <Droplets size={13} /> Water: {diary.waterCups ?? 0} cups
                </span>
                <div className="dp-row" style={{ gap: 4 }}>
                  <button type="button" className="dp-btn dp-btn-sm" onClick={() => void saveDiaryField({ waterCups: Math.max(0, (diary.waterCups ?? 0) - 1) })}>−</button>
                  <button type="button" className="dp-btn dp-btn-sm" onClick={() => void saveDiaryField({ waterCups: (diary.waterCups ?? 0) + 1 })}>+</button>
                </div>
              </label>
              <label className="dp-between">
                <span>Sleep (hrs)</span>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  max={24}
                  className="dp-input"
                  style={{ width: 72, padding: '3px 6px' }}
                  value={diary.sleepHours ?? ''}
                  onChange={(e) => void saveDiaryField({ sleepHours: Number(e.target.value) || 0 })}
                />
              </label>
              <label className="dp-between">
                <span>Energy ({diary.energy ?? 3}/5)</span>
                <input type="range" min={1} max={5} value={diary.energy ?? 3} onChange={(e) => void saveDiaryField({ energy: Number(e.target.value) })} />
              </label>
              <label className="dp-between">
                <span>Stress ({diary.stress ?? 2}/5)</span>
                <input type="range" min={1} max={5} value={diary.stress ?? 2} onChange={(e) => void saveDiaryField({ stress: Number(e.target.value) })} />
              </label>
            </div>
            <div className="dp-grid-2" style={{ gap: 8 }}>
              <input className="dp-input" placeholder="Meals quick note…" value={diary.mealsNote ?? ''} onChange={(e) => void saveDiaryField({ mealsNote: e.target.value })} />
              <input className="dp-input" placeholder="Weather note…" value={diary.weatherNote ?? ''} onChange={(e) => void saveDiaryField({ weatherNote: e.target.value })} />
            </div>
          </div>

          {settings.showFactsWidget ? (
            <div className="dp-card" style={{ padding: 12, background: 'var(--dp-surface-2)' }}>
              <div className="dp-between" style={{ marginBottom: 4 }}>
                <span className="dp-pill">
                  <Sparkles size={12} /> {dailyFact.topic} · Fact #{dailyFact.id}/40
                </span>
                <div className="dp-row" style={{ gap: 4 }}>
                  <button type="button" className="dp-btn dp-btn-sm" onClick={() => setFactOffset((n) => n + 1)}>
                    Next fact <ArrowRight size={12} />
                  </button>
                  <button type="button" className="dp-btn dp-btn-ghost dp-btn-sm" onClick={() => void patchSettings({ showFactsWidget: false })}>
                    Hide
                  </button>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: '0.86rem' }}>{dailyFact.text}</p>
            </div>
          ) : (
            <button type="button" className="dp-btn dp-btn-ghost dp-btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => void patchSettings({ showFactsWidget: true })}>
              Show Daily Learning Fact Widget
            </button>
          )}
        </section>
      </div>

      {/* Event Retrospective ("How did it go?") Modal */}
      <ModalDialog open={Boolean(retroEvent)} onClose={() => setRetroEvent(null)} title={`How did "${retroEvent?.title || ''}" go?`}>
        {retroEvent && (
          <div className="dp-stack">
            <div className="dp-row">
              <span className="dp-muted">Outcome:</span>
              {OUTCOMES.map((o) => (
                <button key={o} type="button" className={`dp-btn dp-btn-sm ${retroOutcome === o ? 'dp-btn-primary' : ''}`} onClick={() => setRetroOutcome(o)}>
                  {o}
                </button>
              ))}
            </div>
            <div className="dp-row">
              <span className="dp-muted">Rating:</span>
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <button key={n} type="button" className={`dp-btn dp-btn-sm ${retroRating === n ? 'dp-btn-primary' : ''}`} onClick={() => setRetroRating(n)}>
                  {'★'.repeat(n)}
                </button>
              ))}
            </div>
            <textarea
              className="dp-textarea"
              placeholder="Takeaways, follow-ups, or notes about how it went…"
              value={retroNote}
              onChange={(e) => setRetroNote(e.target.value)}
            />
            <div className="dp-between">
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={() => {
                  const id = retroEvent.id;
                  setRetroEvent(null);
                  openEventInCalendar(id, activeDate);
                }}
              >
                Open in Flow Calendar
              </button>
              <button
                type="button"
                className="dp-btn dp-btn-primary"
                onClick={async () => {
                  await updateRecord<CalendarEventPayload>(
                    retroEvent.id,
                    (c) => ({
                      ...c,
                      payload: {
                        ...c.payload,
                        retrospective: {
                          outcome: retroOutcome,
                          rating: retroRating,
                          note: retroNote.trim() || undefined,
                          loggedAt: new Date().toISOString(),
                        },
                      },
                    }),
                    { undoLabel: `Reviewed "${retroEvent.title}"` }
                  );
                  setRetroEvent(null);
                  pushToast(`Saved reflection for "${retroEvent.title}"`, { canUndo: true });
                }}
              >
                Save Review
              </button>
            </div>
          </div>
        )}
      </ModalDialog>

      {/* Daily Rollover Migration Drawer */}
      <ModalDialog open={rolloverOpen} onClose={() => setRolloverOpen(false)} title={`Morning Rollover — Unfinished from ${yesterday}`} sheet>
        <p className="dp-muted" style={{ margin: 0, fontSize: '0.88rem' }}>
          Choose what happens to yesterday's remaining items. Yesterday's history stays cleanly preserved.
        </p>
        {yesterdayLeftovers.length === 0 ? (
          <div className="dp-empty">
            <Check size={22} />
            <strong>All caught up!</strong>
          </div>
        ) : (
          <div className="dp-stack">
            {yesterdayLeftovers.map((item) => (
              <div key={item.id} className="dp-card dp-stack" style={{ padding: 12, gap: 8 }}>
                <strong>{item.title}</strong>
                <div className="dp-row">
                  <button
                    type="button"
                    className="dp-btn dp-btn-primary dp-btn-sm"
                    onClick={async () => {
                      await updateRecord<TaskPayload>(
                        item.id,
                        (c) => ({
                          ...c,
                          doDate: activeDate,
                          payload: {
                            ...c.payload,
                            pinnedTop3Date: c.payload.pinnedTop3Date === yesterday ? activeDate : c.payload.pinnedTop3Date,
                          },
                        }),
                        { undoLabel: `Moved "${item.title}" to Today` }
                      );
                      pushToast(`Moved "${item.title}" to Today`, { canUndo: true });
                    }}
                  >
                    Move to Today
                  </button>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() => {
                      setPickDateTarget(item.id);
                      setPickedDateVal(addDaysIso(activeDate, 1));
                    }}
                  >
                    Pick Date
                  </button>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={async () => {
                      await updateRecord<TaskPayload>(
                        item.id,
                        (c) => ({
                          ...c,
                          doDate: null,
                          payload: { ...c.payload, pinnedTop3Date: null, boardColumn: 'backlog' },
                        }),
                        { undoLabel: `Returned "${item.title}" to Backlog` }
                      );
                      pushToast(`Returned "${item.title}" to Backlog`, { canUndo: true });
                    }}
                  >
                    Return to Backlog
                  </button>
                  <button
                    type="button"
                    className="dp-btn dp-btn-danger dp-btn-sm"
                    onClick={async () => {
                      await updateRecord(item.id, { status: 'canceled' }, { undoLabel: `Dropped "${item.title}"` });
                      pushToast(`Dropped "${item.title}"`, { canUndo: true });
                    }}
                  >
                    Drop
                  </button>
                </div>
                {pickDateTarget === item.id && (
                  <div className="dp-row">
                    <input type="date" className="dp-input" style={{ width: 'auto' }} value={pickedDateVal} onChange={(e) => setPickedDateVal(e.target.value)} />
                    <button
                      type="button"
                      className="dp-btn dp-btn-primary dp-btn-sm"
                      onClick={async () => {
                        await updateRecord(item.id, { doDate: pickedDateVal });
                        setPickDateTarget(null);
                        pushToast(`Rescheduled to ${pickedDateVal}`, { canUndo: true });
                      }}
                    >
                      Confirm Date
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </ModalDialog>
    </div>
  );
};
