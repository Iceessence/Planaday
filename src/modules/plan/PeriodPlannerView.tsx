import React, { useMemo, useState } from 'react';
import { useApp } from '../../core/AppContext';
import { addDaysIso, formatDateLocalized, getWeekdayIso } from '../../core/temporal';
import { expandRecurrenceDates } from '../../core/recurrence';
import { createRecord, updateRecord } from '../../core/repository';
import { findFreeTimeGaps, minutesToTime, timeToMinutes } from '../../core/planActions';
import type {
  CalendarEventPayload,
  DiaryPayload,
  LifeRecord,
  MealPlanPayload,
} from '../../core/types';

export const PeriodPlannerView: React.FC = () => {
  const { settings, patchSettings, records, activeDate, setActiveDate, logicalToday, setActiveView } = useApp();
  const [periodTab, setPeriodTab] = useState<'week' | 'month' | 'year' | 'agenda'>('week');
  const [monthAgendaMode, setMonthAgendaMode] = useState(false);

  const events = records.filter((r) => r.type === 'event') as Array<LifeRecord<CalendarEventPayload>>;
  const meals = records.filter((r) => r.type === 'meal_plan') as Array<LifeRecord<MealPlanPayload>>;
  const diaries = records.filter((r) => r.type === 'diary') as Array<LifeRecord<DiaryPayload>>;

  // Week range starting Sun or Mon
  const weekDays = useMemo(() => {
    const dow = getWeekdayIso(activeDate);
    const diff = settings.weekStartsOn === 1 ? (dow === 0 ? -6 : 1 - dow) : -dow;
    const start = addDaysIso(activeDate, diff);
    const all7 = Array.from({ length: 7 }, (_, i) => addDaysIso(start, i));
    return settings.showWeekends ? all7 : all7.filter((d) => ![0, 6].includes(getWeekdayIso(d)));
  }, [activeDate, settings.weekStartsOn, settings.showWeekends]);

  // 42-day Month grid (Section 06.02)
  const monthGrid = useMemo(() => {
    const [y, m] = activeDate.split('-').map(Number);
    const first = `${y}-${String(m).padStart(2, '0')}-01`;
    const firstDow = getWeekdayIso(first);
    const lead = settings.weekStartsOn === 1 ? (firstDow === 0 ? 6 : firstDow - 1) : firstDow;
    const gridStart = addDaysIso(first, -lead);
    return Array.from({ length: 42 }, (_, i) => {
      const iso = addDaysIso(gridStart, i);
      return { iso, inMonth: Number(iso.slice(5, 7)) === m };
    });
  }, [activeDate, settings.weekStartsOn]);

  // Period reflection note
  const periodKey =
    periodTab === 'week'
      ? `week:${weekDays[0]}`
      : periodTab === 'month'
        ? `month:${activeDate.slice(0, 7)}`
        : `year:${activeDate.slice(0, 4)}`;

  const reflectionRec = records.find(
    (r) => r.type === 'period_reflection' && (r.payload as { periodKey?: string }).periodKey === periodKey
  );
  const reflectionText = String((reflectionRec?.payload as { notes?: string } | undefined)?.notes ?? '');

  const saveReflection = async (notes: string) => {
    if (reflectionRec) {
      await updateRecord(reflectionRec.id, (c) => ({ ...c, payload: { ...c.payload, notes } }), { skipUndo: true });
    } else {
      await createRecord('period_reflection', `Reflection ${periodKey}`, { periodKey, notes }, {}, { skipUndo: true });
    }
  };

  // Year in Pixels mosaic data (365/366 days — visually distinguishing missing vs low!)
  const yearNum = Number(activeDate.slice(0, 4));
  const diaryByDate = useMemo(() => new Map(diaries.map((d) => [d.payload.date, d.payload])), [diaries]);

  const moodToColor = (mood?: string) => {
    if (!mood) return 'transparent'; // Missing day clearly distinct from low values!
    if (mood === 'Great') return '#3e7a5d';
    if (mood === 'Good') return '#76a882';
    if (mood === 'Okay') return '#d4b46a';
    if (mood === 'Low') return '#d4845a';
    return '#b5453a';
  };

  const eventsOnDate = (d: string) =>
    events.filter((ev) => {
      if (ev.recurrence) {
        return expandRecurrenceDates(ev.payload.startDate, ev.recurrence, { rangeStart: d, rangeEnd: d, maxCount: 1 }).length > 0;
      }
      return ev.payload.startDate <= d && (ev.payload.endDate || ev.payload.startDate) >= d;
    });

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <div className="dp-between">
        <div className="dp-row">
          <h2>Period Planner</h2>
          {(['week', 'month', 'year', 'agenda'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`dp-btn dp-btn-sm ${periodTab === t ? 'dp-btn-primary' : ''}`}
              style={{ textTransform: 'capitalize' }}
              onClick={() => setPeriodTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="dp-row">
          <button
            type="button"
            className="dp-btn dp-btn-sm"
            onClick={() => setActiveDate(addDaysIso(activeDate, periodTab === 'week' ? -7 : periodTab === 'month' ? -30 : -365))}
          >
            ← Prev
          </button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveDate(logicalToday)}>
            Today
          </button>
          <button
            type="button"
            className="dp-btn dp-btn-sm"
            onClick={() => setActiveDate(addDaysIso(activeDate, periodTab === 'week' ? 7 : periodTab === 'month' ? 30 : 365))}
          >
            Next →
          </button>
          {periodTab === 'week' && (
            <label className="dp-row" style={{ fontSize: '0.82rem' }}>
              <input
                type="checkbox"
                checked={settings.showWeekends}
                onChange={(e) => void patchSettings({ showWeekends: e.target.checked })}
              />
              <span>Weekends</span>
            </label>
          )}
        </div>
      </div>

      {periodTab === 'week' && (
        <div className="dp-grid-3" style={{ gridTemplateColumns: `repeat(${weekDays.length}, minmax(135px, 1fr))`, overflowX: 'auto' }}>
          {weekDays.map((d) => {
            const evs = eventsOnDate(d);
            const dayMeals = meals.filter((m) => m.payload.date === d);
            const gaps = findFreeTimeGaps(
              evs
                .filter((e) => !e.payload.allDay && e.payload.startTime)
                .map((e) => ({
                  startMin: timeToMinutes(e.payload.startTime!),
                  endMin: timeToMinutes(e.payload.endTime || '10:00'),
                }))
            );
            const freeHours = (gaps.reduce((s, g) => s + g.durationMin, 0) / 60).toFixed(1);
            return (
              <div
                key={d}
                className="dp-card dp-stack"
                style={{
                  padding: 10,
                  gap: 8,
                  borderColor: d === logicalToday ? 'var(--dp-accent)' : undefined,
                }}
              >
                <button
                  type="button"
                  className="dp-btn dp-btn-ghost dp-btn-sm"
                  style={{ justifyContent: 'space-between', padding: 0 }}
                  onClick={() => {
                    setActiveDate(d);
                    setActiveView('today');
                  }}
                >
                  <strong>{formatDateLocalized(d, settings.locale, { weekday: 'short', day: 'numeric' })}</strong>
                  <span className="dp-muted" style={{ fontSize: '0.74rem' }}>{freeHours}h free</span>
                </button>
                {evs.map((e) => (
                  <div key={e.id} className="dp-pill" style={{ borderInlineStart: `3px solid ${e.color || 'var(--dp-accent)'}` }}>
                    {e.payload.emoji || ''} {e.title}
                  </div>
                ))}
                {dayMeals.length > 0 && (
                  <div className="dp-muted" style={{ fontSize: '0.76rem', borderTop: '1px dashed var(--dp-border)', paddingTop: 4 }}>
                    🍽️ {dayMeals.map((m) => m.title).join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {periodTab === 'month' && (
        <div className="dp-stack">
          <div className="dp-between">
            <h3>{formatDateLocalized(`${activeDate.slice(0, 7)}-01`, settings.locale, { month: 'long', year: 'numeric' })}</h3>
            <button type="button" className="dp-btn dp-btn-sm" onClick={() => setMonthAgendaMode((v) => !v)}>
              {monthAgendaMode ? 'Switch to 42-Day Grid' : 'Switch to Agenda List'}
            </button>
          </div>
          {monthAgendaMode ? (
            <div className="dp-stack" style={{ gap: 6 }}>
              {monthGrid
                .filter((c) => c.inMonth)
                .map(({ iso }) => {
                  const evs = eventsOnDate(iso);
                  if (evs.length === 0) return null;
                  return (
                    <div key={iso} className="dp-card dp-between" style={{ padding: 10 }}>
                      <strong>{iso}</strong>
                      <div className="dp-row">
                        {evs.map((e) => (
                          <span key={e.id} className="dp-pill">{e.title}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="dp-month-grid">
              {monthGrid.map(({ iso, inMonth }) => {
                const evs = eventsOnDate(iso);
                return (
                  <div
                    key={iso}
                    className={`dp-month-cell ${inMonth ? '' : 'outside'} ${iso === logicalToday ? 'today' : ''}`}
                    onClick={() => {
                      setActiveDate(iso);
                      setActiveView('today');
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <strong style={{ fontSize: '0.8rem' }}>{Number(iso.slice(8, 10))}</strong>
                    {evs.slice(0, 3).map((e) => (
                      <div
                        key={e.id}
                        style={{
                          fontSize: '0.72rem',
                          padding: '1px 5px',
                          borderRadius: 4,
                          background: e.color || 'var(--dp-accent)',
                          color: '#fff',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {e.title}
                      </div>
                    ))}
                    {evs.length > 3 && <span className="dp-muted" style={{ fontSize: '0.7rem' }}>+{evs.length - 3} more</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {periodTab === 'year' && (
        <div className="dp-stack">
          <h3>{yearNum} — Year in Pixels & 12 Mini-Months</h3>
          <div className="dp-card dp-stack" style={{ padding: 12 }}>
            <div className="dp-between">
              <strong>Year in Pixels (Mood Mosaic)</strong>
              <div className="dp-row" style={{ fontSize: '0.74rem' }}>
                <span>Empty border = Missing day</span>
                {(['Great', 'Good', 'Okay', 'Low', 'Rough'] as const).map((m) => (
                  <span key={m} className="dp-row" style={{ gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: moodToColor(m), display: 'inline-block' }} />
                    {m}
                  </span>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(12px, 1fr))', gap: 3 }}>
              {Array.from({ length: 365 }, (_, i) => {
                const iso = addDaysIso(`${yearNum}-01-01`, i);
                if (Number(iso.slice(0, 4)) !== yearNum) return null;
                const d = diaryByDate.get(iso);
                return (
                  <button
                    key={iso}
                    type="button"
                    title={`${iso}: ${d?.mood ?? 'No entry logged'}`}
                    onClick={() => {
                      setActiveDate(iso);
                      setActiveView('diary');
                    }}
                    style={{
                      width: 12,
                      height: 12,
                      padding: 0,
                      borderRadius: 2,
                      border: '1px solid var(--dp-border)',
                      background: moodToColor(d?.mood),
                      cursor: 'pointer',
                    }}
                  />
                );
              })}
            </div>
          </div>

          <div className="dp-grid-3">
            {Array.from({ length: 12 }, (_, mIdx) => {
              const mm = String(mIdx + 1).padStart(2, '0');
              const monthPrefix = `${yearNum}-${mm}`;
              const count = events.filter((e) => e.payload.startDate.startsWith(monthPrefix)).length;
              return (
                <button
                  key={mm}
                  type="button"
                  className="dp-card dp-between"
                  style={{ cursor: 'pointer', padding: 12 }}
                  onClick={() => {
                    setActiveDate(`${monthPrefix}-01`);
                    setPeriodTab('month');
                  }}
                >
                  <strong>{formatDateLocalized(`${monthPrefix}-01`, settings.locale, { month: 'long' })}</strong>
                  <span className="dp-pill">{count} events</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {periodTab === 'agenda' && (
        <div className="dp-stack">
          <h3>Next 30 Days Agenda & Availability</h3>
          {Array.from({ length: 30 }, (_, i) => addDaysIso(activeDate, i)).map((d) => {
            const evs = eventsOnDate(d);
            if (evs.length === 0) return null;
            const gaps = findFreeTimeGaps(
              evs
                .filter((e) => !e.payload.allDay && e.payload.startTime)
                .map((e) => ({
                  startMin: timeToMinutes(e.payload.startTime!),
                  endMin: timeToMinutes(e.payload.endTime || '10:00'),
                }))
            );
            return (
              <div key={d} className="dp-card dp-stack" style={{ padding: 10, gap: 6 }}>
                <div className="dp-between">
                  <strong>{formatDateLocalized(d, settings.locale)}</strong>
                  <span className="dp-muted" style={{ fontSize: '0.8rem' }}>
                    Next open slot: {gaps[0] ? `${minutesToTime(gaps[0].startMin)} (${gaps[0].durationMin}m)` : 'Full'}
                  </span>
                </div>
                {evs.map((e) => (
                  <div key={e.id} className="dp-between" style={{ fontSize: '0.88rem' }}>
                    <span>{e.payload.emoji || '📌'} {e.title}</span>
                    <span className="dp-pill">{e.payload.allDay ? 'All day' : `${e.payload.startTime}–${e.payload.endTime}`}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Period Reflection Notes */}
      <div className="dp-card dp-stack" style={{ padding: 12 }}>
        <strong>Period Reflection ({periodKey})</strong>
        <textarea
          className="dp-textarea"
          style={{ minHeight: 72 }}
          placeholder="Wins, intentions, and adjustments for this period…"
          value={reflectionText}
          onChange={(e) => void saveReflection(e.target.value)}
        />
      </div>
    </div>
  );
};
