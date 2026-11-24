import React, { useMemo, useState } from 'react';
import { Activity, Check, Dumbbell, Pill, Plus, Users } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, updateRecord } from '../../core/repository';
import { addDaysIso } from '../../core/temporal';
import { evaluateAutomations } from '../../core/automations';
import type { ChorePayload, LifeRecord, TaskPayload } from '../../core/types';

/**
 * Exact Effort Fairness Formula from Section 13.01:
 * minutes * (1 + difficulty * 0.2 + energyWeight * 0.15)
 */
export function computeEffortScore(
  minutes: number,
  difficulty: number,
  energy: 'low' | 'medium' | 'high' | undefined,
  diffFactor = 0.2,
  energyFactor = 0.15
): number {
  const eNum = energy === 'high' ? 3 : energy === 'medium' ? 2 : 1;
  return Number((minutes * (1 + difficulty * diffFactor + eNum * energyFactor)).toFixed(1));
}

export const HouseholdHealthView: React.FC<{ mode: 'household' | 'health' }> = ({ mode }) => {
  const { settings, records, logicalToday, pushToast, startCountdownTimer } = useApp();

  // Household member state
  const [memberName, setMemberName] = useState('');
  const [memberRole, setMemberRole] = useState<'adult' | 'child' | 'member'>('adult');
  const [memberWeight, setMemberWeight] = useState(1.0);
  const [diffCoeff, setDiffCoeff] = useState(0.2);
  const [energyCoeff, setEnergyCoeff] = useState(0.15);

  // Health state
  const [medName, setMedName] = useState('');
  const [medDose, setMedDose] = useState('10 mg');
  const [medPills, setMedPills] = useState(14);
  const [medFoodNote, setMedFoodNote] = useState('With food');
  const [workoutTitle, setWorkoutTitle] = useState('');
  const [workoutDetails, setWorkoutDetails] = useState('3×10 Goblet Squats @ 20lb, 3×12 Pushups');
  const [restSec, setRestSec] = useState(60);
  const [stepsToday, setStepsToday] = useState(6500);
  const [vitalsNote, setVitalsNote] = useState('');

  const members = useMemo(() => records.filter((r) => r.type === 'household_member'), [records]);
  const chores = useMemo(() => records.filter((r) => r.type === 'chore') as Array<LifeRecord<ChorePayload>>, [records]);
  const meds = useMemo(() => records.filter((r) => r.type === 'medication'), [records]);
  const workouts = useMemo(() => records.filter((r) => r.type === 'workout'), [records]);
  const wellnessLogs = useMemo(() => records.filter((r) => r.type === 'wellness_log'), [records]);

  // 4-week rolling Effort Fairness calculation (Section 13.01)
  const cutoff28 = addDaysIso(logicalToday, -28);
  const fairnessRows = useMemo(() => {
    const scoreByMember = new Map<string, { rawPoints: number; minutes: number; count: number }>();
    for (const m of members) scoreByMember.set(m.id, { rawPoints: 0, minutes: 0, count: 0 });

    for (const ch of chores) {
      for (const cmp of ch.payload.completions ?? []) {
        if (cmp.completedDate < cutoff28) continue;
        const mid = cmp.assigneeId || members[0]?.id;
        if (!mid || !scoreByMember.has(mid)) continue;
        const mins = cmp.minutesSpent ?? ch.estimateMin ?? 15;
        const pts = computeEffortScore(mins, ch.payload.difficulty || 2, ch.energy, diffCoeff, energyCoeff);
        const cur = scoreByMember.get(mid)!;
        cur.rawPoints += pts;
        cur.minutes += mins;
        cur.count += 1;
      }
    }

    const totalWeighted = members.reduce((sum, m) => {
      const w = Number((m.payload as { weight?: number }).weight ?? 1);
      const pts = scoreByMember.get(m.id)?.rawPoints ?? 0;
      return sum + (w > 0 ? pts / w : pts);
    }, 0);

    return members.map((m) => {
      const stats = scoreByMember.get(m.id) ?? { rawPoints: 0, minutes: 0, count: 0 };
      const w = Number((m.payload as { weight?: number }).weight ?? 1);
      const weighted = w > 0 ? stats.rawPoints / w : stats.rawPoints;
      const sharePct = totalWeighted > 0 ? Math.round((weighted / totalWeighted) * 100) : 0;
      return { member: m, ...stats, weighted: Number(weighted.toFixed(1)), sharePct };
    });
  }, [members, chores, cutoff28, diffCoeff, energyCoeff]);

  if (mode === 'household') {
    return (
      <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
        <h2>
          <Users size={20} style={{ verticalAlign: '-3px' }} /> Household & Non-Punitive Effort Fairness
        </h2>
        <p className="dp-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          4-week rolling formula: <code>minutes * (1 + difficulty × {diffCoeff} + energy × {energyCoeff})</code> · Informational only, zero punitive negative debt.
        </p>

        <form
          className="dp-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!memberName.trim()) return;
            await createRecord('household_member', memberName.trim(), {
              role: memberRole,
              weight: memberWeight,
              rewardPoints: 0,
            });
            setMemberName('');
            pushToast('Added household member');
          }}
        >
          <input className="dp-input" style={{ flex: 2 }} placeholder="Member name…" value={memberName} onChange={(e) => setMemberName(e.target.value)} />
          <select aria-label="Role" className="dp-select" style={{ width: 'auto' }} value={memberRole} onChange={(e) => setMemberRole(e.target.value as typeof memberRole)}>
            <option value="adult">Adult</option>
            <option value="child">Child</option>
            <option value="member">Member</option>
          </select>
          <label className="dp-row">
            <span className="dp-muted">Weight:</span>
            <input type="number" step={0.1} min={0.2} max={2} className="dp-input" style={{ width: 68 }} value={memberWeight} onChange={(e) => setMemberWeight(Number(e.target.value) || 1)} />
          </label>
          <button type="submit" className="dp-btn dp-btn-primary">
            <Plus size={14} /> Add Member
          </button>
        </form>

        <details className="dp-details">
          <summary>Editable Fairness Formula Assumptions</summary>
          <div className="dp-row" style={{ marginTop: 8 }}>
            <label className="dp-row">
              <span>Difficulty coeff:</span>
              <input type="number" step={0.05} className="dp-input" style={{ width: 74 }} value={diffCoeff} onChange={(e) => setDiffCoeff(Number(e.target.value) || 0.2)} />
            </label>
            <label className="dp-row">
              <span>Energy coeff:</span>
              <input type="number" step={0.05} className="dp-input" style={{ width: 74 }} value={energyCoeff} onChange={(e) => setEnergyCoeff(Number(e.target.value) || 0.15)} />
            </label>
          </div>
        </details>

        <div className="dp-grid-2">
          {fairnessRows.map((row) => (
            <div key={row.member.id} className="dp-card dp-stack" style={{ padding: 14, gap: 8 }}>
              <div className="dp-between">
                <strong>
                  {row.member.title}{' '}
                  <span className="dp-pill">{String((row.member.payload as { role?: string }).role || 'member')}</span>
                </strong>
                <span className="dp-pill highlight">{row.sharePct}% rolling share</span>
              </div>
              <div className="dp-progress-track">
                <div className="dp-progress-fill" style={{ width: `${row.sharePct}%` }} />
              </div>
              <div className="dp-muted" style={{ fontSize: '0.82rem' }}>
                {row.count} chores · {row.minutes}m · {row.rawPoints.toFixed(1)} effort pts (weighted {row.weighted})
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <h2>
        <Activity size={20} style={{ verticalAlign: '-3px' }} /> Health, Medication & Fitness
      </h2>
      <p className="dp-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        Personal non-diagnostic tracker · Automatic refill task triggers at ≤ 7 doses remaining
      </p>

      {/* Medication Schedule & Pill-Count Inventory */}
      <div className="dp-card dp-stack">
        <div className="dp-section-title">
          <span><Pill size={16} /> Medication Schedules & Pill Inventory</span>
        </div>
        <form
          className="dp-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!medName.trim()) return;
            await createRecord('medication', medName.trim(), {
              dose: medDose,
              foodNote: medFoodNote,
              pillsRemaining: medPills,
              takenLog: [],
            });
            setMedName('');
            pushToast('Medication added');
          }}
        >
          <input className="dp-input" style={{ flex: 2 }} placeholder="Medication / supplement name…" value={medName} onChange={(e) => setMedName(e.target.value)} />
          <input className="dp-input" style={{ width: 96 }} value={medDose} onChange={(e) => setMedDose(e.target.value)} placeholder="Dose" />
          <input className="dp-input" style={{ width: 120 }} value={medFoodNote} onChange={(e) => setMedFoodNote(e.target.value)} placeholder="Food note" />
          <input type="number" min={0} className="dp-input" style={{ width: 76 }} value={medPills} onChange={(e) => setMedPills(Number(e.target.value) || 0)} title="Doses in bottle" />
          <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">Add</button>
        </form>

        {meds.map((m) => {
          const p = m.payload as { dose: string; foodNote?: string; pillsRemaining: number; takenLog?: Array<{ date: string; takenAt: string; late?: boolean }> };
          const takenToday = (p.takenLog ?? []).some((x) => x.date === logicalToday);
          return (
            <div key={m.id} className="dp-between" style={{ padding: 10, borderRadius: 8, background: 'var(--dp-surface-2)' }}>
              <div>
                <strong>{m.title}</strong> ({p.dose}) · <span className="dp-muted">{p.foodNote}</span>
                <div className="dp-row" style={{ marginTop: 4 }}>
                  <span className="dp-pill" style={{ color: p.pillsRemaining <= 7 ? 'var(--dp-warn)' : undefined }}>
                    {p.pillsRemaining} doses left
                  </span>
                  {takenToday && <span className="dp-pill highlight">Taken today ✓</span>}
                </div>
              </div>
              <button
                type="button"
                className="dp-btn dp-btn-primary dp-btn-sm"
                onClick={async () => {
                  const nextPills = Math.max(0, (p.pillsRemaining ?? 0) - 1);
                  await updateRecord(m.id, (c) => ({
                    ...c,
                    payload: {
                      ...c.payload,
                      pillsRemaining: nextPills,
                      takenLog: [...(p.takenLog ?? []), { date: logicalToday, takenAt: new Date().toISOString() }],
                    },
                  }));
                  // Automatic refill task at <= 7 doses remaining (Section 13.02 + 15.07)!
                  if (nextPills <= 7) {
                    const existingRefill = records.find((r) => r.type === 'task' && r.status === 'active' && r.title.toLowerCase().includes(`refill ${m.title.toLowerCase()}`));
                    if (!existingRefill) {
                      await createRecord<TaskPayload>(
                        'task',
                        `Refill ${m.title} (${nextPills} doses left)`,
                        { subtasks: [], boardColumn: 'next' },
                        { doDate: logicalToday, dueDate: addDaysIso(logicalToday, Math.max(1, nextPills)), priority: 'high', category: 'Health', tags: ['refill'] }
                      );
                      pushToast(`Low stock (${nextPills} left) — created Refill Task for ${m.title}!`, { canUndo: true });
                    }
                    await evaluateAutomations('med_low_stock', {
                      subjectName: m.title,
                      numericValue: nextPills,
                      todayIso: logicalToday,
                    });
                  } else {
                    pushToast(`Logged dose of ${m.title}`);
                  }
                }}
              >
                <Check size={14} /> Check Off Dose
              </button>
            </div>
          );
        })}
      </div>

      {/* Workout Templates + Integrated Rest Timer & Wellness Log */}
      <div className="dp-grid-2">
        <div className="dp-card dp-stack">
          <h4><Dumbbell size={16} /> Workout Templates & Rest Timer</h4>
          <form
            className="dp-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!workoutTitle.trim()) return;
              await createRecord('workout', workoutTitle.trim(), { details: workoutDetails, restSec, logs: [] });
              setWorkoutTitle('');
              pushToast('Saved workout template');
            }}
          >
            <input className="dp-input" placeholder="Workout template (e.g., Full Body A)" value={workoutTitle} onChange={(e) => setWorkoutTitle(e.target.value)} />
            <input className="dp-input" value={workoutDetails} onChange={(e) => setWorkoutDetails(e.target.value)} placeholder="Sets/reps/weight or cardio" />
            <div className="dp-row">
              <label className="dp-row">
                <span className="dp-muted">Rest timer (s):</span>
                <input type="number" className="dp-input" style={{ width: 72 }} value={restSec} onChange={(e) => setRestSec(Number(e.target.value) || 60)} />
              </label>
              <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">Save Template</button>
            </div>
          </form>
          {workouts.map((w) => {
            const p = w.payload as { details: string; restSec?: number };
            return (
              <div key={w.id} className="dp-between" style={{ padding: 8, background: 'var(--dp-surface-2)', borderRadius: 6 }}>
                <div>
                  <strong>{w.title}</strong>
                  <div className="dp-muted" style={{ fontSize: '0.8rem' }}>{p.details}</div>
                </div>
                <button type="button" className="dp-btn dp-btn-sm" onClick={() => void startCountdownTimer(`Rest: ${w.title}`, p.restSec ?? 60)}>
                  {p.restSec ?? 60}s Rest
                </button>
              </div>
            );
          })}
        </div>

        <div className="dp-card dp-stack">
          <h4>Private Wellness Check-In</h4>
          <label className="dp-between">
            <span>Steps today</span>
            <input type="number" className="dp-input" style={{ width: 110 }} value={stepsToday} onChange={(e) => setStepsToday(Number(e.target.value) || 0)} />
          </label>
          <input className="dp-input" placeholder="Vitals / symptoms / cycle note (optional)…" value={vitalsNote} onChange={(e) => setVitalsNote(e.target.value)} />
          <button
            type="button"
            className="dp-btn dp-btn-primary dp-btn-sm"
            onClick={async () => {
              await createRecord('wellness_log', `Wellness ${logicalToday}`, { date: logicalToday, steps: stepsToday, note: vitalsNote });
              setVitalsNote('');
              pushToast('Logged wellness check-in');
            }}
          >
            Save Wellness Log
          </button>
          {wellnessLogs.slice(0, 4).map((wl) => {
            const p = wl.payload as { date: string; steps?: number; note?: string };
            return (
              <div key={wl.id} className="dp-muted" style={{ fontSize: '0.82rem' }}>
                <strong>{p.date}:</strong> {p.steps ?? 0} steps {p.note ? `· ${p.note}` : ''}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
