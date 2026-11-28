import { useViewFormGuard, useViewActionGuard } from '../../components/Common/viewSafety';
import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarPlus, GripVertical, Pause, Play, Plus, Star, Timer, Trash2 } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { completeActionAtomically, scheduleActionOnCalendar } from '../../core/planActions';
import { computeDurationAnalytics, computeLearnedTaskDurations, computeTaskAgeMetadata } from '../../core/taskScheduler';
import { createId } from '../../core/db';
import { SortFilterBar } from '../../components/Common/SortFilterBar';
import { SafeInput, SafeTextarea } from '../../components/Common/SafeTextEditor';
import { ModalDialog } from '../../components/Common/ModalDialog';
import type { DurationCompletionLog, LifeRecord, SubtaskItem, TaskPayload } from '../../core/types';

function countSubtasks(list: SubtaskItem[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const s of list) {
    total++;
    if (s.done) done++;
    if (s.children?.length) {
      const sub = countSubtasks(s.children);
      done += sub.done;
      total += sub.total;
    }
  }
  return { done, total };
}

function toggleNestedSubtask(list: SubtaskItem[], targetId: string): SubtaskItem[] {
  return list.map((s) => ({
    ...s,
    done: s.id === targetId ? !s.done : s.done,
    children: s.children ? toggleNestedSubtask(s.children, targetId) : undefined,
  }));
}

function addNestedSubtask(list: SubtaskItem[], parentId: string, title: string): SubtaskItem[] {
  return list.map((s) =>
    s.id === parentId
      ? { ...s, children: [...(s.children ?? []), { id: createId('sub'), title, done: false }] }
      : { ...s, children: s.children ? addNestedSubtask(s.children, parentId, title) : undefined }
  );
}

/**
 * Prevents circular Waiting-For / Blocked-By dependency graphs (Section 09.01).
 */
export function wouldCreateCycle(
  taskId: string,
  candidateBlockerId: string,
  allTasks: Array<LifeRecord<TaskPayload>>
): boolean {
  if (taskId === candidateBlockerId) return true;
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const stack = [candidateBlockerId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === taskId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const deps = byId.get(cur)?.payload.blockedByIds ?? [];
    for (const d of deps) stack.push(d);
  }
  return false;
}

const CHECKLIST_TEMPLATES: Record<string, string[]> = {
  'Trip Prep': ['Check passport/ID', 'Charge power bank', 'Pause deliveries', 'Lock windows'],
  'Deep Work Session': ['Silence phone', 'Open target document', 'Set 25m Pomodoro', 'Write 1-line summary'],
  'Admin Errand': ['Gather confirmation number', 'Draft questions', 'Log outcome in Notes'],
};

export const TasksView: React.FC = () => {
  const { settings, patchSettings, records, activeDate, logicalToday, pushToast, setActiveView } = useApp();
  const guardForm = useViewFormGuard(message => pushToast(message, { tone: 'warn' }));
  const guardAction = useViewActionGuard(message => pushToast(message, { tone: 'warn' }));
  const [title, setTitle] = useState('');
  const [doDate, setDoDate] = useState(activeDate);
  const [dueDate, setDueDate] = useState('');
  const [energy, setEnergy] = useState<'low' | 'medium' | 'high'>('medium');
  const [estimateMin, setEstimateMin] = useState(25);
  const [priority, setPriority] = useState<'none' | 'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [taskType, setTaskType] = useState('');
  const [contextId, setContextId] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [shareFamily, setShareFamily] = useState(false);
  const [markImportant, setMarkImportant] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [smartFilter, setSmartFilter] = useState<'all' | 'today' | 'low_quick' | 'overdue_hard' | 'completed'>('all');
  const [taskSearch, setTaskSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent' | 'high' | 'medium' | 'low' | 'none'>('all');
  const [energyFilter, setEnergyFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [taskSortBy, setTaskSortBy] = useState<'custom' | 'doDate' | 'dueDate' | 'priority' | 'estimate' | 'title' | 'created' | 'updated'>('custom');
  const [taskSortDir, setTaskSortDir] = useState<'asc' | 'desc'>('asc');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [newSubText, setNewSubText] = useState('');
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);

  // Live Task Timer (Start/Pause/Resume/Stop) & Completion Duration + Distraction Logging Modal (Sections 9.5 & 9.6)
  const [activeTimerTask, setActiveTimerTask] = useState<{ taskId: string; startedAtMs: number; accSec: number; paused: boolean; startedIso: string } | null>(null);
  const [completingTask, setCompletingTask] = useState<LifeRecord<TaskPayload> | null>(null);
  const [compActualMin, setCompActualMin] = useState(25);
  const [compBreakMin, setCompBreakMin] = useState(0);
  const [compDistracted, setCompDistracted] = useState(false);
  const [compDistractMin, setCompDistractMin] = useState(0);
  const [compNote, setCompNote] = useState('');

  const tasks = useMemo(
    () => records.filter((r) => r.type === 'task') as Array<LifeRecord<TaskPayload>>,
    [records]
  );

  const taskById = useMemo(() => new Map(tasks.map(t => [t.id, t])), [tasks]);
  const activePinnedCount = useMemo(() => tasks.filter(x => x.payload.pinnedTop3Date === activeDate && x.status === 'active').length, [tasks, activeDate]);
  const learnedDurations = useMemo(() => computeLearnedTaskDurations(tasks), [tasks]);
  const durationStats = useMemo(() => computeDurationAnalytics(tasks, []), [tasks]);

  const filtered = useMemo(() => {
    const q = taskSearch.trim().toLowerCase();
    const list = tasks.filter((t) => {
      if (smartFilter === 'completed') {
        if (t.status !== 'done') return false;
      } else {
        if (t.status === 'done') return false;
        if (smartFilter === 'today' && t.doDate !== activeDate) return false;
        if (smartFilter === 'low_quick' && !(t.energy === 'low' && (t.estimateMin ?? 30) <= 15)) return false;
        // Only a missed HARD dueDate triggers overdue (Section 09.01)
        if (smartFilter === 'overdue_hard' && !(t.dueDate && t.dueDate < logicalToday)) return false;
      }
      if (priorityFilter !== 'all' && (t.priority || 'none') !== priorityFilter) return false;
      if (energyFilter !== 'all' && (t.energy || 'medium') !== energyFilter) return false;
      if (q) {
        const hay = `${t.title} ${(t.tags ?? []).join(' ')} ${t.payload.notes ?? ''} ${t.payload.taskType ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const priRank: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 };
    const dir = taskSortDir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (taskSortBy === 'custom') {
        const oa = a.payload.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const ob = b.payload.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (oa !== ob) return (oa - ob) * dir;
        return a.createdAt.localeCompare(b.createdAt) * dir;
      }
      if (taskSortBy === 'title') return a.title.localeCompare(b.title) * dir;
      if (taskSortBy === 'priority') return ((priRank[b.priority || 'none'] ?? 0) - (priRank[a.priority || 'none'] ?? 0)) * dir;
      if (taskSortBy === 'estimate') return ((a.estimateMin ?? 30) - (b.estimateMin ?? 30)) * dir;
      if (taskSortBy === 'dueDate') return (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31') * dir;
      if (taskSortBy === 'created') return a.createdAt.localeCompare(b.createdAt) * dir;
      if (taskSortBy === 'updated') return a.updatedAt.localeCompare(b.updatedAt) * dir;
      return (a.doDate || '9999-12-31').localeCompare(b.doDate || '9999-12-31') * dir;
    });
  }, [tasks, smartFilter, activeDate, logicalToday, taskSearch, priorityFilter, energyFilter, taskSortBy, taskSortDir]);

  const reorderTasks = async (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const ids = filtered.map((t) => t.id);
    const fromIdx = ids.indexOf(sourceId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, sourceId);
    for (let i = 0; i < ids.length; i++) {
      await updateRecord<TaskPayload>(
        ids[i],
        (c) => ({ ...c, payload: { ...c.payload, sortOrder: i } }),
        { skipUndo: true }
      );
    }
    setTaskSortBy('custom');
    setTaskSortDir('asc');
    pushToast('Saved custom task order!');
  };

  const openCompleteWithDuration = (t: LifeRecord<TaskPayload>) => {
    let defaultMin = t.estimateMin ?? 25;
    if (activeTimerTask && activeTimerTask.taskId === t.id) {
      const elapsedSec = activeTimerTask.accSec + (activeTimerTask.paused ? 0 : Math.round((Date.now() - activeTimerTask.startedAtMs) / 1000));
      defaultMin = Math.max(1, Math.round(elapsedSec / 60));
    }
    setCompletingTask(t);
    setCompActualMin(defaultMin);
    setCompBreakMin(0);
    setCompDistracted(false);
    setCompDistractMin(0);
    setCompNote('');
  };

  const confirmCompleteWithDuration = async () => {
    if (!completingTask) return;
    const t = completingTask;
    const nowIso = new Date().toISOString();
    const timerMatch = activeTimerTask?.taskId === t.id ? activeTimerTask : null;
    const logEntry: DurationCompletionLog = {
      id: createId('dlog'),
      startedAt: timerMatch?.startedIso ?? new Date(Date.now() - Math.max(1, compActualMin) * 60_000).toISOString(),
      completedAt: nowIso,
      actualMinutes: Math.max(1, compActualMin),
      estimatedMinutes: t.estimateMin ?? undefined,
      breakMinutes: compBreakMin || undefined,
      distracted: compDistracted,
      distractionMinutes: compDistracted ? compDistractMin || undefined : undefined,
      notes: compNote.trim() || undefined,
      isEstimatedStart: !timerMatch,
    };
    await updateRecord<TaskPayload>(t.id, (c) => ({
      ...c,
      payload: {
        ...c.payload,
        actualMinutes: (c.payload.actualMinutes ?? 0) + logEntry.actualMinutes,
        startedAt: logEntry.startedAt,
        completedAt: nowIso,
        completionLogs: [...(c.payload.completionLogs ?? []), logEntry],
      },
    }));
    await completeActionAtomically(t.id, { completedDateIso: activeDate });
    if (timerMatch) setActiveTimerTask(null);
    setCompletingTask(null);
    pushToast(`Completed "${t.title}" (${logEntry.actualMinutes}m${logEntry.distracted ? ', distracted' : ', focused'})`, { canUndo: true });
  };

  const handleCarryForwardPast = async () => {
    const past = tasks.filter((t) => t.status === 'active' && t.doDate && t.doDate < logicalToday);
    for (const t of past) {
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
    pushToast(past.length ? `Carried ${past.length} unfinished task(s) to today (history & age preserved)` : 'No past-date unfinished tasks.');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const tags = tagsText
      .split(/[,\s#]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const maxOrder = tasks.reduce((m, x) => Math.max(m, x.payload.sortOrder ?? 0), 0);
    await createRecord<TaskPayload>(
      'task',
      title.trim(),
      {
        subtasks: [],
        boardColumn: 'next',
        sortOrder: maxOrder + 1,
        taskType: taskType.trim() || undefined,
        contextId: contextId || null,
        originalDueDate: dueDate || null,
        rescheduleCount: 0,
      },
      {
        doDate: doDate || null,
        dueDate: dueDate || null,
        energy,
        estimateMin,
        priority,
        tags,
        sharedWithAll: shareFamily,
        isImportant: markImportant,
      }
    );
    setTitle('');
    setDueDate('');
    setTagsText('');
    setTaskType('');
    setShareFamily(false);
    setMarkImportant(false);
    pushToast('Task added', { canUndo: true });
  };

  const renderSubtasks = (task: LifeRecord<TaskPayload>, items: SubtaskItem[], depth = 0) => (
    <div style={{ marginInlineStart: depth * 16 }} className="dp-stack">
      {items.map((sub) => (
        <div key={sub.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="dp-between">
            <label className="dp-row" style={{ cursor: 'pointer', fontSize: '0.86rem' }}>
              <input
                type="checkbox"
                checked={sub.done}
                onChange={() =>
                  void updateRecord<TaskPayload>(task.id, (c) => ({
                    ...c,
                    payload: { ...c.payload, subtasks: toggleNestedSubtask(c.payload.subtasks, sub.id) },
                  }))
                }
              />
              <span style={{ textDecoration: sub.done ? 'line-through' : undefined }}>{sub.title}</span>
            </label>
            <button
              type="button"
              className="dp-btn dp-btn-ghost dp-btn-sm"
              onClick={() => {
                const subName = newSubText.trim() || 'Follow-up step';
                void updateRecord<TaskPayload>(task.id, (c) => ({
                  ...c,
                  payload: { ...c.payload, subtasks: addNestedSubtask(c.payload.subtasks, sub.id, subName) },
                }));
                setNewSubText('');
              }}
            >
              + Nest
            </button>
          </div>
          {sub.children?.length ? renderSubtasks(task, sub.children, depth + 1) : null}
        </div>
      ))}
    </div>
  );

  const renderTaskCard = (t: LifeRecord<TaskPayload>, idxInList = 0) => {
    const subStats = countSubtasks(t.payload.subtasks ?? []);
    const isHardOverdue = Boolean(t.status === 'active' && t.dueDate && t.dueDate < logicalToday);
    const age = computeTaskAgeMetadata(t, logicalToday);
    const isTimed = activeTimerTask?.taskId === t.id;
    const blockers = (t.payload.blockedByIds ?? [])
      .map((id) => taskById.get(id))
      .filter((x): x is LifeRecord<TaskPayload> => Boolean(x && x.status !== 'done'));
    const expanded = expandedTaskId === t.id;
    const pinnedCount = activePinnedCount;

    return (
      <div
        key={t.id}
        draggable
        onDragStart={() => setDragTaskId(t.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (dragTaskId) void reorderTasks(dragTaskId, t.id);
          setDragTaskId(null);
        }}
        className="dp-card dp-stack"
        style={{
          padding: 12,
          gap: 8,
          borderColor: isHardOverdue ? 'var(--dp-danger)' : dragTaskId === t.id ? 'var(--dp-accent)' : undefined,
        }}
      >
        <div className="dp-between" style={{ flexWrap: 'wrap', gap: 6 }}>
          <div className="dp-row" style={{ flex: 1, minWidth: 180 }}>
            <span title="Drag to reorder" style={{ cursor: 'grab', color: 'var(--dp-muted)', display: 'inline-flex' }}>
              <GripVertical size={14} />
            </span>
            <label className="dp-row" style={{ cursor: 'pointer', flex: 1 }}>
              <input
                type="checkbox"
                checked={t.status === 'done'}
                onChange={async () => {
                  await completeActionAtomically(t.id, { completedDateIso: activeDate });
                  pushToast(`Updated "${t.title}"`, { canUndo: true });
                }}
              />
              <strong style={{ textDecoration: t.status === 'done' ? 'line-through' : undefined }}>
                {t.isImportant ? '★ ' : ''}
                {t.title}
              </strong>
            </label>
          </div>
          <div className="dp-row" style={{ flexWrap: 'wrap', gap: 4 }}>
            {(t.sharedWithAll || (t.sharedWithProfileIds?.length ?? 0) > 0) && (
              <span className="dp-pill highlight">🏡 Shared</span>
            )}
            {t.payload.taskType && <span className="dp-pill">{t.payload.taskType}</span>}
            {t.energy && <span className="dp-pill">{t.energy} energy</span>}
            {t.estimateMin && <span className="dp-pill">⏱ {t.estimateMin}m</span>}
            {age.ageDays > 0 && <span className="dp-pill">Age {age.ageDays}d</span>}
            {age.rescheduleCount > 0 && <span className="dp-pill">Moved {age.rescheduleCount}×</span>}
            {t.doDate && <span className="dp-pill">Do: {t.doDate}</span>}
            {t.dueDate && (
              <span className="dp-pill" style={{ color: isHardOverdue ? 'var(--dp-danger)' : undefined }}>
                Hard Due: {t.dueDate}{age.overdueDays > 0 ? ` (${age.overdueDays}d late)` : ''}
              </span>
            )}
            {subStats.total > 0 && (
              <span className="dp-pill highlight">
                {subStats.done}/{subStats.total} steps
              </span>
            )}
            <button
              type="button"
              className="dp-icon-btn"
              title="Move up"
              disabled={idxInList === 0}
              onClick={() => idxInList > 0 && void reorderTasks(t.id, filtered[idxInList - 1].id)}
            >
              <ArrowUp size={12} />
            </button>
            <button
              type="button"
              className="dp-icon-btn"
              title="Move down"
              disabled={idxInList >= filtered.length - 1}
              onClick={() => idxInList < filtered.length - 1 && void reorderTasks(t.id, filtered[idxInList + 1].id)}
            >
              <ArrowDown size={12} />
            </button>
            {t.status === 'active' && (
              <>
                <button
                  type="button"
                  className={`dp-icon-btn ${isTimed ? 'dp-btn-primary' : ''}`}
                  title={isTimed ? (activeTimerTask.paused ? 'Resume task timer' : 'Pause task timer') : 'Start live task timer'}
                  onClick={() => {
                    if (!isTimed) {
                      setActiveTimerTask({ taskId: t.id, startedAtMs: Date.now(), accSec: 0, paused: false, startedIso: new Date().toISOString() });
                      pushToast(`Started live timer on "${t.title}"`);
                    } else if (activeTimerTask.paused) {
                      setActiveTimerTask({ ...activeTimerTask, paused: false, startedAtMs: Date.now() });
                    } else {
                      const add = Math.round((Date.now() - activeTimerTask.startedAtMs) / 1000);
                      setActiveTimerTask({ ...activeTimerTask, paused: true, accSec: activeTimerTask.accSec + add });
                    }
                  }}
                >
                  {isTimed && !activeTimerTask.paused ? <Pause size={13} /> : <Play size={13} />}
                </button>
                <button
                  type="button"
                  className="dp-btn dp-btn-sm"
                  title="Complete & log actual duration + distraction tracking"
                  onClick={() => openCompleteWithDuration(t)}
                >
                  <Timer size={12} /> Log Done
                </button>
              </>
            )}
            <button
              type="button"
              className="dp-icon-btn"
              title="Pin to Today's Favorites"
              onClick={() => {
                const already = t.payload.pinnedTop3Date === activeDate;
                if (!already && settings.maxFavorites !== null && settings.maxFavorites !== undefined && pinnedCount >= settings.maxFavorites) {
                  pushToast(`Favorite cap (${settings.maxFavorites}) reached — raise or set Unlimited below!`, { tone: 'warn' });
                  return;
                }
                void updateRecord<TaskPayload>(t.id, (c) => ({
                  ...c,
                  payload: { ...c.payload, pinnedTop3Date: already ? null : activeDate },
                }));
              }}
            >
              <Star size={14} fill={t.payload.pinnedTop3Date === activeDate ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              className="dp-icon-btn"
              title="Schedule on Calendar Timeline"
              onClick={async () => {
                await scheduleActionOnCalendar(t.id, t.doDate || activeDate, '11:00', t.estimateMin ?? 30);
                pushToast(`Scheduled "${t.title}" on Calendar`, { canUndo: true });
              }}
            >
              <CalendarPlus size={14} />
            </button>
            <button
              type="button"
              className="dp-btn dp-btn-sm"
              onClick={() => setExpandedTaskId(expanded ? null : t.id)}
            >
              {expanded ? 'Hide' : 'Details'}
            </button>
          </div>
        </div>

        {blockers.length > 0 && (
          <div style={{ fontSize: '0.8rem', color: 'var(--dp-warn)' }}>
            Waiting on: {blockers.map((b) => b.title).join(', ')}
          </div>
        )}

        {expanded && (
          <div className="dp-stack" style={{ borderTop: '1px dashed var(--dp-border)', paddingTop: 10, gap: 10 }}>
            {/* Universal Inline Task Editor */}
            <div className="dp-stack" style={{ gap: 8, padding: 10, borderRadius: 8, background: 'var(--dp-surface-muted)' }}>
              <strong style={{ fontSize: '0.82rem' }}>✏️ Edit Task Details</strong>
              <SafeInput
                className="dp-input"
                recordKey={`${t.id}:title`}
                externalValue={t.title}
                onCommit={(val) => {
                  const trimmed = val.trim();
                  if (!trimmed || trimmed === t.title) return;
                  void updateRecord<TaskPayload>(t.id, (c) => ({ ...c, title: trimmed }));
                }}
                placeholder="Task title…"
                aria-label="Edit task title"
              />
              <SafeTextarea
                className="dp-textarea"
                recordKey={`${t.id}:notes`}
                externalValue={t.payload.notes ?? ''}
                onCommit={(val) => {
                  void updateRecord<TaskPayload>(t.id, (c) => ({
                    ...c,
                    payload: { ...c.payload, notes: val },
                  }));
                }}
                rows={2}
                placeholder="Notes, instructions, or context for this task…"
                aria-label="Edit task notes"
              />
              <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8, fontSize: '0.82rem' }}>
                <label className="dp-row" style={{ gap: 4 }}>
                  <span className="dp-muted">Do:</span>
                  <input
                    type="date"
                    className="dp-input"
                    style={{ width: 'auto' }}
                    value={t.doDate ?? ''}
                    onChange={(e) =>
                      void updateRecord<TaskPayload>(t.id, (c) => ({ ...c, doDate: e.target.value || null }))
                    }
                  />
                </label>
                <label className="dp-row" style={{ gap: 4 }}>
                  <span className="dp-muted">Hard Due:</span>
                  <input
                    type="date"
                    className="dp-input"
                    style={{ width: 'auto' }}
                    value={t.dueDate ?? ''}
                    onChange={(e) =>
                      void updateRecord<TaskPayload>(t.id, (c) => ({ ...c, dueDate: e.target.value || null }))
                    }
                  />
                </label>
                <select
                  aria-label="Edit task priority"
                  className="dp-select"
                  style={{ width: 'auto' }}
                  value={t.priority ?? 'none'}
                  onChange={(e) =>
                    void updateRecord<TaskPayload>(t.id, (c) => ({
                      ...c,
                      priority: e.target.value as LifeRecord['priority'],
                    }))
                  }
                >
                  <option value="none">No Priority</option>
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                  <option value="urgent">Urgent</option>
                </select>
                <select
                  aria-label="Edit task energy"
                  className="dp-select"
                  style={{ width: 'auto' }}
                  value={t.energy ?? 'medium'}
                  onChange={(e) =>
                    void updateRecord<TaskPayload>(t.id, (c) => ({
                      ...c,
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
                    min={1}
                    max={480}
                    className="dp-input"
                    style={{ width: 68 }}
                    value={t.estimateMin ?? 25}
                    onChange={(e) =>
                      void updateRecord<TaskPayload>(t.id, (c) => ({
                        ...c,
                        estimateMin: Math.max(1, Number(e.target.value) || 15),
                      }))
                    }
                  />
                  <span className="dp-muted">min</span>
                </label>
                <SafeInput
                  className="dp-input"
                  recordKey={`${t.id}:tags`}
                  externalValue={(t.tags ?? []).join(', ')}
                  onCommit={(val) => {
                    const parsedTags = val
                      .split(/[,\s#]+/)
                      .map((s) => s.trim().toLowerCase())
                      .filter(Boolean);
                    void updateRecord<TaskPayload>(t.id, (c) => ({ ...c, tags: parsedTags }));
                  }}
                  style={{ flex: 1, minWidth: 130 }}
                  placeholder="Tags (comma separated)…"
                  aria-label="Edit task tags"
                />
                <label className="dp-row" style={{ gap: 4, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(t.sharedWithAll)}
                    onChange={(e) =>
                      void updateRecord<TaskPayload>(t.id, (c) => ({ ...c, sharedWithAll: e.target.checked }))
                    }
                  />
                  <span>🏡 Share</span>
                </label>
                <label className="dp-row" style={{ gap: 4, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(t.isImportant)}
                    onChange={(e) =>
                      void updateRecord<TaskPayload>(t.id, (c) => ({ ...c, isImportant: e.target.checked }))
                    }
                  />
                  <span>★ Important</span>
                </label>
              </div>
            </div>

            <div className="dp-row">
              <input
                className="dp-input"
                style={{ flex: 1 }}
                placeholder="Add subtask (or type before clicking + Nest)…"
                value={newSubText}
                onChange={(e) => setNewSubText(e.target.value)}
              />
              <button
                type="button"
                className="dp-btn dp-btn-sm"
                onClick={() => {
                  if (!newSubText.trim()) return;
                  void updateRecord<TaskPayload>(t.id, (c) => ({
                    ...c,
                    payload: {
                      ...c.payload,
                      subtasks: [...(c.payload.subtasks ?? []), { id: createId('sub'), title: newSubText.trim(), done: false }],
                    },
                  }));
                  setNewSubText('');
                }}
              >
                + Subtask
              </button>
              <select
                aria-label="Apply checklist template"
                className="dp-select"
                style={{ width: 'auto' }}
                defaultValue=""
                onChange={(e) => {
                  const steps = CHECKLIST_TEMPLATES[e.target.value];
                  if (!steps) return;
                  void updateRecord<TaskPayload>(t.id, (c) => ({
                    ...c,
                    payload: {
                      ...c.payload,
                      subtasks: [
                        ...(c.payload.subtasks ?? []),
                        ...steps.map((s) => ({ id: createId('sub'), title: s, done: false })),
                      ],
                    },
                  }));
                  e.target.value = '';
                }}
              >
                <option value="">Insert checklist template…</option>
                {Object.keys(CHECKLIST_TEMPLATES).map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>

            {renderSubtasks(t, t.payload.subtasks ?? [])}

            <div className="dp-row" style={{ fontSize: '0.82rem' }}>
              <select
                aria-label="Add Blocked-By dependency"
                className="dp-select"
                style={{ width: 'auto' }}
                defaultValue=""
                onChange={(e) => {
                  const blockerId = e.target.value;
                  if (!blockerId) return;
                  if (wouldCreateCycle(t.id, blockerId, tasks)) {
                    pushToast('Blocked: that dependency would create a circular cycle.', { tone: 'warn' });
                  } else {
                    void updateRecord<TaskPayload>(t.id, (c) => ({
                      ...c,
                      payload: {
                        ...c.payload,
                        blockedByIds: Array.from(new Set([...(c.payload.blockedByIds ?? []), blockerId])),
                      },
                    }));
                  }
                  e.target.value = '';
                }}
              >
                <option value="">Blocked by another task…</option>
                {tasks
                  .filter((other) => other.id !== t.id && other.status === 'active')
                  .map((other) => (
                    <option key={other.id} value={other.id}>{other.title}</option>
                  ))}
              </select>

              <select
                aria-label="Board column"
                className="dp-select"
                style={{ width: 'auto' }}
                value={t.payload.boardColumn ?? 'next'}
                onChange={(e) =>
                  void updateRecord<TaskPayload>(t.id, (c) => ({
                    ...c,
                    payload: { ...c.payload, boardColumn: e.target.value as TaskPayload['boardColumn'] },
                  }))
                }
              >
                <option value="backlog">Backlog</option>
                <option value="next">Up Next</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>

              <span className="dp-muted">Actual logged: {t.payload.actualMinutes ?? 0}m</span>

              <button
                type="button"
                className="dp-btn dp-btn-danger dp-btn-sm"
                style={{ marginInlineStart: 'auto' }}
                onClick={async () => {
                  await softDeleteRecord(t.id);
                  pushToast(`Moved "${t.title}" to Trash`, { canUndo: true });
                }}
              >
                <Trash2 size={13} /> Trash
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="dp-paper-sheet dp-stack" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <div className="dp-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2>Tasks & Nested Subtasks</h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
            Drag to reorder · Track actual vs. estimated &amp; distracted times · Favorite limit:{' '}
            <strong>{settings.maxFavorites === null || settings.maxFavorites === undefined ? 'Unlimited' : settings.maxFavorites}</strong>
            {durationStats.totalSessions > 0 && (
              <>
                {' '}· Logged avg: <strong>{durationStats.avgAllMin}m</strong>
                {durationStats.avgUndistractedMin !== null && ` (Focused: ${durationStats.avgUndistractedMin}m)`}
              </>
            )}
          </p>
        </div>
        <div className="dp-row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <button type="button" className="dp-btn dp-btn-sm" onClick={() => setActiveView('task_calendar')}>
            ⚡ Task Calendar
          </button>
          <button type="button" className="dp-btn dp-btn-sm" onClick={guardAction('action-1', () => handleCarryForwardPast())}>
            Carry Forward Past
          </button>
          <select
            aria-label="Favorite tasks limit"
            className="dp-select"
            style={{ width: 'auto', padding: '4px 8px', fontSize: '0.78rem' }}
            value={settings.maxFavorites === null || settings.maxFavorites === undefined ? 'unlimited' : String(settings.maxFavorites)}
            onChange={(e) => void patchSettings({ maxFavorites: e.target.value === 'unlimited' ? null : Number(e.target.value) })}
          >
            <option value="unlimited">Favorites: Unlimited</option>
            <option value="3">Favorites: Max 3</option>
            <option value="5">Favorites: Max 5</option>
            <option value="10">Favorites: Max 10</option>
          </select>
          <button type="button" className={`dp-btn dp-btn-sm ${viewMode === 'list' ? 'dp-btn-primary' : ''}`} onClick={() => setViewMode('list')}>
            List View
          </button>
          <button type="button" className={`dp-btn dp-btn-sm ${viewMode === 'board' ? 'dp-btn-primary' : ''}`} onClick={() => setViewMode('board')}>
            Board View
          </button>
        </div>
      </div>

      {/* Add Task Form (Progressive Disclosure) */}
      <form className="dp-card dp-stack" style={{ padding: 12 }} onSubmit={guardForm('form-1', handleCreate)}>
        <div className="dp-row">
          <input
            className="dp-input"
            style={{ flex: 2 }}
            placeholder="New task title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input type="date" aria-label="Do Date" className="dp-input" style={{ width: 'auto' }} value={doDate} onChange={(e) => setDoDate(e.target.value)} title="Planned Do Date" />
          <button type="submit" className="dp-btn dp-btn-primary">
            <Plus size={15} /> Add Task
          </button>
        </div>
        <details className="dp-details">
          <summary>More options (Hard Due Date, Energy, Estimate, Priority, Tags)</summary>
          <div className="dp-row" style={{ marginTop: 10 }}>
            <label className="dp-row">
              <span className="dp-muted">Hard Due:</span>
              <input type="date" className="dp-input" style={{ width: 'auto' }} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <select aria-label="Energy level" className="dp-select" style={{ width: 'auto' }} value={energy} onChange={(e) => setEnergy(e.target.value as 'low' | 'medium' | 'high')}>
              <option value="low">Low Energy</option>
              <option value="medium">Medium Energy</option>
              <option value="high">High Energy</option>
            </select>
            <label className="dp-row">
              <span className="dp-muted">Est (m):</span>
              <input type="number" min={5} max={480} className="dp-input" style={{ width: 72 }} value={estimateMin} onChange={(e) => setEstimateMin(Number(e.target.value) || 15)} />
            </label>
            <select aria-label="Priority" className="dp-select" style={{ width: 'auto' }} value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              <option value="none">No Priority</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <input
              list="dp-task-types"
              className="dp-input"
              style={{ width: 170 }}
              placeholder="Task type (learns avg time)…"
              value={taskType}
              onChange={(e) => {
                setTaskType(e.target.value);
                const learned = learnedDurations[e.target.value.trim().toLowerCase()];
                if (learned) setEstimateMin(learned);
              }}
            />
            <datalist id="dp-task-types">
              {(settings.reusableTaskTypes ?? []).map((rt) => (
                <option key={rt.id} value={rt.name} />
              ))}
            </datalist>
            <select aria-label="Scheduling context" className="dp-select" style={{ width: 'auto' }} value={contextId} onChange={(e) => setContextId(e.target.value)}>
              <option value="">Any Context</option>
              {(settings.schedulingContexts ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
              ))}
            </select>
            <input className="dp-input" style={{ width: 160 }} placeholder="#tags (comma separated)" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
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

      {/* Easy Sort & Filter Bar for Tasks */}
      <SortFilterBar
        search={taskSearch}
        onSearchChange={setTaskSearch}
        searchPlaceholder="Search tasks, #tags, notes…"
        sortBy={taskSortBy}
        onSortByChange={(v) => setTaskSortBy(v as typeof taskSortBy)}
        sortOptions={[
          { value: 'custom', label: 'Custom Drag Order' },
          { value: 'doDate', label: 'Do Date' },
          { value: 'dueDate', label: 'Hard Due Date' },
          { value: 'priority', label: 'Priority' },
          { value: 'estimate', label: 'Estimate (min)' },
          { value: 'title', label: 'Title (A–Z)' },
          { value: 'created', label: 'Date Created' },
          { value: 'updated', label: 'Last Modified' },
        ]}
        sortDir={taskSortDir}
        onSortDirToggle={() => setTaskSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
        chips={[
          { value: 'all', label: 'All Active' },
          { value: 'today', label: `Do Today (${activeDate})` },
          { value: 'low_quick', label: 'Low Energy ≤ 15m' },
          { value: 'overdue_hard', label: 'Missed Hard Due' },
          { value: 'completed', label: 'Completed' },
        ]}
        activeChip={smartFilter}
        onChipChange={(v) => setSmartFilter(v as typeof smartFilter)}
        extraFilters={[
          {
            label: 'Filter by priority',
            value: priorityFilter,
            onChange: (v) => setPriorityFilter(v as typeof priorityFilter),
            options: [
              { value: 'all', label: 'All Priorities' },
              { value: 'urgent', label: 'Urgent' },
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
              { value: 'none', label: 'None' },
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
        totalCount={tasks.length}
        shownCount={filtered.length}
        onReset={() => {
          setTaskSearch('');
          setSmartFilter('all');
          setPriorityFilter('all');
          setEnergyFilter('all');
        }}
      />

      {filtered.length === 0 ? (
        <div className="dp-empty">
          <strong>No matching tasks</strong>
          <span className="dp-muted">Switch smart filters or capture a new task above.</span>
        </div>
      ) : viewMode === 'list' ? (
        <div className="dp-stack">{filtered.map((t, i) => renderTaskCard(t, i))}</div>
      ) : (
        <div className="dp-grid-3">
          {(['backlog', 'next', 'in_progress'] as const).map((col) => (
            <div key={col} className="dp-card dp-stack" style={{ padding: 10, background: 'var(--dp-surface-2)' }}>
              <strong style={{ textTransform: 'capitalize' }}>{col.replace('_', ' ')}</strong>
              {filtered.filter((t) => (t.payload.boardColumn ?? 'next') === col).map((t, i) => renderTaskCard(t, i))}
            </div>
          ))}
        </div>
      )}

      {/* Duration & Distraction Completion Modal (Sections 9.5 & 9.6) */}
      <ModalDialog
        open={Boolean(completingTask)}
        title={`Complete & Log Duration: ${completingTask?.title ?? ''}`}
        onClose={() => setCompletingTask(null)}
      >
        {completingTask && (
          <div className="dp-stack" style={{ gap: 12 }}>
            <div className="dp-row" style={{ flexWrap: 'wrap', gap: 10 }}>
              <label className="dp-row" style={{ gap: 6 }}>
                <span className="dp-muted">Actual Time (min):</span>
                <input
                  type="number"
                  min={1}
                  max={720}
                  className="dp-input"
                  style={{ width: 84 }}
                  value={compActualMin}
                  onChange={(e) => setCompActualMin(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
              <label className="dp-row" style={{ gap: 6 }}>
                <span className="dp-muted">Breaks (min):</span>
                <input
                  type="number"
                  min={0}
                  max={240}
                  className="dp-input"
                  style={{ width: 76 }}
                  value={compBreakMin}
                  onChange={(e) => setCompBreakMin(Math.max(0, Number(e.target.value) || 0))}
                />
              </label>
            </div>

            <div className="dp-row" style={{ flexWrap: 'wrap', gap: 10 }}>
              <label className="dp-row" style={{ gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={compDistracted} onChange={(e) => setCompDistracted(e.target.checked)} />
                <strong>I was distracted during this task</strong>
              </label>
              {compDistracted && (
                <label className="dp-row" style={{ gap: 6 }}>
                  <span className="dp-muted">Distraction (min):</span>
                  <input
                    type="number"
                    min={0}
                    max={360}
                    className="dp-input"
                    style={{ width: 76 }}
                    value={compDistractMin}
                    onChange={(e) => setCompDistractMin(Math.max(0, Number(e.target.value) || 0))}
                  />
                </label>
              )}
            </div>

            <textarea
              className="dp-textarea"
              rows={2}
              placeholder="Optional completion or distraction notes…"
              value={compNote}
              onChange={(e) => setCompNote(e.target.value)}
            />

            <div className="dp-between">
              <span className="dp-muted" style={{ fontSize: '0.8rem' }}>
                Estimated: {completingTask.estimateMin ?? 25}m · Undistracted logs refine future averages!
              </span>
              <div className="dp-row" style={{ gap: 6 }}>
                <button type="button" className="dp-btn" onClick={() => setCompletingTask(null)}>Cancel</button>
                <button type="button" className="dp-btn dp-btn-primary" onClick={guardAction('action-2', () => confirmCompleteWithDuration())}>
                  Save &amp; Mark Complete
                </button>
              </div>
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
};
