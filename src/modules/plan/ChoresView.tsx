import React, { useMemo, useState } from 'react';
import { CalendarPlus, Check, Download, Pause, Pencil, Play, Plus } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { computeChoreFreshnessAtDate, computeRoomHealthSummary } from '../../core/recurrence';
import { completeActionAtomically, computeChorePunctualityStats, scheduleActionOnCalendar } from '../../core/planActions';
import { recordsToCsv, triggerBrowserDownload } from '../../core/backup';
import { addDaysIso } from '../../core/temporal';
import { SortFilterBar } from '../../components/Common/SortFilterBar';
import { TabSettingsDrawer } from '../../components/Common/TabSettingsDrawer';
import { SafeInput } from '../../components/Common/SafeTextEditor';
import type { ChorePayload, LifeRecord } from '../../core/types';

export const ChoresView: React.FC = () => {
  const { settings, patchSettings, records, logicalToday, activeDate, pushToast } = useApp();
  const [title, setTitle] = useState('');
  const [room, setRoom] = useState('Kitchen');
  const [intervalDays, setIntervalDays] = useState(3);
  const [choreMode, setChoreMode] = useState<ChorePayload['choreMode']>('after_completion');
  const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [estimateMin, setEstimateMin] = useState(15);
  const [energy, setEnergy] = useState<'low' | 'medium' | 'high'>('low');
  const [supplies, setSupplies] = useState('');
  const [choreNotify, setChoreNotify] = useState(true);
  const [choreReminderTime, setChoreReminderTime] = useState('');
  const [shareFamily, setShareFamily] = useState(true);
  const [markImportant, setMarkImportant] = useState(false);
  const [energyFilter, setEnergyFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [maxMinFilter, setMaxMinFilter] = useState(120);
  const [choreSearch, setChoreSearch] = useState('');
  const [roomFilter, setRoomFilter] = useState('all');
  const [dueFilter, setDueFilter] = useState<'all' | 'overdue' | 'due_today' | 'fresh'>('all');
  const [sortBy, setSortBy] = useState<'custom' | 'due' | 'freshness' | 'room' | 'difficulty' | 'title'>('due');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [replayDate, setReplayDate] = useState(activeDate);
  const [editingChoreId, setEditingChoreId] = useState<string | null>(null);
  const [dragChoreId, setDragChoreId] = useState<string | null>(null);
  const [logChoreMin, setLogChoreMin] = useState<Record<string, number>>({});
  const [logChoreDistracted, setLogChoreDistracted] = useState<Record<string, boolean>>({});

  const chores = useMemo(
    () => records.filter((r) => r.type === 'chore') as Array<LifeRecord<ChorePayload>>,
    [records]
  );

  const roomHealth = useMemo(() => computeRoomHealthSummary(chores, replayDate), [chores, replayDate]);
  const punctuality = useMemo(() => computeChorePunctualityStats(chores), [chores]);
  const punctualityById = useMemo(() => new Map(punctuality.perChore.map((x) => [x.choreId, x])), [punctuality]);

  const filtered = useMemo(() => {
    const q = choreSearch.trim().toLowerCase();
    const list = chores.filter((c) => {
      if (energyFilter !== 'all' && c.energy !== energyFilter) return false;
      if ((c.estimateMin ?? 15) > maxMinFilter) return false;
      if (roomFilter !== 'all' && c.payload.room !== roomFilter) return false;
      const st = computeChoreFreshnessAtDate(c.payload, replayDate);
      if (dueFilter === 'overdue' && st.status !== 'overdue') return false;
      if (dueFilter === 'due_today' && st.status !== 'due_today' && st.status !== 'overdue') return false;
      if (dueFilter === 'fresh' && st.status !== 'fresh') return false;
      if (q) {
        const hay = `${c.title} ${c.payload.room} ${(c.payload.linkedSupplies ?? []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortBy === 'custom') {
        const oa = a.payload.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const ob = b.payload.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (oa !== ob) return (oa - ob) * dir;
        return a.title.localeCompare(b.title) * dir;
      }
      if (sortBy === 'title') return a.title.localeCompare(b.title) * dir;
      if (sortBy === 'room') return a.payload.room.localeCompare(b.payload.room) * dir;
      if (sortBy === 'difficulty') return ((a.payload.difficulty || 1) - (b.payload.difficulty || 1)) * dir;
      if (sortBy === 'freshness') {
        const fa = computeChoreFreshnessAtDate(a.payload, replayDate).freshnessPct;
        const fb = computeChoreFreshnessAtDate(b.payload, replayDate).freshnessPct;
        return (fa - fb) * dir;
      }
      return (a.payload.nextDueDate || '9999').localeCompare(b.payload.nextDueDate || '9999') * dir;
    });
  }, [chores, energyFilter, maxMinFilter, choreSearch, roomFilter, dueFilter, replayDate, sortBy, sortDir]);

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
        notifyEnabled: choreNotify,
        customReminderTime: choreReminderTime || null,
        completions: [],
      },
      {
        estimateMin,
        energy,
        category: room.trim() || 'General',
        sharedWithAll: shareFamily,
        isImportant: markImportant,
      }
    );
    setTitle('');
    setSupplies('');
    setChoreReminderTime('');
    setChoreNotify(true);
    setMarkImportant(false);
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
    triggerBrowserDownload(csv, `planaday-chores-${logicalToday}.csv`, 'text/csv');
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

      {/* In-Tab Chore Reminder Settings Drawer */}
      <TabSettingsDrawer
        title="Chore Reminder Settings"
        subtitle="Global chore digest time — you can also give any individual chore its own reminder time under More options."
      >
        <div className="dp-row" style={{ flexWrap: 'wrap', gap: 12, fontSize: '0.83rem' }}>
          <label className="dp-row" style={{ gap: 5 }}>
            <input
              type="checkbox"
              checked={settings.notificationPrefs.notifyChores}
              onChange={(e) =>
                void patchSettings({
                  notificationPrefs: { ...settings.notificationPrefs, notifyChores: e.target.checked },
                })
              }
            />
            <span>Enable Chore Reminders (Global Default)</span>
          </label>
          <label className="dp-row" style={{ gap: 6 }}>
            <span className="dp-muted">Daily Due-Chore Digest Time:</span>
            <input
              type="time"
              className="dp-input"
              style={{ width: 126 }}
              value={settings.notificationPrefs.choreReminderTime}
              onChange={(e) =>
                void patchSettings({
                  notificationPrefs: { ...settings.notificationPrefs, choreReminderTime: e.target.value || '09:00' },
                })
              }
            />
          </label>
        </div>
      </TabSettingsDrawer>

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
          <input list="dp-chore-rooms" className="dp-input" style={{ flex: 1 }} placeholder="Room / Zone (pick or type)…" value={room} onChange={(e) => setRoom(e.target.value)} />
          <datalist id="dp-chore-rooms">
            {['Kitchen', 'Bathroom', 'Bedroom', 'Living Room', 'Laundry', 'Garage', 'Yard', 'Office', 'Car', 'Entryway', 'Home'].map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <label className="dp-row">
            <span className="dp-muted">Every</span>
            <input type="number" min={1} max={3650} className="dp-input" style={{ width: 68 }} value={intervalDays} onChange={(e) => setIntervalDays(Number(e.target.value) || 1)} />
            <span className="dp-muted">days</span>
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
            <label className="dp-row" style={{ fontSize: '0.82rem', gap: 5 }}>
              <input type="checkbox" checked={choreNotify} onChange={(e) => setChoreNotify(e.target.checked)} />
              <span>🔔 Notify</span>
            </label>
            <label className="dp-row" style={{ fontSize: '0.82rem', gap: 4 }}>
              <span className="dp-muted">Specific Time (opt):</span>
              <input
                type="time"
                aria-label="Per-chore reminder time"
                className="dp-input"
                style={{ width: 118 }}
                value={choreReminderTime}
                onChange={(e) => setChoreReminderTime(e.target.value)}
              />
            </label>
            <label className="dp-row" style={{ fontSize: '0.82rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={shareFamily} onChange={(e) => setShareFamily(e.target.checked)} />
              <span>🏡 Share w/ Family</span>
            </label>
            <label className="dp-row" style={{ fontSize: '0.82rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={markImportant} onChange={(e) => setMarkImportant(e.target.checked)} />
              <span>★ Important</span>
            </label>
          </div>
        </details>
      </form>

      {/* 1-Click Starter Chore Templates */}
      <div className="dp-row" style={{ fontSize: '0.8rem', gap: 5 }}>
        <span className="dp-muted">Quick Templates:</span>
        {[
          { t: 'Wash Bedsheets', r: 'Bedroom', d: 7, m: 15 },
          { t: 'Bathroom Reset', r: 'Bathroom', d: 7, m: 20 },
          { t: 'Kitchen Counters & Sink', r: 'Kitchen', d: 1, m: 10 },
          { t: 'Vacuum / Sweep Floors', r: 'Living Room', d: 4, m: 20 },
          { t: 'Change Air Filter', r: 'Home', d: 90, m: 10 },
        ].map((tpl) => (
          <button
            key={tpl.t}
            type="button"
            className="dp-btn dp-btn-sm"
            onClick={() => {
              setTitle(tpl.t);
              setRoom(tpl.r);
              setIntervalDays(tpl.d);
              setEstimateMin(tpl.m);
            }}
          >
            + {tpl.t} ({tpl.d}d)
          </button>
        ))}
      </div>

      {/* Easy Sort & Filter Bar */}
      <SortFilterBar
        search={choreSearch}
        onSearchChange={setChoreSearch}
        searchPlaceholder="Search chores, rooms, supplies…"
        sortBy={sortBy}
        onSortByChange={(v) => setSortBy(v as typeof sortBy)}
        sortOptions={[
          { value: 'custom', label: 'Custom Drag Order' },
          { value: 'due', label: 'Next Due Date' },
          { value: 'freshness', label: 'Room Freshness %' },
          { value: 'room', label: 'Room' },
          { value: 'difficulty', label: 'Difficulty' },
          { value: 'title', label: 'Title (A–Z)' },
        ]}
        sortDir={sortDir}
        onSortDirToggle={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
        chips={[
          { value: 'all', label: 'All' },
          { value: 'overdue', label: 'Overdue' },
          { value: 'due_today', label: 'Due Today & Overdue' },
          { value: 'fresh', label: 'Fresh' },
        ]}
        activeChip={dueFilter}
        onChipChange={(v) => setDueFilter(v as typeof dueFilter)}
        extraFilters={[
          {
            label: 'Filter by room',
            value: roomFilter,
            onChange: setRoomFilter,
            options: [
              { value: 'all', label: 'All Rooms' },
              ...Array.from(new Set(chores.map((c) => c.payload.room))).sort().map((r) => ({ value: r, label: r })),
            ],
          },
          {
            label: 'Filter by energy',
            value: energyFilter,
            onChange: (v) => setEnergyFilter(v as typeof energyFilter),
            options: [
              { value: 'all', label: 'All Energy' },
              { value: 'low', label: 'Low Energy' },
              { value: 'medium', label: 'Medium Energy' },
              { value: 'high', label: 'High Energy' },
            ],
          },
        ]}
        totalCount={chores.length}
        shownCount={filtered.length}
        onReset={() => {
          setChoreSearch('');
          setRoomFilter('all');
          setDueFilter('all');
          setEnergyFilter('all');
          setMaxMinFilter(120);
        }}
      />
      <div className="dp-row" style={{ fontSize: '0.8rem' }}>
        <label className="dp-row">
          <span className="dp-muted">Max time: ≤ {maxMinFilter} min</span>
          <input type="range" min={5} max={120} step={5} value={maxMinFilter} onChange={(e) => setMaxMinFilter(Number(e.target.value))} />
        </label>
      </div>

      {/* Chores List */}
      <div className="dp-stack">
        {filtered.map((c) => {
          const state = computeChoreFreshnessAtDate(c.payload, replayDate);
          return (
            <div
              key={c.id}
              draggable
              onDragStart={() => setDragChoreId(c.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault();
                if (!dragChoreId || dragChoreId === c.id) return;
                const ids = filtered.map((x) => x.id);
                const from = ids.indexOf(dragChoreId);
                const to = ids.indexOf(c.id);
                if (from >= 0 && to >= 0) {
                  ids.splice(from, 1);
                  ids.splice(to, 0, dragChoreId);
                  for (let i = 0; i < ids.length; i++) {
                    await updateRecord<ChorePayload>(ids[i], (cur) => ({ ...cur, payload: { ...cur.payload, sortOrder: i } }), { skipUndo: true });
                  }
                  setSortBy('custom');
                  pushToast('Saved custom chore order!');
                }
                setDragChoreId(null);
              }}
              className="dp-card dp-stack"
              style={{ padding: 12, gap: 8 }}
            >
              <div className="dp-between">
                <div>
                  <strong>
                    {c.isImportant ? '★ ' : ''}
                    {c.title}
                  </strong>
                  <div className="dp-row" style={{ marginTop: 4 }}>
                    <span className="dp-pill">{c.payload.room}</span>
                    {(c.sharedWithAll || (c.sharedWithProfileIds?.length ?? 0) > 0) && (
                      <span className="dp-pill highlight">🏡 Family</span>
                    )}
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
                  <label className="dp-row" style={{ gap: 3, fontSize: '0.76rem' }} title="Optional actual minutes taken">
                    <input
                      type="number"
                      min={1}
                      max={300}
                      className="dp-input"
                      style={{ width: 54, padding: '2px 5px', fontSize: '0.76rem' }}
                      value={logChoreMin[c.id] ?? c.estimateMin ?? 15}
                      onChange={(e) => setLogChoreMin((p) => ({ ...p, [c.id]: Number(e.target.value) || 10 }))}
                    />
                    <span className="dp-muted">m</span>
                  </label>
                  <label className="dp-row" style={{ gap: 3, fontSize: '0.75rem', cursor: 'pointer' }} title="Mark if distracted while doing this chore">
                    <input
                      type="checkbox"
                      checked={Boolean(logChoreDistracted[c.id])}
                      onChange={(e) => setLogChoreDistracted((p) => ({ ...p, [c.id]: e.target.checked }))}
                    />
                    <span className="dp-muted">Distracted</span>
                  </label>
                  <button
                    type="button"
                    className="dp-btn dp-btn-primary dp-btn-sm"
                    onClick={async () => {
                      const mins = logChoreMin[c.id] ?? c.estimateMin ?? 15;
                      const dist = Boolean(logChoreDistracted[c.id]);
                      await completeActionAtomically(c.id, { completedDateIso: logicalToday });
                      await updateRecord<ChorePayload>(
                        c.id,
                        (cur) => {
                          const comps = [...(cur.payload.completions ?? [])];
                          if (comps.length > 0) {
                            comps[comps.length - 1] = {
                              ...comps[comps.length - 1],
                              minutesSpent: mins,
                              distracted: dist,
                            };
                          }
                          return { ...cur, payload: { ...cur.payload, completions: comps } };
                        },
                        { skipUndo: true }
                      );
                      pushToast(`Completed "${c.title}" (${mins}m${dist ? ', distracted' : ''}) — next due recalculated`, { canUndo: true });
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
                    className={`dp-btn dp-btn-sm ${editingChoreId === c.id ? 'dp-btn-primary' : ''}`}
                    title="Edit chore details"
                    onClick={() => setEditingChoreId(editingChoreId === c.id ? null : c.id)}
                  >
                    <Pencil size={13} /> {editingChoreId === c.id ? 'Done Editing' : 'Edit'}
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
              {editingChoreId === c.id && (
                <div className="dp-stack" style={{ gap: 8, padding: 10, borderRadius: 8, background: 'var(--dp-surface-muted)' }}>
                  <strong style={{ fontSize: '0.82rem' }}>✏️ Edit Chore Settings</strong>
                  <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <SafeInput
                      className="dp-input"
                      recordKey={`${c.id}:title`}
                      externalValue={c.title}
                      onCommit={(val) => {
                        const trimmed = val.trim();
                        if (trimmed && trimmed !== c.title) {
                          void updateRecord<ChorePayload>(c.id, (cur) => ({ ...cur, title: trimmed }));
                        }
                      }}
                      style={{ flex: 2, minWidth: 160 }}
                      placeholder="Chore name…"
                      aria-label="Edit chore title"
                    />
                    <SafeInput
                      className="dp-input"
                      recordKey={`${c.id}:room`}
                      externalValue={c.payload.room}
                      onCommit={(val) => {
                        const trimmed = val.trim() || 'General';
                        void updateRecord<ChorePayload>(c.id, (cur) => ({
                          ...cur,
                          category: trimmed,
                          payload: { ...cur.payload, room: trimmed },
                        }));
                      }}
                      style={{ flex: 1, minWidth: 120 }}
                      placeholder="Room / Zone…"
                      aria-label="Edit chore room"
                    />
                    <label className="dp-row" style={{ gap: 4, fontSize: '0.82rem' }}>
                      <span className="dp-muted">Every</span>
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        className="dp-input"
                        style={{ width: 68 }}
                        value={c.payload.intervalDays}
                        onChange={(e) =>
                          void updateRecord<ChorePayload>(c.id, (cur) => ({
                            ...cur,
                            payload: { ...cur.payload, intervalDays: Math.max(1, Math.min(3650, Number(e.target.value) || 1)) },
                          }))
                        }
                      />
                      <span className="dp-muted">days</span>
                    </label>
                  </div>
                  <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8, fontSize: '0.82rem' }}>
                    <select
                      aria-label="Edit chore recurrence mode"
                      className="dp-select"
                      style={{ width: 'auto' }}
                      value={c.payload.choreMode}
                      onChange={(e) =>
                        void updateRecord<ChorePayload>(c.id, (cur) => ({
                          ...cur,
                          payload: { ...cur.payload, choreMode: e.target.value as ChorePayload['choreMode'] },
                        }))
                      }
                    >
                      <option value="after_completion">After Completion</option>
                      <option value="fixed">Fixed Schedule</option>
                      <option value="weekdays">Weekdays Only</option>
                      <option value="monthly_nth">Monthly / Last Weekend</option>
                      <option value="usage_counter">Usage Counter</option>
                      <option value="elapsed_hours">Elapsed Hours</option>
                      <option value="seasonal">Active Seasons</option>
                    </select>
                    <select
                      aria-label="Edit chore energy"
                      className="dp-select"
                      style={{ width: 'auto' }}
                      value={c.energy ?? 'low'}
                      onChange={(e) =>
                        void updateRecord<ChorePayload>(c.id, (cur) => ({
                          ...cur,
                          energy: e.target.value as LifeRecord['energy'],
                        }))
                      }
                    >
                      <option value="low">Low Energy</option>
                      <option value="medium">Medium Energy</option>
                      <option value="high">High Energy</option>
                    </select>
                    <label className="dp-row" style={{ gap: 4 }}>
                      <span className="dp-muted">Est:</span>
                      <input
                        type="number"
                        min={2}
                        max={240}
                        className="dp-input"
                        style={{ width: 64 }}
                        value={c.estimateMin ?? 15}
                        onChange={(e) =>
                          void updateRecord<ChorePayload>(c.id, (cur) => ({
                            ...cur,
                            estimateMin: Math.max(2, Number(e.target.value) || 10),
                          }))
                        }
                      />
                      <span className="dp-muted">min</span>
                    </label>
                    <label className="dp-row" style={{ gap: 4 }}>
                      <span className="dp-muted">Diff:</span>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        className="dp-input"
                        style={{ width: 54 }}
                        value={c.payload.difficulty}
                        onChange={(e) =>
                          void updateRecord<ChorePayload>(c.id, (cur) => ({
                            ...cur,
                            payload: {
                              ...cur.payload,
                              difficulty: Math.max(1, Math.min(5, Number(e.target.value) || 1)) as 1 | 2 | 3 | 4 | 5,
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="dp-row" style={{ gap: 4 }}>
                      <span className="dp-muted">Next Due:</span>
                      <input
                        type="date"
                        className="dp-input"
                        style={{ width: 'auto' }}
                        value={c.payload.nextDueDate}
                        onChange={(e) =>
                          e.target.value &&
                          void updateRecord<ChorePayload>(c.id, (cur) => ({
                            ...cur,
                            payload: { ...cur.payload, nextDueDate: e.target.value },
                          }))
                        }
                      />
                    </label>
                    <SafeInput
                      className="dp-input"
                      recordKey={`${c.id}:supplies`}
                      externalValue={(c.payload.linkedSupplies ?? []).join(', ')}
                      onCommit={(val) =>
                        void updateRecord<ChorePayload>(c.id, (cur) => ({
                          ...cur,
                          payload: {
                            ...cur.payload,
                            linkedSupplies: val
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          },
                        }))
                      }
                      style={{ flex: 1, minWidth: 140 }}
                      placeholder="Supplies (comma separated)…"
                      aria-label="Edit linked supplies"
                    />
                    <label className="dp-row" style={{ gap: 4, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={c.payload.notifyEnabled !== false}
                        onChange={(e) =>
                          void updateRecord<ChorePayload>(c.id, (cur) => ({
                            ...cur,
                            payload: { ...cur.payload, notifyEnabled: e.target.checked },
                          }))
                        }
                      />
                      <span>🔔 Notify</span>
                    </label>
                    <input
                      type="time"
                      aria-label="Edit per-chore reminder time"
                      className="dp-input"
                      style={{ width: 118 }}
                      value={c.payload.customReminderTime ?? ''}
                      onChange={(e) =>
                        void updateRecord<ChorePayload>(c.id, (cur) => ({
                          ...cur,
                          payload: { ...cur.payload, customReminderTime: e.target.value || null },
                        }))
                      }
                    />
                    <label className="dp-row" style={{ gap: 4, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(c.sharedWithAll)}
                        onChange={(e) =>
                          void updateRecord<ChorePayload>(c.id, (cur) => ({ ...cur, sharedWithAll: e.target.checked }))
                        }
                      />
                      <span>🏡 Family</span>
                    </label>
                    <label className="dp-row" style={{ gap: 4, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(c.isImportant)}
                        onChange={(e) =>
                          void updateRecord<ChorePayload>(c.id, (cur) => ({ ...cur, isImportant: e.target.checked }))
                        }
                      />
                      <span>★ Important</span>
                    </label>
                  </div>
                </div>
              )}
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
