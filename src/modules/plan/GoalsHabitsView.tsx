import React, { useMemo, useState } from 'react';
import { CalendarPlus, Flame, Play, Plus, Target } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, updateRecord } from '../../core/repository';
import { scheduleActionOnCalendar } from '../../core/planActions';
import { addDaysIso } from '../../core/temporal';
import { createId } from '../../core/db';
import type { GoalPayload, HabitPayload, LifeRecord } from '../../core/types';

function computeHabitStats(habit: HabitPayload, todayIso: string) {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = addDaysIso(todayIso, -i);
    const entry = habit.logs?.[d];
    if (entry && (entry.value > 0 || entry.excused)) {
      streak++;
    } else if (i === 0) {
      continue; // Today isn't over yet — gentle non-punitive streak!
    } else {
      break;
    }
  }
  let done28 = 0;
  let counted28 = 0;
  for (let i = 0; i < 28; i++) {
    const d = addDaysIso(todayIso, -i);
    const entry = habit.logs?.[d];
    if (entry?.excused) continue;
    counted28++;
    if (entry && entry.value > 0) done28++;
  }
  const consistency28 = counted28 > 0 ? Math.round((done28 / counted28) * 100) : 100;
  return { streak, consistency28 };
}

export const GoalsHabitsView: React.FC<{ mode: 'goals' | 'habits' }> = ({ mode }) => {
  const { settings, records, logicalToday, activeDate, pushToast, startCountdownTimer } = useApp();

  // Goal creator
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState(addDaysIso(logicalToday, 30));
  const [newMilestoneText, setNewMilestoneText] = useState<Record<string, string>>({});

  // Habit creator
  const [habitTitle, setHabitTitle] = useState('');
  const [habitSchedule, setHabitSchedule] = useState<HabitPayload['scheduleType']>('daily');
  const [habitUnit, setHabitUnit] = useState('min');
  const [habitTargetQty, setHabitTargetQty] = useState(15);

  // Routine creator
  const [routineTitle, setRoutineTitle] = useState('');
  const [routineSteps, setRoutineSteps] = useState('Drink water (2m), Stretch (5m), Review Today (3m)');

  const goals = useMemo(
    () => records.filter((r) => r.type === 'goal') as Array<LifeRecord<GoalPayload>>,
    [records]
  );
  const habits = useMemo(
    () => records.filter((r) => r.type === 'habit') as Array<LifeRecord<HabitPayload>>,
    [records]
  );
  const routines = useMemo(() => records.filter((r) => r.type === 'routine'), [records]);

  const last7Days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(logicalToday, i - 6)),
    [logicalToday]
  );

  if (mode === 'goals') {
    return (
      <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
        <h2>
          <Target size={20} style={{ verticalAlign: '-3px' }} /> Goals & Milestones
        </h2>
        <p className="dp-muted" style={{ margin: 0, fontSize: '0.86rem' }}>
          Schedule individual milestones onto Calendar without prematurely completing the overall goal.
        </p>

        <form
          className="dp-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!goalTitle.trim()) return;
            await createRecord<GoalPayload>('goal', goalTitle.trim(), {
              targetDate: goalTarget,
              milestones: [],
            });
            setGoalTitle('');
            pushToast('Goal created', { canUndo: true });
          }}
        >
          <input className="dp-input" style={{ flex: 2 }} placeholder="New outcome goal…" value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} />
          <input type="date" className="dp-input" style={{ width: 'auto' }} value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} />
          <button type="submit" className="dp-btn dp-btn-primary">
            <Plus size={15} /> Add Goal
          </button>
        </form>

        <div className="dp-stack">
          {goals.map((g) => {
            const ms = g.payload.milestones ?? [];
            const doneCount = ms.filter((m) => m.done).length;
            const pct = ms.length > 0 ? Math.round((doneCount / ms.length) * 100) : 0;
            return (
              <div key={g.id} className="dp-card dp-stack" style={{ padding: 14 }}>
                <div className="dp-between">
                  <div>
                    <strong>{g.title}</strong>
                    {g.payload.targetDate && <span className="dp-pill" style={{ marginInlineStart: 8 }}>Target: {g.payload.targetDate}</span>}
                  </div>
                  <span className="dp-pill highlight">{pct}% ({doneCount}/{ms.length})</span>
                </div>
                <div className="dp-progress-track">
                  <div className="dp-progress-fill" style={{ width: `${pct}%` }} />
                </div>
                <div className="dp-stack" style={{ gap: 6 }}>
                  {ms.map((m) => (
                    <div key={m.id} className="dp-between" style={{ fontSize: '0.9rem' }}>
                      <label className="dp-row" style={{ cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={m.done}
                          onChange={() =>
                            void updateRecord<GoalPayload>(g.id, (c) => ({
                              ...c,
                              payload: {
                                ...c.payload,
                                milestones: c.payload.milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)),
                              },
                            }))
                          }
                        />
                        <span style={{ textDecoration: m.done ? 'line-through' : undefined }}>{m.title}</span>
                      </label>
                      <button
                        type="button"
                        className="dp-btn dp-btn-sm"
                        onClick={async () => {
                          await scheduleActionOnCalendar(g.id, activeDate, '14:00', 45, m.id);
                          pushToast(`Time-blocked milestone "${m.title}" on ${activeDate}`, { canUndo: true });
                        }}
                      >
                        <CalendarPlus size={13} /> Block Time
                      </button>
                    </div>
                  ))}
                  <div className="dp-row">
                    <input
                      className="dp-input"
                      style={{ flex: 1 }}
                      placeholder="Add checkable milestone…"
                      value={newMilestoneText[g.id] ?? ''}
                      onChange={(e) => setNewMilestoneText((prev) => ({ ...prev, [g.id]: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="dp-btn dp-btn-sm"
                      onClick={() => {
                        const txt = (newMilestoneText[g.id] ?? '').trim();
                        if (!txt) return;
                        void updateRecord<GoalPayload>(g.id, (c) => ({
                          ...c,
                          payload: {
                            ...c.payload,
                            milestones: [...c.payload.milestones, { id: createId('ms'), title: txt, done: false }],
                          },
                        }));
                        setNewMilestoneText((prev) => ({ ...prev, [g.id]: '' }));
                      }}
                    >
                      + Milestone
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <h2>
        <Flame size={20} style={{ verticalAlign: '-3px' }} /> Gentle Habits & Step Routines
      </h2>
      <p className="dp-muted" style={{ margin: 0, fontSize: '0.86rem' }}>
        Track consistency with zero punitive overdue language. Excuse travel/rest days anytime.
      </p>

      <form
        className="dp-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!habitTitle.trim()) return;
          await createRecord<HabitPayload>('habit', habitTitle.trim(), {
            scheduleType: habitSchedule,
            weeklyTarget: 5,
            unit: habitUnit,
            targetQuantity: habitTargetQty,
            logs: {},
          });
          setHabitTitle('');
          pushToast('Habit added', { canUndo: true });
        }}
      >
        <input className="dp-input" style={{ flex: 2 }} placeholder="New gentle habit…" value={habitTitle} onChange={(e) => setHabitTitle(e.target.value)} />
        <select aria-label="Schedule" className="dp-select" style={{ width: 'auto' }} value={habitSchedule} onChange={(e) => setHabitSchedule(e.target.value as HabitPayload['scheduleType'])}>
          <option value="daily">Daily</option>
          <option value="weekly_target">Weekly Target (1–7)</option>
          <option value="selected_days">Selected Days</option>
        </select>
        <input type="number" className="dp-input" style={{ width: 68 }} value={habitTargetQty} onChange={(e) => setHabitTargetQty(Number(e.target.value) || 1)} />
        <input className="dp-input" style={{ width: 82 }} value={habitUnit} onChange={(e) => setHabitUnit(e.target.value)} placeholder="unit" />
        <button type="submit" className="dp-btn dp-btn-primary">
          <Plus size={15} /> Add Habit
        </button>
      </form>

      <div className="dp-stack">
        {habits.map((h) => {
          const stats = computeHabitStats(h.payload, logicalToday);
          return (
            <div key={h.id} className="dp-card dp-stack" style={{ padding: 12, gap: 8 }}>
              <div className="dp-between">
                <strong>{h.title}</strong>
                <div className="dp-row">
                  <span className="dp-pill highlight">🔥 {stats.streak}d streak</span>
                  <span className="dp-pill">28d consistency: {stats.consistency28}%</span>
                </div>
              </div>
              <div className="dp-row" style={{ gap: 6 }}>
                {last7Days.map((d) => {
                  const log = h.payload.logs?.[d];
                  const done = Boolean(log && log.value > 0);
                  const excused = Boolean(log?.excused);
                  return (
                    <button
                      key={d}
                      type="button"
                      className={`dp-btn dp-btn-sm ${done ? 'dp-btn-primary' : ''}`}
                      title={`${d}: click to toggle; Shift+click to excuse travel/rest day`}
                      onClick={(e) => {
                        void updateRecord<HabitPayload>(h.id, (c) => {
                          const nextLogs = { ...(c.payload.logs ?? {}) };
                          if (e.shiftKey) {
                            nextLogs[d] = { value: 0, excused: !excused };
                          } else if (done) {
                            delete nextLogs[d];
                          } else {
                            nextLogs[d] = { value: c.payload.targetQuantity ?? 1 };
                          }
                          return { ...c, payload: { ...c.payload, logs: nextLogs } };
                        });
                      }}
                    >
                      {d.slice(5)} {done ? '✓' : excused ? '✈' : '·'}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reusable Routines with Step Timers */}
      <div className="dp-section-title" style={{ marginTop: 12 }}>
        <span>Reusable Morning / Evening / Fitness Routines</span>
      </div>
      <form
        className="dp-row"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!routineTitle.trim()) return;
          const steps = routineSteps
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => {
              const m = s.match(/\((\d+)m\)/i);
              return { name: s.replace(/\(\d+m\)/i, '').trim(), minutes: m ? Number(m[1]) : 5 };
            });
          await createRecord('routine', routineTitle.trim(), { steps });
          setRoutineTitle('');
          pushToast('Routine saved');
        }}
      >
        <input className="dp-input" style={{ flex: 1 }} placeholder="Routine name (e.g., Morning Reset)" value={routineTitle} onChange={(e) => setRoutineTitle(e.target.value)} />
        <input className="dp-input" style={{ flex: 2 }} value={routineSteps} onChange={(e) => setRoutineSteps(e.target.value)} />
        <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">Save Routine</button>
      </form>
      <div className="dp-grid-2">
        {routines.map((rt) => {
          const steps = ((rt.payload as { steps?: Array<{ name: string; minutes: number }> }).steps ?? []);
          const totalMin = steps.reduce((s, x) => s + (x.minutes || 5), 0);
          return (
            <div key={rt.id} className="dp-card dp-between" style={{ padding: 12 }}>
              <div>
                <strong>{rt.title}</strong>
                <div className="dp-muted" style={{ fontSize: '0.8rem' }}>
                  {steps.map((s) => `${s.name} (${s.minutes}m)`).join(' → ')}
                </div>
              </div>
              <button
                type="button"
                className="dp-btn dp-btn-primary dp-btn-sm"
                onClick={() => void startCountdownTimer(rt.title, totalMin * 60, 'interval', rt.id)}
              >
                <Play size={13} /> Run ({totalMin}m)
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
