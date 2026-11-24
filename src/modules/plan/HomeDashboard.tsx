import React from 'react';
import { Calendar, CheckCircle2, ChefHat, Clock, Flame, Hourglass, Package, Plus } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { addDaysIso, diffDaysIso, formatDateLocalized, formatTimeDisplay } from '../../core/temporal';
import { computeChoreFreshnessAtDate, expandRecurrenceDates } from '../../core/recurrence';
import type {
  CalendarEventPayload,
  ChorePayload,
  MealPlanPayload,
  PantryLotPayload,
  TaskPayload,
} from '../../core/types';

export const HomeDashboard: React.FC = () => {
  const {
    settings,
    records,
    logicalToday,
    activeDate,
    setActiveDate,
    setActiveView,
    openEventInCalendar,
    setQuickCaptureOpen,
    runningTimers,
    startCountdownTimer,
  } = useApp();

  const tasks = records.filter((r) => r.type === 'task' && r.status === 'active') as Array<
    (typeof records)[number] & { payload: TaskPayload }
  >;
  const chores = records.filter((r) => r.type === 'chore' && r.status === 'active') as Array<
    (typeof records)[number] & { payload: ChorePayload }
  >;
  const events = records.filter((r) => r.type === 'event') as Array<
    (typeof records)[number] & { payload: CalendarEventPayload }
  >;
  const mealsToday = records.filter(
    (r) => r.type === 'meal_plan' && (r.payload as unknown as MealPlanPayload).date === activeDate
  );
  const pantryLots = records.filter((r) => r.type === 'pantry_lot') as Array<
    (typeof records)[number] & { payload: PantryLotPayload }
  >;
  const countdowns = records.filter((r) => r.type === 'countdown' || r.type === 'life_event');

  // Upcoming commitments within next 7 days
  const weekEnd = addDaysIso(activeDate, 6);
  const upcomingEvents = events
    .flatMap((ev) => {
      const dates = expandRecurrenceDates(ev.payload.startDate, ev.recurrence, {
        rangeStart: activeDate,
        rangeEnd: weekEnd,
        maxCount: 14,
      });
      return dates.map((d) => ({ ev, date: d }));
    })
    .sort((a, b) => a.date.localeCompare(b.date) || (a.ev.payload.startTime || '').localeCompare(b.ev.payload.startTime || ''))
    .slice(0, 8);

  const overdueTasks = tasks.filter((t) => t.dueDate && t.dueDate < logicalToday);
  const overdueChores = chores.filter((c) => computeChoreFreshnessAtDate(c.payload, activeDate).status === 'overdue');
  const dueChores = chores.filter((c) => computeChoreFreshnessAtDate(c.payload, activeDate).status === 'due_today');

  const pantryAlerts = pantryLots
    .map((lot) => {
      const exp = lot.payload.eatByDate || lot.payload.bestByDate;
      const days = exp ? diffDaysIso(logicalToday, exp) : 999;
      return { lot, exp, days };
    })
    .filter((x) => x.days <= 3)
    .sort((a, b) => a.days - b.days);

  return (
    <div className="dp-paper-sheet" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <div className="dp-between" style={{ marginBottom: 16 }}>
        <div>
          <h1>Home Overview</h1>
          <p className="dp-muted" style={{ margin: '4px 0 0' }}>
            {formatDateLocalized(activeDate, settings.locale)} · Logical Today: {logicalToday}
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

      {/* Clickable KPI Counters (Section 02.01) */}
      <div className="dp-kpi-grid">
        <button type="button" className="dp-kpi-card" onClick={() => setActiveView('calendar')}>
          <span className="dp-kpi-value">{upcomingEvents.filter((e) => e.date === activeDate).length}</span>
          <span className="dp-kpi-label">Events on {activeDate}</span>
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
          <span className="dp-kpi-value">{tasks.length}</span>
          <span className="dp-kpi-label">Open Tasks</span>
        </button>
      </div>

      <div className="dp-grid-2">
        <section className="dp-card dp-stack">
          <div className="dp-section-title">
            <span className="dp-row">
              <Calendar size={16} /> Upcoming Commitments (7 Days)
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
                style={{ fontSize: '0.9rem', width: '100%', padding: '5px 8px' }}
                onClick={() => openEventInCalendar(ev.id, date)}
              >
                <span>
                  {ev.payload.emoji || '📌'} <strong>{ev.title}</strong>
                </span>
                <span className="dp-pill">
                  {date} {ev.payload.startTime ? formatTimeDisplay(ev.payload.startTime, settings.timeFormat) : 'All day'}
                </span>
              </button>
            ))
          )}
        </section>

        <section className="dp-card dp-stack">
          <div className="dp-section-title">
            <span className="dp-row">
              <Clock size={16} /> Active Timers & Quick Shortcuts
            </span>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('timers')}>
              Time Suite
            </button>
          </div>
          <div className="dp-row">
            <button type="button" className="dp-btn dp-btn-primary dp-btn-sm" onClick={() => setActiveView('today')}>
              Open Today Spread
            </button>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setQuickCaptureOpen(true)}>
              <Plus size={14} /> Quick Capture
            </button>
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              onClick={() => void startCountdownTimer('Focus Sprint', 25 * 60, 'pomodoro')}
            >
              <Flame size={14} /> 25m Focus
            </button>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('rituals')}>
              Morning Kickoff
            </button>
          </div>
          <p className="dp-muted" style={{ margin: 0, fontSize: '0.84rem' }}>
            {runningTimers.length > 0
              ? `${runningTimers.length} active timer(s) running in the persistent mini-bar.`
              : 'No active timers. Start a quick 25m Focus sprint or open Timers.'}
          </p>
        </section>

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

        <section className="dp-card dp-stack">
          <div className="dp-section-title">
            <span className="dp-row">
              <Hourglass size={16} /> Overdue Watch & Countdowns
            </span>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('countdown')}>
              Countdowns
            </button>
          </div>
          {overdueTasks.length === 0 && overdueChores.length === 0 ? (
            <p className="dp-muted" style={{ margin: 0, fontSize: '0.86rem' }}>
              <CheckCircle2 size={15} style={{ verticalAlign: '-3px' }} /> Nothing overdue — calm schedule!
            </p>
          ) : (
            <div className="dp-stack" style={{ gap: 6 }}>
              {overdueTasks.slice(0, 4).map((t) => (
                <div key={t.id} className="dp-between" style={{ fontSize: '0.86rem' }}>
                  <span>⚠️ {t.title}</span>
                  <span className="dp-pill">Hard due {t.dueDate}</span>
                </div>
              ))}
              {overdueChores.slice(0, 4).map((c) => (
                <div key={c.id} className="dp-between" style={{ fontSize: '0.86rem' }}>
                  <span>🧹 {c.title}</span>
                  <span className="dp-pill">{c.payload.room}</span>
                </div>
              ))}
            </div>
          )}
          {countdowns.length > 0 && (
            <div className="dp-row" style={{ marginTop: 6 }}>
              {countdowns.slice(0, 4).map((cd) => {
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
