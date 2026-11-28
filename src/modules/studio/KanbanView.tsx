import { useViewActionGuard } from '../../components/Common/viewSafety';
import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Columns3,
  LayoutList,
  Plus,
  Table as TableIcon,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createId } from '../../core/db';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import type { LifeRecord } from '../../core/types';

interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  wipLimit?: number | null;
  collapsed?: boolean;
}

interface KanbanBoardPayload {
  columns: KanbanColumn[];
  wipEnabled: boolean;
}

interface KanbanCardPayload {
  boardId: string;
  columnId: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  estimateMin?: number;
  notes?: string;
  checklist: Array<{ id: string; text: string; done: boolean }>;
  comments: Array<{ id: string; text: string; at: string }>;
}

const LIVE_TASK_COLS: KanbanColumn[] = [
  { id: 'backlog', title: 'Backlog', color: '#6b7280', wipLimit: null },
  { id: 'up_next', title: 'Up Next', color: '#3b6ea5', wipLimit: 8 },
  { id: 'in_progress', title: 'In Progress', color: '#b47438', wipLimit: 4 },
  { id: 'done', title: 'Completed', color: '#4f7a65', wipLimit: null },
];

export const KanbanView: React.FC = () => {
  const { records, pushToast } = useApp();
  
  const guardAction = useViewActionGuard(message => pushToast(message, { tone: 'danger' }));

  const customBoards = useMemo(
    () => records.filter((r) => r.type === 'kanban_board' && !r.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [records]
  );
  const customCards = useMemo(
    () => records.filter((r) => r.type === 'kanban_card' && !r.deletedAt),
    [records]
  );
  const liveTasks = useMemo(
    () => records.filter((r) => (r.type === 'task' || r.type === 'chore') && !r.deletedAt),
    [records]
  );

  // 'live_tasks' shows real Planaday Tasks & Chores in-place with ZERO duplication (§33.3)!
  const [activeBoardId, setActiveBoardId] = useState<string>('live_tasks');
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'table'>('kanban');
  const [newBoardName, setNewBoardName] = useState('');
  const [newColName, setNewColName] = useState('');
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardCol, setNewCardCol] = useState('');
  const [liveWipEnabled, setLiveWipEnabled] = useState(false);
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [subtaskText, setSubtaskText] = useState('');
  const [commentText, setCommentText] = useState('');

  const isLiveMode = activeBoardId === 'live_tasks';
  const activeBoard: LifeRecord | null = isLiveMode
    ? null
    : customBoards.find((b) => b.id === activeBoardId) ?? null;
  const boardPayload = activeBoard?.payload as KanbanBoardPayload | undefined;
  const columns: KanbanColumn[] = isLiveMode ? LIVE_TASK_COLS : boardPayload?.columns ?? [];
  const wipEnabled = isLiveMode ? liveWipEnabled : Boolean(boardPayload?.wipEnabled);

  const mutateBoard = async (updater: (p: KanbanBoardPayload) => KanbanBoardPayload) => {
    if (!activeBoard) return;
    await updateRecord<KanbanBoardPayload>(activeBoard.id, (c) => ({ ...c, payload: updater(c.payload) }));
  };

  const getTaskColumnId = (rec: LifeRecord): string => {
    if (rec.status === 'done') return 'done';
    const stage = (rec.payload as { kanbanStage?: string }).kanbanStage;
    if (stage && LIVE_TASK_COLS.some((c) => c.id === stage)) return stage;
    return rec.doDate ? 'up_next' : 'backlog';
  };

  const moveRecordToColumn = async (recId: string, targetColId: string) => {
    if (isLiveMode) {
      await updateRecord(recId, (c) => ({
        ...c,
        status: targetColId === 'done' ? 'done' : 'active',
        payload: { ...(c.payload as Record<string, unknown>), kanbanStage: targetColId },
      }));
      return;
    }
    await updateRecord<KanbanCardPayload>(recId, (c) => ({
      ...c,
      payload: { ...c.payload, columnId: targetColId },
    }));
  };

  const boardItems = useMemo(() => {
    if (isLiveMode) {
      return liveTasks.map((t) => ({
        rec: t,
        columnId: getTaskColumnId(t),
        priority: t.priority ?? 'none',
        dueDate: t.dueDate ?? '',
        estimateMin: t.estimateMin ?? 0,
        checklist: [] as Array<{ id: string; text: string; done: boolean }>,
        comments: [] as Array<{ id: string; text: string; at: string }>,
      }));
    }
    return customCards
      .filter((c) => (c.payload as KanbanCardPayload).boardId === activeBoardId)
      .map((c) => {
        const p = c.payload as KanbanCardPayload;
        return {
          rec: c,
          columnId: p.columnId,
          priority: p.priority ?? 'medium',
          dueDate: p.dueDate ?? '',
          estimateMin: p.estimateMin ?? 0,
          checklist: Array.isArray(p.checklist) ? p.checklist : [],
          comments: Array.isArray(p.comments) ? p.comments : [],
        };
      });
  }, [isLiveMode, liveTasks, customCards, activeBoardId]);

  const cardsByColumn = useMemo(() => {
    const map = new Map<string, typeof boardItems>();
    for (const card of boardItems) { const list = map.get(card.columnId) ?? []; list.push(card); map.set(card.columnId, list); }
    return map;
  }, [boardItems]);

  const handleAddCard = async () => {
    const title = newCardTitle.trim();
    if (!title) return;
    const colId = newCardCol || columns[0]?.id || 'backlog';
    if (isLiveMode) {
      await createRecord('task', title, { kanbanStage: colId }, { status: colId === 'done' ? 'done' : 'active' });
    } else if (activeBoard) {
      await createRecord<KanbanCardPayload>('kanban_card', title, {
        boardId: activeBoard.id,
        columnId: colId,
        priority: 'medium',
        checklist: [],
        comments: [],
      });
    }
    setNewCardTitle('');
    pushToast(`Added "${title}"`, { tone: 'ok' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div className="dp-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Columns3 size={20} /> Universal Kanban Boards
          </h2>
          <p className="dp-muted" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
            Live Planaday Tasks & Chores sync (zero duplication!) plus unlimited custom boards with drag-and-drop, optional WIP limits & Kanban/List/Table views.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="dp-select" value={activeBoardId} onChange={(e) => setActiveBoardId(e.target.value)}>
            <option value="live_tasks">⚡ Live Planaday Tasks & Chores ({liveTasks.length})</option>
            {customBoards.map((b) => <option key={b.id} value={b.id}>📋 {b.title}</option>)}
          </select>
          <input className="dp-input" placeholder="New custom board..." value={newBoardName} onChange={(e) => setNewBoardName(e.target.value)} style={{ width: 155 }} />
          <button
            type="button"
            className="dp-btn dp-btn-primary"
            onClick={guardAction('action-1', async () => {
              const title = newBoardName.trim() || `Board ${customBoards.length + 1}`;
              const rec = await createRecord<KanbanBoardPayload>('kanban_board', title, {
                wipEnabled: false,
                columns: [
                  { id: createId('col'), title: 'To Do', color: '#3b6ea5', wipLimit: null },
                  { id: createId('col'), title: 'In Progress', color: '#b47438', wipLimit: 4 },
                  { id: createId('col'), title: 'Review', color: '#6b5ca5', wipLimit: 3 },
                  { id: createId('col'), title: 'Done', color: '#4f7a65', wipLimit: null },
                ],
              });
              setNewBoardName('');
              setActiveBoardId(rec.id);
              pushToast(`Created board "${title}"`, { tone: 'ok' });
            })}
          >
            <Plus size={14} /> New Board
          </button>
          {!isLiveMode && activeBoard && (
            <button
              type="button"
              className="dp-btn"
              onClick={guardAction('action-2', async () => {
                await softDeleteRecord(activeBoard.id);
                setActiveBoardId('live_tasks');
                pushToast('Moved board to Trash', { tone: 'info' });
              })}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Quick Add Card + View Switcher + Optional WIP Limit Toggle */}
      <div className="dp-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', padding: '0.6rem 0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', flex: 1 }}>
          <input
            className="dp-input"
            placeholder={isLiveMode ? 'Add live Planaday task...' : 'Add card title...'}
            value={newCardTitle}
            onChange={(e) => setNewCardTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleAddCard()}
            style={{ flex: 1, minWidth: 180 }}
          />
          <select className="dp-select" value={newCardCol || columns[0]?.id || ''} onChange={(e) => setNewCardCol(e.target.value)}>
            {columns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <button type="button" className="dp-btn dp-btn-primary" onClick={guardAction('add-card', () => handleAddCard())}>
            <Plus size={13} /> Add Card
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.78rem' }}>
            <input
              type="checkbox"
              checked={wipEnabled}
              onChange={(e) => {
                if (isLiveMode) setLiveWipEnabled(e.target.checked);
                else void mutateBoard((p) => ({ ...p, wipEnabled: e.target.checked }));
              }}
            />
            WIP Limits
          </label>
          <button type="button" className={`dp-btn ${viewMode === 'kanban' ? 'dp-btn-primary' : ''}`} onClick={() => setViewMode('kanban')}><Columns3 size={13} /> Board</button>
          <button type="button" className={`dp-btn ${viewMode === 'list' ? 'dp-btn-primary' : ''}`} onClick={() => setViewMode('list')}><LayoutList size={13} /> List</button>
          <button type="button" className={`dp-btn ${viewMode === 'table' ? 'dp-btn-primary' : ''}`} onClick={() => setViewMode('table')}><TableIcon size={13} /> Table</button>
        </div>
      </div>

      {/* Custom Board Column Creator */}
      {!isLiveMode && activeBoard && (
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="dp-input" placeholder="Add new column..." value={newColName} onChange={(e) => setNewColName(e.target.value)} style={{ width: 180 }} />
          <button
            type="button"
            className="dp-btn"
            onClick={() => {
              if (!newColName.trim()) return;
              void mutateBoard((p) => ({
                ...p,
                columns: [...p.columns, { id: createId('col'), title: newColName.trim(), color: '#4f7a65', wipLimit: null }],
              }));
              setNewColName('');
            }}
          >
            <Plus size={13} /> Add Column
          </button>
        </div>
      )}

      {/* === KANBAN BOARD VIEW === */}
      {viewMode === 'kanban' && (
        <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.5rem', alignItems: 'flex-start' }}>
          {columns.map((col, colIdx) => {
            const colItems = cardsByColumn.get(col.id) ?? [];
            const overWip = wipEnabled && col.wipLimit && colItems.length > col.wipLimit;
            return (
              <div
                key={col.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragCardId) {
                    void moveRecordToColumn(dragCardId, col.id);
                    setDragCardId(null);
                  }
                }}
                className="dp-card"
                style={{
                  minWidth: col.collapsed ? 56 : 268,
                  maxWidth: col.collapsed ? 56 : 310,
                  flex: col.collapsed ? '0 0 56px' : '1 0 268px',
                  borderTop: `4px solid ${overWip ? 'var(--dp-danger)' : col.color}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
                  <strong style={{ fontSize: '0.88rem' }}>
                    {col.collapsed ? col.title.slice(0, 3) : col.title} ({colItems.length}{wipEnabled && col.wipLimit ? `/${col.wipLimit}` : ''})
                  </strong>
                  {!isLiveMode && (
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button
                        type="button"
                        className="dp-btn"
                        style={{ padding: '1px 4px' }}
                        onClick={() =>
                          void mutateBoard((p) => ({
                            ...p,
                            columns: p.columns.map((x) => (x.id === col.id ? { ...x, collapsed: !x.collapsed } : x)),
                          }))
                        }
                      >
                        {col.collapsed ? '▸' : '▾'}
                      </button>
                      {columns.length > 1 && (
                        <button
                          type="button"
                          className="dp-btn"
                          style={{ padding: '1px 4px' }}
                          onClick={() => void mutateBoard((p) => ({ ...p, columns: p.columns.filter((x) => x.id !== col.id) }))}
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {overWip && (
                  <div style={{ fontSize: '0.73rem', color: 'var(--dp-danger)', fontWeight: 600 }}>
                    ⚠ WIP limit exceeded ({colItems.length}/{col.wipLimit})
                  </div>
                )}

                {!col.collapsed &&
                  colItems.map((it) => {
                    const isOpen = expandedCardId === it.rec.id;
                    return (
                      <div
                        key={it.rec.id}
                        draggable
                        onDragStart={() => setDragCardId(it.rec.id)}
                        style={{
                          padding: '0.55rem',
                          borderRadius: 'var(--dp-radius)',
                          border: '1px solid var(--dp-border)',
                          background: 'var(--dp-paper-alt)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.35rem',
                          cursor: 'grab',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4 }}>
                          <strong style={{ fontSize: '0.85rem', cursor: 'pointer' }} onClick={() => setExpandedCardId(isOpen ? null : it.rec.id)}>
                            {it.rec.title}
                          </strong>
                          <button type="button" className="dp-btn" style={{ padding: '1px 4px' }} onClick={() => void softDeleteRecord(it.rec.id)}>
                            <Trash2 size={11} />
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', fontSize: '0.71rem' }}>
                          {it.rec.type === 'chore' && <span className="dp-badge">Chore</span>}
                          {it.priority && it.priority !== 'none' && <span className="dp-badge">{it.priority}</span>}
                          {it.dueDate && <span className="dp-badge">📅 {it.dueDate}</span>}
                          {it.checklist.length > 0 && (
                            <span className="dp-badge">✓ {it.checklist.filter((c) => c.done).length}/{it.checklist.length}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                          <button
                            type="button"
                            className="dp-btn"
                            style={{ padding: '1px 6px', fontSize: '0.72rem' }}
                            disabled={colIdx === 0}
                            onClick={() => void moveRecordToColumn(it.rec.id, columns[colIdx - 1].id)}
                          >
                            <ArrowLeft size={11} />
                          </button>
                          <button
                            type="button"
                            className="dp-btn"
                            style={{ padding: '1px 6px', fontSize: '0.72rem' }}
                            disabled={colIdx === columns.length - 1}
                            onClick={() => void moveRecordToColumn(it.rec.id, columns[colIdx + 1].id)}
                          >
                            <ArrowRight size={11} />
                          </button>
                        </div>

                        {/* Expanded Checklist & Comments for Custom Cards */}
                        {isOpen && !isLiveMode && (
                          <div style={{ borderTop: '1px dashed var(--dp-border)', paddingTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.78rem' }}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <input className="dp-input" placeholder="Add subtask..." value={subtaskText} onChange={(e) => setSubtaskText(e.target.value)} style={{ flex: 1 }} />
                              <button
                                type="button"
                                className="dp-btn"
                                onClick={() => {
                                  if (!subtaskText.trim()) return;
                                  void updateRecord<KanbanCardPayload>(it.rec.id, (c) => ({
                                    ...c,
                                    payload: {
                                      ...c.payload,
                                      checklist: [...(Array.isArray(c.payload.checklist) ? c.payload.checklist : []), { id: createId('chk'), text: subtaskText.trim(), done: false }],
                                    },
                                  }));
                                  setSubtaskText('');
                                }}
                              >
                                +
                              </button>
                            </div>
                            {it.checklist.map((chk) => (
                              <label key={chk.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <input
                                  type="checkbox"
                                  checked={chk.done}
                                  onChange={(e) =>
                                    void updateRecord<KanbanCardPayload>(it.rec.id, (c) => ({
                                      ...c,
                                      payload: {
                                        ...c.payload,
                                        checklist: (Array.isArray(c.payload.checklist) ? c.payload.checklist : []).map((x) =>
                                          x.id === chk.id ? { ...x, done: e.target.checked } : x
                                        ),
                                      },
                                    }))
                                  }
                                />
                                <span style={{ textDecoration: chk.done ? 'line-through' : 'none' }}>{chk.text}</span>
                              </label>
                            ))}
                            <div style={{ display: 'flex', gap: 4 }}>
                              <input className="dp-input" placeholder="Add comment..." value={commentText} onChange={(e) => setCommentText(e.target.value)} style={{ flex: 1 }} />
                              <button
                                type="button"
                                className="dp-btn"
                                onClick={() => {
                                  if (!commentText.trim()) return;
                                  void updateRecord<KanbanCardPayload>(it.rec.id, (c) => ({
                                    ...c,
                                    payload: {
                                      ...c.payload,
                                      comments: [...(Array.isArray(c.payload.comments) ? c.payload.comments : []), { id: createId('cm'), text: commentText.trim(), at: new Date().toLocaleTimeString() }],
                                    },
                                  }));
                                  setCommentText('');
                                }}
                              >
                                Post
                              </button>
                            </div>
                            {it.comments.map((cm) => (
                              <div key={cm.id} className="dp-muted" style={{ fontSize: '0.72rem' }}>• {cm.text} ({cm.at})</div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}

      {/* === LIST & TABLE VIEWS === */}
      {viewMode !== 'kanban' && (
        <div className="dp-card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid var(--dp-border)' }}>Card / Task</th>
                <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid var(--dp-border)' }}>Stage</th>
                <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid var(--dp-border)' }}>Priority</th>
                <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid var(--dp-border)' }}>Due</th>
                <th style={{ width: 42 }} />
              </tr>
            </thead>
            <tbody>
              {boardItems.map((it) => (
                <tr key={it.rec.id}>
                  <td style={{ padding: 6, borderBottom: '1px solid var(--dp-border)', fontWeight: 600 }}>{it.rec.title}</td>
                  <td style={{ padding: 6, borderBottom: '1px solid var(--dp-border)' }}>
                    <select className="dp-select" value={it.columnId} onChange={(e) => void moveRecordToColumn(it.rec.id, e.target.value)}>
                      {columns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: 6, borderBottom: '1px solid var(--dp-border)' }}>{it.priority}</td>
                  <td style={{ padding: 6, borderBottom: '1px solid var(--dp-border)' }}>{it.dueDate || '—'}</td>
                  <td style={{ padding: 6, borderBottom: '1px solid var(--dp-border)' }}>
                    <button type="button" className="dp-btn" onClick={() => void softDeleteRecord(it.rec.id)}><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
