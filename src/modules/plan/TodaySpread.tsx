import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarPlus,
  Check,
  Clock,
  Droplets,
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
import { createRecord, updateRecord } from '../../core/repository';
import { getDailyFact } from '../../data/facts';
import { ModalDialog } from '../../components/Common/ModalDialog';
import type {
  CalendarEventPayload,
  ChorePayload,
  DiaryPayload,
  LifeRecord,
  TaskPayload,
} from '../../core/types';

const MOODS = ['Great', 'Good', 'Okay', 'Low', 'Rough'] as const;

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
    pushToast,
    startCountdownTimer,
  } = useApp();

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [factOffset, setFactOffset] = useState(0);
  const [showActualRail, setShowActualRail] = useState(false);
  const [rolloverOpen, setRolloverOpen] = useState(false);
  const [rolloverDismissed, setRolloverDismissed] = useState(false);
  const [pickDateTarget, setPickDateTarget] = useState<string | null>(null);
  const [pickedDateVal, setPickedDateVal] = useState(activeDate);

  const yesterday = addDaysIso(activeDate, -1);

  const allTasks = records.filter((r) => r.type === 'task') as Array<LifeRecord<TaskPayload>>;
  const allChores = records.filter((r) => r.type === 'chore' && r.status === 'active') as Array<
    LifeRecord<ChorePayload>
  >;
  const allEvents = records.filter((r) => r.type === 'event') as Array<LifeRecord<CalendarEventPayload>>;

  // Daily To-Dos are simply Tasks whose doDate === activeDate (Section 03.01 — never duplicate lists!)
  const todayTasks = useMemo(
    () => allTasks.filter((t) => t.doDate === activeDate),
    [allTasks, activeDate]
  );

  const topThree = useMemo(
    () => allTasks.filter((t) => t.payload.pinnedTop3Date === activeDate).slice(0, 3),
    [allTasks, activeDate]
  );

  // Yesterday's unfinished items for Rollover Migration Drawer (Section 05.04)
  const yesterdayLeftovers = useMemo(
    () =>
      allTasks.filter(
        (t) =>
          t.status === 'active' &&
          (t.doDate === yesterday || t.payload.pinnedTop3Date === yesterday)
      ),
    [allTasks, yesterday]
  );

  // Events occurring on activeDate
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

  const timedEvents = dayEvents.filter((e) => !e.payload.allDay && e.payload.startTime);

  // Over-Scheduling Capacity Meter (Section 05.03)
  const plannedMinutes = timedEvents.reduce((sum, ev) => {
    const s = timeToMinutes(ev.payload.startTime || '09:00');
    const e = timeToMinutes(ev.payload.endTime || '10:00');
    return sum + Math.max(15, e - s);
  }, 0);
  const capacityMinutes = settings.dailyCapacityHours * 60;
  const overScheduled = plannedMinutes > capacityMinutes;

  // Free Time Finder (30+ minute gaps between 08:00 and 20:00)
  const freeGaps = useMemo(
    () =>
      findFreeTimeGaps(
        timedEvents.map((e) => ({
          startMin: timeToMinutes(e.payload.startTime || '09:00'),
          endMin: timeToMinutes(e.payload.endTime || '10:00'),
        }))
      ),
    [timedEvents]
  );

  // Overdue / Due chores
  const overdueChores = allChores.filter((c) => computeChoreFreshnessAtDate(c.payload, activeDate).status === 'overdue');
  const dueChores = allChores.filter((c) => computeChoreFreshnessAtDate(c.payload, activeDate).status === 'due_today');
  const openTaskCount = allTasks.filter((t) => t.status === 'active').length;

  // Unified Daily Reflection / Diary record (Section 03.04 — single source of truth across Today & Diary)
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

  const dailyFact = getDailyFact(activeDate, factOffset, settings.customFactsDeck);
  const spreadPaper = settings.spreadPaperOverrides[`today:${activeDate}`] ?? settings.paperMaterial;

  // Live "Now" minutes for today's indicator
  const nowDate = new Date();
  const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();

  // Low-Energy / Overwhelmed Mode (Section 14.06): hides clutter, shows Must-Do events, Top 1–3, and gentle 10m timer
  if (settings.lowEnergyMode) {
    const mustDoEvents = dayEvents.filter((e) => e.payload.importance === 'must_do');
    return (
      <div className="dp-paper-sheet dp-stack" data-paper={spreadPaper} style={{ padding: 'var(--dp-space-5)', maxWidth: 720, margin: '0 auto' }}>
        <div className="dp-between">
          <div>
            <h2>Calm / Low-Energy Mode</h2>
            <p className="dp-muted" style={{ margin: '4px 0 0' }}>
              Just the essentials for {formatDateLocalized(activeDate, settings.locale)}. Everything else is safely tucked away.
            </p>
          </div>
          <button
            type="button"
            className="dp-btn"
            onClick={() => void patchSettings({ lowEnergyMode: false })}
          >
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
          <h4>Must-Do Commitments ({mustDoEvents.length})</h4>
          {mustDoEvents.length === 0 ? (
            <p className="dp-muted" style={{ margin: 0 }}>No Must-Do events flagged today.</p>
          ) : (
            mustDoEvents.map((ev) => (
              <div key={ev.id} className="dp-between">
                <span>
                  {ev.payload.emoji || '📌'} {ev.title}
                </span>
                <span className="dp-pill">
                  {ev.payload.startTime ? formatTimeDisplay(ev.payload.startTime, settings.timeFormat) : 'All day'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dp-stack">
      {/* Date Header & Live Rollover Controls (Section 05.01) */}
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
            <button
              type="button"
              className="dp-btn dp-btn-primary dp-btn-sm"
              onClick={() => setRolloverOpen(true)}
            >
              Rollover ({yesterdayLeftovers.length})
            </button>
          )}
        </div>
      </div>

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
          <span className="dp-kpi-value">{dayEvents.length}</span>
          <span className="dp-kpi-label">Events Today</span>
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

      {/* Open-Book Two-Page Paper Spread (Section 05.02) */}
      <div className={`dp-open-book ${settings.openBookLayout ? '' : 'single-page'}`}>
        {/* LEFT PAGE: Time-Block Schedule, Top Three Priorities, Daily Checklist */}
        <section
          className="dp-paper-sheet dp-book-page dp-book-page-left dp-stack"
          data-paper={spreadPaper}
        >
          {renderDecorOverlay?.(`today:${activeDate}:left`)}

          {/* Capacity Meter & Schedule Header */}
          <div className="dp-section-title">
            <span className="dp-row">
              <Clock size={16} /> Time-Block Schedule
            </span>
            <div className="dp-row">
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={() => setShowActualRail((v) => !v)}
              >
                {showActualRail ? 'Planned + Actual' : 'Planned Rail'}
              </button>
              <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('calendar')}>
                Expand Flow →
              </button>
            </div>
          </div>

          {/* Over-Scheduling Capacity Meter (Section 05.03) */}
          <div style={{ fontSize: '0.82rem' }}>
            <div className="dp-between" style={{ marginBottom: 4 }}>
              <span className="dp-muted">
                Capacity: {(plannedMinutes / 60).toFixed(1)}h / {settings.dailyCapacityHours}h planned
              </span>
              {overScheduled && (
                <span style={{ color: 'var(--dp-warn)', fontWeight: 600 }}>
                  Gently over daily capacity — consider trimming or moving one block
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

          {/* Schedule list + Live Now badge */}
          <div className="dp-stack" style={{ gap: 6 }}>
            {activeDate === logicalToday && (
              <div className="dp-pill" style={{ alignSelf: 'flex-start', borderColor: 'var(--dp-danger)', color: 'var(--dp-danger)' }}>
                ● Now: {formatTimeDisplay(minutesToTime(nowMin), settings.timeFormat)}
              </div>
            )}
            {dayEvents.length === 0 ? (
              <p className="dp-muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                No scheduled blocks on {activeDate}. Click the calendar icon beside any task below to time-block it!
              </p>
            ) : (
              dayEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="dp-card dp-between"
                  style={{
                    padding: '8px 12px',
                    borderInlineStart: `4px solid ${ev.color || 'var(--dp-accent)'}`,
                    opacity: ev.status === 'done' ? 0.65 : 1,
                  }}
                >
                  <div className="dp-row">
                    {ev.payload.linkedActionId && (
                      <input
                        type="checkbox"
                        aria-label={`Complete ${ev.title}`}
                        checked={ev.status === 'done'}
                        onChange={async () => {
                          await completeActionAtomically(ev.id, { completedDateIso: activeDate });
                          pushToast(`Synced "${ev.title}" across Today, Tasks & Calendar`, { canUndo: true });
                        }}
                      />
                    )}
                    <div>
                      <strong style={{ textDecoration: ev.status === 'done' ? 'line-through' : undefined }}>
                        {ev.payload.emoji ? `${ev.payload.emoji} ` : ''}
                        {ev.title}
                      </strong>
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
                  {showActualRail && (
                    <button
                      type="button"
                      className="dp-btn dp-btn-sm"
                      onClick={() =>
                        void updateRecord<CalendarEventPayload>(ev.id, (c) => ({
                          ...c,
                          payload: {
                            ...c.payload,
                            actualStartTime: c.payload.startTime,
                            actualEndTime: c.payload.endTime,
                          },
                        }))
                      }
                    >
                      Log Actual
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Free Time Finder (30+ minute gaps with 1-click energy-matched task suggestion) */}
          {freeGaps.length > 0 && (
            <details className="dp-details">
              <summary>Free Time Finder ({freeGaps.length} open gaps ≥ 30m)</summary>
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
                            pushToast(`Scheduled "${candidate.title}" into free slot`, { canUndo: true });
                          }}
                        >
                          Slot "{candidate.title.slice(0, 22)}"
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          {/* Top Three Priorities (pinned references — never duplicate lists) */}
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

          {/* Daily Checklist (live Tasks with doDate === activeDate) */}
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
                    title="Schedule onto Timeline"
                    aria-label="Schedule onto Timeline"
                    onClick={async () => {
                      const slotStart = freeGaps[0] ? minutesToTime(freeGaps[0].startMin) : '14:00';
                      await scheduleActionOnCalendar(t.id, activeDate, slotStart, t.estimateMin ?? 30);
                      pushToast(`Time-blocked "${t.title}" at ${slotStart}`, { canUndo: true });
                    }}
                  >
                    <CalendarPlus size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* RIGHT PAGE: Lined/Dotted Notes, Tonight, Gratitude, Unified Daily Tracker Strip, 40 Offline Facts */}
        <section
          className="dp-paper-sheet dp-book-page dp-book-page-right dp-stack"
          data-paper={spreadPaper}
        >
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

          {/* Unified Daily Tracker Strip (writes directly to Diary record — Section 03.04) */}
          <div className="dp-card dp-stack" style={{ padding: 12, gap: 10 }}>
            <div className="dp-between">
              <strong style={{ fontSize: '0.9rem' }}>Daily Tracker Strip</strong>
              <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('diary')}>
                Full Diary →
              </button>
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
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() => void saveDiaryField({ waterCups: Math.max(0, (diary.waterCups ?? 0) - 1) })}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() => void saveDiaryField({ waterCups: (diary.waterCups ?? 0) + 1 })}
                  >
                    +
                  </button>
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
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={diary.energy ?? 3}
                  onChange={(e) => void saveDiaryField({ energy: Number(e.target.value) })}
                />
              </label>
              <label className="dp-between">
                <span>Stress ({diary.stress ?? 2}/5)</span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={diary.stress ?? 2}
                  onChange={(e) => void saveDiaryField({ stress: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="dp-grid-2" style={{ gap: 8 }}>
              <input
                className="dp-input"
                placeholder="Meals quick note…"
                value={diary.mealsNote ?? ''}
                onChange={(e) => void saveDiaryField({ mealsNote: e.target.value })}
              />
              <input
                className="dp-input"
                placeholder="Weather note…"
                value={diary.weatherNote ?? ''}
                onChange={(e) => void saveDiaryField({ weatherNote: e.target.value })}
              />
            </div>
          </div>

          {/* 40 Offline Learning Facts Widget (Appendix B + Section 05.02) */}
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
                  <button
                    type="button"
                    className="dp-btn dp-btn-ghost dp-btn-sm"
                    onClick={() => void patchSettings({ showFactsWidget: false })}
                  >
                    Hide
                  </button>
                </div>
              </div>
              <p style={{ margin: 0, fontSize: '0.86rem' }}>{dailyFact.text}</p>
            </div>
          ) : (
            <button
              type="button"
              className="dp-btn dp-btn-ghost dp-btn-sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => void patchSettings({ showFactsWidget: true })}
            >
              Show Daily Learning Fact Widget
            </button>
          )}
        </section>
      </div>

      {/* Daily Rollover Migration Drawer (Section 05.04) */}
      <ModalDialog
        open={rolloverOpen}
        onClose={() => setRolloverOpen(false)}
        title={`Morning Rollover — Unfinished from ${yesterday}`}
        sheet
      >
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
                    <input
                      type="date"
                      className="dp-input"
                      style={{ width: 'auto' }}
                      value={pickedDateVal}
                      onChange={(e) => setPickedDateVal(e.target.value)}
                    />
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
