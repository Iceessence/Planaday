import React from 'react';
import { useApp } from '../../core/AppContext';
import { permanentlyDeleteRecord, purgeExpiredTrash, restoreFromTrash } from '../../core/repository';

export const TrashView: React.FC = () => {
  const { trashedRecords, settings, pushToast } = useApp();

  return (
    <div className="dp-paper-sheet" data-paper={settings.paperMaterial} style={{ padding: 'var(--dp-space-5)' }}>
      <div className="dp-between" style={{ marginBottom: 14 }}>
        <div>
          <h2>30-Day Trash Bin</h2>
          <p className="dp-muted" style={{ margin: '4px 0 0', fontSize: '0.86rem' }}>
            Deleted records stay recoverable for 30 days. Orphan blobs are garbage-collected only after permanent removal.
          </p>
        </div>
        <button
          type="button"
          className="dp-btn dp-btn-sm"
          onClick={async () => {
            const count = await purgeExpiredTrash();
            pushToast(count > 0 ? `Purged ${count} expired records.` : 'No expired records older than 30 days.');
          }}
        >
          Purge Expired (&gt;30d)
        </button>
      </div>

      {trashedRecords.length === 0 ? (
        <div className="dp-empty">
          <strong>Trash is empty</strong>
          <span className="dp-muted">Items you delete appear here with explicit cascade protection.</span>
        </div>
      ) : (
        <div className="dp-stack">
          {trashedRecords.map((rec) => {
            const daysLeft = rec.deletedAt
              ? Math.max(0, 30 - Math.floor((Date.now() - Date.parse(rec.deletedAt)) / 86400000))
              : 30;
            return (
              <div key={rec.id} className="dp-card dp-between" style={{ padding: 12 }}>
                <div>
                  <strong>{rec.title}</strong>
                  <div className="dp-row" style={{ marginTop: 4 }}>
                    <span className="dp-pill">{rec.type}</span>
                    <span className="dp-muted" style={{ fontSize: '0.8rem' }}>
                      Auto-purges in {daysLeft} days
                    </span>
                  </div>
                </div>
                <div className="dp-row">
                  <button
                    type="button"
                    className="dp-btn dp-btn-primary dp-btn-sm"
                    onClick={async () => {
                      await restoreFromTrash(rec.id);
                      pushToast(`Restored "${rec.title}"`, { canUndo: true });
                    }}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className="dp-btn dp-btn-danger dp-btn-sm"
                    onClick={async () => {
                      await permanentlyDeleteRecord(rec.id);
                      pushToast(`Permanently removed "${rec.title}"`);
                    }}
                  >
                    Delete Forever
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
