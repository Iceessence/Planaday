import React, { useMemo, useState } from 'react';
import { CalendarPlus, Check, Download, Pause, Play, Plus } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { computeChoreFreshnessAtDate, computeRoomHealthSummary } from '../../core/recurrence';
import { completeActionAtomically, computeChorePunctualityStats, scheduleActionOnCalendar } from '../../core/planActions';
import { recordsToCsv, triggerBrowserDownload } from '../../core/backup';
import { addDaysIso } from '../../core/temporal';
import type { ChorePayload, LifeRecord } from '../../core/types';

export const ChoresView: React.FC = () => {
  const { settings, records, logicalToday, activeDate, pushToast } = useApp();
  const [title, setTitle] = useState('');
  const [room, setRoom] = useState('Kitchen');
  const [intervalDays, setIntervalDays] = useState(3);
  const [choreMode, setChoreMode] = useState<ChorePayload['choreMode']>('after_completion');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [estimateMin, setEstimateMin] = useState(15);
  const [energy, setEnergy] = useState<'low' | 'medium' | 'high'>('low');
  const [supplies, setSupplies] = useState('');
  const [energyFilter, setEnergyFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [maxMinFilter, setMaxMinFilter] = useState(120);
  const [replayDate, setReplayDate] = useState(activeDate);

  const chores = useMemo(
    () => records.filter((r) => r.type === 'chore') as Array<LifeRecord<ChorePayload>>,
    [records]
  );

  const roomHealth = useMemo(() => computeRoomHealthSummary(chores, replayDate), [chores, replayDate]);
  const punctuality = useMemo(() => computeChorePunctualityStats(chores), [chores]);
  const punctualityById = useMemo(() => new Map(punctuality.perChore.map((x) => [x.choreId, x])), [punctuality]);

  const filtered = useMemo(() => {
    return chores.filter((c) => {
      if (energyFilter !== 'all' && c.energy !== energyFilter) return false;
      if ((c.estimateMin ?? 15) > maxMinFilter) return false;
      return true;
    });
  }, [chores, energyFilter, maxMinFilter]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await createRecord<ChorePayload>(
      'chore',
      title.trim(),
      {
        room: room.trim() || 'General',
        choreMode,
        intervalDays: Math.max(1, Math.min(3650, intervalDays)),
        usageTarget: choreMode === 'usage_counter' ? 5 : undefined,
        usageCount: 0,
        elapsedHoursTarget: choreMode === 'elapsed_hours' ? 48 : undefined,
        difficulty,
        checklist: [],
        linkedSupplies: supplies
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        nextDueDate: logicalToday,
        completions: [],
      },
      { estimateMin, energy, category: room.trim() || 'General' }
    );
    setTitle('');
    setSupplies('');
    pushToast('Chore created', { canUndo: true });
  };

  const handleExportCsv = () => {
    const csv = recordsToCsv(
      ['Title', 'Room', 'Mode', 'IntervalDays', 'LastCompleted', 'NextDue', 'TotalCompletions'],
      chores.map((c) => [
        c.title,
        c.payload.room,
        c.payload.choreMode,
        c.payload.intervalDays,
        c.payload.lastCompletedDate ?? '',
        c.payload.nextDueDate,
        c.payload.completions?.length ?? 0,
      ])
    );
    triggerBrowserDownload(csv, `dayplana-chores-${logicalToday}.csv`, 'text/csv');
    pushToast('Exported chores CSV');
  };

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <div className="dp-between">
        <div>
          <h2>Completion-Based Chores & Room Health</h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
            Completing a chore late recalculates the next due date from your actual completion date.
            {punctuality.onTimePct !== null && (
              <>
                {' '}· Overall On-Time Rate: <strong>{punctuality.onTimePct}%</strong> ({punctuality.onTimeCount}/{punctuality.totalTracked} completed on time)
              </>
            )}
          </p>
        </div>
        <div className="dp-row">
          <label className="dp-row" style={{ fontSize: '0.82rem' }}>
            <span className="dp-muted">Historical Replay Date:</span>
            <input
              type="date"
              className="dp-input"
              style={{ width: 'auto', padding: '4px 8px' }}
              value={replayDate}
              onChange={(e) => e.target.value && setReplayDate(e.target.value)}
            />
          </label>
          <button type="button" className="dp-btn dp-btn-sm" onClick={handleExportCsv}>
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {/* Room Health & Freshness Decay Bars (Section 09.02) */}
      {roomHealth.length > 0 && (
        <div className="dp-grid-3">
          {roomHealth.map((rh) => (
            <div key={rh.room} className="dp-card dp-stack" style={{ padding: 12, gap: 6 }}>
              <div className="dp-between">
                <strong>{rh.room}</strong>
                <span className="dp-pill">{rh.healthPct}% fresh</span>
              </div>
              <div className="dp-progress-track">
                <div
                  className="dp-progress-fill"
                  style={{
                    width: `${rh.healthPct}%`,
                    background: rh.healthPct < 40 ? 'var(--dp-danger)' : rh.healthPct < 70 ? 'var(--dp-warn)' : 'var(--dp-ok)',
                  }}
                />
              </div>
              <span className="dp-muted" style={{ fontSize: '0.78rem' }}>
                {rh.overdueCount} overdue · {rh.dueTodayCount} due today · {rh.total} total
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Add Chore Form */}
      <form className="dp-card dp-stack" style={{ padding: 12 }} onSubmit={handleAdd}>
        <div className="dp-row">
          <input className="dp-input" style={{ flex: 2 }} placeholder="New chore (e.g., Wash bedsheets)…" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="dp-input" style={{ flex: 1 }} placeholder="Room / Zone" value={room} onChange={(e) => setRoom(e.target.value)} />
          <label className="dp-row">
            <span className="dp-muted">Every</span>
            <input type="number" min={1} max={3650} className="dp-input" style={{ width: 68 }} value={intervalDays} onChange={(e) => setIntervalDays(Number(e.target.value) || 1)} />
            <span className="dp-muted">d</span>
          </label>
          <button type="submit" className="dp-btn dp-btn-primary">
            <Plus size={15} /> Add
          </button>
        </div>
        <details className="dp-details">
          <summary>More options (7 Recurrence Modes, Difficulty, Energy, Time, Linked Supplies)</summary>
          <div className="dp-row" style={{ marginTop: 10 }}>
            <select aria-label="Chore recurrence mode" className="dp-select" style={{ width: 'auto' }} value={choreMode} onChange={(e) => setChoreMode(e.target.value as ChorePayload['choreMode'])}>
              <option value="after_completion">After Completion (1–3650d)</option>
              <option value="fixed">Fixed Schedule</option>
              <option value="weekdays">Weekdays Only</option>
              <option value="monthly_nth">Monthly / Last Weekend</option>
              <option value="usage_counter">Usage Counter (Log use)</option>
              <option value="elapsed_hours">Elapsed Hours</option>
              <option value="seasonal">Active Seasons</option>
            </select>
            <select aria-label="Energy" className="dp-select" style={{ width: 'auto' }} value={energy} onChange={(e) => setEnergy(e.target.value as typeof energy)}>
              <option value="low">Low Energy</option>
              <option value="medium">Medium Energy</option>
              <option value="high">High Energy</option>
            </select>
            <label className="dp-row">
              <span className="dp-muted">Min:</span>
              <input type="number" min={2} max={240} className="dp-input" style={{ width: 64 }} value={estimateMin} onChange={(e) => setEstimateMin(Number(e.target.value) || 10)} />
            </label>
            <label className="dp-row">
              <span className="dp-muted">Diff (1-5):</span>
              <input type="number" min={1} max={5} className="dp-input" style={{ width: 56 }} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)} />
            </label>
            <input className="dp-input" style={{ flex: 1 }} placeholder="Linked supplies (comma separated)" value={supplies} onChange={(e) => setSupplies(e.target.value)} />
          </div>
        </details>
      </form>

      {/* Energy / Time Quick Filter */}
      <div className="dp-row" style={{ fontSize: '0.84rem' }}>
        <span className="dp-muted">Filter:</span>
        {(['all', 'low', 'medium', 'high'] as const).map((e) => (
          <button key={e} type="button" className={`dp-btn dp-btn-sm ${energyFilter === e ? 'dp-btn-primary' : ''}`} onClick={() => setEnergyFilter(e)}>
            {e === 'all' ? 'All Energy' : `${e} energy`}
          </button>
        ))}
        <label className="dp-row">
          <span className="dp-muted">≤ {maxMinFilter} min</span>
          <input type="range" min={5} max={120} step={5} value={maxMinFilter} onChange={(e) => setMaxMinFilter(Number(e.target.value))} />
        </label>
      </div>

      {/* Chores List */}
      <div className="dp-stack">
        {filtered.map((c) => {
          const state = computeChoreFreshnessAtDate(c.payload, replayDate);
          return (
            <div key={c.id} className="dp-card dp-stack" style={{ padding: 12, gap: 8 }}>
              <div className="dp-between">
                <div>
                  <strong>{c.title}</strong>
                  <div className="dp-row" style={{ marginTop: 4 }}>
                    <span className="dp-pill">{c.payload.room}</span>
                    <span className="dp-pill">{state.freshnessPct}% fresh</span>
                    <span
                      className="dp-pill"
                      style={{ color: state.status === 'overdue' ? 'var(--dp-danger)' : undefined }}
                    >
                      Due: {state.effectiveDueDate}
                    </span>
                    <span className="dp-pill">{c.payload.choreMode.replace('_', ' ')}</span>
                    {punctualityById.get(c.id)?.onTimePct !== null && punctualityById.get(c.id)?.onTimePct !== undefined && (
                      <span className="dp-pill highlight">
                        On-time: {punctualityById.get(c.id)!.onTimePct}% ({punctualityById.get(c.id)!.onTime}/{punctualityById.get(c.id)!.total})
                      </span>
                    )}
                    {c.payload.linkedSupplies?.length > 0 && (
                      <span className="dp-muted" style={{ fontSize: '0.78rem' }}>
                        Supplies: {c.payload.linkedSupplies.join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="dp-row">
                  {c.payload.choreMode === 'usage_counter' && (
                    <button
                      type="button"
                      className="dp-btn dp-btn-sm"
                      onClick={() =>
                        void updateRecord<ChorePayload>(c.id, (cur) => ({
                          ...cur,
                          payload: { ...cur.payload, usageCount: (cur.payload.usageCount ?? 0) + 1 },
                        }))
                      }
                    >
                      Log use ({c.payload.usageCount ?? 0}/{c.payload.usageTarget ?? 5})
                    </button>
                  )}
                  <button
                    type="button"
                    className="dp-btn dp-btn-primary dp-btn-sm"
                    onClick={async () => {
                      await completeActionAtomically(c.id, { completedDateIso: logicalToday });
                      pushToast(`Completed "${c.title}" — next due recalculated from ${logicalToday}`, { canUndo: true });
                    }}
                  >
                    <Check size={14} /> Done Today
                  </button>
                  <button
                    type="button"
                    className="dp-btn dp-btn-sm"
                    onClick={async () => {
                      await updateRecord<ChorePayload>(c.id, (cur) => ({
                        ...cur,
                        payload: {
                          ...cur.payload,
                          snoozedUntil: addDaysIso(logicalToday, 2),
                          snoozeReason: 'Snoozed +2d',
                        },
                      }));
                      pushToast(`Snoozed "${c.title}" for 2 days`, { canUndo: true });
                    }}
                  >
                    Snooze +2d
                  </button>
                  <button
                    type="button"
                    className="dp-icon-btn"
                    title={c.payload.paused ? 'Resume chore' : 'Pause chore'}
                    onClick={() =>
                      void updateRecord<ChorePayload>(c.id, (cur) => ({
                        ...cur,
                        payload: { ...cur.payload, paused: !cur.payload.paused },
                      }))
                    }
                  >
                    {c.payload.paused ? <Play size={14} /> : <Pause size={14} />}
                  </button>
                  <button
                    type="button"
                    className="dp-icon-btn"
                    title="Schedule on Calendar"
                    onClick={async () => {
                      await scheduleActionOnCalendar(c.id, logicalToday, '16:00', c.estimateMin ?? 15);
                      pushToast(`Scheduled "${c.title}" on Calendar`, { canUndo: true });
                    }}
                  >
                    <CalendarPlus size={14} />
                  </button>
                  <button
                    type="button"
                    className="dp-btn dp-btn-danger dp-btn-sm"
                    onClick={async () => {
                      await softDeleteRecord(c.id);
                      pushToast(`Moved "${c.title}" to Trash`, { canUndo: true });
                    }}
                  >
                    Trash
                  </button>
                </div>
              </div>
              <div className="dp-progress-track">
                <div
                  className="dp-progress-fill"
                  style={{
                    width: `${state.freshnessPct}%`,
                    background: state.status === 'overdue' ? 'var(--dp-danger)' : state.status === 'due_today' ? 'var(--dp-warn)' : 'var(--dp-ok)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
