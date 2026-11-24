import React from 'react';
import { useApp } from '../../core/AppContext';

export const ToastStack: React.FC = () => {
  const { toasts, dismissToast, undo } = useApp();
  if (toasts.length === 0) return null;

  return (
    <div className="dp-toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="dp-toast">
          <span>{t.message}</span>
          <div className="dp-row">
            {t.canUndo && (
              <button
                type="button"
                onClick={() => {
                  dismissToast(t.id);
                  void undo();
                }}
              >
                Undo
              </button>
            )}
            <button
              type="button"
              style={{ background: 'transparent', color: 'inherit', opacity: 0.75 }}
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
