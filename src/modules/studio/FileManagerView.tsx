import React, { useMemo, useState } from 'react';
import {
  Archive,
  ExternalLink,
  Folder,
  FolderPlus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../core/AppContext';
import { createRecord, softDeleteRecord, updateRecord } from '../../core/repository';
import type { LifeRecord, NavView, RecordType } from '../../core/types';

const DOC_TYPES: RecordType[] = [
  'note',
  'spreadsheet',
  'presentation',
  'project',
  'game_project',
  'book_project',
  'kanban_board',
  'whiteboard',
  'code_project',
  'photo_asset',
  'calc_saved',
  'lab_sample',
  'lab_research',
  'lab_qms_item',
];

const LAB_TYPES = new Set<RecordType>(['lab_sample', 'lab_research', 'lab_qms_item']);

const TYPE_TO_VIEW: Partial<Record<RecordType, NavView>> = {
  note: 'notes',
  spreadsheet: 'spreadsheets',
  presentation: 'presentations',
  project: 'projects',
  game_project: 'game_dev',
  book_project: 'book_writing',
  kanban_board: 'kanban',
  whiteboard: 'whiteboard',
  code_project: 'code_studio',
  photo_asset: 'photo_studio',
  calc_saved: 'calculator',
  lab_sample: 'lab',
  lab_research: 'lab',
  lab_qms_item: 'lab',
};

interface FolderPayload {
  parentFolderId?: string | null;
}

export const FileManagerView: React.FC = () => {
  const { records, setActiveView, setSelectedNoteId, pushToast } = useApp();
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'all' | 'personal' | 'lab' | 'favorites' | 'archived'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const [newFolderName, setNewFolderName] = useState('');

  const folders = useMemo(
    () => records.filter((r) => r.type === 'file_folder' && !r.deletedAt),
    [records]
  );

  const docs = useMemo(
    () =>
      records
        .filter((r) => !r.deletedAt && DOC_TYPES.includes(r.type))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [records]
  );

  const visibleDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      const p = d.payload as { folderId?: string | null; favorite?: boolean; archived?: boolean };
      if (scope === 'archived') {
        if (!p.archived) return false;
      } else if (p.archived) {
        return false;
      }
      if (scope === 'personal' && LAB_TYPES.has(d.type)) return false;
      if (scope === 'lab' && !LAB_TYPES.has(d.type)) return false;
      if (scope === 'favorites' && !p.favorite) return false;
      if (typeFilter !== 'all' && d.type !== typeFilter) return false;
      if (activeFolderId !== 'all' && (p.folderId ?? null) !== activeFolderId) return false;
      if (q) {
        const hay = `${d.title} ${d.type} ${(d.tags ?? []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [docs, search, scope, typeFilter, activeFolderId]);

  const openDocument = (rec: LifeRecord) => {
    if (rec.type === 'note') setSelectedNoteId(rec.id);
    const target = TYPE_TO_VIEW[rec.type] ?? 'home';
    setActiveView(target);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      <div className="dp-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Folder size={20} /> Universal Document & File Hub
          </h2>
          <p className="dp-muted" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem' }}>
            Centralized folders, favorites, recent documents, and Personal vs. Professional Lab separation across every Planaday studio.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
          {(
            [
              ['all', 'All Docs'],
              ['personal', 'Personal & Creative'],
              ['lab', 'Lab Professional'],
              ['favorites', '⭐ Favorites'],
              ['archived', 'Archived'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={`dp-btn ${scope === id ? 'dp-btn-primary' : ''}`} onClick={() => setScope(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="dp-studio-split">
        {/* Nested Folder Tree */}
        <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', minWidth: 0 }}>
          <strong style={{ fontSize: '0.85rem' }}>Folders ({folders.length})</strong>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <input className="dp-input" placeholder="New folder..." value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
            <button
              type="button"
              className="dp-btn"
              aria-label="Create folder"
              onClick={async () => {
                if (!newFolderName.trim()) return;
                await createRecord<FolderPayload>('file_folder', newFolderName.trim(), {
                  parentFolderId: activeFolderId !== 'all' ? activeFolderId : null,
                });
                setNewFolderName('');
                pushToast('Created folder', { tone: 'ok' });
              }}
              title="Create folder (nested under active folder if selected)"
            >
              <FolderPlus size={14} />
            </button>
          </div>
          <button type="button" className={`dp-btn ${activeFolderId === 'all' ? 'dp-btn-primary' : ''}`} style={{ justifyContent: 'flex-start' }} onClick={() => setActiveFolderId('all')}>
            📁 All Folders ({docs.length})
          </button>
          {folders.map((f) => {
            const fp = f.payload as FolderPayload;
            return (
              <div key={f.id} style={{ display: 'flex', gap: 4, marginLeft: fp.parentFolderId ? 14 : 0 }}>
                <button
                  type="button"
                  className={`dp-btn ${activeFolderId === f.id ? 'dp-btn-primary' : ''}`}
                  style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start' }}
                  onClick={() => setActiveFolderId(f.id)}
                >
                  {fp.parentFolderId ? '↳ ' : '📂 '} {f.title}
                </button>
                <button type="button" className="dp-btn" aria-label={`Delete folder ${f.title}`} title="Delete folder" onClick={() => void softDeleteRecord(f.id)}><Trash2 size={11} /></button>
              </div>
            );
          })}
        </div>

        {/* Document List */}
        <div className="dp-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <Search size={15} />
            <input className="dp-input" placeholder="Filter documents by title, type, or tag..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: '1 1 120px', minWidth: 0 }} />
            <select aria-label="Filter document type" className="dp-select" style={{ maxWidth: '100%', width: 'auto' }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">All Types ({visibleDocs.length})</option>
              {DOC_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {visibleDocs.length === 0 ? (
              <div className="dp-muted" style={{ textAlign: 'center', padding: '1.5rem' }}>No documents match the current folder or filter.</div>
            ) : (
              visibleDocs.slice(0, 120).map((doc) => {
                const p = doc.payload as { folderId?: string | null; favorite?: boolean; archived?: boolean };
                return (
                  <div
                    key={doc.id}
                    style={{
                      padding: '0.5rem 0.65rem',
                      border: '1px solid var(--dp-border)',
                      borderRadius: 'var(--dp-radius)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{doc.title}</div>
                      <div className="dp-muted" style={{ fontSize: '0.73rem' }}>
                        <span className="dp-badge">{doc.type.replace(/_/g, ' ')}</span> · Updated {new Date(doc.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <select
                        className="dp-select"
                        style={{ maxWidth: 130, fontSize: '0.75rem' }}
                        value={p.folderId ?? ''}
                        onChange={(e) =>
                          void updateRecord(doc.id, (c) => ({
                            ...c,
                            payload: { ...(c.payload as Record<string, unknown>), folderId: e.target.value || null },
                          }))
                        }
                      >
                        <option value="">No Folder</option>
                        {folders.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
                      </select>
                      <button
                        type="button"
                        className={`dp-btn ${p.favorite ? 'dp-btn-primary' : ''}`}
                        onClick={() =>
                          void updateRecord(doc.id, (c) => ({
                            ...c,
                            payload: { ...(c.payload as Record<string, unknown>), favorite: !p.favorite },
                          }))
                        }
                        title="Favorite"
                      >
                        <Star size={12} />
                      </button>
                      <button
                        type="button"
                        className="dp-btn"
                        onClick={() =>
                          void updateRecord(doc.id, (c) => ({
                            ...c,
                            payload: { ...(c.payload as Record<string, unknown>), archived: !p.archived },
                          }))
                        }
                        title={p.archived ? 'Unarchive' : 'Archive'}
                      >
                        <Archive size={12} />
                      </button>
                      <button type="button" className="dp-btn dp-btn-primary" onClick={() => openDocument(doc)}>
                        <ExternalLink size={12} /> Open
                      </button>
                      <button type="button" className="dp-btn" onClick={() => void softDeleteRecord(doc.id)} title="Move to Trash">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
