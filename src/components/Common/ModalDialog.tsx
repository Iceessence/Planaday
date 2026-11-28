import React, { useLayoutEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
  sheet?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Disable implicit dismissal for critical workflows; explicit actions remain available. */
  dismissible?: boolean;
}

// Unmount closed content while explicitly closing the native dialog to restore focus.
export const ModalDialog: React.FC<ModalDialogProps> = ({
  open, onClose, title, wide, sheet, footer, children, dismissible = true,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  const backdropDown = useRef(false);
  const closing = useRef(false);
  useLayoutEffect(() => { closeRef.current = onClose; }, [onClose]);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    closing.current = false;
    if (!dialog.open) dialog.showModal();
    const handleNativeClose = () => {
      if (!dialog.open && !closing.current) {
        closing.current = true;
        closeRef.current();
      }
    };
    dialog.addEventListener('close', handleNativeClose);
    return () => {
      dialog.removeEventListener('close', handleNativeClose);
      if (dialog.open) dialog.close();
    };
  }, [open]);
  const requestClose = () => {
    if (!dismissible || closing.current) return;
    closeRef.current();
  };
  const outside = (event: React.MouseEvent<HTMLDialogElement> | React.PointerEvent<HTMLDialogElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    return event.target === event.currentTarget &&
      (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom);
  };
  if (!open) return null;
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      className={`dp-dialog${wide ? ' wide' : ''}${sheet ? ' sheet' : ''}`}
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
      onPointerDown={(event) => { backdropDown.current = outside(event); }}
      onPointerCancel={() => { backdropDown.current = false; }}
      onClick={(event) => {
        if (backdropDown.current && outside(event)) requestClose();
        backdropDown.current = false;
      }}
    >
      <div className="dp-dialog-header">
        <h3 id={titleId}>{title}</h3>
        {dismissible && <button type="button" className="dp-icon-btn" aria-label="Close dialog" onClick={requestClose}>
          <X size={18} aria-hidden="true" />
        </button>}
      </div>
      <div className="dp-dialog-body">{children}</div>
      {footer && <div className="dp-dialog-footer">{footer}</div>}
    </dialog>
  );
};
