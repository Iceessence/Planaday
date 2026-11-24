import React, { useMemo, useState } from 'react';
import {
  AlarmClock,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ChefHat,
  Clock,
  Flame,
  Hourglass,
  Layers,
  Package,
  Play,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { addDaysIso, diffDaysIso, formatDateLocalized, formatTimeDisplay } from '../../core/temporal';
import { computeChoreFreshnessAtDate, expandRecurrenceDates } from '../../core/recurrence';
import { completeActionAtomically, timeToMinutes } from '../../core/planActions';
import { createRecord, updateRecord } from '../../core/repository';
import type {
  CalendarEventPayload,
  ChorePayload,
  HabitPayload,
  LifeRecord,
  MealPlanPayload,
  PantryLotPayload,
  TaskPayload,
} from '../../core/types';

export const HomeDashboard: React.FC = () => {
  const {
    settings,
    records,
    allWorkspaceRecords,
    logicalToday,
    activeDate,
    setActiveDate,
    setActiveView,
    openEventInCalendar,
    setQuickCaptureOpen,
    runningTimers,
    startCountdownTimer,
    pushToast,
  } = useApp();

  const [quickTaskTitle, setQuickTaskTitle] = useState('');

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const greeting =
    now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';

  const activeProfile =
    settings.activeProfileId === 'all'
      ? null
      : settings.familyProfiles.find((p) => p.id === settings.activeProfileId) ?? null;

  const allTasks = records.filter((r) => r.type === 'task') as Array<LifeRecord<TaskPayload>>;
  const activeTasks = allTasks.filter((t) => t.status === 'active');
  const todayTasks = allTasks.filter((t) => t.doDate === activeDate);
  const todayTasksDone = todayTasks.filter((t) => t.status === 'done').length;

  const chores = records.filter((r) => r.type === 'chore' && r.status === 'active') as Array<LifeRecord<ChorePayload>>;
  const events = records.filter((r) => r.type === 'event') as Array<LifeRecord<CalendarEventPayload>>;
  const habits = records.filter((r) => r.type === 'habit' && r.status === 'active') as Array<LifeRecord<HabitPayload>>;
  const alarms = records.filter((r) => r.type === 'alarm' && r.status === 'active');
  const mealsToday = records.filter(
    (r) => r.type === 'meal_plan' && (r.payload as unknown as MealPlanPayload).date === activeDate
  );
  const pantryLots = records.filter((r) => r.type === 'pantry_lot') as Array<LifeRecord<PantryLotPayload>>;
  const countdowns = records.filter((r) => r.type === 'countdown' || r.type === 'life_event');

  // Shared Important Family Notices across profiles (next 14 days!)
  const twoWeeksEnd = addDaysIso(logicalToday, 14);
  const sharedImportantItems = useMemo(() => {
    const out: Array<{ id: string; kind: string; title: string; date: string; time?: string; ownerName?: string }> = [];
    for (const r of allWorkspaceRecords) {
      if (r.status !== 'active' || !r.isImportant) continue;
      if (!r.sharedWithAll && !(r.sharedWithProfileIds?.length)) continue;
      const owner = r.ownerProfileId ? settings.familyProfiles.find((p) => p.id === r.ownerProfileId)?.name : undefined;
      if (r.type === 'event') {
        const ep = r.payload as CalendarEventPayload;
        if (ep.startDate >= logicalToday && ep.startDate <= twoWeeksEnd) {
          out.push({ id: r.id, kind: 'Event', title: r.title, date: ep.startDate, time: ep.startTime, ownerName: owner });
        }
      } else if (r.type === 'task') {
        const dt = r.dueDate || r.doDate || logicalToday;
        if (dt <= twoWeeksEnd) out.push({ id: r.id, kind: 'Task', title: r.title, date: dt, ownerName: owner });
      } else if (r.type === 'chore') {
        const cp = r.payload as ChorePayload;
        if (cp.nextDueDate <= twoWeeksEnd) out.push({ id: r.id, kind: 'Chore', title: r.title, date: cp.nextDueDate, ownerName: owner });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  }, [allWorkspaceRecords, logicalToday, twoWeeksEnd, settings.familyProfiles]);

  // Upcoming commitments within next 7 days
  const weekEnd = addDaysIso(activeDate, 6);
  const upcomingEvents = useMemo(() => {
    return events
      .flatMap((ev) => {
        const dates = expandRecurrenceDates(ev.payload.startDate, ev.recurrence, {
          rangeStart: activeDate,
          rangeEnd: weekEnd,
          maxCount: 14,
        });
        return dates.map((d) => ({ ev, date: d }));
      })
      .filter(({ ev, date }) => {
        if (date !== logicalToday || ev.payload.allDay || !ev.payload.startTime) return true;
        const endM = timeToMinutes(ev.payload.endTime || ev.payload.startTime);
        return endM > nowMin;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || (a.ev.payload.startTime || '').localeCompare(b.ev.payload.startTime || ''))
      .slice(0, 8);
  }, [events, activeDate, weekEnd, logicalToday, nowMin]);

  // Right Now / Next Up Hero Event for today
  const nextUpToday = useMemo(() => {
    const todayEvs = upcomingEvents.filter((x) => x.date === logicalToday && !x.ev.payload.allDay && x.ev.payload.startTime);
    if (todayEvs.length === 0) return null;
    const item = todayEvs[0];
    const startM = timeToMinutes(item.ev.payload.startTime || '09:00');
    const endM = timeToMinutes(item.ev.payload.endTime || '10:00');
    const isNow = nowMin >= startM && nowMin < endM;
    const minsUntil = Math.max(0, startM - nowMin);
    const durMin = Math.max(5, endM - startM);
    return { ev: item.ev, isNow, minsUntil, durMin };
  }, [upcomingEvents, logicalToday, nowMin]);

  const overdueTasks = activeTasks.filter((t) => t.dueDate && t.dueDate < logicalToday);
  const overdueChores = chores.filter((c) => computeChoreFreshnessAtDate(c.payload, activeDate).status === 'overdue');
  const dueChores = chores.filter((c) => computeChoreFreshnessAtDate(c.payload, activeDate).status === 'due_today');
  const actionableChores = [...overdueChores, ...dueChores];

  const habitsDoneToday = habits.filter((h) => (h.payload.logs?.[activeDate]?.value ?? 0) > 0).length;
  const totalDayTargets = todayTasks.length + actionableChores.length + habits.length;
  const completedDayTargets = todayTasksDone + habitsDoneToday;
  const dayProgressPct = totalDayTargets > 0 ? Math.min(100, Math.round((completedDayTargets / totalDayTargets) * 100)) : 0;

  const nextAlarm = alarms
    .filter((a) => (a.payload as { enabled?: boolean; skipNext?: boolean }).enabled && !(a.payload as { skipNext?: boolean }).skipNext)
    .sort((a, b) => String((a.payload as { time?: string }).time || '').localeCompare(String((b.payload as { time?: string }).time || '')))[0];

  const pantryAlerts = pantryLots
    .map((lot) => {
      const exp = lot.payload.eatByDate || lot.payload.bestByDate;
      const days = exp ? diffDaysIso(logicalToday, exp) : 999;
      return { lot, exp, days };
    })
    .filter((x) => x.days <= 3)
    .sort((a, b) => a.days - b.days);

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)', gap: 16 }}>
      {/* Personalized Greeting & Date Control */}
      <div className="dp-between">
        <div>
          <h1>
            {greeting}
            {activeProfile ? `, ${activeProfile.emoji} ${activeProfile.name}` : ` · ${settings.plannerTitle}`}
          </h1>
          <p className="dp-muted" style={{ margin: '4px 0 0' }}>
            {formatDateLocalized(activeDate, settings.locale)} · Logical Today: {logicalToday}
            {totalDayTargets > 0 && ` · Daily progress: ${dayProgressPct}%`}
          </p>
        </div>
        <div className="dp-row">
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(addDaysIso(activeDate, -1))}>
            ← Prev
          </button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(logicalToday)}>
            Today
          </button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(addDaysIso(activeDate, 1))}>
            Next →
          </button>
          <input
            aria-label="Pick active date"
            type="date"
            className="dp-input"
            style={{ width: 'auto', padding: '4px 8px' }}
            value={activeDate}
            onChange={(e) => e.target.value && setActiveDate(e.target.value)}
          />
        </div>
      </div>

      {/* Daily Progress Strip & Quick Action Launchpad */}
      <div className="dp-card dp-stack" style={{ padding: 12, gap: 10 }}>
        <div className="dp-between">
          <strong style={{ fontSize: '0.88rem' }}>
            Today&apos;s Momentum ({completedDayTargets}/{totalDayTargets || 1} core targets)
          </strong>
          <div className="dp-row" style={{ gap: 6 }}>
            <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={() => setActiveView('today')}>
              Open Today Spread
            </button>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setQuickCaptureOpen(true)}>
              <Plus size={14} /> Quick Capture
            </button>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('all_in_one')}>
              <Layers size={14} /> All-in-One
            </button>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('guide')}>
              <BookOpen size={14} /> App Guide
            </button>
          </div>
        </div>
        <div className="dp-progress-track">
          <div className="dp-progress-fill" style={{ width: `${dayProgressPct}%`, background: 'var(--dp-ok)' }} />
        </div>
      </div>

      {/* Shared Family Important Board */}
      {sharedImportantItems.length > 0 && (
        <div className="dp-card dp-stack" style={{ padding: 14, borderColor: 'var(--dp-accent)', background: 'color-mix(in oklch, var(--dp-highlight) 35%, var(--dp-paper))' }}>
          <div className="dp-between">
            <strong className="dp-row" style={{ fontSize: '0.92rem' }}>
              <Users size={16} /> Important Shared Family Notices ({sharedImportantItems.length})
            </strong>
            <span className="dp-muted" style={{ fontSize: '0.78rem' }}>Visible across shared family profiles</span>
          </div>
          <div className="dp-grid-2" style={{ gap: 8 }}>
            {sharedImportantItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="dp-card dp-between"
                style={{ padding: '8px 10px', cursor: 'pointer', textAlign: 'start' }}
                onClick={() => {
                  if (item.kind === 'Event') openEventInCalendar(item.id, item.date);
                  else if (item.kind === 'Chore') setActiveView('chores');
                  else setActiveView('tasks');
                }}
              >
                <div>
                  <strong>★ {item.title}</strong>
                  <div className="dp-muted" style={{ fontSize: '0.76rem' }}>
                    {item.kind} · {item.date}
                    {item.time ? ` at ${formatTimeDisplay(item.time, settings.timeFormat)}` : ''}
                    {item.ownerName ? ` · Shared by ${item.ownerName}` : ''}
                  </div>
                </div>
                <span className="dp-pill highlight">{item.date === logicalToday ? 'Today' : item.date}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Right Now / Up Next Hero Banner */}
      {nextUpToday && (
        <div className="dp-card dp-between" style={{ padding: 14, borderInlineStart: `5px solid ${nextUpToday.ev.color || 'var(--dp-accent)'}` }}>
          <div>
            <div className="dp-row" style={{ gap: 6, marginBottom: 4 }}>
              <span className="dp-pill" style={{ borderColor: nextUpToday.isNow ? 'var(--dp-danger)' : 'var(--dp-accent)', color: nextUpToday.isNow ? 'var(--dp-danger)' : 'var(--dp-accent)' }}>
                {nextUpToday.isNow ? '● Happening Now' : `Next Up in ${nextUpToday.minsUntil >= 60 ? `${Math.floor(nextUpToday.minsUntil / 60)}h ${nextUpToday.minsUntil % 60}m` : `${nextUpToday.minsUntil}m`}`}
              </span>
              {nextUpToday.ev.category && <span className="dp-pill">{nextUpToday.ev.category}</span>}
            </div>
            <strong style={{ fontSize: '1.1rem' }}>
              {nextUpToday.ev.payload.emoji || '📌'} {nextUpToday.ev.title}
            </strong>
            <div className="dp-muted" style={{ fontSize: '0.84rem' }}>
              {formatTimeDisplay(nextUpToday.ev.payload.startTime || '09:00', settings.timeFormat)} –{' '}
              {formatTimeDisplay(nextUpToday.ev.payload.endTime || '10:00', settings.timeFormat)}
              {nextUpToday.ev.payload.location ? ` · 📍 ${nextUpToday.ev.payload.location}` : ''}
            </div>
          </div>
          <div className="dp-row">
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              onClick={() => void startCountdownTimer(nextUpToday.ev.title, nextUpToday.durMin * 60, 'countdown', nextUpToday.ev.id)}
            >
              <Play size={13} /> Start {nextUpToday.durMin}m Timer
            </button>
            <button
              type="button"
              className="dp-btn dp-btn-primary dp-btn-sm"
              onClick={() => openEventInCalendar(nextUpToday.ev.id, logicalToday)}
            >
              Open Event
            </button>
          </div>
        </div>
      )}

      {/* Clickable KPI Counters */}
      <div className="dp-kpi-grid" style={{ marginBottom: 0 }}>
        <button type="button" className="dp-kpi-card" onClick={() => setActiveView('calendar')}>
          <span className="dp-kpi-value">{upcomingEvents.filter((e) => e.date === activeDate).length}</span>
          <span className="dp-kpi-label">Remaining Today</span>
        </button>
        <button type="button" className="dp-kpi-card" onClick={() => setActiveView('chores')}>
          <span className="dp-kpi-value" style={{ color: overdueChores.length ? 'var(--dp-danger)' : undefined }}>
            {overdueChores.length}
          </span>
          <span className="dp-kpi-label">Overdue Chores</span>
        </button>
        <button type="button" className="dp-kpi-card" onClick={() => setActiveView('chores')}>
          <span className="dp-kpi-value">{dueChores.length}</span>
          <span className="dp-kpi-label">Chores Due Today</span>
        </button>
        <button type="button" className="dp-kpi-card" onClick={() => setActiveView('tasks')}>
          <span className="dp-kpi-value">{activeTasks.length}</span>
          <span className="dp-kpi-label">Open Tasks</span>
        </button>
      </div>

      {/* Main Actionable 2-Column Command Grid */}
      <div className="dp-grid-2">
        {/* Interactive Today's Tasks Right on Home */}
        <section className="dp-card dp-stack">
          <div className="dp-section-title">
            <span className="dp-row">
              <CheckCircle2 size={16} /> Today&apos;s Action List ({todayTasksDone}/{todayTasks.length})
            </span>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('tasks')}>
              All Tasks
            </button>
          </div>
          <form
            className="dp-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!quickTaskTitle.trim()) return;
              await createRecord<TaskPayload>('task', quickTaskTitle.trim(), { subtasks: [], boardColumn: 'next' }, { doDate: activeDate, estimateMin: 20 });
              setQuickTaskTitle('');
              pushToast('Added task to Today', { canUndo: true });
            }}
          >
            <input
              className="dp-input"
              style={{ flex: 1 }}
              placeholder="Quick add a task for today…"
              value={quickTaskTitle}
              onChange={(e) => setQuickTaskTitle(e.target.value)}
            />
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">
              <Plus size={14} /> Add
            </button>
          </form>
          {todayTasks.length === 0 ? (
            <p className="dp-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
              No tasks planned for {activeDate} yet. Add one above!
            </p>
          ) : (
            <div className="dp-stack" style={{ gap: 5 }}>
              {todayTasks.slice(0, 6).map((t) => (
                <label key={t.id} className="dp-between" style={{ padding: '4px 6px', borderBottom: '1px dotted var(--dp-border)', cursor: 'pointer' }}>
                  <span className="dp-row">
                    <input
                      type="checkbox"
                      checked={t.status === 'done'}
                      onChange={async () => {
                        await completeActionAtomically(t.id, { completedDateIso: activeDate });
                        pushToast(`Updated "${t.title}"`, { canUndo: true });
                      }}
                    />
                    <span style={{ textDecoration: t.status === 'done' ? 'line-through' : undefined }}>
                      {t.isImportant ? '★ ' : ''}{t.title}
                    </span>
                  </span>
                  {t.estimateMin && <span className="dp-pill">{t.estimateMin}m</span>}
                </label>
              ))}
            </div>
          )}
        </section>

        {/* Actionable Chores Due / Overdue Right on Home */}
        <section className="dp-card dp-stack">
          <div className="dp-section-title">
            <span className="dp-row">
              <Sparkles size={16} /> Chores Needing Attention ({actionableChores.length})
            </span>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('chores')}>
              Chores
            </button>
          </div>
          {actionableChores.length === 0 ? (
            <p className="dp-muted" style={{ margin: 0, fontSize: '0.86rem' }}>
              <CheckCircle2 size={15} style={{ verticalAlign: '-3px' }} /> All rooms fresh — no chores due right now!
            </p>
          ) : (
            <div className="dp-stack" style={{ gap: 6 }}>
              {actionableChores.slice(0, 6).map((c) => {
                const isOver = computeChoreFreshnessAtDate(c.payload, activeDate).status === 'overdue';
                return (
                  <div key={c.id} className="dp-between" style={{ padding: '5px 8px', background: 'var(--dp-surface-2)', borderRadius: 8 }}>
                    <div>
                      <strong>{c.isImportant ? '★ ' : ''}{c.title}</strong>
                      <div className="dp-muted" style={{ fontSize: '0.76rem' }}>
                        {c.payload.room} · <span style={{ color: isOver ? 'var(--dp-danger)' : undefined }}>{isOver ? 'Overdue' : 'Due today'}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="dp-btn dp-btn-primary dp-btn-sm"
                      onClick={async () => {
                        await completeActionAtomically(c.id, { completedDateIso: logicalToday });
                        pushToast(`Completed chore "${c.title}"!`, { canUndo: true });
                      }}
                    >
                      <Check size={13} /> Done
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Upcoming Commitments (7 Days) */}
        <section className="dp-card dp-stack">
          <div className="dp-section-title">
            <span className="dp-row">
              <Calendar size={16} /> Upcoming Schedule (7 Days)
            </span>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('calendar')}>
              Flow Calendar
            </button>
          </div>
          {upcomingEvents.length === 0 ? (
            <p className="dp-muted" style={{ margin: 0 }}>
              Clear horizon for the next 7 days.
            </p>
          ) : (
            upcomingEvents.map(({ ev, date }) => (
              <button
                key={`${ev.id}-${date}`}
                type="button"
                className="dp-btn dp-btn-ghost dp-between"
                style={{ fontSize: '0.88rem', width: '100%', padding: '5px 8px' }}
                onClick={() => openEventInCalendar(ev.id, date)}
              >
                <span>
                  {ev.isImportant ? '★ ' : ''}
                  {ev.payload.emoji || '📌'} <strong>{ev.title}</strong>
                </span>
                <span className="dp-pill">
                  {date === logicalToday ? 'Today' : date}{' '}
                  {ev.payload.startTime ? formatTimeDisplay(ev.payload.startTime, settings.timeFormat) : 'All day'}
                </span>
              </button>
            ))
          )}
        </section>

        {/* Active Timers, Quick Timers & Next Alarm */}
        <section className="dp-card dp-stack">
          <div className="dp-section-title">
            <span className="dp-row">
              <Clock size={16} /> Timers, Focus & Next Alarm
            </span>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('timers')}>
              Time Suite
            </button>
          </div>
          <div className="dp-row" style={{ gap: 6 }}>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => void startCountdownTimer('Quick 45s', 45, 'countdown')}>
              45s
            </button>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => void startCountdownTimer('5m Reset', 5 * 60, 'countdown')}>
              5m
            </button>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => void startCountdownTimer('10m Tidy', 10 * 60, 'countdown')}>
              10m
            </button>
            <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={() => void startCountdownTimer('Focus Sprint', 25 * 60, 'pomodoro')}>
              <Flame size={13} /> 25m Focus
            </button>
          </div>
          <div className="dp-muted" style={{ fontSize: '0.84rem' }}>
            {runningTimers.length > 0
              ? `${runningTimers.length} active timer(s) running in the top mini-bar.`
              : 'No active timers right now.'}
          </div>
          {nextAlarm && (
            <div className="dp-between" style={{ padding: '6px 10px', background: 'var(--dp-surface-2)', borderRadius: 8, fontSize: '0.84rem' }}>
              <span className="dp-row">
                <AlarmClock size={14} /> Next Alarm: <strong>{nextAlarm.title}</strong>
              </span>
              <span className="dp-pill">{(nextAlarm.payload as { time?: string }).time}</span>
            </div>
          )}

          {/* 1-Tap Habits Strip */}
          {habits.length > 0 && (
            <div className="dp-stack" style={{ gap: 6, marginTop: 4 }}>
              <strong style={{ fontSize: '0.84rem' }}>Today&apos;s Habits ({habitsDoneToday}/{habits.length})</strong>
              <div className="dp-row" style={{ gap: 5 }}>
                {habits.slice(0, 6).map((h) => {
                  const done = (h.payload.logs?.[activeDate]?.value ?? 0) > 0;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      className={`dp-btn dp-btn-sm ${done ? 'dp-btn-primary' : ''}`}
                      onClick={() =>
                        void updateRecord<HabitPayload>(h.id, (cur) => ({
                          ...cur,
                          payload: {
                            ...cur.payload,
                            logs: {
                              ...(cur.payload.logs ?? {}),
                              [activeDate]: { value: done ? 0 : (cur.payload.targetQuantity ?? 1) },
                            },
                          },
                        }))
                      }
                    >
                      {done ? '✓ ' : ''}{h.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Meals & Pantry Freshness Alerts */}
        <section className="dp-card dp-stack">
          <div className="dp-section-title">
            <span className="dp-row">
              <ChefHat size={16} /> Meals & Pantry Freshness Alerts
            </span>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('meals')}>
              Meal Plan
            </button>
          </div>
          {mealsToday.length === 0 ? (
            <p className="dp-muted" style={{ margin: 0, fontSize: '0.86rem' }}>
              No meals planned for {activeDate} yet.
            </p>
          ) : (
            mealsToday.map((m) => {
              const mp = m.payload as unknown as MealPlanPayload;
              return (
                <div key={m.id} className="dp-between">
                  <span>
                    <strong style={{ textTransform: 'capitalize' }}>{mp.slot}:</strong> {m.title}
                  </span>
                  {mp.deletedRecipeName && <span className="dp-pill">Deleted Recipe</span>}
                </div>
              );
            })
          )}
          {pantryAlerts.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <strong style={{ fontSize: '0.84rem', color: 'var(--dp-warn)' }}>
                <Package size={14} style={{ verticalAlign: '-2px' }} /> Use Soon / Expiring Pantry Lots:
              </strong>
              <div className="dp-row" style={{ marginTop: 6 }}>
                {pantryAlerts.slice(0, 5).map(({ lot, days }) => (
                  <button
                    key={lot.id}
                    type="button"
                    className="dp-pill"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setActiveView('pantry')}
                  >
                    {lot.payload.ingredientName} ({days < 0 ? 'Expired' : days === 0 ? 'Today' : `${days}d`})
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Overdue Hard Deadlines & Countdowns */}
        <section className="dp-card dp-stack">
          <div className="dp-section-title">
            <span className="dp-row">
              <Hourglass size={16} /> Deadlines & Countdowns
            </span>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('countdown')}>
              Countdowns
            </button>
          </div>
          {overdueTasks.length === 0 ? (
            <p className="dp-muted" style={{ margin: 0, fontSize: '0.86rem' }}>
              <CheckCircle2 size={15} style={{ verticalAlign: '-3px' }} /> Zero missed hard deadlines!
            </p>
          ) : (
            <div className="dp-stack" style={{ gap: 6 }}>
              {overdueTasks.slice(0, 4).map((t) => (
                <div key={t.id} className="dp-between" style={{ fontSize: '0.86rem' }}>
                  <span>⚠️ {t.title}</span>
                  <span className="dp-pill">Hard due {t.dueDate}</span>
                </div>
              ))}
            </div>
          )}
          {countdowns.length > 0 && (
            <div className="dp-row" style={{ marginTop: 6 }}>
              {countdowns.slice(0, 5).map((cd) => {
                const target = String((cd.payload as { targetDate?: string; date?: string }).targetDate ?? (cd.payload as { date?: string }).date ?? logicalToday);
                const d = diffDaysIso(logicalToday, target);
                return (
                  <span key={cd.id} className="dp-pill highlight">
                    {cd.title}: {d >= 0 ? `${d}d left` : `${Math.abs(d)}d ago`}
                  </span>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
