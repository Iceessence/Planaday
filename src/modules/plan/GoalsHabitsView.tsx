import React, { useMemo, useState } from 'react';
import { CalendarPlus, Flame, Play, Plus, Target, Trash2 } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { scheduleActionOnCalendar } from '../../core/planActions';
import { addDaysIso } from '../../core/temporal';
import { createId } from '../../core/db';
import { SortFilterBar } from '../../components/Common/SortFilterBar';
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

  // Sort & Filter state for Goals & Habits
  const [ghSearch, setGhSearch] = useState('');
  const [ghSortBy, setGhSortBy] = useState<'progress' | 'target' | 'title'>('target');
  const [ghSortDir, setGhSortDir] = useState<'asc' | 'desc'>('asc');
  const [habitSortBy, setHabitSortBy] = useState<'streak' | 'consistency' | 'title'>('streak');
  const [habitSortDir, setHabitSortDir] = useState<'asc' | 'desc'>('desc');
  const [habitFilter, setHabitFilter] = useState<'all' | 'done_today' | 'not_done_today'>('all');

  const goals = useMemo(
    () => records.filter((r) => r.type === 'goal') as Array<LifeRecord<GoalPayload>>,
    [records]
  );
  const filteredGoals = useMemo(() => {
    const q = ghSearch.trim().toLowerCase();
    const list = goals.filter((g) => !q || g.title.toLowerCase().includes(q));
    const dir = ghSortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (ghSortBy === 'title') return a.title.localeCompare(b.title) * dir;
      if (ghSortBy === 'progress') {
        const pa = a.payload.milestones?.length ? a.payload.milestones.filter((m) => m.done).length / a.payload.milestones.length : 0;
        const pb = b.payload.milestones?.length ? b.payload.milestones.filter((m) => m.done).length / b.payload.milestones.length : 0;
        return (pa - pb) * dir;
      }
      return (a.payload.targetDate || '9999').localeCompare(b.payload.targetDate || '9999') * dir;
    });
  }, [goals, ghSearch, ghSortBy, ghSortDir]);

  const habits = useMemo(
    () => records.filter((r) => r.type === 'habit') as Array<LifeRecord<HabitPayload>>,
    [records]
  );
  const filteredHabits = useMemo(() => {
    const q = ghSearch.trim().toLowerCase();
    const list = habits.filter((h) => {
      const doneToday = Boolean(h.payload.logs?.[logicalToday]?.value);
      if (habitFilter === 'done_today' && !doneToday) return false;
      if (habitFilter === 'not_done_today' && doneToday) return false;
      if (q && !h.title.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = habitSortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (habitSortBy === 'title') return a.title.localeCompare(b.title) * dir;
      const sa = computeHabitStats(a.payload, logicalToday);
      const sb = computeHabitStats(b.payload, logicalToday);
      if (habitSortBy === 'consistency') return (sa.consistency28 - sb.consistency28) * dir;
      return (sa.streak - sb.streak) * dir;
    });
  }, [habits, ghSearch, habitFilter, habitSortBy, habitSortDir, logicalToday]);
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

        <SortFilterBar
          search={ghSearch}
          onSearchChange={setGhSearch}
          searchPlaceholder="Search goals…"
          sortBy={ghSortBy}
          onSortByChange={(v) => setGhSortBy(v as typeof ghSortBy)}
          sortOptions={[
            { value: 'target', label: 'Target Date' },
            { value: 'progress', label: 'Completion %' },
            { value: 'title', label: 'Title (A–Z)' },
          ]}
          sortDir={ghSortDir}
          onSortDirToggle={() => setGhSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          totalCount={goals.length}
          shownCount={filteredGoals.length}
          onReset={() => setGhSearch('')}
        />

        <div className="dp-stack">
          {filteredGoals.map((g) => {
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
                  <div className="dp-row" style={{ gap: 6 }}>
                    <span className="dp-pill highlight">{pct}% ({doneCount}/{ms.length})</span>
                    <button
                      type="button"
                      className="dp-icon-btn"
                      title="Move goal to Trash"
                      aria-label={`Delete ${g.title}`}
                      onClick={async () => {
                        await softDeleteRecord(g.id);
                        pushToast(`Moved goal "${g.title}" to Trash`, { canUndo: true });
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
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
                      <div className="dp-row" style={{ gap: 4 }}>
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
                        <button
                          type="button"
                          className="dp-icon-btn"
                          style={{ width: 24, height: 24 }}
                          title="Delete milestone"
                          onClick={() =>
                            void updateRecord<GoalPayload>(g.id, (c) => ({
                              ...c,
                              payload: { ...c.payload, milestones: c.payload.milestones.filter((x) => x.id !== m.id) },
                            }))
                          }
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
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
        <label className="dp-row" style={{ gap: 4 }}>
          <span className="dp-muted" style={{ fontSize: '0.82rem' }}>Goal:</span>
          <input type="number" min={1} className="dp-input" style={{ width: 68 }} value={habitTargetQty} onChange={(e) => setHabitTargetQty(Number(e.target.value) || 1)} />
        </label>
        <input list="dp-habit-units" className="dp-input" style={{ width: 96 }} value={habitUnit} onChange={(e) => setHabitUnit(e.target.value)} placeholder="unit…" aria-label="Habit unit" />
        <datalist id="dp-habit-units">
          <option value="min" />
          <option value="hrs" />
          <option value="pages" />
          <option value="cups" />
          <option value="steps" />
          <option value="reps" />
          <option value="miles" />
          <option value="times" />
        </datalist>
        <button type="submit" className="dp-btn dp-btn-primary">
          <Plus size={15} /> Add Habit
        </button>
      </form>

      <SortFilterBar
        search={ghSearch}
        onSearchChange={setGhSearch}
        searchPlaceholder="Search habits…"
        sortBy={habitSortBy}
        onSortByChange={(v) => setHabitSortBy(v as typeof habitSortBy)}
        sortOptions={[
          { value: 'streak', label: 'Streak Length' },
          { value: 'consistency', label: '28d Consistency %' },
          { value: 'title', label: 'Title (A–Z)' },
        ]}
        sortDir={habitSortDir}
        onSortDirToggle={() => setHabitSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
        chips={[
          { value: 'all', label: 'All Habits' },
          { value: 'not_done_today', label: 'Remaining Today' },
          { value: 'done_today', label: 'Done Today ✓' },
        ]}
        activeChip={habitFilter}
        onChipChange={(v) => setHabitFilter(v as typeof habitFilter)}
        totalCount={habits.length}
        shownCount={filteredHabits.length}
        onReset={() => {
          setGhSearch('');
          setHabitFilter('all');
        }}
      />

      <div className="dp-stack">
        {filteredHabits.map((h) => {
          const stats = computeHabitStats(h.payload, logicalToday);
          return (
            <div key={h.id} className="dp-card dp-stack" style={{ padding: 12, gap: 8 }}>
              <div className="dp-between">
                <strong>
                  {h.title}{' '}
                  <span className="dp-muted" style={{ fontSize: '0.8rem', fontWeight: 400 }}>
                    ({h.payload.targetQuantity ?? 1} {h.payload.unit || 'times'})
                  </span>
                </strong>
                <div className="dp-row" style={{ gap: 6 }}>
                  <span className="dp-pill highlight">🔥 {stats.streak}d streak</span>
                  <span className="dp-pill">28d consistency: {stats.consistency28}%</span>
                  <button
                    type="button"
                    className="dp-icon-btn"
                    title="Move habit to Trash"
                    onClick={async () => {
                      await softDeleteRecord(h.id);
                      pushToast(`Moved habit "${h.title}" to Trash`, { canUndo: true });
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
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
              <div className="dp-row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="dp-btn dp-btn-primary dp-btn-sm"
                  onClick={() => void startCountdownTimer(rt.title, totalMin * 60, 'interval', rt.id)}
                >
                  <Play size={13} /> Run ({totalMin}m)
                </button>
                <button
                  type="button"
                  className="dp-icon-btn"
                  title="Move routine to Trash"
                  onClick={async () => {
                    await softDeleteRecord(rt.id);
                    pushToast(`Moved routine "${rt.title}" to Trash`, { canUndo: true });
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
