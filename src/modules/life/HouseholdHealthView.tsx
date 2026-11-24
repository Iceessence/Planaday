import React, { useMemo, useState } from 'react';
import { Activity, Bell, Check, Dumbbell, Pill, Plus, RefreshCw, SkipForward, Trash2, Users } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { addDaysIso, diffDaysIso, formatTimeDisplay } from '../../core/temporal';
import { evaluateAutomations } from '../../core/automations';
import type { ChorePayload, LifeRecord, TaskPayload } from '../../core/types';

export interface MedicationPayload {
  dose: string;
  frequency: string;
  timeOfDay: string; // HH:MM primary reminder time
  secondTimeOfDay?: string; // optional second HH:MM
  reminderEnabled: boolean;
  foodNote?: string;
  pillsRemaining: number;
  refillAlertDoses: number;
  refillByDate: string; // YYYY-MM-DD — tracked even if user skips days and has leftover doses!
  refillAlertDaysBefore: number;
  takenLog: Array<{ date: string; timeHHMM: string; takenAt: string }>;
  skippedLog: Array<{ date: string; reason?: string; loggedAt: string }>;
}

const MED_FREQUENCY_OPTIONS = [
  'Once daily',
  'Twice daily',
  'Three times daily',
  'Every other day',
  'Weekly',
  'Before exercise',
  'After exercise',
  'With breakfast',
  'With dinner',
  'Before bed',
  'As needed (PRN)',
];

const MED_INSTRUCTION_OPTIONS = [
  'With food',
  'Empty stomach',
  'With full glass of water',
  '30 min before workout',
  'Avoid dairy/calcium',
  'Before sleep',
  'No special instructions',
];

const MED_DOSE_OPTIONS = ['5 mg', '10 mg', '20 mg', '25 mg', '50 mg', '100 mg', '250 mg', '500 mg', '1000 IU', '1 tablet', '2 capsules', '5 mL'];

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

export function isMedicationRefillDue(p: Partial<MedicationPayload>, todayIso: string): {
  due: boolean;
  reason: string | null;
} {
  const pills = p.pillsRemaining ?? 0;
  const doseThresh = p.refillAlertDoses ?? 7;
  const daysBefore = p.refillAlertDaysBefore ?? 7;
  const byDose = pills <= doseThresh;
  const daysUntilRefillDate = p.refillByDate ? diffDaysIso(todayIso, p.refillByDate) : null;
  const byDate = daysUntilRefillDate !== null && daysUntilRefillDate <= daysBefore;

  if (byDose && byDate) {
    return { due: true, reason: `${pills} doses left & refill date ${p.refillByDate}` };
  }
  if (byDate) {
    return {
      due: true,
      reason:
        daysUntilRefillDate! < 0
          ? `Refill date passed (${p.refillByDate}) even with ${pills} doses remaining`
          : `Refill date in ${daysUntilRefillDate}d (${p.refillByDate}) — track refill even with ${pills} doses left`,
    };
  }
  if (byDose) {
    return { due: true, reason: `Low stock: ${pills} doses remaining (alert ≤ ${doseThresh} doses)` };
  }
  return { due: false, reason: null };
}

export const HouseholdHealthView: React.FC<{ mode: 'household' | 'health' }> = ({ mode }) => {
  const { settings, records, logicalToday, pushToast, startCountdownTimer } = useApp();

  // Household member state
  const [memberName, setMemberName] = useState('');
  const [memberRole, setMemberRole] = useState('Adult');
  const [memberWeight, setMemberWeight] = useState(1.0);
  const [diffCoeff, setDiffCoeff] = useState(0.2);
  const [energyCoeff, setEnergyCoeff] = useState(0.15);

  // Rich Medication state (with time of day, reminders, frequency combo, skip tracking & date-based refill!)
  const [medName, setMedName] = useState('');
  const [medDose, setMedDose] = useState('10 mg');
  const [medFrequency, setMedFrequency] = useState('Once daily');
  const [medTimeOfDay, setMedTimeOfDay] = useState('08:00');
  const [medSecondTime, setMedSecondTime] = useState('');
  const [medReminder, setMedReminder] = useState(true);
  const [medPills, setMedPills] = useState(30);
  const [medRefillAlertDoses, setMedRefillAlertDoses] = useState(7);
  const [medRefillByDate, setMedRefillByDate] = useState(addDaysIso(logicalToday, 30));
  const [medRefillDaysBefore, setMedRefillDaysBefore] = useState(7);
  const [medFoodNote, setMedFoodNote] = useState('With food');
  const [refillAddQty, setRefillAddQty] = useState<Record<string, number>>({});

  // Workout & Wellness state
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
          <Users size={20} style={{ verticalAlign: '-3px' }} /> Household &amp; Non-Punitive Effort Fairness
        </h2>
        <p className="dp-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
          4-week rolling formula: <code>minutes × (1 + difficulty × {diffCoeff} + energy × {energyCoeff})</code> · Informational only, zero punitive debt.
        </p>

        <form
          className="dp-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!memberName.trim()) return;
            await createRecord('household_member', memberName.trim(), {
              role: memberRole.trim() || 'Member',
              weight: memberWeight,
              rewardPoints: 0,
            });
            setMemberName('');
            pushToast('Added household member', { canUndo: true });
          }}
        >
          <input className="dp-input" style={{ flex: 2 }} placeholder="Member name…" value={memberName} onChange={(e) => setMemberName(e.target.value)} />
          <input
            list="dp-hh-roles"
            className="dp-input"
            style={{ width: 120 }}
            value={memberRole}
            onChange={(e) => setMemberRole(e.target.value)}
            placeholder="Role…"
            aria-label="Member role"
          />
          <datalist id="dp-hh-roles">
            <option value="Adult" />
            <option value="Parent" />
            <option value="Child" />
            <option value="Teen" />
            <option value="Roommate" />
          </datalist>
          <label className="dp-row">
            <span className="dp-muted">Load weight:</span>
            <input type="number" step={0.1} min={0.2} max={2} className="dp-input" style={{ width: 68 }} value={memberWeight} onChange={(e) => setMemberWeight(Number(e.target.value) || 1)} />
            <span className="dp-muted">×</span>
          </label>
          <button type="submit" className="dp-btn dp-btn-primary">
            <Plus size={14} /> Add Member
          </button>
        </form>

        <details className="dp-details">
          <summary>Editable Fairness Formula Assumptions</summary>
          <div className="dp-row" style={{ marginTop: 8 }}>
            <label className="dp-row">
              <span>Difficulty multiplier:</span>
              <input type="number" step={0.05} className="dp-input" style={{ width: 74 }} value={diffCoeff} onChange={(e) => setDiffCoeff(Number(e.target.value) || 0.2)} />
              <span className="dp-muted">×</span>
            </label>
            <label className="dp-row">
              <span>Energy multiplier:</span>
              <input type="number" step={0.05} className="dp-input" style={{ width: 74 }} value={energyCoeff} onChange={(e) => setEnergyCoeff(Number(e.target.value) || 0.15)} />
              <span className="dp-muted">×</span>
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
                <div className="dp-row" style={{ gap: 6 }}>
                  <span className="dp-pill highlight">{row.sharePct}% rolling share</span>
                  <button
                    type="button"
                    className="dp-icon-btn"
                    title="Delete household member"
                    aria-label={`Delete ${row.member.title}`}
                    onClick={async () => {
                      await softDeleteRecord(row.member.id);
                      pushToast(`Moved "${row.member.title}" to Trash`, { canUndo: true });
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="dp-progress-track">
                <div className="dp-progress-fill" style={{ width: `${row.sharePct}%` }} />
              </div>
              <div className="dp-muted" style={{ fontSize: '0.82rem' }}>
                {row.count} chores · {row.minutes} min · {row.rawPoints.toFixed(1)} effort pts (weighted {row.weighted})
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
        <Activity size={20} style={{ verticalAlign: '-3px' }} /> Health, Medication &amp; Fitness
      </h2>
      <p className="dp-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        Personal non-diagnostic tracker · Time-of-day reminders · Taken &amp; Skipped logs · Date + Dose refill alerts
      </p>

      {/* Medication Schedule, Reminders, Taken/Skipped History & Independent Refill Tracking */}
      <div className="dp-card dp-stack">
        <div className="dp-section-title">
          <span><Pill size={16} /> Medication Schedules, Reminders &amp; Refill Tracker</span>
        </div>

        <datalist id="dp-med-freqs">
          {MED_FREQUENCY_OPTIONS.map((opt) => <option key={opt} value={opt} />)}
        </datalist>
        <datalist id="dp-med-notes">
          {MED_INSTRUCTION_OPTIONS.map((opt) => <option key={opt} value={opt} />)}
        </datalist>
        <datalist id="dp-med-doses">
          {MED_DOSE_OPTIONS.map((opt) => <option key={opt} value={opt} />)}
        </datalist>

        <form
          className="dp-stack"
          style={{ gap: 10 }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!medName.trim()) return;
            await createRecord<MedicationPayload>('medication', medName.trim(), {
              dose: medDose.trim() || '1 dose',
              frequency: medFrequency.trim() || 'Once daily',
              timeOfDay: medTimeOfDay || '08:00',
              secondTimeOfDay: medSecondTime || undefined,
              reminderEnabled: medReminder,
              foodNote: medFoodNote.trim() || undefined,
              pillsRemaining: Math.max(0, medPills),
              refillAlertDoses: Math.max(1, medRefillAlertDoses),
              refillByDate: medRefillByDate || addDaysIso(logicalToday, Math.max(1, medPills)),
              refillAlertDaysBefore: Math.max(1, medRefillDaysBefore),
              takenLog: [],
              skippedLog: [],
            });
            setMedName('');
            setMedSecondTime('');
            pushToast('Medication added with reminder & refill tracking', { canUndo: true });
          }}
        >
          <div className="dp-row">
            <input className="dp-input" style={{ flex: 2, minWidth: 160 }} placeholder="Medication / supplement name…" value={medName} onChange={(e) => setMedName(e.target.value)} />
            <input
              list="dp-med-doses"
              className="dp-input"
              style={{ width: 112 }}
              value={medDose}
              onChange={(e) => setMedDose(e.target.value)}
              placeholder="Dose (e.g. 10 mg)"
              aria-label="Medication dose"
            />
            <input
              list="dp-med-freqs"
              className="dp-input"
              style={{ flex: 1, minWidth: 150 }}
              value={medFrequency}
              onChange={(e) => setMedFrequency(e.target.value)}
              placeholder="How often / when (pick or type)…"
              aria-label="How often to take"
            />
            <label className="dp-row" style={{ gap: 4, fontSize: '0.82rem' }}>
              <span className="dp-muted">Take at:</span>
              <input type="time" aria-label="Time of day to take" className="dp-input" style={{ width: 118 }} value={medTimeOfDay} onChange={(e) => setMedTimeOfDay(e.target.value)} />
            </label>
            <label className="dp-row" style={{ gap: 4, fontSize: '0.82rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={medReminder} onChange={(e) => setMedReminder(e.target.checked)} />
              <span><Bell size={13} /> Remind</span>
            </label>
            <button type="submit" className="dp-btn dp-btn-primary dp-btn-sm">
              <Plus size={14} /> Add Med
            </button>
          </div>

          <div className="dp-row" style={{ fontSize: '0.82rem', gap: 10 }}>
            <input
              list="dp-med-notes"
              className="dp-input"
              style={{ width: 170 }}
              value={medFoodNote}
              onChange={(e) => setMedFoodNote(e.target.value)}
              placeholder="Food / timing note…"
            />
            <label className="dp-row" style={{ gap: 4 }}>
              <span className="dp-muted">Supply:</span>
              <input type="number" min={0} className="dp-input" style={{ width: 68 }} value={medPills} onChange={(e) => setMedPills(Math.max(0, Number(e.target.value) || 0))} />
              <span className="dp-muted">doses</span>
            </label>
            <label className="dp-row" style={{ gap: 4 }}>
              <span className="dp-muted">Refill by:</span>
              <input type="date" aria-label="Refill by date" className="dp-input" style={{ width: 'auto' }} value={medRefillByDate} onChange={(e) => setMedRefillByDate(e.target.value)} />
            </label>
            <label className="dp-row" style={{ gap: 4 }}>
              <span className="dp-muted">Alert ≤</span>
              <input type="number" min={1} max={90} className="dp-input" style={{ width: 58 }} value={medRefillAlertDoses} onChange={(e) => setMedRefillAlertDoses(Math.max(1, Number(e.target.value) || 7))} />
              <span className="dp-muted">doses or</span>
              <input type="number" min={1} max={60} className="dp-input" style={{ width: 58 }} value={medRefillDaysBefore} onChange={(e) => setMedRefillDaysBefore(Math.max(1, Number(e.target.value) || 7))} />
              <span className="dp-muted">days before</span>
            </label>
            <label className="dp-row" style={{ gap: 4 }}>
              <span className="dp-muted">2nd dose (opt):</span>
              <input type="time" aria-label="Optional second dose time" className="dp-input" style={{ width: 112 }} value={medSecondTime} onChange={(e) => setMedSecondTime(e.target.value)} />
            </label>
          </div>
        </form>

        {meds.map((m) => {
          const p = m.payload as Partial<MedicationPayload>;
          const takenTodayEntries = (p.takenLog ?? []).filter((x) => x.date === logicalToday);
          const skippedToday = (p.skippedLog ?? []).some((x) => x.date === logicalToday);
          const refillStatus = isMedicationRefillDue(p, logicalToday);
          const remaining = p.pillsRemaining ?? 0;

          return (
            <div
              key={m.id}
              className="dp-card dp-stack"
              style={{
                padding: 12,
                gap: 8,
                background: 'var(--dp-surface-2)',
                borderColor: refillStatus.due ? 'var(--dp-warn)' : undefined,
              }}
            >
              <div className="dp-between">
                <div>
                  <strong>{m.title}</strong> ({p.dose || '1 dose'})
                  <span className="dp-muted"> · {p.frequency || 'Once daily'}</span>
                  {p.foodNote && <span className="dp-muted"> · {p.foodNote}</span>}
                  <div className="dp-row" style={{ marginTop: 5, gap: 5 }}>
                    {p.timeOfDay && (
                      <span className="dp-pill">
                        {p.reminderEnabled !== false ? '🔔 ' : '🔕 '}
                        {formatTimeDisplay(p.timeOfDay, settings.timeFormat)}
                        {p.secondTimeOfDay ? ` & ${formatTimeDisplay(p.secondTimeOfDay, settings.timeFormat)}` : ''}
                      </span>
                    )}
                    <span className="dp-pill" style={{ color: remaining <= (p.refillAlertDoses ?? 7) ? 'var(--dp-warn)' : undefined }}>
                      {remaining} doses left
                    </span>
                    {p.refillByDate && (
                      <span className="dp-pill" style={{ color: refillStatus.due ? 'var(--dp-warn)' : undefined }}>
                        Refill by: {p.refillByDate}
                      </span>
                    )}
                    {takenTodayEntries.map((t, i) => (
                      <span key={i} className="dp-pill highlight">
                        ✓ Taken today at {t.timeHHMM ? formatTimeDisplay(t.timeHHMM, settings.timeFormat) : new Date(t.takenAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    ))}
                    {skippedToday && <span className="dp-pill">⏭ Skipped today</span>}
                  </div>
                  {refillStatus.due && refillStatus.reason && (
                    <div style={{ marginTop: 4, fontSize: '0.8rem', color: 'var(--dp-warn)', fontWeight: 600 }}>
                      ⚠️ Refill Reminder: {refillStatus.reason}
                    </div>
                  )}
                </div>

                <div className="dp-row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="dp-btn dp-btn-primary dp-btn-sm"
                    onClick={async () => {
                      const now = new Date();
                      const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                      const nextPills = Math.max(0, remaining - 1);
                      const nextTaken = [...(p.takenLog ?? []), { date: logicalToday, timeHHMM: nowHHMM, takenAt: now.toISOString() }];
                      await updateRecord(m.id, (c) => ({
                        ...c,
                        payload: {
                          ...c.payload,
                          pillsRemaining: nextPills,
                          takenLog: nextTaken,
                        },
                      }));
                      const nextRefill = isMedicationRefillDue({ ...p, pillsRemaining: nextPills }, logicalToday);
                      if (nextRefill.due) {
                        const existingRefill = records.find(
                          (r) => r.type === 'task' && r.status === 'active' && r.title.toLowerCase().includes(`refill ${m.title.toLowerCase()}`)
                        );
                        if (!existingRefill) {
                          await createRecord<TaskPayload>(
                            'task',
                            `Refill ${m.title} (${nextPills} doses left)`,
                            { subtasks: [], boardColumn: 'next' },
                            {
                              doDate: logicalToday,
                              dueDate: p.refillByDate || addDaysIso(logicalToday, Math.max(1, nextPills)),
                              priority: 'high',
                              category: 'Health',
                              tags: ['refill'],
                            }
                          );
                          pushToast(`Taken at ${formatTimeDisplay(nowHHMM, settings.timeFormat)} — created Refill Task for ${m.title}!`, { canUndo: true });
                        }
                        await evaluateAutomations('med_low_stock', {
                          subjectName: m.title,
                          numericValue: nextPills,
                          todayIso: logicalToday,
                        });
                      } else {
                        pushToast(`Logged ${m.title} taken at ${formatTimeDisplay(nowHHMM, settings.timeFormat)}`, { canUndo: true });
                      }
                    }}
                  >
                    <Check size={14} /> Take Now
                  </button>

                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    title="Log that you skipped today's dose (keeps bottle count accurate while still tracking your refill date!)"
                    onClick={async () => {
                      const nextSkipped = [...(p.skippedLog ?? []), { date: logicalToday, loggedAt: new Date().toISOString() }];
                      await updateRecord(m.id, (c) => ({
                        ...c,
                        payload: { ...c.payload, skippedLog: nextSkipped },
                      }));
                      pushToast(`Marked ${m.title} skipped for ${logicalToday} (refill date ${p.refillByDate || 'tracked'} unchanged)`, { canUndo: true });
                    }}
                  >
                    <SkipForward size={13} /> Skip Day
                  </button>

                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    title="Toggle medication reminder notification"
                    onClick={() =>
                      void updateRecord(m.id, (c) => ({
                        ...c,
                        payload: { ...c.payload, reminderEnabled: p.reminderEnabled === false ? true : false },
                      }))
                    }
                  >
                    <Bell size={13} /> {p.reminderEnabled === false ? 'Off' : 'On'}
                  </button>

                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    title="Log bottle refill (+doses and advance Refill By Date)"
                    onClick={async () => {
                      const addDoses = refillAddQty[m.id] ?? 30;
                      const nextDate = addDaysIso(logicalToday, addDoses);
                      await updateRecord(m.id, (c) => ({
                        ...c,
                        payload: {
                          ...c.payload,
                          pillsRemaining: remaining + addDoses,
                          refillByDate: nextDate,
                        },
                      }));
                      pushToast(`Refilled ${m.title} (+${addDoses} doses, next refill by ${nextDate})`, { canUndo: true });
                    }}
                  >
                    <RefreshCw size={13} /> +{refillAddQty[m.id] ?? 30} Refill
                  </button>

                  <button
                    type="button"
                    className="dp-icon-btn"
                    title="Move medication to Trash"
                    aria-label={`Delete ${m.title}`}
                    onClick={async () => {
                      await softDeleteRecord(m.id);
                      pushToast(`Moved "${m.title}" to Trash`, { canUndo: true });
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Recent Taken / Skipped Log & Refill Supply Customizer */}
              {((p.takenLog?.length ?? 0) > 0 || (p.skippedLog?.length ?? 0) > 0) && (
                <details className="dp-details">
                  <summary style={{ fontSize: '0.78rem' }}>
                    Dose History ({p.takenLog?.length ?? 0} taken · {p.skippedLog?.length ?? 0} skipped) &amp; Refill Settings
                  </summary>
                  <div className="dp-stack" style={{ marginTop: 8, gap: 6, fontSize: '0.8rem' }}>
                    <div className="dp-row" style={{ gap: 8 }}>
                      <label className="dp-row" style={{ gap: 4 }}>
                        <span className="dp-muted">Refill amount:</span>
                        <input
                          type="number"
                          min={1}
                          className="dp-input"
                          style={{ width: 64, padding: '2px 6px' }}
                          value={refillAddQty[m.id] ?? 30}
                          onChange={(e) => setRefillAddQty((prev) => ({ ...prev, [m.id]: Math.max(1, Number(e.target.value) || 30) }))}
                        />
                        <span className="dp-muted">doses</span>
                      </label>
                      <label className="dp-row" style={{ gap: 4 }}>
                        <span className="dp-muted">Refill By Date:</span>
                        <input
                          type="date"
                          className="dp-input"
                          style={{ width: 'auto', padding: '2px 6px' }}
                          value={p.refillByDate || ''}
                          onChange={(e) =>
                            void updateRecord(m.id, (c) => ({ ...c, payload: { ...c.payload, refillByDate: e.target.value } }))
                          }
                        />
                      </label>
                    </div>
                    <div className="dp-row" style={{ gap: 5 }}>
                      {(p.takenLog ?? []).slice(-6).reverse().map((t, idx) => (
                        <span key={`t-${idx}`} className="dp-pill">
                          ✓ {t.date} @ {t.timeHHMM ? formatTimeDisplay(t.timeHHMM, settings.timeFormat) : new Date(t.takenAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      ))}
                      {(p.skippedLog ?? []).slice(-4).reverse().map((s, idx) => (
                        <span key={`s-${idx}`} className="dp-pill">
                          ⏭ Skipped {s.date}
                        </span>
                      ))}
                    </div>
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>

      {/* Workout Templates + Integrated Rest Timer & Wellness Log */}
      <div className="dp-grid-2">
        <div className="dp-card dp-stack">
          <h4><Dumbbell size={16} /> Workout Templates &amp; Rest Timer</h4>
          <form
            className="dp-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!workoutTitle.trim()) return;
              await createRecord('workout', workoutTitle.trim(), { details: workoutDetails, restSec, logs: [] });
              setWorkoutTitle('');
              pushToast('Saved workout template', { canUndo: true });
            }}
          >
            <input className="dp-input" placeholder="Workout template (e.g., Full Body A)" value={workoutTitle} onChange={(e) => setWorkoutTitle(e.target.value)} />
            <input className="dp-input" value={workoutDetails} onChange={(e) => setWorkoutDetails(e.target.value)} placeholder="Sets/reps/weight or cardio" />
            <div className="dp-row">
              <label className="dp-row">
                <span className="dp-muted">Rest timer:</span>
                <input type="number" min={5} className="dp-input" style={{ width: 72 }} value={restSec} onChange={(e) => setRestSec(Number(e.target.value) || 60)} />
                <span className="dp-muted">sec</span>
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
                <div className="dp-row" style={{ gap: 4 }}>
                  <button type="button" className="dp-btn dp-btn-sm" onClick={() => void startCountdownTimer(`Rest: ${w.title}`, p.restSec ?? 60)}>
                    {p.restSec ?? 60}s Rest
                  </button>
                  <button
                    type="button"
                    className="dp-icon-btn"
                    title="Delete workout template"
                    onClick={async () => {
                      await softDeleteRecord(w.id);
                      pushToast(`Moved "${w.title}" to Trash`, { canUndo: true });
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="dp-card dp-stack">
          <h4>Private Wellness Check-In</h4>
          <label className="dp-between">
            <span>Steps today</span>
            <span className="dp-row" style={{ gap: 5 }}>
              <input type="number" min={0} className="dp-input" style={{ width: 100 }} value={stepsToday} onChange={(e) => setStepsToday(Number(e.target.value) || 0)} />
              <span className="dp-muted">steps</span>
            </span>
          </label>
          <input className="dp-input" placeholder="Vitals / symptoms / cycle note (optional)…" value={vitalsNote} onChange={(e) => setVitalsNote(e.target.value)} />
          <button
            type="button"
            className="dp-btn dp-btn-primary dp-btn-sm"
            onClick={async () => {
              await createRecord('wellness_log', `Wellness ${logicalToday}`, { date: logicalToday, steps: stepsToday, note: vitalsNote });
              setVitalsNote('');
              pushToast('Logged wellness check-in', { canUndo: true });
            }}
          >
            Save Wellness Log
          </button>
          {wellnessLogs.slice(0, 6).map((wl) => {
            const p = wl.payload as { date: string; steps?: number; note?: string };
            return (
              <div key={wl.id} className="dp-between" style={{ fontSize: '0.82rem' }}>
                <span className="dp-muted">
                  <strong>{p.date}:</strong> {(p.steps ?? 0).toLocaleString()} steps {p.note ? `· ${p.note}` : ''}
                </span>
                <button
                  type="button"
                  className="dp-icon-btn"
                  style={{ width: 22, height: 22 }}
                  title="Delete wellness log"
                  onClick={() => void softDeleteRecord(wl.id)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
