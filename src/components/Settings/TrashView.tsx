import React, { useMemo, useRef, useState } from 'react';
import { useApp } from '../../core/AppContext';
import { db } from '../../core/db';
import { permanentlyDeleteRecord, purgeExpiredTrash, restoreFromTrash } from '../../core/repository';
import { ModalDialog } from '../Common/ModalDialog';

const PAGE_SIZE = 40;
const DAY_MS = 86_400_000;
export const TrashView: React.FC = () => {
  const { trashedRecords, settings, pushToast } = useApp();
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [confirm, setConfirm] = useState<{ id: string; title: string } | 'expired' | null>(null);
  const types = useMemo(() => Array.from(new Set(trashedRecords.map((r) => r.type))).sort(), [trashedRecords]);
  const filtered = useMemo(() => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return trashedRecords.filter((r) => (type === 'all' || r.type === type) && words.every((w) => `${r.title} ${r.type}`.toLowerCase().includes(w)))
      .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
  }, [trashedRecords, query, type]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const now = Date.now();
  const expired = trashedRecords.filter((r) => r.deletedAt && Date.parse(r.deletedAt) < now - 30 * DAY_MS).length;
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await action(); }
    catch (error) { pushToast(error instanceof Error ? error.message : 'Trash operation failed.', { tone: 'warn' }); }
    finally { lock.current = false; setBusy(false); }
  };
  return (
    <div className="dp-paper-sheet" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <div className="dp-between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div><h2>30-Day Trash Bin</h2><p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.86rem' }}>Deleted records are recoverable for 30 days. Permanent deletion cannot be undone.</p></div>
        <button type="button" className="dp-btn dp-btn-sm" disabled={busy} onClick={() => setConfirm('expired')}>Purge Expired (&gt;30d)</button>
      </div>
      <div className="dp-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <input className="dp-input" aria-label="Search trash" placeholder="Search deleted items…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} style={{ flex: '1 1 180px' }} />
        <select className="dp-select" aria-label="Filter deleted record type" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} style={{ width: 'auto' }}><option value="all">All types</option>{types.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select>
        <span className="dp-muted" role="status">{filtered.length} of {trashedRecords.length} items · {expired} expired in this view</span>
      </div>
      {filtered.length === 0 ? <div className="dp-empty"><strong>{trashedRecords.length ? 'No matching deleted items' : 'Trash is empty'}</strong><span className="dp-muted">{trashedRecords.length ? 'Try a different search or record type.' : 'Items you delete appear here with cascade protection.'}</span></div> : (
        <div className="dp-stack" aria-busy={busy}>
          {filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((rec) => {
            const age = rec.deletedAt ? now - Date.parse(rec.deletedAt) : NaN;
            const daysLeft = Number.isFinite(age) ? Math.min(30, Math.max(0, Math.ceil((30 * DAY_MS - age) / DAY_MS))) : null;
            return <div key={rec.id} className="dp-card dp-between" style={{ padding: 12, gap: 8, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}><strong>{rec.title}</strong><div className="dp-row" style={{ marginTop: 4, flexWrap: 'wrap' }}><span className="dp-pill">{rec.type}</span><span className="dp-muted" style={{ fontSize: '0.8rem' }}>{daysLeft === null ? 'Deletion date unavailable' : daysLeft === 0 ? 'Eligible for permanent purge' : `Auto-purges in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`}</span></div></div>
              <div className="dp-row"><button type="button" className="dp-btn dp-btn-primary dp-btn-sm" disabled={busy} onClick={() => void run(async () => { const restored = await restoreFromTrash(rec.id); pushToast(restored ? `Restored "${rec.title}"` : 'Item is no longer in Trash.', restored ? { canUndo: true } : undefined); })}>Restore</button><button type="button" className="dp-btn dp-btn-danger dp-btn-sm" disabled={busy} onClick={() => setConfirm({ id: rec.id, title: rec.title })}>Delete Forever</button></div>
            </div>;
          })}
          {pages > 1 && <div className="dp-between"><button type="button" className="dp-btn dp-btn-sm" disabled={currentPage <= 1 || busy} onClick={() => setPage(currentPage - 1)}>Previous</button><span className="dp-muted">Page {currentPage} of {pages}</span><button type="button" className="dp-btn dp-btn-sm" disabled={currentPage >= pages || busy} onClick={() => setPage(currentPage + 1)}>Next</button></div>}
        </div>
      )}
      <ModalDialog open={confirm !== null} dismissible={!busy} onClose={() => { if (!lock.current) setConfirm(null); }} title="Confirm permanent deletion">
        <p>{confirm === 'expired' ? 'Permanently remove all expired trash across the local database? This may include other workspaces.' : confirm ? `Permanently remove "${confirm.title}" and its revisions?` : ''} This cannot be undone.</p>
        <div className="dp-row" style={{ justifyContent: 'flex-end' }}><button type="button" className="dp-btn" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button><button type="button" className="dp-btn dp-btn-danger" disabled={busy || !confirm} onClick={() => void run(async () => {
          if (confirm === 'expired') { const count = await purgeExpiredTrash(); pushToast(count ? `Purged ${count} expired records.` : 'No expired records older than 30 days.'); }
          else if (confirm) {
            const record = await db.records.get(confirm.id);
            if (!record?.deletedAt) { pushToast('Item is no longer in Trash.', { tone: 'warn' }); }
            else { await permanentlyDeleteRecord(confirm.id); pushToast(`Permanently removed "${confirm.title}"`); }
          }
          setConfirm(null);
        })}>{busy ? 'Working…' : 'Permanently Delete'}</button></div>
      </ModalDialog>
    </div>
  );
};
