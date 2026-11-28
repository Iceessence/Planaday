import React, { useRef, useState } from 'react';
import { useApp } from '../../core/AppContext';

export const ToastStack: React.FC = () => {
  const { toasts, dismissToast, undo, pushToast } = useApp();
  const lock = useRef(false);
  const [undoPending, setUndoPending] = useState(false);
  const undoLatest = async (id: string) => {
    if (lock.current) return;
    lock.current = true; setUndoPending(true);
    try { await undo(); dismissToast(id); }
    catch { pushToast('Undo could not be completed. Try again.', { tone: 'danger' }); }
    finally { lock.current = false; setUndoPending(false); }
  };
  // The repository undo API is global, not scoped to a particular toast.
  const lastUndo = [...toasts].reverse().find((t) => t.canUndo)?.id;
  if (toasts.length === 0) return null;
  return (
    <div className="dp-toast-stack" aria-label="Notifications">
      {toasts.map((t) => (
        <div key={t.id} className="dp-toast" data-tone={t.tone || 'info'}>
          <span role={t.tone === 'danger' ? 'alert' : 'status'} aria-atomic="true" style={{ overflowWrap: 'anywhere' }}>{t.message}</span>
          <div className="dp-row">
            {t.canUndo && t.id === lastUndo && (
              <button type="button" disabled={undoPending} aria-label="Undo last action" onClick={() => void undoLatest(t.id)}>
                {undoPending ? 'Undoing…' : 'Undo'}
              </button>
            )}
            <button type="button" style={{ background: 'transparent', color: 'inherit', opacity: 0.75 }}
              onClick={() => dismissToast(t.id)} aria-label={`Dismiss notification: ${t.message}`}>✕</button>
          </div>
        </div>
      ))}
    </div>
  );
};
