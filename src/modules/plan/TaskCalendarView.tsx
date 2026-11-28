import { useViewFormGuard, useViewActionGuard } from '../../components/Common/viewSafety';
import { useMinuteClock } from '../../components/Common/viewSafety';
import { expandRecurrenceDates } from '../../core/recurrence';
import { diffDaysIso } from '../../core/temporal';
import React, { useMemo, useState } from 'react';
import { CalendarPlus, Check, Clock, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createId } from '../../core/db';
import { createRecord, updateRecord } from '../../core/repository';
import { addDaysIso, formatDateLocalized, formatTimeDisplay } from '../../core/temporal';
import {
  computeDynamicTaskSchedule,
  computeTaskAgeMetadata,
} from '../../core/taskScheduler';
import { completeActionAtomically, scheduleActionOnCalendar } from '../../core/planActions';
import { TabSettingsDrawer } from '../../components/Common/TabSettingsDrawer';
import type {
  CalendarEventPayload,
  LifeRecord,
  SchedulingContextDef,
  TaskPayload,
} from '../../core/types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Dedicated Intelligent Task Calendar (Section 10):
 * Dynamically schedules active tasks into free slots around existing Calendar commitments
 * using priority order, learned/estimated duration, preferred daily end time, and Contexts!
 * Completed tasks remain pinned at their actual recorded (or clearly marked estimated) times.
 */
export const TaskCalendarView: React.FC = () => {
  const { settings, patchSettings, records, activeDate, setActiveDate, logicalToday, pushToast } = useApp();
  const guardForm = useViewFormGuard(message => pushToast(message, { tone: 'warn' }));
  const guardAction = useViewActionGuard(message => pushToast(message, { tone: 'warn' }));
  const [contextFilterId, setContextFilterId] = useState<string>('all');
  const [newCtxName, setNewCtxName] = useState('');
  const [newCtxEmoji, setNewCtxEmoji] = useState('🧭');
  const [newCtxStart, setNewCtxStart] = useState('09:00');
  const [newCtxEnd, setNewCtxEnd] = useState('17:00');
  const [newCtxDays, setNewCtxDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskMin, setQuickTaskMin] = useState(30);
  const [quickTaskPri, setQuickTaskPri] = useState<'low' | 'medium' | 'high' | 'urgent'>('high');
  const [quickTaskCtx, setQuickTaskCtx] = useState('');
  const minuteNow = useMinuteClock(activeDate === logicalToday);
  const [refreshNow, setRefreshNow] = useState(0);
  const tickNow = refreshNow > minuteNow.getTime() ? new Date(refreshNow) : minuteNow;

  const contexts: SchedulingContextDef[] = settings.schedulingContexts ?? [];
  const preferredEndTime = settings.preferredDailyEndTime || '21:00';
  const allowPastEnd = Boolean(settings.allowSchedulePastEndTime);

  const tasks = useMemo(
    () => records.filter((r) => r.type === 'task') as Array<LifeRecord<TaskPayload>>,
    [records]
  );

  const dayEvents = useMemo(
    () =>
      (records.filter((r) => r.type === 'event' && r.status === 'active') as Array<LifeRecord<CalendarEventPayload>>).flatMap(ev => {
        if (!ev.recurrence) return ev.payload.startDate <= activeDate && (ev.payload.endDate || ev.payload.startDate) >= activeDate ? [ev] : [];
        const span = Math.max(0, diffDaysIso(ev.payload.startDate, ev.payload.endDate || ev.payload.startDate));
        return expandRecurrenceDates(ev.payload.startDate, ev.recurrence, { rangeStart: addDaysIso(activeDate, -span), rangeEnd: activeDate }).map(date => ({ ...ev, payload: { ...ev.payload, startDate: date, endDate: addDaysIso(date, span) } }));
      }),
    [records, activeDate]
  );

  const weekday = useMemo(() => {
    const [y, m, d] = activeDate.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1).getDay();
  }, [activeDate]);

  const nowMin = useMemo(() => {
    if (activeDate === logicalToday) {
      return tickNow.getHours() * 60 + tickNow.getMinutes();
    }
    return 8 * 60; // Future/past planning day starts at 8:00 AM
  }, [activeDate, logicalToday, tickNow.getHours(), tickNow.getMinutes()]);

  const schedule = useMemo(
    () =>
      computeDynamicTaskSchedule({
        dateIso: activeDate,
        weekday,
        nowMin,
        preferredEndTime,
        allowPastEndTime: allowPastEnd,
        tasks,
        dayEvents,
        contexts,
        activeContextId: contextFilterId === 'all' ? null : contextFilterId,
      }),
    [activeDate, weekday, nowMin, preferredEndTime, allowPastEnd, tasks, dayEvents, contexts, contextFilterId]
  );

  const handleCarryForward = async () => {
    const overdueUnfinished = tasks.filter(
      (t) => t.status === 'active' && t.doDate && t.doDate < logicalToday
    );
    for (const t of overdueUnfinished) {
      await updateRecord<TaskPayload>(
        t.id,
        (c) => ({
          ...c,
          doDate: logicalToday,
          payload: {
            ...c.payload,
            originalDueDate: c.payload.originalDueDate ?? c.dueDate ?? c.doDate ?? null,
            rescheduleCount: (c.payload.rescheduleCount ?? 0) + 1,
          },
        }),
        { skipUndo: true }
      );
    }
    pushToast(
      overdueUnfinished.length > 0
        ? `Carried ${overdueUnfinished.length} unfinished task(s) forward to ${logicalToday} (original age & history preserved)`
        : 'No past-date unfinished tasks to carry forward!'
    );
  };

  const addContext = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCtxName.trim()) return;
    const next: SchedulingContextDef = {
      id: createId('ctx'),
      name: newCtxName.trim(),
      emoji: newCtxEmoji || '🧭',
      color: '#3b6ea5',
      days: newCtxDays.length > 0 ? newCtxDays : [0, 1, 2, 3, 4, 5, 6],
      startTime: newCtxStart,
      endTime: newCtxEnd,
    };
    await patchSettings({ schedulingContexts: [...contexts, next] });
    setNewCtxName('');
    pushToast(`Added scheduling context "${next.name}"`);
  };

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <div className="dp-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2>
            <Sparkles size={20} style={{ verticalAlign: '-3px' }} /> Intelligent Task Calendar
          </h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
            {formatDateLocalized(activeDate, settings.locale)} · Dynamically places unfinished tasks in priority order around existing calendar events, shifting forward as time passes while preserving completed task history.
          </p>
        </div>
        <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(addDaysIso(activeDate, -1))}>←</button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(logicalToday)}>Today</button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(addDaysIso(activeDate, 1))}>→</button>
          <button
            type="button"
            className="dp-btn dp-btn-sm"
            onClick={() => {
              setRefreshNow(Date.now());
              pushToast('Refreshed schedule from current time');
            }}
          >
            <RefreshCw size={13} /> Recalculate Now
          </button>
          <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={guardAction('action-1', () => handleCarryForward())}>
            Carry Forward Unfinished
          </button>
        </div>
      </div>

      {/* Preferred Daily End Time & Custom Scheduling Contexts Drawer */}
      <TabSettingsDrawer
        title="Task Calendar Rules, Preferred End Time & Context Windows"
        subtitle="Control when you prefer to stop tasks each day and define unlimited work/home/lab/relationship scheduling contexts."
      >
        <div className="dp-stack" style={{ gap: 10 }}>
          <div className="dp-row" style={{ flexWrap: 'wrap', gap: 12, fontSize: '0.84rem' }}>
            <label className="dp-row" style={{ gap: 6 }}>
              <span className="dp-muted">Preferred Daily End Time:</span>
              <input
                type="time"
                className="dp-input"
                style={{ width: 124 }}
                value={preferredEndTime}
                onChange={(e) => void patchSettings({ preferredDailyEndTime: e.target.value || '21:00' })}
              />
            </label>
            <label className="dp-row" style={{ gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={allowPastEnd}
                onChange={(e) => void patchSettings({ allowSchedulePastEndTime: e.target.checked })}
              />
              <span>Allow auto-scheduling past preferred end time</span>
            </label>
            <label className="dp-row" style={{ gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.autoCarryOverTasks !== false}
                onChange={(e) => void patchSettings({ autoCarryOverTasks: e.target.checked })}
              />
              <span>Auto-carry unfinished tasks forward</span>
            </label>
          </div>

          <div className="dp-stack" style={{ gap: 6 }}>
            <strong style={{ fontSize: '0.84rem' }}>Scheduling Contexts ({contexts.length})</strong>
            <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {contexts.map((ctx) => (
                <div key={ctx.id} className="dp-pill" style={{ gap: 6, padding: '4px 10px' }}>
                  <span>{ctx.emoji} <strong>{ctx.name}</strong></span>
                  <span className="dp-muted">
                    {ctx.startTime}–{ctx.endTime} ({ctx.days.map((d) => DAY_LABELS[d]).join(',')})
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${ctx.name}`}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--dp-danger)' }}
                    onClick={() =>
                      void patchSettings({ schedulingContexts: contexts.filter((x) => x.id !== ctx.id) })
                    }
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            <form className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }} onSubmit={guardForm('form-1', addContext)}>
              <input
                className="dp-input"
                style={{ width: 46 }}
                value={newCtxEmoji}
                onChange={(e) => setNewCtxEmoji(e.target.value)}
                aria-label="Context emoji"
              />
              <input
                className="dp-input"
                style={{ flex: 1, minWidth: 140 }}
                placeholder="New context (e.g., Lab Bench, Spouse Time, Study)…"
                value={newCtxName}
                onChange={(e) => setNewCtxName(e.target.value)}
              />
              <input type="time" className="dp-input" style={{ width: 112 }} value={newCtxStart} onChange={(e) => setNewCtxStart(e.target.value)} />
              <span>to</span>
              <input type="time" className="dp-input" style={{ width: 112 }} value={newCtxEnd} onChange={(e) => setNewCtxEnd(e.target.value)} />
              <div className="dp-row" style={{ gap: 3 }}>
                {DAY_LABELS.map((lbl, dIdx) => {
                  const active = newCtxDays.includes(dIdx);
                  return (
                    <button
                      key={lbl}
                      type="button"
                      className={`dp-btn dp-btn-sm ${active ? 'dp-btn-primary' : ''}`}
                      style={{ padding: '2px 6px', fontSize: '0.72rem' }}
                      onClick={() =>
                        setNewCtxDays((prev) =>
                          prev.includes(dIdx) ? prev.filter((x) => x !== dIdx) : [...prev, dIdx].sort()
                        )
                      }
                    >
                      {lbl[0]}
                    </button>
                  );
                })}
              </div>
              <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">
                <Plus size={13} /> Add Context
              </button>
            </form>
          </div>
        </div>
      </TabSettingsDrawer>

      {/* Context Filter Chips & Quick Add Task */}
      <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
        <button
          type="button"
          className={`dp-btn dp-btn-sm ${contextFilterId === 'all' ? 'dp-btn-primary' : ''}`}
          onClick={() => setContextFilterId('all')}
        >
          All Contexts
        </button>
        {contexts.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`dp-btn dp-btn-sm ${contextFilterId === c.id ? 'dp-btn-primary' : ''}`}
            onClick={() => setContextFilterId(c.id)}
          >
            {c.emoji} {c.name} ({c.startTime}–{c.endTime})
          </button>
        ))}
      </div>

      <form
        className="dp-card dp-row"
        style={{ padding: 10, flexWrap: 'wrap', gap: 8 }}
        onSubmit={guardForm('form-2', async (e) => {
          e.preventDefault();
          if (!quickTaskTitle.trim()) return;
          await createRecord<TaskPayload>(
            'task',
            quickTaskTitle.trim(),
            { subtasks: [], contextId: quickTaskCtx || null, boardColumn: 'next' },
            { doDate: activeDate, estimateMin: quickTaskMin, priority: quickTaskPri }
          );
          setQuickTaskTitle('');
          pushToast('Task added & dynamically placed on Task Calendar!');
        })}
      >
        <input
          className="dp-input"
          style={{ flex: 2, minWidth: 170 }}
          placeholder="Add task directly to dynamic Task Calendar…"
          value={quickTaskTitle}
          onChange={(e) => setQuickTaskTitle(e.target.value)}
        />
        <label className="dp-row" style={{ gap: 4, fontSize: '0.82rem' }}>
          <span className="dp-muted">Est:</span>
          <input
            type="number"
            min={5}
            max={360}
            className="dp-input"
            style={{ width: 68 }}
            value={quickTaskMin}
            onChange={(e) => setQuickTaskMin(Number(e.target.value) || 25)}
          />
          <span className="dp-muted">min</span>
        </label>
        <select className="dp-select" style={{ width: 'auto' }} value={quickTaskPri} onChange={(e) => setQuickTaskPri(e.target.value as typeof quickTaskPri)}>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="dp-select" style={{ width: 'auto' }} value={quickTaskCtx} onChange={(e) => setQuickTaskCtx(e.target.value)}>
          <option value="">Any Context</option>
          {contexts.map((c) => (
            <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
          ))}
        </select>
        <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">
          <Plus size={14} /> Schedule
        </button>
      </form>

      {/* Live Timeline Split: Calendar Commitments + Dynamic Task Placement */}
      <div className="dp-grid-2" style={{ gap: 14, alignItems: 'start' }}>
        <section className="dp-card dp-stack" style={{ padding: 14, gap: 10 }}>
          <div className="dp-between">
            <h4>
              <Clock size={16} style={{ verticalAlign: '-3px' }} /> Dynamic Task Schedule ({schedule.blocks.length})
            </h4>
            <span className="dp-pill">
              Stop by: {formatTimeDisplay(preferredEndTime, settings.timeFormat)}
            </span>
          </div>

          {schedule.blocks.length === 0 && (
            <p className="dp-muted" style={{ margin: 0, fontSize: '0.86rem' }}>
              No tasks scheduled in this window. Add a task above or widen your preferred daily end time.
            </p>
          )}

          {schedule.blocks.map((blk) => {
            const age = computeTaskAgeMetadata(blk.task, logicalToday);
            const isDone = blk.kind === 'completed_recorded' || blk.kind === 'completed_estimated';
            return (
              <div
                key={blk.task.id}
                className="dp-card dp-stack"
                style={{
                  padding: 10,
                  gap: 6,
                  borderInlineStart: `4px solid ${
                    isDone ? 'var(--dp-ok)' : blk.kind === 'planned_manual' ? '#3b6ea5' : 'var(--dp-accent)'
                  }`,
                  opacity: isDone ? 0.88 : 1,
                }}
              >
                <div className="dp-between" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <strong style={{ textDecoration: isDone ? 'line-through' : undefined }}>
                      {blk.task.title}
                    </strong>
                    <div className="dp-row" style={{ gap: 5, marginTop: 4, flexWrap: 'wrap', fontSize: '0.78rem' }}>
                      <span className="dp-pill highlight">
                        {formatTimeDisplay(blk.startTime, settings.timeFormat)} – {formatTimeDisplay(blk.endTime, settings.timeFormat)} ({blk.durationMin}m)
                      </span>
                      <span className="dp-pill">
                        {blk.kind === 'completed_recorded'
                          ? '✓ Recorded Actual'
                          : blk.kind === 'completed_estimated'
                            ? '✓ Completed (Est. Start)'
                            : blk.kind === 'planned_manual'
                              ? '📌 Manual Time'
                              : '⚡ Auto-Placed'}
                      </span>
                      {blk.contextName && <span className="dp-pill">{blk.contextName}</span>}
                      {age.ageDays > 0 && <span className="dp-muted">Age: {age.ageDays}d</span>}
                      {age.rescheduleCount > 0 && <span className="dp-muted">Carried {age.rescheduleCount}×</span>}
                    </div>
                  </div>
                  <div className="dp-row" style={{ gap: 4 }}>
                    {!isDone && (
                      <>
                        <input
                          type="time"
                          title="Manual start override"
                          aria-label={`Manual time override for ${blk.task.title}`}
                          className="dp-input"
                          style={{ width: 106, padding: '2px 6px', fontSize: '0.78rem' }}
                          value={blk.task.payload.manualStartTime || ''}
                          onChange={(e) =>
                            void updateRecord<TaskPayload>(blk.task.id, (c) => ({
                              ...c,
                              payload: { ...c.payload, manualStartTime: e.target.value || null },
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="dp-icon-btn"
                          title="Copy to main Flow Calendar"
                          onClick={async () => {
                            await scheduleActionOnCalendar(blk.task.id, activeDate, blk.startTime, blk.durationMin);
                            pushToast(`Placed "${blk.task.title}" onto main Calendar at ${blk.startTime}`);
                          }}
                        >
                          <CalendarPlus size={14} />
                        </button>
                        <button
                          type="button"
                          className="dp-btn dp-btn-primary dp-btn-sm"
                          onClick={async () => {
                            await completeActionAtomically(blk.task.id, { completedDateIso: activeDate });
                            pushToast(`Completed "${blk.task.title}" — historical placement locked!`);
                          }}
                        >
                          <Check size={13} /> Done
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </section>

        {/* Right Column: Fixed Calendar Commitments + Unfit/Overflow Tasks */}
        <div className="dp-stack" style={{ gap: 12 }}>
          <section className="dp-card dp-stack" style={{ padding: 14, gap: 8 }}>
            <h4>📅 Fixed Calendar Commitments Respected ({dayEvents.length})</h4>
            {dayEvents.length === 0 ? (
              <p className="dp-muted" style={{ margin: 0, fontSize: '0.84rem' }}>
                No fixed calendar events on {activeDate} — your entire work window is open for tasks.
              </p>
            ) : (
              dayEvents.map((ev) => (
                <div key={ev.id} className="dp-between" style={{ padding: '6px 8px', background: 'var(--dp-surface-2)', borderRadius: 6, fontSize: '0.84rem' }}>
                  <span>
                    {ev.payload.emoji || '📌'} <strong>{ev.title}</strong>
                  </span>
                  <span className="dp-muted">
                    {ev.payload.allDay
                      ? 'All day'
                      : `${formatTimeDisplay(ev.payload.startTime || '09:00', settings.timeFormat)} – ${formatTimeDisplay(ev.payload.endTime || '10:00', settings.timeFormat)}`}
                  </span>
                </div>
              ))
            )}
          </section>

          <section className="dp-card dp-stack" style={{ padding: 14, gap: 8 }}>
            <h4>⏳ Couldn&apos;t Fit Before {formatTimeDisplay(preferredEndTime, settings.timeFormat)} ({schedule.unfitTasks.length})</h4>
            {schedule.unfitTasks.length === 0 ? (
              <p className="dp-muted" style={{ margin: 0, fontSize: '0.84rem' }}>
                Everything eligible fits cleanly within your active windows today!
              </p>
            ) : (
              schedule.unfitTasks.map((t) => (
                <div key={t.id} className="dp-between" style={{ padding: '6px 8px', background: 'var(--dp-surface-2)', borderRadius: 6, fontSize: '0.84rem', gap: 8 }}>
                  <div>
                    <strong>{t.title}</strong>{' '}
                    <span className="dp-muted">({t.estimateMin ?? 25}m · {t.priority || 'normal'})</span>
                  </div>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={() =>
                      void updateRecord<TaskPayload>(t.id, (c) => ({
                        ...c,
                        doDate: addDaysIso(activeDate, 1),
                        payload: {
                          ...c.payload,
                          originalDueDate: c.payload.originalDueDate ?? c.dueDate ?? c.doDate ?? null,
                          rescheduleCount: (c.payload.rescheduleCount ?? 0) + 1,
                        },
                      }))
                    }
                  >
                    Move → Tomorrow
                  </button>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
