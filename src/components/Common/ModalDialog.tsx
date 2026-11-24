import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
  sheet?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Accessible native modal `<dialog closedby="any">` opened via `showModal()` with
 * mandatory backdrop bounding-box fallback for browsers without `closedBy` support (Safari).
 * Zero `window.alert()`, `confirm()`, or `prompt()`.
 */
export const ModalDialog: React.FC<ModalDialogProps> = ({
  open,
  onClose,
  title,
  wide,
  sheet,
  footer,
  children,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);

    // Fallback light-dismiss for browsers without native closedBy support
    const handleBackdropClick = (event: MouseEvent) => {
      if ('closedBy' in HTMLDialogElement.prototype) return;
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const inside =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!inside) dialog.close();
    };
    dialog.addEventListener('click', handleBackdropClick);

    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('click', handleBackdropClick);
    };
  }, [onClose]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      {...({ closedby: 'any' } as Record<string, string>)}
      aria-labelledby={titleId}
      className={`dp-dialog${wide ? ' wide' : ''}${sheet ? ' sheet' : ''}`}
    >
      <div className="dp-dialog-header">
        <h3 id={titleId}>{title}</h3>
        <button
          type="button"
          className="dp-icon-btn"
          aria-label="Close dialog"
          onClick={() => dialogRef.current?.close()}
        >
          <X size={18} />
        </button>
      </div>
      <div className="dp-dialog-body">{children}</div>
      {footer && <div className="dp-dialog-footer">{footer}</div>}
    </dialog>
  );
};
