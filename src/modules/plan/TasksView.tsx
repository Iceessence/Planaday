import React, { useMemo, useState } from 'react';
import { CalendarPlus, Plus, Star, Trash2 } from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { completeActionAtomically, scheduleActionOnCalendar } from '../../core/planActions';
import { createId } from '../../core/db';
import type { LifeRecord, SubtaskItem, TaskPayload } from '../../core/types';

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
  const { settings, records, activeDate, logicalToday, pushToast } = useApp();
  const [title, setTitle] = useState('');
  const [doDate, setDoDate] = useState(activeDate);
  const [dueDate, setDueDate] = useState('');
  const [energy, setEnergy] = useState<'low' | 'medium' | 'high'>('medium');
  const [estimateMin, setEstimateMin] = useState(25);
  const [priority, setPriority] = useState<'none' | 'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [tagsText, setTagsText] = useState('');
  const [shareFamily, setShareFamily] = useState(false);
  const [markImportant, setMarkImportant] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [smartFilter, setSmartFilter] = useState<'all' | 'today' | 'low_quick' | 'overdue_hard' | 'completed'>('all');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [newSubText, setNewSubText] = useState('');

  const tasks = useMemo(
    () => records.filter((r) => r.type === 'task') as Array<LifeRecord<TaskPayload>>,
    [records]
  );

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (smartFilter === 'completed') return t.status === 'done';
      if (t.status === 'done') return false;
      if (smartFilter === 'today') return t.doDate === activeDate;
      if (smartFilter === 'low_quick') return t.energy === 'low' && (t.estimateMin ?? 30) <= 15;
      // Only a missed HARD dueDate triggers overdue (Section 09.01)
      if (smartFilter === 'overdue_hard') return Boolean(t.dueDate && t.dueDate < logicalToday);
      return true;
    });
  }, [tasks, smartFilter, activeDate, logicalToday]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const tags = tagsText
      .split(/[,\s#]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    await createRecord<TaskPayload>(
      'task',
      title.trim(),
      { subtasks: [], boardColumn: 'next' },
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

  const renderTaskCard = (t: LifeRecord<TaskPayload>) => {
    const subStats = countSubtasks(t.payload.subtasks ?? []);
    const isHardOverdue = Boolean(t.status === 'active' && t.dueDate && t.dueDate < logicalToday);
    const blockers = (t.payload.blockedByIds ?? [])
      .map((id) => tasks.find((x) => x.id === id))
      .filter((x): x is LifeRecord<TaskPayload> => Boolean(x && x.status !== 'done'));
    const expanded = expandedTaskId === t.id;

    return (
      <div
        key={t.id}
        className="dp-card dp-stack"
        style={{
          padding: 12,
          gap: 8,
          borderColor: isHardOverdue ? 'var(--dp-danger)' : undefined,
        }}
      >
        <div className="dp-between">
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
          <div className="dp-row">
            {(t.sharedWithAll || (t.sharedWithProfileIds?.length ?? 0) > 0) && (
              <span className="dp-pill highlight">🏡 Shared</span>
            )}
            {t.energy && <span className="dp-pill">{t.energy} energy</span>}
            {t.estimateMin && <span className="dp-pill">⏱ {t.estimateMin}m</span>}
            {t.doDate && <span className="dp-pill">Do: {t.doDate}</span>}
            {t.dueDate && (
              <span className="dp-pill" style={{ color: isHardOverdue ? 'var(--dp-danger)' : undefined }}>
                Hard Due: {t.dueDate}
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
              title="Pin to Today's Top Three"
              onClick={() =>
                void updateRecord<TaskPayload>(t.id, (c) => ({
                  ...c,
                  payload: { ...c.payload, pinnedTop3Date: c.payload.pinnedTop3Date === activeDate ? null : activeDate },
                }))
              }
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
          <div className="dp-stack" style={{ borderTop: '1px dashed var(--dp-border)', paddingTop: 10 }}>
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
      <div className="dp-between">
        <div>
          <h2>Tasks & Nested Subtasks</h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
            Do Date (planned day) is separate from Hard Due Date (actual deadline).
          </p>
        </div>
        <div className="dp-row">
          <button type="button" className={`dp-btn dp-btn-sm ${viewMode === 'list' ? 'dp-btn-primary' : ''}`} onClick={() => setViewMode('list')}>
            List View
          </button>
          <button type="button" className={`dp-btn dp-btn-sm ${viewMode === 'board' ? 'dp-btn-primary' : ''}`} onClick={() => setViewMode('board')}>
            Board View
          </button>
        </div>
      </div>

      {/* Add Task Form (Progressive Disclosure) */}
      <form className="dp-card dp-stack" style={{ padding: 12 }} onSubmit={handleCreate}>
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

      {/* Saved Smart Filters */}
      <div className="dp-row">
        {(
          [
            ['all', 'All Active'],
            ['today', `Do Today (${activeDate})`],
            ['low_quick', 'Low Energy ≤ 15m'],
            ['overdue_hard', 'Missed Hard Due'],
            ['completed', 'Completed'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`dp-btn dp-btn-sm ${smartFilter === id ? 'dp-btn-primary' : ''}`}
            onClick={() => setSmartFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="dp-empty">
          <strong>No matching tasks</strong>
          <span className="dp-muted">Switch smart filters or capture a new task above.</span>
        </div>
      ) : viewMode === 'list' ? (
        <div className="dp-stack">{filtered.map(renderTaskCard)}</div>
      ) : (
        <div className="dp-grid-3">
          {(['backlog', 'next', 'in_progress'] as const).map((col) => (
            <div key={col} className="dp-card dp-stack" style={{ padding: 10, background: 'var(--dp-surface-2)' }}>
              <strong style={{ textTransform: 'capitalize' }}>{col.replace('_', ' ')}</strong>
              {filtered.filter((t) => (t.payload.boardColumn ?? 'next') === col).map(renderTaskCard)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
