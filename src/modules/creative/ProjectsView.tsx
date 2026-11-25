import React, { useMemo, useState } from 'react';
import {
  Database,
  FolderKanban,
  Grid,
  Link2,
  List,
  Plus,
  Table as TableIcon,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createId } from '../../core/db';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import { SafeTextarea } from '../../components/Common/SafeTextEditor';
import { evaluateMathExpression } from '../../core/mathEngine';
import type { LifeRecord } from '../../core/types';

interface ProjectPayload {
  template: string;
  parentProjectId?: string | null;
  stage: 'planning' | 'active' | 'review' | 'on_hold' | 'completed';
  description: string;
  milestones: Array<{ id: string; title: string; dueDate: string; done: boolean }>;
  linkedRecordIds: string[];
}

interface CustomFieldDef {
  id: string;
  name: string;
  kind: 'text' | 'number' | 'dropdown' | 'checkbox' | 'rating' | 'date' | 'formula';
  options?: string; // comma-separated for dropdown
  formulaExpr?: string; // e.g. "price * qty"
}

interface CustomSchemaPayload {
  icon: string;
  description: string;
  fields: CustomFieldDef[];
}

interface CustomEntityPayload {
  schemaId: string;
  values: Record<string, string | number | boolean>;
}

const PROJECT_TEMPLATES = [
  { id: 'video_game', label: 'Video Game Production', milestones: ['Game Design Document', 'Playable Prototype', 'Vertical Slice', 'Beta Playtest', 'Release'] },
  { id: 'book', label: 'Book / Series Writing', milestones: ['Series Bible & Outline', 'First Draft', 'Continuity Check', 'Revision Pass', 'Export & Publish'] },
  { id: 'software', label: 'Software Engineering', milestones: ['Architecture Spec', 'Core Implementation', 'Automated Tests', 'Release Packaging'] },
  { id: 'lab_research', label: 'Laboratory Research', milestones: ['Experimental Protocol', 'Sample Prep & Wet Chem', 'Calibration & Validation', 'Final Technical Report'] },
  { id: 'business', label: 'Business / Product Launch', milestones: ['Budget & Pricing Model', 'Marketing Deck', 'Operational SOPs', 'Launch Day'] },
  { id: 'home', label: 'Home Renovation / Life', milestones: ['Measurements & Budget', 'Materials List', 'Execution Checklist', 'Final Inspection'] },
  { id: 'art', label: 'Art / Media Creation', milestones: ['Moodboard & Concepts', 'Draft Composition', 'Final Polish', 'Portfolio Export'] },
  { id: 'custom', label: 'Custom Blank Project', milestones: ['Kickoff', 'Milestone 1', 'Completion'] },
];

export const ProjectsView: React.FC = () => {
  const { records, pushToast, setActiveView } = useApp();
  const [tab, setTab] = useState<'projects' | 'custom_types'>('projects');

  // --- Projects State ---
  const projects = useMemo(
    () =>
      records
        .filter((r) => r.type === 'project' && !r.deletedAt)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [records]
  );
  const [selectedProjId, setSelectedProjId] = useState<string | null>(null);
  const activeProj: LifeRecord | null = useMemo(
    () => projects.find((p) => p.id === selectedProjId) ?? projects[0] ?? null,
    [projects, selectedProjId]
  );
  const projPayload = activeProj?.payload as ProjectPayload | undefined;
  const [newProjName, setNewProjName] = useState('');
  const [newProjTpl, setNewProjTpl] = useState('custom');
  const [newMilestone, setNewMilestone] = useState('');

  // --- Custom Record Types State (§38.2) ---
  const schemas = useMemo(
    () => records.filter((r) => r.type === 'custom_schema' && !r.deletedAt),
    [records]
  );
  const entities = useMemo(
    () => records.filter((r) => r.type === 'custom_entity' && !r.deletedAt),
    [records]
  );
  const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null);
  const activeSchema = useMemo(
    () => schemas.find((s) => s.id === selectedSchemaId) ?? schemas[0] ?? null,
    [schemas, selectedSchemaId]
  );
  const schemaPayload = activeSchema?.payload as CustomSchemaPayload | undefined;
  const [schemaName, setSchemaName] = useState('');
  const [schemaIcon, setSchemaIcon] = useState('🧩');
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldKind, setNewFieldKind] = useState<CustomFieldDef['kind']>('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');
  const [entityTitle, setEntityTitle] = useState('');
  const [entityViewMode, setEntityViewMode] = useState<'table' | 'list' | 'gallery'>('table');

  const schemaEntities = useMemo(
    () => entities.filter((e) => (e.payload as CustomEntityPayload).schemaId === activeSchema?.id),
    [entities, activeSchema?.id]
  );

  const linkableRecords = useMemo(
    () =>
      records.filter(
        (r) =>
          !r.deletedAt &&
          ['note', 'task', 'spreadsheet', 'presentation', 'kanban_board', 'whiteboard', 'code_project', 'game_project', 'book_project'].includes(r.type)
      ),
    [records]
  );

  const createProject = async (parentProjectId: string | null = null) => {
    const tpl = PROJECT_TEMPLATES.find((t) => t.id === newProjTpl) ?? PROJECT_TEMPLATES[0];
    const title = newProjName.trim() || `${tpl.label} ${projects.length + 1}`;
    const rec = await createRecord<ProjectPayload>('project', title, {
      template: tpl.id,
      parentProjectId,
      stage: 'planning',
      description: '',
      milestones: tpl.milestones.map((m) => ({ id: createId('ms'), title: m, dueDate: '', done: false })),
      linkedRecordIds: [],
    });
    setNewProjName('');
    setSelectedProjId(rec.id);
    pushToast(`Created ${parentProjectId ? 'subproject' : 'project'} "${title}"`, { tone: 'ok' });
  };

  const mutateProject = async (updater: (p: ProjectPayload) => ProjectPayload) => {
    if (!activeProj) return;
    await updateRecord<ProjectPayload>(activeProj.id, (cur) => ({ ...cur, payload: updater(cur.payload) }));
  };

  const evalCustomFormula = (expr: string | undefined, values: Record<string, string | number | boolean>): string => {
    if (!expr) return '—';
    const vars: Record<string, number> = {};
    for (const [k, v] of Object.entries(values)) {
      const n = Number(v);
      if (Number.isFinite(n)) vars[k.toLowerCase().replace(/[^a-z0-9_]/g, '_')] = n;
    }
    try {
      const out = evaluateMathExpression(expr, { vars });
      return Number.isFinite(out) ? String(Number(out.toFixed(4))) : '—';
    } catch {
      return '#ERR';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div className="dp-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <FolderKanban size={20} /> Creative Projects & Custom Record Builder
          </h2>
          <p className="dp-muted" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
            Unlimited projects & subprojects, cross-module links (Notes, Sheets, Slides, Kanban, Code, Whiteboards) & user-defined Custom Record Schemas.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          <button type="button" className={`dp-btn ${tab === 'projects' ? 'dp-btn-primary' : ''}`} onClick={() => setTab('projects')}>
            <FolderKanban size={14} /> Projects ({projects.length})
          </button>
          <button type="button" className={`dp-btn ${tab === 'custom_types' ? 'dp-btn-primary' : ''}`} onClick={() => setTab('custom_types')}>
            <Database size={14} /> Custom Record Types ({schemas.length})
          </button>
          <button type="button" className="dp-btn" onClick={() => setActiveView('game_dev')}>🎮 Game Studio</button>
          <button type="button" className="dp-btn" onClick={() => setActiveView('book_writing')}>📖 Book Studio</button>
        </div>
      </div>

      {tab === 'projects' && (
        <div className="dp-studio-split">
          <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input className="dp-input" placeholder="New project title..." value={newProjName} onChange={(e) => setNewProjName(e.target.value)} />
            <select className="dp-select" value={newProjTpl} onChange={(e) => setNewProjTpl(e.target.value)}>
              {PROJECT_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <button type="button" className="dp-btn dp-btn-primary" onClick={() => void createProject(null)}>
              <Plus size={14} /> Create Project
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.3rem', maxHeight: 460, overflowY: 'auto' }}>
              {projects.map((p) => {
                const pl = p.payload as ProjectPayload;
                const doneCount = (pl.milestones ?? []).filter((m) => m.done).length;
                const totCount = (pl.milestones ?? []).length;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProjId(p.id)}
                    style={{
                      padding: '0.5rem 0.65rem',
                      marginLeft: pl.parentProjectId ? 14 : 0,
                      borderRadius: 'var(--dp-radius)',
                      border: p.id === activeProj?.id ? '2px solid var(--dp-accent)' : '1px solid var(--dp-border)',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>{pl.parentProjectId ? '↳ ' : ''}{p.title}</div>
                    <div className="dp-muted" style={{ fontSize: '0.73rem' }}>
                      {pl.stage} · {doneCount}/{totCount} milestones
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {activeProj && projPayload ? (
            <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <input
                  className="dp-input"
                  value={activeProj.title}
                  onChange={(e) => void updateRecord(activeProj.id, { title: e.target.value })}
                  style={{ fontSize: '1.15rem', fontWeight: 700, flex: '1 1 140px', minWidth: 0 }}
                />
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  <select
                    className="dp-select"
                    value={projPayload.stage}
                    onChange={(e) => void mutateProject((p) => ({ ...p, stage: e.target.value as ProjectPayload['stage'] }))}
                  >
                    <option value="planning">Planning</option>
                    <option value="active">Active</option>
                    <option value="review">Review</option>
                    <option value="on_hold">On Hold</option>
                    <option value="completed">Completed</option>
                  </select>
                  <button type="button" className="dp-btn" onClick={() => void createProject(activeProj.id)}>
                    + Subproject
                  </button>
                  <button
                    type="button"
                    className="dp-btn"
                    onClick={async () => {
                      await softDeleteRecord(activeProj.id);
                      setSelectedProjId(null);
                      pushToast('Moved project to Trash', { tone: 'info' });
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <SafeTextarea
                recordKey={`project-desc:${activeProj.id}`}
                externalValue={projPayload.description ?? ''}
                onCommit={(next) => void mutateProject((p) => ({ ...p, description: next }))}
                className="dp-textarea"
                placeholder="Project overview, objectives, scope, design pillars, and notes..."
              />

              {/* Milestones */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <h4 style={{ margin: 0 }}>Milestones & Deliverables</h4>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <input className="dp-input" placeholder="Add milestone..." value={newMilestone} onChange={(e) => setNewMilestone(e.target.value)} style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="dp-btn"
                    onClick={() => {
                      if (!newMilestone.trim()) return;
                      void mutateProject((p) => ({
                        ...p,
                        milestones: [...(p.milestones ?? []), { id: createId('ms'), title: newMilestone.trim(), dueDate: '', done: false }],
                      }));
                      setNewMilestone('');
                    }}
                  >
                    <Plus size={13} /> Add
                  </button>
                </div>
                {(projPayload.milestones ?? []).map((ms) => (
                  <div key={ms.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem', border: '1px solid var(--dp-border)', borderRadius: 'var(--dp-radius)' }}>
                    <input
                      type="checkbox"
                      checked={ms.done}
                      onChange={(e) =>
                        void mutateProject((p) => ({
                          ...p,
                          milestones: p.milestones.map((x) => (x.id === ms.id ? { ...x, done: e.target.checked } : x)),
                        }))
                      }
                    />
                    <span style={{ flex: 1, textDecoration: ms.done ? 'line-through' : 'none' }}>{ms.title}</span>
                    <input
                      type="date"
                      className="dp-input"
                      style={{ width: 135 }}
                      value={ms.dueDate}
                      onChange={(e) =>
                        void mutateProject((p) => ({
                          ...p,
                          milestones: p.milestones.map((x) => (x.id === ms.id ? { ...x, dueDate: e.target.value } : x)),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="dp-btn"
                      onClick={() => void mutateProject((p) => ({ ...p, milestones: p.milestones.filter((x) => x.id !== ms.id) }))}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Linked Planaday Assets */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Link2 size={15} /> Linked Planaday Assets</h4>
                  <select
                    className="dp-select"
                    defaultValue=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const rid = e.target.value;
                      void mutateProject((p) => ({
                        ...p,
                        linkedRecordIds: Array.from(new Set([...(p.linkedRecordIds ?? []), rid])),
                      }));
                      e.target.value = '';
                    }}
                  >
                    <option value="">+ Link Note / Sheet / Deck / Board / Code…</option>
                    {linkableRecords.slice(0, 60).map((r) => (
                      <option key={r.id} value={r.id}>[{r.type}] {r.title}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {(projPayload.linkedRecordIds ?? []).map((rid) => {
                    const target = records.find((r) => r.id === rid);
                    if (!target) return null;
                    return (
                      <span key={rid} className="dp-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        [{target.type}] {target.title}
                        <button
                          type="button"
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                          onClick={() => void mutateProject((p) => ({ ...p, linkedRecordIds: p.linkedRecordIds.filter((x) => x !== rid) }))}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="dp-card" style={{ textAlign: 'center', padding: '2rem' }}>
              <p className="dp-muted">Create your first project on the left using any template.</p>
            </div>
          )}
        </div>
      )}

      {/* === CUSTOM RECORD TYPE BUILDER (§38.2) === */}
      {tab === 'custom_types' && (
        <div className="dp-studio-split">
          <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            <h4 style={{ margin: 0 }}>Custom Record Types</h4>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <input className="dp-input" value={schemaIcon} onChange={(e) => setSchemaIcon(e.target.value)} style={{ width: 46, textAlign: 'center' }} />
              <input className="dp-input" placeholder="e.g. Board Games, Lab Clients" value={schemaName} onChange={(e) => setSchemaName(e.target.value)} style={{ flex: 1 }} />
            </div>
            <button
              type="button"
              className="dp-btn dp-btn-primary"
              onClick={async () => {
                const name = schemaName.trim() || `Custom Type ${schemas.length + 1}`;
                const rec = await createRecord<CustomSchemaPayload>('custom_schema', name, {
                  icon: schemaIcon || '🧩',
                  description: '',
                  fields: [
                    { id: createId('fld'), name: 'Category', kind: 'text' },
                    { id: createId('fld'), name: 'Qty', kind: 'number' },
                    { id: createId('fld'), name: 'Price', kind: 'number' },
                    { id: createId('fld'), name: 'Total', kind: 'formula', formulaExpr: 'qty * price' },
                    { id: createId('fld'), name: 'Rating', kind: 'rating' },
                  ],
                });
                setSchemaName('');
                setSelectedSchemaId(rec.id);
                pushToast(`Created Custom Record Type "${name}"`, { tone: 'ok' });
              }}
            >
              <Plus size={14} /> New Record Type
            </button>
            {schemas.map((s) => {
              const sp = s.payload as CustomSchemaPayload;
              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedSchemaId(s.id)}
                  style={{
                    padding: '0.45rem 0.6rem',
                    borderRadius: 'var(--dp-radius)',
                    border: s.id === activeSchema?.id ? '2px solid var(--dp-accent)' : '1px solid var(--dp-border)',
                    cursor: 'pointer',
                  }}
                >
                  <strong>{sp.icon} {s.title}</strong>
                  <div className="dp-muted" style={{ fontSize: '0.73rem' }}>{(sp.fields ?? []).length} fields</div>
                </div>
              );
            })}
          </div>

          {activeSchema && schemaPayload ? (
            <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ margin: 0 }}>{schemaPayload.icon} {activeSchema.title} ({schemaEntities.length})</h3>
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  <button type="button" className={`dp-btn ${entityViewMode === 'table' ? 'dp-btn-primary' : ''}`} onClick={() => setEntityViewMode('table')}><TableIcon size={13} /> Table</button>
                  <button type="button" className={`dp-btn ${entityViewMode === 'list' ? 'dp-btn-primary' : ''}`} onClick={() => setEntityViewMode('list')}><List size={13} /> List</button>
                  <button type="button" className={`dp-btn ${entityViewMode === 'gallery' ? 'dp-btn-primary' : ''}`} onClick={() => setEntityViewMode('gallery')}><Grid size={13} /> Gallery</button>
                  <button type="button" className="dp-btn" onClick={async () => { await softDeleteRecord(activeSchema.id); setSelectedSchemaId(null); }}><Trash2 size={13} /></button>
                </div>
              </div>

              {/* Schema Field Editor */}
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', padding: '0.5rem', background: 'var(--dp-paper-alt)', borderRadius: 'var(--dp-radius)' }}>
                <input className="dp-input" placeholder="Field name" value={newFieldName} onChange={(e) => setNewFieldName(e.target.value)} style={{ width: 140 }} />
                <select className="dp-select" value={newFieldKind} onChange={(e) => setNewFieldKind(e.target.value as CustomFieldDef['kind'])}>
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="dropdown">Dropdown</option>
                  <option value="checkbox">Checkbox</option>
                  <option value="rating">Rating (1–10)</option>
                  <option value="date">Date</option>
                  <option value="formula">Formula</option>
                </select>
                {(newFieldKind === 'dropdown' || newFieldKind === 'formula') && (
                  <input
                    className="dp-input"
                    placeholder={newFieldKind === 'dropdown' ? 'Comma options (e.g. Low,Med,High)' : 'Formula (e.g. qty * price)'}
                    value={newFieldOptions}
                    onChange={(e) => setNewFieldOptions(e.target.value)}
                    style={{ flex: 1, minWidth: 160 }}
                  />
                )}
                <button
                  type="button"
                  className="dp-btn"
                  onClick={async () => {
                    if (!newFieldName.trim()) return;
                    const fld: CustomFieldDef = {
                      id: createId('fld'),
                      name: newFieldName.trim(),
                      kind: newFieldKind,
                      options: newFieldKind === 'dropdown' ? newFieldOptions : undefined,
                      formulaExpr: newFieldKind === 'formula' ? newFieldOptions : undefined,
                    };
                    await updateRecord<CustomSchemaPayload>(activeSchema.id, (c) => ({
                      ...c,
                      payload: { ...c.payload, fields: [...(c.payload.fields ?? []), fld] },
                    }));
                    setNewFieldName('');
                    setNewFieldOptions('');
                  }}
                >
                  + Add Field
                </button>
              </div>

              {/* Add Entity */}
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <input className="dp-input" placeholder={`New ${activeSchema.title} entry title...`} value={entityTitle} onChange={(e) => setEntityTitle(e.target.value)} style={{ flex: 1 }} />
                <button
                  type="button"
                  className="dp-btn dp-btn-primary"
                  onClick={async () => {
                    const t = entityTitle.trim() || `${activeSchema.title} #${schemaEntities.length + 1}`;
                    await createRecord<CustomEntityPayload>('custom_entity', t, { schemaId: activeSchema.id, values: {} });
                    setEntityTitle('');
                  }}
                >
                  <Plus size={13} /> Add Entry
                </button>
              </div>

              {/* Render Table / List / Gallery */}
              {entityViewMode === 'table' ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid var(--dp-border)' }}>Title</th>
                        {schemaPayload.fields.map((f) => (
                          <th key={f.id} style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid var(--dp-border)' }}>{f.name}</th>
                        ))}
                        <th style={{ width: 38 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {schemaEntities.map((ent) => {
                        const ep = ent.payload as CustomEntityPayload;
                        const vals = ep.values ?? {};
                        const setVal = (key: string, val: string | number | boolean) =>
                          void updateRecord<CustomEntityPayload>(ent.id, (c) => ({
                            ...c,
                            payload: { ...c.payload, values: { ...(c.payload.values ?? {}), [key]: val } },
                          }));
                        return (
                          <tr key={ent.id}>
                            <td style={{ padding: 5, borderBottom: '1px solid var(--dp-border)', fontWeight: 600 }}>{ent.title}</td>
                            {schemaPayload.fields.map((f) => (
                              <td key={f.id} style={{ padding: 5, borderBottom: '1px solid var(--dp-border)' }}>
                                {f.kind === 'formula' ? (
                                  <span className="dp-badge">{evalCustomFormula(f.formulaExpr, vals)}</span>
                                ) : f.kind === 'checkbox' ? (
                                  <input type="checkbox" checked={Boolean(vals[f.name])} onChange={(e) => setVal(f.name, e.target.checked)} />
                                ) : f.kind === 'dropdown' ? (
                                  <select className="dp-select" value={String(vals[f.name] ?? '')} onChange={(e) => setVal(f.name, e.target.value)}>
                                    <option value="">—</option>
                                    {(f.options ?? '').split(',').map((o) => o.trim()).filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                ) : (
                                  <input
                                    className="dp-input"
                                    type={f.kind === 'number' || f.kind === 'rating' ? 'number' : f.kind === 'date' ? 'date' : 'text'}
                                    value={String(vals[f.name] ?? '')}
                                    onChange={(e) => setVal(f.name, f.kind === 'number' || f.kind === 'rating' ? Number(e.target.value) : e.target.value)}
                                  />
                                )}
                              </td>
                            ))}
                            <td>
                              <button type="button" className="dp-btn" onClick={() => void softDeleteRecord(ent.id)}><Trash2 size={12} /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: entityViewMode === 'gallery' ? 'repeat(auto-fill, minmax(220px, 1fr))' : '1fr', gap: '0.55rem' }}>
                  {schemaEntities.map((ent) => {
                    const vals = (ent.payload as CustomEntityPayload).values ?? {};
                    return (
                      <div key={ent.id} style={{ padding: '0.6rem', border: '1px solid var(--dp-border)', borderRadius: 'var(--dp-radius)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong>{ent.title}</strong>
                          <button type="button" className="dp-btn" onClick={() => void softDeleteRecord(ent.id)}><Trash2 size={12} /></button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.35rem', fontSize: '0.78rem' }}>
                          {schemaPayload.fields.map((f) => (
                            <span key={f.id} className="dp-badge">
                              {f.name}: {f.kind === 'formula' ? evalCustomFormula(f.formulaExpr, vals) : String(vals[f.name] ?? '—')}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="dp-card" style={{ textAlign: 'center', padding: '2rem' }}>
              <p className="dp-muted">Create a custom record schema on the left to track any custom collection (e.g. Board Games, Lab Clients, Collectibles, Recipes, Hardware).</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
